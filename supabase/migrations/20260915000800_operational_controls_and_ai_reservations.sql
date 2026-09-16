insert into public.admin_settings (key, value_json)
values (
  'operational_controls',
  '{"signup":true,"checkout":true,"ai":true,"pdf_uploads":true,"email_delivery":true,"broker_connections":true}'::jsonb
)
on conflict (key) do nothing;

create table if not exists public.ai_usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  category text not null,
  estimated_cost_usd numeric not null check (estimated_cost_usd >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_reservations_expires_idx
  on public.ai_usage_reservations(expires_at);
create index if not exists ai_usage_reservations_user_category_idx
  on public.ai_usage_reservations(user_id, category, created_at);

alter table public.ai_usage_reservations enable row level security;
revoke all on table public.ai_usage_reservations from public, anon, authenticated;
grant all on table public.ai_usage_reservations to service_role;

create or replace function public.reserve_ai_usage_budget(
  p_user_id uuid,
  p_category text,
  p_estimated_cost_usd numeric,
  p_user_daily_limit numeric,
  p_global_daily_limit numeric,
  p_global_monthly_limit numeric,
  p_category_daily_limit numeric,
  p_user_concurrency_limit integer,
  p_global_concurrency_limit integer,
  p_ttl_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  month_start timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  global_daily numeric := 0;
  global_monthly numeric := 0;
  user_daily numeric := 0;
  category_daily numeric := 0;
  active_global integer := 0;
  active_user integer := 0;
  reservation_id uuid;
  allowed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('neurotrader-ai-budget', 0));
  delete from public.ai_usage_reservations where expires_at <= now();

  select
    coalesce(sum(estimated_cost_usd) filter (where created_at >= day_start), 0),
    coalesce(sum(estimated_cost_usd) filter (where created_at >= month_start), 0),
    coalesce(sum(estimated_cost_usd) filter (where p_user_id is not null and user_id = p_user_id and created_at >= day_start), 0),
    coalesce(sum(estimated_cost_usd) filter (where category = p_category and created_at >= day_start), 0)
  into global_daily, global_monthly, user_daily, category_daily
  from public.ai_usage_events;

  select
    global_daily + coalesce(sum(estimated_cost_usd) filter (where created_at >= day_start), 0),
    global_monthly + coalesce(sum(estimated_cost_usd) filter (where created_at >= month_start), 0),
    user_daily + coalesce(sum(estimated_cost_usd) filter (where p_user_id is not null and user_id = p_user_id and created_at >= day_start), 0),
    category_daily + coalesce(sum(estimated_cost_usd) filter (where category = p_category and created_at >= day_start), 0),
    count(*)::integer,
    count(*) filter (where p_user_id is not null and user_id = p_user_id)::integer
  into global_daily, global_monthly, user_daily, category_daily, active_global, active_user
  from public.ai_usage_reservations
  where expires_at > now();

  allowed :=
    global_daily + p_estimated_cost_usd <= p_global_daily_limit
    and global_monthly + p_estimated_cost_usd <= p_global_monthly_limit
    and (p_user_id is null or user_daily + p_estimated_cost_usd <= p_user_daily_limit)
    and (p_category_daily_limit <= 0 or category_daily + p_estimated_cost_usd <= p_category_daily_limit)
    and active_global < greatest(1, p_global_concurrency_limit)
    and (p_user_id is null or active_user < greatest(1, p_user_concurrency_limit));

  if allowed then
    insert into public.ai_usage_reservations (
      user_id, category, estimated_cost_usd, expires_at
    ) values (
      p_user_id,
      p_category,
      greatest(0, p_estimated_cost_usd),
      now() + make_interval(secs => greatest(15, least(600, p_ttl_seconds)))
    ) returning id into reservation_id;
  end if;

  return jsonb_build_object(
    'allowed', allowed,
    'reservationId', reservation_id,
    'globalDailyUsd', global_daily,
    'globalMonthlyUsd', global_monthly,
    'userDailyUsd', user_daily,
    'categoryDailyUsd', category_daily,
    'activeGlobal', active_global,
    'activeUser', active_user
  );
end;
$$;

create or replace function public.settle_ai_usage_reservation(
  p_user_id uuid,
  p_category text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reservation_id uuid;
begin
  select id into reservation_id
  from public.ai_usage_reservations
  where user_id is not distinct from p_user_id
    and category = p_category
    and expires_at > now()
  order by created_at asc
  for update skip locked
  limit 1;

  if reservation_id is not null then
    delete from public.ai_usage_reservations where id = reservation_id;
  end if;
end;
$$;

revoke all on function public.reserve_ai_usage_budget(uuid, text, numeric, numeric, numeric, numeric, numeric, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.settle_ai_usage_reservation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_ai_usage_budget(uuid, text, numeric, numeric, numeric, numeric, numeric, integer, integer, integer)
  to service_role;
grant execute on function public.settle_ai_usage_reservation(uuid, text)
  to service_role;

notify pgrst, 'reload schema';
