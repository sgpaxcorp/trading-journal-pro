alter table if exists public.trades
  add column if not exists account_id uuid;

do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'trading_accounts'
  )
  and not exists (
    select 1
    from pg_constraint
    where conname = 'trades_account_id_fkey'
      and conrelid = 'public.trades'::regclass
  ) then
    alter table public.trades
      add constraint trades_account_id_fkey
      foreign key (account_id)
      references public.trading_accounts(id)
      on delete set null;
  end if;
end
$$;

create index if not exists trades_user_account_id_idx
  on public.trades (user_id, account_id);

notify pgrst, 'reload schema';
