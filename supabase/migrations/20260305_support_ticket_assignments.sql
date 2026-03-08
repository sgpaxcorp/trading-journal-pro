alter table public.support_tickets
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

alter table public.support_tickets
  add column if not exists assigned_at timestamptz;

create index if not exists support_tickets_assigned_to_idx on public.support_tickets(assigned_to);
