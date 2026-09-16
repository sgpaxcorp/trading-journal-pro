-- Institutional investment data foundation.
-- Raw observations and published calculations are append-only. User workflow
-- tables remain mutable only through authenticated server routes.

create extension if not exists pgcrypto;

create table if not exists public.investment_data_sources (
  source_id text primary key,
  display_name text not null,
  source_type text not null check (source_type in ('regulator', 'exchange', 'market_data', 'macro', 'user_document', 'derived')),
  terms_category text not null,
  redistribution_permitted boolean not null default false,
  storage_permitted boolean not null default false,
  derived_calculations_permitted boolean not null default false,
  investor_display_permitted boolean not null default false,
  terms_url text,
  terms_checked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.investment_data_sources (
  source_id, display_name, source_type, terms_category,
  redistribution_permitted, storage_permitted,
  derived_calculations_permitted, investor_display_permitted,
  terms_url, terms_checked_at
)
values
  (
    'sec_edgar', 'SEC EDGAR', 'regulator', 'US government public filing data',
    true, true, true, true,
    'https://www.sec.gov/search-filings/edgar-application-programming-interfaces', now()
  ),
  (
    'internal_calculation', 'NeuroTrader deterministic calculation engine', 'derived', 'Internal derived data',
    false, true, true, true, null, now()
  ),
  (
    'user_document', 'User-provided research document', 'user_document', 'User-controlled content',
    false, true, true, true, null, now()
  ),
  (
    'fred', 'Federal Reserve Economic Data', 'macro', 'Government and third-party series; series-specific review required',
    false, true, true, true, 'https://fred.stlouisfed.org/legal/', now()
  ),
  (
    'bls', 'US Bureau of Labor Statistics', 'macro', 'US government public data',
    true, true, true, true, 'https://www.bls.gov/bls/linksite.htm', now()
  ),
  (
    'bea', 'US Bureau of Economic Analysis', 'macro', 'US government public data',
    true, true, true, true, 'https://apps.bea.gov/API/signup/', now()
  ),
  (
    'treasury_fiscal_data', 'US Treasury Fiscal Data', 'macro', 'US government public data',
    true, true, true, true, 'https://fiscaldata.treasury.gov/api-documentation/', now()
  ),
  (
    'openfigi', 'OpenFIGI', 'market_data', 'External service; production rights review required',
    false, false, false, false, 'https://www.openfigi.com/api', null
  ),
  (
    'alpha_vantage', 'Alpha Vantage', 'market_data', 'Commercial data; plan-specific rights review required',
    false, false, false, false, 'https://www.alphavantage.co/terms_of_service/', null
  ),
  (
    'twelve_data', 'Twelve Data', 'market_data', 'Commercial data; plan-specific rights review required',
    false, false, false, false, 'https://twelvedata.com/terms', null
  ),
  (
    'fmp', 'Financial Modeling Prep', 'market_data', 'Commercial data; plan-specific rights review required',
    false, false, false, false, 'https://site.financialmodelingprep.com/terms-of-service', null
  ),
  (
    'yahoo_finance', 'Yahoo Finance', 'market_data', 'External display data; production rights unverified',
    false, false, false, false, 'https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apiforydn/index.html', null
  ),
  (
    'nasdaq', 'Nasdaq', 'market_data', 'External market data; production rights unverified',
    false, false, false, false, 'https://www.nasdaq.com/terms-of-use', null
  )
on conflict (source_id) do nothing;

create table if not exists public.investment_companies (
  id uuid primary key default gen_random_uuid(),
  cik text unique check (cik is null or cik ~ '^[0-9]{10}$'),
  legal_name text not null,
  sector text,
  industry text,
  country_code text,
  reporting_currency text,
  fiscal_year_end text,
  sic_code text,
  status text not null default 'active' check (status in ('active', 'delisted', 'merged', 'bankrupt', 'inactive')),
  ipo_date date,
  delisting_date date,
  successor_company_id uuid references public.investment_companies(id) on delete set null,
  source_id text references public.investment_data_sources(source_id),
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_securities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.investment_companies(id) on delete restrict,
  security_type text not null default 'common_stock',
  security_name text,
  exchange text,
  currency text,
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'delisted', 'merged', 'inactive')),
  first_trade_date date,
  last_trade_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists investment_securities_one_primary_idx
  on public.investment_securities(company_id)
  where is_primary and status = 'active';

