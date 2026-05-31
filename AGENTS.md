# AGENTS.md

## 0. 目的

このリポジトリは、Next.js + Supabase を用いた Web アプリケーションであり、以下を満たすことを目的とする：

- フロントエンドとバックエンドの責務分離（BFF構成）
- モノレポによる保守性・拡張性の確保
- 業務ロジックの明確なレイヤー分離
- 将来的な構成変更（API分離等）への対応

---

## 1. 技術スタック

### Frontend
- Next.js (App Router)
- React
- react-hook-form
- zod
- shadcn/ui

### Backend
- Next.js Route Handlers（BFF）
- Supabase
  - Auth: Google OIDC
  - DB: PostgreSQL

### Hosting
- Vercel

### Tooling
- Biome（linter / formatter）

---

## 2. アーキテクチャ

```
Client (Browser)
   ↓
Next.js
   ├─ Server Components（read）
   ├─ Client Components（UI）
   └─ Route Handlers（BFF / controller）
         ↓
   Application（usecase）
         ↓
   Domain（business rules）
         ↓
   Repository（DB access）
         ↓
   Supabase
```

---

## 3. ディレクトリ構成

```
frontend/
  app/
    api/
      projects/
        route.ts

packages/
  application/
  domain/
  db/
  shared/
```

---

## 4. レイヤー責務

### 4.1 Route Handler（controller）

責務：

- HTTP request/response
- 認証コンテキスト取得
- 軽量バリデーション
- application呼び出し

禁止：

- 業務ロジック
- DB直接操作

---

### 4.2 application（usecase）

責務：

- ユースケース実装
- 認可（主責務）
- トランザクション制御
- domain呼び出し
- repository呼び出し

---

### 4.3 domain

責務：

- 業務ルール
- 不変条件

禁止：

- DBアクセス
- フレームワーク依存

---

### 4.4 repository

責務：

- Supabaseアクセス
- クエリのカプセル化

禁止：

- 業務ロジック
- 認可

---

## 5. 認証・認可

### 認証
- Supabase Auth（Google OIDC）

### 認証方式（2段構え）

| 処理 | 方式 | 説明 |
|------|------|------|
| OAuth ログイン | Cookie セッション | `/api/auth/callback` で Supabase SSR が JWT を Cookie に保存。ブラウザのログイン状態維持に使用 |
| 業務 API | `Authorization: Bearer` | クライアントが `access_token` を明示的にヘッダーで渡す。API とフロントを疎結合に保つ |

業務 API（`/api/users/*`, `/api/projects/*` 等）では Cookie に依存せず、必ず Bearer トークンで認証する。

Route Handler での標準フロー:

1. `extractBearerToken(request)` で JWT を取得
2. `supabase.auth.getUser(jwt)` で JWT を検証し `sub`（= `auth.users.id`）を得る
3. `resolveAuthenticatedAppUser`（application 層）で `sub → public.users.id` を解決
4. 解決した `appUserId` を usecase に渡す

JWT は手動 decode しない。Supabase Auth による検証を必須とする。

### 認可

- application層で実施（主）
- RLSは最終防衛ライン

### アプリユーザー ID と認証 subject

- `public.users.id` … アプリ内の不変ユーザー ID（`owner_id` / `resource_members.user_id` はすべてここを参照）
- `public.user_auth_identities` … 認証プロバイダと `users` のリンク（`provider`, `provider_subject`）
  - Supabase Auth 利用時: `provider = 'supabase'`, `provider_subject = auth.users.id`
- JWT の `sub` / `auth.uid()` は **アプリユーザー ID ではない**。RLS では `rls.current_app_user_id()` / `rls.is_own(owner_id)` を使う
- `sub → app user_id` の解決は `resolveAppUserId`（application 層）に集約する。JWT 検証だけで足りる API は `verifyAccessToken` のみ使う

### フロント API クライアント

- 業務コードは `api.get("/users/me")` のように呼ぶ（`/api` プレフィックスは axios が付与）
- Bearer 付与・エラー判定は axios interceptor が担当
- Supabase は `token-provider`（トークン取得）にだけ閉じ込める。業務コンポーネントから直接呼ばない

