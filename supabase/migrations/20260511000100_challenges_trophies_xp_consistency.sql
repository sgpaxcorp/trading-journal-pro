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

alter table if exists public.profiles
  add column if not exists ranking_name text,
  add column if not exists show_in_ranking boolean default false,
  add column if not exists avatar_url text;

create index if not exists profiles_show_in_ranking_idx
  on public.profiles(show_in_ranking)
  where show_in_ranking = true;

drop function if exists public.nt_public_leaderboard(integer, integer);
create or replace function public.nt_public_leaderboard(
  limit_num integer default 25,
  offset_num integer default 0
)
returns table (
  rank integer,
  user_id uuid,
  display_name text,
  avatar_url text,
  tier text,
  xp_total integer,
  trophies_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with trophy_totals as (
    select
      ut.user_id,
      coalesce(sum(td.xp), 0)::int as trophy_xp,
      count(*)::int as trophies_count
    from public.user_trophies ut
    join public.trophy_definitions td on td.id::text = ut.trophy_id::text
    group by ut.user_id
  ),
  challenge_totals as (
    select
      cr.user_id,
      coalesce(sum(cr.xp_earned), 0)::int as challenge_xp
    from public.challenge_runs cr
    group by cr.user_id
  ),
  visible_profiles as (
    select
      p.id as user_id,
      coalesce(
        nullif(p.ranking_name, ''),
        nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
        p.email,
        'Trader'
      ) as display_name,
      p.avatar_url,
      coalesce(p.show_in_ranking, false) as show_in_ranking
    from public.profiles p
  ),
  ranked as (
    select
      row_number() over (
        order by
          (coalesce(tt.trophy_xp, 0) + coalesce(ct.challenge_xp, 0)) desc,
          coalesce(tt.trophies_count, 0) desc,
          vp.display_name asc,
          vp.user_id asc
      )::int as rank,
      vp.user_id,
      vp.display_name,
      vp.avatar_url,
      case
        when (coalesce(tt.trophy_xp, 0) + coalesce(ct.challenge_xp, 0)) >= 5000 then 'Elite'
        when (coalesce(tt.trophy_xp, 0) + coalesce(ct.challenge_xp, 0)) >= 2500 then 'Gold'
        when (coalesce(tt.trophy_xp, 0) + coalesce(ct.challenge_xp, 0)) >= 1000 then 'Silver'
        else 'Bronze'
      end as tier,
      (coalesce(tt.trophy_xp, 0) + coalesce(ct.challenge_xp, 0))::int as xp_total,
      coalesce(tt.trophies_count, 0)::int as trophies_count
    from visible_profiles vp
    left join trophy_totals tt on tt.user_id = vp.user_id
    left join challenge_totals ct on ct.user_id = vp.user_id
    where vp.show_in_ranking = true
  )
  select
    ranked.rank,
    ranked.user_id,
    ranked.display_name,
    ranked.avatar_url,
    ranked.tier,
    ranked.xp_total,
    ranked.trophies_count
  from ranked
  order by ranked.rank
  limit greatest(limit_num, 1)
  offset greatest(offset_num, 0);
$$;

drop function if exists public.nt_public_user_profile(uuid);
create or replace function public.nt_public_user_profile(target_user uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  tier text,
  xp_total integer,
  trophies_count integer,
  level integer,
  rank integer,
  show_in_ranking boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with trophy_totals as (
    select
      ut.user_id,
      coalesce(sum(td.xp), 0)::int as trophy_xp,
      count(*)::int as trophies_count
    from public.user_trophies ut
    join public.trophy_definitions td on td.id::text = ut.trophy_id::text
    group by ut.user_id
  ),
  challenge_totals as (
    select
      cr.user_id,
      coalesce(sum(cr.xp_earned), 0)::int as challenge_xp
    from public.challenge_runs cr
    group by cr.user_id
  ),
  visible_profiles as (
    select
      p.id as user_id,
      coalesce(
        nullif(p.ranking_name, ''),
        nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
        p.email,
        'Trader'
      ) as display_name,
      p.avatar_url,
      coalesce(p.show_in_ranking, false) as show_in_ranking
    from public.profiles p
  ),
  ranked as (
    select
      row_number() over (
        order by
          (coalesce(tt.trophy_xp, 0) + coalesce(ct.challenge_xp, 0)) desc,
          coalesce(tt.trophies_count, 0) desc,
          vp.display_name asc,
          vp.user_id asc
      )::int as rank,
      vp.user_id
    from visible_profiles vp
    left join trophy_totals tt on tt.user_id = vp.user_id
    left join challenge_totals ct on ct.user_id = vp.user_id
    where vp.show_in_ranking = true
  ),
  target_profile as (
    select
      vp.user_id,
      vp.display_name,
      vp.avatar_url,
      vp.show_in_ranking,
      (coalesce(tt.trophy_xp, 0) + coalesce(ct.challenge_xp, 0))::int as xp_total,
      coalesce(tt.trophies_count, 0)::int as trophies_count
    from visible_profiles vp
    left join trophy_totals tt on tt.user_id = vp.user_id
    left join challenge_totals ct on ct.user_id = vp.user_id
    where vp.user_id = target_user
  )
  select
    tp.user_id,
    tp.display_name,
    tp.avatar_url,
    case
      when tp.xp_total >= 5000 then 'Elite'
      when tp.xp_total >= 2500 then 'Gold'
      when tp.xp_total >= 1000 then 'Silver'
      else 'Bronze'
    end as tier,
    tp.xp_total,
    tp.trophies_count,
    greatest(1, floor(tp.xp_total / 500.0)::int + 1) as level,
    case when tp.show_in_ranking then ranked.rank else null end as rank,
    tp.show_in_ranking
  from target_profile tp
  left join ranked on ranked.user_id = tp.user_id
  where tp.show_in_ranking = true or auth.uid() = tp.user_id;
$$;

revoke all on function public.nt_award_trophies() from public;
revoke all on function public.nt_public_leaderboard(integer, integer) from public;
revoke all on function public.nt_public_user_profile(uuid) from public;

grant execute on function public.nt_award_trophies() to authenticated;
grant execute on function public.nt_public_leaderboard(integer, integer) to authenticated;
grant execute on function public.nt_public_user_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