create table if not exists public.investment_security_identifiers (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.investment_securities(id) on delete restrict,
  identifier_type text not null check (identifier_type in ('ticker', 'cusip', 'isin', 'figi', 'composite_figi', 'share_class_figi', 'other')),
  identifier_value text not null,
  exchange text,
  valid_from date,
  valid_to date,
  source_id text not null references public.investment_data_sources(source_id),
  recorded_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create unique index if not exists investment_security_identifiers_version_idx
  on public.investment_security_identifiers(
    security_id, identifier_type, identifier_value, coalesce(exchange, ''), coalesce(valid_from, date '0001-01-01')
  );
create index if not exists investment_security_identifiers_lookup_idx
  on public.investment_security_identifiers(identifier_type, upper(identifier_value), valid_from, valid_to);

create table if not exists public.investment_ingestion_responses (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.investment_data_sources(source_id),
  request_key text not null,
  request_url text not null,
  http_status integer not null,
  etag text,
  last_modified text,
  content_type text,
  content_sha256 text not null,
  payload jsonb,
  object_path text,
  fetched_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  unique (source_id, request_key, content_sha256),
  check (payload is not null or object_path is not null)
);

create index if not exists investment_ingestion_responses_request_idx
  on public.investment_ingestion_responses(source_id, request_key, fetched_at desc);

create table if not exists public.investment_ingestion_checkpoints (
  source_id text not null references public.investment_data_sources(source_id),
  dataset_key text not null,
  cursor_value text,
  etag text,
  last_modified text,
  last_success_at timestamptz,
  next_run_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (source_id, dataset_key)
);

create table if not exists public.investment_ingestion_leases (
  source_id text not null references public.investment_data_sources(source_id),
  dataset_key text not null,
  lease_owner uuid,
  locked_until timestamptz not null default '-infinity'::timestamptz,
  updated_at timestamptz not null default now(),
  primary key (source_id, dataset_key)
);

create table if not exists public.investment_sec_filings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.investment_companies(id) on delete restrict,
  source_response_id uuid references public.investment_ingestion_responses(id) on delete restrict,
  cik text not null check (cik ~ '^[0-9]{10}$'),
  accession_number text not null check (accession_number ~ '^[0-9]{10}-[0-9]{2}-[0-9]{6}$'),
  form text not null,
  filing_date date not null,
  accepted_at timestamptz,
  public_at timestamptz not null,
  period_end_date date,
  primary_document text,
  source_url text not null,
  is_amendment boolean not null default false,
  amends_accession_number text,
  raw_submission jsonb not null,
  content_sha256 text not null,
  ingested_at timestamptz not null default now(),
  unique (accession_number, content_sha256),
  check (public_at <= ingested_at + interval '5 minutes')
);

create index if not exists investment_sec_filings_company_public_idx
  on public.investment_sec_filings(company_id, public_at desc, filing_date desc);
create index if not exists investment_sec_filings_form_idx
  on public.investment_sec_filings(form, filing_date desc);

create table if not exists public.investment_sec_raw_facts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.investment_companies(id) on delete restrict,
  filing_id uuid references public.investment_sec_filings(id) on delete restrict,
  source_response_id uuid references public.investment_ingestion_responses(id) on delete restrict,
  cik text not null check (cik ~ '^[0-9]{10}$'),
  accession_number text,
  taxonomy text not null,
  original_concept text not null,
  value_numeric numeric(38, 12),
  value_text text,
  units text not null,
  period_start_date date,
  period_end_date date not null,
  fiscal_year integer,
  fiscal_period text,
  reported_form text,
  frame text,
  filing_date date not null,
  accepted_at timestamptz,
  public_at timestamptz not null,
  decimals_value text,
  raw_fact jsonb not null,
  fact_sha256 text not null,
  ingested_at timestamptz not null default now(),
  unique (company_id, fact_sha256),
  check (value_numeric is not null or value_text is not null),
  check (period_start_date is null or period_end_date >= period_start_date)
);

