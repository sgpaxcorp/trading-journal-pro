-- Trading accounts (multi-account support)
create table if not exists public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  broker text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists trading_accounts_user_id_idx
  on public.trading_accounts(user_id);

alter table public.trading_accounts enable row level security;

create policy "trading_accounts_select_own"
  on public.trading_accounts
  for select
  using (auth.uid() = user_id);

create policy "trading_accounts_insert_own"
  on public.trading_accounts
  for insert
  with check (auth.uid() = user_id);

create policy "trading_accounts_update_own"
  on public.trading_accounts
  for update
  using (auth.uid() = user_id);

create policy "trading_accounts_delete_own"
  on public.trading_accounts
  for delete
  using (auth.uid() = user_id);
