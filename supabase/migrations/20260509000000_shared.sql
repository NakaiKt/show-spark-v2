-- ================================================================
-- 共通インフラ
-- 全マイグレーションの先頭に適用される。テーブル定義より先に実行すること。
-- ================================================================

create extension if not exists moddatetime schema extensions;

-- ================================================================
-- RLS ヘルパー関数（rls スキーマ）
-- user_auth_identities 作成後に rls.current_app_user_id / rls.is_own を定義する
-- ================================================================

create schema if not exists rls;

create or replace function rls.is_authenticated()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select auth.uid() is not null $$;
