create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  request_id text null,
  feature text not null,
  category text not null default 'shared'
    check (category in ('shared', 'advanced', 'support', 'sales', 'market_intelligence')),
  operation text not null,
  provider text not null default 'openai',
  api_kind text not null default 'chat_completions',
  model text not null,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  file_search_calls integer not null default 0 check (file_search_calls >= 0),
  estimated_cost_usd numeric(16, 8) not null default 0 check (estimated_cost_usd >= 0),
  pricing_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_created_at_idx
  on public.ai_usage_events (created_at desc);

create index if not exists ai_usage_events_user_created_at_idx
  on public.ai_usage_events (user_id, created_at desc);

create index if not exists ai_usage_events_category_feature_created_at_idx
  on public.ai_usage_events (category, feature, created_at desc);

alter table public.ai_usage_events enable row level security;

revoke all on table public.ai_usage_events from anon, authenticated;
grant all on table public.ai_usage_events to service_role;

create or replace function public.admin_ai_usage_summary(
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language sql
security definer
set search_path = public, auth
as $$
  with filtered as (
    select
      e.*,
      case
        when lower(coalesce(p.plan, '')) = 'advanced' then 'advanced'
        when lower(coalesce(p.plan, '')) = 'core' then 'core'
        when e.user_id is null then 'system'
        else 'unassigned'
      end as plan_tier,
      coalesce(u.email, 'System / unavailable') as user_email
    from public.ai_usage_events e
    left join public.profiles p on p.id = e.user_id
    left join auth.users u on u.id = e.user_id
    where e.created_at >= p_start
      and e.created_at < p_end
  ),
  totals as (
    select
      count(*)::bigint as requests,
      count(distinct user_id)::bigint as active_users,
      coalesce(sum(input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(cached_input_tokens), 0)::bigint as cached_input_tokens,
      coalesce(sum(output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(reasoning_tokens), 0)::bigint as reasoning_tokens,
      coalesce(sum(total_tokens), 0)::bigint as total_tokens,
      coalesce(sum(file_search_calls), 0)::bigint as file_search_calls,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd,
      coalesce(sum(estimated_cost_usd) filter (
        where category <> 'market_intelligence'
      ), 0)::numeric as base_product_cost_usd,
      coalesce(sum(estimated_cost_usd) filter (
        where category = 'market_intelligence'
      ), 0)::numeric as market_intelligence_cost_usd
    from filtered
  ),
  by_day_rows as (
    select
      to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as day,
      count(*)::bigint as requests,
      coalesce(sum(total_tokens), 0)::bigint as total_tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from filtered
    group by 1
    order by 1
  ),
  by_feature_rows as (
    select
      category,
      feature,
      count(*)::bigint as requests,
      count(distinct user_id)::bigint as active_users,
      coalesce(sum(total_tokens), 0)::bigint as total_tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from filtered
    group by category, feature
    order by estimated_cost_usd desc, requests desc
  ),
  by_model_rows as (
    select
      model,
      count(*)::bigint as requests,
      coalesce(sum(input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(cached_input_tokens), 0)::bigint as cached_input_tokens,
      coalesce(sum(output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd,
      bool_or(coalesce((pricing_snapshot ->> 'matched')::boolean, false)) as pricing_matched
    from filtered
    group by model
    order by estimated_cost_usd desc, requests desc
  ),
  by_plan_rows as (
    select
      plan_tier,
      count(*)::bigint as requests,
      count(distinct user_id)::bigint as active_users,
      coalesce(sum(total_tokens), 0)::bigint as total_tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from filtered
    where category <> 'market_intelligence'
    group by plan_tier
    order by estimated_cost_usd desc, requests desc
  ),
  top_user_rows as (
    select
      user_id,
      user_email,
      plan_tier,
      count(*)::bigint as requests,
      coalesce(sum(total_tokens), 0)::bigint as total_tokens,
      coalesce(sum(estimated_cost_usd), 0)::numeric as estimated_cost_usd
    from filtered
    where user_id is not null
    group by user_id, user_email, plan_tier
    order by estimated_cost_usd desc, requests desc
    limit 25
  )
  select jsonb_build_object(
    'start', p_start,
    'end', p_end,
    'totals', (select to_jsonb(totals) from totals),
    'byDay', coalesce((select jsonb_agg(to_jsonb(by_day_rows)) from by_day_rows), '[]'::jsonb),
    'byFeature', coalesce((select jsonb_agg(to_jsonb(by_feature_rows)) from by_feature_rows), '[]'::jsonb),
    'byModel', coalesce((select jsonb_agg(to_jsonb(by_model_rows)) from by_model_rows), '[]'::jsonb),
    'byPlan', coalesce((select jsonb_agg(to_jsonb(by_plan_rows)) from by_plan_rows), '[]'::jsonb),
    'topUsers', coalesce((select jsonb_agg(to_jsonb(top_user_rows)) from top_user_rows), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_ai_usage_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_ai_usage_summary(timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
