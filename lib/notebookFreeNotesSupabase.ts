import { supabaseBrowser } from "@/lib/supaBaseClient";

export type FreeNotebookNoteRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  entry_date: string;
  content: string;
  created_at: string;
  updated_at: string | null;
};

const FREE_NOTES_TABLE = "ntj_notebook_free_notes";

export async function getFreeNotebookNote(
  userId: string,
  accountId: string | null,
  date: string
): Promise<string | null> {
  if (!userId || !date) return null;
  let q = supabaseBrowser
    .from(FREE_NOTES_TABLE)
    .select("content")
    .eq("user_id", userId)
    .eq("entry_date", date)
    .limit(1);

  if (accountId) {
    q = q.eq("account_id", accountId);
  } else {
    q = q.is("account_id", null);
  }

  const { data, error } = await q.maybeSingle();
  if (error) {
    // PGRST116 = no rows; 42P01 = table missing (first run). Avoid noisy console errors.
    return null;
  }
  return data?.content ?? null;
}

export async function upsertFreeNotebookNote(
  userId: string,
  accountId: string | null,
  date: string,
  content: string
): Promise<boolean> {
  if (!userId || !date) return false;

  const { error } = await supabaseBrowser
    .from(FREE_NOTES_TABLE)
    .upsert(
      {
        user_id: userId,
        account_id: accountId ?? null,
        entry_date: date,
        content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,account_id,entry_date" }
    );

  if (error) {
    return false;
  }
  return true;
}
