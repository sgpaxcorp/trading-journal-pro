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
    "common.close": "Close",
    "common.cancel": "Cancel",

    /* -----------------
       Settings (gear menu)
    ------------------ */
    "settings.title": "Settings",
    "settings.subtitle": "Language and theme preferences (saved to your account).",
    "settings.language": "Language",
    "settings.theme": "Theme",
    "settings.theme.neuro": "NeuroMode (dark)",
    "settings.theme.light": "Light Mode",
    "settings.otherLanguage": "Other language code",
    "settings.saveHint": "Changes save automatically.",

    /* -----------------
       TopNav (canonical)
    ------------------ */
    "nav.performance": "Business Performance",
    "nav.notebook": "Business Notebook",
    "nav.backStudy": "Strategy Review Lab",
    "nav.rules": "Business Protection System",
    "nav.forum": "Forum",
    "nav.optionFlow": "Market Intelligence Tools",
    "nav.smartTools": "Market Intelligence Tools",

    // Backwards-compatible aliases (older patches)
    "nav.performance.title": "Business Performance",
    "nav.notebook.title": "Business Notebook",
    "nav.backStudy.title": "Strategy Review Lab",
    "nav.rules.title": "Business Protection System",
    "nav.forum.title": "Forum",
    "nav.optionFlow.title": "Market Intelligence Tools",
    "nav.smartTools.title": "Market Intelligence Tools",

    /* -----------------
       Smart Tools dropdown items
    ------------------ */
    "nav.smartTools.optionFlow.title": "Option Flow Intelligence",
    "nav.smartTools.optionFlow.desc": "Options flow reports, premarket plans, and outcome review for the business.",
    "nav.smartTools.neuroAnalysis.title": "Neuro Analysis",
    "nav.smartTools.neuroAnalysis.desc": "Company intelligence, evidence checklist, market research, and 2-10 year valuation scenarios.",

    /* -----------------
       Performance dropdown items
    ------------------ */
    "nav.performance.balanceChart.title": "Business balance chart",
    "nav.performance.balanceChart.desc":
      "Evolution of your account and daily comparison vs. your business target.",
    "nav.performance.analyticsStatistics.title": "Business Analytics",
    "nav.performance.analyticsStatistics.desc":
      "Analyze your historical data with business statistics.",
    "nav.performance.planSummary.title": "Trading Business Plan",
    "nav.performance.planSummary.desc": "Structured overview of your Trading Business Plan.",
    "nav.performance.aiCoaching.title": "Business AI Coach",
    "nav.performance.aiCoaching.desc": "Coaching ideas based on your metrics and business plan.",
    "nav.performance.profitLoss.title": "Business P&L Office",
    "nav.performance.profitLoss.desc":
      "Track business expenses, subscriptions, and net profitability.",
    "nav.performance.cashFlow.title": "Business Cash Flow",
    "nav.performance.cashFlow.desc": "Track your deposits and withdrawals plan.",

    // Common aliases we have seen in screenshots / older code
    "nav.performance.balance.title": "Business balance chart",
    "nav.performance.balance.desc":
      "Evolution of your account and daily comparison vs. your business target.",
    "nav.performance.analytics.title": "Business Analytics",
    "nav.performance.analytics.desc":
      "Analyze your historical data with business statistics.",
    "nav.performance.ai.title": "Business AI Coach",
    "nav.performance.ai.desc": "Coaching ideas based on your metrics and business plan.",
    "nav.performance.plan.title": "Business Cash Flow",
    "nav.performance.plan.desc": "Track your deposits and withdrawals plan.",

    /* -----------------
       Rules dropdown
    ------------------ */
    "nav.rules.reminders.title": "Routine Checks",
    "nav.rules.reminders.desc": "Quiet check-ins for premarket, execution records, and business process habits.",
    "nav.rules.alarms.title": "Critical Alarms",
    "nav.rules.alarms.desc": "Popups for max loss, daily goal, open positions, and broken rules.",

    /* -----------------
       Forum dropdown
    ------------------ */
    "nav.forum.community.title": "Community feed",
    "nav.forum.community.desc": "Share progress with other Trader Entrepreneurs.",
    // Older alias
    "nav.forum.communityFeed.title": "Community feed",
    "nav.forum.communityFeed.desc": "Share progress with other Trader Entrepreneurs.",

    /* -----------------
       Help menu (canonical)
    ------------------ */
    "help.title": "Need help with this page?",
    "help.desc":
      "This Business Center is your operating hub: you can see your P&L calendar, weekly summaries, plan progress, and business milestones. Use it to keep the parts of your trading business connected.",
    "help.point1": "Click on any day in the calendar to open that execution record.",
    "help.point2": "Use the dashboard controls to focus the business signals you care about.",
    "help.point3": "Edit your Trading Business Plan to update targets and calculations.",
    "help.gettingStarted": "Getting started guide",
    "help.dashboardTour": "Business Center tour",
    "help.bullet.calendar": "Click on any day in the calendar to open that execution record.",
    "help.bullet.widgets": "Use the dashboard controls to focus the business signals you care about.",
    "help.bullet.plan": "Edit your Trading Business Plan to update targets and calculations.",

    // Older aliases
    "help.button": "Help",
    "help.bullet1": "Click on any day in the calendar to open that execution record.",
    "help.bullet2": "Use the dashboard controls to focus the business signals you care about.",
    "help.bullet3": "Edit your Trading Business Plan to update targets and calculations.",
    "help.link.gettingStarted": "Getting started guide",
    "help.link.dashboardTour": "Business Center tour",
    "help.link.activateTour": "Activate quick tour",

    /* -----------------
       Account menu (TopNav avatar dropdown) - canonical
    ------------------ */
    "account.menu.accountSettings": "Trader Entrepreneur Account",
    "account.menu.preferences": "Preferences",
    "account.menu.changePassword": "Change password",
    "account.menu.billing": "Business Billing & Access",
    "account.menu.billingHistory": "Billing history",
    "account.menu.signOut": "Sign out",
    "account.menu.profilePhoto": "Trader profile & photo",
    "account.menu.security": "Security",
    "account.menu.upgrade": "Upgrade / cancel",
    "account.menu.invoices": "Invoices",
    "account.menu.noPlan": "No plan set",
    "account.menu.noSubscription": "No business access active",
    "account.menu.currentPlan": "Current plan",
    "account.menu.plan": "Plan",
    "account.menu.profile": "Trader profile & photo",
    "account.menu.langTheme": "Language & theme",
    "account.noSubscription": "No business access active",
    "account.plan.label": "Plan",

    // Simple labels used by menu UI
    Account: "Trader Entrepreneur Account",
    Preferences: "Preferences",
    "Security & Privacy": "Security & Privacy",
    Billing: "Business Billing",
    "Billing History": "Billing history",
    Plan: "Plan",

    // Older alias namespace (accountMenu.*)
    "accountMenu.accountSettings": "Trader Entrepreneur Account",
    "accountMenu.preferences": "Preferences",
    "accountMenu.changePassword": "Change password",
    "accountMenu.billing": "Business Billing & Access",
    "accountMenu.billingHistory": "Billing history",
    "accountMenu.signOut": "Sign out",
    "accountMenu.profilePhoto": "Trader profile & photo",
    "accountMenu.security": "Security",
    "accountMenu.upgrade": "Upgrade / cancel",
    "accountMenu.invoices": "Invoices",
    "accountMenu.noPlan": "No plan set",
    "accountMenu.noSubscription": "No business access active",
    "accountMenu.currentPlan": "Current plan",
    "accountMenu.plan": "Plan",

    /* -----------------
       Account tabs (Account pages)
    ------------------ */
    "account.tabs.settings": "Trader Entrepreneur Account",
    "account.tabs.preferences": "Preferences",
    "account.tabs.password": "Change password",
    "account.tabs.billing": "Business Billing & Access",
    "account.tabs.billingHistory": "Billing history",

    // Older (seen in some pages)
    "account.settings": "Trader Entrepreneur Account",
    "account.preferences": "Preferences",
    "account.password": "Change password",
    "account.billing": "Business Billing & Access",
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
    "footer.brand": "Neuro Trader",
    "footer.description":
      "NeuroTrader is the Trading Business Operating System for Trader Entrepreneurs. It connects the Trading Business Plan, execution records, risk controls, business performance, financial management, audits, and AI-guided accountability in one platform.",
    "footer.links.login": "Log In",
    "footer.links.staff": "Staff login",
    "footer.links.blog": "Blog",
    "footer.links.pricing": "Pricing",
    "footer.links.partner": "Partner login",
    "footer.links.contact": "Contact Us",
    "footer.links.privacy": "Privacy Policy",
    "footer.links.terms": "Terms & Conditions",
    "footer.links.about": "About Us",
    "footer.copyright":
      "Build the trading business plan. Protect it with one operating loop.",

    // Older aliases (footer.link.*)
    "footer.link.login": "Log In",
    "footer.link.blog": "Blog",
    "footer.link.pricing": "Pricing",
    "footer.link.partner": "Partner login",
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
    "prefs.appearance": "Appearance",
    "prefs.theme.title": "Theme",
    "prefs.theme.label": "Theme",
    "prefs.theme.subtitle":
      "Switch between NeuroMode (dark) and Light mode. Light mode keeps your brand colors (green, violet, blue) with brighter backgrounds and soft gray lines.",
    "prefs.theme.neuro": "NeuroMode",
    "prefs.theme.light": "Light mode",
    "prefs.language.label": "Language",
    "prefs.language.title": "Language",
    "prefs.language": "Language",
    "prefs.language.subtitle":
      "Select your preferred language. If you choose Auto, we follow your browser language.",
    "prefs.language.auto": "Auto",
    "prefs.language.english": "English",
    "prefs.language.spanish": "Spanish",
    "prefs.note":
      "Note: We are rolling out translations progressively, page by page. Navigation and account settings are prioritized first.",
    "prefs.saved": "Saved",
    "prefs.hint.saved": "Saved",
    "prefs.saving": "Saving…",
    "prefs.error": "We couldn't save your preferences. Please try again.",

    /* -----------------
       Misc / Future account strings (safe to keep)
    ------------------ */
    "account.title": "Trader Entrepreneur Account",
    "account.subtitle":
      "Update your identity, contact information and manage preferences.",
  },

  es: {
    /* -----------------
       Common
    ------------------ */
    "common.loading": "Cargando…",
    "common.close": "Cerrar",
    "common.cancel": "Cancelar",

    /* -----------------
       Settings (gear menu)
    ------------------ */
    "settings.title": "Preferencias",
    "settings.subtitle": "Idioma y tema (se guarda en tu cuenta).",
    "settings.language": "Idioma",
    "settings.theme": "Tema",
    "settings.theme.neuro": "NeuroMode (oscuro)",
    "settings.theme.light": "Modo claro",
    "settings.otherLanguage": "Otro código de idioma",
    "settings.saveHint": "Los cambios se guardan automáticamente.",

    /* -----------------
       TopNav (canonical)
    ------------------ */
    "nav.performance": "Rendimiento Empresarial",
    "nav.notebook": "Notebook Empresarial",
    "nav.backStudy": "Laboratorio de Revisión",
    "nav.rules": "Sistema de Protección Empresarial",
    "nav.forum": "Foro",
    "nav.optionFlow": "Herramientas de Inteligencia de Mercado",
    "nav.smartTools": "Herramientas de Inteligencia de Mercado",

    // Aliases
    "nav.performance.title": "Rendimiento Empresarial",
    "nav.notebook.title": "Notebook Empresarial",
    "nav.backStudy.title": "Laboratorio de Revisión",
    "nav.rules.title": "Sistema de Protección Empresarial",
    "nav.forum.title": "Foro",
    "nav.optionFlow.title": "Herramientas de Inteligencia de Mercado",
    "nav.smartTools.title": "Herramientas de Inteligencia de Mercado",

    /* -----------------
       Smart Tools dropdown items
    ------------------ */
    "nav.smartTools.optionFlow.title": "Option Flow Intelligence",
    "nav.smartTools.optionFlow.desc": "Reportes de options flow, planes premarket y revisión de resultados para el negocio.",
    "nav.smartTools.neuroAnalysis.title": "Neuro Analysis",
    "nav.smartTools.neuroAnalysis.desc": "Inteligencia de compañías, checklist de evidencia, research de mercado y escenarios de valuation 2-10 años.",

    /* -----------------
       Performance dropdown items
    ------------------ */
    "nav.performance.balanceChart.title": "Gráfico de balance empresarial",
    "nav.performance.balanceChart.desc":
      "Evolución de tu cuenta y comparación diaria vs. tu meta empresarial.",
    "nav.performance.analyticsStatistics.title": "Analítica Empresarial",
    "nav.performance.analyticsStatistics.desc":
      "Analiza tu historial con estadísticas empresariales.",
    "nav.performance.planSummary.title": "Plan de Empresa de Trading",
    "nav.performance.planSummary.desc": "Vista estructurada de tu Plan de Empresa de Trading.",
    "nav.performance.aiCoaching.title": "Coach Empresarial IA",
    "nav.performance.aiCoaching.desc": "Ideas de coaching basadas en tus métricas y plan empresarial.",
    "nav.performance.profitLoss.title": "Oficina de P&L Empresarial",
    "nav.performance.profitLoss.desc":
      "Controla gastos, suscripciones y la rentabilidad neta del negocio.",
    "nav.performance.cashFlow.title": "Flujo de Caja Empresarial",
    "nav.performance.cashFlow.desc": "Registra depósitos y retiros.",

    // Aliases
    "nav.performance.balance.title": "Gráfico de balance empresarial",
    "nav.performance.balance.desc":
      "Evolución de tu cuenta y comparación diaria vs. tu meta empresarial.",
    "nav.performance.analytics.title": "Analítica Empresarial",
    "nav.performance.analytics.desc": "Analiza tu historial con estadísticas empresariales.",
    "nav.performance.ai.title": "Coach Empresarial IA",
    "nav.performance.ai.desc": "Ideas de coaching basadas en tus métricas y plan empresarial.",
    "nav.performance.plan.title": "Flujo de Caja Empresarial",
    "nav.performance.plan.desc": "Registra depósitos y retiros.",

    /* -----------------
       Rules dropdown
    ------------------ */
    "nav.rules.reminders.title": "Chequeos de rutina",
    "nav.rules.reminders.desc": "Checks suaves para premarket, registro de ejecución y hábitos del proceso empresarial.",
    "nav.rules.alarms.title": "Alarmas críticas",
    "nav.rules.alarms.desc": "Popups para max loss, meta diaria, posiciones abiertas y reglas rotas.",

    /* -----------------
       Forum dropdown
    ------------------ */
    "nav.forum.community.title": "Comunidad",
    "nav.forum.community.desc": "Comparte tu progreso con otros Empresarios Traders.",
    "nav.forum.communityFeed.title": "Comunidad",
    "nav.forum.communityFeed.desc": "Comparte tu progreso con otros Empresarios Traders.",

    /* -----------------
       Help menu
    ------------------ */
    "help.title": "¿Necesitas ayuda con esta página?",
    "help.desc":
      "Este Centro Empresarial es tu hub operativo: puedes ver tu calendario de P&L, resúmenes semanales, progreso del plan y milestones empresariales. Úsalo para mantener conectadas las partes de tu empresa de trading.",
    "help.point1": "Haz clic en un día del calendario para abrir ese registro de ejecución.",
    "help.point2": "Usa los controles del dashboard para enfocar las señales empresariales que importan.",
    "help.point3": "Edita tu Plan de Empresa de Trading para actualizar cálculos.",
    "help.gettingStarted": "Guía de inicio",
    "help.dashboardTour": "Tour del Centro Empresarial",
    "help.bullet.calendar": "Haz clic en un día del calendario para abrir ese registro de ejecución.",
    "help.bullet.widgets": "Usa los controles del dashboard para enfocar las señales empresariales que importan.",
    "help.bullet.plan": "Edita tu Plan de Empresa de Trading para actualizar cálculos.",

    // Aliases
    "help.button": "Ayuda",
    "help.bullet1": "Haz clic en un día del calendario para abrir ese registro de ejecución.",
    "help.bullet2": "Usa los controles del dashboard para enfocar las señales empresariales que importan.",
    "help.bullet3": "Edita tu Plan de Empresa de Trading para actualizar cálculos.",
    "help.link.gettingStarted": "Guía de inicio",
    "help.link.dashboardTour": "Tour del Centro Empresarial",
    "help.link.activateTour": "Activar tour rápido",

    /* -----------------
       Account menu
    ------------------ */
    "account.menu.accountSettings": "Cuenta de Empresario Trader",
    "account.menu.preferences": "Preferencias",
    "account.menu.changePassword": "Cambiar contraseña",
    "account.menu.billing": "Facturación y acceso empresarial",
    "account.menu.billingHistory": "Historial de facturación",
    "account.menu.signOut": "Cerrar sesión",
    "account.menu.profilePhoto": "Perfil trader y foto",
    "account.menu.security": "Seguridad",
    "account.menu.upgrade": "Mejorar / cancelar",
    "account.menu.invoices": "Facturas",
    "account.menu.noPlan": "Sin plan",
    "account.menu.noSubscription": "Sin acceso empresarial activo",
    "account.menu.currentPlan": "Plan actual",
    "account.menu.plan": "Plan",
    "account.menu.profile": "Perfil trader y foto",
    "account.menu.langTheme": "Idioma y tema",
    "account.noSubscription": "Sin acceso empresarial activo",
    "account.plan.label": "Plan",

    // Etiquetas simples usadas en menús
    Account: "Cuenta de Empresario Trader",
    Preferences: "Preferencias",
    "Security & Privacy": "Seguridad y privacidad",
    Billing: "Facturación Empresarial",
    "Billing History": "Historial de facturación",
    Plan: "Plan",

    // Older alias namespace (accountMenu.*)
    "accountMenu.accountSettings": "Cuenta de Empresario Trader",
    "accountMenu.preferences": "Preferencias",
    "accountMenu.changePassword": "Cambiar contraseña",
    "accountMenu.billing": "Facturación y acceso empresarial",
    "accountMenu.billingHistory": "Historial de facturación",
    "accountMenu.signOut": "Cerrar sesión",
    "accountMenu.profilePhoto": "Perfil trader y foto",
    "accountMenu.security": "Seguridad",
    "accountMenu.upgrade": "Mejorar / cancelar",
    "accountMenu.invoices": "Facturas",
    "accountMenu.noPlan": "Sin plan",
    "accountMenu.noSubscription": "Sin acceso empresarial activo",
    "accountMenu.currentPlan": "Plan actual",
    "accountMenu.plan": "Plan",

    /* -----------------
       Account tabs
    ------------------ */
    "account.tabs.settings": "Cuenta de Empresario Trader",
    "account.tabs.preferences": "Preferencias",
    "account.tabs.password": "Cambiar contraseña",
    "account.tabs.billing": "Facturación y acceso empresarial",
    "account.tabs.billingHistory": "Historial de facturación",

    // Older
    "account.settings": "Cuenta de Empresario Trader",
    "account.preferences": "Preferencias",
    "account.password": "Cambiar contraseña",
    "account.billing": "Facturación y acceso empresarial",
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
    "footer.brand": "Neuro Trader",
    "footer.description":
      "NeuroTrader es el Sistema Operativo de Empresa de Trading para Empresarios Traders. Conecta el Plan de Empresa de Trading, registros de ejecución, controles de riesgo, rendimiento empresarial, gestión financiera, auditorías y accountability guiada por IA en una sola plataforma.",
    "footer.links.login": "Iniciar sesión",
    "footer.links.staff": "Staff login",
    "footer.links.blog": "Blog",
    "footer.links.pricing": "Precios",
    "footer.links.partner": "Partner login",
    "footer.links.contact": "Contáctanos",
    "footer.links.privacy": "Política de privacidad",
    "footer.links.terms": "Términos y condiciones",
    "footer.links.about": "Sobre nosotros",
    "footer.copyright":
      "Construye el plan de empresa de trading. Protégelo con un solo ciclo operativo.",

    // Aliases
    "footer.link.login": "Iniciar sesión",
    "footer.link.blog": "Blog",
    "footer.link.pricing": "Precios",
    "footer.link.partner": "Partner login",
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
    "prefs.appearance": "Apariencia",
    "prefs.theme.title": "Tema",
    "prefs.theme.label": "Tema",
    "prefs.theme.subtitle":
      "Cambia entre NeuroMode (oscuro) y modo claro. El modo claro mantiene los colores de marca (verde, violeta y azul) con fondos más brillantes y líneas grises suaves.",
    "prefs.theme.neuro": "NeuroMode",
    "prefs.theme.light": "Modo claro",
    "prefs.language.label": "Idioma",
    "prefs.language.title": "Idioma",
    "prefs.language": "Idioma",
    "prefs.language.subtitle":
      "Selecciona tu idioma preferido. Si eliges Auto, usamos el idioma del navegador.",
    "prefs.language.auto": "Auto",
    "prefs.language.english": "Inglés",
    "prefs.language.spanish": "Español",
    "prefs.note":
      "Nota: estamos implementando traducciones progresivamente, página por página. Navegación y cuenta se priorizan primero.",
    "prefs.saved": "Guardado",
    "prefs.hint.saved": "Guardado",
    "prefs.saving": "Guardando…",
    "prefs.error": "No pudimos guardar tus preferencias. Intenta de nuevo.",

    /* -----------------
       Misc / Future
    ------------------ */
    "account.title": "Cuenta de Empresario Trader",
    "account.subtitle":
      "Actualiza tu identidad, información de contacto y preferencias empresariales.",
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
