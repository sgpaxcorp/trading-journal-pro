create table if not exists public.admin_settings (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_admin_settings_updated_at on public.admin_settings;
create trigger set_admin_settings_updated_at
  before update on public.admin_settings
  for each row execute function public.set_updated_at();

alter table public.admin_settings enable row level security;

drop policy if exists "admin_settings_select_admin" on public.admin_settings;
create policy "admin_settings_select_admin"
  on public.admin_settings
  for select
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and coalesce(au.active, true) = true
    )
  );

drop policy if exists "admin_settings_upsert_admin" on public.admin_settings;
create policy "admin_settings_upsert_admin"
  on public.admin_settings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and coalesce(au.active, true) = true
    )
  )
  with check (
    exists (
      select 1 from public.admin_users au
      where au.user_id = auth.uid() and coalesce(au.active, true) = true
    )
  );

insert into public.admin_settings (key, value_json)
values (
  'daily_motivation_schedule',
  jsonb_build_object(
    'hour_ny', 13,
    'minute_ny', 0,
    'label', '1:00 PM EST'
  )
)
on conflict (key) do nothing;
