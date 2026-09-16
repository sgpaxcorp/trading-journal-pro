-- Daily Investment Office briefings are append-only research snapshots.
-- Alert triage is stored separately so a human workflow decision never rewrites the evidence reviewed.

create table if not exists public.neuro_daily_investment_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  briefing_date date not null,
  version integer not null check (version > 0),
  status text not null check (status in ('ready', 'partial', 'no_material_changes')),
  briefing jsonb not null,
  source_manifest jsonb not null default '[]'::jsonb,
  portfolio_snapshot jsonb not null default '{}'::jsonb,
  content_hash text not null,
  generation_mode text not null check (
    generation_mode in ('ai_and_deterministic', 'deterministic_only')
  ),
  previous_briefing_id uuid references public.neuro_daily_investment_briefings(id) on delete set null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (user_id, briefing_date, version),
  unique (user_id, content_hash)
);

create table if not exists public.neuro_daily_investment_attention_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  briefing_id uuid not null references public.neuro_daily_investment_briefings(id) on delete cascade,
  alert_id text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, briefing_id, alert_id)
);

create index if not exists neuro_daily_briefings_user_date_idx
  on public.neuro_daily_investment_briefings(user_id, briefing_date desc, version desc);
create index if not exists neuro_daily_attention_user_briefing_idx
  on public.neuro_daily_investment_attention_reviews(user_id, briefing_id, status);

alter table public.neuro_daily_investment_briefings enable row level security;
alter table public.neuro_daily_investment_attention_reviews enable row level security;

drop policy if exists neuro_daily_briefings_select_own
  on public.neuro_daily_investment_briefings;
create policy neuro_daily_briefings_select_own
  on public.neuro_daily_investment_briefings
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists neuro_daily_attention_select_own
  on public.neuro_daily_investment_attention_reviews;
create policy neuro_daily_attention_select_own
  on public.neuro_daily_investment_attention_reviews
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke insert, update, delete on public.neuro_daily_investment_briefings
  from anon, authenticated;
revoke insert, update, delete on public.neuro_daily_investment_attention_reviews
  from anon, authenticated;
grant select on public.neuro_daily_investment_briefings to authenticated;
grant select on public.neuro_daily_investment_attention_reviews to authenticated;

create or replace function public.prevent_neuro_daily_briefing_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'Daily Investment Office briefings are append-only.' using errcode = '55000';
end;
$$;

drop trigger if exists neuro_daily_briefing_prevent_update
  on public.neuro_daily_investment_briefings;
create trigger neuro_daily_briefing_prevent_update
  before update on public.neuro_daily_investment_briefings
  for each row execute function public.prevent_neuro_daily_briefing_update();

drop trigger if exists neuro_daily_attention_set_updated_at
  on public.neuro_daily_investment_attention_reviews;
create trigger neuro_daily_attention_set_updated_at
  before update on public.neuro_daily_investment_attention_reviews
  for each row execute function public.set_updated_at();

do $$
begin
  if to_regprocedure('public.enforce_emergency_portfolio_read_only()') is not null then
    execute 'drop trigger if exists emergency_portfolio_read_only on public.neuro_daily_investment_briefings';
    execute 'create trigger emergency_portfolio_read_only before insert or update or delete on public.neuro_daily_investment_briefings for each row execute function public.enforce_emergency_portfolio_read_only()';
    execute 'drop trigger if exists emergency_portfolio_read_only on public.neuro_daily_investment_attention_reviews';
    execute 'create trigger emergency_portfolio_read_only before insert or update or delete on public.neuro_daily_investment_attention_reviews for each row execute function public.enforce_emergency_portfolio_read_only()';
  end if;
end;
$$;

notify pgrst, 'reload schema';
