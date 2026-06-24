# show-spark-v2

Next.js (App Router) + Supabase の Web アプリ。UI と業務 API をモノレポで分離している。

## ドキュメント


| ドキュメント                                   | 内容                               |
| ---------------------------------------- | -------------------------------- |
| [AGENTS.md](AGENTS.md)                   | 全体アーキテクチャ・レイヤー対応表（Express 経験者向け） |
| [packages/AGENTS.md](packages/AGENTS.md) | API を 追加する手順                     |
| [docs/計画書/](docs/計画書/)                   | 実装前の設計・手順書                       |


## 構成


| ディレクトリ                 | 役割                                         |
| ---------------------- | ------------------------------------------ |
| `frontend/`            | Next.js（UI + API 入口 `app/api/**/route.ts`） |
| `packages/shared`      | 共通型・エラー・バリデーション                            |
| `packages/db`          | DB アクセス（repository）                        |
| `packages/application` | usecase・認可                                 |
| `supabase/`            | マイグレーション・DB スキーマ                           |


---

# 開発環境起動

## 事前準備（env ファイル）

クローン直後は以下 2 つの env を用意する（どちらも gitignore 済み）。

`frontend/.env`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<npx supabase start のログに出る anon/publishable key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`.env`（リポジトリルート / Google ログイン用。`supabase/config.toml` が `env()` で参照）:

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=<Google Cloud で発行したクライアントシークレット>
```

## 起動

1回目

```bash
# supabase起動（起動ログの API URL / publishable key を frontend/.env に記録）
npx supabase start

cd frontend
npm run dev
```

2回目以降はrootで（supabase 起動とフロント起動をまとめて実行）

```bash
npm run dev
```

```bash
# supabase 停止
npx supabase stop
```

# データベース操作

型生成（`gen:types`）は `db:reset` / `db:push` に**組み込み済み**。テーブル変更後はどちらかを
実行すれば `packages/db/src/database.types.ts` まで自動更新される（手動で打つ必要はない）。

```bash
# ローカルDBリセット → schema・database/ 生成 → types 生成（local から）
npm run db:reset

# リモートDBに反映 → schema・database/ 生成 → types 生成（linked から）
npm run db:push

# schema・database/ 生成のみ（types は生成しない）
npm run db:dump

# types のみ手動生成（通常は不要。reset/push が自動実行する）
npm run gen:types
```

## linkが切れている場合

`Cannot find project ref. Have you run supabase link?` と言われた場合

```bash
# まずはログインしているか確認
npx supabase login

# プロジェクトの紐づけ
npx supabase link
```

# テーブルの作成・変更手順

## テーブルを新規作成する

### 1. マイグレーションファイルを作成

```bash
npx supabase migration new <名前>
# 例: supabase migration new create_users
# → supabase/migrations/YYYYMMDDHHMMSS_create_users.sql が生成される
```

### 2. SQLを書く

ユーザーまわりは `public.users` と `public.user_auth_identities` に分離する（認証 subject はリンク表のみ）。

- 実装例: `supabase/migrations/20260509032705_users.sql`
- dev への適用手順: [docs/計画書/db-user-identity-migration.md](docs/計画書/db-user-identity-migration.md)

### 3. ローカルで確認・ファイル生成

```bash
npm run db:reset
# → マイグレーション適用 → supabase/schema.sql と supabase/database/<table>.sql を更新
# → packages/db/src/database.types.ts を更新（frontend からは @repo/db/database.types で参照）
```

### 4. リモートに反映

```bash
npm run db:push
# → リモートDBにマイグレーションを適用 → schema・database/ と types を更新
```

---

## 既存テーブルを変更する（カラム追加など）

### 1. 新しいマイグレーションファイルを作成

既存ファイルは編集しない。変更は必ず新しいファイルで行う。

```bash
npx supabase migration new add_username_to_users
```

### 2. 差分のSQLを書く

```sql
alter table public.users add column username text unique;
```

### 3. 以降は新規作成と同様（手順 3〜4）

```bash
npm run db:reset
npm run db:push
```

---

## 現在のスキーマ定義を確認する


| ファイル                            | 内容                     |
| ------------------------------- | ---------------------- |
| `supabase/schema.sql`           | 現在のDB全体のスナップショット（自動生成） |
| `supabase/database/<table>.sql` | テーブル別の定義（自動生成）         |
| `supabase/migrations/`          | 変更の履歴（実際に適用されるSQL）     |


---

# デプロイ

ホスティングは **Vercel（フロント）+ Supabase クラウド（DB / Auth）**。
`supabase/config.toml` は **ローカル専用**で、本番には反映されない（本番の Auth 設定は
Supabase ダッシュボードで行う）。

## 1. DB を本番に反映

```bash
# 初回のみ: 本番プロジェクトと紐づけ
npx supabase login
npx supabase link

# マイグレーションを本番 DB に適用（+ schema/types を再生成）
npm run db:push
```

## 2. Vercel（フロント）

- リポジトリを Vercel に連携。Root Directory は `frontend`。
- 環境変数（Vercel の Project Settings → Environment Variables）に本番値を設定：
  - `NEXT_PUBLIC_SUPABASE_URL` … 本番 Supabase の URL（`https://<ref>.supabase.co`）
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` … 本番の publishable (anon) key
  - `NEXT_PUBLIC_APP_URL` … 本番ドメイン（例 `https://example.com`）

## 3. Supabase ダッシュボード（Auth 設定。config.toml は効かない）

- Authentication → URL Configuration:
  - Site URL = 本番ドメイン
  - Redirect URLs に `https://<本番ドメイン>/api/auth/callback` を追加
- Authentication → Providers → Google を有効化し、Client ID / Secret を設定
- Google Cloud 側の OAuth 承認済みリダイレクト URI に
`https://<ref>.supabase.co/auth/v1/callback` を追加

> ローカルの `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`（ルート `.env`）は
> ローカルの Supabase 用。本番では上記ダッシュボード設定が使われる。

