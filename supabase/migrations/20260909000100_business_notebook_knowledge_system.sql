create extension if not exists pg_trgm with schema extensions;

alter table public.ntj_notebook_books
  add column if not exists scope text not null default 'account',
  add column if not exists description text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz;

update public.ntj_notebook_books
set scope = case when account_id is null then 'business' else 'account' end
where scope is null
   or scope not in ('business', 'account')
   or (scope = 'account' and account_id is null)
   or (scope = 'business' and account_id is not null);

alter table public.ntj_notebook_books
  drop constraint if exists ntj_notebook_books_scope_check;
alter table public.ntj_notebook_books
  add constraint ntj_notebook_books_scope_check
  check (
    (scope = 'business' and account_id is null)
    or (scope = 'account' and account_id is not null)
  );

alter table public.ntj_notebook_books
  drop constraint if exists ntj_notebook_books_account_id_fkey;
alter table public.ntj_notebook_books
  add constraint ntj_notebook_books_account_id_fkey
  foreign key (account_id) references public.trading_accounts(id) on delete cascade not valid;

alter table public.ntj_notebook_pages
  add column if not exists page_type text not null default 'general',
  add column if not exists status text not null default 'draft',
  add column if not exists tags text[] not null default '{}',
  add column if not exists summary text,
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists template_key text,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists review_due_at timestamptz,
  add column if not exists validated_at timestamptz,
  add column if not exists version integer not null default 1,
  add column if not exists deleted_at timestamptz,
  add column if not exists search_document tsvector;

alter table public.ntj_notebook_pages
  drop constraint if exists ntj_notebook_pages_type_check;
alter table public.ntj_notebook_pages
  add constraint ntj_notebook_pages_type_check
  check (page_type in (
    'general',
    'daily_review',
    'lesson',
    'setup_playbook',
    'risk_rule',
    'research',
    'decision',
    'funded_program'
  ));

alter table public.ntj_notebook_pages
  drop constraint if exists ntj_notebook_pages_status_check;
alter table public.ntj_notebook_pages
  add constraint ntj_notebook_pages_status_check
  check (status in ('draft', 'candidate', 'validated', 'active', 'retired', 'archived'));

alter table public.ntj_notebook_free_notes
  add column if not exists version integer not null default 1,
  add column if not exists deleted_at timestamptz;

alter table public.ntj_notebook_free_notes
  drop constraint if exists ntj_notebook_free_notes_account_id_fkey;
alter table public.ntj_notebook_free_notes
  add constraint ntj_notebook_free_notes_account_id_fkey
  foreign key (account_id) references public.trading_accounts(id) on delete cascade not valid;

drop index if exists public.ntj_notebook_free_notes_user_account_date_uidx;
create unique index if not exists ntj_notebook_free_notes_user_account_date_uidx
  on public.ntj_notebook_free_notes(user_id, account_id, entry_date) nulls not distinct;

create table if not exists public.ntj_notebook_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.ntj_notebook_pages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  title text not null,
  content text not null default '',
  ink jsonb,
  page_type text not null,
  status text not null,
  tags text[] not null default '{}',
  summary text,
  change_source text not null default 'autosave',
  created_at timestamptz not null default now(),
  unique(page_id, version)
);

create table if not exists public.ntj_notebook_daily_versions (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.ntj_notebook_free_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  content text,
  ink jsonb,
  change_source text not null default 'autosave',
  created_at timestamptz not null default now(),
  unique(note_id, version)
);

create table if not exists public.ntj_notebook_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid not null references public.ntj_notebook_pages(id) on delete cascade,
  target_type text not null
    check (target_type in ('journal_day', 'trade', 'back_study', 'business_plan', 'ai_coaching', 'symbol', 'account', 'page')),
  target_id text not null,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(page_id, target_type, target_id)
);

create table if not exists public.ntj_notebook_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  page_id uuid references public.ntj_notebook_pages(id) on delete cascade,
  note_id uuid references public.ntj_notebook_free_notes(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  caption text,
  created_at timestamptz not null default now(),
  check ((page_id is not null)::integer + (note_id is not null)::integer = 1)
);

