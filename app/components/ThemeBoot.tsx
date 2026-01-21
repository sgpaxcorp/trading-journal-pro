"use client";

import { useEffect } from "react";
import { applyLocaleAttribute, applyThemeClass, getStoredLocale, getStoredTheme } from "@/lib/appSettings";

/**
 * Applies persisted theme + locale on every page that includes TopNav.
 * Keeps "NeuroMode" as default unless user explicitly chooses Light mode.
 */
export default function ThemeBoot() {
  useEffect(() => {
    const theme = getStoredTheme();
    const locale = getStoredLocale();
    applyThemeClass(theme);
    applyLocaleAttribute(locale);
  }, []);

  return null;
}
