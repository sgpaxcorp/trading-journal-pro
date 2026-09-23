-- AI Coach accountability loop: one accepted operating commitment per account,
-- measured against the next three real trading sessions.

create extension if not exists pgcrypto;

create table if not exists public.ai_coach_commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.trading_accounts(id) on delete cascade,
  thread_id uuid references public.ai_coach_threads(id) on delete set null,
  source_message_id uuid references public.ai_coach_messages(id) on delete set null,
  title text not null,
  instruction text not null,
  success_criteria text not null,
  metric text not null check (metric in ('plan_compliance', 'daily_loss_limit', 'protective_stop')),
  threshold_usd numeric(14,2),
  target_sessions integer not null default 3 check (target_sessions between 1 and 10),
  baseline_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'partial', 'missed', 'cancelled')),
  sessions_observed integer not null default 0,
  sessions_evaluated integer not null default 0,
  sessions_met integer not null default 0,
  outcomes jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_coach_commitments_user_account_idx
  on public.ai_coach_commitments(user_id, account_id, created_at desc);

create unique index if not exists ai_coach_commitments_one_active_account_uidx
  on public.ai_coach_commitments(user_id, account_id)
  where status = 'active';

alter table public.ai_coach_commitments enable row level security;

drop policy if exists "ai_coach_commitments_select_advanced_own" on public.ai_coach_commitments;
drop policy if exists "ai_coach_commitments_insert_advanced_own" on public.ai_coach_commitments;
drop policy if exists "ai_coach_commitments_update_advanced_own" on public.ai_coach_commitments;

create policy "ai_coach_commitments_select_advanced_own"
  on public.ai_coach_commitments
  for select
  to authenticated
  using (auth.uid() = user_id and public.user_has_advanced_plan(auth.uid()));

create policy "ai_coach_commitments_insert_advanced_own"
  on public.ai_coach_commitments
  for insert
  to authenticated
  with check (auth.uid() = user_id and public.user_has_advanced_plan(auth.uid()));

create policy "ai_coach_commitments_update_advanced_own"
  on public.ai_coach_commitments
  for update
  to authenticated
  using (auth.uid() = user_id and public.user_has_advanced_plan(auth.uid()))
  with check (auth.uid() = user_id and public.user_has_advanced_plan(auth.uid()));

revoke all on public.ai_coach_commitments from anon;
grant select, insert, update on public.ai_coach_commitments to authenticated;
