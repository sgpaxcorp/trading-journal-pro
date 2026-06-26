create table if not exists public.business_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null references public.trading_accounts(id) on delete set null,
  milestone_key text not null,
  title text not null,
  description text null,
  completed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_milestones_user_key_unique unique (user_id, milestone_key)
);

create index if not exists business_milestones_user_completed_idx
  on public.business_milestones(user_id, completed_at desc);

alter table public.business_milestones enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'business_milestones'
      and policyname = 'business_milestones_select_own'
  ) then
    create policy business_milestones_select_own
      on public.business_milestones
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'business_milestones'
      and policyname = 'business_milestones_insert_own'
  ) then
    create policy business_milestones_insert_own
      on public.business_milestones
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'business_milestones'
      and policyname = 'business_milestones_update_own'
  ) then
    create policy business_milestones_update_own
      on public.business_milestones
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

drop function if exists public.nt_award_trophies() cascade;
drop function if exists public.nt_public_leaderboard(integer, integer) cascade;
drop function if exists public.nt_public_user_profile(uuid) cascade;
drop function if exists public.nt_public_user_trophies(uuid) cascade;
drop function if exists public.nt_public_leaderboard_pnl(integer, integer) cascade;
drop function if exists public.nt_public_user_profile_pnl(uuid) cascade;
drop function if exists public.recompute_profile_gamification(uuid) cascade;

do $$
begin
  if to_regclass('public.user_entitlements') is not null then
    delete from public.user_entitlements
    where entitlement_key in ('page_challenges', 'page_global_ranking');
  end if;
end $$;

drop table if exists public.challenge_run_days cascade;
drop table if exists public.challenge_runs cascade;
drop table if exists public.user_trophies cascade;
drop table if exists public.trophy_definitions cascade;
drop table if exists public.profile_gamification cascade;

alter table if exists public.profiles
  drop column if exists show_in_ranking;

alter table if exists public.profiles
  drop column if exists ranking_name;

notify pgrst, 'reload schema';
