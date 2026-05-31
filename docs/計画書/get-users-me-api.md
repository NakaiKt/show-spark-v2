# GET /api/users/me 実装計画書

ログイン中ユーザーの **アプリユーザー情報**（`public.users`）を返す BFF API を追加する。

| 項目 | 内容 |
|------|------|
| エンドポイント | `GET /api/users/me` |
| 認証 | `Authorization: Bearer <JWT>`（Supabase Auth 発行の access_token） |
| 返却データ | `public.users` の 1 行 |
| 非スコープ | 他ユーザーの取得、プロフィール更新 |

---

## 目次

1. [背景・目的](#1-背景目的)
2. [Express との対応（読む順）](#15-express-との対応読む順) ← **初めて読むならここ**
3. [現状分析](#2-現状分析)
4. [ID 解決の設計](#3-id-解決の設計重要)
5. [認証フロー](#4-認証フロー)
6. [API 仕様](#5-api-仕様)
7. [処理フロー](#6-処理フロー)
8. [ファイル構成](#7-ファイル構成)
9. [各レイヤーの実装方針](#8-各レイヤーの実装方針)
10. [実装手順（フェーズ別・詳細）](#9-実装手順フェーズ別詳細) ← **実装時はここから**
11. [セキュリティ](#10-セキュリティ)
12. [トラブルシューティング](#11-トラブルシューティング)
13. [動作確認（クイックリファレンス）](#12-動作確認手順クイックリファレンス)
14. [工数見積もり](#13-工数見積もり)
15. [関連ドキュメント](#14-関連ドキュメント)

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

## 1.5 Express との対応（読む順）

**`packages/` は API ではない。** API の入口は `frontend/src/app/api/` だけ。

### 全体マップ

```text
┌─────────────────────────────────────────────────────────────┐
│  frontend/                                                   │
│  ┌─────────────────────┐    ┌──────────────────────────────┐ │
│  │ lib/api/client.ts   │    │ app/api/users/me/route.ts    │ │
│  │ （axios・API呼び出し）│───▶│ （router + controller）      │ │
│  └─────────────────────┘    └──────────────┬───────────────┘ │
└────────────────────────────────────────────│─────────────────┘
                                             ▼
┌─────────────────────────────────────────────────────────────┐
│  packages/                                                   │
│  shared ──▶ application ──▶ db ──▶ Supabase                 │
│  (validation) (service)     (dao)                            │
│  domain … 純粋な業務ルール（最初はほぼ空で OK）               │
└─────────────────────────────────────────────────────────────┘
```

### Express 層との 1 対 1 対応

| Express | 本プロジェクト | この API で触る Phase |
|---------|----------------|----------------------|
| router | `route.ts` | Phase 4 |
| validation | `packages/shared` | Phase 1 |
| controller | `route.ts` + `handleRoute` | Phase 4 |
| service | `packages/application` | Phase 3 |
| dao | `packages/db` | Phase 2 |
| （フロントの API クライアント） | `lib/api/client.ts` | Phase 5 |

### ファイル名について

計画書では `packages/shared/src/errors/api-error.ts` のようにフォルダ分けしているが、
`packages/shared/src/errors.ts` のように **1 ファイルにまとめても役割は同じ**。

| まとめたファイル例 | Express で言うと | 中身 |
|-------------------|------------------|------|
| `shared/src/errors.ts` | カスタムエラー + HTTP コード | `AppError`, `unauthorized()` |
| `shared/src/types.ts` | DTO / モデル型 | `User` 型 |
| `shared/src/validation.ts` | validators | `UserSchema`（zod） |

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
        api-error.ts                    # ApiErrorCode, AppError クラス（Next.js 非依存）
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
            route.ts                      # GET handler（Route Handler のみ app/api 配下）
    lib/
      api/
        client.ts                         # axios インスタンス（baseURL, interceptors）
        token-provider.ts                 # access_token 取得（Supabase はここだけ）
        handle-route.ts                   # Route Handler 用 try/catch
        json-error.ts                     # jsonError() — NextResponse を返す
      errors/
        api-client-error.ts               # フロント用 ApiClientError
```

> **注意:** `frontend/src/app/api/client.ts` や `token-provider.ts` は **置かない**。
> `app/api/` は Next.js の Route Handler 専用。axios クライアントは `lib/api/` に置く。

### 7.2 共通処理の責務

| モジュール | 層 | Express | 責務 |
|------------|-----|---------|------|
| `api` (axios) | frontend | （API 呼び出し側） | `/api` 付与、Bearer 付与、2xx/4xx 判定 |
| `token-provider` | frontend | — | セッションから access_token を取得 |
| `ApiClientError` | frontend | — | axios が throw するエラー型 |
| `extractBearerToken` | shared | validation | ヘッダーから JWT 取得 |
| `jsonError` / `handleRoute` | frontend/lib/api | controller | 共通エラー JSON を返す |
| `verifyAccessToken` | application | service（認証部分） | JWT 検証 → `sub` |
| `resolveAppUserId` | application | service（認証部分） | `sub → appUserId` |
| `requireAuthenticatedAppUser` | application | service | 上記2つを連続実行 |
| `getCurrentUser` | application | service | ログインユーザー取得ユースケース |
| `UserRepository` | db | dao | users テーブル問い合わせ |

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
// frontend/src/lib/api/json-error.ts（疑似コード）
import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@repo/shared/errors/api-error";

export function jsonError(
  code: ApiErrorCode,
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
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

## 9. 実装手順（フェーズ別・詳細）

各 Phase 完了時に **完了条件** と **確認コマンド** を実行してから次へ進む。

### フェーズ早見表

| Phase | 何を作るか | Express で言うと | 触る場所 |
|-------|-----------|------------------|----------|
| **0** | プロジェクトの骨組み | `npm init` + フォルダ構成 + 依存関係 | `packages/*/package.json`, `frontend/tsconfig` |
| **1** | 共通の型・エラー・入力チェック | **validation** + 共通 DTO | `packages/shared/` |
| **2** | DB アクセス | **dao** | `packages/db/` |
| **3** | 業務処理 | **service** | `packages/application/` |
| **4** | API 入口 | **router + controller** | `frontend/src/app/api/` |
| **5** | フロントから API を呼ぶ仕組み | （Express プロジェクトのフロント側 fetch 相当） | `frontend/src/lib/api/` |
| **6** | 動作確認 | 結合テスト | curl + ブラウザ |

```text
Phase 0  骨組み
   ↓
Phase 1  shared（validation）  ─┐
Phase 2  db（dao）              ─┤ バックエンドの中身（packages/）
Phase 3  application（service）─┘
   ↓
Phase 4  route.ts（router + controller）  ← ここで初めて HTTP API になる
   ↓
Phase 5  axios（フロントから呼ぶ）
   ↓
Phase 6  確認
```

### 事前準備

```bash
# リポジトリ root
cd /home/katsu/workspace/show-spark-v2

# Supabase ローカル起動（未起動の場合）
npx supabase start

# frontend/.env に以下があることを確認
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...

# 依存関係インストール
npm install
```

---

### Phase 0: パッケージ基盤

**Express で言うと:** Express プロジェクトを立ち上げ、`src/services/`, `src/dao/`, `src/validators/` フォルダを作り、`package.json` で import できるようにする作業。

**この Phase では API はまだ動かない。** 中身を入れる「箱」だけ作る。

**目的:** モノレポの `@repo/*` パッケージを作成し、frontend から import できるようにする。

#### 0-1. ディレクトリ作成

```bash
mkdir -p packages/shared/src/{auth,errors,validation,types}
mkdir -p packages/db/src/{supabase,repositories}
mkdir -p packages/application/src/{auth,users}
mkdir -p packages/domain/src/user
```

#### 0-2. `packages/shared/package.json`

```json
{
  "name": "@repo/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    "./auth/extract-bearer-token": "./src/auth/extract-bearer-token.ts",
    "./errors/api-error": "./src/errors/api-error.ts",
    "./types/user": "./src/types/user.ts",
    "./validation/user": "./src/validation/user.ts"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

#### 0-3. `packages/db/package.json`

```json
{
  "name": "@repo/db",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    "./supabase/create-authenticated-client": "./src/supabase/create-authenticated-client.ts",
    "./repositories/user-auth-identity-repository": "./src/repositories/user-auth-identity-repository.ts",
    "./repositories/user-repository": "./src/repositories/user-repository.ts"
  },
  "dependencies": {
    "@repo/shared": "*",
    "@supabase/supabase-js": "^2.105.1"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

#### 0-4. `packages/application/package.json`

```json
{
  "name": "@repo/application",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    "./auth/verify-access-token": "./src/auth/verify-access-token.ts",
    "./auth/resolve-app-user-id": "./src/auth/resolve-app-user-id.ts",
    "./auth/require-authenticated-app-user": "./src/auth/require-authenticated-app-user.ts",
    "./users/get-current-user": "./src/users/get-current-user.ts"
  },
  "dependencies": {
    "@repo/db": "*",
    "@repo/shared": "*",
    "@supabase/supabase-js": "^2.105.1"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

#### 0-5. `packages/domain/src/user/user.ts`（最小）

```typescript
export type { User } from "@repo/shared/types/user";
```

`packages/domain/package.json` の exports に追加:

```json
"./user/user": "./src/user/user.ts"
```

#### 0-6. frontend の workspace 依存

`frontend/package.json` の `dependencies` に追加:

```json
"@repo/application": "*",
"@repo/db": "*",
"@repo/domain": "*",
"@repo/shared": "*",
"axios": "^1.16.1",
"zod": "^3.24.0"
```

#### 0-7. `frontend/tsconfig.json` の paths

```json
"paths": {
  "@/*": ["./src/*"],
  "@repo/application/*": ["../packages/application/src/*"],
  "@repo/db/*": ["../packages/db/src/*"],
  "@repo/shared/*": ["../packages/shared/src/*"],
  "@repo/domain/*": ["../packages/domain/src/*"]
}
```

#### 0-8. `frontend/next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@repo/application",
    "@repo/db",
    "@repo/domain",
    "@repo/shared",
  ],
};

export default nextConfig;
```

#### 0-9. インストール

```bash
npm install
```

#### Phase 0 完了条件

- [ ] `packages/shared`, `packages/db`, `packages/application` が存在する
- [ ] `npm install` がエラーなく完了する
- [ ] `cd frontend && npm run build` が型エラーなく通る（中身が空でも可）

---

### Phase 1: shared 層

**Express で言うと:** `src/validators/` + 共通エラークラス + DTO 型定義。

**ここで作るもの:** 「リクエストが正しい形式か」「エラー時にどんな JSON を返すか」「User 型とは何か」。

**目的:** 全 API で共通の型・エラー・Bearer 解析を定義する。

#### 1-1. 作成ファイル一覧

| ファイル | 内容 |
|----------|------|
| `packages/shared/src/errors/api-error.ts` | `ApiErrorCode`, `AppError`, ファクトリ関数 |
| `packages/shared/src/auth/extract-bearer-token.ts` | `extractBearerToken`, `requireBearerToken` |
| `packages/shared/src/types/user.ts` | `User` 型 |
| `packages/shared/src/validation/user.ts` | `UserSchema`, `UserResponseSchema` |

#### 1-2. `api-error.ts`

```typescript
export const API_ERROR_CODES = [
  "unauthorized",
  "user_not_found",
  "validation_error",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export class AppError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function unauthorized(): AppError {
  return new AppError("unauthorized", "認証が必要です", 401);
}

export function userNotFound(): AppError {
  return new AppError("user_not_found", "ユーザーが見つかりません", 404);
}

export function internalError(): AppError {
  return new AppError("internal_error", "サーバーエラーが発生しました", 500);
}
```

#### 1-3. `extract-bearer-token.ts`

```typescript
import { unauthorized } from "@repo/shared/errors/api-error";

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function requireBearerToken(request: Request): string {
  const token = extractBearerToken(request);
  if (!token) {
    throw unauthorized();
  }
  return token;
}
```

#### 1-4. `types/user.ts`

```typescript
export type User = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};
```

#### 1-5. `validation/user.ts`

```typescript
import { z } from "zod";

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  avatar_url: z.union([z.string().url(), z.null()]),
  created_at: z.string(),
  updated_at: z.string(),
});

export const UserResponseSchema = UserSchema;
export type UserResponse = z.infer<typeof UserResponseSchema>;
```

#### 1-6. 確認

```bash
cd frontend && npm run lint
```

#### Phase 1 完了条件

- [ ] `AppError`, `extractBearerToken`, `User` 型が export されている
- [ ] `npm run lint` が通る

**Express 経験者メモ:** Phase 1 完了時点ではまだ API は存在しない。validation モジュールだけできた状態。

---

### Phase 2: db 層

**Express で言うと:** `src/dao/userDao.ts` を作る作業。

**ここでやること:** `users` テーブルや `user_auth_identities` テーブルへの SELECT。**業務判断は書かない**（「見つからなければ 404」等は Phase 3 の service が担当）。

**目的:** JWT 付き Supabase クライアントと users / user_auth_identities への問い合わせを実装する。

#### 2-1. 作成ファイル一覧

| ファイル | 内容 |
|----------|------|
| `packages/db/src/supabase/create-authenticated-client.ts` | JWT 付き client |
| `packages/db/src/repositories/user-auth-identity-repository.ts` | sub → user_id |
| `packages/db/src/repositories/user-repository.ts` | user_id → User |

#### 2-2. `create-authenticated-client.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

export function createAuthenticatedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Supabaseの環境変数が設定されていません。");
  }

  return createClient(url, key, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
```

#### 2-3. `user-auth-identity-repository.ts`

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

const PROVIDER = "supabase";

export async function findAppUserIdByProviderSubject(
  supabase: SupabaseClient,
  providerSubject: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_auth_identities")
    .select("user_id")
    .eq("provider", PROVIDER)
    .eq("provider_subject", providerSubject)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data?.user_id ?? null;
}
```

#### 2-4. `user-repository.ts`

```typescript
import type { User } from "@repo/shared/types/user";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function findUserById(
  supabase: SupabaseClient,
  userId: string,
): Promise<User | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, avatar_url, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data;
}
```

#### 2-5. 確認

```bash
cd frontend && npm run lint
```

#### Phase 2 完了条件

- [ ] repository が `SupabaseClient` を引数に取る（service_role を使わない）
- [ ] `npm run lint` が通る

**Express 経験者メモ:** dao だけ完成。まだ HTTP エンドポイントはない。

---

### Phase 3: application 層

**Express で言うと:** `src/services/userService.ts` を作る作業。

**ここでやること:**
- JWT が有効か確認（認証）
- `sub` から app の `user_id` を引く（このアプリ固有の橋渡し）
- dao を呼んで User を返す。見つからなければ `AppError` を throw

**目的:** JWT 検証と `sub → appUserId` 解決を共通化し、GetCurrentUser usecase を実装する。

#### 3-1. 作成ファイル一覧

| ファイル | 内容 |
|----------|------|
| `packages/application/src/auth/verify-access-token.ts` | JWT 検証 |
| `packages/application/src/auth/resolve-app-user-id.ts` | sub → appUserId |
| `packages/application/src/auth/require-authenticated-app-user.ts` | 上記2つの合成 |
| `packages/application/src/users/get-current-user.ts` | users 取得 usecase |

#### 3-2. `verify-access-token.ts`

```typescript
import { unauthorized } from "@repo/shared/errors/api-error";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function verifyAccessToken(
  supabase: SupabaseClient,
  accessToken: string,
): Promise<{ authSubject: string }> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    throw unauthorized();
  }

  return { authSubject: user.id };
}
```

#### 3-3. `resolve-app-user-id.ts`

```typescript
import { findAppUserIdByProviderSubject } from "@repo/db/repositories/user-auth-identity-repository";
import { userNotFound } from "@repo/shared/errors/api-error";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveAppUserId(
  supabase: SupabaseClient,
  authSubject: string,
): Promise<{ appUserId: string }> {
  const appUserId = await findAppUserIdByProviderSubject(
    supabase,
    authSubject,
  );

  if (!appUserId) {
    throw userNotFound();
  }

  return { appUserId };
}
```

#### 3-4. `require-authenticated-app-user.ts`

```typescript
import { createAuthenticatedClient } from "@repo/db/supabase/create-authenticated-client";
import { resolveAppUserId } from "./resolve-app-user-id";
import { verifyAccessToken } from "./verify-access-token";

export async function requireAuthenticatedAppUser(accessToken: string) {
  const supabase = createAuthenticatedClient(accessToken);
  const { authSubject } = await verifyAccessToken(supabase, accessToken);
  const { appUserId } = await resolveAppUserId(supabase, authSubject);

  return { supabase, authSubject, appUserId };
}
```

#### 3-5. `get-current-user.ts`

```typescript
import { findUserById } from "@repo/db/repositories/user-repository";
import { userNotFound } from "@repo/shared/errors/api-error";
import type { User } from "@repo/shared/types/user";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getCurrentUser(
  supabase: SupabaseClient,
  appUserId: string,
): Promise<User> {
  const user = await findUserById(supabase, appUserId);
  if (!user) {
    throw userNotFound();
  }
  return user;
}
```

#### 3-6. 確認

```bash
cd frontend && npm run lint
```

#### Phase 3 完了条件

- [ ] `requireAuthenticatedAppUser` が export されている
- [ ] `getCurrentUser` が `AppError` を throw する
- [ ] `npm run lint` が通る

**Express 経験者メモ:** service まで完成。Node REPL から関数を直接呼べば動くが、HTTP ではまだ叩けない。

---

### Phase 4: バックエンド Route Handler

**Express で言うと:** `app.get('/users/me', userController.getMe)` を登録し、controller が service を呼ぶ部分。

**ここで初めて HTTP API になる。** `curl http://localhost:3000/api/users/me` が通る Phase。

**目的:** `GET /api/users/me` と共通エラーハンドリングを実装する。

#### 4-1. 作成ファイル一覧

| ファイル | 内容 |
|----------|------|
| `frontend/src/lib/api/json-error.ts` | 共通エラー JSON |
| `frontend/src/lib/api/handle-route.ts` | try/catch ラッパー |
| `frontend/src/app/api/users/me/route.ts` | GET handler |

#### 4-2. `json-error.ts`

```typescript
import { NextResponse } from "next/server";
import type { ApiErrorCode } from "@repo/shared/errors/api-error";

export function jsonError(
  code: ApiErrorCode,
  message: string,
  status: number,
) {
  return NextResponse.json({ error: { code, message } }, { status });
}
```

#### 4-3. `handle-route.ts`

```typescript
import { AppError, internalError } from "@repo/shared/errors/api-error";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/json-error";

export async function handleRoute<T>(
  handler: () => Promise<T>,
): Promise<NextResponse> {
  try {
    const result = await handler();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonError(error.code, error.message, error.status);
    }
    console.error(error);
    const e = internalError();
    return jsonError(e.code, e.message, e.status);
  }
}
```

#### 4-4. `route.ts`

```typescript
import { getCurrentUser } from "@repo/application/users/get-current-user";
import { requireAuthenticatedAppUser } from "@repo/application/auth/require-authenticated-app-user";
import { requireBearerToken } from "@repo/shared/auth/extract-bearer-token";
import { handleRoute } from "@/lib/api/handle-route";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const token = requireBearerToken(request);
    const { supabase, appUserId } = await requireAuthenticatedAppUser(token);
    return getCurrentUser(supabase, appUserId);
  });
}
```

#### 4-5. 確認（curl）

```bash
# 開発サーバー起動（別ターミナル）
npm run dev

# 401 確認（ヘッダーなし）
curl -i http://localhost:3000/api/users/me

# 401 確認（不正トークン）
curl -i http://localhost:3000/api/users/me \
  -H "Authorization: Bearer invalid-token"
```

#### Phase 4 完了条件

- [ ] ヘッダーなし → `401` + `{ "error": { "code": "unauthorized", ... } }`
- [ ] 不正トークン → `401`
- [ ] `npm run lint` が通る

**Express 経験者メモ:** バックエンド API 単体は完成。curl + Bearer で確認できる。

---

### Phase 5: フロント axios クライアント + UI 連携

**Express で言うと:** Express とは別プロジェクトのフロント（React）から `fetch('/api/users/me')` する部分。Bearer 付与を毎回書かなくてよいよう axios interceptor に任せる。

**ここで作るもの:** 業務画面から `api.get("/users/me")` 一行で呼べる仕組み。

**目的:** 業務コードから `api.get("/users/me")` だけで呼べるようにする。

> **配置:** `frontend/src/lib/api/` に置く（`app/api/` ではない）。

#### 5-1. 誤配置ファイルの移動（存在する場合）

```bash
# app/api に client.ts 等を置いてしまった場合は削除 or 移動
rm -f frontend/src/app/api/client.ts
rm -f frontend/src/app/api/token-provider.ts
```

#### 5-2. 作成ファイル一覧

| ファイル | 内容 |
|----------|------|
| `frontend/src/lib/api/token-provider.ts` | access_token 取得 |
| `frontend/src/lib/errors/api-client-error.ts` | axios 用エラー |
| `frontend/src/lib/api/client.ts` | axios インスタンス |

#### 5-3. `token-provider.ts`

```typescript
import { createClient } from "@/lib/supabase/client";

export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
```

#### 5-4. `api-client-error.ts`

```typescript
import type { ApiErrorCode } from "@repo/shared/errors/api-error";

export class ApiClientError extends Error {
  constructor(
    public status: number | undefined,
    public code: ApiErrorCode | undefined,
    message: string | undefined,
  ) {
    super(message ?? "API request failed");
    this.name = "ApiClientError";
  }
}
```

#### 5-5. `client.ts`

```typescript
import axios from "axios";
import { ApiClientError } from "@/lib/errors/api-client-error";
import { getAccessToken } from "@/lib/api/token-provider";

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use(async (config) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status as number | undefined;
    const body = error.response?.data as
      | { error?: { code?: ApiErrorCode; message?: string } }
      | undefined;
    throw new ApiClientError(
      status,
      body?.error?.code,
      body?.error?.message,
    );
  },
);
```

#### 5-6. `/app` ページ連携例

`frontend/src/app/app/page.tsx` に Client Component を追加するか、既存ページから呼ぶ:

```typescript
// 例: Client Component（app/user-info.tsx）
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { User } from "@repo/shared/types/user";

export function UserInfo() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api.get<User>("/users/me").then((res) => setUser(res.data));
  }, []);

  if (!user) return <p>読み込み中...</p>;
  return <p>{user.name}（{user.email}）</p>;
}
```

#### 5-7. 確認

1. `npm run dev` で起動
2. Google でサインイン
3. `/app` でユーザー名・メールが表示される

#### Phase 5 完了条件

- [ ] 業務コードに Supabase / Bearer の記述がない
- [ ] サインイン後 `/app` で `api.get("/users/me")` が成功する
- [ ] `npm run lint` が通る

**Express 経験者メモ:** フロント〜バックの一連がつながる。Express + 別フロント構成の「全部入り」がここで完成。

---

### Phase 6: テスト・最終確認

**Express で言うと:** Postman / curl での結合テスト + `npm run build` による本番ビルド確認。

#### 6-1. 手動 E2E チェックリスト

| # | 操作 | 期待結果 |
|---|------|----------|
| 1 | 未ログインで `curl /api/users/me` | 401 unauthorized |
| 2 | ログイン後 curl + Bearer | 200 + users JSON |
| 3 | `/app` ページ表示 | name/email 表示 |
| 4 | サインアウト後 `/app` | sign-in へリダイレクト |

#### 6-2. curl で access_token を取得する方法

ブラウザ DevTools → Console:

```javascript
// サインイン後に実行
const { createClient } = await import("/src/lib/supabase/client.ts");
// または既存の Supabase クライアント経由で:
// supabase.auth.getSession() の access_token をコピー
```

実用的には DevTools → Application → Cookies から Supabase セッションを確認するか、一時的に Console で `getSession()` を実行する。

```bash
curl -i http://localhost:3000/api/users/me \
  -H "Authorization: Bearer <access_token>"
```

#### 6-3. ビルド確認

```bash
cd frontend && npm run build
```

#### 6-4. 将来のユニットテスト（任意）

`packages/shared` に vitest を追加し、以下をテスト:

| テスト対象 | ケース |
|------------|--------|
| `extractBearerToken` | 正常 / ヘッダーなし / `Bearer` のみ / 小文字 bearer |
| `requireBearerToken` | なし → AppError(401) |

```bash
# domain パッケージの vitest を流用する場合
cd packages/domain && npm test
```

#### Phase 6 完了条件

- [ ] 上記 E2E チェックリストがすべて PASS
- [ ] `npm run build` が成功
- [ ] 計画書どおりのファイル配置になっている

---

### 実装順序サマリー

```text
Phase 0  packages 基盤          … Express: プロジェクト初期設定
   ↓
Phase 1  shared                 … Express: validators + DTO + エラー
Phase 2  db                     … Express: dao
Phase 3  application            … Express: service
   ↓
Phase 4  route.ts               … Express: router + controller  ← HTTP API 完成
   ↓
Phase 5  axios client + UI      … Express: フロントから API 呼び出し
   ↓
Phase 6  E2E + build            … Express: 結合テスト
```

---

## 10. セキュリティ

1. **JWT は decode のみしない** — 必ず `supabase.auth.getUser(jwt)` で検証
2. **RLS を信頼** — repository は authenticated client を使う（`service_role` は使わない）
3. **`users.id` をクライアント入力にしない** — 常に JWT sub から server 側で解決
4. **レスポンスに `provider_subject` を含めない**
5. **`token-provider` 以外のフロント業務コードから Supabase を呼ばない**

---

## 11. トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `401 unauthorized`（curl OK だが UI NG） | axios interceptor で token 未取得 | サインイン状態確認。`getSession()` が null なら再ログイン |
| `Module not found: @repo/shared` | workspace 未リンク | root で `npm install`。`transpilePackages` 確認 |
| `404 user_not_found` | identity 未作成 | `npm run db:reset` 後に再サインアップ |
| Route Handler で env undefined | server 側 env 未設定 | `frontend/.env` に Supabase 変数があるか確認 |
| `app/api/client.ts` がある | 誤配置 | `lib/api/` に移動。`app/api/` は route.ts のみ |

---

## 12. 動作確認手順（クイックリファレンス）

```bash
# 1. 起動
npm run dev

# 2. 401（未認証）
curl -i http://localhost:3000/api/users/me

# 3. 200（認証済み — access_token を差し替え）
curl -i http://localhost:3000/api/users/me \
  -H "Authorization: Bearer <access_token>"

# 4. ビルド
cd frontend && npm run build

# 5. lint
cd frontend && npm run lint
```

---

## 13. 工数見積もり

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

## 14. 関連ドキュメント

- [AGENTS.md §2.1](../../AGENTS.md#21-express-経験者向けレイヤー対応表) — Express 層との対応（全 API 共通）
- [AGENTS.md](../../AGENTS.md) — レイヤー責務・認証方針
- [db-user-identity-migration.md](./db-user-identity-migration.md) — ユーザー ID 分離の DB 設計
