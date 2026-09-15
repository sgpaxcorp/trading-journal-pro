alter table public.goal_achievement_deliveries
  drop constraint if exists goal_achievement_deliveries_goal_scope_check;

alter table public.goal_achievement_deliveries
  add constraint goal_achievement_deliveries_goal_scope_check
  check (goal_scope in ('day', 'week', 'month', 'quarter', 'semiannual', 'annual'));
