create table if not exists public.motivational_messages (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  locale text not null default 'en',
  title text,
  body text not null,
  active boolean not null default true,
  day_of_year integer,
  weekday text,
  audience text not null default 'all',
  delivery_hour_ny integer not null default 20,
  push_enabled boolean not null default true,
  inapp_enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivational_messages_day_of_year_check
    check (day_of_year is null or (day_of_year >= 1 and day_of_year <= 366)),
  constraint motivational_messages_weekday_check
    check (
      weekday is null
      or weekday in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
    ),
  constraint motivational_messages_delivery_hour_check
    check (delivery_hour_ny >= 0 and delivery_hour_ny <= 23)
);

create index if not exists motivational_messages_active_idx
  on public.motivational_messages(active, locale);

create index if not exists motivational_messages_schedule_idx
  on public.motivational_messages(active, weekday, day_of_year, delivery_hour_ny);

drop trigger if exists set_motivational_messages_updated_at on public.motivational_messages;
create trigger set_motivational_messages_updated_at
  before update on public.motivational_messages
  for each row execute function public.set_updated_at();

create table if not exists public.motivational_message_deliveries (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.motivational_messages(id) on delete cascade,
  user_id uuid not null,
  delivery_date date not null,
  channel text not null,
  created_at timestamptz not null default now(),
  constraint motivational_message_deliveries_channel_check
    check (channel in ('push', 'inapp'))
);

create unique index if not exists motivational_message_deliveries_unique_idx
  on public.motivational_message_deliveries(message_id, user_id, delivery_date, channel);

alter table public.motivational_messages enable row level security;
alter table public.motivational_message_deliveries enable row level security;

drop policy if exists "motivational_messages_select_authenticated" on public.motivational_messages;
create policy "motivational_messages_select_authenticated"
  on public.motivational_messages
  for select
  to authenticated
  using (active = true);

drop policy if exists "motivational_messages_admin_all" on public.motivational_messages;
create policy "motivational_messages_admin_all"
  on public.motivational_messages
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

drop policy if exists "motivational_message_deliveries_select_own" on public.motivational_message_deliveries;
create policy "motivational_message_deliveries_select_own"
  on public.motivational_message_deliveries
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "motivational_message_deliveries_admin_all" on public.motivational_message_deliveries;
create policy "motivational_message_deliveries_admin_all"
  on public.motivational_message_deliveries
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

insert into public.motivational_messages (
  slug,
  locale,
  title,
  body,
  weekday,
  delivery_hour_ny,
  push_enabled,
  inapp_enabled
)
values
  (
    'motivation-en-weekday',
    'en',
    'Neuro Trader Journal',
    'A disciplined day beats a brilliant impulse. Execute your process.',
    null,
    20,
    true,
    true
  ),
  (
    'motivation-es-weekday',
    'es',
    'Neuro Trader Journal',
    'Un dia disciplinado vale mas que un impulso brillante. Ejecuta tu proceso.',
    null,
    20,
    true,
    true
  ),
  (
    'motivation-en-friday',
    'en',
    'Neuro Trader Journal',
    'Friday: close the week with discipline. Protect gains and finish clean.',
    'fri',
    20,
    true,
    true
  ),
  (
    'motivation-es-friday',
    'es',
    'Neuro Trader Journal',
    'Viernes: cierra la semana con disciplina. Protege lo ganado y termina limpio.',
    'fri',
    20,
    true,
    true
  ),
  (
    'motivation-en-saturday',
    'en',
    'Neuro Trader Journal',
    'Saturday: let the market go, rest, and reset your mind.',
    'sat',
    20,
    true,
    true
  ),
  (
    'motivation-es-saturday',
    'es',
    'Neuro Trader Journal',
    'Sabado: suelta el mercado, descansa y recarga la mente.',
    'sat',
    20,
    true,
    true
  ),
  (
    'motivation-en-sunday',
    'en',
    'Neuro Trader Journal',
    'Sunday: preparation day. Review your plan, your calendar, and enter the week with clarity.',
    'sun',
    20,
    true,
    true
  ),
  (
    'motivation-es-sunday',
    'es',
    'Neuro Trader Journal',
    'Domingo: preparacion. Revisa tu plan, tu calendario y entra a la semana con claridad.',
    'sun',
    20,
    true,
    true
  )
on conflict (slug) do nothing;
