create table if not exists public.lifecycle_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null,
  email text not null,
  email_key text not null,
  trigger_key text not null,
  status text not null default 'processing',
  metadata jsonb not null default '{}'::jsonb,
  last_error text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lifecycle_email_deliveries_status_check
    check (status in ('processing', 'sent', 'failed'))
);

create unique index if not exists lifecycle_email_deliveries_trigger_key_idx
  on public.lifecycle_email_deliveries (email_key, trigger_key);

create index if not exists lifecycle_email_deliveries_user_idx
  on public.lifecycle_email_deliveries (user_id, created_at desc);

create index if not exists lifecycle_email_deliveries_email_idx
  on public.lifecycle_email_deliveries (email, created_at desc);

create index if not exists lifecycle_email_deliveries_status_idx
  on public.lifecycle_email_deliveries (status, created_at desc);

alter table public.lifecycle_email_deliveries enable row level security;

drop policy if exists "lifecycle_email_deliveries_service_only" on public.lifecycle_email_deliveries;
create policy "lifecycle_email_deliveries_service_only"
  on public.lifecycle_email_deliveries
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop trigger if exists lifecycle_email_deliveries_set_updated_at on public.lifecycle_email_deliveries;
create trigger lifecycle_email_deliveries_set_updated_at
before update on public.lifecycle_email_deliveries
for each row
execute function public.set_updated_at();

notify pgrst, 'reload schema';
