-- Investment Committee is an append-only gate between research and portfolio eligibility.
-- AI may prepare packets, but only the authenticated case owner can record a decision.

create table if not exists public.neuro_analysis_committee_packets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.neuro_analysis_cases(id) on delete cascade,
  report_id uuid references public.neuro_analysis_reports(id) on delete set null,
  policy_id uuid references public.neuro_analysis_policies(id) on delete set null,
  ticker text not null,
  version integer not null check (version > 0),
  generation_status text not null check (generation_status in ('ready', 'incomplete')),
  packet jsonb not null,
  source_manifest jsonb not null default '[]'::jsonb,
  report_snapshot jsonb not null default '{}'::jsonb,
  engine_snapshot jsonb not null default '{}'::jsonb,
  policy_snapshot jsonb not null default '{}'::jsonb,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  content_hash text not null,
  generated_by text not null default 'ai_research' check (generated_by in ('ai_research', 'deterministic_fallback')),
  created_at timestamptz not null default now(),
  unique (user_id, case_id, ticker, version)
);

create table if not exists public.neuro_analysis_committee_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.neuro_analysis_cases(id) on delete cascade,
  packet_id uuid not null references public.neuro_analysis_committee_packets(id) on delete cascade,
  packet_version integer not null check (packet_version > 0),
  ticker text not null,
  decision text not null check (
    decision in ('APPROVED', 'REJECTED', 'WATCHLIST', 'NEEDS_MORE_RESEARCH')
  ),
  rationale text not null,
  conditions text not null default '',
  decision_maker_user_id uuid not null references auth.users(id) on delete cascade,
  decision_maker_email text,
  authorization_basis text not null default 'case_owner' check (
    authorization_basis in ('case_owner', 'committee_member', 'administrator')
  ),
  packet_snapshot jsonb not null,
  source_manifest_snapshot jsonb not null default '[]'::jsonb,
  reviewed_packet_hash text not null,
  decision_hash text not null unique,
  portfolio_eligible boolean not null default false,
  decided_at timestamptz not null default now(),
  unique (packet_id)
);

create index if not exists neuro_committee_packets_user_case_version_idx
  on public.neuro_analysis_committee_packets(user_id, case_id, version desc);

create index if not exists neuro_committee_packets_user_ticker_idx
  on public.neuro_analysis_committee_packets(user_id, ticker, created_at desc);

create index if not exists neuro_committee_packets_content_hash_idx
  on public.neuro_analysis_committee_packets(content_hash);

create index if not exists neuro_committee_decisions_user_case_idx
  on public.neuro_analysis_committee_decisions(user_id, case_id, decided_at desc);

create index if not exists neuro_committee_decisions_user_eligible_idx
  on public.neuro_analysis_committee_decisions(user_id, portfolio_eligible, decided_at desc);

alter table public.neuro_analysis_committee_packets enable row level security;
alter table public.neuro_analysis_committee_decisions enable row level security;

drop policy if exists "neuro_committee_packets_select_own" on public.neuro_analysis_committee_packets;
create policy "neuro_committee_packets_select_own"
  on public.neuro_analysis_committee_packets
  for select
  using (auth.uid() = user_id);

drop policy if exists "neuro_committee_decisions_select_own" on public.neuro_analysis_committee_decisions;
create policy "neuro_committee_decisions_select_own"
  on public.neuro_analysis_committee_decisions
  for select
  using (auth.uid() = user_id);

-- Writes must pass through the authenticated server routes. Clients can read their
-- own immutable history but cannot forge, update, or delete packet/decision records.
revoke insert, update, delete on public.neuro_analysis_committee_packets from anon, authenticated;
revoke insert, update, delete on public.neuro_analysis_committee_decisions from anon, authenticated;
grant select on public.neuro_analysis_committee_packets to authenticated;
grant select on public.neuro_analysis_committee_decisions to authenticated;

notify pgrst, 'reload schema';
