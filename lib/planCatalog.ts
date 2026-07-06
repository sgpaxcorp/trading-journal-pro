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
    label: { en: "Business-plan AI coach", es: "Coach IA del plan empresarial" },
    body: {
      en: "Reviews your Trading Business Plan, execution record, emotions, and rule obedience to produce next-step coaching.",
      es: "Revisa tu Plan de Empresa de Trading, registro de ejecución, emociones y obediencia a reglas para darte coaching accionable.",
    },
  },
];

export const ADVANCED_UNLOCKS: LocalizedText[] = [
  { en: "Unlimited trading accounts", es: "Cuentas de trading ilimitadas" },
  { en: "AI coaching that follows your Trading Business Plan", es: "AI coaching que da seguimiento a tu Plan de Empresa de Trading" },
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
      en: "Ideal for Trader Entrepreneurs who want the operating foundation: plan, execution record, risk structure, and core KPIs.",
      es: "Ideal para Empresarios Traders que quieren la base operativa: plan, registro de ejecución, estructura de riesgo y KPIs clave.",
    },
    comparisonDescription: {
      en: "The business foundation: execution records, measurable goals, protection alarms, broker imports, and support.",
      es: "La base empresarial: registros de ejecución, metas medibles, alarmas de protección, imports del bróker y soporte.",
    },
    pricingFootnote: {
      en: "Perfect for building the first version of your trading business operation.",
      es: "Perfecto para construir la primera versión de tu operación empresarial de trading.",
    },
    pricingFeatures: [
      { en: "Five (5) trading accounts", es: "Cinco (5) cuentas de trading" },
      { en: "Trading Business Plan + execution entries/exits", es: "Plan de Empresa de Trading + entradas/salidas de ejecución" },
      { en: "Emotions, tags, and lessons learned", es: "Emociones, etiquetas y lecciones" },
      { en: "Calendar results", es: "Calendario de resultados" },
      { en: "Equity curve + balance chart", es: "Curva de equity + balance" },
      { en: "Core KPIs", es: "KPIs clave" },
      { en: "Business Protection System: plan-based critical alarms", es: "Sistema de Protección Empresarial: alarmas críticas conectadas al plan" },
      { en: "Broker data imports: statements, order history, CSV/XLSX", es: "Imports de data del bróker: statements, order history, CSV/XLSX" },
      { en: "Strategy review workspace & business milestones", es: "Workspace de revisión estratégica y milestones empresariales" },
      { en: "Business milestones tied to your Trading Business Plan", es: "Milestones empresariales conectados a tu Plan de Empresa de Trading" },
      { en: "24/7 virtual support agent + ticket follow-up", es: "Agente virtual 24/7 + seguimiento de tickets" },
      { en: "iOS mobile app", es: "Aplicación móvil iOS" },
      { en: "Android app coming soon", es: "Aplicación Android próximamente" },
    ],
    billingHighlights: [
      { en: "Execution Record, calendar, and Trading Business Plan", es: "Registro de Ejecución, calendario y Plan de Empresa de Trading" },
      { en: "Strategy review / back-study basics", es: "Revisión estratégica / back-study básico" },
      { en: "Core KPIs and balance chart", es: "KPIs core y balance chart" },
      { en: "Broker data imports: statements, order history, CSV/XLSX", es: "Imports de data del bróker: statements, order history, CSV/XLSX" },
      { en: "Business Protection System: plan-based critical alarms", es: "Sistema de Protección Empresarial: alarmas críticas conectadas al plan" },
      { en: "24/7 virtual support agent + ticket follow-up", es: "Agente virtual 24/7 + seguimiento de tickets" },
      { en: "iOS mobile app", es: "Aplicación móvil iOS" },
      { en: "Android app coming soon", es: "Aplicación Android próximamente" },
    ],
    startDescription: {
      en: "Ideal for Trader Entrepreneurs who want the operating foundation without overcomplicating the business.",
      es: "Ideal para Empresarios Traders que quieren la base operativa sin complicar el negocio.",
    },
  },
  advanced: {
    name: { en: "Advanced", es: "Advanced" },
    shortName: { en: "Advanced", es: "Advanced" },
    badge: { en: "Most popular", es: "Más popular" },
    description: {
      en: "For about $11 more than Core, Advanced unlocks the full trading business system: AI coaching, deep statistics, P&L, cashflow, audit tools, and reports.",
      es: "Por cerca de $11 más que Core, Advanced desbloquea el sistema completo de empresa de trading: AI coaching, estadística profunda, P&L, cashflow, auditoría y reportes.",
    },
    comparisonDescription: {
      en: "The full operating system: AI plan follow-up, deep statistics, business reporting, audit, and priority support.",
      es: "El sistema completo: seguimiento AI del plan, estadística profunda, reportes de negocio, auditoría y soporte prioritario.",
    },
    pricingFootnote: {
      en: "The extra cost is for the full operating layer: AI, business reporting, audit, and deeper statistics.",
      es: "El costo extra compra la capa completa: IA, reportes de negocio, auditoría y estadística profunda.",
    },
    pricingFeatures: [
      { en: "Unlimited trading accounts", es: "Cuentas de trading ilimitadas" },
      { en: "Everything in Core", es: "Todo lo de Core" },
      { en: "Business Notebook workspace", es: "Workspace de Notebook Empresarial" },
      { en: "Cashflow tracking", es: "Seguimiento de cashflows" },
      { en: "Time-of-day & instrument breakdowns", es: "Desglose por hora e instrumento" },
      { en: "Risk metrics + streaks", es: "Métricas de riesgo + rachas" },
      { en: "Profit & Loss Track (business accounting)", es: "Profit & Loss Track (contabilidad)" },
      { en: "Broker data audit workbench", es: "Audit workbench de data del bróker" },
      { en: "Advanced Business Protection System", es: "Sistema de Protección Empresarial avanzado" },
      { en: "AI coaching that follows your Trading Business Plan", es: "AI coaching que da seguimiento a tu Plan de Empresa de Trading" },
      { en: "Advanced PDF exports", es: "Exportaciones PDF avanzadas" },
      { en: "Priority support: 24/7 virtual agent + ticket follow-up", es: "Soporte prioritario: agente virtual 24/7 + seguimiento de tickets" },
      { en: "iOS mobile app", es: "Aplicación móvil iOS" },
      { en: "Android app coming soon", es: "Aplicación Android próximamente" },
    ],
    billingHighlights: [
      { en: "Everything in Core", es: "Todo lo de Core" },
      { en: "Business Notebook workspace", es: "Workspace de Notebook Empresarial" },
      { en: "Cashflow tracking", es: "Seguimiento de cashflow" },
      { en: "Advanced analytics & breakdowns", es: "Analitica avanzada y breakdowns" },
      { en: "Profit & Loss Track (business accounting)", es: "Profit & Loss Track (contabilidad)" },
      { en: "AI coaching that follows your Trading Business Plan", es: "AI coaching que da seguimiento a tu Plan de Empresa de Trading" },
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
  { kind: "section", label: { en: "TRADING BUSINESS PLAN & FOLLOW-UP", es: "PLAN DE EMPRESA DE TRADING Y SEGUIMIENTO" } },
  { kind: "feature", label: { en: "Trading Business Plan with realistic, measurable targets", es: "Plan de Empresa de Trading con metas realistas y medibles" }, core: true, advanced: true },
  { kind: "feature", label: { en: "AI coach follows your Trading Business Plan", es: "Coach IA da seguimiento a tu Plan de Empresa de Trading" }, core: false, advanced: true },
  { kind: "feature", label: { en: "AI action plans from real execution + trade data", es: "Planes de acción IA desde ejecución + trades reales" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Mindset and rule-obedience coaching", es: "Coaching de mindset y obediencia a reglas" }, core: false, advanced: true },

  { kind: "section", label: { en: "BUSINESS PROTECTION SYSTEM", es: "SISTEMA DE PROTECCIÓN EMPRESARIAL" } },
  { kind: "feature", label: { en: "Plan-based daily goal and max-loss alarms", es: "Alarmas del plan para meta diaria y pérdida máxima" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Rule alarms from your own trading rules", es: "Alarmas desde tus propias reglas de trading" }, core: { en: "Basic", es: "Básico" }, advanced: { en: "Advanced", es: "Avanzado" } },
  { kind: "feature", label: { en: "Pop-up and in-app protection alerts", es: "Alertas pop-up y dentro de la app" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Protection insights handed to Business AI Coach", es: "Insights de protección conectados al Coach Empresarial IA" }, core: false, advanced: true },

  { kind: "section", label: { en: "EXECUTION RECORD & REVIEW", es: "REGISTRO DE EJECUCIÓN Y REVISIÓN" } },
  { kind: "feature", label: { en: "Execution Record", es: "Registro de Ejecución" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Premarket, inside trade & after trade notes", es: "Notas de premarket, inside trade y after trade" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Execution checklist", es: "Checklist de ejecución" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Setup rules & triggers", es: "Reglas y disparadores de setup" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Strategy review / back-study workspace", es: "Workspace de revisión estratégica / back-study" }, core: true, advanced: true },

  { kind: "subheader", label: { en: "Business Notebook", es: "Notebook Empresarial" } },
  { kind: "feature", label: { en: "Business Notebook library", es: "Biblioteca de Notebooks Empresariales" }, indent: 1, core: false, advanced: true },
  { kind: "feature", label: { en: "Custom notebooks, sections & pages", es: "Notebooks custom, secciones y páginas" }, indent: 1, core: false, advanced: true },
  { kind: "feature", label: { en: "Rich text & ink pages", es: "Páginas rich text e ink" }, indent: 1, core: false, advanced: true },

  { kind: "section", label: { en: "STATISTICS & BUSINESS REPORTING", es: "ESTADÍSTICA Y REPORTES DE NEGOCIO" } },
  { kind: "feature", label: { en: "Core KPIs", es: "KPIs clave" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Calendar results", es: "Calendario de resultados" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Equity curve & balance chart", es: "Curva de equity y balance" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Streaks and consistency analytics", es: "Analítica de rachas y consistencia" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Time-of-day breakdown", es: "Desglose por hora" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Instrument & strategy breakdowns", es: "Desglose por instrumento y estrategia" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Risk metrics and edge breakdowns", es: "Métricas de riesgo y breakdowns de edge" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Cashflow tracking", es: "Seguimiento de cashflows" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Profit & Loss Track (business accounting)", es: "Profit & Loss Track (contabilidad)" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Advanced PDF exports", es: "Exportaciones PDF avanzadas" }, core: false, advanced: true },

  { kind: "section", label: { en: "BROKER DATA, IMPORTS & AUDIT", es: "DATA DEL BRÓKER, IMPORTS Y AUDITORÍA" } },
  { kind: "feature", label: { en: "Broker statement imports", es: "Imports de statements del bróker" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Order history imports", es: "Imports de historial de órdenes" }, core: true, advanced: true },
  { kind: "feature", label: { en: "CSV/XLSX broker files", es: "Archivos CSV/XLSX del bróker" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Richer broker data improves AI precision", es: "Más data del bróker mejora la precisión del AI" }, core: { en: "Execution context", es: "Contexto de ejecución" }, advanced: { en: "Audit + AI coaching", es: "Auditoría + AI coaching" } },
  { kind: "feature", label: { en: "Broker data audit workbench", es: "Audit workbench de data del bróker" }, core: false, advanced: true },
  { kind: "feature", label: { en: "Broker Data Sync & Imports add-on", es: "Add-on Broker Data Sync & Imports" }, core: { en: "Available add-on", es: "Add-on disponible" }, advanced: { en: "Available add-on", es: "Add-on disponible" } },

  { kind: "section", label: { en: "BUSINESS CENTER & TRADER ENTREPRENEUR ACCOUNT", es: "CENTRO EMPRESARIAL Y CUENTA DE EMPRESARIO TRADER" } },
  { kind: "feature", label: { en: "Trading accounts", es: "Cuentas de trading" }, core: { en: "5", es: "5" }, advanced: { en: "Unlimited", es: "Ilimitadas" } },
  { kind: "feature", label: { en: "Business Milestones", es: "Milestones Empresariales" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Trader Entrepreneur account and profile", es: "Cuenta y perfil de Empresario Trader" }, core: true, advanced: true },

  { kind: "section", label: { en: "SUPPORT & MOBILE", es: "SOPORTE Y MÓVIL" } },
  { kind: "feature", label: { en: "24/7 virtual support agent", es: "Agente virtual 24/7" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Ticket follow-up until resolved", es: "Seguimiento de ticket hasta resolver" }, core: { en: "Standard", es: "Estándar" }, advanced: { en: "Priority", es: "Prioritario" } },
  { kind: "feature", label: { en: "Admin-reviewed support center", es: "Centro de soporte revisado por admin" }, core: true, advanced: true },
  { kind: "feature", label: { en: "iOS mobile app", es: "Aplicación móvil iOS" }, core: true, advanced: true },
  { kind: "feature", label: { en: "Android mobile app", es: "Aplicación móvil Android" }, core: { en: "Coming soon", es: "Próximamente" }, advanced: { en: "Coming soon", es: "Próximamente" } },

  { kind: "section", tone: "addon", label: { en: "PRIVATE BETA & OPTIONAL MODULES", es: "BETA PRIVADA Y MÓDULOS OPCIONALES" } },
  { kind: "feature", label: { en: "Option Flow Intelligence private beta", es: "Beta privada de Option Flow Intelligence" }, core: { en: "Request access", es: "Solicitar acceso" }, advanced: { en: "Request access", es: "Solicitar acceso" } },
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
