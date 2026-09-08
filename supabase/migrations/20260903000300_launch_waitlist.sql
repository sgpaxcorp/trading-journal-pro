create sequence if not exists public.launch_waitlist_position_seq;

create table if not exists public.launch_waitlist (
  id uuid primary key default gen_random_uuid(),
  position integer not null default nextval('public.launch_waitlist_position_seq'::regclass),
  name text,
  email text not null,
  email_normalized text generated always as (lower(btrim(email))) stored,
  source text not null default 'homepage',
  discount_percent integer not null default 30,
  discount_plan text not null default 'annual',
  discount_reserved boolean generated always as (position <= 500) stored,
  accepted_marketing boolean not null default true,
  accepted_terms boolean not null default false,
  linked_user_id uuid references auth.users(id) on delete set null,
  launch_discount_email_status text not null default 'pending',
  launch_discount_email_sent_at timestamptz,
  launch_discount_email_error text,
  launch_discount_push_status text not null default 'pending',
  launch_discount_push_sent_at timestamptz,
  launch_discount_push_error text,
  launch_discount_inapp_status text not null default 'pending',
  launch_discount_inapp_sent_at timestamptz,
  launch_discount_inapp_error text,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launch_waitlist_position_positive_check check (position > 0),
  constraint launch_waitlist_email_length_check check (char_length(email_normalized) between 3 and 320),
  constraint launch_waitlist_discount_percent_check check (discount_percent between 0 and 100),
  constraint launch_waitlist_discount_plan_check check (discount_plan in ('annual')),
  constraint launch_waitlist_launch_email_status_check
    check (launch_discount_email_status in ('pending', 'processing', 'sent', 'failed')),
  constraint launch_waitlist_launch_push_status_check
    check (launch_discount_push_status in ('pending', 'processing', 'sent', 'failed', 'unavailable')),
  constraint launch_waitlist_launch_inapp_status_check
    check (launch_discount_inapp_status in ('pending', 'processing', 'sent', 'failed', 'unavailable'))
);

alter sequence public.launch_waitlist_position_seq
  owned by public.launch_waitlist.position;

create unique index if not exists launch_waitlist_email_normalized_idx
  on public.launch_waitlist (email_normalized);

create unique index if not exists launch_waitlist_position_idx
  on public.launch_waitlist (position);

create index if not exists launch_waitlist_discount_reserved_idx
  on public.launch_waitlist (discount_reserved, created_at);

create index if not exists launch_waitlist_launch_discount_email_idx
  on public.launch_waitlist (discount_reserved, launch_discount_email_sent_at, position);

create index if not exists launch_waitlist_launch_discount_channels_idx
  on public.launch_waitlist (
    discount_reserved,
    launch_discount_email_status,
    launch_discount_push_status,
    launch_discount_inapp_status,
    position
  );

create index if not exists launch_waitlist_created_at_idx
  on public.launch_waitlist (created_at desc);

alter table public.launch_waitlist enable row level security;

drop policy if exists "launch_waitlist_service_only" on public.launch_waitlist;
create policy "launch_waitlist_service_only"
  on public.launch_waitlist
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop trigger if exists launch_waitlist_set_updated_at on public.launch_waitlist;
create trigger launch_waitlist_set_updated_at
before update on public.launch_waitlist
for each row
execute function public.set_updated_at();

notify pgrst, 'reload schema';
