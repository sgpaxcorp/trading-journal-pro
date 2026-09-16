export const DAILY_INVESTMENT_ALERT_CATEGORIES = [
  "sec_filing",
  "earnings_release",
  "guidance_change",
  "corporate_event",
  "industry_development",
  "fundamental_change",
  "concentration_change",
  "upcoming_earnings",
  "coverage_gap",
] as const;

export type DailyInvestmentAlertCategory =
  (typeof DAILY_INVESTMENT_ALERT_CATEGORIES)[number];

export const DAILY_INVESTMENT_REVIEW_STATES = [
  "REQUIRED",
  "RECOMMENDED",
  "NOT_NOW",
] as const;

export type DailyInvestmentReviewState =
  (typeof DAILY_INVESTMENT_REVIEW_STATES)[number];

export type DailyInvestmentOfficeLocalizedText = {
  en: string;
  es: string;
};

export type DailyInvestmentOfficeSource = {
  id: string;
  title: string;
  url: string | null;
  sourceType:
    | "sec_filing"
    | "company_investor_relations"
    | "exchange_notice"
    | "regulator"
    | "portfolio_snapshot"
    | "market_data"
    | "other_primary_source";
  publicationDate: string;
  accessedAt: string;
};

export type DailyInvestmentOfficeAlert = {
  id: string;
  ticker: string;
  category: DailyInvestmentAlertCategory;
  materiality: "critical" | "high" | "medium" | "monitor";
  priorityScore: number;
  headline: DailyInvestmentOfficeLocalizedText;
  whatChanged: DailyInvestmentOfficeLocalizedText;
  whyItMatters: DailyInvestmentOfficeLocalizedText;
  affectedThesisAssumption: string;
  source: DailyInvestmentOfficeSource;
  eventDate: string | null;
  humanReview: DailyInvestmentReviewState;
  evidenceStatus: "CONFIRMED" | "PARTIAL" | "DATA_NOT_AVAILABLE";
  aiInterpretation: true | false;
  automaticTradingDecision: false;
};

export type DailyInvestmentHoldingSnapshot = {
  ticker: string;
  shares: number | null;
  currentPrice: number | null;
  marketValue: number | null;
  weightPct: number | null;
  source: "current_holdings" | "original_thesis_weight";
};

export type DailyInvestmentFundamentalSnapshot = {
  ticker: string;
  reportingPeriod: string | null;
  publicationDate: string | null;
  currency: string | null;
  metrics: Record<string, number | null>;
};

export type DailyInvestmentOfficeBriefing = {
  schemaVersion: "1.0";
  briefingDate: string;
  generatedAt: string;
  marketSession: "OPEN_DAY" | "NON_MARKET_DAY";
  status: "ready" | "partial" | "no_material_changes";
  title: DailyInvestmentOfficeLocalizedText;
  executiveSummary: DailyInvestmentOfficeLocalizedText;
  trackedTickers: string[];
  alerts: DailyInvestmentOfficeAlert[];
  portfolioSnapshot: {
    totalMarketValue: number | null;
    holdings: DailyInvestmentHoldingSnapshot[];
    concentrationAsOf: string;
  };
  fundamentalSnapshots: DailyInvestmentFundamentalSnapshot[];
  dataGaps: DailyInvestmentOfficeLocalizedText[];
  methodology: {
    masterInvestmentPolicyVersion: string;
    materialityIsThesisRelative: true;
    genericNewsExcluded: true;
    humanReviewIsWorkflowTriage: true;
    tradeRecommendationGenerated: false;
    stockPricePredictionGenerated: false;
  };
};

export type DailyInvestmentOfficeBriefingRecord = {
  id: string;
  briefing_date: string;
  version: number;
  status: DailyInvestmentOfficeBriefing["status"];
  briefing: DailyInvestmentOfficeBriefing;
  source_manifest: DailyInvestmentOfficeSource[];
  portfolio_snapshot: DailyInvestmentOfficeBriefing["portfolioSnapshot"];
  content_hash: string;
  generation_mode: "ai_and_deterministic" | "deterministic_only";
  previous_briefing_id: string | null;
  generated_at: string;
  created_at: string;
};

