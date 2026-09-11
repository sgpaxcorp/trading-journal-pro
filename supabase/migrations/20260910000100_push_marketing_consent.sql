alter table public.push_tokens
  add column if not exists marketing_push_enabled boolean not null default false,
  add column if not exists marketing_push_consent_at timestamptz,
  add column if not exists marketing_push_consent_version text;

update public.push_tokens
set marketing_push_enabled = false,
    marketing_push_consent_at = null,
    marketing_push_consent_version = null
where marketing_push_enabled is distinct from false;

create index if not exists push_tokens_marketing_enabled_idx
  on public.push_tokens(user_id)
  where marketing_push_enabled = true;

notify pgrst, 'reload schema';