### バックエンド エラーレスポンス

- すべての業務 API で `{ error: { code, message } }` の共通形式を使う
- Route Handler は `handleRoute()` で try/catch し、`AppError` → `jsonError()` で返す
- エラー JSON の直書き禁止

---

## 6. Supabase利用方針

- フロントの**業務コード**から Supabase を直接呼ばない（DB 操作・業務 API 呼び出し）
- 例外: `token-provider` でセッションから access_token を取得する用途のみ可
- 業務データの read/write はすべて Route Handler 経由（BFF強制）

---

## 7. RLS設計（重要）

### サポートするアクセスモデル

- private
- public
- owner
- collaborators（admin）

---

### テーブル設計

```
resources
  id
  owner_id
  visibility -- 'private' | 'public'

resource_members
  resource_id
  user_id
  role -- 'admin'
```

---

### SELECT（閲覧）

`owner_id` / `user_id` は `public.users.id`。RLS ヘルパー `rls.is_own(uuid)` を使う。

```
visibility = 'public'
OR rls.is_own(owner_id)
OR EXISTS (
  SELECT 1
  FROM resource_members
  WHERE resource_members.resource_id = resources.id
    AND rls.is_own(resource_members.user_id)
    AND resource_members.role = 'admin'
)
```

---

### INSERT（ルートリソース）

application 層で `owner_id` に解決済みの `public.users.id` をセットする（`auth.uid()` をそのまま入れない）。

---

### UPDATE / DELETE

```
rls.is_own(owner_id)
OR EXISTS (
  SELECT 1
  FROM resource_members
  WHERE resource_members.resource_id = resources.id
    AND rls.is_own(resource_members.user_id)
    AND resource_members.role = 'admin'
)
```

---

### 子リソース（例：contents）

親リソースの権限に従う：

```
EXISTS (
  SELECT 1
  FROM resources
  WHERE resources.id = contents.resource_id
    AND (
      rls.is_own(resources.owner_id)
      OR EXISTS (
        SELECT 1
        FROM resource_members
        WHERE resource_members.resource_id = resources.id
          AND rls.is_own(resource_members.user_id)
          AND resource_members.role = 'admin'
      )
    )
)
```

---

### 方針

- RLSは「アクセス可能かどうか」のみ判定
- 業務ロジックはapplicationに書く
- 複雑な条件分岐はRLSに書かない

---

## 8. バリデーション

- zodを使用
- frontend / backendで共有

```
packages/shared/validation
```

---

## 9. データ取得・更新

### read

- Server Componentで直接取得

### write

- Route Handler経由

---

## 10. importルール

- 相対import禁止
- alias使用

```
@repo/application/*
@repo/domain/*
@repo/db/*
@repo/shared/*
```

---

## 11. API設計

- RESTベース
- 内部用途のみ
- ルートはシンプルに保つ
- 認証必須 API は `Authorization: Bearer <access_token>` を要求する
- フロントは axios クライアント（`frontend/src/lib/api/client.ts`）経由で呼ぶ
- エラーレスポンスは `{ error: { code, message } }` の共通形式

```
GET    /api/users/me          # ログイン中ユーザー情報
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id
```

フロントからの呼び出し例:

```typescript
const { data: user } = await api.get("/users/me");
```

---

## 12. 禁止事項

- route.tsに業務ロジックを書く
- domainからDBアクセスする
- repositoryで認可を書く
- フロントからSupabase直接呼び出し

---

## 13. WebSocket

現時点では未使用。

導入時：

- Supabase Realtime
- 外部サービス

Route Handlerでは扱わない

---

## 14. デプロイ

- Vercel
- Route Handler = Vercel Functions

---

## 15. 設計原則

- 薄いcontroller
- usecase中心設計
- 依存方向は内側へ
- フレームワーク依存は外側

---

## 16. 判断基準

| 状況 | 層 |
|---|---|
| HTTP処理 | route.ts |
| ユースケース | application |
| 業務ルール | domain |
| DB | repository |

---