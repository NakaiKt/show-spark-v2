-- Table: public.only
-- 自動生成ファイル。直接編集しないこと。
-- 変更する場合は supabase/migrations/ に新しいマイグレーションを追加し、npm run db:reset を実行する。

ALTER TABLE ONLY "public"."user_auth_identities"
    ADD CONSTRAINT "user_auth_identities_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_auth_identities"
    ADD CONSTRAINT "user_auth_identities_provider_provider_subject_key" UNIQUE ("provider", "provider_subject");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."user_auth_identities"
    ADD CONSTRAINT "user_auth_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
