-- Growth Plan phases + mode
alter table public.growth_plans
  add column if not exists plan_mode text,
  add column if not exists plan_phases jsonb;

update public.growth_plans
  set plan_mode = coalesce(plan_mode, 'auto')
where plan_mode is null;

update public.growth_plans
  set plan_phases = coalesce(plan_phases, '[]'::jsonb)
where plan_phases is null;