create index if not exists investment_sec_raw_facts_company_concept_idx
  on public.investment_sec_raw_facts(company_id, taxonomy, original_concept, period_end_date desc);
create index if not exists investment_sec_raw_facts_asof_idx
  on public.investment_sec_raw_facts(company_id, public_at, period_end_date);

create table if not exists public.investment_canonical_concepts (
  concept_key text primary key,
  display_name text not null,
  statement_type text not null check (statement_type in ('income', 'balance_sheet', 'cash_flow', 'equity', 'operating')),
  fact_nature text not null check (fact_nature in ('instant', 'duration')),
  expected_units text[] not null default '{}'::text[],
  description text not null default '',
  created_at timestamptz not null default now()
);

insert into public.investment_canonical_concepts
  (concept_key, display_name, statement_type, fact_nature, expected_units)
values
  ('revenue', 'Revenue', 'income', 'duration', array['USD']),
  ('cost_of_revenue', 'Cost of Revenue', 'income', 'duration', array['USD']),
  ('gross_profit', 'Gross Profit', 'income', 'duration', array['USD']),
  ('operating_expenses', 'Operating Expenses', 'income', 'duration', array['USD']),
  ('research_and_development', 'Research and Development', 'income', 'duration', array['USD']),
  ('selling_general_administrative', 'Selling, General and Administrative', 'income', 'duration', array['USD']),
  ('operating_income', 'Operating Income', 'income', 'duration', array['USD']),
  ('interest_expense', 'Interest Expense', 'income', 'duration', array['USD']),
  ('pretax_income', 'Pretax Income', 'income', 'duration', array['USD']),
  ('income_taxes', 'Income Taxes', 'income', 'duration', array['USD']),
  ('net_income', 'Net Income', 'income', 'duration', array['USD']),
  ('cash', 'Cash and Cash Equivalents', 'balance_sheet', 'instant', array['USD']),
  ('accounts_receivable', 'Accounts Receivable', 'balance_sheet', 'instant', array['USD']),
  ('inventory', 'Inventory', 'balance_sheet', 'instant', array['USD']),
  ('current_assets', 'Current Assets', 'balance_sheet', 'instant', array['USD']),
  ('property_plant_equipment', 'Property, Plant and Equipment', 'balance_sheet', 'instant', array['USD']),
  ('goodwill', 'Goodwill', 'balance_sheet', 'instant', array['USD']),
  ('intangible_assets', 'Intangible Assets', 'balance_sheet', 'instant', array['USD']),
  ('total_assets', 'Total Assets', 'balance_sheet', 'instant', array['USD']),
  ('accounts_payable', 'Accounts Payable', 'balance_sheet', 'instant', array['USD']),
  ('current_liabilities', 'Current Liabilities', 'balance_sheet', 'instant', array['USD']),
  ('short_term_debt', 'Short-Term Debt', 'balance_sheet', 'instant', array['USD']),
  ('long_term_debt', 'Long-Term Debt', 'balance_sheet', 'instant', array['USD']),
  ('total_debt', 'Total Debt', 'balance_sheet', 'instant', array['USD']),
  ('total_liabilities', 'Total Liabilities', 'balance_sheet', 'instant', array['USD']),
  ('shareholders_equity', 'Shareholders Equity', 'equity', 'instant', array['USD']),
  ('operating_cash_flow', 'Operating Cash Flow', 'cash_flow', 'duration', array['USD']),
  ('capital_expenditures', 'Capital Expenditures', 'cash_flow', 'duration', array['USD']),
  ('investing_cash_flow', 'Investing Cash Flow', 'cash_flow', 'duration', array['USD']),
  ('financing_cash_flow', 'Financing Cash Flow', 'cash_flow', 'duration', array['USD']),
  ('dividends', 'Dividends', 'cash_flow', 'duration', array['USD']),
  ('share_repurchases', 'Share Repurchases', 'cash_flow', 'duration', array['USD']),
  ('share_issuance', 'Share Issuance', 'cash_flow', 'duration', array['USD']),
  ('basic_shares', 'Basic Shares', 'equity', 'duration', array['shares']),
  ('diluted_shares', 'Diluted Shares', 'equity', 'duration', array['shares']),
  ('stock_based_compensation', 'Stock-Based Compensation', 'cash_flow', 'duration', array['USD']),
  ('depreciation_depletion_amortization', 'Depreciation, Depletion and Amortization', 'cash_flow', 'duration', array['USD'])
