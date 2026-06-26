-- Manual Supabase cleanup for removed gamification surfaces.
-- Run this in Supabase SQL Editor after deploying the app changes.
-- Safe to re-run: every destructive operation uses IF EXISTS or existence checks.

begin;

-- Drop old RPCs/functions used by trophies, XP, challenges, and public rankings.
drop function if exists public.nt_award_trophies() cascade;
drop function if exists public.nt_public_leaderboard(integer, integer) cascade;
drop function if exists public.nt_public_user_profile(uuid) cascade;
drop function if exists public.nt_public_user_trophies(uuid) cascade;
drop function if exists public.nt_public_leaderboard_pnl(integer, integer) cascade;
drop function if exists public.nt_public_user_profile_pnl(uuid) cascade;
drop function if exists public.recompute_profile_gamification(uuid) cascade;

-- Remove old feature entitlements so admin/access screens do not keep dead grants.
do $$
begin
  if to_regclass('public.user_entitlements') is not null then
    delete from public.user_entitlements
    where entitlement_key in ('page_challenges', 'page_global_ranking');
  end if;
end $$;

-- Drop storage tables for challenges, trophies, XP, levels, tiers, and badges.
drop table if exists public.challenge_run_days cascade;
drop table if exists public.challenge_runs cascade;
drop table if exists public.user_trophies cascade;
drop table if exists public.trophy_definitions cascade;
drop table if exists public.profile_gamification cascade;

-- Drop public-ranking profile fields that are no longer part of the product.
alter table if exists public.profiles
  drop column if exists show_in_ranking;

alter table if exists public.profiles
  drop column if exists ranking_name;

notify pgrst, 'reload schema';

commit;

-- Verification: every result should be an empty array / zero dead entitlements.
select
  'remaining_gamification_tables' as check_name,
  coalesce(jsonb_agg(table_name order by table_name), '[]'::jsonb) as remaining
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'challenge_run_days',
    'challenge_runs',
    'user_trophies',
    'trophy_definitions',
    'profile_gamification'
  );

select
  'remaining_gamification_functions' as check_name,
  coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb) as remaining
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'nt_award_trophies',
    'nt_public_leaderboard',
    'nt_public_user_profile',
    'nt_public_user_trophies',
    'nt_public_leaderboard_pnl',
    'nt_public_user_profile_pnl',
    'recompute_profile_gamification'
  );

select
  'remaining_ranking_profile_columns' as check_name,
  coalesce(jsonb_agg(column_name order by column_name), '[]'::jsonb) as remaining
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('show_in_ranking', 'ranking_name');

create temp table if not exists ntj_cleanup_verification (
  check_name text primary key,
  remaining jsonb not null
) on commit drop;

do $$
declare
  remaining_count bigint := 0;
begin
  if to_regclass('public.user_entitlements') is not null then
    execute $sql$
      select count(*)
      from public.user_entitlements
      where entitlement_key in ('page_challenges', 'page_global_ranking')
    $sql$ into remaining_count;
  end if;

  insert into ntj_cleanup_verification (check_name, remaining)
  values ('remaining_dead_entitlements', to_jsonb(remaining_count))
  on conflict (check_name) do update
  set remaining = excluded.remaining;
end $$;

select check_name, remaining
from ntj_cleanup_verification
order by check_name;
