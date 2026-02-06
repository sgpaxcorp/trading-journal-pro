// lib/i18n.ts
/**
 * Lightweight i18n helper (no external deps).
 *
 * Goals for this project:
 * - Never show raw i18n keys in the UI (e.g. "nav.performance.analytics.title").
 * - Allow gradual, page-by-page translation without breaking existing pages.
 * - Support "auto" locale (browser language) + explicit "en"/"es".
 */

export type Locale = "auto" | "en" | "es";

/**
 * Resolve "auto" to "en" or "es" based on the browser language.
 */
export function resolveLocale(locale: Locale): Exclude<Locale, "auto"> {
  if (locale !== "auto") return locale;

  if (typeof window === "undefined") return "en";

  const lang = (navigator.language || "en").toLowerCase();
  return lang.startsWith("es") ? "es" : "en";
}

/**
 * Translation dictionaries.
 *
 * Notes:
 * - We keep a superset of keys to stay compatible with older patches/components.
 * - Prefer the "canonical" keys used by current components:
 *   - nav.performance (no ".title")
 *   - footer.links.*
 *   - account.menu.*
 * - Aliases are included for backwards compatibility:
 *   - nav.performance.title, footer.link.*, accountMenu.*, help.bullet*, help.link.*
 */
const DICT: Record<Exclude<Locale, "auto">, Record<string, string>> = {
  en: {
    /* -----------------
       Common
    ------------------ */
    "common.loading": "Loading…",

    /* -----------------
       TopNav (canonical)
    ------------------ */
    "nav.performance": "Performance",
    "nav.notebook": "Notebook",
    "nav.backStudy": "Back-Studying",
    "nav.challenges": "Challenges",
    "nav.resources": "Resources",
    "nav.rules": "Rules & Alarms",
    "nav.forum": "Forum",
    "nav.optionFlow": "Option Flow Intelligence",
    "nav.globalRanking": "Global Ranking",

    // Backwards-compatible aliases (older patches)
    "nav.performance.title": "Performance",
    "nav.notebook.title": "Notebook",
    "nav.backStudy.title": "Back-Studying",
    "nav.challenges.title": "Challenges",
    "nav.resources.title": "Resources",
    "nav.rules.title": "Rules & Alarms",
    "nav.forum.title": "Forum",
    "nav.optionFlow.title": "Option Flow Intelligence",
    "nav.globalRanking.title": "Global Ranking",

    /* -----------------
       Performance dropdown items
    ------------------ */
    "nav.performance.balanceChart.title": "Balance chart",
    "nav.performance.balanceChart.desc":
      "Evolution of your account and daily comparison vs. your target.",
    "nav.performance.analyticsStatistics.title": "Analytics Statistics",
    "nav.performance.analyticsStatistics.desc":
      "Analyze your historical data with statistics.",
    "nav.performance.aiCoaching.title": "AI Coaching",
    "nav.performance.aiCoaching.desc": "Coaching ideas based on your metrics.",
    "nav.performance.cashFlow.title": "Cash Flow Tracking",
    "nav.performance.cashFlow.desc": "Track your deposits and withdrawals plan.",

    // Common aliases we have seen in screenshots / older code
    "nav.performance.balance.title": "Balance chart",
    "nav.performance.balance.desc":
      "Evolution of your account and daily comparison vs. your target.",
    "nav.performance.analytics.title": "Analytics Statistics",
    "nav.performance.analytics.desc":
      "Analyze your historical data with statistics.",
    "nav.performance.ai.title": "AI Coaching",
    "nav.performance.ai.desc": "Coaching ideas based on your metrics.",
    "nav.performance.plan.title": "Cash Flow Tracking",
    "nav.performance.plan.desc": "Track your deposits and withdrawals plan.",

    /* -----------------
       Challenges dropdown
    ------------------ */
    "nav.challenges.item.title": "Challenges",
    "nav.challenges.item.desc": "Consistency challenge with rules.",
    // Older alias
    "nav.challenges.main.title": "Challenges",
    "nav.challenges.main.desc": "Consistency challenge with rules.",

    /* -----------------
       Resources dropdown
    ------------------ */
    "nav.resources.library.title": "Library",
    "nav.resources.library.desc": "Hand-picked books and videos.",

    /* -----------------
       Rules dropdown
    ------------------ */
    "nav.rules.reminders.title": "Reminders",
    "nav.rules.reminders.desc": "Reminders that you need when something happens.",
    "nav.rules.alarms.title": "Alarms",
    "nav.rules.alarms.desc": "Notifications for breaking rules.",

    /* -----------------
       Forum dropdown
    ------------------ */
    "nav.forum.community.title": "Community feed",
    "nav.forum.community.desc": "Share progress with other traders.",
    // Older alias
    "nav.forum.communityFeed.title": "Community feed",
    "nav.forum.communityFeed.desc": "Share progress with other traders.",

    /* -----------------
       Help menu (canonical)
    ------------------ */
    "help.title": "Need help with this page?",
    "help.desc":
      "This dashboard is your central hub: you can see your P&L calendar, weekly summaries, streaks and daily targets. Use the widgets to customize what matters most for your process.",
    "help.point1": "Click on any day in the calendar to open that journal.",
    "help.point2": "Use the widget toggles to show/hide blocks you care about.",
    "help.point3": "Edit your growth plan to update targets and calculations.",
    "help.gettingStarted": "Getting started guide",
    "help.dashboardTour": "Dashboard tour",

    // Older aliases
    "help.button": "Help",
    "help.bullet1": "Click on any day in the calendar to open that journal.",
    "help.bullet2": "Use the widget toggles to show/hide blocks you care about.",
    "help.bullet3": "Edit your growth plan to update targets and calculations.",
    "help.link.gettingStarted": "Getting started guide",
    "help.link.dashboardTour": "Dashboard tour",

    /* -----------------
       Account menu (TopNav avatar dropdown) - canonical
    ------------------ */
    "account.menu.accountSettings": "Account settings",
    "account.menu.preferences": "Preferences",
    "account.menu.changePassword": "Change password",
    "account.menu.billing": "Billing & subscription",
    "account.menu.billingHistory": "Billing history",
    "account.menu.signOut": "Sign out",
    "account.menu.profilePhoto": "Profile & photo",
    "account.menu.security": "Security",
    "account.menu.upgrade": "Upgrade / cancel",
    "account.menu.invoices": "Invoices",
    "account.menu.noPlan": "No plan set",
    "account.menu.noSubscription": "No subscription active",
    "account.menu.currentPlan": "Current plan",
    "account.menu.plan": "Plan",

    // Older alias namespace (accountMenu.*)
    "accountMenu.accountSettings": "Account settings",
    "accountMenu.preferences": "Preferences",
    "accountMenu.changePassword": "Change password",
    "accountMenu.billing": "Billing & subscription",
    "accountMenu.billingHistory": "Billing history",
    "accountMenu.signOut": "Sign out",
    "accountMenu.profilePhoto": "Profile & photo",
    "accountMenu.security": "Security",
    "accountMenu.upgrade": "Upgrade / cancel",
    "accountMenu.invoices": "Invoices",
    "accountMenu.noPlan": "No plan set",
    "accountMenu.noSubscription": "No subscription active",
    "accountMenu.currentPlan": "Current plan",
    "accountMenu.plan": "Plan",

    /* -----------------
       Account tabs (Account pages)
    ------------------ */
    "account.tabs.settings": "Account settings",
    "account.tabs.preferences": "Preferences",
    "account.tabs.password": "Change password",
    "account.tabs.billing": "Billing & subscription",
    "account.tabs.billingHistory": "Billing history",

    // Older (seen in some pages)
    "account.settings": "Account settings",
    "account.preferences": "Preferences",
    "account.password": "Change password",
    "account.billing": "Billing & subscription",
    "account.billingHistory": "Billing history",

    /* -----------------
       Plan labels
    ------------------ */
    "account.plan.core": "Core",
    "account.plan.advanced": "Advanced",
    "account.plan.none": "No plan",

    /* -----------------
       Footer (canonical)
    ------------------ */
    "footer.brand": "Neuro Trader Journal",
    "footer.description":
      "Tools designed for every trader — in any market — who wants to centralize their trading journey, master self-awareness, and elevate performance. Centralize your journal, understand your patterns, and execute with precision. Because the better you know yourself — the stronger your edge.",
    "footer.links.login": "Log In",
    "footer.links.staff": "Staff login",
    "footer.links.blog": "Blog",
    "footer.links.pricing": "Pricing",
    "footer.links.partner": "Become a Partner *Coming Soon*",
    "footer.links.contact": "Contact Us",
    "footer.links.privacy": "Privacy Policy",
    "footer.links.terms": "Terms & Conditions",
    "footer.links.about": "About Us",
    "footer.copyright":
      "Built for traders who want structure, risk control, and a healthier mindset.",

    // Older aliases (footer.link.*)
    "footer.link.login": "Log In",
    "footer.link.blog": "Blog",
    "footer.link.pricing": "Pricing",
    "footer.link.partner": "Become a Partner *Coming Soon*",
    "footer.link.contact": "Contact Us",
    "footer.link.privacy": "Privacy Policy",
    "footer.link.terms": "Terms & Conditions",
    "footer.link.about": "About Us",

    /* -----------------
       Preferences page (Account > Preferences)
    ------------------ */
    "prefs.title": "Preferences",
    "prefs.subtitle": "Personalize your experience (language and appearance).",
    "prefs.appearance.label": "Appearance",
    "prefs.theme.title": "Theme",
    "prefs.theme.subtitle":
      "Switch between NeuroMode (dark) and Light mode. Light mode keeps your brand colors (green, violet, blue) with brighter backgrounds and soft gray lines.",
    "prefs.theme.neuro": "NeuroMode",
    "prefs.theme.light": "Light mode",
    "prefs.language.label": "Language",
    "prefs.language.title": "Language",
    "prefs.language.subtitle":
      "Select your preferred language. If you choose Auto, we follow your browser language.",
    "prefs.language.auto": "Auto",
    "prefs.language.english": "English",
    "prefs.language.spanish": "Español",
    "prefs.note":
      "Note: We are rolling out translations progressively, page by page. Navigation and account settings are prioritized first.",
    "prefs.saved": "Saved",
    "prefs.saving": "Saving…",
    "prefs.error": "We couldn't save your preferences. Please try again.",

    /* -----------------
       Misc / Future account strings (safe to keep)
    ------------------ */
    "account.title": "Account settings",
    "account.subtitle":
      "Update your identity, contact information and manage preferences.",
  },

  es: {
    /* -----------------
       Common
    ------------------ */
    "common.loading": "Cargando…",

    /* -----------------
       TopNav (canonical)
    ------------------ */
    "nav.performance": "Rendimiento",
    "nav.notebook": "Cuaderno",
    "nav.backStudy": "Back-Studying",
    "nav.challenges": "Retos",
    "nav.resources": "Recursos",
    "nav.rules": "Reglas y alarmas",
    "nav.forum": "Foro",
    "nav.optionFlow": "Inteligencia de flujo de opciones",
    "nav.globalRanking": "Ranking global",

    // Aliases
    "nav.performance.title": "Rendimiento",
    "nav.notebook.title": "Cuaderno",
    "nav.backStudy.title": "Back-Studying",
    "nav.challenges.title": "Retos",
    "nav.resources.title": "Recursos",
    "nav.rules.title": "Reglas y alarmas",
    "nav.forum.title": "Foro",
    "nav.optionFlow.title": "Inteligencia de flujo de opciones",
    "nav.globalRanking.title": "Ranking global",

    /* -----------------
       Performance dropdown items
    ------------------ */
    "nav.performance.balanceChart.title": "Gráfico de balance",
    "nav.performance.balanceChart.desc":
      "Evolución de tu cuenta y comparación diaria vs. tu objetivo.",
    "nav.performance.analyticsStatistics.title": "Estadísticas",
    "nav.performance.analyticsStatistics.desc":
      "Analiza tu historial con estadísticas.",
    "nav.performance.aiCoaching.title": "Coaching con IA",
    "nav.performance.aiCoaching.desc": "Ideas de coaching basadas en tus métricas.",
    "nav.performance.cashFlow.title": "Flujo de caja",
    "nav.performance.cashFlow.desc": "Registra depósitos y retiros.",

    // Aliases
    "nav.performance.balance.title": "Gráfico de balance",
    "nav.performance.balance.desc":
      "Evolución de tu cuenta y comparación diaria vs. tu objetivo.",
    "nav.performance.analytics.title": "Estadísticas",
    "nav.performance.analytics.desc": "Analiza tu historial con estadísticas.",
    "nav.performance.ai.title": "Coaching con IA",
    "nav.performance.ai.desc": "Ideas de coaching basadas en tus métricas.",
    "nav.performance.plan.title": "Flujo de caja",
    "nav.performance.plan.desc": "Registra depósitos y retiros.",

    /* -----------------
       Challenges dropdown
    ------------------ */
    "nav.challenges.item.title": "Retos",
    "nav.challenges.item.desc": "Reto de consistencia con reglas.",
    "nav.challenges.main.title": "Retos",
    "nav.challenges.main.desc": "Reto de consistencia con reglas.",

    /* -----------------
       Resources dropdown
    ------------------ */
    "nav.resources.library.title": "Biblioteca",
    "nav.resources.library.desc": "Libros y videos seleccionados.",

    /* -----------------
       Rules dropdown
    ------------------ */
    "nav.rules.reminders.title": "Recordatorios",
    "nav.rules.reminders.desc": "Recordatorios cuando algo ocurre.",
    "nav.rules.alarms.title": "Alarmas",
    "nav.rules.alarms.desc": "Notificaciones por romper reglas.",

    /* -----------------
       Forum dropdown
    ------------------ */
    "nav.forum.community.title": "Comunidad",
    "nav.forum.community.desc": "Comparte tu progreso con otros traders.",
    "nav.forum.communityFeed.title": "Comunidad",
    "nav.forum.communityFeed.desc": "Comparte tu progreso con otros traders.",

    /* -----------------
       Help menu
    ------------------ */
    "help.title": "¿Necesitas ayuda con esta página?",
    "help.desc":
      "Este dashboard es tu centro: puedes ver tu calendario de P&L, resúmenes semanales, rachas y objetivos diarios. Usa los widgets para priorizar lo que importa.",
    "help.point1": "Haz clic en un día del calendario para abrir ese journal.",
    "help.point2": "Usa los toggles para mostrar/ocultar widgets.",
    "help.point3": "Edita tu plan de crecimiento para actualizar cálculos.",
    "help.gettingStarted": "Guía de inicio",
    "help.dashboardTour": "Tour del dashboard",

    // Aliases
    "help.button": "Ayuda",
    "help.bullet1": "Haz clic en un día del calendario para abrir ese journal.",
    "help.bullet2": "Usa los toggles para mostrar/ocultar widgets.",
    "help.bullet3": "Edita tu plan de crecimiento para actualizar cálculos.",
    "help.link.gettingStarted": "Guía de inicio",
    "help.link.dashboardTour": "Tour del dashboard",

    /* -----------------
       Account menu
    ------------------ */
    "account.menu.accountSettings": "Configuración de cuenta",
    "account.menu.preferences": "Preferencias",
    "account.menu.changePassword": "Cambiar contraseña",
    "account.menu.billing": "Facturación y suscripción",
    "account.menu.billingHistory": "Historial de facturación",
    "account.menu.signOut": "Cerrar sesión",
    "account.menu.profilePhoto": "Perfil y foto",
    "account.menu.security": "Seguridad",
    "account.menu.upgrade": "Mejorar / cancelar",
    "account.menu.invoices": "Facturas",
    "account.menu.noPlan": "Sin plan",
    "account.menu.noSubscription": "Sin suscripción activa",
    "account.menu.currentPlan": "Plan actual",
    "account.menu.plan": "Plan",

    // Older alias namespace (accountMenu.*)
    "accountMenu.accountSettings": "Configuración de cuenta",
    "accountMenu.preferences": "Preferencias",
    "accountMenu.changePassword": "Cambiar contraseña",
    "accountMenu.billing": "Facturación y suscripción",
    "accountMenu.billingHistory": "Historial de facturación",
    "accountMenu.signOut": "Cerrar sesión",
    "accountMenu.profilePhoto": "Perfil y foto",
    "accountMenu.security": "Seguridad",
    "accountMenu.upgrade": "Mejorar / cancelar",
    "accountMenu.invoices": "Facturas",
    "accountMenu.noPlan": "Sin plan",
    "accountMenu.noSubscription": "Sin suscripción activa",
    "accountMenu.currentPlan": "Plan actual",
    "accountMenu.plan": "Plan",

    /* -----------------
       Account tabs
    ------------------ */
    "account.tabs.settings": "Configuración de cuenta",
    "account.tabs.preferences": "Preferencias",
    "account.tabs.password": "Cambiar contraseña",
    "account.tabs.billing": "Facturación y suscripción",
    "account.tabs.billingHistory": "Historial de facturación",

    // Older
    "account.settings": "Configuración de cuenta",
    "account.preferences": "Preferencias",
    "account.password": "Cambiar contraseña",
    "account.billing": "Facturación y suscripción",
    "account.billingHistory": "Historial de facturación",

    /* -----------------
       Plan labels
    ------------------ */
    "account.plan.core": "Core",
    "account.plan.advanced": "Advanced",
    "account.plan.none": "Sin plan",

    /* -----------------
       Footer
    ------------------ */
    "footer.brand": "Neuro Trader Journal",
    "footer.description":
      "Herramientas diseñadas para traders — en cualquier mercado — que desean centralizar su progreso, dominar la autoobservación y elevar su desempeño. Centraliza tu journal, entiende tus patrones y ejecuta con precisión. Mientras mejor te conozcas — más fuerte será tu ventaja.",
    "footer.links.login": "Iniciar sesión",
    "footer.links.staff": "Staff login",
    "footer.links.blog": "Blog",
    "footer.links.pricing": "Precios",
    "footer.links.partner": "Sé partner *Próximamente*",
    "footer.links.contact": "Contáctanos",
    "footer.links.privacy": "Política de privacidad",
    "footer.links.terms": "Términos y condiciones",
    "footer.links.about": "Sobre nosotros",
    "footer.copyright":
      "Creado para traders que buscan estructura, control de riesgo y una mentalidad más saludable.",

    // Aliases
    "footer.link.login": "Iniciar sesión",
    "footer.link.blog": "Blog",
    "footer.link.pricing": "Precios",
    "footer.link.partner": "Sé partner *Próximamente*",
    "footer.link.contact": "Contáctanos",
    "footer.link.privacy": "Política de privacidad",
    "footer.link.terms": "Términos y condiciones",
    "footer.link.about": "Sobre nosotros",

    /* -----------------
       Preferences page
    ------------------ */
    "prefs.title": "Preferencias",
    "prefs.subtitle": "Personaliza tu experiencia (idioma y apariencia).",
    "prefs.appearance.label": "Apariencia",
    "prefs.theme.title": "Tema",
    "prefs.theme.subtitle":
      "Cambia entre NeuroMode (oscuro) y modo claro. El modo claro mantiene los colores de marca (verde, violeta y azul) con fondos más brillantes y líneas grises suaves.",
    "prefs.theme.neuro": "NeuroMode",
    "prefs.theme.light": "Modo claro",
    "prefs.language.label": "Idioma",
    "prefs.language.title": "Idioma",
    "prefs.language.subtitle":
      "Selecciona tu idioma preferido. Si eliges Auto, usamos el idioma del navegador.",
    "prefs.language.auto": "Auto",
    "prefs.language.english": "English",
    "prefs.language.spanish": "Español",
    "prefs.note":
      "Nota: estamos implementando traducciones progresivamente, página por página. Navegación y cuenta se priorizan primero.",
    "prefs.saved": "Guardado",
    "prefs.saving": "Guardando…",
    "prefs.error": "No pudimos guardar tus preferencias. Intenta de nuevo.",

    /* -----------------
       Misc / Future
    ------------------ */
    "account.title": "Configuración de cuenta",
    "account.subtitle":
      "Actualiza tu identidad, información de contacto y preferencias.",
  },
};

