// lib/checklistsSupabase.ts
import { supabaseBrowser } from "@/lib/supaBaseClient";

export type ChecklistItem =
  | string
  | { text: string; done?: boolean };

export type DailyChecklistRow = {
  user_id: string;
  date: string; // "YYYY-MM-DD"
  items: ChecklistItem[];
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

const TABLE = "daily_checklists";

function normalizeItems(items: any): ChecklistItem[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  return [];
}

export async function getDailyChecklist(userId: string, date: string) {
  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    user_id: data.user_id,
    date: data.date,
    items: normalizeItems(data.items),
    notes: data.notes ?? null,
    created_at: data.created_at,
    updated_at: data.updated_at,
  } as DailyChecklistRow;
}

export async function upsertDailyChecklist(row: DailyChecklistRow) {
  const { error } = await supabaseBrowser.from(TABLE).upsert(
    {
      user_id: row.user_id,
      date: row.date,
      items: row.items ?? [],
      notes: row.notes ?? null,
    },
    { onConflict: "user_id,date" }
  );

  if (error) throw error;
}
