alter table public.admin_users
  add column if not exists role text,
  add column if not exists permissions jsonb not null default '[]'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.admin_users
set role = case
  when lower(coalesce(role, '')) in ('admin', 'superadmin', 'super_admin', 'administrator', '') then 'owner'
  when lower(role) in ('owner', 'operations', 'finance', 'support', 'marketing', 'auditor') then lower(role)
  else 'auditor'
end;

alter table public.admin_users
  alter column role set default 'owner',
  alter column role set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_users_role_check'
  ) then
    alter table public.admin_users
      add constraint admin_users_role_check
      check (role in ('owner', 'operations', 'finance', 'support', 'marketing', 'auditor'));
  end if;
end
$$;

drop trigger if exists admin_users_set_updated_at on public.admin_users;
create trigger admin_users_set_updated_at
  before update on public.admin_users
  for each row execute function public.set_updated_at();

create or replace function public.admin_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and coalesce(au.active, true) = true
      and (
        au.role = 'owner'
        or coalesce(au.permissions, '[]'::jsonb) ? p_permission
        or (au.role = 'operations' and p_permission in (
          'dashboard.read', 'metrics.read', 'operations.read', 'operations.write', 'users.read', 'audit.read'
        ))
        or (au.role = 'finance' and p_permission in (
          'dashboard.read', 'metrics.read', 'finance.read', 'finance.write', 'users.read', 'audit.read'
        ))
        or (au.role = 'support' and p_permission in (
          'dashboard.read', 'users.read', 'users.write', 'support.read', 'support.write'
        ))
        or (au.role = 'marketing' and p_permission in (
          'dashboard.read', 'metrics.read', 'communications.read', 'communications.write', 'users.read'
        ))
        or (au.role = 'auditor' and p_permission in (
          'dashboard.read', 'metrics.read', 'finance.read', 'operations.read', 'users.read', 'support.read', 'audit.read'
        ))
      )
  );
$$;

revoke all on function public.admin_has_permission(text) from public, anon;
grant execute on function public.admin_has_permission(text) to authenticated, service_role;

drop policy if exists "support_tickets_select_admin" on public.support_tickets;
create policy "support_tickets_select_admin"
  on public.support_tickets for select to authenticated
  using (public.admin_has_permission('support.read'));

drop policy if exists "support_tickets_update_admin" on public.support_tickets;
create policy "support_tickets_update_admin"
  on public.support_tickets for update to authenticated
  using (public.admin_has_permission('support.write'))
  with check (public.admin_has_permission('support.write'));

drop policy if exists "support_messages_select_admin" on public.support_messages;
create policy "support_messages_select_admin"
  on public.support_messages for select to authenticated
  using (public.admin_has_permission('support.read'));

drop policy if exists "support_messages_insert_admin" on public.support_messages;
create policy "support_messages_insert_admin"
  on public.support_messages for insert to authenticated
  with check (user_id = auth.uid() and public.admin_has_permission('support.write'));

drop policy if exists admin_audit_events_select_admin on public.admin_audit_events;
create policy admin_audit_events_select_admin
  on public.admin_audit_events for select to authenticated
  using (public.admin_has_permission('audit.read'));

drop policy if exists "support_attachments_select" on storage.objects;
create policy "support_attachments_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'support_attachments'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or public.admin_has_permission('support.read')
    )
  );

drop policy if exists "support_attachments_insert" on storage.objects;
create policy "support_attachments_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'support_attachments'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or public.admin_has_permission('support.write')
    )
  );

drop policy if exists "support_attachments_delete" on storage.objects;
create policy "support_attachments_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'support_attachments'
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or public.admin_has_permission('support.write')
    )
  );

notify pgrst, 'reload schema';
