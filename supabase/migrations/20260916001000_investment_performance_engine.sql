-- Reproducible portfolio and partner performance persistence.
-- Authoritative returns are produced by deterministic financial code, never by an LLM.

create extension if not exists pgcrypto;

create table if not exists public.investment_return_methodologies (
  methodology_key text primary key,
  display_name text not null,
  purpose text not null,
  documented_formula text not null,
  cash_flow_treatment text not null,
  annualization_policy text not null,
  implementation_version text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.investment_return_methodologies (
  methodology_key, display_name, purpose, documented_formula,
  cash_flow_treatment, annualization_policy, implementation_version
) values
  (
    'TWR_GEOMETRIC', 'Time-Weighted Return',
    'Measure portfolio strategy performance while neutralizing external capital-flow timing.',
    'Product of (1 + each subperiod return) minus 1, with subperiod boundaries at external cash flows.',
    'Contributions, withdrawals, and distributions are external cash flows and are not investment return.',
    'Annualize only when the measured interval is at least 365 calendar days and disclose the day count.',
    'performance-engine-v1'
  ),
  (
    'XIRR_ACTUAL_DATES', 'Money-Weighted Return (XIRR)',
    'Measure an individual partner experience using the amount and actual date of every cash flow.',
    'Solve for r where the dated cash-flow net present value equals zero using a deterministic numerical method.',
    'Contributions are negative investor cash flows; withdrawals and distributions are positive investor cash flows; ending value is the terminal positive cash flow.',
    'The solved rate is annual by definition; display only when a valid numerical solution exists.',
    'performance-engine-v1'
  ),
  (
    'PERIOD_CAPITAL_RECONCILIATION', 'Period Capital Reconciliation',
    'Reconcile beginning capital, external flows, investment result, fees, expenses, distributions, and ending capital.',
    'Ending = Beginning + Contributions - Withdrawals - Distributions + Gross investment result - Fees - Expenses.',
    'Capital flows remain separate from investment results.',
    'No annualization is performed by this reconciliation.',
    'performance-engine-v1'
  )
on conflict (methodology_key) do update
set display_name = excluded.display_name,
    purpose = excluded.purpose,
    documented_formula = excluded.documented_formula,
    cash_flow_treatment = excluded.cash_flow_treatment,
    annualization_policy = excluded.annualization_policy,
    implementation_version = excluded.implementation_version;

create table if not exists public.investment_benchmarks (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  benchmark_name text not null check (char_length(btrim(benchmark_name)) between 1 and 160),
  benchmark_symbol text,
  benchmark_type text not null check (
    benchmark_type in ('MARKET_INDEX', 'BLENDED_INDEX', 'STRATEGY_INDEX', 'ABSOLUTE_OBJECTIVE', 'OTHER')
  ),
  methodology text not null,
  component_configuration jsonb not null default '{}'::jsonb,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  return_type text not null check (return_type in ('PRICE', 'TOTAL_RETURN', 'NET_TOTAL_RETURN', 'CUSTOM')),
  data_source_id text references public.investment_data_sources(source_id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pool_id, benchmark_name)
);

create table if not exists public.investment_benchmark_observations (
  id uuid primary key default gen_random_uuid(),
  benchmark_id uuid not null references public.investment_benchmarks(id) on delete restrict,
  observation_date date not null,
  observation_value numeric(38, 12),
  period_return numeric(30, 12),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  source_document text not null,
  source_reporting_period text,
  source_publication_date date,
  source_retrieved_at timestamptz not null,
  source_units text not null,
  input_sha256 text not null,
  created_at timestamptz not null default now(),
  unique (benchmark_id, observation_date, input_sha256),
  check (observation_value is not null or period_return is not null)
);

create table if not exists public.investment_portfolio_performance_runs (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  book_id uuid not null references public.investment_accounting_books(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  beginning_nav_snapshot_id uuid references public.investment_fund_nav_snapshots(id) on delete restrict,
  ending_nav_snapshot_id uuid not null references public.investment_fund_nav_snapshots(id) on delete restrict,
  beginning_nav numeric(30, 8) not null check (beginning_nav >= 0),
  ending_nav numeric(30, 8) not null check (ending_nav >= 0),
  contributions numeric(30, 8) not null default 0 check (contributions >= 0),
  withdrawals numeric(30, 8) not null default 0 check (withdrawals >= 0),
  distributions numeric(30, 8) not null default 0 check (distributions >= 0),
  gross_investment_result numeric(30, 8) not null,
  fees numeric(30, 8) not null default 0 check (fees >= 0),
  expenses numeric(30, 8) not null default 0 check (expenses >= 0),
  net_investment_result numeric(30, 8) not null,
  time_weighted_return numeric(30, 12),
  period_return numeric(30, 12),
  since_inception_return numeric(30, 12),
  annualized_return numeric(30, 12),
  day_count integer not null check (day_count >= 0),
  methodology_key text not null references public.investment_return_methodologies(methodology_key) on delete restrict,
  calculation_formula text not null,
  calculation_inputs jsonb not null,
  cash_flow_manifest jsonb not null,
  calculation_version text not null,
  calculated_at timestamptz not null default now(),
  calculated_by uuid not null references auth.users(id) on delete restrict,
  calculation_engine text not null default 'DETERMINISTIC_CODE' check (calculation_engine = 'DETERMINISTIC_CODE'),
  input_snapshot_sha256 text not null,
  output_sha256 text not null unique,
  created_at timestamptz not null default now(),
  constraint investment_portfolio_performance_book_pool_fk
    foreign key (book_id, pool_id)
    references public.investment_accounting_books(id, pool_id)
    on delete restrict,
  constraint investment_portfolio_performance_beginning_nav_pool_fk
    foreign key (beginning_nav_snapshot_id, pool_id)
    references public.investment_fund_nav_snapshots(id, pool_id)
    on delete restrict,
  constraint investment_portfolio_performance_ending_nav_pool_fk
    foreign key (ending_nav_snapshot_id, pool_id)
    references public.investment_fund_nav_snapshots(id, pool_id)
    on delete restrict,
  unique (id, pool_id),
  unique (pool_id, period_start, period_end, calculation_version, input_snapshot_sha256),
  check (period_end >= period_start),
  check (day_count = period_end - period_start),
  check (net_investment_result = gross_investment_result - fees - expenses),
  check (
    ending_nav = beginning_nav + contributions - withdrawals - distributions + net_investment_result
  ),
  check (annualized_return is null or day_count >= 365)
);

create table if not exists public.investment_partner_performance_runs (
  id uuid primary key default gen_random_uuid(),
  portfolio_performance_run_id uuid not null references public.investment_portfolio_performance_runs(id) on delete restrict,
  pool_id uuid not null references public.neuro_capital_pools(id) on delete restrict,
  partner_id uuid not null,
  capital_account_id uuid not null,
  period_start date not null,
  period_end date not null,
  beginning_capital numeric(30, 8) not null check (beginning_capital >= 0),
  ending_capital numeric(30, 8) not null check (ending_capital >= 0),
  contributions numeric(30, 8) not null default 0 check (contributions >= 0),
  withdrawals numeric(30, 8) not null default 0 check (withdrawals >= 0),
  distributions numeric(30, 8) not null default 0 check (distributions >= 0),
  gross_investment_result numeric(30, 8) not null,
  allocated_fees numeric(30, 8) not null default 0 check (allocated_fees >= 0),
  allocated_expenses numeric(30, 8) not null default 0 check (allocated_expenses >= 0),
  net_investment_result numeric(30, 8) not null,
  beginning_units numeric(38, 12) not null check (beginning_units >= 0),
  ending_units numeric(38, 12) not null check (ending_units >= 0),
  ending_nav_per_unit numeric(30, 12) check (ending_nav_per_unit is null or ending_nav_per_unit >= 0),
  period_return numeric(30, 12),
  money_weighted_return numeric(30, 12),
  since_inception_return numeric(30, 12),
  annualized_return numeric(30, 12),
  day_count integer not null check (day_count >= 0),
  methodology_key text not null references public.investment_return_methodologies(methodology_key) on delete restrict,
  calculation_formula text not null,
  calculation_inputs jsonb not null,
  dated_cash_flows jsonb not null,
  calculation_version text not null,
  calculated_at timestamptz not null default now(),
  calculation_engine text not null default 'DETERMINISTIC_CODE' check (calculation_engine = 'DETERMINISTIC_CODE'),
  input_snapshot_sha256 text not null,
  output_sha256 text not null unique,
  created_at timestamptz not null default now(),
  constraint investment_partner_performance_partner_fk
    foreign key (partner_id, pool_id)
    references public.investment_partners(id, pool_id)
    on delete restrict,
  constraint investment_partner_performance_account_fk
    foreign key (capital_account_id, pool_id)
    references public.neuro_capital_accounts(id, pool_id)
    on delete restrict,
  constraint investment_partner_performance_portfolio_pool_fk
    foreign key (portfolio_performance_run_id, pool_id)
    references public.investment_portfolio_performance_runs(id, pool_id)
    on delete restrict,
  unique (capital_account_id, period_start, period_end, calculation_version, input_snapshot_sha256),
  check (period_end >= period_start),
  check (day_count = period_end - period_start),
  check (net_investment_result = gross_investment_result - allocated_fees - allocated_expenses),
  check (
    ending_capital = beginning_capital + contributions - withdrawals - distributions + net_investment_result
  ),
  check (annualized_return is null or day_count >= 365)
);

create table if not exists public.investment_performance_attribution_components (
  id uuid primary key default gen_random_uuid(),
  portfolio_performance_run_id uuid not null references public.investment_portfolio_performance_runs(id) on delete restrict,
  component_type text not null check (
    component_type in (
      'SECURITY_SELECTION', 'DIVIDENDS', 'INTEREST', 'CASH', 'CONCENTRATION',
      'SECTOR_EXPOSURE', 'CURRENCY', 'FEES', 'EXPENSES',
      'REALIZED_GAINS', 'UNREALIZED_GAINS', 'UNEXPLAINED_RESIDUAL'
    )
  ),
  component_key text not null,
  contribution_amount numeric(30, 8),
  contribution_return numeric(30, 12),
  calculation_method text not null,
  formula text not null,
  formula_inputs jsonb not null,
  evidence_references jsonb not null default '[]'::jsonb,
  interpretation_limitations text not null default 'Attribution is accounting decomposition, not proof of economic causality.',
  created_at timestamptz not null default now(),
  unique (portfolio_performance_run_id, component_type, component_key)
);

create table if not exists public.investment_benchmark_comparisons (
  id uuid primary key default gen_random_uuid(),
  portfolio_performance_run_id uuid not null references public.investment_portfolio_performance_runs(id) on delete restrict,
  benchmark_id uuid not null references public.investment_benchmarks(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  portfolio_return numeric(30, 12),
  benchmark_return numeric(30, 12),
  excess_return numeric(30, 12),
  comparison_methodology text not null,
  formula text not null,
  formula_inputs jsonb not null,
  source_observation_ids uuid[] not null default '{}',
  calculation_version text not null,
  calculated_at timestamptz not null default now(),
  output_sha256 text not null unique,
  created_at timestamptz not null default now(),
  unique (portfolio_performance_run_id, benchmark_id),
  check (period_end >= period_start),
  check (
    excess_return is null
    or (portfolio_return is not null and benchmark_return is not null and excess_return = portfolio_return - benchmark_return)
  )
);

create table if not exists public.investment_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  portfolio_performance_run_id uuid not null references public.investment_portfolio_performance_runs(id) on delete restrict,
  decision text not null check (decision in ('VERIFIED', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  review_notes text not null check (char_length(btrim(review_notes)) between 1 and 4000),
  evidence jsonb not null default '[]'::jsonb,
  reviewed_at timestamptz not null default now()
);

create index if not exists investment_portfolio_performance_period_idx
  on public.investment_portfolio_performance_runs(pool_id, period_end desc);
create index if not exists investment_partner_performance_period_idx
  on public.investment_partner_performance_runs(partner_id, period_end desc);
create index if not exists investment_benchmark_observations_date_idx
  on public.investment_benchmark_observations(benchmark_id, observation_date desc);

create or replace function public.prevent_investment_performance_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Performance history is immutable; create a superseding calculation';
end;
$$;

create or replace function public.record_investment_performance_review(
  p_actor_user_id uuid,
  p_portfolio_performance_run_id uuid,
  p_decision text,
  p_review_notes text,
  p_evidence jsonb default '[]'::jsonb
)
returns public.investment_performance_reviews
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_review public.investment_performance_reviews;
begin
  if not public.investment_user_has_permission(p_actor_user_id, 'accounting.modify')
    and not public.investment_user_has_permission(p_actor_user_id, 'reports.approve') then
    raise exception 'Accounting verification or report approval permission required';
  end if;
  if not exists (select 1 from auth.users where id = p_actor_user_id) then
    raise exception 'Performance reviewer must be an authenticated human user';
  end if;
  if p_decision not in ('VERIFIED', 'APPROVED', 'REJECTED', 'SUPERSEDED') then
    raise exception 'Invalid performance-review decision';
  end if;
  if p_decision = 'APPROVED' and not public.investment_user_has_permission(p_actor_user_id, 'reports.approve') then
    raise exception 'Report approval permission required to approve performance';
  end if;
  if not exists (
    select 1 from public.investment_portfolio_performance_runs
    where id = p_portfolio_performance_run_id
  ) then
    raise exception 'Portfolio performance run not found';
  end if;

  insert into public.investment_performance_reviews (
    portfolio_performance_run_id, decision, reviewer_user_id, review_notes, evidence
  ) values (
    p_portfolio_performance_run_id, p_decision, p_actor_user_id,
    left(btrim(p_review_notes), 4000), coalesce(p_evidence, '[]'::jsonb)
  ) returning * into created_review;
  return created_review;
end;
$$;

do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'investment_benchmark_observations',
    'investment_portfolio_performance_runs',
    'investment_partner_performance_runs',
    'investment_performance_attribution_components',
    'investment_benchmark_comparisons',
    'investment_performance_reviews'
  ]
  loop
    trigger_name := table_name || '_immutable';
    execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.prevent_investment_performance_history_mutation()',
      trigger_name, table_name
    );
  end loop;
end;
$$;

drop trigger if exists investment_benchmarks_set_updated_at on public.investment_benchmarks;
create trigger investment_benchmarks_set_updated_at
  before update on public.investment_benchmarks
  for each row execute function public.set_updated_at();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_return_methodologies',
    'investment_benchmarks',
    'investment_benchmark_observations',
    'investment_portfolio_performance_runs',
    'investment_partner_performance_runs',
    'investment_performance_attribution_components',
    'investment_benchmark_comparisons',
    'investment_performance_reviews'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke insert, update, delete on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.investment_current_user_has_permission(''accounting.view'') or public.investment_current_user_has_permission(''portfolio.view''))',
      table_name || '_read_internal', table_name
    );
  end loop;
end;
$$;

revoke all on function public.record_investment_performance_review(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_investment_performance_review(uuid, uuid, text, text, jsonb)
  to service_role;

notify pgrst, 'reload schema';