export type DailyInvestmentAttentionReview = {
  id: string;
  briefing_id: string;
  alert_id: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  note: string | null;
  reviewed_at: string | null;
  updated_at: string;
};

export function currentMarketDateIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

type AiAlertNormalizationOptions = {
  trackedTickers: string[];
  thesisAssumptions: Record<string, string[]>;
  allowedSources: DailyInvestmentOfficeSource[];
  generatedAt: string;
  sourceWindowStart?: string;
  sourceWindowEnd?: string;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function localizedText(value: unknown, maxLength: number): DailyInvestmentOfficeLocalizedText | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const en = cleanText(row.en, maxLength);
  const es = cleanText(row.es, maxLength);
  if (!en || !es) return null;
  return { en, es };
}

export function normalizeDailyInvestmentTicker(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function normalizeUrl(value: unknown) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:") return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function comparableText(value: unknown) {
  return cleanText(value, 2_000).toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/g, " ").trim();
}

function validIsoDate(value: unknown) {
  const text = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function containsTradeInstruction(...values: unknown[]) {
  const text = values.map((value) => cleanText(value, 3_000)).join(" ");
  return /\b(?:buy|sell|hold|add|reduce|increase|decrease|allocate|position size|comprar|vender|mantener|añadir|reducir|aumentar|asignar)\b/i.test(
    text
  );
}

function containsInvestmentProbability(...values: unknown[]) {
  const text = values.map((value) => cleanText(value, 3_000)).join(" ");
  return /\b(?:probability|chance|confidence|probabilidad|posibilidad|confianza)\b[^.]{0,30}\b\d{1,3}%/i.test(
    text
  );
}

function findAllowedSource(
  value: unknown,
  allowedSources: DailyInvestmentOfficeSource[]
) {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const requestedUrl = normalizeUrl(row.url);
  if (!requestedUrl) return null;
  const match = allowedSources.find((source) => normalizeUrl(source.url) === requestedUrl);
  if (!match) return null;
  const requestedDate = validIsoDate(row.publicationDate);
  if (!requestedDate || requestedDate !== match.publicationDate) return null;
  return match;
}

export function dailyInvestmentAlertPriority(input: {
  category: DailyInvestmentAlertCategory;
  humanReview: DailyInvestmentReviewState;
}) {
  const categoryScore: Record<DailyInvestmentAlertCategory, number> = {
    sec_filing: 58,
    earnings_release: 72,
    guidance_change: 78,
    corporate_event: 68,
    industry_development: 48,
    fundamental_change: 74,
    concentration_change: 70,
    upcoming_earnings: 45,
    coverage_gap: 62,
  };
  const reviewScore: Record<DailyInvestmentReviewState, number> = {
    REQUIRED: 20,
    RECOMMENDED: 10,
    NOT_NOW: 0,
  };
  const priorityScore = Math.min(100, categoryScore[input.category] + reviewScore[input.humanReview]);
  const materiality =
    priorityScore >= 90
      ? "critical"
      : priorityScore >= 75
        ? "high"
        : priorityScore >= 58
          ? "medium"
          : "monitor";
  return { priorityScore, materiality } as const;
}

export function normalizeDailyInvestmentOfficeAiAlerts(
  value: unknown,
  options: AiAlertNormalizationOptions
): DailyInvestmentOfficeAlert[] {
  const root = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawAlerts = Array.isArray(root.alerts) ? root.alerts : [];
  const trackedTickers = new Set(options.trackedTickers.map(normalizeDailyInvestmentTicker));
  const categories = new Set<string>(DAILY_INVESTMENT_ALERT_CATEGORIES);
  const reviewStates = new Set<string>(DAILY_INVESTMENT_REVIEW_STATES);
  const seen = new Set<string>();
  const alerts: DailyInvestmentOfficeAlert[] = [];

  for (const [index, candidate] of rawAlerts.slice(0, 40).entries()) {
    if (!candidate || typeof candidate !== "object") continue;
    const row = candidate as Record<string, unknown>;
    const ticker = normalizeDailyInvestmentTicker(row.ticker);
    const category = cleanText(row.category, 40) as DailyInvestmentAlertCategory;
    const humanReview = cleanText(row.humanReview, 24) as DailyInvestmentReviewState;
    if (!ticker || !trackedTickers.has(ticker) || !categories.has(category) || !reviewStates.has(humanReview)) {
      continue;
    }

    const headline = localizedText(row.headline, 180);
    const whatChanged = localizedText(row.whatChanged, 900);
    const whyItMatters = localizedText(row.whyItMatters, 900);
    const affectedThesisAssumption = cleanText(row.affectedThesisAssumption, 1_200);
    if (!headline || !whatChanged || !whyItMatters || !affectedThesisAssumption) continue;
    const exactAssumption = (options.thesisAssumptions[ticker] ?? []).find(
      (assumption) => comparableText(assumption) === comparableText(affectedThesisAssumption)
    );
    if (!exactAssumption) continue;

    const source = findAllowedSource(row.source, options.allowedSources);
    if (!source) continue;
    const eventDate = row.eventDate == null ? null : validIsoDate(row.eventDate) || null;
    if (category === "upcoming_earnings") {
      if (!eventDate || (options.sourceWindowEnd && eventDate < options.sourceWindowEnd)) continue;
      if (options.sourceWindowEnd && source.publicationDate > options.sourceWindowEnd) continue;
    } else if (
      (options.sourceWindowStart && source.publicationDate < options.sourceWindowStart) ||
      (options.sourceWindowEnd && source.publicationDate > options.sourceWindowEnd)
    ) {
      continue;
    }
    if (
      containsTradeInstruction(headline.en, headline.es, whatChanged.en, whatChanged.es, whyItMatters.en, whyItMatters.es) ||
      containsInvestmentProbability(headline.en, headline.es, whatChanged.en, whatChanged.es, whyItMatters.en, whyItMatters.es)
    ) {
      continue;
    }

    const dedupeKey = `${ticker}|${category}|${normalizeUrl(source.url)}|${comparableText(headline.en)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const priority = dailyInvestmentAlertPriority({ category, humanReview });
    alerts.push({
      id: `ai-${options.generatedAt.slice(0, 10)}-${index + 1}`,
      ticker,
      category,
      ...priority,
      headline,
      whatChanged,
      whyItMatters,
      affectedThesisAssumption: exactAssumption,
      source,
      eventDate,
      humanReview,
      evidenceStatus: source.sourceType === "sec_filing" ? "CONFIRMED" : "PARTIAL",
      aiInterpretation: true,
      automaticTradingDecision: false,
    });
  }

  return alerts.sort((a, b) => b.priorityScore - a.priorityScore || a.ticker.localeCompare(b.ticker));
}

export function mergeDailyInvestmentOfficeAlerts(
  ...groups: DailyInvestmentOfficeAlert[][]
) {
  const output: DailyInvestmentOfficeAlert[] = [];
  const seen = new Set<string>();
  const candidates = groups
    .flat()
    .sort((a, b) => b.priorityScore - a.priorityScore || a.ticker.localeCompare(b.ticker));
  for (const alert of candidates) {
    const sourceUrl = normalizeUrl(alert.source.url);
    const key = sourceUrl
      ? `${alert.ticker}|${sourceUrl}`
      : `${alert.ticker}|${alert.category}|${comparableText(alert.whatChanged.en)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(alert);
  }
  return output.sort((a, b) => b.priorityScore - a.priorityScore || a.ticker.localeCompare(b.ticker));
}
