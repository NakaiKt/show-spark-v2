# GET /api/users/me 実装計画書

ログイン中ユーザーの **アプリユーザー情報**（`public.users`）を返す BFF API を追加する。

| 項目 | 内容 |
|------|------|
| エンドポイント | `GET /api/users/me` |
| 認証 | `Authorization: Bearer <JWT>`（Supabase Auth 発行の access_token） |
| 返却データ | `public.users` の 1 行 |
| 非スコープ | 他ユーザーの取得、プロフィール更新 |

---

## 1. 背景・目的

### 1.1 やること

- JWT アクセストークンを受け取り、検証する
- JWT の `sub`（= `auth.users.id`）から `public.users.id` を解決する
- `public.users` の情報を JSON で返す

### 1.2 設計方針

- **フロントの業務コードは Supabase を意識しない** — `api.get("/users/me")` だけで呼べる
- **axios インスタンスが横断関心事を担当** — `/api` プレフィックス、Bearer 自動付与、2xx/4xx/5xx の判定
- **業務 API は `Authorization: Bearer` で認証する**（フロントと API を疎結合に保つ）
- **ログイン（OAuth コールバック）だけ Cookie セッション**を使う（Supabase SSR の標準パターン）
- **バックエンドも共通関数で統一** — JWT 検証、`sub → user_id` 解決（必要な API のみ）、エラーレスポンス
- **`sub → app user_id` の解決は application 層に集約**し、他 API からも再利用する

### 1.3 フロント・バックの責務分離（開発者が書くコード）

```typescript
// フロント（業務コード）— Supabase も Bearer も意識しない
const { data: user } = await api.get("/users/me");
```

```typescript
// バック（Route Handler）— 薄い controller + 共通関数
export async function GET(request: Request) {
  return handleRoute(async () => {
    const token = requireBearerToken(request);
    const { appUserId } = await requireAuthenticatedAppUser(token);
    const user = await getCurrentUser(appUserId);
    return user;
  });
}
```

Supabase は **axios の request interceptor（トークン取得）** と **バックエンド（JWT 検証・DB）** にだけ閉じ込める。

### 1.4 用語整理

| 用語 | 説明 |
|------|------|
| JWT / access_token | Supabase Auth が発行するアクセストークン。`sub` クレームに `auth.users.id` が入る |
| Cookie セッション | ブラウザが自動送信する Cookie に JWT を保存する方式。OAuth ログイン維持に使用 |
| Authorization Bearer | クライアントが `Authorization: Bearer <JWT>` ヘッダーで明示的にトークンを渡す方式。業務 API に使用 |
| Cache（キャッシュ） | 取得済みデータのコピー保存。認証とは無関係 |

---

## 2. 現状分析

### 2.1 既に存在するもの

**DB**

- `public.users` … `id`, `name`, `email`, `avatar_url`, `created_at`, `updated_at`
- `public.user_auth_identities` … `provider`, `provider_subject`, `user_id`
- RLS: `users` は `rls.is_own(id)` で本人のみ SELECT 可
- サインアップ時 `handle_new_user()` が `users` + `user_auth_identities` を自動作成

**認証**

- Supabase Auth（Google OIDC）
- OAuth コールバック: `/api/auth/callback`（Cookie セッション確立）
- `/app` 配下は `proxy.ts` で未認証リダイレクト

**API**

- `/api/auth/callback`, `/api/auth/sign-out` のみ
- ユーザー情報取得 API は未実装

### 2.2 未整備のもの

- `@repo/application`, `@repo/db`, `@repo/shared` パッケージ（AGENTS.md 上は定義済みだが実体なし）
- `frontend/tsconfig.json` に `@repo/*` の path alias なし
- 認証共通処理（Bearer 解析、JWT 検証、`sub → app user_id` 解決）
- 共通エラーレスポンス（バックエンド）
- axios API クライアント（フロントエンド）
- ユーザー関連の repository / usecase

### 2.3 DB 変更

**不要**。現行 migration で足りる。

---

## 3. ID 解決の設計（重要）

JWT の `sub` とアプリの `users.id` は **別物**。

```text
JWT sub (= auth.users.id)
    │
    ▼
user_auth_identities.provider_subject  (provider = 'supabase')
    │
    ▼ user_id
public.users.id  ← API が返す id
```

`sub` をそのまま `users.id` として扱わない。

---

## 4. 認証フロー

### 4.1 全体像

