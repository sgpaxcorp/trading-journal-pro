alter table public.profit_loss_profiles
  add column if not exists renewal_alert_days integer not null default 7,
  add column if not exists overspend_alert_pct numeric(8,4) not null default 0.10,
  add column if not exists variable_cost_alert_ratio numeric(8,4) not null default 0.25;

update public.profit_loss_profiles
set renewal_alert_days = 7
where renewal_alert_days is null or renewal_alert_days <= 0;

update public.profit_loss_profiles
set overspend_alert_pct = 0.10
where overspend_alert_pct is null or overspend_alert_pct < 0;

update public.profit_loss_profiles
set variable_cost_alert_ratio = 0.25
where variable_cost_alert_ratio is null or variable_cost_alert_ratio < 0;

notify pgrst, 'reload schema';
