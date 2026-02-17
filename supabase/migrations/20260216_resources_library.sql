-- Resource Library (Resources > Library)

create table if not exists public.ntj_resource_library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id text null,
  kind text not null default 'link',
  title text not null,
  url text null,
  author text null,
  content text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ntj_resource_library_items_kind_check
    check (kind in ('youtube', 'book', 'amazon', 'article', 'note', 'link'))
);

create index if not exists ntj_resource_library_items_user_account_created_idx
  on public.ntj_resource_library_items (user_id, account_id, created_at desc);

create index if not exists ntj_resource_library_items_kind_idx
  on public.ntj_resource_library_items (kind);

alter table public.ntj_resource_library_items enable row level security;

create policy "ntj_resource_library_items_select_own"
  on public.ntj_resource_library_items
  for select
  using (auth.uid() = user_id);

create policy "ntj_resource_library_items_insert_own"
  on public.ntj_resource_library_items
  for insert
  with check (auth.uid() = user_id);

create policy "ntj_resource_library_items_update_own"
  on public.ntj_resource_library_items
  for update
  using (auth.uid() = user_id);

create policy "ntj_resource_library_items_delete_own"
  on public.ntj_resource_library_items
  for delete
  using (auth.uid() = user_id);
