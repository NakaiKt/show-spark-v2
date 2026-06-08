# API レイヤーアーキテクチャ設計

## 設計方針

| 優先順位 | 方針 |
|---------|------|
| 1 | **変更容易性**（層間の結合度を低く保つ） |
| 2 | **わかりやすさ**（DB アクセス経路を 1 本に絞る） |
| 3 | **セキュリティ**（認証・認可を必ず通す） |

---

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (Client Components)                                    │
│    axios → Authorization: Bearer <access_token>                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼──────────────────────────────────────┐
│  Next.js (frontend/)                                            │
│                                                                 │
│   Server Components                Route Handlers               │
│   getServerContext()         ←→    authenticate(request)        │
│          │                                   │                  │
│          └────────────┬──────────────────────┘                  │
│                       │ AuthContext { supabase, appUserId }      │
└───────────────────────┼─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│  packages/application/                                          │
│  ユースケース・認可                                              │
│    getCurrentUser(ctx)                                          │
│    createProject(ctx, input)  ...                               │
└───────────────────────┬─────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│  packages/db/                                                   │
│  DB 操作のカプセル化                                             │
│    findUserById(supabase, id)                                   │
│    insertProject(supabase, data)  ...                           │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                   Supabase (PostgreSQL + RLS)
```

---

## DB アクセス経路は 1 本

**ルール: `packages/db` のリポジトリ関数を経由しない Supabase DB 操作は書かない。**

```
✅ Server Component → getServerContext() → packages/application → packages/db → Supabase
✅ Client Component → Route Handler → authenticate() → packages/application → packages/db → Supabase
❌ Server Component → lib/supabase/server.ts → supabase.from(...) → Supabase  ← 禁止
❌ Route Handler   → supabase.from(...)                                        ← 禁止
```

`lib/supabase/server.ts` は**セッション取得・トークン検証にのみ**使う。DB クエリには使わない。

---

## パッケージ構成

```
packages/
  shared/           ← 共通型・エラー定義・バリデーション（フロントとバックで共有）
  db/               ← DB 操作のみ。業務判断は書かない
  application/      ← ユースケース・認可。DB の CRUD は db に委ねる
  # domain/ は初期は作らない。業務ルールが複雑になってから切り出す
```

依存方向（下に向かう一方向のみ許可）:

```
frontend  →  application  →  db
    ↘            ↘           ↘
              shared        shared
```

`db` から `application` を import することは**禁止**。

---

## 各レイヤーの責務

### Route Handler（`frontend/src/app/api/**/route.ts`）

- HTTP リクエスト/レスポンスの変換
- `authenticate(request)` で AuthContext を取得
- application を呼ぶ
- `handleRoute()` でエラーを共通 JSON に変換

```typescript
// GET /api/users/me
export async function GET(request: Request) {
  return handleRoute(async () => {
    const ctx = await authenticate(request)
    const user = await getCurrentUser(ctx)
    return NextResponse.json({ data: user })
  })
}
```

禁止: 業務ロジック・DB 操作

---

### Server Component（`frontend/src/app/**/page.tsx`）

- `getServerContext()` で AuthContext を取得（cookie session から）
- application を直接呼ぶ（HTTP 経由しない）

```typescript
export default async function ProfilePage() {
  const ctx = await getServerContext()      // cookie → AuthContext
  const user = await getCurrentUser(ctx)    // application を直接呼ぶ
  return <Profile user={user} />
}
```

禁止: Supabase DB 直接操作（`supabase.from(...)` はここには書かない）

---

### application（`packages/application/`）

- ユースケースの実装（「現在のユーザーを返す」「プロジェクトを作成する」など）
- 認可チェック（「このユーザーはこのリソースを操作できるか」）
- 複数の db 操作をまたぐトランザクション制御

```typescript
export async function getCurrentUser(ctx: AuthContext): Promise<User> {
  const user = await findUserById(ctx.supabase, ctx.appUserId)
  if (!user) throw new AppError('NOT_FOUND', 404)
  return user
}
```

禁止: HTTP 操作・NextResponse

---

### db（`packages/db/`）

- Supabase に対する SELECT / INSERT / UPDATE / DELETE のみ
- クエリをカプセル化して再利用可能にする

```typescript
export async function findUserById(
  supabase: SupabaseClient,
  id: string
): Promise<User | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}
```

禁止: 業務ロジック・認可

---

### shared（`packages/shared/`）

- `AppError` クラスとエラーコード
- Zod スキーマ（フロントとバックで共有するバリデーション）
- `extractBearerToken(request)` などの HTTP ユーティリティ

---

## 認証・認可フロー

### AuthContext

すべての業務処理は `AuthContext` を受け取る。これが「認証済み」の証明。

```typescript
interface AuthContext {
  supabase: SupabaseClient  // ユーザーの JWT でスコープされたクライアント（RLS が有効）
  appUserId: string         // public.users.id（アプリ内の不変 ID）
  sub: string               // auth.users.id（JWT の subject）
}
```

### Route Handler からの AuthContext 取得

```typescript
// packages/application/src/auth/authenticate.ts
export async function authenticate(request: Request): Promise<AuthContext> {
  const token = extractBearerToken(request)                   // shared
  const supabase = createSupabaseClient(token)                // db
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new AppError('UNAUTHORIZED', 401)
  const appUserId = await resolveAppUserId(supabase, user.id) // application/auth
  return { supabase, appUserId, sub: user.id }
}
```

### Server Component からの AuthContext 取得

```typescript
// packages/application/src/auth/server-context.ts
export async function getServerContext(): Promise<AuthContext> {
  const cookieClient = await createCookieClient()             // lib/supabase/server.ts
  const { data: { session } } = await cookieClient.auth.getSession()
  if (!session) throw new AppError('UNAUTHORIZED', 401)

  const supabase = createSupabaseClient(session.access_token) // db
  const appUserId = await resolveAppUserId(supabase, session.user.id)
  return { supabase, appUserId, sub: session.user.id }
}
```

### Supabase クライアントの使い分け

| 用途 | 生成場所 | 使う関数 |
|------|---------|---------|
| Cookie セッション管理（認証コールバック・Server Component） | `frontend/src/lib/supabase/server.ts` | `createServerClient`（@supabase/ssr） |
| 業務 API（Bearer token） | `packages/db/src/client.ts` | `createClient`（@supabase/supabase-js） |

Supabase クライアントは **1 リクエストにつき 1 度だけ生成**し、AuthContext に乗せて受け渡す。

---

## エラーハンドリング

### AppError（`packages/shared/src/errors.ts`）

```typescript
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string
  ) {
    super(message ?? code)
  }
}
```

### handleRoute（`frontend/src/lib/api/handle-route.ts`）

Route Handler の try/catch をまとめる。エラー JSON の直書き禁止。

```typescript
export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json(
        { error: { code: e.code, message: e.message } },
        { status: e.status }
      )
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
```

エラーレスポンス形式: `{ error: { code: string, message: string } }`

---

## テスト戦略

### 置き場所: テストはそのパッケージの中に置く

```
packages/application/
  src/users/getCurrentUser.ts
  __tests__/users/getCurrentUser.test.ts   ← コードの隣に置く
