create extension if not exists pgcrypto;

create table if not exists public.analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id text not null default '',
  as_of_date date not null,
  range_start date null,
  range_end date null,
  sessions_count integer not null default 0,
  trades_count integer not null default 0,
  total_pnl numeric not null default 0,
  avg_pnl numeric not null default 0,
  median_pnl numeric null,
  win_rate numeric not null default 0,
  profit_factor numeric null,
  expectancy numeric null,
  pnl_std numeric null,
  best_day text null,
  best_day_pnl numeric null,
  worst_day text null,
  worst_day_pnl numeric null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_edges (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  account_id text not null default '',
  as_of_date date not null,
  symbol text null,
  kind text null,
  side text null,
  dow integer null,
  time_bucket text null,
  dte_bucket text null,
  plan_respected boolean null,
  has_fomo boolean null,
  has_revenge boolean null,
  n_sessions integer not null default 0,
  n_trades integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  win_rate numeric not null default 0,
  win_rate_shrunk numeric not null default 0,
  avg_pnl numeric not null default 0,
  expectancy numeric null,
  profit_factor numeric null,
  avg_win numeric null,
  avg_loss numeric null,
  edge_score numeric not null default 0,
  confidence numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.analytics_snapshots add column if not exists account_id text;
alter table public.analytics_edges add column if not exists account_id text;

do $$
begin
  if to_regclass('public.analytics_snapshots') is not null then
    alter table public.analytics_snapshots alter column account_id type text using coalesce(account_id::text, '');
    update public.analytics_snapshots set account_id = '' where account_id is null;
    alter table public.analytics_snapshots alter column account_id set default '';
    alter table public.analytics_snapshots alter column account_id set not null;
    alter table public.analytics_snapshots add column if not exists created_at timestamptz not null default now();
    alter table public.analytics_snapshots add column if not exists updated_at timestamptz not null default now();
  end if;

  if to_regclass('public.analytics_edges') is not null then
    alter table public.analytics_edges alter column account_id type text using coalesce(account_id::text, '');
    update public.analytics_edges set account_id = '' where account_id is null;
    alter table public.analytics_edges alter column account_id set default '';
    alter table public.analytics_edges alter column account_id set not null;
    alter table public.analytics_edges add column if not exists created_at timestamptz not null default now();
  end if;
end $$;

create unique index if not exists analytics_snapshots_user_account_range_uidx
  on public.analytics_snapshots(user_id, account_id, as_of_date, range_start, range_end)
  nulls not distinct;

create index if not exists analytics_snapshots_user_account_asof_idx
  on public.analytics_snapshots(user_id, account_id, as_of_date desc);

create index if not exists analytics_edges_user_account_asof_score_idx
  on public.analytics_edges(user_id, account_id, as_of_date, edge_score desc);

create index if not exists analytics_edges_user_account_asof_symbol_idx
  on public.analytics_edges(user_id, account_id, as_of_date, symbol);

alter table public.analytics_snapshots enable row level security;
alter table public.analytics_edges enable row level security;

do $$
begin
  if to_regclass('public.journal_entries') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'journal_entries' and column_name = 'date'
    )
  then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'journal_entries' and column_name = 'account_id'
    ) then
      execute 'create index if not exists journal_entries_user_account_date_idx on public.journal_entries(user_id, account_id, date)';
    else
      execute 'create index if not exists journal_entries_user_date_idx on public.journal_entries(user_id, date)';
    end if;
  end if;

  if to_regclass('public.journal_trades') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'journal_trades' and column_name = 'journal_date'
    )
  then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'journal_trades' and column_name = 'account_id'
    ) then
      execute 'create index if not exists journal_trades_user_account_journal_date_idx on public.journal_trades(user_id, account_id, journal_date)';
    else
      execute 'create index if not exists journal_trades_user_journal_date_idx on public.journal_trades(user_id, journal_date)';
    end if;
  end if;

  if to_regclass('public.daily_snapshots') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'daily_snapshots' and column_name = 'date'
    )
  then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'daily_snapshots' and column_name = 'account_id'
    ) then
      execute 'create index if not exists daily_snapshots_user_account_date_idx on public.daily_snapshots(user_id, account_id, date)';
    else
      execute 'create index if not exists daily_snapshots_user_date_idx on public.daily_snapshots(user_id, date)';
    end if;
  end if;

  if to_regclass('public.cashflows') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'cashflows' and column_name = 'date'
    )
  then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'cashflows' and column_name = 'account_id'
    ) then
      execute 'create index if not exists cashflows_user_account_date_idx on public.cashflows(user_id, account_id, date)';
    else
      execute 'create index if not exists cashflows_user_date_idx on public.cashflows(user_id, date)';
    end if;
  end if;

  if to_regclass('public.ntj_cashflows') is not null
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'ntj_cashflows' and column_name = 'date'
    )
  then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'ntj_cashflows' and column_name = 'account_id'
    ) then
      execute 'create index if not exists ntj_cashflows_user_account_date_idx on public.ntj_cashflows(user_id, account_id, date)';
    else
      execute 'create index if not exists ntj_cashflows_user_date_idx on public.ntj_cashflows(user_id, date)';
    end if;
  end if;
end $$;
