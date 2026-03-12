create extension if not exists pgcrypto;

create table if not exists public.trophy_definitions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  tier text not null check (tier in ('Bronze', 'Silver', 'Gold', 'Elite')),
  xp integer not null default 0,
  category text not null default 'General',
  rule_key text not null,
  rule_op text not null default 'gte' check (rule_op in ('gte', 'eq', 'lte')),
  rule_value integer not null default 0,
  icon text,
  tags jsonb not null default '[]'::jsonb,
  secret boolean not null default false,
  created_at timestamptz not null default now()
);

alter table if exists public.trophy_definitions
  add column if not exists icon text;
alter table if exists public.trophy_definitions
  add column if not exists tags jsonb not null default '[]'::jsonb;
alter table if exists public.trophy_definitions
  add column if not exists secret boolean not null default false;

create table if not exists public.user_trophies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trophy_id uuid not null references public.trophy_definitions(id) on delete cascade,
  earned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, trophy_id)
);

create index if not exists user_trophies_user_id_idx on public.user_trophies(user_id);
create index if not exists user_trophies_trophy_id_idx on public.user_trophies(trophy_id);
create unique index if not exists user_trophies_user_trophy_uidx on public.user_trophies(user_id, trophy_id);
create index if not exists trophy_definitions_rule_key_idx on public.trophy_definitions(rule_key, rule_value);

alter table public.trophy_definitions enable row level security;
alter table public.user_trophies enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trophy_definitions' and policyname = 'trophy_definitions_select_authenticated'
  ) then
    create policy trophy_definitions_select_authenticated
      on public.trophy_definitions
      for select
      to authenticated
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_trophies' and policyname = 'user_trophies_select_own'
  ) then
    create policy user_trophies_select_own
      on public.user_trophies
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_trophies' and policyname = 'user_trophies_insert_own'
  ) then
    create policy user_trophies_insert_own
      on public.user_trophies
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

insert into public.trophy_definitions (
  id, title, description, tier, xp, category, rule_key, rule_op, rule_value, icon, secret
)
values
  ('0d6bd35f-cae7-4b67-a79b-41fd77f30ff1', 'Blueprint Initiated', 'Create your first Growth Plan.', 'Bronze', 100, 'Growth Plan', 'plan_created', 'gte', 1, '/Bronze_Trophy.svg', false),
  ('6494a0bd-cd53-4166-968e-19bcdd0efe38', 'First Log', 'Log your first trading day in the journal.', 'Bronze', 50, 'Journal', 'days_logged', 'gte', 1, '/Bronze_Trophy.svg', false),
  ('ab33d291-ef9f-48ff-8ab2-c3e19de4b07b', 'Five-Day Tape', 'Log 5 trading days.', 'Bronze', 120, 'Journal', 'days_logged', 'gte', 5, '/Bronze_Trophy.svg', false),
  ('d6517b9a-d5d5-4164-a8b1-ec38fe91c52a', 'Desk Habit', 'Log 20 trading days.', 'Silver', 300, 'Journal', 'days_logged', 'gte', 20, '/Silver_Trophy.svg', false),
  ('a357a1bf-45d4-46d5-bcae-8bc2fcd5d146', 'Three-Day Rhythm', 'Reach a journaling streak of 3 days.', 'Bronze', 140, 'Consistency', 'best_streak', 'gte', 3, '/Bronze_Trophy.svg', false),
  ('d18ebc31-7f89-4bc8-b005-562806ea6b47', 'Locked-In Week', 'Reach a journaling streak of 7 days.', 'Silver', 320, 'Consistency', 'best_streak', 'gte', 7, '/Silver_Trophy.svg', false),
  ('f6576119-d0cd-43b4-a3d3-94d52d880a0d', 'Process Fortnight', 'Reach a journaling streak of 14 days.', 'Gold', 650, 'Consistency', 'best_streak', 'gte', 14, '/Gold_Trophy.svg', false),
  ('d9be2c17-3cab-42b5-a0cb-f33f7dc7446f', 'Challenge Finisher', 'Complete your first challenge run.', 'Silver', 350, 'Challenges', 'challenges_completed', 'gte', 1, '/Silver_Trophy.svg', false),
  ('6145d7d8-c021-4275-a5b8-73898e3890b1', 'Challenge Closer', 'Complete 3 challenge runs.', 'Gold', 900, 'Challenges', 'challenges_completed', 'gte', 3, '/Gold_Trophy.svg', false),
  ('6637b8f4-a7da-40d1-a053-e0f9d6ccbe89', 'Daily Objective Hit', 'Reach your daily goal once.', 'Bronze', 120, 'Goals', 'daily_goal_reached', 'gte', 1, '/Bronze_Trophy.svg', false),
  ('3a27e367-b313-40e7-a54c-cdf0f28258e6', 'Daily Closer', 'Reach your daily goal 5 times.', 'Silver', 280, 'Goals', 'daily_goal_reached', 'gte', 5, '/Silver_Trophy.svg', false),
  ('a0ef5fb1-2dc8-4244-bca0-9f52d4cc9aca', 'Weekly Checkpoint Cleared', 'Reach your weekly goal once.', 'Silver', 400, 'Goals', 'weekly_goal_reached', 'gte', 1, '/Silver_Trophy.svg', false),
  ('16719ba4-f6a4-4dc6-b716-8dbdadd29759', 'Monthly Pace Keeper', 'Reach your weekly goal 4 times.', 'Gold', 900, 'Goals', 'weekly_goal_reached', 'gte', 4, '/Gold_Trophy.svg', false),
  ('385fb89c-ad97-4d68-b780-e8d86d4d4530', 'Monthly Target Locked', 'Reach your monthly goal once.', 'Gold', 1200, 'Goals', 'monthly_goal_reached', 'gte', 1, '/Gold_Trophy.svg', false),
  ('b8f299b0-c175-462e-8f6f-a96a4b2b7e5f', 'Quarter Architect', 'Reach your quarter goal once.', 'Elite', 2500, 'Goals', 'quarterly_goal_reached', 'gte', 1, '/Elite_Trophy.svg', false)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  tier = excluded.tier,
  xp = excluded.xp,
  category = excluded.category,
  rule_key = excluded.rule_key,
  rule_op = excluded.rule_op,
  rule_value = excluded.rule_value,
  icon = excluded.icon,
  secret = excluded.secret;
