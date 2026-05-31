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

-- JWT の subject からアプリの users.id を解決（テーブル作成後に定義）
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

-- users の RLS（rls.is_own は上記関数定義後）
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
