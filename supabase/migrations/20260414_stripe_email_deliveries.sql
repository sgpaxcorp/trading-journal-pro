create table if not exists public.stripe_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id text not null,
  email_key text not null,
  email text not null,
  stripe_object_id text null,
  status text not null default 'processing',
  last_error text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_email_deliveries_status_check
    check (status in ('processing', 'sent', 'failed'))
);

create unique index if not exists stripe_email_deliveries_event_key_idx
  on public.stripe_email_deliveries (event_id, email_key);

create index if not exists stripe_email_deliveries_email_idx
  on public.stripe_email_deliveries (email, created_at desc);

create index if not exists stripe_email_deliveries_status_idx
  on public.stripe_email_deliveries (status, created_at desc);

alter table public.stripe_email_deliveries enable row level security;

drop policy if exists "stripe_email_deliveries_service_only" on public.stripe_email_deliveries;
create policy "stripe_email_deliveries_service_only"
  on public.stripe_email_deliveries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop trigger if exists stripe_email_deliveries_set_updated_at on public.stripe_email_deliveries;
create trigger stripe_email_deliveries_set_updated_at
before update on public.stripe_email_deliveries
for each row
execute function public.set_updated_at();

notify pgrst, 'reload schema';
