-- The community forum has been retired. Historical migrations remain immutable;
-- this forward-only migration removes the deployed feature and its data.

delete from public.user_entitlements
where entitlement_key = 'page_forum';

drop function if exists public.increment_forum_thread_view(uuid) cascade;
drop function if exists public.forum_on_post_delete() cascade;
drop function if exists public.forum_on_post_insert() cascade;

drop table if exists public.forum_posts cascade;
drop table if exists public.forum_threads cascade;
drop table if exists public.forum_categories cascade;
drop table if exists public.forum_ai_log cascade;

notify pgrst, 'reload schema';

