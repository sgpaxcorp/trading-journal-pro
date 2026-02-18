-- Fix mutable search_path warnings by setting explicit search_path for functions.
-- Supabase recommendation: set to public (and extensions if used).

alter function public._set_updated_at() set search_path = public, extensions;
alter function public._touch_ai_coach_thread() set search_path = public, extensions;
alter function public.build_edge_key(text, text, text, integer, text, text, boolean, boolean, boolean) set search_path = public, extensions;
alter function public.forum_on_post_delete() set search_path = public, extensions;
alter function public.forum_on_post_insert() set search_path = public, extensions;
alter function public.increment_forum_thread_view(uuid) set search_path = public, extensions;
alter function public.ntj_set_updated_at() set search_path = public, extensions;
alter function public.ntj_touch_updated_at() set search_path = public, extensions;
alter function public.set_updated_at() set search_path = public, extensions;
alter function public.trigger_set_updated_at() set search_path = public, extensions;
