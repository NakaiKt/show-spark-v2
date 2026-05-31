# ユーザー ID 分離マイグレーション手順書

`public.users.id` を Supabase Auth の subject から切り離し、**リンク専用テーブル** `public.user_auth_identities` で認証とアプリユーザーを結ぶ。

---

## この手順書の位置づけ

| 対象 | 扱い |
|------|------|
| **本ファイル（`docs/db-user-identity-migration.md`）** | 設計方針・SQL 原文・実行手順の唯一の参照先 |
| **`supabase/migrations/` など実装ファイル** | **手順 1 を実行するまで変更しない**（未適用の設計は本書にのみ書く） |
| **dev リモート DB** | **手順 2 以降**で `db reset --linked` するまで現状のまま |

手順書を読んで設計を固め、実行タイミングで初めて migration 等を編集する。

---

## 設計方針（採用する案）

### 採用: リンク専用テーブル `user_auth_identities`

```text
auth.users.id  ──►  user_auth_identities.provider_subject
                           │
                           │ user_id (FK)
                           ▼
                    public.users.id   ← アプリ全体が参照する ID
```

- **`public.users` に `sub` / `auth_user_id` カラムは持たない**  
  認証 subject はリンク表にだけ置く。プロフィール（name, email, avatar）と認証の責務を分離する。
- **`user_auth_identities` の役割**
  - `provider` … 認証基盤の種別（現状は `'supabase'` 固定でよい）
  - `provider_subject` … その基盤のユーザー ID（Supabase では `auth.users.id`）
  - `user_id` … `public.users.id` への FK
  - `unique (provider, provider_subject)` … 同一 subject の二重登録を防ぐ
- **将来 IdP を移行するとき** … `users.id` はそのまま、identity 行を追加・切替・無効化する想定

### 採用しない案

| 案 | 見送り理由 |
|----|------------|
| `users.id` を引き続き `auth.users.id` と同一にする | 認証基盤とアプリ ID が密結合のまま |
| `users` に `sub` / `auth_user_id` カラムを1本足す | 1ユーザー複数プロバイダ・移行時の履歴が扱いにくい；リンク表の方が拡張しやすい |

---

## 前提（実行時）

- 対象環境: **dev の Supabase プロジェクトのみ**
- 既存ユーザー・データ: **すべて削除してよい**
- アカウント削除 API: **今回は作らない**（後回し）
- dev リモートには既に migration が適用済み → **手順 1 で既存 migration の中身を書き換える場合は、必ず手順 2 の `db reset --linked` とセット**

> **注意（本番・ステージングでは使わない）**  
> 適用済み migration の SQL を書き換えるのは、**リモートを `db reset --linked` で作り直す場合に限り**安全。  
> 本番投入後は必ず **新規 migration ファイル** で差分を足すこと。

---

## ゴール状態

| 項目 | 変更前 | 変更後 |
|------|--------|--------|
| `public.users.id` | `auth.users.id` と同一（FK） | 独立 UUID（`gen_random_uuid()`） |
| 認証との紐づけ | PK = subject | `user_auth_identities` |
| RLS `rls.is_own(owner_id)` | `auth.uid() = owner_id` | `rls.current_app_user_id() = owner_id` |
| 今後の `owner_id` | （未実装） | 常に `public.users.id` を参照 |

```text
auth.users (provider_subject)
        │
        ▼
user_auth_identities  provider='supabase', provider_subject = auth.users.id
        │
        ▼
public.users  id = アプリ内の不変ユーザー ID
```

---

## 作業の流れ（概要）

| 順 | 内容 | 触るもの |
|----|------|----------|
| 0 | 事前確認（link・env・ブランチ） | なし |
| 1 | migration を編集（既存 2 本の置換 + 新規 1 本） | `supabase/migrations/` のみ |
| 2 | リモート dev 全リセット | dev DB（`db reset --linked`） |
| 3 | ローカル reset + schema / types 生成 | ローカル DB + 自動生成物 |
| 4 | Auth ユーザー手動削除（残存時） | Dashboard |
| 5 | 再サインアップ・SQL 確認 | アプリ + DB |
| 6 | （任意）AGENTS.md / README の文書更新 | ドキュメントのみ |

**手順 1 より前に migration を編集しないこと**（設計は本書で完結）。

所要時間の目安: **30〜45 分**（手順 1〜5）

---

## 0. 事前準備

### 0.1 リポジトリ

```bash
cd /home/katsu/workspace/show-spark-v2
git status   # 作業前にコミット or stash 推奨
git checkout -b chore/user-identity-split   # 任意
```

### 0.2 Supabase CLI と link

```bash
npx supabase login
npx supabase link    # 既に link 済みなら不要
npx supabase projects list   # 対象が dev であることを確認
```

