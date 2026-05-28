create extension if not exists pgcrypto;

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users(id) on delete set null,
  admin_email text,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_at_idx
  on public.admin_audit_events(created_at desc);
create index if not exists admin_audit_events_admin_idx
  on public.admin_audit_events(admin_user_id, created_at desc);
create index if not exists admin_audit_events_target_idx
  on public.admin_audit_events(target_user_id, created_at desc);
create index if not exists admin_audit_events_action_idx
  on public.admin_audit_events(action, created_at desc);

alter table public.admin_audit_events enable row level security;

drop policy if exists admin_audit_events_select_admin on public.admin_audit_events;
create policy admin_audit_events_select_admin
  on public.admin_audit_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_users au
      where au.user_id = auth.uid()
        and coalesce(au.active, true) = true
    )
  );

revoke insert, update, delete on table public.admin_audit_events from anon, authenticated;
grant select on table public.admin_audit_events to authenticated;
grant all on table public.admin_audit_events to service_role;

notify pgrst, 'reload schema';
