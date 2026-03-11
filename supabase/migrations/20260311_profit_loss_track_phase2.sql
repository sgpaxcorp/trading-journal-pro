create table if not exists public.profit_loss_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.trading_accounts(id) on delete cascade,
  category text not null
    check (category in ('subscription', 'data', 'education', 'funding', 'software', 'mentorship', 'broker', 'admin', 'other')),
  monthly_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profit_loss_budgets
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists account_id uuid references public.trading_accounts(id) on delete cascade,
  add column if not exists category text,
  add column if not exists monthly_amount numeric(14,2) not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profit_loss_budgets_category_check'
      and conrelid = 'public.profit_loss_budgets'::regclass
  ) then
    alter table public.profit_loss_budgets
      add constraint profit_loss_budgets_category_check
      check (category in ('subscription', 'data', 'education', 'funding', 'software', 'mentorship', 'broker', 'admin', 'other'));
  end if;
end $$;

create unique index if not exists profit_loss_budgets_user_account_category_uidx
  on public.profit_loss_budgets (
    user_id,
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    category
  );

create index if not exists profit_loss_budgets_user_idx
  on public.profit_loss_budgets(user_id);

drop trigger if exists set_profit_loss_budgets_updated_at on public.profit_loss_budgets;
create trigger set_profit_loss_budgets_updated_at
  before update on public.profit_loss_budgets
  for each row execute function public.set_updated_at();

alter table public.profit_loss_budgets enable row level security;

drop policy if exists "profit_loss_budgets_select_own" on public.profit_loss_budgets;
create policy "profit_loss_budgets_select_own"
  on public.profit_loss_budgets
  for select
  to authenticated
  using (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_budgets.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

drop policy if exists "profit_loss_budgets_insert_own" on public.profit_loss_budgets;
create policy "profit_loss_budgets_insert_own"
  on public.profit_loss_budgets
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_budgets.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

drop policy if exists "profit_loss_budgets_update_own" on public.profit_loss_budgets;
create policy "profit_loss_budgets_update_own"
  on public.profit_loss_budgets
  for update
  to authenticated
  using (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_budgets.account_id
          and ta.user_id = auth.uid()
      )
    )
  )
  with check (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_budgets.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

drop policy if exists "profit_loss_budgets_delete_own" on public.profit_loss_budgets;
create policy "profit_loss_budgets_delete_own"
  on public.profit_loss_budgets
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    and (
      account_id is null
      or exists (
        select 1 from public.trading_accounts ta
        where ta.id = profit_loss_budgets.account_id
          and ta.user_id = auth.uid()
      )
    )
  );

notify pgrst, 'reload schema';
