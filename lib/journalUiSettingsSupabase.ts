import { supabaseBrowser } from "@/lib/supaBaseClient";

/**
 * Persisted UI settings per user for the Journal page.
 * Stored in Supabase table: public.journal_ui_settings
 */
export type JournalUiSettings = {
  /**
   * Active widget ids (matches your JournalGrid widget ids).
   * Example: ["pnl","premarket","inside",...]
   */
  activeWidgets?: string[];

  /**
   * react-grid-layout layout object as JSON (whatever your JournalGrid stores in localStorage).
   */
  layout?: any;
};

export async function getJournalUiSettings(
  userId: string,
  pageKey: string
): Promise<JournalUiSettings | null> {
  if (!userId || !pageKey) return null;

  const { data, error } = await supabaseBrowser
    .from("journal_ui_settings")
    .select("settings")
    .eq("user_id", userId)
    .eq("page_key", pageKey)
    .maybeSingle();

  if (error) {
    console.warn("[journalUiSettingsSupabase] getJournalUiSettings error:", error);
    return null;
  }

  const settings = (data as any)?.settings;
  if (!settings || typeof settings !== "object") return null;

  return settings as JournalUiSettings;
}

export async function saveJournalUiSettings(
  userId: string,
  pageKey: string,
  settings: JournalUiSettings
): Promise<void> {
  if (!userId || !pageKey) return;

  const payload = {
    user_id: userId,
    page_key: pageKey,
    settings: settings ?? {},
  };

  const { error } = await supabaseBrowser
    .from("journal_ui_settings")
    .upsert(payload, { onConflict: "user_id,page_key" });

  if (error) {
    // In the Journal page, a missing row or RLS misconfiguration can happen while
    // users are onboarding. We still want the UI to work without spamming the dev
    // overlay with console errors.
    console.warn("[journalUiSettingsSupabase] saveJournalUiSettings warning:", error);
    return;
  }
}
