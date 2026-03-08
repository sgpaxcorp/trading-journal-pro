-- Support tickets + messages

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text,
  email text,
  subject text,
  status text default 'open',
  priority text default 'normal',
  source text default 'inapp',
  last_message_at timestamptz default now(),
  last_message_by text default 'user',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.support_tickets(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_role text default 'user',
  message text not null,
  attachments jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create index if not exists support_tickets_user_id_idx on public.support_tickets(user_id);
create index if not exists support_tickets_status_idx on public.support_tickets(status);
create index if not exists support_messages_ticket_id_idx on public.support_messages(ticket_id);

-- updated_at trigger
drop trigger if exists set_support_tickets_updated_at on public.support_tickets;
create trigger set_support_tickets_updated_at
  before update on public.support_tickets
  for each row
  execute function public.set_updated_at();

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- Policies: users (own) + admins (all)
drop policy if exists "support_tickets_select_own" on public.support_tickets;
create policy "support_tickets_select_own"
  on public.support_tickets
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own"
  on public.support_tickets
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "support_tickets_update_own" on public.support_tickets;
create policy "support_tickets_update_own"
  on public.support_tickets
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "support_tickets_select_admin" on public.support_tickets;
create policy "support_tickets_select_admin"
  on public.support_tickets
  for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
        and coalesce(au.active, true) = true
    )
  );

drop policy if exists "support_tickets_update_admin" on public.support_tickets;
create policy "support_tickets_update_admin"
  on public.support_tickets
  for update
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
        and coalesce(au.active, true) = true
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
        and coalesce(au.active, true) = true
    )
  );

drop policy if exists "support_messages_select_own" on public.support_messages;
create policy "support_messages_select_own"
  on public.support_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_messages.ticket_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "support_messages_insert_own" on public.support_messages;
create policy "support_messages_insert_own"
  on public.support_messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = support_messages.ticket_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "support_messages_select_admin" on public.support_messages;
create policy "support_messages_select_admin"
  on public.support_messages
  for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
        and coalesce(au.active, true) = true
    )
  );

drop policy if exists "support_messages_insert_admin" on public.support_messages;
create policy "support_messages_insert_admin"
  on public.support_messages
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid()
        and coalesce(au.active, true) = true
    )
  );

-- Storage bucket for attachments
insert into storage.buckets (id, name, public)
values ('support_attachments', 'support_attachments', false)
on conflict (id) do nothing;

-- Storage policies
drop policy if exists "support_attachments_select" on storage.objects;
create policy "support_attachments_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'support_attachments'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1 from public.admin_users au
        where au.user_id = auth.uid()
          and coalesce(au.active, true) = true
      )
    )
  );

drop policy if exists "support_attachments_insert" on storage.objects;
create policy "support_attachments_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'support_attachments'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1 from public.admin_users au
        where au.user_id = auth.uid()
          and coalesce(au.active, true) = true
      )
    )
  );

drop policy if exists "support_attachments_delete" on storage.objects;
create policy "support_attachments_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'support_attachments'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or exists (
        select 1 from public.admin_users au
        where au.user_id = auth.uid()
          and coalesce(au.active, true) = true
      )
    )
  );
