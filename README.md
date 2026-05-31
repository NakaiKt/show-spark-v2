# 計画書

実装前の設計・手順書は `docs/計画書/` に置く。

レイヤー構成（Express の router / service / dao との対応）は [AGENTS.md §2.1](AGENTS.md#21-express-経験者向けレイヤー対応表) を参照。

| ファイル | 内容 |
|---|---|
| [docs/計画書/db-user-identity-migration.md](docs/計画書/db-user-identity-migration.md) | ユーザー ID 分離（DB マイグレーション） |
| [docs/計画書/get-users-me-api.md](docs/計画書/get-users-me-api.md) | GET /api/users/me 実装計画（Phase 別手順・Express 対応付き） |

---

# 開発環境起動
1回目
``` bash
// supabase起動
npx supabase start

// 起動後に得られたanon keyを .env.localに記録
cd frontend
npm run dev
```

2回目以降はrootで
``` bash
npm run dev
```

``` bash
// supabase 停止
npx supabase stop
```

# データベース操作
``` bash
// データベースリセット & schema・database/ 生成 & types 生成
npm run db:reset

// リモートデータベースに反映 & schema・database/ 生成
npm run db:push

// schema・database/ 生成のみ（types は生成しない）
npm run db:dump

// typesファイル作成
npm run gen:types

```

## linkが切れている場合
`Cannot find project ref. Have you run supabase link?` と言われた場合

``` bash
// まずはログインしているかどうか
npx supabase login

// プロジェクトの紐づけ
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
# → frontend/src/lib/supabase/database.types.ts を更新
```

### 4. リモートに反映

```bash
npm run db:push
# → リモートDBにマイグレーションを適用 → schema・database/ を更新
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

| ファイル | 内容 |
|---|---|
| `supabase/schema.sql` | 現在のDB全体のスナップショット（自動生成） |
| `supabase/database/<table>.sql` | テーブル別の定義（自動生成） |
| `supabase/migrations/` | 変更の履歴（実際に適用されるSQL） |