on conflict (concept_key) do nothing;

create table if not exists public.investment_xbrl_concept_mappings (
  id uuid primary key default gen_random_uuid(),
  taxonomy text not null,
  original_concept text not null,
  canonical_concept text not null references public.investment_canonical_concepts(concept_key),
  priority integer not null default 100,
  sign_multiplier smallint not null default 1 check (sign_multiplier in (-1, 1)),
  valid_from date,
  valid_to date,
  mapping_version text not null,
  rationale text not null default '',
  created_at timestamptz not null default now(),
  unique (taxonomy, original_concept, canonical_concept, mapping_version),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

create table if not exists public.investment_normalized_facts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.investment_companies(id) on delete restrict,
  raw_fact_id uuid references public.investment_sec_raw_facts(id) on delete restrict,
  canonical_concept text not null references public.investment_canonical_concepts(concept_key),
  original_taxonomy text,
  original_concept text,
  mapping_priority integer,
  value_numeric numeric(38, 12),
  units text not null,
  period_type text not null check (period_type in ('instant', 'quarter', 'ytd', 'annual', 'ttm')),
  period_start_date date,
  period_end_date date not null,
  fiscal_year integer,
  fiscal_period text,
  reported_or_derived text not null check (reported_or_derived in ('REPORTED', 'DERIVED')),
  formula text,
  input_fact_ids uuid[] not null default '{}'::uuid[],
  accession_number text,
  filing_date date,
  accepted_at timestamptz,
  public_at timestamptz not null,
  mapping_version text not null,
  calculation_version text,
  normalized_at timestamptz not null default now(),
  lineage_sha256 text not null unique,
  unavailable_reason text,
  check ((value_numeric is not null) <> (unavailable_reason is not null)),
  check (reported_or_derived = 'REPORTED' or formula is not null),
  check (period_start_date is null or period_end_date >= period_start_date)
);

create index if not exists investment_normalized_facts_point_in_time_idx
  on public.investment_normalized_facts(company_id, canonical_concept, period_end_date, public_at desc);
create index if not exists investment_normalized_facts_period_idx
  on public.investment_normalized_facts(company_id, period_type, period_end_date desc);

create table if not exists public.investment_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.investment_companies(id) on delete restrict,
  calculation_version text not null,
  as_of_timestamp timestamptz not null,
  input_cutoff_timestamp timestamptz not null,
  status text not null check (status in ('complete', 'partial', 'failed')),
  source_fact_ids uuid[] not null default '{}'::uuid[],
  input_manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (input_cutoff_timestamp <= as_of_timestamp)
);

create table if not exists public.investment_financial_metrics (
  id uuid primary key default gen_random_uuid(),
  calculation_run_id uuid not null references public.investment_calculation_runs(id) on delete restrict,
  company_id uuid not null references public.investment_companies(id) on delete restrict,
  metric_key text not null,
  value_numeric numeric(38, 12),
  units text not null,
  period_start_date date,
  period_end_date date not null,
  formula text not null,
  formula_version text not null,
  inputs jsonb not null,
  calculated_at timestamptz not null,
  unavailable_reason text,
  trace_sha256 text not null unique,
  check ((value_numeric is not null) <> (unavailable_reason is not null))
);