```text
【ログイン（既存・変更なし）】
Google OAuth → /api/auth/callback → Supabase が JWT 発行 → Cookie にセッション保存

【フロント — 業務 API 呼び出し】
const user = await api.get("/users/me")
  │
  ├─ axios request interceptor
  │    ├─ パス "/users/me" → "/api/users/me" に変換
  │    └─ セッションから access_token 取得 → Authorization: Bearer 付与
  │         ※ Supabase は interceptor 内だけ。業務コードは知らない
  │
  └─ axios response interceptor
       ├─ 2xx → data を返す
       └─ 4xx/5xx → ApiError を throw

【バック — Route Handler】
handleRoute() で try/catch 統一
  ├─ requireBearerToken(request)        … JWT 取得。なければ 401
  ├─ verifyAccessToken(jwt)             … JWT 検証。sub 取得
  ├─ resolveAppUserId(sub)              … ★ 必要な API のみ。sub → user_id
  ├─ usecase 実行
  └─ 成功 → 200 JSON / 失敗 → jsonError() で共通形式
```

### 4.2 なぜログインと API で方式を分けるか

| 処理 | 方式 | 理由 |
|------|------|------|
| OAuth ログイン | Cookie | Supabase SSR の標準。ブラウザセッション維持が容易 |
| 業務 API | Bearer | REST API として独立。将来のモバイル・外部クライアント対応 |

---

## 5. API 仕様

### 5.1 リクエスト

```
GET /api/users/me
Authorization: Bearer <access_token>
```

- `access_token` は Supabase Auth が発行した JWT
- Route Handler 側で **JWT を手動 decode しない**。`supabase.auth.getUser(jwt)` で検証する

### 5.2 成功レスポンス（200 OK）

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "山田 太郎",
  "email": "user@example.com",
  "avatar_url": "https://...",
  "created_at": "2026-05-31T00:00:00.000Z",
  "updated_at": "2026-05-31T00:00:00.000Z"
}
```

### 5.3 エラーレスポンス（共通形式）

すべての業務 API で同じ JSON shape を使う。

```json
{
  "error": {
    "code": "unauthorized",
    "message": "認証が必要です"
  }
}
```

| HTTP | code | 用途 |
|------|------|------|
| 401 | `unauthorized` | トークンなし / 無効 / 期限切れ |
| 404 | `user_not_found` | JWT は有効だが identity / users が未作成 |
| 400 | `validation_error` | リクエスト不正（将来） |
| 500 | `internal_error` | 予期しないサーバーエラー |

フロントの axios response interceptor は `error.response.status` と `error.response.data.error.code` で分岐する。

---

## 6. 処理フロー

### 6.1 フロント（axios）

```text
api.get("/users/me")
  → request interceptor: /api 付与 + Bearer 付与
  → GET /api/users/me
  → response interceptor: 2xx なら data、それ以外は ApiError
```

### 6.2 バック（Route Handler + 共通関数）

```text
GET /api/users/me
  ▼
handleRoute(handler)                     ← ★ エラーを共通 JSON に変換
  ▼
requireBearerToken(request)              ← shared
  ▼
requireAuthenticatedAppUser(token)       ← application/auth（JWT 検証 + sub → user_id）
  ▼
getCurrentUser(appUserId)                ← application/users
  ▼
200 JSON
```

**JWT 検証だけで足りる API**（将来の例: トークン生存確認）は `verifyAccessToken` のみ使い、`resolveAppUserId` は呼ばない。

---

## 7. ファイル構成

### 7.1 新規作成

```
packages/
  shared/
    package.json
    src/
      auth/
        extract-bearer-token.ts         # Authorization ヘッダー解析
      errors/
        api-error.ts                    # ApiErrorCode, AppError クラス
        api-error-response.ts           # jsonError(), エラー JSON shape
      validation/
        user.ts                         # UserResponseSchema (zod)
      types/
        user.ts                         # User 型

  domain/
    src/
      user/
        user.ts                         # User エンティティ型

  db/
    package.json
    src/
      supabase/
        create-authenticated-client.ts  # JWT 付き SupabaseClient 生成
      repositories/
        user-auth-identity-repository.ts  # sub → app user_id
        user-repository.ts                # users テーブル CRUD

  application/
    package.json
    src/
      auth/
        verify-access-token.ts            # JWT 検証 → sub（全認証 API）
        resolve-app-user-id.ts            # sub → appUserId（必要な API のみ）
        require-authenticated-app-user.ts # 上記2つをまとめたヘルパー
      users/
        get-current-user.ts               # GET /me 専用 usecase

frontend/
  src/
    app/
      api/
        users/
          me/
            route.ts                      # GET handler
    lib/
      api/
        client.ts                         # axios インスタンス（baseURL, interceptors）
        token-provider.ts                 # access_token 取得（Supabase はここだけ）
        handle-route.ts                   # Route Handler 用 try/catch + jsonError
      errors/
        api-client-error.ts               # フロント用 ApiError（axios interceptor が throw）
