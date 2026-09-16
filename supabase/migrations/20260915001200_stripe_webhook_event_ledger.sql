create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  attempts integer not null default 1,
  stripe_created_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
revoke all on table public.stripe_webhook_events from public, anon, authenticated;
grant all on table public.stripe_webhook_events to service_role;

drop trigger if exists stripe_webhook_events_set_updated_at on public.stripe_webhook_events;
create trigger stripe_webhook_events_set_updated_at
  before update on public.stripe_webhook_events
  for each row execute function public.set_updated_at();

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_stripe_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing public.stripe_webhook_events%rowtype;
begin
  insert into public.stripe_webhook_events (
    event_id, event_type, status, stripe_created_at
  ) values (
    p_event_id, p_event_type, 'processing', p_stripe_created_at
  )
  on conflict (event_id) do nothing;

  if found then
    return jsonb_build_object('claimed', true, 'status', 'processing', 'attempts', 1);
  end if;

  select * into existing
  from public.stripe_webhook_events
  where event_id = p_event_id
  for update;

  if existing.status = 'completed' then
    return jsonb_build_object('claimed', false, 'status', 'completed', 'attempts', existing.attempts);
  end if;

  if existing.status = 'processing' and existing.updated_at > now() - interval '10 minutes' then
    return jsonb_build_object('claimed', false, 'status', 'processing', 'attempts', existing.attempts);
  end if;

  update public.stripe_webhook_events
  set status = 'processing', attempts = attempts + 1, last_error = null
  where event_id = p_event_id
  returning * into existing;

  return jsonb_build_object('claimed', true, 'status', 'processing', 'attempts', existing.attempts);
end;
$$;

revoke all on function public.claim_stripe_webhook_event(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_stripe_webhook_event(text, text, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
