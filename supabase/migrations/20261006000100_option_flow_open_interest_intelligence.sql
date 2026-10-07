-- Daily option-contract evidence. Price timestamps and OI effective dates are
-- intentionally separate because OCC open interest is consolidated overnight.

create table if not exists public.option_flow_contract_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.option_flow_profiles(id) on delete cascade,
  analysis_run_id uuid references public.option_flow_analysis_runs(id) on delete set null,
  fingerprint text not null,
  contract_symbol text not null,
  underlying_symbol text not null,
  expiry date,
  strike numeric(24, 8),
  option_type text check (option_type is null or option_type in ('C', 'P')),
  snapshot_kind text not null
    check (snapshot_kind in ('imported_flow', 'market_close', 'oi_reconciliation', 'on_demand')),
  price_session_date date,
  open_interest_as_of_date date,
  observed_at timestamptz not null,
  source_id text not null,
  source_reference text,
  open_interest numeric(24, 8),
  reported_open_interest_change numeric(24, 8),
  volume numeric(24, 8),
  last_price numeric(24, 8),
  close_price numeric(24, 8),
  bid numeric(24, 8),
  ask numeric(24, 8),
  midpoint numeric(24, 8),
  implied_volatility numeric(24, 10),
  delta numeric(24, 10),
  underlying_price numeric(24, 8),
  oi_temporal_status text not null
    check (oi_temporal_status in ('verified_prior_close', 'reported_by_source', 'date_not_verified')),
  provenance jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, fingerprint)
);

create index if not exists option_flow_contract_snapshots_profile_contract_idx
  on public.option_flow_contract_snapshots(profile_id, contract_symbol, observed_at desc);
create index if not exists option_flow_contract_snapshots_profile_oi_date_idx
  on public.option_flow_contract_snapshots(profile_id, open_interest_as_of_date desc, contract_symbol);
create index if not exists option_flow_contract_snapshots_underlying_price_date_idx
  on public.option_flow_contract_snapshots(underlying_symbol, price_session_date desc);

create table if not exists public.option_flow_oi_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.option_flow_profiles(id) on delete cascade,
  effective_session_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'complete', 'insufficient_data', 'failed')),
  deterministic_summary jsonb not null default '{}'::jsonb,
  ai_interpretation jsonb not null default '{}'::jsonb,
  ai_model text,
  ai_trace_id text,
  ai_usage jsonb not null default '{}'::jsonb,
  source_manifest jsonb not null default '{}'::jsonb,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, effective_session_date)
);

create index if not exists option_flow_oi_reconciliations_profile_date_idx
  on public.option_flow_oi_reconciliations(profile_id, effective_session_date desc);

drop trigger if exists option_flow_oi_reconciliations_touch_updated_at
  on public.option_flow_oi_reconciliations;
create trigger option_flow_oi_reconciliations_touch_updated_at
  before update on public.option_flow_oi_reconciliations
  for each row execute function public.ntj_option_flow_touch_updated_at();

alter table public.option_flow_contract_snapshots enable row level security;
alter table public.option_flow_oi_reconciliations enable row level security;

drop policy if exists option_flow_contract_snapshots_select_own
  on public.option_flow_contract_snapshots;
create policy option_flow_contract_snapshots_select_own
  on public.option_flow_contract_snapshots
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists option_flow_oi_reconciliations_select_own
  on public.option_flow_oi_reconciliations;
create policy option_flow_oi_reconciliations_select_own
  on public.option_flow_oi_reconciliations
  for select to authenticated
  using (user_id = auth.uid());

revoke insert, update, delete on public.option_flow_contract_snapshots from authenticated;
revoke insert, update, delete on public.option_flow_oi_reconciliations from authenticated;
grant select on public.option_flow_contract_snapshots to authenticated;
grant select on public.option_flow_oi_reconciliations to authenticated;
