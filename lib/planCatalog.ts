import type { PlanId } from "@/lib/types";

export type BillingCycle = "monthly" | "annual";
export type CatalogLocale = "en" | "es";
export type LocalizedText = { en: string; es: string };
export type PlanCell = boolean | LocalizedText;

export type PlanComparisonRow =
  | {
      kind: "section";
      label: LocalizedText;
      tone?: "default" | "addon";
    }
  | {
      kind: "subheader";
      label: LocalizedText;
    }
  | {
      kind: "feature";
      label: LocalizedText;
      core: PlanCell;
      advanced: PlanCell;
      indent?: 1 | 2;
    };

export const PLAN_PRICES: Record<PlanId, Record<BillingCycle, number>> = {
  core: { monthly: 15.99, annual: 159.9 },
  advanced: { monthly: 26.99, annual: 269.9 },
};

export const BROKER_SYNC_ADDON = {
  key: "broker_sync",
  name: "Broker Data Sync & Imports",
  prices: { monthly: 5, annual: 50 },
  description: {
    en: "Bring your real broker data into Neuro Trader with secure sync, statement imports, order history, and supported CSV/XLSX files.",
    es: "Trae la data real de tu bróker a Neuro Trader con sync seguro, imports de statements, order history y archivos CSV/XLSX soportados.",
  },
  dataQualityNote: {
    en: "Richer broker history gives the platform sharper audits: fills, entry/exit timestamps, fees, commissions, and order events become cleaner analytics and more useful AI coaching.",
    es: "Mientras más completo sea el historial del bróker, más poderosa se vuelve la auditoría: fills, horarios de entrada/salida, fees, comisiones y eventos de órdenes se convierten en mejor analítica y AI coaching más útil.",
  },
  supportedBrokers: {
    en:
      "Supported brokers (US): Alpaca, Alpaca Paper, Chase, E*Trade, Empower, Fidelity, Moomoo, Public, Robinhood, Schwab, Schwab OAuth, tastytrade, TD Direct Investing, TradeStation, TradeStation Paper, Tradier, Vanguard US, Webull US, Webull US OAuth, Wells Fargo. International: Interactive Brokers, Coinbase (crypto).",
    es:
      "Brokers soportados (US): Alpaca, Alpaca Paper, Chase, E*Trade, Empower, Fidelity, Moomoo, Public, Robinhood, Schwab, Schwab OAuth, tastytrade, TD Direct Investing, TradeStation, TradeStation Paper, Tradier, Vanguard US, Webull US, Webull US OAuth, Wells Fargo. Internacionales: Interactive Brokers, Coinbase (crypto).",
  },
} as const;

export const ADVANCED_UPGRADE_PILLARS: {
  label: LocalizedText;
  body: LocalizedText;
}[] = [
  {
    label: { en: "Advanced statistics", es: "Estadística avanzada" },
    body: {
      en: "Time-of-day, instrument, risk, streaks, and edge breakdowns.",
      es: "Breakdowns por hora, instrumento, riesgo, rachas y edge.",
    },
  },
  {
    label: { en: "Business control", es: "Control de negocio" },
    body: {
      en: "P&L, cashflow, business accounting, reports, and broker data audit workbench.",
      es: "P&L, cashflow, contabilidad, reportes y audit workbench de data del bróker.",
    },
  },
  {
    label: { en: "AI coaching", es: "AI coaching" },
    body: {
      en: "Action plans from your real trades, emotions, and execution patterns.",
      es: "Planes de acción desde tus trades, emociones y patrones reales.",
    },
  },
];

export const ADVANCED_UNLOCKS: LocalizedText[] = [
  { en: "Unlimited trading accounts", es: "Cuentas de trading ilimitadas" },
  { en: "AI coaching and action plans", es: "AI coaching y planes de acción" },
  { en: "Advanced statistics and breakdowns", es: "Estadística avanzada y breakdowns" },
  { en: "Business P&L and cashflow tracking", es: "P&L de negocio y cashflow" },
  { en: "Broker data audit workbench", es: "Audit workbench de data del bróker" },
  { en: "Advanced PDF reports and priority 24/7 virtual support", es: "Reportes PDF avanzados y soporte virtual prioritario 24/7" },
];