/**
 * Optional alias mapping for edge-case keys.
 * (We still keep most aliases directly in DICT for clarity.)
 */
const ALIASES: Record<string, string> = {
  // Example: older keys that differ only in naming
  "footer.login": "footer.links.login",
  "footer.staff": "footer.links.staff",
  "footer.blog": "footer.links.blog",
  "footer.pricing": "footer.links.pricing",
  "footer.partner": "footer.links.partner",
  "footer.contact": "footer.links.contact",
  "footer.privacy": "footer.links.privacy",
  "footer.terms": "footer.links.terms",
  "footer.about": "footer.links.about",
};

/**
 * Humanize an i18n key so we never render raw keys in the UI.
 * This is the last resort fallback.
 */
function humanizeKey(key: string): string {
  // If it ends with .title/.desc, use the segment before it.
  const parts = key.split(".");
  let base = parts[parts.length - 1] || key;
  const last = base.toLowerCase();

  if (last === "title" || last === "desc" || last === "description") {
    base = parts[parts.length - 2] || base;
  }

  // Replace camelCase and separators with spaces
  base = base
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .trim();

  // Capitalize
  return base.length ? base[0].toUpperCase() + base.slice(1) : key;
}

/**
 * Translate a key for a locale.
 *
 * - If key exists in the locale dictionary, return it.
 * - Else fall back to English.
 * - Else fall back to `fallback` (if provided).
 * - Else return a humanized string (never the raw key).
 */
export function t(key: string, locale: Locale, fallback?: string): string {
  const resolvedLocale = resolveLocale(locale);
  const resolvedKey = ALIASES[key] ?? key;

  const value =
    DICT[resolvedLocale]?.[resolvedKey] ??
    DICT.en[resolvedKey] ??
    (fallback && fallback.trim() ? fallback : undefined);

  if (value != null) return value;

  // Dev-only warning so missing keys are easy to spot
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[i18n] Missing key: "${resolvedKey}" (locale: ${resolvedLocale})`);
  }

  return humanizeKey(resolvedKey);
}
