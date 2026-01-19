// lib/forumSupabase.ts
// Supabase helpers for Community Feed (Forum)

import { supabaseBrowser } from "@/lib/supaBaseClient";

export type ForumCategory = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_locked: boolean;
  created_at: string;
};

export type ForumThread = {
  id: string;
  category_id: string;
  user_id: string | null;
  author_name: string;
  title: string;
  body: string;
  tags: string[];
  is_pinned: boolean;
  is_locked: boolean;
  reply_count: number;
  view_count: number;
  last_post_at: string;
  last_post_user_id: string | null;
  created_at: string;
  updated_at: string;

  forum_categories?: { id: string; slug: string; name: string } | null;
};

export type ForumPost = {
  id: string;
  thread_id: string;
  user_id: string | null;
  author_name: string;
  body: string;
  is_ai: boolean;
  meta: any;
  created_at: string;
  updated_at: string;
};

export type ThreadSort = "active" | "new" | "top";

export type ListThreadsOptions = {
  categoryId?: string | null;
  query?: string | null;
  sort?: ThreadSort;
  limit?: number;
};

function normalizeQuery(q: string) {
  return q.replace(/[%_]/g, "\\$&"); // escape for ilike
}

function safeErrMessage(err: any) {
  return err?.message || err?.error_description || "Unknown error";
}

export async function listForumCategories(): Promise<ForumCategory[]> {
  const { data, error } = await supabaseBrowser
    .from("forum_categories")
    .select("id,slug,name,description,sort_order,is_locked,created_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(safeErrMessage(error));
  return (data || []) as any;
}

export async function listForumThreads(opts: ListThreadsOptions = {}): Promise<ForumThread[]> {
  const limit = typeof opts.limit === "number" ? opts.limit : 50;
  const sort: ThreadSort = opts.sort || "active";

  let q = supabaseBrowser
    .from("forum_threads")
    .select(
      "id,category_id,user_id,author_name,title,body,tags,is_pinned,is_locked,reply_count,view_count,last_post_at,last_post_user_id,created_at,updated_at, forum_categories(id,slug,name)"
    )
    .limit(limit);

  if (opts.categoryId) {
    q = q.eq("category_id", opts.categoryId);
  }

  const query = (opts.query || "").trim();
  if (query) {
    const safe = normalizeQuery(query);
    // Search both title and body (simple keyword search)
    q = q.or(`title.ilike.%${safe}%,body.ilike.%${safe}%`);
  }

  if (sort === "new") {
    q = q.order("created_at", { ascending: false });
  } else if (sort === "top") {
    q = q.order("view_count", { ascending: false }).order("last_post_at", { ascending: false });
  } else {
    // active
    q = q.order("is_pinned", { ascending: false }).order("last_post_at", { ascending: false });
  }

  const { data, error } = await q;
  if (error) throw new Error(safeErrMessage(error));

  return (data || []) as any;
}

export async function createForumThread(params: {
  userId: string;
  authorName: string;
  categoryId: string;
  title: string;
  body: string;
  tags?: string[];
}): Promise<ForumThread> {
  const payload = {
    user_id: params.userId,
    author_name: params.authorName || "Trader",
    category_id: params.categoryId,
    title: params.title.trim(),
    body: params.body.trim(),
    tags: Array.isArray(params.tags) ? params.tags.slice(0, 12) : [],
    last_post_at: new Date().toISOString(),
    last_post_user_id: params.userId,
  };

  const { data, error } = await supabaseBrowser
    .from("forum_threads")
    .insert(payload as any)
    .select(
      "id,category_id,user_id,author_name,title,body,tags,is_pinned,is_locked,reply_count,view_count,last_post_at,last_post_user_id,created_at,updated_at, forum_categories(id,slug,name)"
    )
    .single();

  if (error) throw new Error(safeErrMessage(error));
  return data as any;
}

export async function getForumThread(threadId: string): Promise<ForumThread | null> {
  const { data, error } = await supabaseBrowser
    .from("forum_threads")
    .select(
      "id,category_id,user_id,author_name,title,body,tags,is_pinned,is_locked,reply_count,view_count,last_post_at,last_post_user_id,created_at,updated_at, forum_categories(id,slug,name)"
    )
    .eq("id", threadId)
    .maybeSingle();

  if (error) throw new Error(safeErrMessage(error));
  return (data as any) || null;
}

export async function listForumPosts(threadId: string, limit = 200): Promise<ForumPost[]> {
  const { data, error } = await supabaseBrowser
    .from("forum_posts")
    .select("id,thread_id,user_id,author_name,body,is_ai,meta,created_at,updated_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(safeErrMessage(error));
  return (data || []) as any;
}

export async function createForumPost(params: {
  userId: string;
  authorName: string;
  threadId: string;
  body: string;
}): Promise<ForumPost> {
  const payload = {
    user_id: params.userId,
    author_name: params.authorName || "Trader",
    thread_id: params.threadId,
    body: params.body.trim(),
    is_ai: false,
  };

  const { data, error } = await supabaseBrowser
    .from("forum_posts")
    .insert(payload as any)
    .select("id,thread_id,user_id,author_name,body,is_ai,meta,created_at,updated_at")
    .single();

  if (error) throw new Error(safeErrMessage(error));
  return data as any;
}

export async function incrementForumThreadView(threadId: string): Promise<void> {
  // Uses SECURITY DEFINER function; safe for any user
  const { error } = await supabaseBrowser.rpc("increment_forum_thread_view", { p_thread_id: threadId });
  if (error) {
    // non-critical
    console.warn("[forum] increment view failed:", safeErrMessage(error));
  }
}
