export type LocaleKey = "auto" | "en" | "es";
export type Locale = Exclude<LocaleKey, "auto">;

export const LOCALE_OPTIONS: { value: LocaleKey; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

export function resolveLocale(value?: string | null): Locale {
  if (value === "en" || value === "es") return value;
  // Auto: infer from browser
  const lang = (typeof navigator !== "undefined" ? navigator.language : "en")
    ?.toLowerCase()
    ?.trim();
  if (lang?.startsWith("es")) return "es";
  return "en";
}

const DICT: Record<Locale, Record<string, string>> = {
  en: {
    /* -----------------
       Common
    ------------------ */
    "common.loading": "Loading…",

    /* -----------------
       Preferences page
    ------------------ */
    "prefs.title": "Preferences",
    "prefs.subtitle": "Personalize your experience (language and appearance).",
    "prefs.section.appearance": "Appearance",
    "prefs.section.language": "Language",
    "prefs.theme.title": "Theme",
    "prefs.theme.desc":
      "Switch between NeuroMode (dark) and Light mode. Light mode keeps your brand colors (green, violet, blue) with brighter backgrounds and soft gray lines.",
    "prefs.theme.neuro": "NeuroMode",
    "prefs.theme.light": "Light mode",
    "prefs.lang.title": "Language",
    "prefs.lang.desc":
      "Select your preferred language. If you choose Auto, we follow your browser language.",
    "prefs.lang.label": "Language",

    /* -----------------
       Account tabs
    ------------------ */
    "account.tabs.settings": "Account settings",
    "account.tabs.preferences": "Preferences",
    "account.tabs.password": "Change password",
    "account.tabs.billing": "Billing & subscription",
    "account.tabs.history": "Billing history",

    /* -----------------
       TopNav
    ------------------ */
    "nav.performance": "Performance",
    "nav.notebook": "Notebook",
    "nav.backStudy": "Back-Studying",
    "nav.challenges": "Challenges",
    "nav.resources": "Resources",
    "nav.rules": "Rules & Alarms",
    "nav.forum": "Forum",
    "nav.globalRanking": "Global Ranking",

    // Performance dropdown
    "nav.performance.balanceChart.title": "Balance chart",
    "nav.performance.balanceChart.desc":
      "Evolution of your account and daily comparison vs. your target.",
    "nav.performance.analyticsStatistics.title": "Analytics Statistics",
    "nav.performance.analyticsStatistics.desc":
      "Analyze your historical data with statistics.",
    "nav.performance.aiCoaching.title": "AI Coaching",
    "nav.performance.aiCoaching.desc": "Coaching ideas based on your metrics.",
    "nav.performance.cashflow.title": "Cash Flow Tracking",
    "nav.performance.cashflow.desc": "Track your deposits and withdrawals plan.",

    // Challenges dropdown
    "nav.challenges.main.title": "Challenges",
    "nav.challenges.main.desc": "Consistency challenge with rules.",

    // Resources dropdown
    "nav.resources.library.title": "Library",
    "nav.resources.library.desc": "Hand-picked books and videos.",

    // Rules dropdown
    "nav.rules.reminders.title": "Reminders",
    "nav.rules.reminders.desc": "Reminders that you need when something happens.",
    "nav.rules.alarms.title": "Alarms",
    "nav.rules.alarms.desc": "Notifications for breaking rules.",

    // Forum dropdown
    "nav.forum.communityFeed.title": "Community feed",
    "nav.forum.communityFeed.desc": "Share progress with other traders.",

    /* -----------------
       Help menu
    ------------------ */
    "help.button": "Help",
    "help.title": "Need help with this page?",
    "help.desc":
      "This dashboard is your central hub: you can see your P&L calendar, weekly summaries, streaks and daily targets. Use the widgets to customize what matters most for your process.",
    "help.bullet1": "Click on any day in the calendar to open that journal.",
    "help.bullet2": "Use the widget toggles to show/hide blocks you care about.",
    "help.bullet3": "Edit your growth plan to update targets and calculations.",
    "help.link.gettingStarted": "Getting started guide",
    "help.link.dashboardTour": "Dashboard tour",

    /* -----------------
       Account menu
    ------------------ */
    "accountMenu.profilePhoto": "Profile & photo",
    "accountMenu.security": "Security",
    "accountMenu.upgrade": "Upgrade / cancel",
    "accountMenu.invoices": "Invoices",
    "accountMenu.accountSettings": "Account settings",
    "accountMenu.changePassword": "Change password",
    "accountMenu.billing": "Billing & subscription",
    "accountMenu.billingHistory": "Billing history",
    "accountMenu.signOut": "Sign out",
    "accountMenu.noPlan": "No plan set",
    "accountMenu.noSubscription": "No subscription active",
    "accountMenu.currentPlan": "Current plan",
    "accountMenu.plan": "Plan",

    /* -----------------
       Footer
    ------------------ */
    "footer.brand": "Neuro Trader Journal",
    "footer.description":
      "Tools designed for every trader — in any market — who wants to centralize their trading journey, master self-awareness, and elevate performance. Centralize your journal, understand your patterns, and execute with precision. Because the better you know yourself — the stronger your edge.",
    "footer.link.login": "Log In",
    "footer.link.blog": "Blog",
    "footer.link.pricing": "Pricing",
    "footer.link.partner": "Become a Partner *Coming Soon*",
    "footer.link.contact": "Contact Us",
    "footer.link.privacy": "Privacy Policy",
    "footer.link.terms": "Terms & Conditions",
    "footer.link.about": "About Us",
    "footer.copyright":
      "Built for traders who want structure, risk control, and a healthier mindset.",
  },

  es: {
    /* -----------------
       Common
    ------------------ */
    "common.loading": "Cargando…",

    /* -----------------
       Preferences page
    ------------------ */
    "prefs.title": "Preferencias",
    "prefs.subtitle": "Personaliza tu experiencia (idioma y apariencia).",
    "prefs.section.appearance": "Apariencia",
    "prefs.section.language": "Idioma",
    "prefs.theme.title": "Tema",
    "prefs.theme.desc":
      "Cambia entre NeuroMode (oscuro) y modo Claro. El modo Claro mantiene los colores de la marca (verde, violeta y azul) con fondos más brillantes y líneas grises suaves.",
    "prefs.theme.neuro": "NeuroMode",
    "prefs.theme.light": "Modo claro",
    "prefs.lang.title": "Idioma",
    "prefs.lang.desc":
      "Selecciona tu idioma preferido. Si eliges Auto, seguimos el idioma de tu navegador.",
    "prefs.lang.label": "Idioma",

    /* -----------------
       Account tabs
    ------------------ */
    "account.tabs.settings": "Configuración",
    "account.tabs.preferences": "Preferencias",
    "account.tabs.password": "Cambiar contraseña",
    "account.tabs.billing": "Facturación y suscripción",
    "account.tabs.history": "Historial de facturación",

    /* -----------------
       TopNav
    ------------------ */
    "nav.performance": "Rendimiento",
    "nav.notebook": "Notebook",
    "nav.backStudy": "Back-Studying",
    "nav.challenges": "Desafíos",
    "nav.resources": "Recursos",
    "nav.rules": "Reglas y alarmas",
    "nav.forum": "Foro",
    "nav.globalRanking": "Ranking global",

    // Performance dropdown
    "nav.performance.balanceChart.title": "Gráfica de balance",
    "nav.performance.balanceChart.desc":
      "Evolución de tu cuenta y comparación diaria vs. tu meta.",
    "nav.performance.analyticsStatistics.title": "Estadísticas",
    "nav.performance.analyticsStatistics.desc":
      "Analiza tu historial con métricas y estadísticas.",
    "nav.performance.aiCoaching.title": "Coaching con IA",
    "nav.performance.aiCoaching.desc":
      "Ideas y feedback basados en tus métricas.",
    "nav.performance.cashflow.title": "Flujo de caja",
    "nav.performance.cashflow.desc":
      "Registra depósitos y retiros para tu plan.",

    // Challenges dropdown
    "nav.challenges.main.title": "Desafíos",
    "nav.challenges.main.desc": "Reto de consistencia con reglas.",

    // Resources dropdown
    "nav.resources.library.title": "Biblioteca",
    "nav.resources.library.desc": "Libros y videos recomendados.",

    // Rules dropdown
    "nav.rules.reminders.title": "Recordatorios",
    "nav.rules.reminders.desc":
      "Recordatorios que necesitas cuando pasa algo.",
    "nav.rules.alarms.title": "Alarmas",
    "nav.rules.alarms.desc": "Notificaciones por romper reglas.",

    // Forum dropdown
    "nav.forum.communityFeed.title": "Feed de comunidad",
    "nav.forum.communityFeed.desc": "Comparte tu progreso con otros traders.",

    /* -----------------
       Help menu
    ------------------ */
    "help.button": "Ayuda",
    "help.title": "¿Necesitas ayuda con esta página?",
    "help.desc":
      "Este dashboard es tu centro: aquí ves tu calendario de P&L, resúmenes semanales, rachas y objetivos diarios. Usa los widgets para personalizar lo que más importa para tu proceso.",
    "help.bullet1": "Haz clic en cualquier día del calendario para abrir ese journal.",
    "help.bullet2": "Usa los toggles para mostrar/ocultar los bloques que te importan.",
    "help.bullet3": "Edita tu growth plan para actualizar metas y cálculos.",
    "help.link.gettingStarted": "Guía de inicio",
    "help.link.dashboardTour": "Tour del dashboard",

    /* -----------------
       Account menu
    ------------------ */
    "accountMenu.profilePhoto": "Perfil y foto",
    "accountMenu.security": "Seguridad",
    "accountMenu.upgrade": "Mejorar / cancelar",
    "accountMenu.invoices": "Facturas",
    "accountMenu.accountSettings": "Configuración",
    "accountMenu.changePassword": "Cambiar contraseña",
    "accountMenu.billing": "Facturación",
    "accountMenu.billingHistory": "Historial",
    "accountMenu.signOut": "Cerrar sesión",
    "accountMenu.noPlan": "Sin plan",
    "accountMenu.noSubscription": "Sin suscripción activa",
    "accountMenu.currentPlan": "Plan actual",
    "accountMenu.plan": "Plan",

    /* -----------------
       Footer
    ------------------ */
    "footer.brand": "Neuro Trader Journal",
    "footer.description":
      "Herramientas diseñadas para traders — en cualquier mercado — que quieren centralizar su jornada, dominar la auto-conciencia y elevar su desempeño. Centraliza tu journal, entiende tus patrones y ejecuta con precisión. Porque mientras mejor te conoces — más fuerte es tu edge.",
    "footer.link.login": "Iniciar sesión",
    "footer.link.blog": "Blog",
    "footer.link.pricing": "Precios",
    "footer.link.partner": "Sé partner *Próximamente*",
    "footer.link.contact": "Contáctanos",
    "footer.link.privacy": "Política de privacidad",
    "footer.link.terms": "Términos y condiciones",
    "footer.link.about": "Sobre nosotros",
    "footer.copyright":
      "Hecho para traders que buscan estructura, control de riesgo y una mentalidad más saludable.",
  },
};

export function t(key: string, locale: Locale): string {
  const table = DICT[locale] ?? DICT.en;
  return table[key] ?? DICT.en[key] ?? key;
}