```

### 7.2 共通処理の責務

| モジュール | 層 | 責務 | 再利用 |
|------------|-----|------|--------|
| `api` (axios) | frontend | `/api` 付与、Bearer 付与、2xx/4xx 判定 | 全 API 呼び出し |
| `token-provider` | frontend | セッションから access_token を取得 | axios interceptor のみ |
| `ApiClientError` | frontend | axios が throw するエラー型 | 業務コードの catch |
| `extractBearerToken` | shared | ヘッダーから JWT 取得 | 全 Route Handler |
| `jsonError` / `handleRoute` | shared + frontend | 共通エラー JSON を返す | 全 Route Handler |
| `verifyAccessToken` | application | JWT 検証 → `sub` | 認証必須 API 全般 |
| `resolveAppUserId` | application | `sub → appUserId` | **users 等、app user_id が必要な API のみ** |
| `requireAuthenticatedAppUser` | application | 上記2つを連続実行 | `/me` 等 |
| `UserRepository` | db | users テーブル問い合わせ | repository 層 |

---

## 8. 各レイヤーの実装方針

### 8.1 フロント — axios クライアント

```typescript
// frontend/src/lib/api/client.ts（疑似コード）
import axios from "axios";
import { getAccessToken } from "@/lib/api/token-provider";
import { ApiClientError } from "@/lib/errors/api-client-error";

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// リクエスト: Bearer 自動付与（Supabase は token-provider 内だけ）
api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// レスポンス: 2xx はそのまま、4xx/5xx は ApiClientError
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const body = error.response?.data;
    throw new ApiClientError(status, body?.error?.code, body?.error?.message);
  },
);
```

**業務コードでの呼び出し:**

```typescript
const { data: user } = await api.get("/users/me");
// 実際の HTTP: GET /api/users/me + Authorization: Bearer ...
```

```typescript
// frontend/src/lib/api/token-provider.ts（疑似コード）
// Supabase はこのファイルに閉じ込める
export async function getAccessToken(): Promise<string | null> {
  const supabase = createBrowserClient(/* ... */);
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
```

### 8.2 バック — 共通エラーレスポンス

```typescript
// packages/shared/src/errors/api-error-response.ts（疑似コード）
export function jsonError(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status },
  );
}
```

```typescript
// frontend/src/lib/api/handle-route.ts（疑似コード）
export async function handleRoute<T>(
  handler: () => Promise<T>,
): Promise<NextResponse> {
  try {
    const result = await handler();
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AppError) {
      return jsonError(e.code, e.message, e.status);
    }
    console.error(e);
    return jsonError("internal_error", "サーバーエラーが発生しました", 500);
  }
}
```

```typescript
// packages/shared/src/errors/api-error.ts（疑似コード）
export class AppError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const unauthorized = () =>
  new AppError("unauthorized", "認証が必要です", 401);

export const userNotFound = () =>
  new AppError("user_not_found", "ユーザーが見つかりません", 404);
```

### 8.3 Route Handler（薄い controller）

```typescript
// frontend/src/app/api/users/me/route.ts（疑似コード）
export async function GET(request: Request) {
  return handleRoute(async () => {
    const token = requireBearerToken(request); // なければ throw unauthorized
    const { appUserId } = await requireAuthenticatedAppUser(token);
    return getCurrentUser(appUserId);
  });
}
```

禁止: 業務ロジック、DB 直接操作、`sub → user_id` のインライン実装、エラー JSON の直書き。

### 8.4 認証共通処理（application 層）

**段階1: JWT 検証のみ**（全認証 API）

```typescript
// verify-access-token.ts
export async function verifyAccessToken(
  supabase: SupabaseClient,
  accessToken: string,
): Promise<{ authSubject: string }> {
  const { data: { user }, error } = await supabase.auth.getUser(accessToken);
  if (error || !user) throw unauthorized();
  return { authSubject: user.id }; // JWT sub
}
```

**段階2: sub → appUserId**（必要な API のみ）

```typescript
// resolve-app-user-id.ts
export async function resolveAppUserId(
  supabase: SupabaseClient,
  authSubject: string,
): Promise<{ appUserId: string }> {
  const appUserId = await userAuthIdentityRepository.findAppUserIdByProviderSubject(
    supabase,
    authSubject,
  );
  if (!appUserId) throw userNotFound();
  return { appUserId };
}
```

**まとめて使うヘルパー**（`/me` 等）

```typescript
// require-authenticated-app-user.ts
export async function requireAuthenticatedAppUser(accessToken: string) {
  const supabase = createAuthenticatedClient(accessToken);
  const { authSubject } = await verifyAccessToken(supabase, accessToken);
  const { appUserId } = await resolveAppUserId(supabase, authSubject);
  return { supabase, authSubject, appUserId };
}
```

### 8.5 Repository

**UserAuthIdentityRepository**

```sql
-- findAppUserIdByProviderSubject
SELECT user_id
FROM user_auth_identities
WHERE provider = 'supabase'
  AND provider_subject = :subject
