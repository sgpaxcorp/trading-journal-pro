-- Option Flow chat sessions + messages
create table if not exists public.option_flow_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_id uuid,
  report_created_at timestamptz,
  title text,
  created_at timestamptz default now(),
  closed_at timestamptz
);

create table if not exists public.option_flow_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.option_flow_chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  content text not null,
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists option_flow_chat_sessions_user_idx
  on public.option_flow_chat_sessions (user_id, created_at desc);

create index if not exists option_flow_chat_sessions_analysis_idx
  on public.option_flow_chat_sessions (user_id, analysis_id, created_at desc);

create index if not exists option_flow_chat_messages_session_idx
  on public.option_flow_chat_messages (session_id, created_at desc);

alter table public.option_flow_chat_sessions enable row level security;
alter table public.option_flow_chat_messages enable row level security;

create policy "option_flow_chat_sessions_select_own"
  on public.option_flow_chat_sessions
  for select
  using (auth.uid() = user_id);

create policy "option_flow_chat_sessions_insert_own"
  on public.option_flow_chat_sessions
  for insert
  with check (auth.uid() = user_id);

create policy "option_flow_chat_sessions_update_own"
  on public.option_flow_chat_sessions
  for update
  using (auth.uid() = user_id);

create policy "option_flow_chat_messages_select_own"
  on public.option_flow_chat_messages
  for select
  using (auth.uid() = user_id);

create policy "option_flow_chat_messages_insert_own"
  on public.option_flow_chat_messages
  for insert
  with check (auth.uid() = user_id);