```

ルートに `tests/` を集約しない。「どこでテストするか」を迷わないようにするため。

### 各層のテスト方針

| 層 | テスト種別 | 方法 |
|----|-----------|------|
| `packages/application` | 単体テスト | `packages/db` をモック。usecase 単独でテスト |
| `packages/db` | 統合テスト | ローカル Supabase（Docker）に接続。SQL の正確さを確認 |
| Route Handler | 単体テスト | `authenticate` をモック。HTTP 変換のみテスト |
| E2E | E2E テスト | `frontend/e2e/` に Playwright |

### テストランナー

- `packages/` 内: Vitest（各パッケージで独立実行可）
- E2E: Playwright（`frontend/e2e/`）

---

## ディレクトリ構成（目標形）

```
packages/
  shared/
    package.json          ← { "name": "@repo/shared", "version": "0.0.1", "private": true }
    src/
      errors.ts           ← AppError + エラーコード
      auth.ts             ← extractBearerToken(request)
      validation/         ← Zod スキーマ（フロント・バック共有）
    __tests__/

  db/
    package.json          ← { "name": "@repo/db", "version": "0.0.1", "private": true }
    src/
      client.ts           ← createSupabaseClient(accessToken): SupabaseClient
      database.types.ts   ← supabase gen types で生成（gen:types の出力先）
      repositories/
        users.ts          ← findUserById / findAppUserIdByProviderSubject
    __tests__/

  application/
    package.json          ← { "name": "@repo/application", "version": "0.0.1", "private": true }
    src/
      auth/
        authenticate.ts   ← authenticate(request): AuthContext（Route Handler 用）
        server-context.ts ← getServerContext(): AuthContext（Server Component 用）
        resolve-app-user.ts ← sub → public.users.id の解決
      users/
        getCurrentUser.ts
    __tests__/

frontend/
  src/
    app/
      api/
        users/me/route.ts
    lib/
      api/
        handle-route.ts   ← handleRoute(fn)
        client.ts         ← axios（/api プレフィックス・Bearer 自動付与）
      supabase/
        server.ts         ← cookie セッション取得用のみ（DB クエリ禁止）
    components/
  e2e/                    ← Playwright
```

---

## import ルール

```typescript
// ✅ パッケージ alias 経由
import { AppError } from "@repo/shared/errors"
import { findUserById } from "@repo/db/repositories/users"
import { getCurrentUser } from "@repo/application/users/getCurrentUser"

// ❌ 相対 import（packages 間）
import { AppError } from "../../shared/src/errors"

// ❌ 逆方向の依存（db から application は禁止）
import { resolveAppUserId } from "@repo/application/auth/resolve-app-user"
```

---

## gen:types スクリプトの修正

`database.types.ts` は `packages/db/src/` に生成する。`frontend/` には置かない。

```json
// package.json (root)
"gen:types": "supabase gen types typescript --local > packages/db/src/database.types.ts"
```

frontend から DB 型が必要な場合は `@repo/db/database.types` から import する。

---

## 実装順序

1. `packages/shared/src/errors.ts`（AppError）
2. `packages/shared/src/auth.ts`（extractBearerToken）
3. `packages/db/src/client.ts`（createSupabaseClient）
4. `packages/db/src/repositories/users.ts`（findUserById・findAppUserIdByProviderSubject）
5. `packages/application/src/auth/resolve-app-user.ts`（resolveAppUserId）
6. `packages/application/src/auth/authenticate.ts`（Route Handler 用 AuthContext）
7. `packages/application/src/auth/server-context.ts`（Server Component 用 AuthContext）
8. `packages/application/src/users/getCurrentUser.ts`
9. `frontend/src/lib/api/handle-route.ts`
10. `frontend/src/app/api/users/me/route.ts`

以降のエンドポイントは手順 6→8→10 のパターンを繰り返す。

---

## やらないこと（初期段階）

| 項目 | 理由 |
|------|------|
| `packages/domain/` の作成 | 純粋な業務ルールが出てきてから切り出す |
| Server Components での `supabase.from(...)` 直接呼び出し | DB 経路を 1 本に絞るため |
| Route Handler ファイル内での業務ロジック記述 | application 層に集約する |
| `packages/*/package.json` の `exports` フィールド設定 | tsconfig.json の paths と transpilePackages に任せる |
