alter table public.push_tokens
  add column if not exists last_daily_motivation_date date;

create index if not exists push_tokens_daily_motivation_due_idx
  on public.push_tokens(last_daily_motivation_date, id)
  where daily_reminder_enabled = true;

create or replace function public.claim_daily_motivation_tokens(
  p_delivery_date date,
  p_limit integer default 750,
  p_user_id uuid default null
)
returns table (id uuid, user_id uuid, expo_push_token text, locale text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select pt.id
    from public.push_tokens pt
    where pt.daily_reminder_enabled = true
      and (p_user_id is null or pt.user_id = p_user_id)
      and (pt.last_daily_motivation_date is null or pt.last_daily_motivation_date < p_delivery_date)
    order by pt.id
    for update skip locked
    limit least(greatest(coalesce(p_limit, 750), 1), 1000)
  ), claimed as (
    update public.push_tokens pt
    set last_daily_motivation_date = p_delivery_date,
        updated_at = now()
    from candidates c
    where pt.id = c.id
    returning pt.id, pt.user_id, pt.expo_push_token, pt.locale
  )
  select claimed.id, claimed.user_id, claimed.expo_push_token, claimed.locale
  from claimed;
end;
$$;

create or replace function public.release_daily_motivation_tokens(
  p_ids uuid[],
  p_delivery_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released integer := 0;
begin
  update public.push_tokens
  set last_daily_motivation_date = null,
      updated_at = now()
  where id = any(coalesce(p_ids, array[]::uuid[]))
    and last_daily_motivation_date = p_delivery_date;
  get diagnostics released = row_count;
  return released;
end;
$$;

create or replace function public.record_daily_motivation_inapp(
  p_deliveries jsonb,
  p_delivery_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  insert into public.ntj_alert_rules (
    user_id, key, trigger_type, title, message, severity, enabled, channels, config
  )
  select distinct on (d.user_id)
    d.user_id, 'daily_motivation', 'daily_motivation', d.title, d.message,
    'info', true, array['inapp']::text[],
    jsonb_build_object('source', 'system', 'core', true, 'kind', 'reminder', 'category', 'motivation')
  from jsonb_to_recordset(coalesce(p_deliveries, '[]'::jsonb))
    as d(user_id uuid, message_id uuid, title text, message text)
  on conflict (user_id, key) do update
  set title = excluded.title,
      message = excluded.message,
      enabled = true,
      updated_at = now();

  insert into public.ntj_alert_events (
    user_id, rule_id, date, status, triggered_at, dismissed_until, acknowledged_at, payload
  )
  select distinct on (d.user_id)
    d.user_id, r.id, p_delivery_date, 'active', now(), null, null,
    jsonb_build_object(
      'title', d.title, 'message', d.message, 'severity', 'info',
      'channels', jsonb_build_array('inapp'), 'kind', 'reminder',
      'category', 'motivation', 'message_id', d.message_id
    )
  from jsonb_to_recordset(coalesce(p_deliveries, '[]'::jsonb))
    as d(user_id uuid, message_id uuid, title text, message text)
  join public.ntj_alert_rules r
    on r.user_id = d.user_id and r.key = 'daily_motivation'
  on conflict (user_id, rule_id, date) do update
  set payload = excluded.payload,
      status = 'active',
      triggered_at = excluded.triggered_at,
      updated_at = now();

  insert into public.motivational_message_deliveries (
    message_id, user_id, delivery_date, channel
  )
  select distinct d.message_id, d.user_id, p_delivery_date, 'inapp'
  from jsonb_to_recordset(coalesce(p_deliveries, '[]'::jsonb))
    as d(user_id uuid, message_id uuid, title text, message text)
  on conflict (message_id, user_id, delivery_date, channel) do nothing;
  get diagnostics inserted_count = row_count;

  return inserted_count;
end;
$$;

revoke all on function public.claim_daily_motivation_tokens(date, integer, uuid) from public, anon, authenticated;
revoke all on function public.release_daily_motivation_tokens(uuid[], date) from public, anon, authenticated;
revoke all on function public.record_daily_motivation_inapp(jsonb, date) from public, anon, authenticated;
grant execute on function public.claim_daily_motivation_tokens(date, integer, uuid) to service_role;
grant execute on function public.release_daily_motivation_tokens(uuid[], date) to service_role;
grant execute on function public.record_daily_motivation_inapp(jsonb, date) to service_role;

notify pgrst, 'reload schema';
