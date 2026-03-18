// lib/aiCoachChatSupabase.ts
// Supabase-backed persistence for AI Coaching chat threads and messages.
// Requires the SQL in supabase_ai_coach_chat_setup.sql to be applied.

import { supabaseBrowser } from "@/lib/supaBaseClient";

function isAiCoachFeedbackUnavailableError(error: any): boolean {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    (message.includes("ai_coach_feedback") &&
      (message.includes("schema cache") ||
        message.includes("does not exist") ||
        message.includes("could not find the table")))
  );
}

export type AiCoachRole = "user" | "coach" | "system";

export type AiCoachThreadRow = {
  id: string;
  user_id: string;
  title: string | null;
  summary: string | null;
  metadata: any | null;
  created_at: string;
  updated_at: string;
};

export type AiCoachMessageRow = {
  id: string;
  thread_id: string;
  user_id: string;
  role: AiCoachRole;
  content: string;
  meta: any | null;
  created_at: string;
};

export type AiCoachFeedbackRow = {
  id: string;
  user_id: string;
  thread_id: string | null;
  message_id: string;
  rating: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export async function listAiCoachThreads(
  userId: string,
  opts?: { limit?: number }
): Promise<AiCoachThreadRow[]> {
  const limit = opts?.limit ?? 20;

  const { data, error } = await supabaseBrowser
    .from("ai_coach_threads")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[ai_coach_threads] list error:", error);
    return [];
  }
  return (data || []) as AiCoachThreadRow[];
}

export async function createAiCoachThread(params: {
  userId: string;
  title?: string | null;
  metadata?: any | null;
}): Promise<AiCoachThreadRow | null> {
  const { userId, title = null, metadata = null } = params;

  const { data, error } = await supabaseBrowser
    .from("ai_coach_threads")
    .insert({
      user_id: userId,
      title,
      metadata,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[ai_coach_threads] create error:", error);
    return null;
  }
  return data as AiCoachThreadRow;
}

export async function getOrCreateMostRecentAiCoachThread(params: {
  userId: string;
  defaultTitle?: string;
}): Promise<AiCoachThreadRow | null> {
  const { userId, defaultTitle = "AI Coaching" } = params;

  const threads = await listAiCoachThreads(userId, { limit: 1 });
  if (threads.length) return threads[0];

  return await createAiCoachThread({ userId, title: defaultTitle, metadata: null });
}

export async function listAiCoachMessages(
  threadId: string,
  opts?: { limit?: number; ascending?: boolean }
): Promise<AiCoachMessageRow[]> {
  const limit = opts?.limit ?? 80;
  const ascending = opts?.ascending ?? true;

  const { data, error } = await supabaseBrowser
    .from("ai_coach_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending })
    .limit(limit);

  if (error) {
    console.error("[ai_coach_messages] list error:", error);
    return [];
  }
  return (data || []) as AiCoachMessageRow[];
}

export async function insertAiCoachMessage(params: {
  threadId: string;
  userId: string;
  role: AiCoachRole;
  content: string;
  meta?: any | null;
}): Promise<AiCoachMessageRow | null> {
  const { threadId, userId, role, content, meta = null } = params;

  const { data, error } = await supabaseBrowser
    .from("ai_coach_messages")
    .insert({
      thread_id: threadId,
      user_id: userId,
      role,
      content,
      meta,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[ai_coach_messages] insert error:", error);
    return null;
  }
  return data as AiCoachMessageRow;
}

export async function listAiCoachFeedbackForThread(threadId: string): Promise<AiCoachFeedbackRow[]> {
  if (!threadId) return [];

  const { data, error } = await supabaseBrowser
    .from("ai_coach_feedback")
    .select("*")
    .eq("thread_id", threadId);

  if (error) {
    if (isAiCoachFeedbackUnavailableError(error)) {
      return [];
    }
    console.error("[ai_coach_feedback] list error:", error);
    return [];
  }
  return (data || []) as AiCoachFeedbackRow[];
}

export async function updateAiCoachThread(params: {
  threadId: string;
  patch: Partial<Pick<AiCoachThreadRow, "title" | "summary" | "metadata">>;
}): Promise<boolean> {
  const { threadId, patch } = params;

  const { error } = await supabaseBrowser
    .from("ai_coach_threads")
    .update(patch)
    .eq("id", threadId);

  if (error) {
    console.error("[ai_coach_threads] update error:", error);
    return false;
  }
  return true;
}
