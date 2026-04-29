alter table if exists public.ntj_notebook_pages
add column if not exists ink jsonb;

alter table if exists public.ntj_notebook_free_notes
add column if not exists ink jsonb;
