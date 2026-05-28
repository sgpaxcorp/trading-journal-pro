-- Lock gamification write integrity.
-- Users may read their own challenge/trophy state, but all XP, trophy, and
-- ranking mutations must be calculated by trusted server code or SECURITY
-- DEFINER RPCs. This prevents forged XP/trophy writes from browser/mobile clients.

alter table if exists public.challenge_runs enable row level security;
alter table if exists public.challenge_run_days enable row level security;
alter table if exists public.user_trophies enable row level security;
alter table if exists public.profile_gamification enable row level security;

drop policy if exists challenge_runs_insert_own on public.challenge_runs;
drop policy if exists challenge_runs_update_own on public.challenge_runs;
drop policy if exists challenge_run_days_insert_own on public.challenge_run_days;
drop policy if exists challenge_run_days_update_own on public.challenge_run_days;
drop policy if exists user_trophies_insert_own on public.user_trophies;
drop policy if exists profile_gamification_insert_own on public.profile_gamification;
drop policy if exists profile_gamification_update_own on public.profile_gamification;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'challenge_runs'
      and policyname = 'challenge_runs_select_own'
  ) then
    create policy challenge_runs_select_own
      on public.challenge_runs
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'challenge_run_days'
      and policyname = 'challenge_run_days_select_own'
  ) then
    create policy challenge_run_days_select_own
      on public.challenge_run_days
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_trophies'
      and policyname = 'user_trophies_select_own'
  ) then
    create policy user_trophies_select_own
      on public.user_trophies
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profile_gamification'
      and policyname = 'profile_gamification_select_own'
  ) then
    create policy profile_gamification_select_own
      on public.profile_gamification
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

revoke insert, update, delete on table public.challenge_runs from anon, authenticated;
revoke insert, update, delete on table public.challenge_run_days from anon, authenticated;
revoke insert, update, delete on table public.user_trophies from anon, authenticated;
revoke insert, update, delete on table public.profile_gamification from anon, authenticated;

grant select on table public.challenge_runs to authenticated;
grant select on table public.challenge_run_days to authenticated;
grant select on table public.user_trophies to authenticated;
grant select on table public.profile_gamification to authenticated;

grant all on table public.challenge_runs to service_role;
grant all on table public.challenge_run_days to service_role;
grant all on table public.user_trophies to service_role;
grant all on table public.profile_gamification to service_role;

comment on table public.challenge_runs is
  'Challenge summary rows. XP and status mutations are server-owned; authenticated clients are read-only.';
comment on table public.challenge_run_days is
  'Challenge check-in rows. Mutations are server-owned so clients cannot forge XP-awarding logs.';
comment on table public.user_trophies is
  'Awarded trophies. Inserts are server/RPC-owned to protect trophy integrity.';
comment on table public.profile_gamification is
  'XP/level/tier snapshot. Updates are server-owned to protect public ranking integrity.';

notify pgrst, 'reload schema';
