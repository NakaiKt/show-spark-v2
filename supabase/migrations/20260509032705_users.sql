-- テーブル定義
create table public.users (
  id         uuid        primary key references auth.users(id) on delete cascade,
  name       text        not null,
  email      text        not null unique,
  avatar_url text,       -- nullable: Supabase Storage の公開 URL
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS 有効化
alter table public.users enable row level security;

-- 自分のレコードのみ参照可（将来の「共有」機能では select ポリシーを追加する）
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

-- updated_at 自動更新（shared.sql の moddatetime 拡張を使用）
create trigger handle_updated_at
  before update on public.users
  for each row execute procedure moddatetime(updated_at);

-- Supabase Auth でサインアップした際に自動でレコードを生成する
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
