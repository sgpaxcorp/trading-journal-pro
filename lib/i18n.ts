"use client";

import type { AppLocale } from "@/lib/appSettings";

export type ResolvedLocale = "en" | "es";

export function resolveLocale(setting: AppLocale): ResolvedLocale {
  if (setting === "en" || setting === "es") return setting;

  // auto: detect from browser
  if (typeof window !== "undefined") {
    const lang = (window.navigator?.language || "en").toLowerCase();
    if (lang.startsWith("es")) return "es";
  }
  return "en";
}

const DICT: Record<ResolvedLocale, Record<string, string>> = {
  en: {
    "nav.performance": "Performance",
    "nav.challenges": "Challenges",
    "nav.resources": "Resources",
    "nav.rules": "Rules & Alarms",
    "nav.forum": "Forum",
    "nav.notebook": "Notebook",
    "nav.backStudy": "Back-Studying",
    "nav.globalRanking": "Global Ranking",
    "account.settings": "Account settings",
    "account.preferences": "Preferences",
    "prefs.title": "Preferences",
    "prefs.subtitle": "Personalize your experience (language and appearance).",
    "prefs.appearance": "Appearance",
    "prefs.theme.label": "Theme",
    "prefs.theme.neuro": "NeuroMode",
    "prefs.theme.light": "Light mode",
    "prefs.language": "Language",
    "prefs.language.auto": "Auto (browser)",
    "prefs.language.en": "English",
    "prefs.language.es": "Español",
    "prefs.hint.saved": "Saved automatically.",
  },
  es: {
    "nav.performance": "Rendimiento",
    "nav.challenges": "Desafíos",
    "nav.resources": "Recursos",
    "nav.rules": "Reglas y Alarmas",
    "nav.forum": "Foro",
    "nav.notebook": "Notebook",
    "nav.backStudy": "Back-Studying",
    "nav.globalRanking": "Ranking Global",
    "account.settings": "Configuración",
    "account.preferences": "Preferencias",
    "prefs.title": "Preferencias",
    "prefs.subtitle": "Personaliza tu experiencia (idioma y apariencia).",
    "prefs.appearance": "Apariencia",
    "prefs.theme.label": "Tema",
    "prefs.theme.neuro": "NeuroMode",
    "prefs.theme.light": "Modo claro",
    "prefs.language": "Idioma",
    "prefs.language.auto": "Automático (navegador)",
    "prefs.language.en": "English",
    "prefs.language.es": "Español",
    "prefs.hint.saved": "Se guarda automáticamente.",
  },
};

export function t(key: string, locale: ResolvedLocale): string {
  return DICT[locale]?.[key] ?? DICT.en[key] ?? key;
}
