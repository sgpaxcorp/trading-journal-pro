-- SnapTrade integration: user credentials + authorizations

create table if not exists public.snaptrade_users (
  user_id uuid primary key,
  snaptrade_user_id text not null,
  snaptrade_user_secret text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.snaptrade_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  snaptrade_user_id text not null,
  authorization_id text not null,
  brokerage text null,
  status text null,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists snaptrade_users_user_id_unique on public.snaptrade_users(user_id);
create index if not exists snaptrade_authorizations_user_id_idx on public.snaptrade_authorizations(user_id);
create index if not exists snaptrade_authorizations_auth_idx on public.snaptrade_authorizations(authorization_id);

alter table public.snaptrade_users enable row level security;
alter table public.snaptrade_authorizations enable row level security;

-- snaptrade_users (owner-only)
drop policy if exists "snaptrade_users_select_own" on public.snaptrade_users;
create policy "snaptrade_users_select_own"
  on public.snaptrade_users
  for select
  using (auth.uid() = user_id);

drop policy if exists "snaptrade_users_insert_own" on public.snaptrade_users;
create policy "snaptrade_users_insert_own"
  on public.snaptrade_users
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "snaptrade_users_update_own" on public.snaptrade_users;
create policy "snaptrade_users_update_own"
  on public.snaptrade_users
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "snaptrade_users_delete_own" on public.snaptrade_users;
create policy "snaptrade_users_delete_own"
  on public.snaptrade_users
  for delete
  using (auth.uid() = user_id);

-- snaptrade_authorizations (owner-only)
drop policy if exists "snaptrade_auth_select_own" on public.snaptrade_authorizations;
create policy "snaptrade_auth_select_own"
  on public.snaptrade_authorizations
  for select
  using (auth.uid() = user_id);

drop policy if exists "snaptrade_auth_insert_own" on public.snaptrade_authorizations;
create policy "snaptrade_auth_insert_own"
  on public.snaptrade_authorizations
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "snaptrade_auth_update_own" on public.snaptrade_authorizations;
create policy "snaptrade_auth_update_own"
  on public.snaptrade_authorizations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "snaptrade_auth_delete_own" on public.snaptrade_authorizations;
create policy "snaptrade_auth_delete_own"
  on public.snaptrade_authorizations
  for delete
  using (auth.uid() = user_id);
