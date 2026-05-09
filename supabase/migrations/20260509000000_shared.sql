-- ================================================================
-- 共通インフラ
-- 全マイグレーションの先頭に適用される。テーブル定義より先に実行すること。
-- ================================================================

-- updated_at 自動更新（moddatetime 拡張を使用）
-- 各テーブルで以下の1行を書くだけで updated_at が自動更新される:
--
--   create trigger handle_updated_at before update on public.<table>
--     for each row execute procedure moddatetime(updated_at);
--
create extension if not exists moddatetime schema extensions;

-- ================================================================
-- RLS ヘルパー関数（rls スキーマ）
-- ポリシーの using / with check 句から呼び出して使う。
-- ================================================================

create schema if not exists rls;

-- 自分のレコードかどうか（owner_id が auth.uid() と一致するか）
-- 使い方:
--   using (rls.is_own(id))          -- id カラムが PK の場合
--   using (rls.is_own(user_id))     -- user_id カラムで紐づく場合
create or replace function rls.is_own(owner_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select auth.uid() = owner_id $$;

-- 認証済みユーザーかどうか
-- to authenticated だけでは不十分で、anon も明示的に弾きたい場合に使う。
-- 使い方:
--   using (rls.is_authenticated())
create or replace function rls.is_authenticated()
returns boolean
language sql stable security definer set search_path = public
as $$ select auth.uid() is not null $$;