`supabase/.temp/linked-project.json` の project ref が **dev** であることを目視確認する。

### 0.3 フロントの env

`frontend/.env.local` が **今回リセットする dev プロジェクト** を指していることを確認する。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（anon key）

---

## 1. migration の編集（初めてリポジトリを変えるステップ）

| ファイル | 操作 |
|----------|------|
| `20260509000000_shared.sql` | 全文置き換え（手順 1.1） |
| `20260509032705_users.sql` | 全文置き換え（手順 1.2）— **`public.users` のみ** |
| `<timestamp>_user_auth_identities.sql` | **新規作成**（手順 1.3）— リンク表・Auth トリガー |

`users` 用 migration に `user_auth_identities` や `handle_new_user` を書かない。  
適用順はタイムスタンプ順のため、新規ファイルは **`users.sql` より後** になること（`migration new` で自動）。

置き換え・新規作成が終わったら、すぐに手順 2（`db reset --linked`）へ進む。手順 2 前に `db push` だけ実行しない。

### 1.1 `supabase/migrations/20260509000000_shared.sql`

共通拡張と `rls.is_authenticated()` のみ。**`rls.current_app_user_id` / `rls.is_own` は書かない**（`user_auth_identities` 未作成の段階では `CREATE FUNCTION` が失敗する）。

```sql
-- ================================================================
-- 共通インフラ
-- ================================================================

create extension if not exists moddatetime schema extensions;

create schema if not exists rls;

create or replace function rls.is_authenticated()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select auth.uid() is not null $$;
```

### 1.2 `supabase/migrations/20260509032705_users.sql`

`public.users` テーブルと、その RLS・`updated_at` トリガーのみ。

```sql
-- アプリユーザー（認証 ID とは別の不変 ID）
create table public.users (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null unique,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- users の policy は手順 1.3（identities 作成・RLS 関数定義後）で追加

create trigger handle_updated_at
  before update on public.users
  for each row execute procedure extensions.moddatetime(updated_at);
```

### 1.3 `user_auth_identities` 用 migration（新規）

```bash
npx supabase migration new user_auth_identities
# → supabase/migrations/YYYYMMDDHHMMSS_user_auth_identities.sql
```

生成されたファイルに以下を記述する（`20260509032705_users.sql` より **後** のタイムスタンプであること）。

```sql
-- 認証プロバイダ ↔ アプリユーザーの対応
create table public.user_auth_identities (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references public.users(id) on delete cascade,
  provider          text        not null,
  provider_subject  uuid        not null,
  created_at        timestamptz not null default now(),
  unique (provider, provider_subject)
);

create index user_auth_identities_user_id_idx
  on public.user_auth_identities (user_id);

create or replace function rls.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select uai.user_id
  from public.user_auth_identities uai
  where uai.provider = 'supabase'
    and uai.provider_subject = auth.uid()
  limit 1
$$;

create or replace function rls.is_own(owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select rls.current_app_user_id() = owner_id $$;

create policy "users: select own"
  on public.users for select
  to authenticated
  using (rls.is_own(id));

create policy "users: update own"
  on public.users for update
  to authenticated
  using (rls.is_own(id))
  with check (rls.is_own(id));

create policy "users: delete own"
  on public.users for delete
  to authenticated
  using (rls.is_own(id));

alter table public.user_auth_identities enable row level security;

create policy "user_auth_identities: select own"
  on public.user_auth_identities for select
  to authenticated
  using (provider_subject = auth.uid());

-- サインアップ時: users + identity を生成
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_user_id uuid;
begin
  insert into public.users (name, email, avatar_url)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  returning id into new_user_id;

  insert into public.user_auth_identities (user_id, provider, provider_subject)
  values (new_user_id, 'supabase', new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 2. リモート dev の全リセット

ローカルの migration フォルダを **最初から** リモートに適用し直す。

```bash
cd /home/katsu/workspace/show-spark-v2

