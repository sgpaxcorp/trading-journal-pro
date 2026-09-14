-- A journal day belongs to a trading account. The legacy (user_id, date)
-- primary key blocked a second account on the same day even though the app
-- already writes and reads by (user_id, date, account_id).

alter table public.journal_entries
  add column if not exists id uuid default gen_random_uuid();

update public.journal_entries
set id = gen_random_uuid()
where id is null;

alter table public.journal_entries
  alter column id set default gen_random_uuid(),
  alter column id set not null;

do $$
declare
  primary_key_name text;
begin
  select constraint_name
    into primary_key_name
  from information_schema.table_constraints
  where table_schema = 'public'
    and table_name = 'journal_entries'
    and constraint_type = 'PRIMARY KEY'
  limit 1;

  if primary_key_name is not null then
    execute format(
      'alter table public.journal_entries drop constraint %I',
      primary_key_name
    );
  end if;
end
$$;

drop index if exists public.journal_entries_user_date_uniq;
drop index if exists public.journal_entries_user_date_account_uniq;

alter table public.journal_entries
  add constraint journal_entries_pkey primary key (id);

create unique index journal_entries_user_date_account_uniq
  on public.journal_entries (user_id, date, account_id) nulls not distinct;

-- Save the journal summary and its fill rows in one database transaction.
-- Any failure rolls back both parts, preventing a calculated P&L from appearing
-- without the matching calendar/day summary.
create or replace function public.ntj_save_journal_day(
  p_user_id uuid,
  p_account_id uuid,
  p_date date,
  p_entry jsonb,
  p_trades jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_user_id is null or p_date is null then
    raise exception 'Missing journal owner or date';
  end if;

  insert into public.journal_entries (
    user_id,
    account_id,
    date,
    pnl,
    instrument,
    direction,
    entry_price,
    exit_price,
    size,
    screenshots,
    notes,
    emotion,
    tags,
    respected_plan,
    updated_at
  )
  values (
    p_user_id,
    p_account_id,
    p_date,
    coalesce(nullif(p_entry ->> 'pnl', '')::numeric, 0),
    nullif(p_entry ->> 'instrument', ''),
    nullif(p_entry ->> 'direction', ''),
    nullif(p_entry ->> 'entry_price', '')::numeric,
    nullif(p_entry ->> 'exit_price', '')::numeric,
    nullif(p_entry ->> 'size', '')::numeric,
    case
      when jsonb_typeof(p_entry -> 'screenshots') = 'array' then p_entry -> 'screenshots'
      else '[]'::jsonb
    end,
    coalesce(p_entry ->> 'notes', ''),
    coalesce(p_entry ->> 'emotion', ''),
    case
      when jsonb_typeof(p_entry -> 'tags') = 'array'
        then array(select jsonb_array_elements_text(p_entry -> 'tags'))
      else array[]::text[]
    end,
    coalesce(nullif(p_entry ->> 'respected_plan', '')::boolean, true),
    now()
  )
  on conflict (user_id, date, account_id)
  do update set
    pnl = excluded.pnl,
    instrument = excluded.instrument,
    direction = excluded.direction,
    entry_price = excluded.entry_price,
    exit_price = excluded.exit_price,
    size = excluded.size,
    screenshots = excluded.screenshots,
    notes = excluded.notes,
    emotion = excluded.emotion,
    tags = excluded.tags,
    respected_plan = excluded.respected_plan,
    updated_at = now();

  delete from public.journal_trades
  where user_id = p_user_id
    and journal_date = p_date
    and account_id is not distinct from p_account_id;

  insert into public.journal_trades (
    user_id,
    account_id,
    journal_date,
    leg,
    symbol,
    kind,
    side,
    premium,
    strategy,
    price,
    quantity,
    time,
    dte,
    emotions,
    strategy_checklist
  )
  select
    p_user_id,
    p_account_id,
    p_date,
    trade ->> 'leg',
    trim(trade ->> 'symbol'),
    nullif(trade ->> 'kind', ''),
    nullif(trade ->> 'side', ''),
    nullif(coalesce(trade ->> 'premium', trade ->> 'premiumSide'), ''),
    nullif(coalesce(trade ->> 'strategy', trade ->> 'optionStrategy'), ''),
    nullif(trade ->> 'price', '')::numeric,
    nullif(trade ->> 'quantity', '')::numeric,
    nullif(trade ->> 'time', ''),
    nullif(trade ->> 'dte', '')::integer,
    case
      when jsonb_typeof(trade -> 'emotions') = 'array'
        then array(select jsonb_array_elements_text(trade -> 'emotions'))
      else null
    end,
    case
      when jsonb_typeof(coalesce(trade -> 'strategy_checklist', trade -> 'strategyChecklist')) = 'array'
        then array(
          select jsonb_array_elements_text(
            coalesce(trade -> 'strategy_checklist', trade -> 'strategyChecklist')
          )
        )
      else null
    end
  from jsonb_array_elements(coalesce(p_trades, '[]'::jsonb)) as rows(trade)
  where trade ->> 'leg' in ('entry', 'exit')
    and trim(coalesce(trade ->> 'symbol', '')) <> '';
end;
$$;

revoke all on function public.ntj_save_journal_day(uuid, uuid, date, jsonb, jsonb) from public;
grant execute on function public.ntj_save_journal_day(uuid, uuid, date, jsonb, jsonb) to authenticated;
grant execute on function public.ntj_save_journal_day(uuid, uuid, date, jsonb, jsonb) to service_role;
