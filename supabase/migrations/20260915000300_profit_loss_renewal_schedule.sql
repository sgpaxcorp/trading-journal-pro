-- Store an explicit renewal schedule separately from a contract end date.

alter table if exists public.profit_loss_costs
  add column if not exists next_renewal_at date,
  add column if not exists auto_renews boolean not null default true;

-- The old form showed two unlabeled dates. Equal start/end dates on recurring
-- items were commonly entered as the renewal date, not a real contract end.
update public.profit_loss_costs
set
  next_renewal_at = ends_at,
  ends_at = null
where billing_cycle <> 'one_time'
  and starts_at is not null
  and ends_at = starts_at
  and next_renewal_at is null;

notify pgrst, 'reload schema';
