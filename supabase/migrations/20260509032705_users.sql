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

create trigger handle_updated_at
  before update on public.users
  for each row execute procedure extensions.moddatetime(updated_at);
