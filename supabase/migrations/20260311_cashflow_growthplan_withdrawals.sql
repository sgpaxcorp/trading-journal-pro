alter table if exists public.growth_plans
  add column if not exists planned_withdrawal_settings jsonb;

alter table if exists public.cashflows
  add column if not exists reason_code text,
  add column if not exists source_module text,
  add column if not exists linked_plan_withdrawal_id text;

alter table if exists public.ntj_cashflows
  add column if not exists reason_code text,
  add column if not exists source_module text,
  add column if not exists linked_plan_withdrawal_id text;
