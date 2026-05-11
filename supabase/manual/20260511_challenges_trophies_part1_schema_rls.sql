-- Part 1/4: Challenges + gamification schema and RLS.
-- Run this first in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.challenge_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id text not null,
  status text not null default 'active' check (status in ('active', 'completed', 'failed', 'restarted')),
  duration_days integer not null default 0,
  required_green_days integer not null default 0,
  days_tracked integer not null default 0,
  process_green_days integer not null default 0,
  max_loss_breaks integer not null default 0,
  xp_earned integer not null default 0,
  current_streak integer not null default 0,
  best_streak integer not null default 0,
  last_tracked_date date,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.challenge_runs
  add column if not exists challenge_id text,
  add column if not exists status text default 'active',
  add column if not exists duration_days integer default 0,
  add column if not exists required_green_days integer default 0,
  add column if not exists days_tracked integer default 0,
  add column if not exists process_green_days integer default 0,
  add column if not exists max_loss_breaks integer default 0,
  add column if not exists xp_earned integer default 0,
  add column if not exists current_streak integer default 0,
  add column if not exists best_streak integer default 0,
  add column if not exists last_tracked_date date,
  add column if not exists started_at timestamptz default now(),
  add column if not exists ended_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.challenge_run_days (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.challenge_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id text not null,
  day date not null,
  journal_completed boolean not null default false,
  respected_max_loss boolean not null default false,
  followed_plan boolean not null default false,
  process_green boolean not null default false,
  max_loss_break boolean not null default false,
  xp_awarded integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.challenge_run_days
  add column if not exists run_id uuid,
  add column if not exists challenge_id text,
  add column if not exists day date,
  add column if not exists journal_completed boolean default false,
  add column if not exists respected_max_loss boolean default false,
  add column if not exists followed_plan boolean default false,
  add column if not exists process_green boolean default false,
  add column if not exists max_loss_break boolean default false,
  add column if not exists xp_awarded integer default 0,
  add column if not exists note text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.profile_gamification (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp integer not null default 0,
  level integer not null default 1,
  tier text not null default 'Bronze',
  badges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.profile_gamification
  add column if not exists xp integer default 0,
  add column if not exists level integer default 1,
  add column if not exists tier text default 'Bronze',
  add column if not exists badges jsonb default '[]'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists challenge_runs_user_status_idx
  on public.challenge_runs(user_id, status, created_at desc);
create index if not exists challenge_runs_user_challenge_idx
  on public.challenge_runs(user_id, challenge_id, created_at desc);
create index if not exists challenge_run_days_user_run_day_idx
  on public.challenge_run_days(user_id, run_id, day);
create unique index if not exists challenge_run_days_run_day_uidx
  on public.challenge_run_days(run_id, day);

alter table public.challenge_runs enable row level security;
alter table public.challenge_run_days enable row level security;
alter table public.profile_gamification enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'challenge_runs' and policyname = 'challenge_runs_select_own'
  ) then
    create policy challenge_runs_select_own
      on public.challenge_runs for select to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'challenge_runs' and policyname = 'challenge_runs_insert_own'
  ) then
    create policy challenge_runs_insert_own
      on public.challenge_runs for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'challenge_runs' and policyname = 'challenge_runs_update_own'
  ) then
    create policy challenge_runs_update_own
      on public.challenge_runs for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'challenge_run_days' and policyname = 'challenge_run_days_select_own'
  ) then
    create policy challenge_run_days_select_own
      on public.challenge_run_days for select to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'challenge_run_days' and policyname = 'challenge_run_days_insert_own'
  ) then
    create policy challenge_run_days_insert_own
      on public.challenge_run_days for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'challenge_run_days' and policyname = 'challenge_run_days_update_own'
  ) then
    create policy challenge_run_days_update_own
      on public.challenge_run_days for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profile_gamification' and policyname = 'profile_gamification_select_own'
  ) then
    create policy profile_gamification_select_own
      on public.profile_gamification for select to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profile_gamification' and policyname = 'profile_gamification_insert_own'
  ) then
    create policy profile_gamification_insert_own
      on public.profile_gamification for insert to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profile_gamification' and policyname = 'profile_gamification_update_own'
  ) then
    create policy profile_gamification_update_own
      on public.profile_gamification for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

select 'part 1 complete: schema + RLS' as status;
