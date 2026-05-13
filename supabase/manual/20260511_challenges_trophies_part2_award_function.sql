-- Part 2/4: Trophy award RPC.
-- Run after part 1.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profile_gamification'
      and column_name = 'badges'
      and udt_name like '\_%'
  ) then
    alter table public.profile_gamification alter column badges drop default;
    alter table public.profile_gamification
      alter column badges type jsonb
      using to_jsonb(coalesce(badges, array[]::text[]));
    alter table public.profile_gamification alter column badges set default '[]'::jsonb;
  end if;
end $$;

create or replace function public.nt_best_streak_from_dates(input_dates date[])
returns integer
language plpgsql
immutable
as $$
declare
  d date;
  prev_d date;
  current_streak integer := 0;
  best_streak integer := 0;
begin
  if input_dates is null then
    return 0;
  end if;

  for d in
    select distinct x
    from unnest(input_dates) as x
    where x is not null
    order by x
  loop
    if prev_d is null then
      current_streak := 1;
    elsif d = prev_d + 1 then
      current_streak := current_streak + 1;
    else
      current_streak := 1;
    end if;

    best_streak := greatest(best_streak, current_streak);
    prev_d := d;
  end loop;

  return best_streak;
end;
$$;

create or replace function public.nt_award_trophies()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  journal_dates date[] := array[]::date[];
  days_logged integer := 0;
  best_streak integer := 0;
  plan_created integer := 0;
  challenges_completed integer := 0;
  daily_goal_reached integer := 0;
  weekly_goal_reached integer := 0;
  monthly_goal_reached integer := 0;
  quarterly_goal_reached integer := 0;
  inserted_count integer := 0;
  trophy_xp integer := 0;
  challenge_xp integer := 0;
  trophy_count integer := 0;
  xp_total integer := 0;
begin
  if uid is null then
    return jsonb_build_object('new_trophies', 0);
  end if;

  select coalesce(array_agg(distinct je.date::date order by je.date::date), array[]::date[])
    into journal_dates
  from public.journal_entries je
  where je.user_id = uid;

  days_logged := coalesce(array_length(journal_dates, 1), 0);
  best_streak := public.nt_best_streak_from_dates(journal_dates);

  select case when exists (
    select 1 from public.growth_plans gp where gp.user_id = uid limit 1
  ) then 1 else 0 end
    into plan_created;

  select count(*)::int
    into challenges_completed
  from public.challenge_runs cr
  where cr.user_id = uid and cr.status = 'completed';

  select count(distinct gad.period_key)::int
    into daily_goal_reached
  from public.goal_achievement_deliveries gad
  where gad.user_id = uid and gad.channel = 'inapp' and gad.goal_scope = 'day';

  select count(distinct gad.period_key)::int
    into weekly_goal_reached
  from public.goal_achievement_deliveries gad
  where gad.user_id = uid and gad.channel = 'inapp' and gad.goal_scope = 'week';

  select count(distinct gad.period_key)::int
    into monthly_goal_reached
  from public.goal_achievement_deliveries gad
  where gad.user_id = uid and gad.channel = 'inapp' and gad.goal_scope = 'month';

  select count(distinct gad.period_key)::int
    into quarterly_goal_reached
  from public.goal_achievement_deliveries gad
  where gad.user_id = uid and gad.channel = 'inapp' and gad.goal_scope = 'quarter';

  with eligible as (
    select td.id
    from public.trophy_definitions td
    cross join lateral (
      select case
        when td.rule_key in ('plan_created', 'growth_plan_created', 'growth_plan_saved', 'growth_plan_complete', 'growth_plan_completed', 'plan_saved', 'plan_completed') then plan_created
        when td.rule_key in ('days_logged', 'journal_days', 'journaling_days', 'days_traded', 'trading_days_logged', 'journal_entries', 'journal_days_logged') then days_logged
        when td.rule_key in ('best_streak', 'journal_streak', 'streak_best', 'best_streak_days', 'longest_streak', 'streak_days') then best_streak
        when td.rule_key in ('challenges_completed', 'challenge_completed', 'completed_challenges', 'challenges_done', 'challenges_finished') then challenges_completed
        when td.rule_key in ('daily_goal_reached', 'daily_goals_reached', 'daily_goal_hits', 'goal_days_hit') then daily_goal_reached
        when td.rule_key in ('weekly_goal_reached', 'weekly_goals_reached', 'weekly_goal_hits') then weekly_goal_reached
        when td.rule_key in ('monthly_goal_reached', 'monthly_goals_reached', 'monthly_goal_hits') then monthly_goal_reached
        when td.rule_key in ('quarterly_goal_reached', 'quarter_goals_reached', 'quarterly_goals_reached', 'quarterly_goal_hits') then quarterly_goal_reached
        else 0
      end as current_value
    ) c
    where not exists (
      select 1
      from public.user_trophies ut
      where ut.user_id = uid and ut.trophy_id::text = td.id::text
    )
    and (
      (td.rule_op = 'eq' and c.current_value = td.rule_value)
      or (td.rule_op = 'lte' and c.current_value <= td.rule_value)
      or (coalesce(td.rule_op, 'gte') = 'gte' and c.current_value >= td.rule_value)
    )
  ),
  inserted as (
    insert into public.user_trophies (user_id, trophy_id, earned_at)
    select uid, eligible.id, now()
    from eligible
    on conflict (user_id, trophy_id) do nothing
    returning trophy_id
  )
  select count(*)::int into inserted_count from inserted;

  select
    coalesce(sum(td.xp), 0)::int,
    count(*)::int
    into trophy_xp, trophy_count
  from public.user_trophies ut
  join public.trophy_definitions td on td.id::text = ut.trophy_id::text
  where ut.user_id = uid;

  select coalesce(sum(cr.xp_earned), 0)::int
    into challenge_xp
  from public.challenge_runs cr
  where cr.user_id = uid;

  xp_total := coalesce(trophy_xp, 0) + coalesce(challenge_xp, 0);

  insert into public.profile_gamification (user_id, xp, level, tier, badges, updated_at)
  values (
    uid,
    xp_total,
    greatest(1, floor(xp_total / 500.0)::int + 1),
    case
      when xp_total >= 5000 then 'Elite'
      when xp_total >= 2500 then 'Gold'
      when xp_total >= 1000 then 'Silver'
      else 'Bronze'
    end,
    coalesce((select pg.badges from public.profile_gamification pg where pg.user_id = uid), '[]'::jsonb),
    now()
  )
  on conflict (user_id) do update set
    xp = excluded.xp,
    level = excluded.level,
    tier = excluded.tier,
    badges = excluded.badges,
    updated_at = excluded.updated_at;

  return jsonb_build_object('new_trophies', inserted_count);
end;
$$;

revoke all on function public.nt_award_trophies() from public;
grant execute on function public.nt_award_trophies() to authenticated;

select 'part 2 complete: nt_award_trophies' as status;
