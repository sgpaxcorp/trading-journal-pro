"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supaBaseClient";

/**
 * App-wide preferences:
 * - Theme: "neuro" (dark) or "light"
 * - Locale: e.g. "en", "es"
 *
 * Persists:
 * - localStorage (instant, works before auth)
 * - Supabase table: user_preferences (if user is signed in)
 */

export type AppTheme = "neuro" | "light";

export type AppSettings = {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  toggleTheme: () => void;

  locale: string;
  setLocale: (l: string) => void;

  /** True once initial preferences have been loaded (localStorage + optional DB). */
  ready: boolean;

  /** Simple translation helper (key-based). */
  t: (key: string, vars?: Record<string, string | number>) => string;

  /** Available locales for UI selectors. */
  localeOptions: { code: string; label: string }[];
};

const DEFAULT_THEME: AppTheme = "neuro";
const DEFAULT_LOCALE = "en";

const STORAGE_THEME_KEY = "nt_theme";
const STORAGE_LOCALE_KEY = "nt_locale";

const AppSettingsContext = createContext<AppSettings | null>(null);

/* =========================
   Minimal dictionary
   - You can expand this gradually without refactoring the whole app.
========================= */
const DICT: Record<string, Record<string, string>> = {
  en: {
    "prefs.title": "Preferences",
    "prefs.desc": "Set language and theme for your NeuroTrader Journal experience.",
    "prefs.language": "Language",
    "prefs.theme": "Theme",
    "prefs.theme.neuro": "NeuroMode (dark)",
    "prefs.theme.light": "Light mode",
    "prefs.saving": "Saving…",
    "prefs.saved": "Saved",
    "prefs.loading": "Loading preferences…",
  },
  es: {
    "prefs.title": "Preferencias",
    "prefs.desc": "Configura idioma y tema para tu experiencia en NeuroTrader Journal.",
    "prefs.language": "Idioma",
    "prefs.theme": "Tema",
    "prefs.theme.neuro": "NeuroMode (oscuro)",
    "prefs.theme.light": "Modo claro",
    "prefs.saving": "Guardando…",
    "prefs.saved": "Guardado",
    "prefs.loading": "Cargando preferencias…",
  },
};

const LOCALE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

/* =========================
   Helpers
========================= */

function safeReadStorage(key: string, fallback: string): string {
  try {
    const v = localStorage.getItem(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function safeWriteStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function applyThemeClass(theme: AppTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // One canonical attribute for theme-aware CSS
  root.setAttribute("data-theme", theme);

  // Optional: keep a class for convenience
  root.classList.remove("theme-neuro", "theme-light");
  root.classList.add(theme === "light" ? "theme-light" : "theme-neuro");
}

function applyLocaleAttr(locale: string) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("lang", locale || DEFAULT_LOCALE);
}

function normalizeTheme(v: string): AppTheme {
  return v === "light" ? "light" : "neuro";
}

/* =========================
   Provider
========================= */

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  // Initialize from localStorage immediately (avoid flicker on first paint).
  const [theme, setThemeState] = useState<AppTheme>(() =>
    normalizeTheme(safeReadStorage(STORAGE_THEME_KEY, DEFAULT_THEME))
  );
  const [locale, setLocaleState] = useState<string>(() =>
    safeReadStorage(STORAGE_LOCALE_KEY, DEFAULT_LOCALE) || DEFAULT_LOCALE
  );

  const [ready, setReady] = useState<boolean>(false);

  // Bootstrap from DB if signed in (and mark ready when done)
  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        // Apply current (local) values ASAP
        applyThemeClass(theme);
        applyLocaleAttr(locale);

        // If logged in, hydrate from DB preference row
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const userId = sessionData?.session?.user?.id;

        if (!userId) return;

        const { data, error } = await supabaseBrowser
          .from("user_preferences")
          .select("theme, locale")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) {
          // Non-fatal: localStorage still works
          console.warn("[AppSettings] user_preferences load error:", error);
          return;
        }

        const dbTheme = data?.theme ? normalizeTheme(String(data.theme)) : null;
        const dbLocale = data?.locale ? String(data.locale) : null;

        // If DB has values, prefer DB (single source of truth after auth)
        if (dbTheme && dbTheme !== theme) setThemeState(dbTheme);
        if (dbLocale && dbLocale !== locale) setLocaleState(dbLocale);
      } catch (e) {
        console.warn("[AppSettings] bootstrap exception:", e);
      } finally {
        if (alive) setReady(true);
      }
    };

    void load();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply + persist theme
  useEffect(() => {
    applyThemeClass(theme);
    safeWriteStorage(STORAGE_THEME_KEY, theme);
  }, [theme]);

  // Apply + persist locale
  useEffect(() => {
    applyLocaleAttr(locale);
    safeWriteStorage(STORAGE_LOCALE_KEY, locale);
  }, [locale]);

  // Persist to Supabase whenever theme/locale changes (if signed in)
  useEffect(() => {
    if (!ready) return;

    let alive = true;

    const sync = async () => {
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) return;

        const { error } = await supabaseBrowser
          .from("user_preferences")
          .upsert(
            {
              user_id: userId,
              theme,
              locale,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

        if (error) {
          console.warn("[AppSettings] user_preferences upsert error:", error);
        }
      } catch (e) {
        console.warn("[AppSettings] sync exception:", e);
      }
    };

    void sync();

    return () => {
      alive = false;
    };
  }, [theme, locale, ready]);

  const setTheme = (t: AppTheme) => setThemeState(normalizeTheme(String(t)));
  const toggleTheme = () => setThemeState((prev) => (prev === "light" ? "neuro" : "light"));
  const setLocale = (l: string) => setLocaleState(String(l || DEFAULT_LOCALE));

  const t = (key: string, vars?: Record<string, string | number>) => {
    const dict = DICT[locale] || DICT[DEFAULT_LOCALE] || {};
    let s = dict[key] || (DICT[DEFAULT_LOCALE] ? DICT[DEFAULT_LOCALE][key] : "") || key;

    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replaceAll(`{{${k}}}`, String(v));
      }
    }
    return s;
  };

  const value = useMemo<AppSettings>(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      locale,
      setLocale,
      ready,
      t,
      localeOptions: LOCALE_OPTIONS,
    }),
    [theme, locale, ready]
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettings {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) {
    throw new Error("useAppSettings must be used within <AppSettingsProvider />");
  }
  return ctx;
}
