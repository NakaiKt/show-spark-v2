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
   └─ Route Handlers（BFF / controller）  ← frontend/src/app/api/
         ↓
   Application（usecase / service）       ← packages/application/
         ↓
   Domain（business rules）               ← packages/domain/（最初は薄くてよい）
         ↓
   Repository（DB access / dao）          ← packages/db/
         ↓
   Supabase
```

**重要:** `packages/` は API そのものではない。HTTP を受けるのは `frontend/src/app/api/**/route.ts` のみ。

---

## 2.1 Express 経験者向け：レイヤー対応表

Express（router → validation → controller → service → dao）で開発してきた場合の対応。

| Express で慣れた層 | 本プロジェクト | 主な場所 | やること |
|-------------------|----------------|----------|----------|
| **router** | Route Handler + 共通ラッパー | `frontend/src/app/api/**/route.ts`<br>`frontend/src/lib/api/handle-route.ts` | URL と HTTP メソッドの対応。リクエストを受け取り controller 処理へ渡す |
| **validation** | shared（zod）+ route 内の軽いチェック | `packages/shared/validation/*`<br>`packages/shared/auth/*` | リクエスト形式・Bearer ヘッダーの検証。不可なら `AppError` |
| **controller** | Route Handler 本体 | `frontend/src/app/api/**/route.ts` | service（application）を呼び、HTTP レスポンスに変換 |
| **service** | application | `packages/application/*` | 業務ユースケース。「ログインユーザーを返す」等の処理手順 |
| **dao** | db（repository） | `packages/db/repositories/*` | DB の CRUD のみ。業務判断は書かない |

**Express にない追加パッケージ（2 つだけ）:**

| パッケージ | Express で近いもの | 役割 |
|------------|-------------------|------|
| **shared** | validators + 共通 DTO + エラー定義 | フロントとバックで共有する型・zod・`AppError` |
| **domain** | service 内の純粋なルール部分 | DB も HTTP も知らない業務ルール（初期は型の re-export 程度で可） |

**フロント専用（API を呼ぶ側）:**

| 場所 | 役割 |
|------|------|
| `frontend/src/lib/api/client.ts` | axios。`/api` 付与・Bearer 自動付与・エラー判定 |
| `frontend/src/lib/api/token-provider.ts` | ログイン session から access_token を取得（Supabase はここだけ） |

### 1 リクエストの流れ（GET /api/users/me の例）

```text
1. router      route.ts が GET /api/users/me を受け取る
2. validation  requireBearerToken — Authorization ヘッダーがあるか
3. controller  handleRoute 内で service を呼ぶ
4. service     getCurrentUser — 「本人の users 行を返す」という業務
5. dao         findUserById — users テーブルを SELECT
6. controller  JSON レスポンス（エラー時は jsonError）
```

### コードを書くときの判断（Express 経験者向け）

| 書こうとしている内容 | 置く場所 |
|---------------------|----------|
| `req.headers` の読み取り、HTTP ステータス | route.ts / handle-route |
| リクエスト body の zod 検証 | packages/shared/validation |
| 「誰のデータか」の判断、ユースケースの組み立て | packages/application |
| 「名前は空不可」等の純粋なルール | packages/domain |
| `SELECT` / `INSERT` / `UPDATE` | packages/db |

---

## 3. ディレクトリ構成

```
frontend/                          ← UI + API 入口（Next.js）
  src/
    app/
      api/                         ← ★ API（Express の routes + controllers）
        users/me/route.ts
    lib/
      api/                         ← axios クライアント、handleRoute
      supabase/                    ← 認証セッション（token 取得用）

packages/                          ← ★ API の中身（Express の service + dao を分離）
  shared/                          ← validation + 共通型 + エラー
  application/                     ← service
  db/                              ← dao
  domain/                          ← 純粋な業務ルール（/me では未使用。frontend 依存なし）
```

`packages/` 単体では HTTP リクエストを受けない。必ず `frontend/src/app/api/` 経由。

`/me` 実装時点で frontend が依存するのは `shared`, `application`, `db` の 3 つのみ。

---

## 4. レイヤー責務

各層の Express 対応を併記する。

### 4.1 Route Handler（controller + router）

**Express 対応:** router + controller

責務：

- HTTP request/response
- 認証コンテキスト取得（Bearer ヘッダー）
- 軽量バリデーション（shared の zod / requireBearerToken を呼ぶ）
- application 呼び出し
- `handleRoute()` でエラーを共通 JSON に変換

禁止：

- 業務ロジック
- DB直接操作

---

### 4.2 application（service / usecase）

**Express 対応:** service

責務：

- ユースケース実装（「ログインユーザーを返す」等）
- 認可（主責務）
- トランザクション制御
- domain 呼び出し
- db（repository）呼び出し

例: `getCurrentUser`, `requireAuthenticatedAppUser`

---

### 4.3 domain（純粋な業務ルール）

**Express 対応:** service から切り出したルール部分（最初は空に近くてよい）

責務：

- 業務ルール
- 不変条件

禁止：

- DBアクセス
- フレームワーク依存

初期段階では `User` 型の re-export だけでもよい。ルールが複雑になったらここへ移す。

---

### 4.4 db / repository（dao）

**Express 対応:** dao

責務：

- Supabase アクセス
- クエリのカプセル化（SELECT / INSERT / UPDATE / DELETE）

例: `findUserById`, `findAppUserIdByProviderSubject`

禁止：

- 業務ロジック
- 認可

---

### 4.5 shared（共通部品）

**Express 対応:** validators + 共通 DTO + カスタムエラー

責務：

- zod スキーマ（フロント・バック共有）
- 共通型（`User` 等）
- `AppError` とエラーコード
- Bearer トークン解析（`extractBearerToken`）

フロントの axios とバックの route.ts の両方から import される。

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

## 10. import ルール

- 相対 import 禁止（packages 間）
- alias 使用

```
@repo/application/*  →  packages/application/src/*
@repo/db/*           →  packages/db/src/*
@repo/shared/*       →  packages/shared/src/*
@repo/domain/*       →  packages/domain/src/*（使う場合のみ）
```

**import 例（ファイル `packages/shared/src/errors.ts`）:**

```typescript
import { AppError } from "@repo/shared/errors";
```

**package.json の exports はファイル追加のたびに更新しない。** 解決は `frontend/tsconfig.json` の paths と `transpilePackages` に任せる。

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

| 状況 | 層 | Express で言うと |
|---|---|---|
| HTTP処理・URL対応 | route.ts | router + controller |
| リクエスト形式の検証 | shared | validation |
| ユースケース・認可 | application | service |
| 純粋な業務ルール | domain | service 内ルール |
| DB 操作 | db | dao |
| フロントから API 呼び出し | lib/api/client.ts | （フロントの API クライアント） |

---