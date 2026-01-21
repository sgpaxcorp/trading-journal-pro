// lib/i18nMessages.ts
export type MessageDict = Record<string, string>;

export const I18N_MESSAGES: Record<string, MessageDict> = {
  en: {
    // Settings
    "settings.title": "Settings",
    "settings.subtitle": "Language and theme preferences (saved to your account).",
    "settings.language": "Language",
    "settings.theme": "Theme",
    "settings.theme.neuro": "NeuroMode (dark)",
    "settings.theme.light": "Light Mode",
    "settings.otherLanguage": "Other language code",
    "settings.saveHint": "Changes save automatically.",

    // Common
    "common.close": "Close",
    "common.cancel": "Cancel",

    // Nav (optional)
    "nav.dashboard": "Dashboard",
    "nav.journal": "Journal",
    "nav.challenges": "Challenges",
    "nav.performance": "Performance",
    "nav.resources": "Resources",
    "nav.forum": "Forum",
  },

  es: {
    // Settings
    "settings.title": "Preferencias",
    "settings.subtitle": "Idioma y tema (se guarda en tu cuenta).",
    "settings.language": "Idioma",
    "settings.theme": "Tema",
    "settings.theme.neuro": "NeuroMode (oscuro)",
    "settings.theme.light": "Modo claro",
    "settings.otherLanguage": "Otro código de idioma",
    "settings.saveHint": "Los cambios se guardan automáticamente.",

    // Common
    "common.close": "Cerrar",
    "common.cancel": "Cancelar",

    // Nav (optional)
    "nav.dashboard": "Dashboard",
    "nav.journal": "Journal",
    "nav.challenges": "Retos",
    "nav.performance": "Performance",
    "nav.resources": "Recursos",
    "nav.forum": "Foro",
  },
};