create index if not exists investment_financial_metrics_lookup_idx
  on public.investment_financial_metrics(company_id, metric_key, period_end_date desc, calculated_at desc);
create unique index if not exists investment_financial_metrics_run_metric_idx
  on public.investment_financial_metrics(calculation_run_id, metric_key);

create table if not exists public.investment_market_observations (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.investment_securities(id) on delete restrict,
  source_id text not null references public.investment_data_sources(source_id),
  observation_type text not null check (observation_type in ('quote', 'price', 'volume', 'market_cap', 'shares_outstanding', 'dividend')),
  observed_at timestamptz not null,
  available_at timestamptz not null,
  value_numeric numeric(38, 12),
  currency text,
  units text not null,
  adjustment_status text not null default 'unadjusted' check (adjustment_status in ('unadjusted', 'split_adjusted', 'total_return_adjusted')),
  source_reference text not null,
  source_payload jsonb not null default '{}'::jsonb,
  observation_sha256 text not null unique,
  ingested_at timestamptz not null default now()
);

create index if not exists investment_market_observations_lookup_idx
  on public.investment_market_observations(security_id, observation_type, observed_at desc, available_at desc);

create table if not exists public.investment_corporate_actions (
  id uuid primary key default gen_random_uuid(),
  security_id uuid not null references public.investment_securities(id) on delete restrict,
  action_type text not null check (action_type in ('split', 'reverse_split', 'dividend', 'special_dividend', 'spinoff', 'ticker_change', 'merger', 'delisting', 'bankruptcy')),
  declaration_date date,
  ex_date date,
  effective_date date not null,
  ratio_numerator numeric(30, 12),
  ratio_denominator numeric(30, 12),
  cash_amount numeric(30, 12),
  currency text,
  successor_security_id uuid references public.investment_securities(id) on delete restrict,
  source_id text not null references public.investment_data_sources(source_id),
  source_reference text not null,
  metadata jsonb not null default '{}'::jsonb,
  content_sha256 text not null unique,
  recorded_at timestamptz not null default now()
);

create table if not exists public.investment_screen_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  key text not null,
  name text not null,
  strategy_type text not null check (strategy_type in ('quality_compounder', 'value_candidate', 'quality_at_reasonable_price', 'price_dislocation', 'balance_sheet_strength', 'custom')),
  version integer not null default 1 check (version > 0),
  criteria jsonb not null,
  is_system boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique nulls not distinct (owner_user_id, key, version)
);

