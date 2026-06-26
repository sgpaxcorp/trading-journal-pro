-- Neuro Analysis premium platform: research cases, structured reports, snapshots,
-- usage telemetry, quotas, and background job records.

create table if not exists public.neuro_analysis_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Research case',
  status text not null default 'active' check (status in ('active', 'archived')),
  focus_ticker text,
  research_goal text,
  holdings jsonb not null default '[]'::jsonb,
  selected_account_id text,
  broker_snapshot jsonb not null default '{}'::jsonb,
  market_data jsonb not null default '{}'::jsonb,
  readiness jsonb not null default '{}'::jsonb,
  latest_report_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.neuro_analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.neuro_analysis_cases(id) on delete cascade,
  response_id text,
  model text,
  report_text text not null default '',
  structured jsonb not null default '{}'::jsonb,
  engine jsonb not null default '{}'::jsonb,
  assumptions jsonb not null default '{}'::jsonb,
  holdings_snapshot jsonb not null default '[]'::jsonb,
  market_data_snapshot jsonb not null default '{}'::jsonb,
  filings_used jsonb not null default '[]'::jsonb,
  missing_filings jsonb not null default '{}'::jsonb,
  vector_stores_used text[] not null default '{}'::text[],
  requires_filings boolean not null default false,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.neuro_analysis_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.neuro_analysis_cases(id) on delete cascade,
  snapshot_type text not null default 'portfolio',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.neuro_analysis_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid references public.neuro_analysis_cases(id) on delete set null,
  event_type text not null,
  model text,
  units numeric not null default 1,
  input_tokens integer,
  output_tokens integer,
  bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.neuro_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  case_id uuid references public.neuro_analysis_cases(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.neuro_analysis_filings
  add column if not exists last_verified_at timestamptz,
  add column if not exists stale_reason text,
  add column if not exists retention_tier text not null default 'premium',
  add column if not exists deleted_at timestamptz;

create index if not exists neuro_analysis_cases_user_updated_idx
  on public.neuro_analysis_cases(user_id, updated_at desc);

create index if not exists neuro_analysis_cases_user_status_idx
  on public.neuro_analysis_cases(user_id, status, updated_at desc);

create index if not exists neuro_analysis_reports_user_case_created_idx
  on public.neuro_analysis_reports(user_id, case_id, created_at desc);

create index if not exists neuro_analysis_snapshots_user_case_created_idx
  on public.neuro_analysis_snapshots(user_id, case_id, created_at desc);

create index if not exists neuro_analysis_usage_user_event_month_idx
  on public.neuro_analysis_usage_events(user_id, event_type, created_at desc);

create index if not exists neuro_analysis_jobs_status_run_after_idx
  on public.neuro_analysis_jobs(status, run_after, created_at);

create index if not exists neuro_analysis_jobs_user_created_idx
  on public.neuro_analysis_jobs(user_id, created_at desc);

alter table public.neuro_analysis_cases enable row level security;
alter table public.neuro_analysis_reports enable row level security;
alter table public.neuro_analysis_snapshots enable row level security;
alter table public.neuro_analysis_usage_events enable row level security;
alter table public.neuro_analysis_jobs enable row level security;

drop policy if exists "neuro_analysis_cases_select_own" on public.neuro_analysis_cases;
create policy "neuro_analysis_cases_select_own"
  on public.neuro_analysis_cases
  for select
  using (auth.uid() = user_id);

drop policy if exists "neuro_analysis_cases_insert_own" on public.neuro_analysis_cases;
create policy "neuro_analysis_cases_insert_own"
  on public.neuro_analysis_cases
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "neuro_analysis_cases_update_own" on public.neuro_analysis_cases;
create policy "neuro_analysis_cases_update_own"
  on public.neuro_analysis_cases
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "neuro_analysis_reports_select_own" on public.neuro_analysis_reports;
create policy "neuro_analysis_reports_select_own"
  on public.neuro_analysis_reports
  for select
  using (auth.uid() = user_id);

drop policy if exists "neuro_analysis_reports_insert_own" on public.neuro_analysis_reports;
create policy "neuro_analysis_reports_insert_own"
  on public.neuro_analysis_reports
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "neuro_analysis_snapshots_select_own" on public.neuro_analysis_snapshots;
create policy "neuro_analysis_snapshots_select_own"
  on public.neuro_analysis_snapshots
  for select
  using (auth.uid() = user_id);

drop policy if exists "neuro_analysis_snapshots_insert_own" on public.neuro_analysis_snapshots;
create policy "neuro_analysis_snapshots_insert_own"
  on public.neuro_analysis_snapshots
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "neuro_analysis_usage_select_own" on public.neuro_analysis_usage_events;
create policy "neuro_analysis_usage_select_own"
  on public.neuro_analysis_usage_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "neuro_analysis_usage_insert_own" on public.neuro_analysis_usage_events;
create policy "neuro_analysis_usage_insert_own"
  on public.neuro_analysis_usage_events
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "neuro_analysis_jobs_select_own" on public.neuro_analysis_jobs;
create policy "neuro_analysis_jobs_select_own"
  on public.neuro_analysis_jobs
  for select
  using (auth.uid() = user_id);

drop policy if exists "neuro_analysis_jobs_insert_own" on public.neuro_analysis_jobs;
create policy "neuro_analysis_jobs_insert_own"
  on public.neuro_analysis_jobs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "neuro_analysis_jobs_update_own" on public.neuro_analysis_jobs;
create policy "neuro_analysis_jobs_update_own"
  on public.neuro_analysis_jobs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists neuro_analysis_cases_set_updated_at on public.neuro_analysis_cases;
create trigger neuro_analysis_cases_set_updated_at
  before update on public.neuro_analysis_cases
  for each row execute function public.set_updated_at();

drop trigger if exists neuro_analysis_jobs_set_updated_at on public.neuro_analysis_jobs;
create trigger neuro_analysis_jobs_set_updated_at
  before update on public.neuro_analysis_jobs
  for each row execute function public.set_updated_at();
