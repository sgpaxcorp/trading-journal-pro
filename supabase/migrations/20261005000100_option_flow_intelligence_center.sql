-- Option Flow Intelligence Center
-- Converts one-off flow reports into persistent, per-symbol research profiles.

create table if not exists public.option_flow_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  security_id uuid references public.investment_securities(id) on delete set null,
  symbol text not null,
  display_name text,
  instrument_type text not null default 'equity'
    check (instrument_type in ('equity', 'etf', 'index', 'fund', 'unknown')),
  exchange text,
  currency text not null default 'USD',
  market_timezone text not null default 'America/New_York',
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  first_analysis_at timestamptz,
  last_analysis_at timestamptz,
  last_flow_session_date date,
  last_market_session_date date,
  current_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, symbol),
  check (symbol = upper(symbol) and symbol ~ '^[A-Z0-9.^=-]{1,24}$')
);

create index if not exists option_flow_profiles_user_status_idx
  on public.option_flow_profiles(user_id, status, updated_at desc);
create index if not exists option_flow_profiles_active_symbol_idx
  on public.option_flow_profiles(symbol, status)
  where status = 'active';

create table if not exists public.option_flow_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.option_flow_profiles(id) on delete cascade,
  legacy_memory_id text,
  version integer not null check (version > 0),
  analysis_mode text not null
    check (analysis_mode in ('today', 'forward_positioning')),
  horizon text not null
    check (horizon in ('today', 'next_session', 'one_week', 'one_month', 'three_months', 'six_months', 'leaps', 'custom')),
  target_date date,
  source_session_date date not null,
  provider text,
  status text not null default 'complete'
    check (status in ('processing', 'complete', 'partial', 'failed')),
  language text not null default 'en' check (language in ('en', 'es')),
  analyst_notes text,
  source_snapshot jsonb not null default '{}'::jsonb,
  deterministic_snapshot jsonb not null default '{}'::jsonb,
  agent_output jsonb not null default '{}'::jsonb,
  data_quality jsonb not null default '{}'::jsonb,
  input_cutoff_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (profile_id, version)
);

create index if not exists option_flow_analysis_runs_profile_created_idx
  on public.option_flow_analysis_runs(profile_id, created_at desc);
create index if not exists option_flow_analysis_runs_user_created_idx
  on public.option_flow_analysis_runs(user_id, created_at desc);

