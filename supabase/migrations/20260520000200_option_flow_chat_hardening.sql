create table if not exists public.option_flow_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id text null,
  report_created_at timestamptz null,
  title text null,
  closed_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.option_flow_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'user',
  content text not null,
  meta jsonb null,
  created_at timestamptz not null default now()
);

alter table public.option_flow_chat_sessions
  add column if not exists user_id uuid,
  add column if not exists analysis_id text,
  add column if not exists report_created_at timestamptz,
  add column if not exists title text,
  add column if not exists closed_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

alter table public.option_flow_chat_messages
  add column if not exists session_id uuid,
  add column if not exists user_id uuid,
  add column if not exists role text not null default 'user',
  add column if not exists content text not null default '',
  add column if not exists meta jsonb,
  add column if not exists created_at timestamptz not null default now();

create index if not exists option_flow_chat_sessions_user_created_idx
  on public.option_flow_chat_sessions (user_id, created_at desc);

create index if not exists option_flow_chat_sessions_user_analysis_idx
  on public.option_flow_chat_sessions (user_id, analysis_id, closed_at, created_at desc);

create index if not exists option_flow_chat_messages_user_session_created_idx
  on public.option_flow_chat_messages (user_id, session_id, created_at desc);

alter table public.option_flow_chat_sessions enable row level security;
alter table public.option_flow_chat_messages enable row level security;

drop policy if exists "option_flow_chat_sessions_select_own" on public.option_flow_chat_sessions;
create policy "option_flow_chat_sessions_select_own"
  on public.option_flow_chat_sessions
  for select
  using (auth.uid() = user_id);

drop policy if exists "option_flow_chat_sessions_insert_own" on public.option_flow_chat_sessions;
create policy "option_flow_chat_sessions_insert_own"
  on public.option_flow_chat_sessions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "option_flow_chat_sessions_update_own" on public.option_flow_chat_sessions;
create policy "option_flow_chat_sessions_update_own"
  on public.option_flow_chat_sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "option_flow_chat_messages_select_own" on public.option_flow_chat_messages;
create policy "option_flow_chat_messages_select_own"
  on public.option_flow_chat_messages
  for select
  using (auth.uid() = user_id);

drop policy if exists "option_flow_chat_messages_insert_own" on public.option_flow_chat_messages;
create policy "option_flow_chat_messages_insert_own"
  on public.option_flow_chat_messages
  for insert
  with check (auth.uid() = user_id);