create table if not exists public.investment_screen_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  screen_definition_id uuid not null references public.investment_screen_definitions(id) on delete restrict,
  as_of_timestamp timestamptz not null,
  universe_snapshot jsonb not null,
  criteria_snapshot jsonb not null,
  calculation_version text not null,
  status text not null check (status in ('running', 'complete', 'partial', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.investment_screen_results (
  id uuid primary key default gen_random_uuid(),
  screen_run_id uuid not null references public.investment_screen_runs(id) on delete cascade,
  company_id uuid not null references public.investment_companies(id) on delete restrict,
  passed boolean not null,
  criterion_results jsonb not null,
  data_completeness jsonb not null,
  rank_order integer,
  created_at timestamptz not null default now(),
  unique (screen_run_id, company_id)
);

create table if not exists public.investment_watchlist_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.investment_companies(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  reason text not null,
  target_research_questions jsonb not null default '[]'::jsonb,
  valuation_ranges jsonb not null default '[]'::jsonb,
  important_metrics jsonb not null default '[]'::jsonb,
  upcoming_events jsonb not null default '[]'::jsonb,
  thesis_conditions jsonb not null default '[]'::jsonb,
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create table if not exists public.investment_material_change_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.investment_companies(id) on delete restrict,
  event_type text not null,
  materiality text not null check (materiality in ('monitor', 'medium', 'high', 'critical')),
  detected_value jsonb not null,
  threshold_snapshot jsonb not null,
  source_fact_ids uuid[] not null default '{}'::uuid[],
  source_filing_ids uuid[] not null default '{}'::uuid[],
  detected_at timestamptz not null,
  available_at timestamptz not null,
  event_sha256 text not null unique,
  created_at timestamptz not null default now()
);

insert into public.investment_screen_definitions
  (owner_user_id, key, name, strategy_type, version, criteria, is_system)
values
  (null, 'quality_compounder', 'Quality Compounder', 'quality_compounder', 1,
    '[{"metricKey":"revenue_cagr","operator":"gte","value":0.05,"required":true},{"metricKey":"free_cash_flow","operator":"positive","required":true},{"metricKey":"return_on_invested_capital","operator":"gte","value":0.10,"required":true},{"metricKey":"debt_to_equity","operator":"lte","value":1.5,"required":true},{"metricKey":"share_dilution","operator":"lte","value":0.03,"required":true}]'::jsonb, true),
  (null, 'value_candidate', 'Value Candidate', 'value_candidate', 1,
    '[{"metricKey":"fcf_yield","operator":"gte","value":0.05,"required":true},{"metricKey":"free_cash_flow","operator":"positive","required":true},{"metricKey":"debt_to_equity","operator":"lte","value":2,"required":true},{"metricKey":"revenue_growth","operator":"gte","value":-0.10,"required":true}]'::jsonb, true),
  (null, 'quality_at_reasonable_price', 'Quality at a Reasonable Price', 'quality_at_reasonable_price', 1,
    '[{"metricKey":"return_on_invested_capital","operator":"gte","value":0.10,"required":true},{"metricKey":"fcf_margin","operator":"gte","value":0.08,"required":true},{"metricKey":"fcf_yield","operator":"gte","value":0.03,"required":true},{"metricKey":"share_dilution","operator":"lte","value":0.04,"required":true}]'::jsonb, true),
  (null, 'price_dislocation', 'Price Dislocation', 'price_dislocation', 1,
    '[{"metricKey":"has_frozen_research","operator":"gte","value":1,"required":true},{"metricKey":"price_change_from_research","operator":"lte","value":-0.20,"required":true},{"metricKey":"thesis_invalidated","operator":"lte","value":0,"required":true}]'::jsonb, true),
  (null, 'balance_sheet_strength', 'Balance Sheet Strength', 'balance_sheet_strength', 1,
    '[{"metricKey":"current_ratio","operator":"gte","value":1.5,"required":true},{"metricKey":"debt_to_equity","operator":"lte","value":0.75,"required":true},{"metricKey":"interest_coverage","operator":"gte","value":5,"required":true},{"metricKey":"free_cash_flow","operator":"positive","required":true}]'::jsonb, true)
on conflict (owner_user_id, key, version) do nothing;

create table if not exists public.investment_audit_events (
  sequence_no bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_state jsonb,
  new_state jsonb,
  source_data_version text,
  calculation_version text,
  ai_model_version text,
  approval_state text,
  previous_hash text,
  event_hash text not null unique,
  occurred_at timestamptz not null default now()
);

create index if not exists investment_audit_events_user_sequence_idx
  on public.investment_audit_events(user_id, sequence_no desc);

create or replace function public.prevent_investment_history_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Investment source and audit history is append-only';
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_ingestion_responses',
    'investment_sec_filings',
    'investment_sec_raw_facts',
    'investment_normalized_facts',
    'investment_calculation_runs',
    'investment_financial_metrics',
    'investment_market_observations',
    'investment_corporate_actions',
    'investment_screen_runs',
    'investment_screen_results',
    'investment_material_change_events',
    'investment_audit_events'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_prevent_mutation', table_name);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.prevent_investment_history_mutation()',
      table_name || '_prevent_mutation', table_name
    );
  end loop;
end;
$$;

drop trigger if exists investment_data_sources_set_updated_at on public.investment_data_sources;
create trigger investment_data_sources_set_updated_at
  before update on public.investment_data_sources
  for each row execute function public.set_updated_at();

drop trigger if exists investment_companies_set_updated_at on public.investment_companies;
create trigger investment_companies_set_updated_at
  before update on public.investment_companies
  for each row execute function public.set_updated_at();

drop trigger if exists investment_securities_set_updated_at on public.investment_securities;
create trigger investment_securities_set_updated_at
  before update on public.investment_securities
  for each row execute function public.set_updated_at();

drop trigger if exists investment_ingestion_checkpoints_set_updated_at on public.investment_ingestion_checkpoints;
create trigger investment_ingestion_checkpoints_set_updated_at
  before update on public.investment_ingestion_checkpoints
  for each row execute function public.set_updated_at();

drop trigger if exists investment_ingestion_leases_set_updated_at on public.investment_ingestion_leases;
create trigger investment_ingestion_leases_set_updated_at
  before update on public.investment_ingestion_leases
  for each row execute function public.set_updated_at();

drop trigger if exists investment_watchlist_entries_set_updated_at on public.investment_watchlist_entries;
create trigger investment_watchlist_entries_set_updated_at
  before update on public.investment_watchlist_entries
  for each row execute function public.set_updated_at();

create or replace function public.append_investment_audit_event(
  p_user_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_previous_state jsonb,
  p_new_state jsonb,
  p_source_data_version text,
  p_calculation_version text,
  p_ai_model_version text,
  p_approval_state text
)
returns public.investment_audit_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prior_hash text;
  created_event public.investment_audit_events;
  event_time timestamptz := clock_timestamp();
  computed_hash text;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_user_id::text, 'system'), 0));

  select event_hash into prior_hash
  from public.investment_audit_events
  where user_id is not distinct from p_user_id
  order by sequence_no desc
  limit 1;

  computed_hash := encode(digest(concat_ws('|',
    coalesce(prior_hash, ''),
    coalesce(p_user_id::text, ''),
    coalesce(p_actor_user_id::text, ''),
    p_action,
    p_entity_type,
    coalesce(p_entity_id, ''),
    coalesce(p_previous_state::text, 'null'),
    coalesce(p_new_state::text, 'null'),
    coalesce(p_source_data_version, ''),
    coalesce(p_calculation_version, ''),
    coalesce(p_ai_model_version, ''),
    coalesce(p_approval_state, ''),
    event_time::text
  ), 'sha256'), 'hex');

  insert into public.investment_audit_events (
    user_id, actor_user_id, action, entity_type, entity_id,
    previous_state, new_state, source_data_version, calculation_version,
    ai_model_version, approval_state, previous_hash, event_hash, occurred_at
  ) values (
    p_user_id, p_actor_user_id, p_action, p_entity_type, p_entity_id,
    p_previous_state, p_new_state, p_source_data_version, p_calculation_version,
    p_ai_model_version, p_approval_state, prior_hash, computed_hash, event_time
  ) returning * into created_event;

  return created_event;