export const PLAN_CATALOG: Record<
  PlanId,
  {
    name: LocalizedText;
    shortName: LocalizedText;
    badge?: LocalizedText;
    description: LocalizedText;
    comparisonDescription: LocalizedText;
    pricingFootnote: LocalizedText;
    pricingFeatures: LocalizedText[];
    billingHighlights: LocalizedText[];
    startDescription: LocalizedText;
  }
> = {
  core: {
    name: { en: "Core", es: "Core" },
    shortName: { en: "Core", es: "Core" },
    description: {
      en: "Ideal for active traders who want structure, clear goals, and emotional control without overcomplicating things.",
      es: "Ideal para traders activos que buscan estructura, metas claras y control emocional sin complicarse.",
    },
    comparisonDescription: {
      en: "Ideal for independent traders who want structure and clarity.",
      es: "Ideal para traders independientes que buscan estructura y claridad.",
    },
    pricingFootnote: {
      en: "Perfect for personal accounts and first evaluations.",
      es: "Perfecto para cuentas personales y primeras evaluaciones.",
    },
    pricingFeatures: [
      { en: "Five (5) trading accounts", es: "Cinco (5) cuentas de trading" },
      { en: "Premarket plan + journal entries/exits", es: "Plan premarket + entradas/salidas" },
      { en: "Emotions, tags, and lessons learned", es: "Emociones, etiquetas y lecciones" },
      { en: "Calendar results", es: "Calendario de resultados" },
      { en: "Equity curve + balance chart", es: "Curva de equity + balance" },
      { en: "Core KPIs", es: "KPIs clave" },
      { en: "Basic alerts & reminders", es: "Alertas y recordatorios básicos" },
      { en: "Broker data imports: statements, order history, CSV/XLSX", es: "Imports de data del bróker: statements, order history, CSV/XLSX" },
      { en: "Trade review workspace & challenges", es: "Trade review y retos" },
      { en: "Global ranking (opt-in)", es: "Ranking global (opcional)" },
      { en: "24/7 virtual support agent + ticket follow-up", es: "Agente virtual 24/7 + seguimiento de tickets" },
      { en: "iOS mobile app", es: "Aplicación móvil iOS" },
      { en: "Android app coming soon", es: "Aplicación Android próximamente" },
    ],
    billingHighlights: [
      { en: "Daily Journal, calendar, and growth plan", es: "Journal diario, calendario y growth plan" },
      { en: "Trade review / back-study basics", es: "Trade review / back-study básico" },
      { en: "Core KPIs and balance chart", es: "KPIs core y balance chart" },
      { en: "Broker data imports: statements, order history, CSV/XLSX", es: "Imports de data del bróker: statements, order history, CSV/XLSX" },
      { en: "Basic alerts & reminders", es: "Alertas y recordatorios básicos" },
      { en: "24/7 virtual support agent + ticket follow-up", es: "Agente virtual 24/7 + seguimiento de tickets" },
      { en: "iOS mobile app", es: "Aplicación móvil iOS" },
      { en: "Android app coming soon", es: "Aplicación Android próximamente" },
    ],
    startDescription: {
      en: "Ideal for active traders who want structure, clear goals, and emotional control without overcomplicating things.",
      es: "Ideal para traders activos que buscan estructura, metas claras y control emocional sin complicarse.",
    },
  },
  advanced: {
    name: { en: "Advanced", es: "Advanced" },
    shortName: { en: "Advanced", es: "Advanced" },
    badge: { en: "Most popular", es: "Más popular" },
    description: {
      en: "For about $11 more than Core, Advanced turns the journal into a full trading business system: AI coaching, deep statistics, P&L, cashflow, audit tools, and reports.",
      es: "Por cerca de $11 más que Core, Advanced convierte el journal en un sistema completo de negocio: AI coaching, estadística profunda, P&L, cashflow, auditoría y reportes.",
    },
    comparisonDescription: {
      en: "Best value for serious traders, funded accounts, coaches, and business-level reporting.",
      es: "Mejor valor para traders serios, cuentas fondeadas, coaches y reportes a nivel negocio.",
    },
    pricingFootnote: {
      en: "The extra cost is for the full operating layer: AI, business reporting, audit, and deeper statistics.",
      es: "El costo extra compra la capa completa: IA, reportes de negocio, auditoría y estadística profunda.",
    },
    pricingFeatures: [
      { en: "Unlimited trading accounts", es: "Cuentas de trading ilimitadas" },
      { en: "Everything in Core", es: "Todo lo de Core" },
      { en: "Notebook workspace", es: "Workspace de Notebook" },
      { en: "Cashflow tracking", es: "Seguimiento de cashflows" },
      { en: "Time-of-day & instrument breakdowns", es: "Desglose por hora e instrumento" },
      { en: "Risk metrics + streaks", es: "Métricas de riesgo + rachas" },
      { en: "Profit & Loss Track (business accounting)", es: "Profit & Loss Track (contabilidad)" },
      { en: "Broker data audit workbench", es: "Audit workbench de data del bróker" },
      { en: "Advanced alerts & reminders", es: "Alertas y recordatorios avanzados" },
      { en: "AI coaching & action plans", es: "AI coaching y planes de acción" },
      { en: "Advanced PDF exports", es: "Exportaciones PDF avanzadas" },
      { en: "Priority support: 24/7 virtual agent + ticket follow-up", es: "Soporte prioritario: agente virtual 24/7 + seguimiento de tickets" },
      { en: "iOS mobile app", es: "Aplicación móvil iOS" },
      { en: "Android app coming soon", es: "Aplicación Android próximamente" },
    ],
    billingHighlights: [
      { en: "Everything in Core", es: "Todo lo de Core" },
      { en: "Notebook workspace", es: "Workspace de notebook" },
      { en: "Cashflow tracking", es: "Seguimiento de cashflow" },
      { en: "Advanced analytics & breakdowns", es: "Analitica avanzada y breakdowns" },
      { en: "Profit & Loss Track (business accounting)", es: "Profit & Loss Track (contabilidad)" },
      { en: "AI coaching & mindset tools", es: "AI coaching y herramientas de mindset" },
      { en: "Broker data audit workbench", es: "Audit workbench de data del bróker" },
      { en: "Advanced PDF exports", es: "Exportaciones PDF avanzadas" },
      { en: "Priority support: 24/7 virtual agent + ticket follow-up", es: "Soporte prioritario: agente virtual 24/7 + seguimiento de tickets" },
      { en: "iOS mobile app", es: "Aplicación móvil iOS" },
      { en: "Android app coming soon", es: "Aplicación Android próximamente" },
    ],
    startDescription: {
      en: "For about $11 more/month, unlock AI coaching, advanced statistics, business P&L, cashflow, audit tools, and reports.",
      es: "Por cerca de $11 más/mes, desbloquea AI coaching, estadística avanzada, P&L, cashflow, auditoría y reportes.",
    },
  },
};

