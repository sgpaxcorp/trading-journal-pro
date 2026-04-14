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
      coalesce(sum(td.xp), 0)::int as xp_total,
      count(*)::int as trophies_count
    from public.user_trophies ut
    join public.trophy_definitions td on td.id::text = ut.trophy_id::text
    group by ut.user_id
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
          coalesce(tt.xp_total, 0) desc,
          coalesce(tt.trophies_count, 0) desc,
          vp.display_name asc,
          vp.user_id asc
      )::int as rank,
      vp.user_id,
      vp.display_name,
      vp.avatar_url,
      case
        when coalesce(tt.xp_total, 0) >= 5000 then 'Elite'
        when coalesce(tt.xp_total, 0) >= 2500 then 'Gold'
        when coalesce(tt.xp_total, 0) >= 1000 then 'Silver'
        else 'Bronze'
      end as tier,
      coalesce(tt.xp_total, 0)::int as xp_total,
      coalesce(tt.trophies_count, 0)::int as trophies_count
    from visible_profiles vp
    left join trophy_totals tt on tt.user_id = vp.user_id
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
      coalesce(sum(td.xp), 0)::int as xp_total,
      count(*)::int as trophies_count
    from public.user_trophies ut
    join public.trophy_definitions td on td.id::text = ut.trophy_id::text
    group by ut.user_id
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
          coalesce(tt.xp_total, 0) desc,
          coalesce(tt.trophies_count, 0) desc,
          vp.display_name asc,
          vp.user_id asc
      )::int as rank,
      vp.user_id
    from visible_profiles vp
    left join trophy_totals tt on tt.user_id = vp.user_id
    where vp.show_in_ranking = true
  ),
  target_profile as (
    select
      vp.user_id,
      vp.display_name,
      vp.avatar_url,
      vp.show_in_ranking,
      coalesce(tt.xp_total, 0)::int as xp_total,
      coalesce(tt.trophies_count, 0)::int as trophies_count
    from visible_profiles vp
    left join trophy_totals tt on tt.user_id = vp.user_id
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

drop function if exists public.nt_public_user_trophies(uuid);
create or replace function public.nt_public_user_trophies(target_user uuid)
returns table (
  trophy_id text,
  title text,
  description text,
  tier text,
  xp integer,
  category text,
  icon text,
  earned_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with target_profile as (
    select
      p.id as user_id,
      coalesce(p.show_in_ranking, false) as show_in_ranking
    from public.profiles p
    where p.id = target_user
  )
  select
    ut.trophy_id::text as trophy_id,
    td.title,
    td.description,
    td.tier,
    td.xp::int as xp,
    td.category,
    td.icon,
    ut.earned_at
  from target_profile tp
  join public.user_trophies ut on ut.user_id = tp.user_id
  join public.trophy_definitions td on td.id::text = ut.trophy_id::text
  where tp.show_in_ranking = true or auth.uid() = tp.user_id
  order by ut.earned_at desc, td.xp desc, td.title asc;
$$;

revoke all on function public.nt_public_leaderboard(integer, integer) from public;
revoke all on function public.nt_public_user_profile(uuid) from public;
revoke all on function public.nt_public_user_trophies(uuid) from public;

grant execute on function public.nt_public_leaderboard(integer, integer) to authenticated;
grant execute on function public.nt_public_user_profile(uuid) to authenticated;
grant execute on function public.nt_public_user_trophies(uuid) to authenticated;

notify pgrst, 'reload schema';