create table if not exists public.option_flow_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.option_flow_profiles(id) on delete cascade,
  analysis_run_id uuid not null references public.option_flow_analysis_runs(id) on delete cascade,
  source_type text not null check (source_type in ('csv', 'xlsx', 'screenshot', 'legacy', 'manual')),
  provider text,
  file_name text,
  storage_path text,
  content_sha256 text,
  source_session_date date,
  row_count integer not null default 0 check (row_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists option_flow_sources_profile_created_idx
  on public.option_flow_sources(profile_id, created_at desc);
create unique index if not exists option_flow_sources_run_hash_idx
  on public.option_flow_sources(analysis_run_id, content_sha256)
  where content_sha256 is not null;

create table if not exists public.option_flow_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.option_flow_profiles(id) on delete cascade,
  analysis_run_id uuid not null references public.option_flow_analysis_runs(id) on delete cascade,
  source_id uuid references public.option_flow_sources(id) on delete set null,
  fingerprint text not null,
  source_session_date date not null,
  occurred_at timestamptz,
  contract_symbol text,
  expiry date,
  strike numeric(24, 8),
  option_type text check (option_type is null or option_type in ('C', 'P')),
  aggressor_side text not null default 'UNKNOWN'
    check (aggressor_side in ('ASK', 'BID', 'MIXED', 'UNKNOWN')),
  underlying_price numeric(24, 8),
  observed_contract_price numeric(24, 8),
  bid numeric(24, 8),
  ask numeric(24, 8),
  size numeric(24, 8),
  premium numeric(30, 8),
  volume numeric(24, 8),
  open_interest numeric(24, 8),
  open_interest_change numeric(24, 8),
  implied_volatility numeric(24, 10),
  delta numeric(24, 10),
  opening_closing_status text not null default 'not_verified'
    check (opening_closing_status in ('opening', 'closing', 'mixed', 'not_verified')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (profile_id, fingerprint)
);

create index if not exists option_flow_events_profile_session_idx
  on public.option_flow_events(profile_id, source_session_date desc, expiry, strike);
create index if not exists option_flow_events_profile_contract_idx
  on public.option_flow_events(profile_id, contract_symbol, occurred_at desc);

-- Market bars are shared across users. One PLTR fetch can serve every PLTR profile.
create table if not exists public.investment_market_daily_bars (
  id uuid primary key default gen_random_uuid(),
  security_id uuid references public.investment_securities(id) on delete set null,
  symbol text not null,
  session_date date not null,
  source_id text not null,
  exchange text,
  market_timezone text not null default 'America/New_York',
  currency text not null default 'USD',
  open numeric(24, 8) not null,
  high numeric(24, 8) not null,
  low numeric(24, 8) not null,
  close numeric(24, 8) not null,
  adjusted_close numeric(24, 8),
  volume numeric(30, 8),
  adjustment_status text not null default 'unadjusted'
    check (adjustment_status in ('unadjusted', 'split_adjusted', 'total_return_adjusted')),
  available_at timestamptz not null,
  source_reference text not null,
  source_payload jsonb not null default '{}'::jsonb,
  observation_sha256 text not null,
  ingested_at timestamptz not null default now(),
  unique (symbol, session_date, source_id),
  unique (observation_sha256),
  check (high >= greatest(open, close, low) and low <= least(open, close, high))
);

create index if not exists investment_market_daily_bars_symbol_date_idx
  on public.investment_market_daily_bars(symbol, session_date desc);

create table if not exists public.option_flow_daily_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.option_flow_profiles(id) on delete cascade,
  market_bar_id uuid not null references public.investment_market_daily_bars(id) on delete restrict,
  session_date date not null,
  deterministic_snapshot jsonb not null default '{}'::jsonb,
  material_change boolean not null default false,
  material_reasons text[] not null default '{}',
  agent_interpretation jsonb not null default '{}'::jsonb,
  agent_status text not null default 'not_required'
    check (agent_status in ('not_required', 'pending', 'complete', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, session_date)
);

create index if not exists option_flow_daily_reviews_profile_date_idx
  on public.option_flow_daily_reviews(profile_id, session_date desc);

create table if not exists public.option_flow_horizon_checkpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.option_flow_profiles(id) on delete cascade,
  analysis_run_id uuid not null references public.option_flow_analysis_runs(id) on delete cascade,
  checkpoint_date date not null,
  checkpoint_kind text not null
    check (checkpoint_kind in ('progress', 'final')),
  status text not null default 'pending'
    check (status in ('pending', 'complete', 'insufficient_data', 'failed')),
  classification text check (
    classification is null or classification in (
      'price_confirms_flow',
      'price_diverges_from_flow',
      'flow_persisted',
      'flow_disappeared',
      'insufficient_evidence',
      'horizon_still_open'
    )
  ),
  source_bar_id uuid references public.investment_market_daily_bars(id) on delete restrict,
  checkpoint_bar_id uuid references public.investment_market_daily_bars(id) on delete restrict,
  deterministic_result jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_run_id, checkpoint_date, checkpoint_kind)
);

create index if not exists option_flow_horizon_due_idx
  on public.option_flow_horizon_checkpoints(status, checkpoint_date)
  where status = 'pending';
create index if not exists option_flow_horizon_profile_idx
  on public.option_flow_horizon_checkpoints(profile_id, checkpoint_date desc);

create table if not exists public.option_flow_agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid references public.option_flow_profiles(id) on delete cascade,
  analysis_run_id uuid references public.option_flow_analysis_runs(id) on delete cascade,
  daily_review_id uuid references public.option_flow_daily_reviews(id) on delete cascade,
  run_type text not null check (run_type in ('analysis', 'contradiction', 'daily_material_review', 'follow_up')),
  status text not null check (status in ('started', 'complete', 'failed')),
  model text,
  trace_id text,
  input_manifest jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  usage jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists option_flow_agent_runs_profile_created_idx
  on public.option_flow_agent_runs(profile_id, started_at desc);

create or replace function public.ntj_option_flow_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists option_flow_profiles_touch_updated_at on public.option_flow_profiles;
create trigger option_flow_profiles_touch_updated_at
  before update on public.option_flow_profiles
  for each row execute function public.ntj_option_flow_touch_updated_at();

drop trigger if exists option_flow_daily_reviews_touch_updated_at on public.option_flow_daily_reviews;
create trigger option_flow_daily_reviews_touch_updated_at
  before update on public.option_flow_daily_reviews
  for each row execute function public.ntj_option_flow_touch_updated_at();

drop trigger if exists option_flow_horizon_touch_updated_at on public.option_flow_horizon_checkpoints;
create trigger option_flow_horizon_touch_updated_at
  before update on public.option_flow_horizon_checkpoints
  for each row execute function public.ntj_option_flow_touch_updated_at();

