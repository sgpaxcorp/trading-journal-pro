"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supaBaseClient";

export type AppTheme = "neuro" | "light";
export type AppLocale = "auto" | "en" | "es";

// Backwards-compatible aliases (some components import `Theme` / `Locale`)
export type Theme = AppTheme;
export type Locale = AppLocale;

const THEME_KEY = "nt_theme";
const LOCALE_KEY = "nt_locale";
const EVT = "nt:app-settings";

function safeWindow(): Window | null {
  if (typeof window === "undefined") return null;
  return window;
}

export function getStoredTheme(): AppTheme {
  const w = safeWindow();
  if (!w) return "neuro";
  const v = w.localStorage.getItem(THEME_KEY);
  return v === "light" ? "light" : "neuro";
}

export function setStoredTheme(theme: AppTheme) {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(THEME_KEY, theme);
}

export function getStoredLocale(): AppLocale {
  const w = safeWindow();
  if (!w) return "auto";
  const v = w.localStorage.getItem(LOCALE_KEY);
  if (v === "en" || v === "es" || v === "auto") return v;
  return "auto";
}

export function setStoredLocale(locale: AppLocale) {
  const w = safeWindow();
  if (!w) return;
  w.localStorage.setItem(LOCALE_KEY, locale);
}

export function applyThemeClass(theme: AppTheme) {
  const w = safeWindow();
  if (!w) return;

  const root = w.document.documentElement;
  const isLight = theme === "light";

  root.classList.toggle("theme-light", isLight);
  root.dataset.theme = theme;

  // Helps native UI widgets (inputs, scrollbars in some browsers)
  root.style.colorScheme = isLight ? "light" : "dark";
}

export function applyLocaleAttribute(locale: AppLocale) {
  const w = safeWindow();
  if (!w) return;

  const root = w.document.documentElement;

  // If user picks "auto", we keep current html lang unless it's missing.
  if (locale === "auto") {
    if (!root.lang) {
      const browser = (w.navigator?.language || "en").toLowerCase();
      root.lang = browser.startsWith("es") ? "es" : "en";
    }
    return;
  }

  root.lang = locale;
}

export function emitAppSettingsChange() {
  const w = safeWindow();
  if (!w) return;
  w.dispatchEvent(new Event(EVT));
}

/**
 * Lightweight settings hook (no provider needed).
 * - Persists to localStorage
 * - Applies html.theme-light
 * - Exposes `ready` so consumers can avoid flicker
 */
export function useAppSettings(): {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
  locale: AppLocale;
  setLocale: (l: AppLocale) => void;
  ready: boolean;
} {
  const [theme, setThemeState] = useState<AppTheme>("neuro");
  const [locale, setLocaleState] = useState<AppLocale>("auto");
  const [ready, setReady] = useState(false);

  // Initial load from localStorage + hydrate from Supabase when signed in
  useEffect(() => {
    let alive = true;

    const load = async () => {
      const t = getStoredTheme();
      const l = getStoredLocale();

      setThemeState(t);
      setLocaleState(l);

      applyThemeClass(t);
      applyLocaleAttribute(l);

      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const userId = sessionData?.session?.user?.id;
        if (!userId) return;

        const { data, error } = await supabaseBrowser
          .from("user_preferences")
          .select("theme, locale")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) {
          console.warn("[appSettings] user_preferences load error:", error);
          return;
        }

        if (data?.theme) {
          const nextTheme = data.theme === "light" ? "light" : "neuro";
          if (nextTheme !== t) setThemeState(nextTheme);
        }

        if (data?.locale) {
          const dbLocale = data.locale === "en" || data.locale === "es" || data.locale === "auto" ? data.locale : "auto";
          if (dbLocale !== l) setLocaleState(dbLocale);
        }
      } catch (e) {
        console.warn("[appSettings] bootstrap exception:", e);
      } finally {
        if (alive) setReady(true);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, []);

  // Keep multiple tabs / components in sync via a custom event
  useEffect(() => {
    const w = safeWindow();
    if (!w) return;

    function onEvt() {
      const t = getStoredTheme();
      const l = getStoredLocale();
      setThemeState(t);
      setLocaleState(l);
      applyThemeClass(t);
      applyLocaleAttribute(l);
    }

    w.addEventListener(EVT, onEvt);
    return () => w.removeEventListener(EVT, onEvt);
  }, []);

  // Apply + persist when state changes (covers DB hydration)
  useEffect(() => {
    applyThemeClass(theme);
    setStoredTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyLocaleAttribute(locale);
    setStoredLocale(locale);
  }, [locale]);

  const setTheme = useCallback((t: AppTheme) => {
    setStoredTheme(t);
    applyThemeClass(t);
    emitAppSettingsChange();
    setThemeState(t);
  }, []);

  const setLocale = useCallback((l: AppLocale) => {
    setStoredLocale(l);
    applyLocaleAttribute(l);
    emitAppSettingsChange();
    setLocaleState(l);
  }, []);

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
          console.warn("[appSettings] user_preferences upsert error:", error);
        }
      } catch (e) {
        console.warn("[appSettings] sync exception:", e);
      }
    };

    void sync();
    return () => {
      alive = false;
    };
  }, [theme, locale, ready]);

  return useMemo(
    () => ({ theme, setTheme, locale, setLocale, ready }),
    [theme, setTheme, locale, setLocale, ready]
  );
}
