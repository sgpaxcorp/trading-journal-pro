import { supabaseBrowser } from "@/lib/supaBaseClient";

/**
 * Stored in Supabase table: public.journal_templates
 * Each template is per-user.
 */
export type JournalTemplate = {
  id: string;
  name: string;
  /**
   * Content can be JSON OR string. Recommended shape:
   * { premarket: string(html), inside: string(html), after: string(html) }
   */
  content: any;
  created_at?: string;
  updated_at?: string;
};

export async function listJournalTemplates(userId: string): Promise<JournalTemplate[]> {
  if (!userId) return [];

  const { data, error } = await supabaseBrowser
    .from("journal_templates")
    .select("id, name, content, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[journalTemplatesSupabase] listJournalTemplates error:", error);
    return [];
  }

  return (data as any[] | null)?.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    content: (r as any).content,
    created_at: (r as any).created_at ?? undefined,
    updated_at: (r as any).updated_at ?? undefined,
  })) ?? [];
}

export async function createJournalTemplate(
  userId: string,
  name: string,
  content: any
): Promise<JournalTemplate | null> {
  if (!userId || !name.trim()) return null;

  const payload = {
    user_id: userId,
    name: name.trim(),
    content: content ?? {},
  };

  const { data, error } = await supabaseBrowser
    .from("journal_templates")
    .insert(payload)
    .select("id, name, content, created_at, updated_at")
    .single();

  if (error) {
    console.error("[journalTemplatesSupabase] createJournalTemplate error:", error);
    throw error;
  }

  return {
    id: String((data as any).id),
    name: String((data as any).name ?? ""),
    content: (data as any).content,
    created_at: (data as any).created_at ?? undefined,
    updated_at: (data as any).updated_at ?? undefined,
  };
}

export async function deleteJournalTemplate(userId: string, templateId: string): Promise<void> {
  if (!userId || !templateId) return;

  const { error } = await supabaseBrowser
    .from("journal_templates")
    .delete()
    .eq("user_id", userId)
    .eq("id", templateId);

  if (error) {
    console.error("[journalTemplatesSupabase] deleteJournalTemplate error:", error);
    throw error;
  }
}
