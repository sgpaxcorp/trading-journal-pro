-- Part 4/4: Verification only. Safe to run after parts 1-3.

select
  'challenge_runs' as object_name,
  to_regclass('public.challenge_runs') is not null as ok
union all
select
  'challenge_run_days',
  to_regclass('public.challenge_run_days') is not null
union all
select
  'profile_gamification',
  to_regclass('public.profile_gamification') is not null
union all
select
  'trophy_definitions',
  to_regclass('public.trophy_definitions') is not null
union all
select
  'user_trophies',
  to_regclass('public.user_trophies') is not null;

select
  p.proname as function_name,
  n.nspname as schema_name,
  pg_get_function_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'nt_best_streak_from_dates',
    'nt_award_trophies',
    'nt_public_leaderboard',
    'nt_public_user_profile'
  )
order by p.proname, arguments;

select public.nt_award_trophies() as award_rpc_check;

select *
from public.nt_public_leaderboard(5, 0);
