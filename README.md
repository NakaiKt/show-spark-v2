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

# テーブルの作成・変更手順

## テーブルを新規作成する

### 1. マイグレーションファイルを作成

```bash
supabase migration new <名前>
# 例: supabase migration new create_users
# → supabase/migrations/YYYYMMDDHHMMSS_create_users.sql が生成される
```

### 2. SQLを書く

生成されたファイルに以下を記述する。

```sql
-- テーブル定義
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz default current_timestamp
);

-- RLS（必須）
alter table public.users enable row level security;

create policy "Users can read own profile"
on public.users for select
to authenticated
using ((select auth.uid()) = id);

-- Supabase Auth でサインアップした際に自動でレコードを生成するトリガー
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
```

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
supabase migration new add_username_to_users
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