LIMIT 1
```

**UserRepository.findUserByProviderSubject**（`/me` 向け。JOIN 1 回）

```sql
SELECT u.*
FROM users u
JOIN user_auth_identities uai ON uai.user_id = u.id
WHERE uai.provider = 'supabase'
  AND uai.provider_subject = :subject
LIMIT 1
```

- 認証済み Supabase クライアント（JWT 付き）を使う
- RLS が最終防衛線（`users: select own`）

---

## 9. 実装ステップ

### Phase 0: パッケージ基盤

1. `packages/shared`, `packages/db`, `packages/application` を作成
2. 各 `package.json` に `@repo/*` 名を付与
3. `frontend/package.json` に workspace 依存を追加
4. `frontend/tsconfig.json` に path alias 追加:

   ```json
   "@repo/application/*": ["../packages/application/src/*"],
   "@repo/db/*": ["../packages/db/src/*"],
   "@repo/shared/*": ["../packages/shared/src/*"],
   "@repo/domain/*": ["../packages/domain/src/*"]
   ```

5. `zod`, `@supabase/supabase-js`, `axios` を必要パッケージに追加

### Phase 1: shared 層

1. `ApiErrorCode`, `AppError`, `jsonError` 実装
2. `extractBearerToken`, `requireBearerToken` 実装
3. `User` 型、`UserResponseSchema`（zod）定義

### Phase 2: db 層

1. `createAuthenticatedClient(jwt)` 実装
2. `UserAuthIdentityRepository.findAppUserIdByProviderSubject` 実装
3. `UserRepository.findById` 実装

### Phase 3: application 層

1. `verifyAccessToken` 実装
2. `resolveAppUserId` 実装
3. `requireAuthenticatedAppUser` 実装
4. `GetCurrentUserUseCase` 実装

### Phase 4: バックエンド Route Handler

1. `handleRoute` 実装
2. `frontend/src/app/api/users/me/route.ts` 作成

### Phase 5: フロント axios クライアント

1. `token-provider` 実装（Supabase はここだけ）
2. `api` (axios) + interceptors 実装
3. `ApiClientError` 実装
4. `/app` ページで `api.get("/users/me")` を呼び、name/email を表示

### Phase 6: テスト

| 対象 | 内容 |
|------|------|
| `extractBearerToken` / `requireBearerToken` | ヘッダーあり/なし/形式不正 |
| `verifyAccessToken` / `resolveAppUserId` | mock repository |
| `jsonError` / `handleRoute` | AppError → 正しい status + JSON |
| axios interceptor | 2xx 正常、401 で ApiClientError |
| Route Handler | curl + Bearer token |

---

## 10. セキュリティ

1. **JWT は decode のみしない** — 必ず `supabase.auth.getUser(jwt)` で検証
2. **RLS を信頼** — repository は authenticated client を使う（`service_role` は使わない）
3. **`users.id` をクライアント入力にしない** — 常に JWT sub から server 側で解決
4. **レスポンスに `provider_subject` を含めない**

---

## 11. 動作確認手順

1. `npm run dev` でローカル起動
2. Google でサインイン
3. ブラウザ DevTools で `access_token` を取得（Application → Cookies、または `supabase.auth.getSession()`）
4. curl で確認:

   ```bash
   curl -i http://localhost:3000/api/users/me \
     -H "Authorization: Bearer <access_token>"
   ```

5. 期待結果:
   - ヘッダーなし → 401
   - 無効トークン → 401
   - ログイン済み → 200 + users テーブルの name/email 等

---

## 12. 工数見積もり

| フェーズ | 内容 | 目安 |
|----------|------|------|
| Phase 0 | パッケージ基盤 | 1〜2h |
| Phase 1 | shared（エラー含む） | 1h |
| Phase 2 | db | 1h |
| Phase 3 | application | 1h |
| Phase 4 | Route Handler + handleRoute | 1h |
| Phase 5 | axios クライアント + UI 連携 | 1〜2h |
| Phase 6 | テスト | 1〜2h |
| **合計** | | **7〜10h** |

---

## 13. 関連ドキュメント

- [AGENTS.md](../../AGENTS.md) — レイヤー責務・認証方針
- [db-user-identity-migration.md](./db-user-identity-migration.md) — ユーザー ID 分離の DB 設計
