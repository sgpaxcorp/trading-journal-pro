-- Broker Order History (ToS) - imports + events

create table if not exists public.broker_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id text not null,
  broker text not null,
  import_type text not null,
  source_tz text null,
  filename text null,
  file_hash text null,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.broker_order_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id text not null,
  broker text not null,
  import_id uuid not null references public.broker_imports(id) on delete cascade,
  date date not null,
  ts_utc timestamptz not null,
  ts_source text null,
  source_tz text null,
  event_type text not null,
  status text null,
  side text null,
  pos_effect text null,
  qty numeric null,
  symbol text null,
  instrument_key text not null,
  asset_kind text null,
  order_type text null,
  limit_price numeric null,
  stop_price numeric null,
  oco_id text null,
  replace_id text null,
  raw jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists broker_order_events_user_account_date_idx
  on public.broker_order_events(user_id, account_id, date);

create index if not exists broker_order_events_user_account_instrument_idx
  on public.broker_order_events(user_id, account_id, instrument_key, ts_utc);

create index if not exists broker_imports_user_account_created_idx
  on public.broker_imports(user_id, account_id, created_at desc);

alter table public.broker_imports enable row level security;
alter table public.broker_order_events enable row level security;

create policy "broker_imports_select_own"
  on public.broker_imports
  for select
  using (auth.uid() = user_id);

create policy "broker_imports_insert_own"
  on public.broker_imports
  for insert
  with check (auth.uid() = user_id);

create policy "broker_imports_update_own"
  on public.broker_imports
  for update
  using (auth.uid() = user_id);

create policy "broker_imports_delete_own"
  on public.broker_imports
  for delete
  using (auth.uid() = user_id);

create policy "broker_order_events_select_own"
  on public.broker_order_events
  for select
  using (auth.uid() = user_id);

create policy "broker_order_events_insert_own"
  on public.broker_order_events
  for insert
  with check (auth.uid() = user_id);

create policy "broker_order_events_update_own"
  on public.broker_order_events
  for update
  using (auth.uid() = user_id);

create policy "broker_order_events_delete_own"
  on public.broker_order_events
  for delete
  using (auth.uid() = user_id);
