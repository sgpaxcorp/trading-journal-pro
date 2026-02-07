-- Trading Accounts (per-broker journals)
-- Run this in Supabase SQL editor.

-- 0) Ensure UUID generator
create extension if not exists "pgcrypto";

-- 1) Trading accounts table
create table if not exists public.trading_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  broker text,
  is_default boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists trading_accounts_user_idx
  on public.trading_accounts(user_id);

create unique index if not exists trading_accounts_user_default_idx
  on public.trading_accounts(user_id)
  where is_default = true;

-- 2) Add account_id to key tables
alter table public.journal_entries add column if not exists account_id uuid references public.trading_accounts(id) on delete set null;
alter table public.journal_trades add column if not exists account_id uuid references public.trading_accounts(id) on delete set null;
alter table public.daily_snapshots add column if not exists account_id uuid references public.trading_accounts(id) on delete set null;
alter table public.cashflows add column if not exists account_id uuid references public.trading_accounts(id) on delete set null;
alter table public.growth_plans add column if not exists account_id uuid references public.trading_accounts(id) on delete set null;

create index if not exists journal_entries_account_idx on public.journal_entries(account_id);
create index if not exists journal_trades_account_idx on public.journal_trades(account_id);
create index if not exists daily_snapshots_account_idx on public.daily_snapshots(account_id);
create index if not exists cashflows_account_idx on public.cashflows(account_id);
create index if not exists growth_plans_account_idx on public.growth_plans(account_id);

-- Uniques for upserts with account_id
create unique index if not exists journal_entries_user_date_account_uniq
  on public.journal_entries(user_id, date, account_id);

create unique index if not exists daily_snapshots_user_date_account_uniq
  on public.daily_snapshots(user_id, date, account_id);

create unique index if not exists growth_plans_user_account_uniq
  on public.growth_plans(user_id, account_id);

-- 3) Add active account to user_preferences
alter table public.user_preferences add column if not exists active_account_id uuid references public.trading_accounts(id) on delete set null;

-- 4) Backfill default account for existing users (based on journal_entries)
insert into public.trading_accounts (user_id, name, broker, is_default)
select distinct e.user_id, 'Primary', null, true
from public.journal_entries e
where not exists (
  select 1 from public.trading_accounts t
  where t.user_id = e.user_id and t.is_default = true
);

-- 5) Attach existing data to default account
update public.journal_entries e
set account_id = t.id
from public.trading_accounts t
where t.user_id = e.user_id and t.is_default = true and e.account_id is null;

update public.journal_trades jt
set account_id = t.id
from public.trading_accounts t
where t.user_id = jt.user_id and t.is_default = true and jt.account_id is null;

update public.daily_snapshots ds
set account_id = t.id
from public.trading_accounts t
where t.user_id = ds.user_id and t.is_default = true and ds.account_id is null;

update public.cashflows cf
set account_id = t.id
from public.trading_accounts t
where t.user_id = cf.user_id and t.is_default = true and cf.account_id is null;

update public.growth_plans gp
set account_id = t.id
from public.trading_accounts t
where t.user_id = gp.user_id and t.is_default = true and gp.account_id is null;

-- 6) Set active_account_id in preferences
update public.user_preferences up
set active_account_id = t.id
from public.trading_accounts t
where t.user_id = up.user_id and t.is_default = true and up.active_account_id is null;
