-- Neuro Analysis investment governance:
-- versioned investment policy and immutable human decision log.

create table if not exists public.neuro_analysis_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'retired')),
  universe text not null default '',
  strategy text not null default '',
  horizon_years integer,
  base_currency text not null default 'USD',
  benchmark text not null default '',
  restrictions jsonb not null default '[]'::jsonb,
  liquidity_needs text not null default '',
  limits jsonb not null default '{}'::jsonb,
  approved_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, version)
);

create table if not exists public.neuro_analysis_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.neuro_analysis_cases(id) on delete cascade,
  report_id uuid references public.neuro_analysis_reports(id) on delete set null,
  policy_id uuid references public.neuro_analysis_policies(id) on delete set null,
  ticker text,
  decision_state text not null check (
    decision_state in ('investigate', 'observe', 'propose', 'reject', 'insufficient_information')
  ),
  suggested_state text check (
    suggested_state is null or suggested_state in ('investigate', 'observe', 'propose', 'reject', 'insufficient_information')
  ),
  decision_note text not null default '',
  rationale text not null default '',
  evidence_snapshot jsonb not null default '{}'::jsonb,
  proposal_snapshot jsonb not null default '{}'::jsonb,
  policy_snapshot jsonb not null default '{}'::jsonb,
  immutable_hash text,
  created_at timestamptz not null default now()
);

create unique index if not exists neuro_analysis_decisions_immutable_hash_idx
  on public.neuro_analysis_decisions(immutable_hash)
  where immutable_hash is not null;

create index if not exists neuro_analysis_policies_user_version_idx
  on public.neuro_analysis_policies(user_id, version desc);

create index if not exists neuro_analysis_policies_user_status_idx
  on public.neuro_analysis_policies(user_id, status, version desc);

create index if not exists neuro_analysis_decisions_user_case_idx
  on public.neuro_analysis_decisions(user_id, case_id, created_at desc);

create index if not exists neuro_analysis_decisions_report_idx
  on public.neuro_analysis_decisions(report_id);

alter table public.neuro_analysis_policies enable row level security;
alter table public.neuro_analysis_decisions enable row level security;

drop policy if exists "neuro_analysis_policies_select_own" on public.neuro_analysis_policies;
create policy "neuro_analysis_policies_select_own"
  on public.neuro_analysis_policies
  for select
  using (auth.uid() = user_id);

drop policy if exists "neuro_analysis_policies_insert_own" on public.neuro_analysis_policies;
create policy "neuro_analysis_policies_insert_own"
  on public.neuro_analysis_policies
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "neuro_analysis_policies_update_own" on public.neuro_analysis_policies;
create policy "neuro_analysis_policies_update_own"
  on public.neuro_analysis_policies
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "neuro_analysis_decisions_select_own" on public.neuro_analysis_decisions;
create policy "neuro_analysis_decisions_select_own"
  on public.neuro_analysis_decisions
  for select
  using (auth.uid() = user_id);

drop policy if exists "neuro_analysis_decisions_insert_own" on public.neuro_analysis_decisions;
create policy "neuro_analysis_decisions_insert_own"
  on public.neuro_analysis_decisions
  for insert
  with check (auth.uid() = user_id);

drop trigger if exists neuro_analysis_policies_set_updated_at on public.neuro_analysis_policies;
create trigger neuro_analysis_policies_set_updated_at
  before update on public.neuro_analysis_policies
  for each row execute function public.set_updated_at();