# dev プロジェクトの DB を空に近い状態から migration を再実行
npx supabase db reset --linked --yes
```

成功すると、リモートの `public` スキーマは新定義になる。

### よくあるエラー

| メッセージ | 対処 |
|------------|------|
| `Have you run supabase link?` | `npx supabase link` |
| 認証エラー | `npx supabase login` |
| migration SQL エラー | 手順 1 の全文コピミスを確認し、再度 `db reset --linked` |

---

## 3. ローカル DB のリセットと生成物更新

Docker 上のローカル Supabase も同じ migration で揃える。

```bash
npm run db:reset
```

これは以下を実行する（`package.json` より）。

1. `supabase db reset`（ローカル）
2. `supabase db dump --local` → `supabase/schema.sql` と `supabase/database/`
3. `supabase gen types typescript --local` → `frontend/src/lib/supabase/database.types.ts`

### リモート基準で型だけ取り直す場合（任意）

ローカル Docker を使わずリモートだけで開発している場合:

```bash
npx supabase gen types typescript --linked > frontend/src/lib/supabase/database.types.ts
npx supabase db dump --linked -f supabase/schema.sql
node scripts/split-schema.mjs
```

通常は **手順 2 のあと `npm run db:reset` で十分**。

---

## 4. Auth ユーザーの削除（重要）

`db reset --linked` は **Postgres の public 等は作り直すが、`auth.users` に古いユーザーが残ることがある**。

残ったままだと:

- 再ログインしても `handle_new_user` は **INSERT 時のみ** 動くため `public.users` が作られない
- セッションだけあるのにプロフィールが無い、といった不整合が起きる

### 4.1 Dashboard で削除（推奨）

1. [Supabase Dashboard](https://supabase.com/dashboard) → 対象 **dev** プロジェクト
2. **Authentication** → **Users**
3. 既存ユーザーをすべて削除

### 4.2 SQL で確認（任意）

Dashboard の **SQL Editor** で実行:

```sql
select * from public.users;
select * from public.user_auth_identities;
select id, email from auth.users;
```

期待: 再サインアップ前は `users` / `identities` は 0 件。`auth.users` も 0 件にしておく。

---

## 5. 動作確認

### 5.1 アプリ起動

```bash
cd frontend && npm run dev
# またはルートで npm run dev
```

### 5.2 Google でサインイン

1. `/auth/sign-in` → ログイン
2. `/app` が表示されること

### 5.3 DB 確認（SQL Editor）

```sql
select u.id as app_user_id, u.email, u.name
from public.users u;

select i.provider, i.provider_subject, i.user_id
from public.user_auth_identities i;
```

**期待結果**

- `users.id` ≠ `user_auth_identities.provider_subject`
- `user_auth_identities.provider` = `'supabase'`
- `user_auth_identities.provider_subject` = Auth user の UUID
- `users.id` = `user_auth_identities.user_id`

---

## 6. リモートへ push が必要か

今回 **`db reset --linked` でリモートに migration を再適用済み** のため、通常は追加の `db push` は不要。

```bash
npx supabase migration list --linked
```

ローカルとリモートの migration バージョンが一致していれば OK。

**やってはいけないこと**

- 古い内容の migration に戻したあと `db push` だけする → リモートとファイルが再びズレる

---

## 7. 今回やらないこと / 手順 6 で任意対応

| 項目 | タイミング |
|------|------------|
| アカウント削除 API | 別 PR（BFF + `auth.admin.deleteUser`） |
| `useCurrentUser` 実装 | DB 反映後。`auth.getUser().id` ではなく `public.users` を参照 |
| `AGENTS.md` の RLS 例 | 手順 6（任意）。`owner_id` = `public.users.id`、`rls.is_own(owner_id)` |
| `README.md` の users サンプル | 手順 6（任意）。本書と各 migration を参照に差し替え |

アプリコード（`frontend/` / `packages/`）の変更は本手順書の必須範囲外。

---

## 8. 代替手順（既存 `users.sql` を書き換えたくない場合）

dev 全消しでも、Git 上で当時の `users.sql` を残したい場合:

1. `users.sql` は触らない
2. `npx supabase migration new split_user_auth_identity` で、FK 削除・`users` の `id` 変更・`user_auth_identities` 作成・関数差し替えを **1 本にまとめて** 記述
3. `npx supabase db reset --linked --yes`
4. 手順 3〜5 と同じ

本書メインは **手順 1（shared / users の置換 + identities 新規 1 本）**。

---

## 9. チェックリスト

- [ ] **手順 1 前** … migration / schema / types がまだ旧設計のままであることを確認した
- [ ] dev プロジェクトに link している
- [ ] `20260509000000_shared.sql` を更新した（手順 1.1）
- [ ] `20260509032705_users.sql` を更新した（手順 1.2・`users` のみ）
- [ ] `*_user_auth_identities.sql` を新規作成した（手順 1.3）
- [ ] `npx supabase db reset --linked --yes` 成功
- [ ] `npm run db:reset` 成功
- [ ] Dashboard で Auth ユーザーを削除した
- [ ] 再サインアップ後、`users` と `identities` が 1 件ずつ
- [ ] `users.id` と `provider_subject` が異なる UUID
- [ ] `database.types.ts` に `user_auth_identities` がある

---

## 10. ロールバック（dev のみ）

1. Git で migration 3 ファイル（shared / users / identities）を元に戻す
2. `npx supabase db reset --linked --yes`
3. `npm run db:reset`
4. Auth ユーザーを削除して再サインアップ