export const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  { kind: "section", label: { en: "GENERAL", es: "GENERAL" } },
  { kind: "feature", label: { en: "Trading accounts", es: "Cuentas de trading" }, core: { en: "5", es: "5" }, advanced: { en: "Unlimited", es: "Ilimitadas" } },
  { kind: "feature", label: { en: "24/7 virtual support agent", es: "Agente virtual 24/7" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Ticket follow-up until resolved", es: "Seguimiento de ticket hasta resolver" }, core: { en: "Standard", es: "Estándar" }, advanced: { en: "Priority", es: "Prioritario" } },
  { kind: "feature", label: { en: "iOS mobile app", es: "Aplicación móvil iOS" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Android mobile app", es: "Aplicación móvil Android" }, core: { en: "Coming soon", es: "Próximamente" }, advanced: { en: "Coming soon", es: "Próximamente" } },

  { kind: "section", label: { en: "JOURNAL & PLANNING", es: "JOURNAL Y PLANIFICACIÓN" } },
  { kind: "feature", label: { en: "Growth plan & daily targets", es: "Plan de crecimiento y metas diarias" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Daily Journal", es: "Journal diario" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Premarket, inside trade & after trade notes", es: "Notas de premarket, inside trade y after trade" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Journal checklist", es: "Checklist del journal" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Setup rules & triggers", es: "Reglas y disparadores de setup" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Alerts & reminders", es: "Alertas y recordatorios" }, core: { en: "Basic", es: "Básicos" }, advanced: { en: "Advanced", es: "Avanzados" } },

  { kind: "subheader", label: { en: "Advanced Notebook", es: "Notebook Advanced" } },
  { kind: "feature", label: { en: "Notebook library", es: "Biblioteca de notebooks" }, indent: 1, core: false, advanced: true },
  { kind: "feature", label: { en: "Custom notebooks, sections & pages", es: "Libretas custom, secciones y páginas" }, indent: 1, core: false, advanced: true },
  { kind: "feature", label: { en: "Rich text & ink pages", es: "Páginas rich text e ink" }, indent: 1, core: false, advanced: true },

  { kind: "section", label: { en: "REPORTING", es: "REPORTES" } },
  { kind: "feature", label: { en: "Calendar results", es: "Calendario de resultados" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Equity curve & balance chart", es: "Curva de equity y balance" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Cashflow tracking", es: "Seguimiento de cashflows" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Profit & Loss Track (business accounting)", es: "Profit & Loss Track (contabilidad)" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Advanced PDF exports", es: "Exportaciones PDF avanzadas" }, core: false, advanced: true },

  { kind: "section", label: { en: "ANALYTICS", es: "ANALÍTICA" } },
  { kind: "feature", label: { en: "Core KPIs", es: "KPIs clave" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Streaks", es: "Rachas" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Time-of-day breakdown", es: "Desglose por hora" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Instrument & strategy breakdowns", es: "Desglose por instrumento y estrategia" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Risk metrics", es: "Métricas de riesgo" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Edge breakdowns", es: "Breakdowns de edge" }, core: false, advanced: true },

  { kind: "section", label: { en: "OTHER TOOLS", es: "OTRAS HERRAMIENTAS" } },
  { kind: "feature", label: { en: "Trade review / back-study basics", es: "Trade review / back-study básico" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Broker data audit workbench", es: "Audit workbench de data del bróker" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Broker data imports: statements, order history, CSV/XLSX", es: "Imports de data del bróker: statements, order history, CSV/XLSX" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Challenges", es: "Retos" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Global ranking (opt-in)", es: "Ranking global (opcional)" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Option Flow Intelligence (private beta)", es: "Option Flow Intelligence (beta privada)" }, core: { en: "Request access", es: "Solicitar acceso" }, advanced: { en: "Request access", es: "Solicitar acceso" } },
  { kind: "feature", label: { en: "Broker Data Sync & Imports", es: "Broker Data Sync & Imports" }, core: { en: "Add-on", es: "Add-on" }, advanced: { en: "Add-on", es: "Add-on" } },

  { kind: "section", label: { en: "COACHING PROGRAM & AI", es: "PROGRAMA DE COACHING E IA" } },
  { kind: "feature", label: { en: "AI coaching & action plans", es: "AI coaching y planes de acción" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Mindset prompts", es: "Prompts de mindset" }, core: false, advanced: true },

  { kind: "section", tone: "addon", label: { en: "PRIVATE BETA: OPTION FLOW INTELLIGENCE", es: "BETA PRIVADA: OPTION FLOW INTELLIGENCE" } },
  { kind: "feature", label: { en: "Flow analysis summary", es: "Resumen de analisis de flujo" }, core: { en: "Admin enabled", es: "Activado por admin" }, advanced: { en: "Admin enabled", es: "Activado por admin" } },
  { kind: "feature", label: { en: "Premarket attack plan (PDF)", es: "Plan de ataque premarket (PDF)" }, core: { en: "Admin enabled", es: "Activado por admin" }, advanced: { en: "Admin enabled", es: "Activado por admin" } },
  { kind: "feature", label: { en: "Downloadable PDF report", es: "Reporte PDF descargable" }, core: { en: "Admin enabled", es: "Activado por admin" }, advanced: { en: "Admin enabled", es: "Activado por admin" } },
  { kind: "feature", label: { en: "Key levels & risk notes", es: "Niveles clave y notas de riesgo" }, core: { en: "Admin enabled", es: "Activado por admin" }, advanced: { en: "Admin enabled", es: "Activado por admin" } },
  { kind: "feature", label: { en: "Screenshot or CSV ingest", es: "Ingesta por screenshot o CSV" }, core: { en: "Admin enabled", es: "Activado por admin" }, advanced: { en: "Admin enabled", es: "Activado por admin" } },

  { kind: "section", tone: "addon", label: { en: "ADD-ON: BROKER SYNC (SNAPTRADE)", es: "ADD-ON: BROKER SYNC (SNAPTRADE)" } },
  { kind: "feature", label: { en: "Broker connection portal", es: "Portal de conexión de bróker" }, core: { en: "Add-on", es: "Add-on" }, advanced: { en: "Add-on", es: "Add-on" } },
  { kind: "feature", label: { en: "Auto sync trades into Journal", es: "Sincronización automática de trades al Journal" }, core: { en: "Add-on", es: "Add-on" }, advanced: { en: "Add-on", es: "Add-on" } },
  { kind: "feature", label: { en: "Accounts, balances & activity", es: "Cuentas, balances y actividad" }, core: { en: "Add-on", es: "Add-on" }, advanced: { en: "Add-on", es: "Add-on" } },
];

export function catalogText(value: LocalizedText, lang: CatalogLocale) {
  return lang === "es" ? value.es : value.en;
}

export function planMonthlyPrice(planId: PlanId, billingCycle: BillingCycle) {
  return billingCycle === "monthly"
    ? PLAN_PRICES[planId].monthly
    : PLAN_PRICES[planId].annual / 12;
}

export function advancedUpgradePriceLabel(lang: CatalogLocale, billingCycle: BillingCycle = "monthly") {
  const delta = planMonthlyPrice("advanced", billingCycle) - planMonthlyPrice("core", billingCycle);
  const suffix =
    billingCycle === "monthly"
      ? lang === "es"
        ? " más / mes"
        : " more / month"
      : lang === "es"
      ? " más / mes facturado anual"
      : " more / month billed yearly";

  return `+$${delta.toFixed(2)}${suffix}`;
}

export function planBilledAmount(planId: PlanId, billingCycle: BillingCycle) {
  return PLAN_PRICES[planId][billingCycle];
}

export function brokerSyncPrice(billingCycle: BillingCycle) {
  return BROKER_SYNC_ADDON.prices[billingCycle];
}

export function planPriceLabel(planId: PlanId, lang: CatalogLocale, billingCycle: BillingCycle = "monthly") {
  const amount = billingCycle === "monthly"
    ? PLAN_PRICES[planId].monthly
    : PLAN_PRICES[planId].annual / 12;
  const suffix =
    billingCycle === "monthly"
      ? lang === "es"
        ? " / mes"
        : " / month"
      : lang === "es"
      ? " / mes (facturado anual)"
      : " / month (billed yearly)";
  return `$${amount.toFixed(2)}${suffix}`;
}
