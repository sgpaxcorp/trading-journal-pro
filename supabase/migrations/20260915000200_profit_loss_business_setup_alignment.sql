-- Connect the Advanced Profit & Loss setup to the approved Trading Business Plan.
-- Capital allocation remains separate from operating expenses.

alter table if exists public.profit_loss_profiles
  add column if not exists capital_scope text not null default 'single_account',
  add column if not exists capital_account_ids uuid[] not null default '{}'::uuid[],
  add column if not exists capital_allocation jsonb not null default '{}'::jsonb,
  add column if not exists source_plan_account_id uuid references public.trading_accounts(id) on delete set null,
  add column if not exists setup_completed_at timestamptz,
  add column if not exists setup_version integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profit_loss_profiles_capital_scope_check'
      and conrelid = 'public.profit_loss_profiles'::regclass
  ) then
    alter table public.profit_loss_profiles
      add constraint profit_loss_profiles_capital_scope_check
      check (capital_scope in ('single_account', 'all_accounts'));
  end if;
end $$;

update public.profit_loss_profiles
set
  capital_account_ids = array[account_id],
  capital_allocation = jsonb_build_object(account_id::text, initial_capital),
  source_plan_account_id = account_id
where account_id is not null
  and coalesce(array_length(capital_account_ids, 1), 0) = 0
  and initial_capital > 0;

notify pgrst, 'reload schema';
