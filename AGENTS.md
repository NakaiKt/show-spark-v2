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

### 認可

- application層で実施（主）
- RLSは最終防衛ライン

---

## 6. Supabase利用方針

- フロントから直接Supabaseを呼ばない
- すべてRoute Handler経由（BFF強制）

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

```
visibility = 'public'
OR owner_id = auth.uid()
OR EXISTS (
  SELECT 1
  FROM resource_members
  WHERE resource_members.resource_id = resources.id
    AND resource_members.user_id = auth.uid()
    AND resource_members.role = 'admin'
)
```

---

### INSERT（ルートリソース）

```
owner_id = auth.uid()
```

---

### UPDATE / DELETE

```
owner_id = auth.uid()
OR EXISTS (
  SELECT 1
  FROM resource_members
  WHERE resource_members.resource_id = resources.id
    AND resource_members.user_id = auth.uid()
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
      resources.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM resource_members
        WHERE resource_members.resource_id = resources.id
          AND resource_members.user_id = auth.uid()
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

```
GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id
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