end;
$$;

create or replace function public.investment_facts_as_of(
  p_company_id uuid,
  p_as_of_timestamp timestamptz
)
returns setof public.investment_normalized_facts
language sql
stable
set search_path = public, pg_temp
as $$
  select distinct on (fact.canonical_concept, fact.period_type, fact.period_end_date, fact.units)
    fact.*
  from public.investment_normalized_facts fact
  where fact.company_id = p_company_id
    and fact.public_at <= p_as_of_timestamp
  order by
    fact.canonical_concept,
    fact.period_type,
    fact.period_end_date,
    fact.units,
    fact.public_at desc,
    fact.mapping_priority asc nulls last,
    fact.filing_date desc nulls last,
    fact.normalized_at desc;
$$;

create or replace function public.claim_investment_ingestion_lease(
  p_source_id text,
  p_dataset_key text,
  p_lease_owner uuid,
  p_lease_seconds integer default 360
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  insert into public.investment_ingestion_leases (
    source_id, dataset_key, lease_owner, locked_until
  ) values (
    p_source_id,
    p_dataset_key,
    p_lease_owner,
    now() + make_interval(secs => greatest(30, least(900, p_lease_seconds)))
  )
  on conflict (source_id, dataset_key) do update
  set lease_owner = excluded.lease_owner,
      locked_until = excluded.locked_until
  where public.investment_ingestion_leases.locked_until <= now()
     or public.investment_ingestion_leases.lease_owner = excluded.lease_owner;

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

create or replace function public.release_investment_ingestion_lease(
  p_source_id text,
  p_dataset_key text,
  p_lease_owner uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  update public.investment_ingestion_leases
  set lease_owner = null,
      locked_until = now()
  where source_id = p_source_id
    and dataset_key = p_dataset_key
    and lease_owner = p_lease_owner;
  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_data_sources',
    'investment_companies',
    'investment_securities',
    'investment_security_identifiers',
    'investment_ingestion_responses',
    'investment_ingestion_checkpoints',
    'investment_ingestion_leases',
    'investment_sec_filings',
    'investment_sec_raw_facts',
    'investment_canonical_concepts',
    'investment_xbrl_concept_mappings',
    'investment_normalized_facts',
    'investment_calculation_runs',
    'investment_financial_metrics',
    'investment_market_observations',
    'investment_corporate_actions',
    'investment_screen_definitions',
    'investment_screen_runs',
    'investment_screen_results',
    'investment_watchlist_entries',
    'investment_material_change_events',
    'investment_audit_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke insert, update, delete on table public.%I from anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
  end loop;
end;
$$;

-- Shared research data is visible to signed-in researchers but server-owned.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'investment_data_sources',
    'investment_companies',
    'investment_securities',
    'investment_security_identifiers',
    'investment_sec_filings',
    'investment_sec_raw_facts',
    'investment_canonical_concepts',
    'investment_xbrl_concept_mappings',
    'investment_normalized_facts',
    'investment_calculation_runs',
    'investment_financial_metrics',
    'investment_market_observations',
    'investment_corporate_actions',
    'investment_material_change_events'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_read_authenticated', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      table_name || '_read_authenticated', table_name
    );
    execute format('grant select on table public.%I to authenticated', table_name);
  end loop;
end;
$$;

drop policy if exists investment_screen_definitions_read on public.investment_screen_definitions;
create policy investment_screen_definitions_read
  on public.investment_screen_definitions for select to authenticated
  using (is_system or owner_user_id = auth.uid());

drop policy if exists investment_screen_runs_read_own on public.investment_screen_runs;
create policy investment_screen_runs_read_own
  on public.investment_screen_runs for select to authenticated
  using (user_id = auth.uid());

drop policy if exists investment_screen_results_read_own on public.investment_screen_results;
create policy investment_screen_results_read_own
  on public.investment_screen_results for select to authenticated
  using (exists (
    select 1 from public.investment_screen_runs run
    where run.id = screen_run_id and run.user_id = auth.uid()
  ));

drop policy if exists investment_watchlist_read_own on public.investment_watchlist_entries;
create policy investment_watchlist_read_own
  on public.investment_watchlist_entries for select to authenticated
  using (user_id = auth.uid());

drop policy if exists investment_audit_read_own on public.investment_audit_events;
create policy investment_audit_read_own
  on public.investment_audit_events for select to authenticated
  using (user_id = auth.uid() or actor_user_id = auth.uid());

grant select on table public.investment_screen_definitions to authenticated;
grant select on table public.investment_screen_runs to authenticated;
grant select on table public.investment_screen_results to authenticated;
grant select on table public.investment_watchlist_entries to authenticated;
grant select on table public.investment_audit_events to authenticated;

revoke all on function public.append_investment_audit_event(
  uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.append_investment_audit_event(
  uuid, uuid, text, text, text, jsonb, jsonb, text, text, text, text
) to service_role;

grant execute on function public.investment_facts_as_of(uuid, timestamptz) to authenticated, service_role;

revoke all on function public.claim_investment_ingestion_lease(text, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_investment_ingestion_lease(text, text, uuid, integer)
  to service_role;

revoke all on function public.release_investment_ingestion_lease(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.release_investment_ingestion_lease(text, text, uuid)
  to service_role;

notify pgrst, 'reload schema';
