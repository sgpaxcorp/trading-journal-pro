alter table if exists public.profiles
  add column if not exists legal_terms_version text,
  add column if not exists legal_privacy_version text,
  add column if not exists legal_accepted_at timestamptz,
  add column if not exists legal_checkout_accepted_at timestamptz,
  add column if not exists legal_acceptance_ip text,
  add column if not exists legal_acceptance_user_agent text,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ended_at timestamptz;

create table if not exists public.legal_acceptance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  source text not null,
  accepted_at timestamptz not null default now(),
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists legal_acceptance_events_user_idx
  on public.legal_acceptance_events(user_id, accepted_at desc);

alter table public.legal_acceptance_events enable row level security;

drop policy if exists "legal_acceptance_events_select_own" on public.legal_acceptance_events;
create policy "legal_acceptance_events_select_own"
  on public.legal_acceptance_events
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "legal_acceptance_events_insert_own" on public.legal_acceptance_events;
create policy "legal_acceptance_events_insert_own"
  on public.legal_acceptance_events
  for insert
  to authenticated
  with check (user_id = auth.uid());
