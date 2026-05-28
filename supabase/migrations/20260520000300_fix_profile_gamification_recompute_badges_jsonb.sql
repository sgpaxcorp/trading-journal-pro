alter table if exists public.profile_gamification
  add column if not exists computed_at timestamptz default now();

drop function if exists public.recompute_profile_gamification(uuid);

create or replace function public.recompute_profile_gamification(p_user_id uuid)
returns public.profile_gamification
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trophy_xp integer := 0;
  v_challenge_xp integer := 0;
  v_xp_total integer := 0;
  v_level integer := 1;
  v_tier text := 'Bronze';
  v_badges jsonb := '[]'::jsonb;
  v_row public.profile_gamification;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;

  if auth.uid() is distinct from p_user_id
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
  then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select
    coalesce(sum(td.xp), 0)::int,
    coalesce(jsonb_agg(distinct td.title) filter (where td.title is not null), '[]'::jsonb)
    into v_trophy_xp, v_badges
  from public.user_trophies ut
  join public.trophy_definitions td on td.id::text = ut.trophy_id::text
  where ut.user_id = p_user_id;

  select coalesce(sum(cr.xp_earned), 0)::int
    into v_challenge_xp
  from public.challenge_runs cr
  where cr.user_id = p_user_id;

  v_xp_total := coalesce(v_trophy_xp, 0) + coalesce(v_challenge_xp, 0);
  v_level := greatest(1, floor(v_xp_total / 500.0)::int + 1);
  v_tier := case
    when v_xp_total >= 5000 then 'Elite'
    when v_xp_total >= 2500 then 'Gold'
    when v_xp_total >= 1000 then 'Silver'
    else 'Bronze'
  end;

  if v_badges is null or jsonb_typeof(v_badges) <> 'array' then
    v_badges := '[]'::jsonb;
  end if;

  insert into public.profile_gamification (user_id, xp, level, tier, badges, computed_at, updated_at)
  values (p_user_id, v_xp_total, v_level, v_tier, v_badges, now(), now())
  on conflict (user_id)
  do update set
    xp = excluded.xp,
    level = excluded.level,
    tier = excluded.tier,
    badges = excluded.badges,
    computed_at = excluded.computed_at,
    updated_at = excluded.updated_at
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.recompute_profile_gamification(uuid) from public;
grant execute on function public.recompute_profile_gamification(uuid) to authenticated;
grant execute on function public.recompute_profile_gamification(uuid) to service_role;

notify pgrst, 'reload schema';
