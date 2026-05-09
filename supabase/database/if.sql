-- Table: public.if
-- 自動生成ファイル。直接編集しないこと。
-- 変更する場合は supabase/migrations/ に新しいマイグレーションを追加し、npm run db:reset を実行する。

CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);
