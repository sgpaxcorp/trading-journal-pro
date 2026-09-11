create or replace function public.check_ai_usage_budget(
  p_user_id uuid,
  p_category text,
  p_user_daily_limit numeric,
  p_global_daily_limit numeric,
  p_global_monthly_limit numeric,
  p_category_daily_limit numeric
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with boundaries as (
    select
      date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' as day_start,
      date_trunc('month', now() at time zone 'UTC') at time zone 'UTC' as month_start
  ), totals as (
    select
      coalesce(sum(estimated_cost_usd) filter (where created_at >= boundaries.day_start), 0)::numeric as global_daily,
      coalesce(sum(estimated_cost_usd) filter (where created_at >= boundaries.month_start), 0)::numeric as global_monthly,
      coalesce(sum(estimated_cost_usd) filter (
        where p_user_id is not null and user_id = p_user_id and created_at >= boundaries.day_start
      ), 0)::numeric as user_daily,
      coalesce(sum(estimated_cost_usd) filter (
        where category = p_category and created_at >= boundaries.day_start
      ), 0)::numeric as category_daily
    from public.ai_usage_events
    cross join boundaries
  )
  select jsonb_build_object(
    'allowed',
      global_daily < p_global_daily_limit
      and global_monthly < p_global_monthly_limit
      and (p_user_id is null or user_daily < p_user_daily_limit)
      and (p_category_daily_limit <= 0 or category_daily < p_category_daily_limit),
    'globalDailyUsd', global_daily,
    'globalMonthlyUsd', global_monthly,
    'userDailyUsd', user_daily,
    'categoryDailyUsd', category_daily,
    'limits', jsonb_build_object(
      'globalDailyUsd', p_global_daily_limit,
      'globalMonthlyUsd', p_global_monthly_limit,
      'userDailyUsd', p_user_daily_limit,
      'categoryDailyUsd', p_category_daily_limit
    )
  )
  from totals;
$$;

revoke all on function public.check_ai_usage_budget(uuid, text, numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.check_ai_usage_budget(uuid, text, numeric, numeric, numeric, numeric)
  to service_role;

notify pgrst, 'reload schema';
