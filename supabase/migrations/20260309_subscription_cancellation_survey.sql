alter table public.subscription_cancellations
  add column if not exists usage_status text null,
  add column if not exists improvement_area text null,
  add column if not exists return_trigger text null;
