-- Growth Plan v2: long-term targets, plan styles, planned withdrawals, ranking name, and PnL leaderboard

-- ===== growth_plans columns =====
alter table if exists public.growth_plans
  add column if not exists target_date date,
  add column if not exists plan_style text,
  add column if not exists target_multiple numeric,
  add column if not exists plan_start_date date,
  add column if not exists planned_withdrawals jsonb,
  add column if not exists reset_count integer default 0,
  add column if not exists last_reset_at timestamptz;

-- Backfill plan_start_date if missing (use created_at date)
update public.growth_plans
  set plan_start_date = coalesce(plan_start_date, created_at::date, updated_at::date, now()::date)
where plan_start_date is null;

-- Backfill target_multiple if possible
update public.growth_plans
  set target_multiple = case
    when coalesce(starting_balance,0) > 0 and coalesce(target_balance,0) > 0
      then (target_balance / starting_balance)
    else null
  end
where target_multiple is null;

-- ===== growth_plan_history =====
create table if not exists public.growth_plan_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid null,
  started_at date null,
  ended_at date null,
  reset_reason text null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

-- RLS for growth_plan_history
alter table public.growth_plan_history enable row level security;
drop policy if exists "Growth plan history read by owner" on public.growth_plan_history;
drop policy if exists "Growth plan history insert by owner" on public.growth_plan_history;
create policy "Growth plan history read by owner"
  on public.growth_plan_history for select to authenticated
  using (user_id = auth.uid());
create policy "Growth plan history insert by owner"
  on public.growth_plan_history for insert to authenticated
  with check (user_id = auth.uid());

-- ===== profiles: ranking name =====
alter table if exists public.profiles
  add column if not exists ranking_name text,
  add column if not exists show_in_ranking boolean default false;

-- ===== Public leaderboard by PnL (opt-in) =====
-- This replaces XP ranking for Global Ranking screen.
create or replace function public.nt_public_leaderboard_pnl(
  limit_num integer default 25,
  offset_num integer default 0
)
returns table (
  rank integer,
  user_id uuid,
  display_name text,
  avatar_url text,
  pnl_total numeric
)
language sql
stable
as $$
  with pnl as (
    select je.user_id, sum(coalesce(je.pnl,0)) as pnl_total
    from public.journal_entries je
    group by je.user_id
  ),
  prof as (
    select p.id as user_id,
           coalesce(nullif(p.ranking_name, ''), nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''), p.email, 'Trader') as display_name,
           p.avatar_url,
           coalesce(p.show_in_ranking,false) as show_in_ranking
    from public.profiles p
  ),
  joined as (
    select prof.user_id, prof.display_name, prof.avatar_url, pnl.pnl_total
    from prof
    join pnl on pnl.user_id = prof.user_id
    where prof.show_in_ranking = true
  )
  select (row_number() over (order by pnl_total desc nulls last))::int as rank,
         user_id,
         display_name,
         avatar_url,
         pnl_total
  from joined
  order by pnl_total desc nulls last
  limit limit_num offset offset_num;
$$;

create or replace function public.nt_public_user_profile_pnl(target_user uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  pnl_total numeric,
  show_in_ranking boolean
)
language sql
stable
as $$
  with pnl as (
    select je.user_id, sum(coalesce(je.pnl,0)) as pnl_total
    from public.journal_entries je
    where je.user_id = target_user
    group by je.user_id
  )
  select p.id as user_id,
         coalesce(nullif(p.ranking_name, ''), nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''), p.email, 'Trader') as display_name,
         p.avatar_url,
         coalesce(pnl.pnl_total,0) as pnl_total,
         coalesce(p.show_in_ranking,false) as show_in_ranking
  from public.profiles p
  left join pnl on pnl.user_id = p.id
  where p.id = target_user;
$$;