create or replace function public.ntj_notebook_plain_text(value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select trim(regexp_replace(regexp_replace(coalesce(value, ''), '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g'));
$$;

create or replace function public.ntj_notebook_prepare_page()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.tags := array(
    select distinct lower(trim(tag))
    from unnest(coalesce(new.tags, '{}'::text[])) tag
    where trim(tag) <> ''
    order by lower(trim(tag))
  );
  new.summary := nullif(left(public.ntj_notebook_plain_text(new.content), 500), '');
  new.search_document := to_tsvector(
    'simple',
    concat_ws(' ', new.title, public.ntj_notebook_plain_text(new.content), array_to_string(new.tags, ' '), new.summary)
  );
  if new.status = 'validated' and new.validated_at is null then
    new.validated_at := now();
  elsif new.status <> 'validated' then
    new.validated_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ntj_notebook_version_page()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.title is distinct from new.title
    or old.content is distinct from new.content
    or old.ink is distinct from new.ink
    or old.page_type is distinct from new.page_type
    or old.status is distinct from new.status
    or old.tags is distinct from new.tags
    or old.summary is distinct from new.summary
  then
    if old.page_type is distinct from new.page_type
      or old.status is distinct from new.status
      or old.tags is distinct from new.tags
      or not exists (
        select 1
        from public.ntj_notebook_page_versions snapshot
        where snapshot.page_id = old.id
          and snapshot.created_at >= now() - interval '5 minutes'
      )
    then
      insert into public.ntj_notebook_page_versions (
        page_id, user_id, version, title, content, ink, page_type, status, tags, summary
      ) values (
        old.id, old.user_id, old.version, old.title, old.content, old.ink,
        old.page_type, old.status, old.tags, old.summary
      ) on conflict (page_id, version) do nothing;
    end if;
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create or replace function public.ntj_notebook_version_daily_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.content is distinct from new.content or old.ink is distinct from new.ink then
    if not exists (
      select 1
      from public.ntj_notebook_daily_versions snapshot
      where snapshot.note_id = old.id
        and snapshot.created_at >= now() - interval '5 minutes'
    ) then
      insert into public.ntj_notebook_daily_versions (
        note_id, user_id, version, content, ink
      ) values (
        old.id, old.user_id, old.version, old.content, old.ink
      ) on conflict (note_id, version) do nothing;
    end if;
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ntj_notebook_pages_version on public.ntj_notebook_pages;
create trigger ntj_notebook_pages_version
before update on public.ntj_notebook_pages
for each row execute function public.ntj_notebook_version_page();

drop trigger if exists ntj_notebook_pages_prepare on public.ntj_notebook_pages;
create trigger ntj_notebook_pages_prepare
before insert or update on public.ntj_notebook_pages
for each row execute function public.ntj_notebook_prepare_page();

drop trigger if exists ntj_notebook_daily_version on public.ntj_notebook_free_notes;
create trigger ntj_notebook_daily_version
before update on public.ntj_notebook_free_notes
for each row execute function public.ntj_notebook_version_daily_note();

update public.ntj_notebook_pages
set search_document = to_tsvector(
  'simple',
  concat_ws(' ', title, public.ntj_notebook_plain_text(content), array_to_string(tags, ' '), summary)
)
where search_document is null;

create index if not exists ntj_notebook_books_scope_active_idx
  on public.ntj_notebook_books(user_id, scope, account_id, sort_order, created_at)
  where deleted_at is null;
create index if not exists ntj_notebook_pages_active_idx
  on public.ntj_notebook_pages(notebook_id, is_pinned desc, updated_at desc)
  where deleted_at is null;
create index if not exists ntj_notebook_pages_type_status_idx
  on public.ntj_notebook_pages(user_id, page_type, status, updated_at desc)
  where deleted_at is null;
create index if not exists ntj_notebook_pages_search_idx
  on public.ntj_notebook_pages using gin(search_document);
create index if not exists ntj_notebook_page_versions_page_idx
  on public.ntj_notebook_page_versions(page_id, version desc);
create index if not exists ntj_notebook_daily_versions_note_idx
  on public.ntj_notebook_daily_versions(note_id, version desc);
create index if not exists ntj_notebook_links_page_idx
  on public.ntj_notebook_links(page_id, created_at desc);
create index if not exists ntj_notebook_assets_page_idx
  on public.ntj_notebook_assets(page_id, created_at desc);

alter table public.ntj_notebook_page_versions enable row level security;
alter table public.ntj_notebook_daily_versions enable row level security;
alter table public.ntj_notebook_links enable row level security;
alter table public.ntj_notebook_assets enable row level security;

drop policy if exists ntj_notebook_page_versions_own on public.ntj_notebook_page_versions;
create policy ntj_notebook_page_versions_own
on public.ntj_notebook_page_versions for select to authenticated
using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

drop policy if exists ntj_notebook_daily_versions_own on public.ntj_notebook_daily_versions;
create policy ntj_notebook_daily_versions_own
on public.ntj_notebook_daily_versions for select to authenticated
using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()));

drop policy if exists ntj_notebook_links_own on public.ntj_notebook_links;
create policy ntj_notebook_links_own
on public.ntj_notebook_links for all to authenticated
using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
with check (
  user_id = auth.uid()
  and public.user_has_advanced_plan(auth.uid())
  and exists (
    select 1 from public.ntj_notebook_pages page
    where page.id = page_id and page.user_id = auth.uid()
  )
);

drop policy if exists ntj_notebook_assets_own on public.ntj_notebook_assets;
create policy ntj_notebook_assets_own
on public.ntj_notebook_assets for all to authenticated
using (user_id = auth.uid() and public.user_has_advanced_plan(auth.uid()))
with check (
  user_id = auth.uid()
  and public.user_has_advanced_plan(auth.uid())
  and (
    (page_id is not null and exists (
      select 1 from public.ntj_notebook_pages page
      where page.id = ntj_notebook_assets.page_id and page.user_id = auth.uid()
    ))
    or
    (note_id is not null and exists (
      select 1 from public.ntj_notebook_free_notes note
      where note.id = ntj_notebook_assets.note_id and note.user_id = auth.uid()
    ))
  )
);

grant select on public.ntj_notebook_page_versions to authenticated;
grant select on public.ntj_notebook_daily_versions to authenticated;
grant select, insert, update, delete on public.ntj_notebook_links to authenticated;
grant select, insert, update, delete on public.ntj_notebook_assets to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'notebook-assets',
  'notebook-assets',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists notebook_assets_storage_select_own on storage.objects;
create policy notebook_assets_storage_select_own
on storage.objects for select to authenticated
using (bucket_id = 'notebook-assets' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists notebook_assets_storage_insert_own on storage.objects;
create policy notebook_assets_storage_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id = 'notebook-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.user_has_advanced_plan(auth.uid())
);

drop policy if exists notebook_assets_storage_delete_own on storage.objects;
create policy notebook_assets_storage_delete_own
on storage.objects for delete to authenticated
using (bucket_id = 'notebook-assets' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';
