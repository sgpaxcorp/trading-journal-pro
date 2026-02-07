// lib/userPreferencesSupabase.ts
import { supabaseBrowser } from "@/lib/supaBaseClient";

export type ThemeMode = "neuro" | "light";
export type LocaleCode = string;

export type UserPreferences = {
  theme: ThemeMode;
  locale: LocaleCode;
  activeAccountId?: string | null;
};

const TABLE = "user_preferences";
const LOG = "[userPreferencesSupabase]";

function normalizeTheme(raw: any): ThemeMode {
  const s = String(raw || "").toLowerCase();
  return s === "light" ? "light" : "neuro";
}

function normalizeLocale(raw: any): string {
  const s = String(raw || "").trim();
  return s || "en";
}

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  try {
    if (!userId) return null;

    const { data, error } = await supabaseBrowser
      .from(TABLE)
      .select("theme, locale, active_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(LOG, "getUserPreferences error:", error);
      return null;
    }

    if (!data) return null;

    return {
      theme: normalizeTheme((data as any).theme),
      locale: normalizeLocale((data as any).locale),
      activeAccountId: ((data as any).active_account_id ?? null) as string | null,
    };
  } catch (e) {
    console.error(LOG, "getUserPreferences exception:", e);
    return null;
  }
}

export async function upsertUserPreferences(
  userId: string,
  prefs: Partial<UserPreferences>
): Promise<UserPreferences | null> {
  try {
    if (!userId) return null;

    const payload = {
      user_id: userId,
      theme: prefs.theme ? normalizeTheme(prefs.theme) : undefined,
      locale: prefs.locale ? normalizeLocale(prefs.locale) : undefined,
      active_account_id: prefs.activeAccountId ?? undefined,
      updated_at: new Date().toISOString(),
    };

    // Remove undefined keys so we don't overwrite with null
    Object.keys(payload).forEach((k) => {
      // @ts-ignore
      if (payload[k] === undefined) delete payload[k];
    });

    const { data, error } = await supabaseBrowser
      .from(TABLE)
      .upsert(payload as any, { onConflict: "user_id" })
      .select("theme, locale, active_account_id")
      .maybeSingle();

    if (error) {
      console.error(LOG, "upsertUserPreferences error:", error);
      return null;
    }

    if (!data) return null;

    return {
      theme: normalizeTheme((data as any).theme),
      locale: normalizeLocale((data as any).locale),
      activeAccountId: ((data as any).active_account_id ?? null) as string | null,
    };
  } catch (e) {
    console.error(LOG, "upsertUserPreferences exception:", e);
    return null;
  }
}
