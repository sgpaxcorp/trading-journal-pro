-- Dedupe support for broker_order_events
alter table if exists public.broker_order_events
  add column if not exists event_hash text;

create unique index if not exists broker_order_events_event_hash_uidx
  on public.broker_order_events (user_id, account_id, broker, event_hash);