alter table public.option_flow_profiles enable row level security;
alter table public.option_flow_analysis_runs enable row level security;
alter table public.option_flow_sources enable row level security;
alter table public.option_flow_events enable row level security;
alter table public.investment_market_daily_bars enable row level security;
alter table public.option_flow_daily_reviews enable row level security;
alter table public.option_flow_horizon_checkpoints enable row level security;
alter table public.option_flow_agent_runs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'option_flow_profiles',
    'option_flow_analysis_runs',
    'option_flow_sources',
    'option_flow_events',
    'option_flow_daily_reviews',
    'option_flow_horizon_checkpoints',
    'option_flow_agent_runs'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_own', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      table_name || '_select_own',
      table_name
    );
  end loop;
end;
$$;

revoke insert, update, delete on public.option_flow_profiles from authenticated;
revoke insert, update, delete on public.option_flow_analysis_runs from authenticated;
revoke insert, update, delete on public.option_flow_sources from authenticated;
revoke insert, update, delete on public.option_flow_events from authenticated;
revoke all on public.investment_market_daily_bars from authenticated;
revoke insert, update, delete on public.option_flow_daily_reviews from authenticated;
revoke insert, update, delete on public.option_flow_horizon_checkpoints from authenticated;
revoke insert, update, delete on public.option_flow_agent_runs from authenticated;

grant select on public.option_flow_profiles to authenticated;
grant select on public.option_flow_analysis_runs to authenticated;
grant select on public.option_flow_sources to authenticated;
grant select on public.option_flow_events to authenticated;
grant select on public.option_flow_daily_reviews to authenticated;
grant select on public.option_flow_horizon_checkpoints to authenticated;
grant select on public.option_flow_agent_runs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'option_flow_sources',
  'option_flow_sources',
  false,
  12582912,
  array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Preserve old one-off reports as legacy profile history. New code no longer writes there.
do $$
begin
  if to_regclass('public.option_flow_memory') is not null then
    execute $migration$
      insert into public.option_flow_profiles (
        user_id, symbol, status, first_analysis_at, last_analysis_at, metadata
      )
      select
        user_id,
        upper(regexp_replace(underlying, '[^A-Za-z0-9.^=-]', '', 'g')),
        'active',
        min(created_at),
        max(created_at),
        jsonb_build_object('migratedFrom', 'option_flow_memory')
      from public.option_flow_memory
      where underlying is not null
        and upper(regexp_replace(underlying, '[^A-Za-z0-9.^=-]', '', 'g')) ~ '^[A-Z0-9.^=-]{1,24}$'
      group by user_id, upper(regexp_replace(underlying, '[^A-Za-z0-9.^=-]', '', 'g'))
      on conflict (user_id, symbol) do update set
        first_analysis_at = least(option_flow_profiles.first_analysis_at, excluded.first_analysis_at),
        last_analysis_at = greatest(option_flow_profiles.last_analysis_at, excluded.last_analysis_at),
        updated_at = now()
    $migration$;

    execute $migration$
      insert into public.option_flow_analysis_runs (
        user_id, profile_id, legacy_memory_id, version, analysis_mode, horizon,
        target_date, source_session_date, provider, status, language, analyst_notes,
        source_snapshot, deterministic_snapshot, agent_output, data_quality,
        input_cutoff_at, completed_at, created_at
      )
      select
        memory.user_id,
        profile.id,
        memory.id::text,
        row_number() over (partition by profile.id order by memory.created_at, memory.id)::integer,
        case when lower(coalesce(memory.trade_intent, '')) in ('swing') then 'forward_positioning' else 'today' end,
        case when lower(coalesce(memory.trade_intent, '')) in ('swing') then 'one_month' else 'next_session' end,
        null,
        memory.created_at::date,
        memory.provider,
        'complete',
        'en',
        memory.notes,
        jsonb_build_object('legacy', true, 'tradeIntent', memory.trade_intent),
        jsonb_build_object('keyLevels', coalesce(memory.key_levels, '[]'::jsonb), 'keyTrades', coalesce(memory.key_trades, '[]'::jsonb)),
        jsonb_build_object('summary', memory.summary),
        '{}'::jsonb,
        memory.created_at,
        memory.created_at,
        memory.created_at
      from public.option_flow_memory memory
      join public.option_flow_profiles profile
        on profile.user_id = memory.user_id
       and profile.symbol = upper(regexp_replace(memory.underlying, '[^A-Za-z0-9.^=-]', '', 'g'))
      where not exists (
        select 1 from public.option_flow_analysis_runs run
        where run.legacy_memory_id = memory.id::text
      )
    $migration$;
  end if;
end;
$$;

notify pgrst, 'reload schema';
