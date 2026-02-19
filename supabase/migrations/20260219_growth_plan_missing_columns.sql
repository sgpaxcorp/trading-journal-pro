-- Growth Plan: ensure new columns exist (safe re-run)
alter table public.growth_plans
  add column if not exists plan_style text,
  add column if not exists target_date date,
  add column if not exists target_multiple numeric,
  add column if not exists plan_start_date date,
  add column if not exists planned_withdrawals jsonb,
  add column if not exists plan_mode text,
  add column if not exists plan_phases jsonb,
  add column if not exists reset_count integer,
  add column if not exists last_reset_at timestamptz;

update public.growth_plans
  set plan_mode = coalesce(plan_mode, 'auto')
where plan_mode is null;

update public.growth_plans
  set plan_phases = coalesce(plan_phases, '[]'::jsonb)
where plan_phases is null;

update public.growth_plans
  set planned_withdrawals = coalesce(planned_withdrawals, '[]'::jsonb)
where planned_withdrawals is null;

update public.growth_plans
  set reset_count = coalesce(reset_count, 0)
where reset_count is null;
