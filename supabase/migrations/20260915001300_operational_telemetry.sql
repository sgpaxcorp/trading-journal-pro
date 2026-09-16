create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'error', 'critical')),
  source text not null,
  event_type text not null,
  message text not null,
  route_path text,
  fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists operational_events_created_idx
  on public.operational_events(created_at desc);
create index if not exists operational_events_severity_created_idx
  on public.operational_events(severity, created_at desc);

create table if not exists public.operational_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  fingerprint text not null,
  delivered_at timestamptz,
  delivery_error text,
  created_at timestamptz not null default now()
);

alter table public.operational_events enable row level security;
alter table public.operational_alert_deliveries enable row level security;
revoke all on table public.operational_events from public, anon, authenticated;
revoke all on table public.operational_alert_deliveries from public, anon, authenticated;
grant all on table public.operational_events to service_role;
grant all on table public.operational_alert_deliveries to service_role;

notify pgrst, 'reload schema';
