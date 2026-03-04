create table if not exists public.broker_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  broker text not null,
  access_token text,
  refresh_token text,
  scope text,
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists broker_oauth_connections_user_broker_unique
  on public.broker_oauth_connections(user_id, broker);

alter table public.broker_oauth_connections enable row level security;

drop policy if exists "broker_oauth_connections_select_own" on public.broker_oauth_connections;
create policy "broker_oauth_connections_select_own"
  on public.broker_oauth_connections
  for select
  using (auth.uid() = user_id);

drop policy if exists "broker_oauth_connections_insert_own" on public.broker_oauth_connections;
create policy "broker_oauth_connections_insert_own"
  on public.broker_oauth_connections
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "broker_oauth_connections_update_own" on public.broker_oauth_connections;
create policy "broker_oauth_connections_update_own"
  on public.broker_oauth_connections
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "broker_oauth_connections_delete_own" on public.broker_oauth_connections;
create policy "broker_oauth_connections_delete_own"
  on public.broker_oauth_connections
  for delete
  using (auth.uid() = user_id);
