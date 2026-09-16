"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CloudDownload,
  Download,
  ExternalLink,
  FileWarning,
  FileText,
  History,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  LockKeyhole,
} from "lucide-react";
import {
  Bar,
  BarChart as RechartsBarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart as RechartsLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import TopNav from "@/app/components/TopNav";
import PortfolioExposureMapPanel from "@/app/(private)/neuro-analysis/PortfolioExposureMapPanel";
import MacroContextPanel from "@/app/(private)/neuro-analysis/MacroContextPanel";
import CapitalAllocationDashboardPanel from "@/app/(private)/neuro-analysis/CapitalAllocationDashboardPanel";
import PerformanceAttributionPanel from "@/app/(private)/neuro-analysis/PerformanceAttributionPanel";
import CapitalAccountsPanel from "@/app/(private)/neuro-analysis/CapitalAccountsPanel";
import DailyInvestmentOfficePanel from "@/app/(private)/neuro-analysis/DailyInvestmentOfficePanel";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  BUSINESS_QUALITY_DIMENSIONS,
  type BusinessQualityAnalysis,
  type BusinessQualityDimensionKey,
  type BusinessQualityEvidence,
} from "@/lib/neuroBusinessQuality";
import {
  MANAGEMENT_ACTION_CATEGORIES,
  type ManagementActionCategoryKey,
  type ManagementCapitalAllocationAnalysis,
} from "@/lib/neuroManagementCapitalAllocation";
import {
  EARNINGS_QUALITY_AREAS,
  type EarningsQualityAccountingRiskAnalysis,
  type EarningsQualityAreaKey,
  type EarningsQualityTrendPoint,
} from "@/lib/neuroEarningsQuality";
import {
  BEAR_CASE_AREAS,
  type BearCaseAreaKey,
  type IndependentBearCaseAnalysis,
} from "@/lib/neuroBearCase";
import {
  COMMITTEE_DECISIONS,
  COMMITTEE_SECTION_KEYS,
  type CommitteeClaimClassification,
  type CommitteeDecision,
  type CommitteeSource,
  type InvestmentCommitteePacket,
} from "@/lib/neuroInvestmentCommittee";
import type {
  InvestmentThesisReview,
  OriginalInvestmentThesisRecord,
} from "@/lib/neuroInvestmentThesis";
import type {
  PositionExitReason,
  PositionExitReview,
} from "@/lib/neuroPositionExitReview";
import type { PortfolioExposureMap } from "@/lib/neuroPortfolioExposure";
import type { MacroContextReport } from "@/lib/neuroMacroContext";
import type { CapitalAllocationDashboard } from "@/lib/neuroCapitalAllocation";
import type { PerformanceAttributionReport } from "@/lib/neuroPerformanceAttribution";
import {
  DATA_NOT_AVAILABLE,
  type FinancialDataIntegrityManifest,
} from "@/lib/neuroFinancialDataIntegrity";
import {
  buildNeuroDecisionSupport,
  normalizeNeuroInvestmentPolicy,
  starterNeuroInvestmentPolicy,
  type NeuroDecisionState,
  type NeuroDecisionSupport,
  type NeuroInvestmentPolicy,
} from "@/lib/neuroInvestmentGovernance";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type Lang = "en" | "es";
type WorkspaceTab = "daily_office" | "research" | "committee" | "screener" | "fund_plan";

type Holding = {
  id: string;
  ticker: string;
  shares: number;
  averageCost: number | null;
  currentPrice: number | null;
  openedAt?: string;
};

type FilingUpload = {
  id: string;
  ticker?: string;
  form: "10-K" | "10-Q";
  file?: File;
  fileName: string;
  fiscalYear?: number | null;
  period?: string | null;
  periodEnd?: string | null;
  fileId?: string;
  vectorStoreId?: string;
  bytes?: number;
  usageBytes?: number;
  expiresAt?: string | null;
  createdAt?: string | null;
  expiresAfterDays?: number;
  status: "idle" | "uploading" | "ready" | "error";
  error?: string;
};

type CompanyDocumentLookup = {
  ticker: string;
  companyName: string;
  cik: string;
  form: "10-K" | "10-Q";
  accessionNumber: string;
  filingDate: string;
  periodEnd: string | null;
  primaryDocument: string;
  documentUrl: string;
  filingDetailUrl: string;
};

type MarketData = {
  source: string;
  ticker: string;
  instrumentType?: "equity" | "etf" | "fund" | "unknown" | string;
  company: {
    name?: string | null;
    shortName?: string | null;
    exchange?: string | null;
    sector?: string | null;
    industry?: string | null;
    quoteType?: string | null;
    currency?: string | null;
  };
  market: {
    regularMarketPrice?: number | null;
    fiftyTwoWeekHigh?: number | null;
    fiftyTwoWeekLow?: number | null;
    regularMarketVolume?: number | null;
    previousClose?: number | null;
    marketCap?: number | null;
    trailingPE?: number | null;
    forwardPE?: number | null;
    dividendYield?: number | null;
  };
  fund?: {
    categoryName?: string | null;
    family?: string | null;
    legalType?: string | null;
    annualReportExpenseRatio?: number | null;
    netAssets?: number | null;
    yield?: number | null;
    ytdReturn?: number | null;
    threeYearAverageReturn?: number | null;
    fiveYearAverageReturn?: number | null;
    beta3Year?: number | null;
    topHoldings?: Array<{
      symbol?: string | null;
      holdingName?: string | null;
      holdingPercent?: number | null;
    }>;
    sectorWeightings?: Record<string, number | null>;
  } | null;
  annualFundamentals: Array<{
    year: number;
    reportingPeriod?: string | null;
    publicationDate?: string | null;
    sourceName?: string | null;
    sourceDocument?: string | null;
    currency?: string | null;
    totalRevenue?: number | null;
    operatingIncome?: number | null;
    netIncome?: number | null;
    operatingCashFlow?: number | null;
    freeCashFlow?: number | null;
    capitalExpenditures?: number | null;
    accountsReceivable?: number | null;
    inventory?: number | null;
    goodwillAndIntangibleAssets?: number | null;
    stockBasedCompensation?: number | null;
    dilutedAverageShares?: number | null;
    deferredRevenue?: number | null;
    deferredTaxAssets?: number | null;
    deferredTaxLiabilities?: number | null;
    netDeferredTaxes?: number | null;
    changeInWorkingCapital?: number | null;
    totalAssets?: number | null;
    pretaxIncome?: number | null;
    incomeTaxExpense?: number | null;
    cashAndCashEquivalents?: number | null;
    dilutedEPS?: number | null;
    totalDebt?: number | null;
    stockholdersEquity?: number | null;
    operatingMargin?: number | null;
    netMargin?: number | null;
    fcfMargin?: number | null;
    debtToEquity?: number | null;
  }>;
  priceHistory: Array<{ date: string; close: number }>;
  yearlyPrice: Array<{ year: number; firstClose: number; lastClose: number; returnPct?: number | null }>;
  dataQuality?: {
    degraded?: boolean;
    profileSource?: string | null;
    priceSource?: string | null;
    fundamentalsSource?: string | null;
    messages?: string[];
    fetchedAt?: string;
  };
  financialDataIntegrity?: FinancialDataIntegrityManifest;
  errors?: Record<string, string | null>;
};

type NeuroCaseSummary = {
  id: string;
  title: string;
  status: string;
  focus_ticker?: string | null;
  research_goal?: string | null;
  holdings?: Holding[];
  readiness?: any;
  latest_report_id?: string | null;
  updated_at?: string;
  created_at?: string;
};

type NeuroReportSummary = {
  id: string;
  case_id?: string | null;
  report_text?: string;
  structured?: any;
  engine?: any;
  missing_filings?: any;
  requires_filings?: boolean;
  created_at?: string;
};

type AgentChatItem = {
  question: string;
  answer: string;
  createdAt: string;
  groundedContext?: {
    caseLoaded?: boolean;
    reports?: number;
    filings?: number;
    vectorStores?: number;
    priorMemory?: number;
  };
};

type SectorScreenerRow = {
  ticker: string;
  name: string;
  sector?: string | null;
  industry?: string | null;
  marketCap?: number | null;
  price?: number | null;
  trailingPE?: number | null;
  forwardPE?: number | null;
  priceToBook?: number | null;
  dividendYield?: number | null;
  fcfYield?: number | null;
  earningsYield?: number | null;
  revenueCagr?: number | null;
  fcfCagr?: number | null;
  operatingMargin?: number | null;
  fcfMargin?: number | null;
  debtToEquity?: number | null;
  status: "PASSED_ALL_REQUIRED_CRITERIA" | "FAILED_REQUIRED_CRITERIA" | "INSUFFICIENT_DATA";
  passed: boolean;
  dataCompletenessPct: number;
  criteria: Array<{
    key: string;
    label: string;
    status: "PASS" | "FAIL" | "DATA_NOT_AVAILABLE";
    explanation: string;
  }>;
  missingMetrics: string[];
  failedCriteria: string[];
  noMagicScore: true;
  dataWarnings?: string[];
};

type SectorScreenerResult = {
  sector: string;
  sectorLabel: string;
  sectors: Array<{ key: string; label: string }>;
  strategy: string;
  template: { key: string; name: string };
  templates: Array<{ key: string; name: string }>;
  summary: Record<string, any>;
  rows: SectorScreenerRow[];
  generatedAt?: string;
};

type ThesisNote = {
  id: string;
  snapshot_type: "thesis_context" | "thesis_update";
  created_at: string;
  payload?: {
    ticker?: string;
    note?: string;
    sourceType?: string;
    sourceLabel?: string;
    impact?: string;
    happenedAt?: string;
    evidenceLevel?: string;
  };
};

type InvestmentCommitteePacketRecord = {
  id: string;
  case_id: string;
  report_id?: string | null;
  policy_id?: string | null;
  ticker: string;
  version: number;
  generation_status: "ready" | "incomplete";
  packet: InvestmentCommitteePacket;
  source_manifest: CommitteeSource[];
  content_hash: string;
  generated_by: "ai_research" | "deterministic_fallback";
  evidence_snapshot?: {
    businessQualityAnalysis?: BusinessQualityAnalysis | null;
    managementCapitalAllocationAnalysis?: ManagementCapitalAllocationAnalysis | null;
    earningsQualityAccountingRiskAnalysis?: EarningsQualityAccountingRiskAnalysis | null;
    independentBearCaseAnalysis?: IndependentBearCaseAnalysis | null;
    macroContext?: MacroContextReport | null;
    performanceAttribution?: PerformanceAttributionReport | null;
    requiresFilings?: boolean;
  };
  report_snapshot?: {
    structured?: {
      businessQualityAnalysis?: BusinessQualityAnalysis | null;
      managementCapitalAllocationAnalysis?: ManagementCapitalAllocationAnalysis | null;
      earningsQualityAccountingRiskAnalysis?: EarningsQualityAccountingRiskAnalysis | null;
      independentBearCaseAnalysis?: IndependentBearCaseAnalysis | null;
      macroContext?: MacroContextReport | null;
      performanceAttribution?: PerformanceAttributionReport | null;
    };
  };
  created_at: string;
};

type InvestmentCommitteeDecisionRecord = {
  id: string;
  case_id: string;
  packet_id: string;
  packet_version: number;
  ticker: string;
  decision: CommitteeDecision;
  rationale: string;
  conditions?: string | null;
  decision_maker_email?: string | null;
  authorization_basis: string;
  portfolio_eligible: boolean;
  decided_at: string;
};

type InvestmentThesisReviewRecord = {
  id: string;
  original_thesis_id: string;
  report_id?: string | null;
  ticker: string;
  classification: InvestmentThesisReview["classification"];
  summary: string;
  changes: InvestmentThesisReview["changes"];
  classification_evidence: InvestmentThesisReview["classificationEvidence"];
  missing_evidence: string[];
  comparison_snapshot?: { review?: InvestmentThesisReview };
  generated_by: InvestmentThesisReview["generatedBy"];
  created_at: string;
};

type PositionExitReviewRecord = {
  id: string;
  original_thesis_id: string;
  report_id?: string | null;
  ticker: string;
  review_status: PositionExitReview["status"];
  primary_reason: PositionExitReview["primaryReason"];
  secondary_reasons: PositionExitReview["secondaryReasons"];
  summary: string;
  what_changed: PositionExitReview["whatChanged"];
  comparisons: PositionExitReview["comparisons"];
  classification_evidence: PositionExitReview["classificationEvidence"];
  missing_evidence: string[];
  price_movement_assessment: PositionExitReview["priceMovementAssessment"];
  comparison_snapshot?: { review?: PositionExitReview };
  generated_by: PositionExitReview["generatedBy"];
  created_at: string;
};

type InvestmentPolicyDraft = {
  universe: string;
  strategy: string;
  horizonYears: string;
  baseCurrency: string;
  benchmark: string;
  restrictions: string;
  liquidityNeeds: string;
  maxPositionPct: string;
  maxSectorPct: string;
  minCashPct: string;
  allowedInstruments: string;
};

type FundShareholder = {
  id: string;
  name: string;
  ownershipPct: number;
  payoutMode: "reinvest" | "withdraw";
  annualWithdrawalPct: number;
};

type FundProjectionYear = {
  year: number;
  beginValue: number;
  monthlyContributions: number;
  capitalBeforeReturn: number;
  grossReturn: number;
  shareholderPayouts: number;
  reinvestedProfit: number;
  endValue: number;
  cumulativeContributions: number;
  cumulativePayouts: number;
  shareholderRows: Array<{
    shareholderId: string;
    name: string;
    ownershipPct: number;
    payoutMode: "reinvest" | "withdraw";
    profitShare: number;
    payout: number;
    reinvested: number;
  }>;
};

const LOCALE_TAG: Record<Lang, string> = {
  en: "en-US",
  es: "es-ES",
};

const BENCHMARK_TICKER = "SPY";

function defaultResearchGoal(isEs: boolean) {
  return isEs
    ? "Analiza objetivamente esta acción o ETF como inversión a largo plazo. Si es acción, evalúa el negocio antes del precio, moat, competencia, calidad de ganancias, free cash flow, seguridad del dividendo, documentos necesarios, valoración actual, Reverse DCF, Caso Bajista Independiente y escenarios de fair value de 2 a 10 años. Si es ETF, evalúa estrategia, holdings, concentración, costo, yield, liquidez, tracking risk y rol dentro de la cartera. Presenta evidencia favorable y contradictoria, incertidumbre, brechas de información y si el research debe quedar en NO HACER NADA, MANTENER EFECTIVO, NECESITA MÁS INFORMACIÓN, TESIS INCIERTA o avanzar a revisión humana autorizada. No predigas el precio ni emitas una orden de trading."
    : "Objectively analyze this stock or ETF as a long-term investment. For a stock, evaluate the business before price, moat, competition, earnings quality, free cash flow, dividend safety, required documents, current valuation, Reverse DCF, an Independent Bear Case, and 2-to-10-year fair-value scenarios. For an ETF, evaluate strategy, holdings, concentration, cost, yield, liquidity, tracking risk, and portfolio role. Present supporting and contradictory evidence, uncertainty, information gaps, and whether research should remain at DO NOTHING, KEEP CASH, NEED MORE INFORMATION, THESIS UNCERTAIN, or advance to authorized human review. Do not predict the stock price or issue a trade instruction.";
}

function isLegacyResearchGoal(value: string) {
  const text = value.trim().toLowerCase();
  return (
    (text.includes("capital") && text.includes("well allocated")) ||
    (text.includes("capital") && text.includes("allocation")) ||
    (text.includes("capital") && text.includes("asignado")) ||
    (text.includes("possible dividend holding") && text.includes("tell me whether")) ||
    (text.includes("posible posición de dividendos") && text.includes("dime si"))
  );
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[,$\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = typeof value === "string" ? Number(value.replace(/[,$\s]/g, "")) : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFundLikeMarketData(item?: MarketData | null) {
  const instrumentType = String(item?.instrumentType ?? "").toLowerCase();
  const quoteType = String(item?.company?.quoteType ?? "").toUpperCase();
  return instrumentType === "etf" || instrumentType === "fund" || quoteType.includes("ETF") || quoteType.includes("FUND");
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pickFirst(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return value;
  }
  return null;
}

function formatCurrency(value: number | null | undefined, localeTag: string) {
  const parsed = optionalNumber(value);
  if (parsed == null) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(parsed) >= 1000 ? 0 : 2,
  }).format(parsed);
}

function formatCompactCurrency(value: number | null | undefined, localeTag: string) {
  const parsed = optionalNumber(value);
  if (parsed == null) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(parsed);
}

function formatDocumentedAmount(
  value: number | null | undefined,
  currency: string | null | undefined,
  localeTag: string
) {
  const parsed = optionalNumber(value);
  if (parsed == null) return DATA_NOT_AVAILABLE;
  const normalizedCurrency = /^[A-Z]{3}$/.test(String(currency ?? "").toUpperCase())
    ? String(currency).toUpperCase()
    : "USD";
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: normalizedCurrency,
    notation: Math.abs(parsed) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(parsed) >= 1000 ? 1 : 2,
  }).format(parsed);
}

function formatPercent(value: number | null | undefined, localeTag: string) {
  const parsed = optionalNumber(value);
  if (parsed == null) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(localeTag, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(parsed);
}

function formatPercentPoints(value: number | null | undefined, localeTag: string) {
  const parsed = optionalNumber(value);
  if (parsed == null) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(localeTag, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(parsed / 100);
}

function reverseDcfCellTone(value: number | null | undefined) {
  if (value == null) return "border-slate-800 bg-slate-950/40 text-slate-500";
  const gap = Math.abs(Number(value));
  if (!Number.isFinite(gap)) return "border-slate-800 bg-slate-950/40 text-slate-500";
  if (gap <= 0.05) return "border-sky-400/50 bg-sky-400/10 text-sky-100";
  if (gap <= 0.25) return "border-slate-700 bg-slate-900/75 text-slate-200";
  return "border-slate-800 bg-slate-950/55 text-slate-400";
}

function reverseDcfScenarioLabel(id: string, language: Lang) {
  const labels: Record<string, Record<Lang, string>> = {
    historical_economics: { en: "Historical economics", es: "Economía histórica" },
    margin_execution: { en: "Margin execution", es: "Ejecución de margen" },
    capital_efficient: { en: "Capital-efficient growth", es: "Crecimiento eficiente en capital" },
    reinvestment_heavy: { en: "Reinvestment-heavy growth", es: "Crecimiento con alta reinversión" },
    higher_hurdle: { en: "Higher return hurdle", es: "Mayor tasa requerida" },
    lower_terminal_support: { en: "Lower terminal support", es: "Menor apoyo terminal" },
  };
  return labels[id]?.[language] ?? id.replace(/_/g, " ");
}

function formatAccountingMetric(value: number | null | undefined, localeTag: string) {
  const parsed = optionalNumber(value);
  if (parsed == null) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(localeTag, {
    notation: Math.abs(parsed) >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(parsed) >= 1_000 ? 1 : 2,
  }).format(parsed);
}

function formatAccountingRelationship(point: EarningsQualityTrendPoint, localeTag: string) {
  if (point.calculatedValue == null) return DATA_NOT_AVAILABLE;
  if (point.calculation === "growth_spread") return formatPercent(point.calculatedValue, localeTag);
  if (point.calculation === "ratio") return `${point.calculatedValue.toFixed(2)}x`;
  return formatAccountingMetric(point.calculatedValue, localeTag);
}

function formatCompactNumber(value: number | null | undefined, localeTag: string) {
  const parsed = optionalNumber(value);
  if (parsed == null) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(localeTag, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(parsed);
}

function scoreFromBoolean(value: boolean, points: number) {
  return value ? points : 0;
}

function scoreTone(score: number) {
  if (score >= 75) return "text-emerald-300";
  if (score >= 50) return "text-amber-300";
  return "text-rose-300";
}

function annualizedPriceReturn(rows?: Array<{ date: string; close: number }> | null) {
  const clean = (rows ?? [])
    .filter((row) => row.date && Number.isFinite(Number(row.close)) && Number(row.close) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = clean[0];
  const last = clean[clean.length - 1];
  if (!first || !last || first.date === last.date) return null;
  const firstTime = Date.parse(first.date);
  const lastTime = Date.parse(last.date);
  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime) || lastTime <= firstTime) return null;
  const years = (lastTime - firstTime) / (365.25 * 24 * 60 * 60 * 1000);
  if (years <= 0) return null;
  const value = Math.pow(Number(last.close) / Number(first.close), 1 / years) - 1;
  return Number.isFinite(value) ? value : null;
}

function aggregateByKey<T>(
  rows: T[],
  getKey: (row: T) => string,
  getValue: (row: T) => number
) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row) || "Unknown";
    map.set(key, (map.get(key) ?? 0) + getValue(row));
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function buildFundProjection(input: {
  initialCapital: number;
  monthlyGoal: number;
  annualReturnPct: number;
  shareholders: FundShareholder[];
  years?: number;
}) {
  const years = Math.max(1, Math.min(30, Math.round(input.years ?? 30)));
  const annualRate = clampNumber(toNumber(input.annualReturnPct), -100, 100) / 100;
  const monthlyContributions = Math.max(0, toNumber(input.monthlyGoal)) * 12;
  const shareholders = input.shareholders.map((shareholder) => ({
    ...shareholder,
    ownershipPct: clampNumber(toNumber(shareholder.ownershipPct), 0, 100),
    annualWithdrawalPct:
      shareholder.payoutMode === "withdraw"
        ? clampNumber(toNumber(shareholder.annualWithdrawalPct), 0, 100)
        : 0,
  }));

  const rows: FundProjectionYear[] = [];
  let beginValue = Math.max(0, toNumber(input.initialCapital));
  let cumulativeContributions = 0;
  let cumulativePayouts = 0;

  for (let year = 1; year <= years; year += 1) {
    const capitalBeforeReturn = beginValue + monthlyContributions;
    const grossReturn = capitalBeforeReturn * annualRate;
    const shareholderRows = shareholders.map((shareholder) => {
      const profitShare = grossReturn * (shareholder.ownershipPct / 100);
      const payout = shareholder.payoutMode === "withdraw"
        ? Math.max(0, profitShare) * (shareholder.annualWithdrawalPct / 100)
        : 0;
      return {
        shareholderId: shareholder.id,
        name: shareholder.name || "Shareholder",
        ownershipPct: shareholder.ownershipPct,
        payoutMode: shareholder.payoutMode,
        profitShare,
        payout,
        reinvested: profitShare - payout,
      };
    });
    const shareholderPayouts = shareholderRows.reduce((sum, row) => sum + row.payout, 0);
    const reinvestedProfit = grossReturn - shareholderPayouts;
    const endValue = capitalBeforeReturn + reinvestedProfit;
    cumulativeContributions += monthlyContributions;
    cumulativePayouts += shareholderPayouts;

    rows.push({
      year,
      beginValue,
      monthlyContributions,
      capitalBeforeReturn,
      grossReturn,
      shareholderPayouts,
      reinvestedProfit,
      endValue,
      cumulativeContributions,
      cumulativePayouts,
      shareholderRows,
    });

    beginValue = Math.max(0, endValue);
  }

  return rows;
}

function formatFileSize(bytes: number | undefined, localeTag: string) {
  if (!bytes || bytes <= 0) return "0 MB";
  return `${new Intl.NumberFormat(localeTag, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

function guessFiscalYear(fileName: string) {
  const match = fileName.match(/\b(20\d{2}|19\d{2})\b/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function todayInputDate() {
  return new Date().toISOString().slice(0, 10);
}

function oneYearAgoInputDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

function makeHolding(
  ticker = "",
  shares = 0,
  averageCost: number | null = null,
  currentPrice: number | null = null
): Holding {
  return {
    id: makeId(ticker || "position"),
    ticker,
    shares,
    averageCost,
    currentPrice,
    openedAt: oneYearAgoInputDate(),
  };
}

function listToText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "").trim()).filter(Boolean).join("\n");
  return String(value ?? "").trim();
}

function textToList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function policyToDraft(policy: NeuroInvestmentPolicy): InvestmentPolicyDraft {
  return {
    universe: policy.universe,
    strategy: policy.strategy,
    horizonYears: policy.horizonYears == null ? "" : String(policy.horizonYears),
    baseCurrency: policy.baseCurrency || "USD",
    benchmark: policy.benchmark,
    restrictions: listToText(policy.restrictions),
    liquidityNeeds: policy.liquidityNeeds,
    maxPositionPct: policy.limits.maxPositionPct == null ? "" : String(policy.limits.maxPositionPct),
    maxSectorPct: policy.limits.maxSectorPct == null ? "" : String(policy.limits.maxSectorPct),
    minCashPct: policy.limits.minCashPct == null ? "" : String(policy.limits.minCashPct),
    allowedInstruments: listToText(policy.limits.allowedInstruments),
  };
}

function draftToPolicy(draft: InvestmentPolicyDraft, status: NeuroInvestmentPolicy["status"]): NeuroInvestmentPolicy {
  return normalizeNeuroInvestmentPolicy({
    status,
    universe: draft.universe,
    strategy: draft.strategy,
    horizonYears: toNumber(draft.horizonYears),
    baseCurrency: draft.baseCurrency,
    benchmark: draft.benchmark,
    restrictions: textToList(draft.restrictions),
    liquidityNeeds: draft.liquidityNeeds,
    limits: {
      maxPositionPct: toNumber(draft.maxPositionPct),
      maxSectorPct: toNumber(draft.maxSectorPct),
      minCashPct: toNumber(draft.minCashPct),
      allowedInstruments: textToList(draft.allowedInstruments),
    },
  });
}

const INITIAL_PORTFOLIO_HOLDINGS: Holding[] = [
  {
    id: "position-aapl-initial",
    ticker: "AAPL",
    shares: 0,
    averageCost: null,
    currentPrice: null,
    openedAt: "",
  },
];

function daysSince(value?: string | null) {
  if (!value) return null;
  const started = Date.parse(value);
  if (!Number.isFinite(started)) return null;
  const days = Math.max(1, Math.round((Date.now() - started) / (24 * 60 * 60 * 1000)));
  return days;
}

function annualizedReturn(currentValue: number | null, invested: number | null, openedAt?: string | null) {
  const days = daysSince(openedAt);
  if (!days || days < 30 || currentValue == null || invested == null || currentValue <= 0 || invested <= 0) return null;
  const value = Math.pow(currentValue / invested, 365 / days) - 1;
  return Number.isFinite(value) ? value : null;
}

function Readout({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 shadow-sm shadow-slate-950/20">
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 truncate text-base font-semibold text-slate-50">{value}</p>
      {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function FinancialIntegrityPanel({
  manifest,
  isEs,
}: {
  manifest?: FinancialDataIntegrityManifest | null;
  isEs: boolean;
}) {
  const records = manifest?.records ?? [];
  const available = records.filter((record) => record.status !== "unavailable").length;
  const unavailable = records.length - available;
  return (
    <section className="border-y border-emerald-400/20 bg-emerald-400/[0.025] px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <p className="text-xs font-bold uppercase text-emerald-300">
              {isEs ? "Integridad de datos financieros" : "Financial data integrity"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {isEs
                ? "Las cifras verificadas conservan su fuente completa. Un dato sin evidencia se muestra como DATA NOT AVAILABLE y nunca como cero."
                : "Verified figures retain complete provenance. Unsupported data is shown as DATA NOT AVAILABLE and never as zero."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-4 text-xs">
          <span className="text-emerald-200">{available} {isEs ? "trazables" : "traceable"}</span>
          <span className="text-amber-200">{unavailable} {isEs ? "no disponibles" : "unavailable"}</span>
        </div>
      </div>
      {records.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-sky-200">
            {isEs ? "Ver ledger de fuentes y cálculos" : "View source and calculation ledger"}
          </summary>
          <div className="mt-3 overflow-x-auto border-t border-slate-800 pt-3">
            <table className="min-w-[1320px] w-full text-left text-[11px] leading-4">
              <thead className="text-slate-500">
                <tr>
                  <th className="px-2 py-2">{isEs ? "Dato" : "Data"}</th>
                  <th className="px-2 py-2">{isEs ? "Valor" : "Value"}</th>
                  <th className="px-2 py-2">{isEs ? "Clase" : "Class"}</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">{isEs ? "Fuente" : "Source"}</th>
                  <th className="px-2 py-2">{isEs ? "Documento" : "Document"}</th>
                  <th className="px-2 py-2">{isEs ? "Período" : "Period"}</th>
                  <th className="px-2 py-2">{isEs ? "Publicado" : "Published"}</th>
                  <th className="px-2 py-2">{isEs ? "Moneda / unidad" : "Currency / units"}</th>
                  <th className="px-2 py-2">{isEs ? "Fórmula / inputs / cálculo" : "Formula / inputs / calculation"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {records.map((record) => (
                  <tr key={record.id}>
                    <td className="max-w-[240px] px-2 py-2 font-medium text-slate-100">
                      {record.label}
                      <p className="mt-1 break-all font-mono text-[9px] font-normal text-slate-600">{record.id}</p>
                    </td>
                    <td className="px-2 py-2 font-mono text-slate-200">{record.displayValue}</td>
                    <td className="px-2 py-2">{record.classification}</td>
                    <td className={record.status === "unavailable" ? "px-2 py-2 text-amber-200" : "px-2 py-2 text-emerald-200"}>
                      {record.status === "unavailable" ? DATA_NOT_AVAILABLE : record.status.toUpperCase()}
                    </td>
                    <td className="max-w-[170px] px-2 py-2">{record.source}</td>
                    <td className="max-w-[180px] px-2 py-2">{record.document}</td>
                    <td className="px-2 py-2">{record.reportingPeriod}</td>
                    <td className="px-2 py-2">{record.publicationDate}</td>
                    <td className="px-2 py-2">{record.currency} / {record.units}</td>
                    <td className="max-w-[300px] px-2 py-2">
                      <p>{record.formula ?? (isEs ? "Dato directo" : "Direct fact")}</p>
                      {record.inputs.length ? (
                        <p className="mt-1 text-slate-500">
                          {record.inputs.map((input) => `${input.name}=${input.value ?? DATA_NOT_AVAILABLE}`).join("; ")}
                        </p>
                      ) : null}
                      {record.calculationTimestamp ? (
                        <p className="mt-1 font-mono text-[9px] text-slate-600">{record.calculationTimestamp}</p>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : (
        <p className="mt-3 text-xs font-semibold text-amber-200">{DATA_NOT_AVAILABLE}</p>
      )}
    </section>
  );
}

function committeeClassificationTone(classification: CommitteeClaimClassification) {
  if (classification === "FACT") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  if (classification === "CALCULATION") return "border-sky-400/40 bg-sky-400/10 text-sky-200";
  if (classification === "ASSUMPTION") return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  if (classification === "ESTIMATE") return "border-violet-400/40 bg-violet-400/10 text-violet-200";
  if (classification === "USER_DECISION") return "border-cyan-300/50 bg-cyan-300/10 text-cyan-100";
  return "border-fuchsia-400/35 bg-fuchsia-400/10 text-fuchsia-100";
}

function committeeDecisionTone(decision?: CommitteeDecision | null) {
  if (decision === "APPROVED") return "border-emerald-400/50 bg-emerald-400/10 text-emerald-100";
  if (decision === "REJECTED") return "border-rose-400/50 bg-rose-400/10 text-rose-100";
  if (decision === "WATCHLIST") return "border-sky-400/50 bg-sky-400/10 text-sky-100";
  if (decision === "NEEDS_MORE_RESEARCH") return "border-amber-400/50 bg-amber-400/10 text-amber-100";
  return "border-slate-700 bg-slate-950/50 text-slate-300";
}

function thesisClassificationTone(classification?: InvestmentThesisReview["classification"] | null) {
  if (classification === "THESIS_STRENGTHENED") return "border-emerald-400/50 bg-emerald-400/10 text-emerald-100";
  if (classification === "THESIS_UNCHANGED") return "border-sky-400/50 bg-sky-400/10 text-sky-100";
  if (classification === "THESIS_WEAKENED") return "border-amber-400/50 bg-amber-400/10 text-amber-100";
  if (classification === "THESIS_INVALIDATED") return "border-rose-400/50 bg-rose-400/10 text-rose-100";
  return "border-slate-600 bg-slate-950/60 text-slate-200";
}

function positionExitStatusTone(status?: PositionExitReview["status"] | null) {
  if (status === "DOCUMENTED_CHANGE_REQUIRES_HUMAN_REVIEW") {
    return "border-amber-400/50 bg-amber-400/10 text-amber-100";
  }
  if (status === "NO_DOCUMENTED_CHANGE") return "border-emerald-400/50 bg-emerald-400/10 text-emerald-100";
  return "border-slate-600 bg-slate-950/60 text-slate-200";
}

function positionExitReasonLabel(reason: PositionExitReason | null | undefined, isEs: boolean) {
  const labels: Record<PositionExitReason, [string, string]> = {
    FUNDAMENTAL_DETERIORATION: ["Fundamental deterioration", "Deterioro fundamental"],
    ORIGINAL_THESIS_INVALIDATED: ["Original thesis invalidated", "Tesis original invalidada"],
    VALUATION_MATERIALLY_CHANGED: ["Valuation materially changed", "Valoración cambió materialmente"],
    BETTER_CAPITAL_ALLOCATION_OPPORTUNITY: ["Better capital allocation opportunity", "Mejor oportunidad para asignar capital"],
    PORTFOLIO_RISK_CONSTRAINT: ["Portfolio risk constraint", "Restricción de riesgo de cartera"],
    LIQUIDITY_REQUIREMENT: ["Liquidity requirement", "Necesidad de liquidez"],
    TAX_CONSIDERATION: ["Tax consideration", "Consideración fiscal"],
    CORPORATE_EVENT: ["Corporate event", "Evento corporativo"],
    ORIGINAL_ANALYSIS_ERROR: ["Original analysis error", "Error en el análisis original"],
    OTHER_DOCUMENTED_REASON: ["Other documented reason", "Otro motivo documentado"],
  };
  if (!reason) return isEs ? "Ningún motivo verificado" : "No verified reason";
  return labels[reason][isEs ? 1 : 0];
}

function thesisReviewFromRecord(
  record: InvestmentThesisReviewRecord | null | undefined,
  originalThesis: OriginalInvestmentThesisRecord | null
): InvestmentThesisReview | null {
  if (!record) return null;
  if (record.comparison_snapshot?.review) return record.comparison_snapshot.review;
  return {
    schemaVersion: "1.0",
    originalThesisId: record.original_thesis_id,
    originalThesisContentHash: originalThesis?.content_hash ?? "",
    ticker: record.ticker,
    language: "en",
    classification: record.classification,
    summary: record.summary,
    changes: record.changes ?? [],
    classificationEvidence: record.classification_evidence ?? [],
    missingEvidence: record.missing_evidence ?? [],
    comparisonPeriod: {
      originalFrozenAt: originalThesis?.created_at ?? record.created_at,
      currentAsOf: record.created_at,
    },
    generatedAt: record.created_at,
    generatedBy: record.generated_by,
    originalThesisPreserved: true,
    automaticTradingDecision: false,
  };
}

function positionExitReviewFromRecord(
  record: PositionExitReviewRecord | null | undefined,
  originalThesis: OriginalInvestmentThesisRecord | null
): PositionExitReview | null {
  if (!record) return null;
  if (record.comparison_snapshot?.review) return record.comparison_snapshot.review;
  return {
    schemaVersion: "1.0",
    originalThesisId: record.original_thesis_id,
    originalThesisContentHash: originalThesis?.content_hash ?? "",
    ticker: record.ticker,
    language: "en",
    status: record.review_status,
    primaryReason: record.primary_reason,
    secondaryReasons: record.secondary_reasons ?? [],
    summary: record.summary,
    whatChanged: record.what_changed ?? [],
    comparisons: record.comparisons ?? [],
    classificationEvidence: record.classification_evidence ?? [],
    missingEvidence: record.missing_evidence ?? [],
    priceMovementAssessment: record.price_movement_assessment,
    comparisonPeriod: {
      originalFrozenAt: originalThesis?.created_at ?? record.created_at,
      currentAsOf: record.created_at,
    },
    generatedAt: record.created_at,
    generatedBy: record.generated_by,
    originalThesisPreserved: true,
    automaticTradingDecision: false,
    humanDecisionRequired: true,
  };
}

function StatusItem({
  done,
  title,
  body,
}: {
  done: boolean;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-slate-800/80 bg-slate-950/45 p-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
      </div>
    </div>
  );
}

function ScoreBar({ label, score, hint }: { label: string; score: number; hint?: string }) {
  const safeScore = clampNumber(Math.round(score), 0, 100);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-xs font-semibold text-slate-200">{label}</p>
        <p className={`text-xs font-bold ${scoreTone(safeScore)}`}>{safeScore}</p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full ${
            safeScore >= 75 ? "bg-emerald-400" : safeScore >= 50 ? "bg-amber-300" : "bg-rose-400"
          }`}
          style={{ width: `${safeScore}%` }}
        />
      </div>
      {hint ? <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-slate-500">{hint}</p> : null}
    </div>
  );
}

function BusinessEvidenceList({ rows }: { rows: BusinessQualityEvidence[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={`${row.statement}-${index}`} className="border-l border-slate-700 pl-3">
          <p className={row.status === "identified" ? "text-xs leading-5 text-slate-300" : "text-xs leading-5 text-slate-500"}>
            {row.statement}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] uppercase text-slate-600">
            <span>{row.sourceLabel}</span>
            {row.sourceDate ? <span>{row.sourceDate}</span> : null}
            {row.sourceUrl ? (
              <a
                href={row.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
              >
                Source <ExternalLink className="h-2.5 w-2.5" />
              </a>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NeuroAnalysisPage() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale) as Lang;
  const isEs = lang === "es";
  const localeTag = LOCALE_TAG[lang];
  const L = (en: string, es: string) => (isEs ? es : en);
  const decisionStateLabel = (state: NeuroDecisionState | string | null | undefined) => {
    switch (state) {
      case "propose":
        return L("PROPOSE", "PROPONER");
      case "observe":
        return L("OBSERVE", "OBSERVAR");
      case "reject":
        return L("REJECT", "RECHAZAR");
      case "insufficient_information":
        return L("INSUFFICIENT INFORMATION", "INFORMACION INSUFICIENTE");
      default:
        return L("INVESTIGATE", "INVESTIGAR");
    }
  };
  const decisionStateTone = (state: NeuroDecisionState | string | null | undefined) => {
    if (state === "propose") return "border-emerald-400/45 bg-emerald-400/10 text-emerald-100";
    if (state === "reject") return "border-rose-400/45 bg-rose-400/10 text-rose-100";
    if (state === "insufficient_information") return "border-amber-400/45 bg-amber-400/10 text-amber-100";
    if (state === "observe") return "border-sky-400/45 bg-sky-400/10 text-sky-100";
    return "border-violet-400/45 bg-violet-400/10 text-violet-100";
  };
  const systemDispositionLabel = (code?: string | null) => {
    switch (code) {
      case "KEEP_CASH":
        return L("KEEP CASH", "MANTENER EFECTIVO");
      case "NEED_MORE_INFORMATION":
        return L("NEED MORE INFORMATION", "NECESITA MAS INFORMACION");
      case "THESIS_UNCERTAIN":
        return L("THESIS UNCERTAIN", "TESIS INCIERTA");
      case "DO_NOTHING":
        return L("DO NOTHING", "NO HACER NADA");
      default:
        return "-";
    }
  };
  const systemDispositionTone = (code?: string | null) => {
    if (code === "KEEP_CASH") return "border-cyan-400/45 bg-cyan-400/10 text-cyan-100";
    if (code === "NEED_MORE_INFORMATION") return "border-amber-400/45 bg-amber-400/10 text-amber-100";
    if (code === "THESIS_UNCERTAIN") return "border-violet-400/45 bg-violet-400/10 text-violet-100";
    return "border-slate-600 bg-slate-950/50 text-slate-200";
  };
  const committeeSectionLabels: Record<(typeof COMMITTEE_SECTION_KEYS)[number], string> = {
    executiveSummary: L("Executive summary", "Resumen ejecutivo"),
    investmentThesis: L("Investment thesis", "Tesis de inversión"),
    currentMarketPrice: L("Current market price", "Precio actual de mercado"),
    intrinsicValueRange: L("Estimated intrinsic value range", "Rango de valor intrínseco estimado"),
    expectedReturnAssumptions: L("Expected return assumptions", "Supuestos de retorno esperado"),
    downsideScenario: L("Downside scenario", "Escenario bajista"),
    keyFinancialMetrics: L("Key financial metrics", "Métricas financieras clave"),
    balanceSheetAnalysis: L("Balance sheet analysis", "Análisis del balance"),
    competitivePosition: L("Competitive position", "Posición competitiva"),
    catalysts: L("Catalysts", "Catalizadores"),
    principalRisks: L("Principal risks", "Riesgos principales"),
    contradictingEvidence: L("Evidence contradicting the thesis", "Evidencia que contradice la tesis"),
    portfolioImpact: L("Portfolio impact", "Impacto en la cartera"),
    positionSizeProposal: L("Position-size proposal", "Propuesta de tamaño de posición"),
    invalidationConditions: L("Thesis invalidation conditions", "Condiciones que invalidan la tesis"),
  };
  const businessQualityLabels: Record<BusinessQualityDimensionKey, string> = {
    businessModel: L("Business model", "Modelo de negocio"),
    revenueSources: L("Revenue sources", "Fuentes de ingresos"),
    revenuePredictability: L("Revenue predictability", "Predictibilidad de ingresos"),
    pricingPower: L("Pricing power", "Poder de precios"),
    customerConcentration: L("Customer concentration", "Concentración de clientes"),
    supplierConcentration: L("Supplier concentration", "Concentración de suplidores"),
    competitiveAdvantages: L("Competitive advantages", "Ventajas competitivas"),
    barriersToEntry: L("Barriers to entry", "Barreras de entrada"),
    marketStructure: L("Market structure", "Estructura de mercado"),
    capitalIntensity: L("Capital intensity", "Intensidad de capital"),
    returnOnInvestedCapital: L("Return on invested capital", "Retorno sobre capital invertido"),
    freeCashFlowGeneration: L("Free cash flow generation", "Generación de flujo de caja libre"),
    debtRequirements: L("Debt requirements", "Necesidad de deuda"),
    acquisitionDependency: L("Acquisition dependency", "Dependencia de adquisiciones"),
    shareDilution: L("Share dilution", "Dilución de acciones"),
    managementCapitalAllocation: L("Management capital allocation", "Asignación de capital por la gerencia"),
    cyclicality: L("Cyclicality", "Ciclicidad"),
    regulatoryExposure: L("Regulatory exposure", "Exposición regulatoria"),
    technologyDisruptionRisk: L("Technology disruption risk", "Riesgo de disrupción tecnológica"),
    longTermReinvestmentOpportunities: L("Long-term reinvestment opportunities", "Oportunidades de reinversión a largo plazo"),
  };
  const managementCategoryLabels: Record<ManagementActionCategoryKey, string> = {
    historicalAcquisitions: L("Historical acquisitions", "Adquisiciones históricas"),
    divestitures: L("Divestitures", "Desinversiones"),
    shareRepurchases: L("Share repurchases", "Recompras de acciones"),
    shareIssuance: L("Share issuance", "Emisión de acciones"),
    dividends: L("Dividends", "Dividendos"),
    debtIssuanceRepayment: L("Debt issuance and repayment", "Emisión y repago de deuda"),
    capitalExpenditures: L("Capital expenditures", "Gastos de capital"),
    researchDevelopment: L("R&D investment", "Inversión en R&D"),
    executiveCompensation: L("Executive compensation", "Compensación ejecutiva"),
    insiderOwnership: L("Insider ownership", "Participación de insiders"),
    relatedPartyTransactions: L("Related-party transactions", "Transacciones con partes relacionadas"),
    accountingPolicyChanges: L("Changes in accounting policies", "Cambios en políticas contables"),
    guidanceVsResults: L("Guidance versus subsequent results", "Guidance versus resultados posteriores"),
  };
  const earningsQualityLabels: Record<EarningsQualityAreaKey, string> = {
    netIncomeVsOperatingCashFlow: L("Net income vs operating cash flow", "Ingreso neto vs flujo operativo"),
    freeCashFlowVsReportedEarnings: L("Free cash flow vs reported earnings", "Flujo libre vs ganancias reportadas"),
    accountsReceivableVsRevenue: L("Receivables vs revenue", "Cuentas por cobrar vs ingresos"),
    inventoryVsRevenue: L("Inventory vs revenue", "Inventario vs ingresos"),
    capitalExpenditures: L("Capital expenditures", "Gastos de capital"),
    capitalizedExpenses: L("Capitalized expenses", "Gastos capitalizados"),
    goodwillAndIntangibleAssets: L("Goodwill and intangible assets", "Goodwill y activos intangibles"),
    acquisitionAccounting: L("Acquisition accounting", "Contabilidad de adquisiciones"),
    stockBasedCompensation: L("Stock-based compensation", "Compensación basada en acciones"),
    shareDilution: L("Share dilution", "Dilución de acciones"),
    oneTimeAdjustments: L("One-time adjustments", "Ajustes no recurrentes"),
    nonGaapAdjustments: L("Non-GAAP adjustments", "Ajustes non-GAAP"),
    restructuringCharges: L("Restructuring charges", "Cargos de reestructuración"),
    deferredRevenue: L("Deferred revenue", "Ingresos diferidos"),
    deferredTaxes: L("Deferred taxes", "Impuestos diferidos"),
    changesInWorkingCapital: L("Changes in working capital", "Cambios en capital de trabajo"),
    relatedPartyTransactions: L("Related-party transactions", "Transacciones con partes relacionadas"),
    auditorChanges: L("Auditor changes", "Cambios de auditor"),
    restatements: L("Restatements", "Reexpresiones financieras"),
    accountingEstimateChanges: L("Changes in accounting estimates", "Cambios en estimados contables"),
  };
  const bearCaseLabels: Record<BearCaseAreaKey, string> = {
    competitiveThreats: L("Competitive threats", "Amenazas competitivas"),
    marginCompression: L("Margin compression", "Compresión de márgenes"),
    customerLosses: L("Customer losses", "Pérdida de clientes"),
    debtRefinancing: L("Debt refinancing", "Refinanciamiento de deuda"),
    technologicalDisruption: L("Technological disruption", "Disrupción tecnológica"),
    regulation: L("Regulation", "Regulación"),
    managementExecution: L("Management execution", "Ejecución de la gerencia"),
    capitalRequirements: L("Capital requirements", "Necesidades de capital"),
    dilution: L("Dilution", "Dilución"),
    commodityExposure: L("Commodity exposure", "Exposición a commodities"),
    currencyExposure: L("Currency exposure", "Exposición cambiaria"),
    cyclicality: L("Cyclicality", "Ciclicidad"),
    accountingConcerns: L("Accounting concerns", "Alertas contables"),
    valuationAssumptions: L("Valuation assumptions", "Supuestos de valoración"),
    industryDeterioration: L("Industry deterioration", "Deterioro de la industria"),
    alternativeExplanations: L("Alternative explanations", "Explicaciones alternativas"),
  };

  const [focusTicker, setFocusTicker] = useState("AAPL");
  const [focusTickerDraft, setFocusTickerDraft] = useState("AAPL");
  const [researchGoal, setResearchGoal] = useState(defaultResearchGoal(isEs));
  const [filings, setFilings] = useState<FilingUpload[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(false);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [marketDataByTicker, setMarketDataByTicker] = useState<Record<string, MarketData>>({});
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [marketRefreshNonce, setMarketRefreshNonce] = useState(0);
  const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null);
  const [agentReport, setAgentReport] = useState("");
  const [engineSnapshot, setEngineSnapshot] = useState<any | null>(null);
  const [reportFinancialDataIntegrity, setReportFinancialDataIntegrity] = useState<FinancialDataIntegrityManifest | null>(null);
  const [businessQualityAnalysis, setBusinessQualityAnalysis] = useState<BusinessQualityAnalysis | null>(null);
  const [managementCapitalAllocationAnalysis, setManagementCapitalAllocationAnalysis] = useState<ManagementCapitalAllocationAnalysis | null>(null);
  const [earningsQualityAccountingRiskAnalysis, setEarningsQualityAccountingRiskAnalysis] = useState<EarningsQualityAccountingRiskAnalysis | null>(null);
  const [independentBearCaseAnalysis, setIndependentBearCaseAnalysis] = useState<IndependentBearCaseAnalysis | null>(null);
  const [portfolioExposureMap, setPortfolioExposureMap] = useState<PortfolioExposureMap | null>(null);
  const [macroContext, setMacroContext] = useState<MacroContextReport | null>(null);
  const [capitalAllocationDashboard, setCapitalAllocationDashboard] = useState<CapitalAllocationDashboard | null>(null);
  const [performanceAttribution, setPerformanceAttribution] = useState<PerformanceAttributionReport | null>(null);
  const [performanceAttributionLoading, setPerformanceAttributionLoading] = useState(false);
  const [performanceAttributionError, setPerformanceAttributionError] = useState("");
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [caseTitle, setCaseTitle] = useState("");
  const [cases, setCases] = useState<NeuroCaseSummary[]>([]);
  const [reports, setReports] = useState<NeuroReportSummary[]>([]);
  const [caseSaving, setCaseSaving] = useState(false);
  const [caseStatus, setCaseStatus] = useState("");
  const [agentError, setAgentError] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentElapsedSeconds, setAgentElapsedSeconds] = useState(0);
  const [autoRunLoading, setAutoRunLoading] = useState(false);
  const [autoRunStatus, setAutoRunStatus] = useState("");
  const [documentLookup, setDocumentLookup] = useState<CompanyDocumentLookup[]>([]);
  const [documentLookupLoading, setDocumentLookupLoading] = useState(false);
  const [documentLookupError, setDocumentLookupError] = useState("");
  const [documentImporting, setDocumentImporting] = useState<Record<string, boolean>>({});
  const [documentBatchImporting, setDocumentBatchImporting] = useState(false);
  const [documentImportError, setDocumentImportError] = useState("");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("daily_office");
  const [agentQuestion, setAgentQuestion] = useState("");
  const [agentQaLoading, setAgentQaLoading] = useState(false);
  const [agentQaError, setAgentQaError] = useState("");
  const [agentConversation, setAgentConversation] = useState<AgentChatItem[]>([]);
  const [thesisNotes, setThesisNotes] = useState<ThesisNote[]>([]);
  const [thesisContextNote, setThesisContextNote] = useState("");
  const [thesisSourceType, setThesisSourceType] = useState("news");
  const [thesisImpact, setThesisImpact] = useState("uncertain");
  const [thesisSourceLabel, setThesisSourceLabel] = useState("");
  const [thesisSaving, setThesisSaving] = useState(false);
  const [thesisStatus, setThesisStatus] = useState("");
  const [thesisError, setThesisError] = useState("");
  const [investmentPolicy, setInvestmentPolicy] = useState<NeuroInvestmentPolicy | null>(null);
  const [policyDraft, setPolicyDraft] = useState<InvestmentPolicyDraft>(() => policyToDraft(starterNeuroInvestmentPolicy()));
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [policyStatus, setPolicyStatus] = useState("");
  const [policyError, setPolicyError] = useState("");
  const [serverDecisionSupport, setServerDecisionSupport] = useState<NeuroDecisionSupport | null>(null);
  const [committeePackets, setCommitteePackets] = useState<InvestmentCommitteePacketRecord[]>([]);
  const [committeeDecisions, setCommitteeDecisions] = useState<InvestmentCommitteeDecisionRecord[]>([]);
  const [selectedCommitteePacketId, setSelectedCommitteePacketId] = useState<string | null>(null);
  const [committeeLoading, setCommitteeLoading] = useState(false);
  const [committeeGenerating, setCommitteeGenerating] = useState(false);
  const [committeeSavingDecision, setCommitteeSavingDecision] = useState(false);
  const [committeeStatus, setCommitteeStatus] = useState("");
  const [committeeError, setCommitteeError] = useState("");
  const [committeeDecision, setCommitteeDecision] = useState<CommitteeDecision>("NEEDS_MORE_RESEARCH");
  const [committeeRationale, setCommitteeRationale] = useState("");
  const [committeeConditions, setCommitteeConditions] = useState("");
  const [committeeHumanConfirmed, setCommitteeHumanConfirmed] = useState(false);
  const [originalInvestmentThesis, setOriginalInvestmentThesis] = useState<OriginalInvestmentThesisRecord | null>(null);
  const [investmentThesisReview, setInvestmentThesisReview] = useState<InvestmentThesisReview | null>(null);
  const [investmentThesisReviewHistory, setInvestmentThesisReviewHistory] = useState<InvestmentThesisReviewRecord[]>([]);
  const [positionExitReview, setPositionExitReview] = useState<PositionExitReview | null>(null);
  const [positionExitReviewHistory, setPositionExitReviewHistory] = useState<PositionExitReviewRecord[]>([]);
  const [thesisPurchaseDate, setThesisPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [thesisPurchasePrice, setThesisPurchasePrice] = useState("");
  const [thesisPortfolioWeightPct, setThesisPortfolioWeightPct] = useState("");
  const [thesisFreezeConfirmed, setThesisFreezeConfirmed] = useState(false);
  const [thesisFreezeLoading, setThesisFreezeLoading] = useState(false);
  const [thesisFreezeStatus, setThesisFreezeStatus] = useState("");
  const [thesisFreezeError, setThesisFreezeError] = useState("");
  const [screenerSector, setScreenerSector] = useState("technology");
  const [screenerStrategy, setScreenerStrategy] = useState("value_candidate");
  const [screenerCustomTickers, setScreenerCustomTickers] = useState("");
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerError, setScreenerError] = useState("");
  const [screenerResult, setScreenerResult] = useState<SectorScreenerResult | null>(null);
  const [fundInitialCapital, setFundInitialCapital] = useState(100000);
  const [fundMonthlyGoal, setFundMonthlyGoal] = useState(5000);
  const [fundAnnualReturnPct, setFundAnnualReturnPct] = useState(10);
  const [fundSelectedYear, setFundSelectedYear] = useState(10);
  const [portfolioHoldings, setPortfolioHoldings] = useState<Holding[]>(INITIAL_PORTFOLIO_HOLDINGS);
  const [availableCapital, setAvailableCapital] = useState<number | null>(null);
  const [fundShareholders, setFundShareholders] = useState<FundShareholder[]>([
    {
      id: "shareholder-founder",
      name: "Founder",
      ownershipPct: 60,
      payoutMode: "reinvest",
      annualWithdrawalPct: 0,
    },
    {
      id: "shareholder-investor-1",
      name: "Investor 1",
      ownershipPct: 40,
      payoutMode: "withdraw",
      annualWithdrawalPct: 100,
    },
  ]);

  useEffect(() => {
    if (isLegacyResearchGoal(researchGoal)) {
      setResearchGoal(defaultResearchGoal(isEs));
    }
  }, [isEs, researchGoal]);

  useEffect(() => {
    if (!agentLoading) return;
    setAgentElapsedSeconds(0);
    const interval = window.setInterval(() => setAgentElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(interval);
  }, [agentLoading]);

  useEffect(() => {
    setDocumentLookup([]);
    setDocumentLookupError("");
    setDocumentImportError("");
    setAutoRunStatus("");
    setServerDecisionSupport(null);
    setBusinessQualityAnalysis(null);
    setManagementCapitalAllocationAnalysis(null);
    setEarningsQualityAccountingRiskAnalysis(null);
    setIndependentBearCaseAnalysis(null);
    setPortfolioExposureMap(null);
    setMacroContext(null);
    setCapitalAllocationDashboard(null);
    setPerformanceAttribution(null);
    setPerformanceAttributionError("");
  }, [focusTicker]);

  const authToken = async () => {
    const { data } = await supabaseBrowser.auth.getSession();
    return data?.session?.access_token ?? "";
  };

  async function authedFetch(path: string, init?: RequestInit) {
    const token = await authToken();
    if (!token) throw new Error(L("Inicia sesión para continuar.", "Inicia sesión para continuar."));
    return fetch(path, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async function waitForNeuroJob(jobId: string, timeoutMs = 240_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const res = await authedFetch("/api/neuro-analysis/jobs");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not check document processing.");
      const job = (Array.isArray(json?.jobs) ? json.jobs : []).find(
        (item: any) => String(item?.id ?? "") === jobId
      );
      if (job?.status === "succeeded") return job.result ?? {};
      if (job?.status === "failed" || job?.status === "cancelled") {
        throw new Error(String(job?.error || "Document processing failed."));
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
    }
    throw new Error(
      L(
        "Document processing is still running. It will remain queued safely; refresh this company shortly.",
        "El documento sigue procesándose. Permanecerá en cola de forma segura; refresca esta compañía en breve."
      )
    );
  }

  async function loadInvestmentPolicy() {
    try {
      setPolicyLoading(true);
      setPolicyError("");
      const res = await authedFetch("/api/neuro-analysis/policy");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not load investment policy.");
      const policy = normalizeNeuroInvestmentPolicy(json?.policy ?? starterNeuroInvestmentPolicy());
      setInvestmentPolicy(policy);
      setPolicyDraft(policyToDraft(policy));
    } catch (error: any) {
      setPolicyError(error?.message || "Could not load investment policy.");
    } finally {
      setPolicyLoading(false);
    }
  }

  async function saveInvestmentPolicy(approve: boolean) {
    try {
      setPolicySaving(true);
      setPolicyStatus("");
      setPolicyError("");
      const policy = draftToPolicy(policyDraft, approve ? "active" : "draft");
      const res = await authedFetch("/api/neuro-analysis/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy, approve }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not save investment policy.");
      const saved = normalizeNeuroInvestmentPolicy(json?.policy ?? policy);
      setInvestmentPolicy(saved);
      setPolicyDraft(policyToDraft(saved));
      setPolicyStatus(approve ? L("Policy approved.", "Política aprobada.") : L("Policy draft saved.", "Draft de política guardado."));
    } catch (error: any) {
      setPolicyError(error?.message || "Could not save investment policy.");
    } finally {
      setPolicySaving(false);
    }
  }

  async function loadInvestmentCommittee(caseId: string | null = activeCaseId) {
    if (!caseId) {
      setCommitteePackets([]);
      setCommitteeDecisions([]);
      setSelectedCommitteePacketId(null);
      setOriginalInvestmentThesis(null);
      setInvestmentThesisReview(null);
      setInvestmentThesisReviewHistory([]);
      setPositionExitReview(null);
      setPositionExitReviewHistory([]);
      return;
    }
    try {
      setCommitteeLoading(true);
      setCommitteeError("");
      const [res, thesisRes] = await Promise.all([
        authedFetch(`/api/neuro-analysis/committee-packets?caseId=${encodeURIComponent(caseId)}`),
        authedFetch(`/api/neuro-analysis/investment-theses?caseId=${encodeURIComponent(caseId)}`),
      ]);
      const [json, thesisJson] = await Promise.all([
        res.json().catch(() => ({})),
        thesisRes.json().catch(() => ({})),
      ]);
      if (!res.ok) throw new Error(json?.error || "Could not load Investment Committee packets.");
      if (!thesisRes.ok) throw new Error(thesisJson?.error || "Could not load the permanent investment thesis.");
      const packets = Array.isArray(json?.packets) ? json.packets : [];
      const original = (thesisJson?.originalThesis ?? null) as OriginalInvestmentThesisRecord | null;
      const reviews = (Array.isArray(thesisJson?.reviews) ? thesisJson.reviews : []) as InvestmentThesisReviewRecord[];
      const exitReviews = (
        Array.isArray(thesisJson?.positionExitReviews) ? thesisJson.positionExitReviews : []
      ) as PositionExitReviewRecord[];
      setCommitteePackets(packets);
      setCommitteeDecisions(Array.isArray(json?.decisions) ? json.decisions : []);
      setOriginalInvestmentThesis(original);
      setInvestmentThesisReviewHistory(reviews);
      setInvestmentThesisReview(thesisReviewFromRecord(reviews[0], original));
      setPositionExitReviewHistory(exitReviews);
      setPositionExitReview(positionExitReviewFromRecord(exitReviews[0], original));
      setSelectedCommitteePacketId((current) =>
        current && packets.some((packet: InvestmentCommitteePacketRecord) => packet.id === current)
          ? current
          : packets[0]?.id ?? null
      );
    } catch (error: any) {
      setCommitteeError(error?.message || "Could not load Investment Committee packets.");
    } finally {
      setCommitteeLoading(false);
    }
  }

  async function createInvestmentCommitteePacket() {
    try {
      setCommitteeGenerating(true);
      setCommitteeStatus("");
      setCommitteeError("");
      if (!activeCaseId || !activeReportId) {
        throw new Error(
          L(
            "Run and save a research report before creating a committee packet.",
            "Corre y guarda un reporte antes de crear el packet del comité."
          )
        );
      }
      const res = await authedFetch("/api/neuro-analysis/committee-packets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: activeCaseId, reportId: activeReportId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not create the Investment Committee packet.");
      const packets = Array.isArray(json?.packets) ? json.packets : [];
      setCommitteePackets(packets);
      setCommitteeDecisions(Array.isArray(json?.decisions) ? json.decisions : []);
      setSelectedCommitteePacketId(String(json?.packet?.id ?? packets[0]?.id ?? "") || null);
      setCommitteeStatus(
        L(
          `Committee packet v${Number(json?.packet?.version ?? packets[0]?.version ?? 1)} is ready for human review.`,
          `El packet v${Number(json?.packet?.version ?? packets[0]?.version ?? 1)} está listo para revisión humana.`
        )
      );
      setActiveWorkspaceTab("committee");
    } catch (error: any) {
      setCommitteeError(error?.message || "Could not create the Investment Committee packet.");
    } finally {
      setCommitteeGenerating(false);
    }
  }

  async function recordInvestmentCommitteeDecision() {
    try {
      setCommitteeSavingDecision(true);
      setCommitteeStatus("");
      setCommitteeError("");
      if (!selectedCommitteePacketId) {
        throw new Error(L("Select a committee packet first.", "Selecciona un packet del comité primero."));
      }
      if (!committeeHumanConfirmed) {
        throw new Error(
          L(
            "Confirm that this is your human committee decision.",
            "Confirma que esta es tu decisión humana del comité."
          )
        );
      }
      const res = await authedFetch("/api/neuro-analysis/committee-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packetId: selectedCommitteePacketId,
          decision: committeeDecision,
          rationale: committeeRationale,
          conditions: committeeConditions,
          humanConfirmation: "HUMAN_COMMITTEE_DECISION",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not record the Investment Committee decision.");
      setCommitteeDecisions(Array.isArray(json?.decisions) ? json.decisions : []);
      setCommitteeRationale("");
      setCommitteeConditions("");
      setCommitteeHumanConfirmed(false);
      setCommitteeStatus(
        committeeDecision === "APPROVED"
          ? L(
              "Human approval recorded. This packet version is now eligible for a manually created portfolio position.",
              "Aprobación humana registrada. Esta versión ahora es elegible para una posición creada manualmente."
            )
          : L("Human committee decision recorded.", "Decisión humana del comité registrada.")
      );
      if (committeeDecision === "APPROVED") {
        const price = optionalNumber(marketData?.market?.regularMarketPrice ?? marketData?.market?.previousClose);
        if (price != null && price > 0) setThesisPurchasePrice(price.toFixed(2));
        const activePosition = portfolioPositions.find((position) => position.ticker === focusTicker);
        const activeWeight = optionalNumber(activePosition?.weight);
        if (activeWeight != null && activeWeight > 0) setThesisPortfolioWeightPct((activeWeight * 100).toFixed(2));
      }
    } catch (error: any) {
      setCommitteeError(error?.message || "Could not record the Investment Committee decision.");
    } finally {
      setCommitteeSavingDecision(false);
    }
  }

  async function freezeOriginalInvestmentThesis() {
    try {
      setThesisFreezeLoading(true);
      setThesisFreezeStatus("");
      setThesisFreezeError("");
      const approvedDecision = committeeDecisions.find(
        (decision) => decision.packet_id === selectedCommitteePacketId && decision.decision === "APPROVED"
      );
      if (!approvedDecision) {
        throw new Error(L("Select an APPROVED packet first.", "Selecciona primero un packet APROBADO."));
      }
      if (!thesisFreezeConfirmed) {
        throw new Error(
          L(
            "Confirm that these are the real purchase details and that the original thesis will be permanent.",
            "Confirma que estos son los datos reales de compra y que la tesis original será permanente."
          )
        );
      }
      const res = await authedFetch("/api/neuro-analysis/investment-theses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionId: approvedDecision.id,
          purchaseDate: thesisPurchaseDate,
          purchasePrice: Number(thesisPurchasePrice),
          portfolioWeightPct: Number(thesisPortfolioWeightPct),
          confirmation: "FREEZE_ORIGINAL_THESIS",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not freeze the original investment thesis.");
      setOriginalInvestmentThesis(json?.originalThesis ?? null);
      setInvestmentThesisReview(null);
      setInvestmentThesisReviewHistory([]);
      setPositionExitReview(null);
      setPositionExitReviewHistory([]);
      setThesisFreezeConfirmed(false);
      setThesisFreezeStatus(
        L(
          "Purchase recorded. The original investment thesis is now permanent.",
          "Compra registrada. La tesis original de inversión ahora es permanente."
        )
      );
    } catch (error: any) {
      setThesisFreezeError(error?.message || "Could not freeze the original investment thesis.");
    } finally {
      setThesisFreezeLoading(false);
    }
  }

  async function loadThesisContext(caseId: string | null = activeCaseId) {
    if (!caseId) {
      setThesisNotes([]);
      return;
    }
    const res = await authedFetch(`/api/neuro-analysis/thesis?caseId=${encodeURIComponent(caseId)}`).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok && Array.isArray(json?.notes)) {
      setThesisNotes(json.notes);
    }
  }

  useEffect(() => {
    if (!activeCaseId) {
      setThesisNotes([]);
      setCommitteePackets([]);
      setCommitteeDecisions([]);
      setSelectedCommitteePacketId(null);
      setOriginalInvestmentThesis(null);
      setInvestmentThesisReview(null);
      setInvestmentThesisReviewHistory([]);
      setPositionExitReview(null);
      setPositionExitReviewHistory([]);
      return;
    }
    void loadThesisContext(activeCaseId);
    void loadInvestmentCommittee(activeCaseId);
  }, [activeCaseId]);

  const fundProjection = useMemo(
    () =>
      buildFundProjection({
        initialCapital: fundInitialCapital,
        monthlyGoal: fundMonthlyGoal,
        annualReturnPct: fundAnnualReturnPct,
        shareholders: fundShareholders,
        years: 30,
      }),
    [fundAnnualReturnPct, fundInitialCapital, fundMonthlyGoal, fundShareholders]
  );
  const fundMilestones = [10, 15, 20, 25, 30]
    .map((year) => fundProjection.find((row) => row.year === year))
    .filter(Boolean) as FundProjectionYear[];
  const selectedFundProjection =
    fundProjection.find((row) => row.year === fundSelectedYear) ??
    fundProjection[fundProjection.length - 1] ??
    null;
  const shareholderOwnershipTotal = fundShareholders.reduce(
    (sum, shareholder) => sum + clampNumber(toNumber(shareholder.ownershipPct), 0, 100),
    0
  );
  const portfolioPositions = useMemo(() => {
    const rows = portfolioHoldings
      .map((holding) => {
        const ticker = holding.ticker.trim().toUpperCase();
        if (!ticker) return null;
        const marketItem = marketDataByTicker[ticker];
        const currentPrice =
          optionalNumber(marketItem?.market?.regularMarketPrice) ??
          optionalNumber(marketItem?.market?.previousClose) ??
          optionalNumber(holding.currentPrice);
        const shares = Math.max(0, toNumber(holding.shares));
        const parsedAverageCost = optionalNumber(holding.averageCost);
        const averageCost = parsedAverageCost == null ? null : Math.max(0, parsedAverageCost);
        const invested = averageCost == null ? null : shares * averageCost;
        const value = currentPrice == null ? null : shares * currentPrice;
        const pnl = value == null || invested == null ? null : value - invested;
        const annualized = annualizedReturn(value, invested, holding.openedAt);
        return {
          ...holding,
          ticker,
          shares,
          averageCost,
          currentPrice,
          invested,
          value,
          pnl,
          pnlPct: invested != null && invested > 0 && pnl != null ? pnl / invested : null,
          annualizedReturn: annualized,
          dividendYield: marketItem?.fund?.yield ?? marketItem?.market?.dividendYield ?? null,
          companyName: marketItem?.company?.shortName || marketItem?.company?.name || ticker,
          sector: marketItem?.company?.sector || marketItem?.fund?.categoryName || marketItem?.company?.quoteType || null,
        };
      })
      .filter(Boolean) as Array<
      Holding & {
        invested: number | null;
        value: number | null;
        pnl: number | null;
        pnlPct: number | null;
        annualizedReturn: number | null;
        dividendYield: number | null;
        companyName: string;
        sector: string | null;
      }
    >;
    const totalValue = rows.some((row) => row.value == null)
      ? null
      : rows.reduce((sum, row) => sum + Number(row.value), 0);
    return rows.map((row) => ({
      ...row,
      weight: totalValue != null && totalValue > 0 && row.value != null ? row.value / totalValue : null,
    }));
  }, [marketDataByTicker, portfolioHoldings]);
  const portfolioSummary = useMemo(() => {
    const activeRows = portfolioPositions.filter((row) => row.shares > 0 && row.ticker);
    const totalValue = activeRows.some((row) => row.value == null)
      ? null
      : activeRows.reduce((sum, row) => sum + Number(row.value), 0);
    const totalInvested = activeRows.some((row) => row.invested == null)
      ? null
      : activeRows.reduce((sum, row) => sum + Number(row.invested), 0);
    const totalPnl = totalValue == null || totalInvested == null ? null : totalValue - totalInvested;
    const annualizedWeightBase = activeRows.reduce(
      (sum, row) => sum + (row.annualizedReturn != null && row.invested != null ? row.invested : 0),
      0
    );
    const annualized =
      annualizedWeightBase > 0
        ? activeRows.reduce(
            (sum, row) => sum + (row.annualizedReturn != null && row.invested != null ? row.annualizedReturn * row.invested : 0),
            0
          ) / annualizedWeightBase
        : null;
    const incomeInputsComplete = activeRows.every(
      (row) => row.value != null && optionalNumber(row.dividendYield) != null
    );
    const incomeYield =
      incomeInputsComplete && totalValue != null && totalValue > 0
        ? activeRows.reduce(
            (sum, row) => sum + Number(row.value) * Number(optionalNumber(row.dividendYield)),
            0
          ) / totalValue
        : null;
    const valuedRows = activeRows.filter((row) => row.value != null);
    return {
      count: activeRows.length,
      totalValue,
      totalInvested,
      totalPnl,
      totalPnlPct: totalInvested != null && totalInvested > 0 && totalPnl != null ? totalPnl / totalInvested : null,
      annualizedReturn: annualized,
      incomeYield,
      largestPosition: valuedRows
        .slice()
        .sort((a, b) => Number(b.value) - Number(a.value))[0] ?? null,
    };
  }, [portfolioPositions]);
  const researchHoldings = useMemo(() => {
    const ticker = focusTicker.trim().toUpperCase();
    const price =
      optionalNumber(marketData?.market?.regularMarketPrice) ??
      optionalNumber(marketData?.market?.previousClose) ??
      optionalNumber(marketDataByTicker[ticker]?.market?.regularMarketPrice) ??
      optionalNumber(marketDataByTicker[ticker]?.market?.previousClose);
    const focusResearchRow = ticker
      ? {
          id: `profile-${ticker}`,
          ticker,
          shares: 1,
          averageCost: null,
          currentPrice: price,
          openedAt: null,
          invested: null,
          value: price,
          pnl: null,
          pnlPct: null,
          annualizedReturn: null,
          weight: null,
          researchOnly: true,
        }
      : null;
    const activePortfolioRows = portfolioPositions.filter((row) => row.ticker && row.shares > 0);
    if (activePortfolioRows.length) {
      const rows = activePortfolioRows.map((row) => ({
        id: row.id,
        ticker: row.ticker,
        shares: row.shares,
        averageCost: row.averageCost,
        currentPrice: row.currentPrice,
        openedAt: row.openedAt,
        invested: row.invested,
        value: row.value,
        pnl: row.pnl,
        pnlPct: row.pnlPct,
        annualizedReturn: row.annualizedReturn,
        weight: row.weight,
      }));
      if (focusResearchRow && !rows.some((row) => row.ticker.toUpperCase() === ticker)) {
        return [focusResearchRow, ...rows];
      }
      return rows;
    }
    return focusResearchRow ? [focusResearchRow] : [];
  }, [
    focusTicker,
    marketData?.market?.previousClose,
    marketData?.market?.regularMarketPrice,
    marketDataByTicker,
    portfolioPositions,
  ]);

  const indexedDocuments = filings.filter((filing) => Boolean(filing.vectorStoreId));
  const pendingDocuments = filings.filter((filing) => !filing.vectorStoreId);
  const configuredBenchmarkTicker =
    String(investmentPolicy?.benchmark || BENCHMARK_TICKER)
      .trim()
      .toUpperCase() || BENCHMARK_TICKER;
  const profileTickers = useMemo(
    () =>
      Array.from(
        new Set([
          focusTicker.trim().toUpperCase(),
          configuredBenchmarkTicker,
          ...portfolioHoldings.map((holding) => holding.ticker.trim().toUpperCase()),
        ])
      ).filter(Boolean),
    [configuredBenchmarkTicker, focusTicker, portfolioHoldings]
  );
  const marketPayload = useMemo(
    () => ({
      source: "Market Data",
      focusTicker,
      items: marketDataByTicker,
    }),
    [focusTicker, marketDataByTicker]
  );
  const focusInstrumentIsFundLike = isFundLikeMarketData(marketData);
  const localDocumentReadiness = useMemo(
    () =>
      profileTickers.map((ticker) => {
        const marketItem = marketDataByTicker[ticker];
        if (isFundLikeMarketData(marketItem)) {
          return {
            ticker,
            has10k: false,
            has10q: false,
            ready: true,
            missing: [],
            requiresCompanyFilings: false,
            evidenceModel: "fund_profile",
          };
        }
        const docs = filings.filter((filing) => (filing.ticker || focusTicker).toUpperCase() === ticker);
        const tickerHas10k = docs.some((filing) => filing.form === "10-K" && filing.vectorStoreId);
        const tickerHas10q = docs.some((filing) => filing.form === "10-Q" && filing.vectorStoreId);
        return {
          ticker,
          has10k: tickerHas10k,
          has10q: tickerHas10q,
          ready: tickerHas10k && tickerHas10q,
          missing: [...(!tickerHas10k ? ["10-K"] : []), ...(!tickerHas10q ? ["10-Q"] : [])],
          requiresCompanyFilings: true,
          evidenceModel: "company_filings",
        };
      }),
    [filings, focusTicker, marketDataByTicker, profileTickers]
  );
  const documentReadinessRows = Array.isArray(engineSnapshot?.documentReadiness)
    ? engineSnapshot.documentReadiness
    : localDocumentReadiness;
  const annualFundamentals = marketData?.annualFundamentals ?? [];
  const latestFundamentals = annualFundamentals[annualFundamentals.length - 1] ?? null;
  const marketLayerReady = Boolean(
    marketData &&
      (marketData.market?.regularMarketPrice != null ||
        marketData.market?.previousClose != null ||
        marketData.priceHistory?.length ||
        marketData.annualFundamentals?.length ||
        marketData.fund)
  );
  const readinessItems = [
    {
      done: researchHoldings.length > 0,
      title: L("Profile selected", "Profile seleccionado"),
      body: L(
        "Pick the stock or ETF ticker you want Neuro to evaluate as a long-term investment profile.",
        "Escoge el ticker de acción o ETF que quieres que Neuro evalúe como profile de inversión a largo plazo."
      ),
    },
    {
      done: marketLayerReady,
      title: L("Market layer ready", "Capa de mercado lista"),
      body: L("Price, history, company fundamentals, or ETF/fund data load automatically for the active profile.", "Precio, historial, fundamentales de compañía o data de ETF/fondo cargan automáticamente para el profile activo."),
    },
    {
      done: documentReadinessRows.length > 0 && documentReadinessRows.every((row: any) => row.ready),
      title: focusInstrumentIsFundLike ? L("Fund evidence ready", "Evidencia de fondo lista") : L("Company documents ready", "Documentos listos"),
      body: focusInstrumentIsFundLike
        ? L("ETF/fund profiles use fund strategy, holdings, fees, yield, liquidity, and market history instead of company 10-K/10-Q documents.", "Los profiles de ETF/fondo usan estrategia, holdings, costos, yield, liquidez e historial de mercado en vez de 10-K/10-Q corporativos.")
        : L("A full stock verdict is stronger when recent 10-K and 10-Q documents are indexed.", "El veredicto completo de una acción mejora cuando hay 10-K y 10-Q recientes indexados."),
    },
  ];
  const readinessScore = Math.round(
    (readinessItems.filter((item) => item.done).length / readinessItems.length) * 100
  );
  const benchmarkData = marketDataByTicker[configuredBenchmarkTicker] ?? null;
  const benchmarkAnnualizedReturn = useMemo(
    () => annualizedPriceReturn(benchmarkData?.priceHistory),
    [benchmarkData?.priceHistory]
  );
  const portfolioAlpha =
    portfolioSummary.annualizedReturn != null && benchmarkAnnualizedReturn != null
      ? portfolioSummary.annualizedReturn - benchmarkAnnualizedReturn
      : null;
  const activePortfolioPositions = portfolioPositions.filter((row) => row.ticker && row.shares > 0);
  const topPortfolioMovers = activePortfolioPositions
    .filter((row) => row.pnl != null)
    .slice()
    .sort((a, b) => Math.abs(Number(b.pnl)) - Math.abs(Number(a.pnl)))
    .slice(0, 4);
  const researchQueue = documentReadinessRows.filter((row: any) => !row.ready).slice(0, 5);
  const commandCenterAlerts = [
    ...(portfolioSummary.largestPosition?.weight && portfolioSummary.largestPosition.weight > 0.35
      ? [
          L(
            `${portfolioSummary.largestPosition.ticker} is above 35% of mirrored portfolio value.`,
            `${portfolioSummary.largestPosition.ticker} está sobre 35% del valor de la cartera espejo.`
          ),
        ]
      : []),
    ...(researchQueue.length
      ? [
          L(
            `${researchQueue.length} profile(s) need current 10-K/10-Q evidence.`,
            `${researchQueue.length} profile(s) necesitan evidencia 10-K/10-Q actual.`
          ),
        ]
      : []),
    ...(marketData?.dataQuality?.degraded
      ? [L("Market data is degraded for the active profile.", "La data de mercado está degradada para el profile activo.")]
      : []),
    ...(agentReport ? [] : [L("No current Neuro report has been generated for this profile.", "Aún no hay reporte Neuro generado para este profile.")]),
  ].slice(0, 4);
  const portfolioXray = useMemo(() => {
    const valuedPositions = activePortfolioPositions.filter((row) => row.value != null);
    const sectorRows = aggregateByKey(
      valuedPositions,
      (row) => row.sector || "Unclassified",
      (row) => Number(row.value)
    );
    const instrumentRows = aggregateByKey(
      valuedPositions,
      (row) => {
        const item = marketDataByTicker[row.ticker];
        if (isFundLikeMarketData(item)) return "ETF / fund";
        return item?.company?.quoteType || item?.instrumentType || "Stock";
      },
      (row) => Number(row.value)
    );
    const topHoldings = new Map<string, { name: string; value: number; funds: string[] }>();
    for (const row of valuedPositions) {
      const item = marketDataByTicker[row.ticker];
      for (const holding of item?.fund?.topHoldings ?? []) {
        const symbol = String(holding.symbol ?? holding.holdingName ?? "").trim().toUpperCase();
        if (!symbol) continue;
        const holdingWeight = optionalNumber(holding.holdingPercent);
        if (holdingWeight == null) continue;
        const contribution = Number(row.value) * (holdingWeight > 1 ? holdingWeight / 100 : holdingWeight);
        if (contribution <= 0) continue;
        const existing = topHoldings.get(symbol) ?? {
          name: String(holding.holdingName ?? symbol),
          value: 0,
          funds: [],
        };
        existing.value += contribution;
        if (!existing.funds.includes(row.ticker)) existing.funds.push(row.ticker);
        topHoldings.set(symbol, existing);
      }
    }
    const overlapRows = Array.from(topHoldings.entries())
      .map(([symbol, row]) => ({
        symbol,
        name: row.name,
        value: row.value,
        weight:
          portfolioSummary.totalValue != null && portfolioSummary.totalValue > 0
            ? row.value / portfolioSummary.totalValue
            : null,
        funds: row.funds,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    return { sectorRows, instrumentRows, overlapRows };
  }, [activePortfolioPositions, marketDataByTicker, portfolioSummary.totalValue]);
  const focusEnginePosition = Array.isArray(engineSnapshot?.positions)
    ? engineSnapshot.positions.find((position: any) => String(position?.ticker ?? "").toUpperCase() === focusTicker.toUpperCase()) ??
      engineSnapshot.positions[0]
    : null;
  const focusProfile360 = useMemo(() => {
    const latest = latestFundamentals;
    const documentRow = documentReadinessRows.find((row: any) => String(row?.ticker ?? "").toUpperCase() === focusTicker.toUpperCase());
    const marginOfSafety = optionalNumber(focusEnginePosition?.derived?.marginOfSafety);
    const fcfMargin = optionalNumber(latest?.fcfMargin ?? focusEnginePosition?.derived?.fcfMargin);
    const debtToEquity = optionalNumber(latest?.debtToEquity ?? focusEnginePosition?.derived?.debtToEquity);
    const dividendYield = optionalNumber(marketData?.fund?.yield ?? marketData?.market?.dividendYield);
    const financialEvidenceScore =
      scoreFromBoolean(annualFundamentals.length >= 3 || Boolean(marketData?.fund), 20) +
      scoreFromBoolean(fcfMargin != null && fcfMargin > 0.05, 25) +
      scoreFromBoolean(debtToEquity != null && debtToEquity < 1.5, 20) +
      scoreFromBoolean(Boolean(marketData?.priceHistory?.length), 15) +
      scoreFromBoolean(!marketData?.dataQuality?.degraded, 20);
    const valuationScore =
      marginOfSafety != null
        ? clampNumber(50 + marginOfSafety * 140, 0, 100)
        : focusEnginePosition?.derived?.valuationStatus === "undervalued"
        ? 75
        : focusEnginePosition?.derived?.valuationStatus === "overvalued"
        ? 35
        : 50;
    const dividendScore =
      scoreFromBoolean(dividendYield != null && dividendYield > 0, 30) +
      scoreFromBoolean(dividendYield != null && dividendYield > 0.015 && dividendYield < 0.08, 30) +
      scoreFromBoolean(fcfMargin != null && fcfMargin > 0, 25) +
      scoreFromBoolean(debtToEquity != null && debtToEquity < 2, 15);
    const evidenceScore =
      scoreFromBoolean(Boolean(marketLayerReady), 25) +
      scoreFromBoolean(Boolean(documentRow?.ready), 35) +
      scoreFromBoolean(Boolean(agentReport), 25) +
      scoreFromBoolean(thesisNotes.length > 0, 15);
    const riskScore =
      scoreFromBoolean(!(portfolioSummary.largestPosition?.weight && portfolioSummary.largestPosition.weight > 0.35), 25) +
      scoreFromBoolean(!marketData?.dataQuality?.degraded, 20) +
      scoreFromBoolean(!researchQueue.length, 20) +
      scoreFromBoolean(debtToEquity != null && debtToEquity <= 2, 20) +
      scoreFromBoolean(Boolean(marketData?.priceHistory?.length), 15);
    return {
      financialEvidenceScore,
      valuationScore,
      dividendScore,
      evidenceScore,
      riskScore,
      verdict: String(focusEnginePosition?.derived?.verdict ?? (documentRow?.ready ? "watchlist" : "provisional")).replace(/_/g, " "),
      valuationStatus: String(focusEnginePosition?.derived?.valuationStatus ?? "unknown").replace(/_/g, " "),
      missingEvidence: documentRow?.missing ?? [],
    };
  }, [
    agentReport,
    annualFundamentals.length,
    documentReadinessRows,
    focusEnginePosition,
    focusTicker,
    latestFundamentals,
    marketData,
    marketLayerReady,
    portfolioSummary.largestPosition?.weight,
    researchQueue.length,
      thesisNotes.length,
    ]);
  const currentDecisionSupport = useMemo(() => {
    if (!engineSnapshot && serverDecisionSupport) return serverDecisionSupport;
    if (!engineSnapshot) return null;
    const privateMethodologyReady = serverDecisionSupport?.evidence?.privateMethodologyReady ?? false;
    const serverVectorStores = Number(serverDecisionSupport?.evidence?.vectorStoreCount ?? 0);
    const aiTradeProposalsEnabled = !serverDecisionSupport?.blockingReasons?.includes(
      "AI-generated trade proposals disabled by emergency control"
    );
    return buildNeuroDecisionSupport({
      engine: engineSnapshot,
      policy: investmentPolicy,
      focusTicker,
      marketData,
      vectorStoreCount: Math.max(serverVectorStores, indexedDocuments.length + (privateMethodologyReady ? 1 : 0)),
      filingsIndexed: indexedDocuments.length,
      privateMethodologyReady,
      businessQualityAnalysis,
      managementCapitalAllocationAnalysis,
      earningsQualityAccountingRiskAnalysis,
      independentBearCaseAnalysis,
      aiTradeProposalsEnabled,
    });
  }, [
    engineSnapshot,
    focusTicker,
    indexedDocuments.length,
    investmentPolicy,
    marketData,
    businessQualityAnalysis,
    managementCapitalAllocationAnalysis,
    earningsQualityAccountingRiskAnalysis,
    independentBearCaseAnalysis,
    serverDecisionSupport,
  ]);
  const selectedCommitteePacket = useMemo(
    () =>
      committeePackets.find((packet) => packet.id === selectedCommitteePacketId) ??
      committeePackets[0] ??
      null,
    [committeePackets, selectedCommitteePacketId]
  );
  const selectedCommitteePacketDecision = useMemo(
    () =>
      selectedCommitteePacket
        ? committeeDecisions.find((decision) => decision.packet_id === selectedCommitteePacket.id) ?? null
        : null,
    [committeeDecisions, selectedCommitteePacket]
  );
  const selectedCommitteeBusinessQualityReady = useMemo(() => {
    const analysis =
      selectedCommitteePacket?.evidence_snapshot?.businessQualityAnalysis ??
      selectedCommitteePacket?.report_snapshot?.structured?.businessQualityAnalysis ??
      null;
    return Boolean(
      analysis?.status === "not_applicable" ||
        (analysis?.generatedBy === "ai_research" && analysis?.status === "complete")
    );
  }, [selectedCommitteePacket]);
  const selectedCommitteeManagementAllocationReady = useMemo(() => {
    const analysis =
      selectedCommitteePacket?.evidence_snapshot?.managementCapitalAllocationAnalysis ??
      selectedCommitteePacket?.report_snapshot?.structured?.managementCapitalAllocationAnalysis ??
      null;
    return Boolean(
      analysis?.status === "not_applicable" ||
        (analysis?.generatedBy === "ai_research" &&
          (analysis?.status === "complete" || analysis?.status === "provisional"))
    );
  }, [selectedCommitteePacket]);
  const selectedCommitteeEarningsQualityReady = useMemo(() => {
    const analysis =
      selectedCommitteePacket?.evidence_snapshot?.earningsQualityAccountingRiskAnalysis ??
      selectedCommitteePacket?.report_snapshot?.structured?.earningsQualityAccountingRiskAnalysis ??
      null;
    return Boolean(
      analysis?.status === "not_applicable" ||
        (analysis?.generatedBy === "ai_research" &&
          (analysis?.status === "complete" || analysis?.status === "provisional"))
    );
  }, [selectedCommitteePacket]);
  const selectedCommitteeBearCaseReady = useMemo(() => {
    const analysis =
      selectedCommitteePacket?.evidence_snapshot?.independentBearCaseAnalysis ??
      selectedCommitteePacket?.report_snapshot?.structured?.independentBearCaseAnalysis ??
      null;
    return Boolean(
      analysis?.status === "not_applicable" ||
        (analysis?.generatedBy === "ai_research" &&
          (analysis?.status === "complete" || analysis?.status === "provisional"))
    );
  }, [selectedCommitteePacket]);
  const selectedCommitteeResearchDossiersReady =
    selectedCommitteeBusinessQualityReady &&
    selectedCommitteeManagementAllocationReady &&
    selectedCommitteeEarningsQualityReady &&
    selectedCommitteeBearCaseReady;
  const committeeSourceMap = useMemo(
    () =>
      new Map(
        (selectedCommitteePacket?.source_manifest ?? []).map((source) => [source.id, source] as const)
      ),
    [selectedCommitteePacket]
  );
  const thesisMonitor = useMemo(() => {
    const impactCounts = thesisNotes.reduce<Record<string, number>>((out, note) => {
      const key = String(note.payload?.impact ?? "uncertain");
      out[key] = (out[key] ?? 0) + 1;
      return out;
    }, {});
    const riskFlags = Array.isArray(engineSnapshot?.riskFlags) ? engineSnapshot.riskFlags : [];
    const watchItems = [
      ...riskFlags.map((flag: any) => ({
        title: String(flag.type ?? "Risk").replace(/_/g, " "),
        body: String(flag.message ?? ""),
        tone: String(flag.severity ?? "medium"),
      })),
      ...researchQueue.map((row: any) => ({
        title: `${row.ticker} ${L("evidence gap", "brecha de evidencia")}`,
        body: `${L("Missing", "Falta")}: ${(row.missing ?? []).join(", ")}`,
        tone: "medium",
      })),
      ...(marketData?.dataQuality?.degraded
        ? [
            {
              title: L("Market data quality", "Calidad de data"),
              body: (marketData.dataQuality.messages ?? []).join(" ") || L("Provider data is degraded.", "La data del proveedor está degradada."),
              tone: "medium",
            },
          ]
        : []),
    ].slice(0, 6);
    return {
      impactCounts,
      watchItems,
      lastNote: thesisNotes[0] ?? null,
      verifiedReports: reports.length,
    };
  }, [L, engineSnapshot?.riskFlags, marketData?.dataQuality, reports.length, researchQueue, thesisNotes]);
  const investorReportingRows = useMemo(() => {
    return fundShareholders.map((shareholder) => {
      const selected = selectedFundProjection?.shareholderRows.find((row) => row.shareholderId === shareholder.id);
      const year30 = fundProjection.at(-1)?.shareholderRows.find((row) => row.shareholderId === shareholder.id);
      return {
        ...shareholder,
        selectedPayout: selected?.payout ?? 0,
        selectedReinvested: selected?.reinvested ?? 0,
        year30Payout: year30?.payout ?? 0,
        policy: shareholder.payoutMode === "withdraw" ? `${shareholder.annualWithdrawalPct}% withdraw` : "Reinvest",
      };
    });
  }, [fundProjection, fundShareholders, selectedFundProjection]);

  async function loadCaseList(caseId?: string | null) {
    const suffix = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
    const res = await authedFetch(`/api/neuro-analysis/cases${suffix}`).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      setCases(Array.isArray(json?.cases) ? json.cases : []);
      if (Array.isArray(json?.reports)) setReports(json.reports);
    }
  }

  async function saveResearchCase() {
    try {
      setCaseSaving(true);
      setCaseStatus("");
      const title =
        caseTitle.trim() ||
        marketData?.company?.name ||
        (focusTicker ? `${focusTicker} research` : "Research case");
      const res = await authedFetch("/api/neuro-analysis/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: activeCaseId,
          title,
          focusTicker,
          researchGoal,
          holdings: researchHoldings.map((holding) => ({
            ticker: holding.ticker,
            shares: holding.shares,
            averageCost: holding.averageCost,
            currentPrice: holding.currentPrice,
            openedAt: holding.openedAt,
            researchOnly: Boolean((holding as any).researchOnly),
          })),
          marketData: marketPayload,
          readiness: { documentReadiness: documentReadinessRows, readinessScore, availableCapital },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not save research case.");
      const saved = json?.case;
      if (saved?.id) setActiveCaseId(String(saved.id));
      setCaseTitle(String(saved?.title ?? title));
      setCaseStatus(L("Research case saved.", "Caso de research guardado."));
      await loadCaseList(saved?.id ? String(saved.id) : activeCaseId);
    } catch (error: any) {
      setCaseStatus(error?.message || "Could not save research case.");
    } finally {
      setCaseSaving(false);
    }
  }

  async function loadResearchCase(caseId: string) {
    const res = await authedFetch(`/api/neuro-analysis/cases/${encodeURIComponent(caseId)}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Could not load research case.");
    const researchCase = json?.case;
    setActiveCaseId(String(researchCase.id));
    setCaseTitle(String(researchCase.title ?? ""));
    const loadedFocusTicker = String(researchCase.focus_ticker ?? focusTicker).toUpperCase();
    setFocusTicker(loadedFocusTicker);
    setFocusTickerDraft(loadedFocusTicker);
    setResearchGoal(String(researchCase.research_goal ?? researchGoal));
    if (Array.isArray(researchCase.holdings)) {
      setPortfolioHoldings(
        researchCase.holdings
          .filter((holding: any) => !holding?.researchOnly)
          .map((holding: any, index: number) => ({
            id: makeId(`${holding?.ticker ?? "position"}-${index}`),
            ticker: String(holding?.ticker ?? "").toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12),
            shares: Math.max(0, toNumber(holding?.shares)),
            averageCost:
              optionalNumber(holding?.averageCost) == null
                ? null
                : Math.max(0, Number(optionalNumber(holding?.averageCost))),
            currentPrice:
              optionalNumber(holding?.currentPrice) == null
                ? null
                : Math.max(0, Number(optionalNumber(holding?.currentPrice))),
            openedAt: String(holding?.openedAt ?? holding?.opened_at ?? oneYearAgoInputDate()).slice(0, 10),
          }))
      );
    }
    const loadedAvailableCapital = optionalNumber(
      researchCase.readiness?.availableCapital ??
        researchCase.readiness?.capitalAllocationDashboard?.availableCapital
    );
    setAvailableCapital(loadedAvailableCapital == null ? null : Math.max(0, loadedAvailableCapital));
    const savedMarket = researchCase.market_data;
    if (savedMarket?.items && typeof savedMarket.items === "object") {
      setMarketDataByTicker(savedMarket.items);
      const nextFocus = String(researchCase.focus_ticker ?? focusTicker).toUpperCase();
      setMarketData(savedMarket.items[nextFocus] ?? null);
    }
    const nextReports = Array.isArray(json?.reports) ? json.reports : [];
    setReports(nextReports);
    setAgentConversation([]);
    setAgentQaError("");
    setAgentQuestion("");
    await loadThesisContext(String(researchCase.id));
    const latest = nextReports[0];
    if (latest) {
      setActiveReportId(String(latest.id));
      setAgentReport(String(latest.report_text ?? ""));
      setEngineSnapshot(latest.engine ?? latest.structured?.engine ?? null);
      setReportFinancialDataIntegrity(latest.structured?.financialDataIntegrity ?? latest.engine?.financialDataIntegrity ?? null);
      setBusinessQualityAnalysis(latest.structured?.businessQualityAnalysis ?? null);
      setManagementCapitalAllocationAnalysis(latest.structured?.managementCapitalAllocationAnalysis ?? null);
      setEarningsQualityAccountingRiskAnalysis(latest.structured?.earningsQualityAccountingRiskAnalysis ?? null);
      setIndependentBearCaseAnalysis(latest.structured?.independentBearCaseAnalysis ?? null);
      setPortfolioExposureMap(latest.structured?.portfolioExposureMap ?? null);
      setMacroContext(latest.structured?.macroContext ?? null);
      setCapitalAllocationDashboard(latest.structured?.capitalAllocationDashboard ?? null);
      setPerformanceAttribution(latest.structured?.performanceAttribution ?? null);
      const latestAvailableCapital = optionalNumber(latest.structured?.capitalAllocationDashboard?.availableCapital);
      if (latestAvailableCapital != null) setAvailableCapital(Math.max(0, latestAvailableCapital));
      setOriginalInvestmentThesis(latest.structured?.originalInvestmentThesis ?? originalInvestmentThesis);
      setInvestmentThesisReview(latest.structured?.investmentThesisReview ?? null);
      setPositionExitReview(latest.structured?.positionExitReview ?? null);
      setServerDecisionSupport(latest.structured?.decisionSupport ?? null);
    } else {
      setActiveReportId(null);
      setAgentReport("");
      setEngineSnapshot(null);
      setReportFinancialDataIntegrity(null);
      setBusinessQualityAnalysis(null);
      setManagementCapitalAllocationAnalysis(null);
      setEarningsQualityAccountingRiskAnalysis(null);
      setIndependentBearCaseAnalysis(null);
      setPortfolioExposureMap(null);
      setMacroContext(null);
      setCapitalAllocationDashboard(null);
      setPerformanceAttribution(null);
      setInvestmentThesisReview(null);
      setPositionExitReview(null);
      setServerDecisionSupport(null);
    }
  }

  function openSavedReport(report: NeuroReportSummary) {
    setActiveReportId(String(report.id));
    setAgentReport(String(report.report_text ?? ""));
    setEngineSnapshot(report.engine ?? report.structured?.engine ?? null);
    setReportFinancialDataIntegrity(report.structured?.financialDataIntegrity ?? report.engine?.financialDataIntegrity ?? null);
    setBusinessQualityAnalysis(report.structured?.businessQualityAnalysis ?? null);
    setManagementCapitalAllocationAnalysis(report.structured?.managementCapitalAllocationAnalysis ?? null);
    setEarningsQualityAccountingRiskAnalysis(report.structured?.earningsQualityAccountingRiskAnalysis ?? null);
    setIndependentBearCaseAnalysis(report.structured?.independentBearCaseAnalysis ?? null);
    setPortfolioExposureMap(report.structured?.portfolioExposureMap ?? null);
    setMacroContext(report.structured?.macroContext ?? null);
    setCapitalAllocationDashboard(report.structured?.capitalAllocationDashboard ?? null);
    setPerformanceAttribution(report.structured?.performanceAttribution ?? null);
    const reportAvailableCapital = optionalNumber(report.structured?.capitalAllocationDashboard?.availableCapital);
    if (reportAvailableCapital != null) setAvailableCapital(Math.max(0, reportAvailableCapital));
    setOriginalInvestmentThesis(report.structured?.originalInvestmentThesis ?? originalInvestmentThesis);
    setInvestmentThesisReview(report.structured?.investmentThesisReview ?? null);
    setPositionExitReview(report.structured?.positionExitReview ?? null);
    setServerDecisionSupport(report.structured?.decisionSupport ?? null);
  }

  async function downloadReportPdf() {
    if (!agentReport.trim()) return;
    const token = await authToken();
    if (token) {
      await fetch("/api/neuro-analysis/usage", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          eventType: "pdf_export",
          caseId: activeCaseId,
          reportId: activeReportId,
        }),
      }).catch(() => null);
    }
    const mod: any = await import("jspdf");
    const JsPDF = mod.jsPDF || mod.default;
    const doc = new JsPDF({ unit: "pt", format: "a4" });
    const margin = 42;
    const width = doc.internal.pageSize.getWidth() - margin * 2;
    const title = caseTitle || marketData?.company?.name || "Neuro Analysis";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, margin, 48);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(new Date().toLocaleString(localeTag), margin, 64);
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(agentReport.replace(/\n{3,}/g, "\n\n"), width);
    let y = 88;
    for (const line of lines) {
      if (y > 760) {
        doc.addPage();
        y = 48;
      }
      doc.text(line, margin, y);
      y += 13;
    }
    doc.save(`${title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "neuro-analysis"}.pdf`);
  }

  useEffect(() => {
    let alive = true;
    async function checkAccess() {
      const res = await authedFetch("/api/smart-tools/access").catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (alive) setAccessAllowed(Boolean(json?.allowed));
    }

    void checkAccess();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (accessAllowed !== true) return;
    void loadCaseList(activeCaseId);
    void loadInvestmentPolicy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessAllowed]);

  useEffect(() => {
    let alive = true;
    async function loadDocuments() {
      if (accessAllowed !== true || !focusTicker.trim()) return;
      setFilingsLoading(true);
      const res = await authedFetch(`/api/neuro-analysis/filings?ticker=${encodeURIComponent(focusTicker)}`).catch(
        () => null
      );
      const json = res ? await res.json().catch(() => ({})) : {};
      if (!alive) return;

      if (res?.ok && Array.isArray(json?.filings)) {
        setFilings((prev) => {
          const pending = prev.filter((filing) => filing.file && filing.ticker === focusTicker);
          const persisted = json.filings.map((filing: any) => ({
            id: String(filing.id ?? `${filing.form}-${filing.fileName}`),
            ticker: String(filing.ticker ?? focusTicker),
            form: filing.form === "10-Q" ? "10-Q" : "10-K",
            fileName: String(filing.fileName ?? ""),
            fiscalYear: filing.fiscalYear == null ? null : Number(filing.fiscalYear),
            period: filing.period ?? null,
            periodEnd: filing.periodEnd ?? null,
            fileId: filing.fileId ?? undefined,
            vectorStoreId: filing.vectorStoreId ?? undefined,
            bytes: filing.bytes == null ? undefined : Number(filing.bytes),
            usageBytes: filing.usageBytes == null ? undefined : Number(filing.usageBytes),
            expiresAt: filing.expiresAt ?? null,
            createdAt: filing.createdAt ?? null,
            status: "ready" as const,
          }));
          return [...pending, ...persisted];
        });
      }
      setFilingsLoading(false);
    }

    void loadDocuments();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessAllowed, focusTicker]);

  useEffect(() => {
    let alive = true;
    async function loadMarketData() {
      if (accessAllowed !== true || profileTickers.length === 0) return;
      setMarketLoading(true);
      setMarketError("");

      const res = await authedFetch(`/api/neuro-analysis/market-data?tickers=${encodeURIComponent(profileTickers.join(","))}`).catch(
        () => null
      );
      const json = res ? await res.json().catch(() => ({})) : {};
      if (!alive) return;

      if (res?.ok) {
        const items = json?.items && typeof json.items === "object" ? json.items : { [focusTicker]: json };
        setMarketDataByTicker(items as Record<string, MarketData>);
        const typedItems = items as Record<string, MarketData>;
        const nextMarketData = typedItems[focusTicker] ?? Object.values(typedItems)[0] ?? null;
        setMarketData(nextMarketData);
        const messages = nextMarketData?.dataQuality?.messages ?? [];
        const requestError = nextMarketData?.errors?.request;
        if (requestError) {
          setMarketError(String(requestError));
        } else if (messages.length) {
          setMarketError(messages.join(" "));
        } else if (
          nextMarketData &&
          nextMarketData.market?.regularMarketPrice == null &&
          nextMarketData.market?.previousClose == null &&
          !nextMarketData.priceHistory?.length &&
          !nextMarketData.annualFundamentals?.length &&
          !nextMarketData.fund
        ) {
          setMarketError(L("Market data returned no usable price, history, fundamentals, or fund profile.", "La data de mercado no devolvió precio, historial, fundamentales ni profile de fondo utilizable."));
        }
      } else {
        setMarketData(null);
        setMarketError(String(json?.error || L("Could not load market data.", "No se pudo cargar la data de mercado.")));
      }
      setMarketLoading(false);
    }

    void loadMarketData();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessAllowed, profileTickers.join(","), marketRefreshNonce]);

  function handleDocumentFiles(form: "10-K" | "10-Q", fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    setFilings((prev) => [
      ...prev,
      ...files.map((file) => {
        const fiscalYear = guessFiscalYear(file.name);
        return {
          id: makeId(`${form}-${file.name}`),
          ticker: focusTicker,
          form,
          file,
          fileName: file.name,
          fiscalYear,
          period: form === "10-K" ? `FY ${fiscalYear}` : "",
          bytes: file.size,
          status: "idle" as const,
        };
      }),
    ]);
  }

  async function lookupCompanyDocuments(options: { quiet?: boolean } = {}) {
    try {
      if (!options.quiet) setDocumentLookupLoading(true);
      setDocumentLookupError("");
      const res = await authedFetch(`/api/neuro-analysis/company-documents?ticker=${encodeURIComponent(focusTicker)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not find recent company documents.");
      const documents = Array.isArray(json?.documents) ? (json.documents as CompanyDocumentLookup[]) : [];
      setDocumentLookup(documents);
      return documents;
    } catch (error: any) {
      const message = error?.message || "Could not find recent company documents.";
      setDocumentLookupError(message);
      if (options.quiet) throw new Error(message);
      return [];
    } finally {
      if (!options.quiet) setDocumentLookupLoading(false);
    }
  }

  async function findCompanyDocuments() {
    await lookupCompanyDocuments();
  }

  function companyDocumentKey(document: CompanyDocumentLookup) {
    return `${document.form}-${document.accessionNumber}`;
  }

  function mergeFilingIntoList(source: FilingUpload[], ready: FilingUpload) {
    const existingIndex = source.findIndex((item) => item.id === ready.id);
    if (existingIndex < 0) return [ready, ...source];
    return source.map((item, index) => (index === existingIndex ? ready : item));
  }

  function companyDocumentIsImported(document: CompanyDocumentLookup, sourceFilings: FilingUpload[] = filings) {
    const accession = document.accessionNumber.replace(/-/g, "");
    return sourceFilings.some(
      (filing) =>
        Boolean(filing.vectorStoreId) &&
        String(filing.ticker ?? focusTicker).toUpperCase() === document.ticker &&
        (filing.fileName.includes(accession) ||
          (filing.form === document.form &&
            Boolean(document.periodEnd) &&
            filing.periodEnd === document.periodEnd))
    );
  }

  function latestCompanyDocuments(sourceDocuments: CompanyDocumentLookup[] = documentLookup) {
    return (["10-K", "10-Q"] as const)
      .map((form) => sourceDocuments.find((document) => document.form === form))
      .filter((document): document is CompanyDocumentLookup => Boolean(document));
  }

  async function importCompanyDocument(document: CompanyDocumentLookup) {
    const key = companyDocumentKey(document);
    setDocumentImportError("");
    if (document.ticker !== focusTicker) {
      setDocumentImportError(
        L(
          "Search for documents again for the active company.",
          "Busca nuevamente los documentos de la compañía activa."
        )
      );
      return null;
    }
    setDocumentImporting((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await authedFetch("/api/neuro-analysis/import-filing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: document.ticker,
          form: document.form,
          accessionNumber: document.accessionNumber,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Company document import failed.");

      const completed = json?.queued && json?.job?.id
        ? await waitForNeuroJob(String(json.job.id))
        : json;

      const ready: FilingUpload = {
        id: String(completed.id ?? key),
        ticker: String(completed.ticker ?? focusTicker),
        form: completed.form === "10-Q" ? "10-Q" : "10-K",
        fileName: String(completed.fileName ?? document.primaryDocument),
        fiscalYear: completed.fiscalYear == null ? null : Number(completed.fiscalYear),
        period: completed.period ?? null,
        periodEnd: completed.periodEnd ?? document.periodEnd ?? null,
        fileId: String(completed.fileId ?? ""),
        vectorStoreId: String(completed.vectorStoreId ?? ""),
        bytes: Number(completed.bytes ?? 0),
        usageBytes: Number(completed.usageBytes ?? 0),
        expiresAt: completed.expiresAt ?? null,
        createdAt: completed.createdAt ?? null,
        expiresAfterDays: Number(completed.expiresAfterDays ?? 0),
        status: "ready",
        error: "",
      };
      setFilings((prev) => {
        return mergeFilingIntoList(prev, ready);
      });
      return ready;
    } catch (error: any) {
      setDocumentImportError(error?.message || "Company document import failed.");
      return null;
    } finally {
      setDocumentImporting((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  async function importLatestCompanyDocuments(
    sourceDocuments: CompanyDocumentLookup[] = documentLookup,
    sourceFilings: FilingUpload[] = filings
  ) {
    const latest = latestCompanyDocuments(sourceDocuments)
      .filter((document) => !companyDocumentIsImported(document, sourceFilings));
    if (!latest.length) return sourceFilings;

    setDocumentBatchImporting(true);
    setDocumentImportError("");
    let nextFilings = sourceFilings;
    try {
      for (const document of latest) {
        const imported = await importCompanyDocument(document);
        if (!imported) break;
        nextFilings = mergeFilingIntoList(nextFilings, imported);
      }
      return nextFilings;
    } finally {
      setDocumentBatchImporting(false);
    }
  }

  function updateDocument(id: string, patch: Partial<FilingUpload>) {
    setFilings((prev) =>
      prev.map((filing) => (filing.id === id ? { ...filing, ...patch } : filing))
    );
  }

  async function removeDocument(id: string) {
    const filing = filings.find((item) => item.id === id);
    setFilings((prev) => prev.filter((filing) => filing.id !== id));
    if (filing?.fileId || filing?.vectorStoreId) {
      await authedFetch(`/api/neuro-analysis/filings?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      }).catch(() => null);
    }
  }

  async function uploadDocumentIfNeeded(filing: FilingUpload, token: string) {
    if (!filing.fileName) return null;
    if (filing.vectorStoreId) {
      return {
        ticker: filing.ticker || focusTicker,
        form: filing.form,
        fileName: filing.fileName,
        fiscalYear: filing.fiscalYear ?? null,
        period: filing.period ?? null,
        periodEnd: filing.periodEnd ?? null,
        fileId: filing.fileId,
        vectorStoreId: filing.vectorStoreId,
        bytes: filing.bytes,
        usageBytes: filing.usageBytes,
      };
    }
    if (!filing.file) {
      throw new Error(L(`Select the ${filing.form} PDF.`, `Selecciona el PDF ${filing.form}.`));
    }

    updateDocument(filing.id, { status: "uploading", error: "" });

    const formData = new FormData();
    formData.append("ticker", focusTicker);
    formData.append("form", filing.form);
    if (filing.fiscalYear) formData.append("fiscalYear", String(filing.fiscalYear));
    if (filing.period) formData.append("period", filing.period);
    if (filing.periodEnd) formData.append("periodEnd", filing.periodEnd);
    formData.append("file", filing.file);

    const res = await fetch("/api/neuro-analysis/upload-filing", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = String(json?.error || "Document upload failed.");
      updateDocument(filing.id, { status: "error", error: message });
      throw new Error(message);
    }

    const completed = json?.queued && json?.job?.id
      ? await waitForNeuroJob(String(json.job.id))
      : json;

    const ready: FilingUpload = {
      ...filing,
      id: String(completed.id ?? filing.id),
      ticker: String(completed.ticker ?? focusTicker),
      file: undefined,
      fileId: String(completed.fileId ?? ""),
      vectorStoreId: String(completed.vectorStoreId ?? ""),
      fiscalYear: completed.fiscalYear == null ? filing.fiscalYear ?? null : Number(completed.fiscalYear),
      period: completed.period ?? filing.period ?? null,
      periodEnd: completed.periodEnd ?? filing.periodEnd ?? null,
      bytes: Number(completed.bytes ?? filing.bytes ?? 0),
      usageBytes: Number(completed.usageBytes ?? 0),
      expiresAt: completed.expiresAt ?? null,
      createdAt: completed.createdAt ?? null,
      expiresAfterDays: Number(completed.expiresAfterDays ?? 0),
      status: "ready",
      error: "",
    };
    setFilings((prev) => prev.map((item) => (item.id === filing.id ? ready : item)));

    return {
      ticker: ready.ticker || focusTicker,
      form: ready.form,
      fileName: ready.fileName,
      fiscalYear: ready.fiscalYear,
      period: ready.period,
      periodEnd: ready.periodEnd,
      fileId: ready.fileId,
      vectorStoreId: ready.vectorStoreId,
      bytes: ready.bytes,
      usageBytes: ready.usageBytes,
    };
  }

  async function runNeuroAgent(options: { filingsOverride?: FilingUpload[] } = {}) {
    setAgentLoading(true);
    setAgentError("");
    setAgentReport("");
    setReportFinancialDataIntegrity(null);
    setBusinessQualityAnalysis(null);
    setManagementCapitalAllocationAnalysis(null);
    setEarningsQualityAccountingRiskAnalysis(null);
    setIndependentBearCaseAnalysis(null);
    setPortfolioExposureMap(null);
    setMacroContext(null);
    setCapitalAllocationDashboard(null);
    setPerformanceAttribution(null);
    setInvestmentThesisReview(null);
    setPositionExitReview(null);
    try {
      const token = await authToken();
      if (!token) throw new Error(L("Sign in to run Neuro Analysis.", "Inicia sesión para correr Neuro Analysis."));
      if (!focusTicker.trim()) {
        throw new Error(L("Choose a focus ticker first.", "Escoge un ticker foco primero."));
      }

      const filingsForRun = options.filingsOverride ?? filings;
      const uploadedFilings = (
        await Promise.all(filingsForRun.map((filing) => uploadDocumentIfNeeded(filing, token)))
      ).filter(Boolean);

      const res = await fetch("/api/neuro-analysis/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          language: isEs ? "es" : "en",
          focusTicker,
          holdings: researchHoldings.map((holding) => ({
            ticker: holding.ticker,
            shares: holding.shares,
            averageCost: holding.averageCost,
            currentPrice: holding.currentPrice,
            openedAt: holding.openedAt,
            researchOnly: Boolean((holding as any).researchOnly),
          })),
          availableCapital,
          caseId: activeCaseId,
          caseTitle:
            caseTitle.trim() ||
            marketData?.company?.name ||
            (focusTicker ? `${focusTicker} research` : "Research case"),
          readiness: {
            readinessScore,
            documentReadiness: documentReadinessRows,
          },
          assumptions: {
            horizonYears: 10,
            discountRatePct: 10,
            marginOfSafetyPct: 25,
            baseGrowthPct: null,
            terminalGrowthPct: 2.5,
          },
          marketData: marketPayload,
          uploadedFilings,
          investmentThesis: [
            researchGoal,
            ...thesisNotes.map((note) => note.payload?.note ?? "").filter(Boolean),
          ].join("\n\n"),
          thesisContext: thesisNotes.map((note) => ({
            note: note.payload?.note,
            sourceType: note.payload?.sourceType,
            sourceLabel: note.payload?.sourceLabel,
            impact: note.payload?.impact,
            happenedAt: note.payload?.happenedAt,
            evidenceLevel: note.payload?.evidenceLevel,
          })),
          question: `${researchGoal}\n\n${isEs ? "No reveles nombres de proveedores, fuentes privadas ni metodologías internas." : "Do not reveal provider names, private sources, or internal methodologies."}`,
        }),
        signal: AbortSignal.timeout(240_000),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Neuro Analysis failed.");
      }
      setAgentReport(String(json?.report ?? ""));
      setEngineSnapshot(json?.engine ?? json?.structured?.engine ?? null);
      setReportFinancialDataIntegrity(
        json?.financialDataIntegrity ?? json?.structured?.financialDataIntegrity ?? json?.engine?.financialDataIntegrity ?? null
      );
      setBusinessQualityAnalysis(json?.businessQualityAnalysis ?? json?.structured?.businessQualityAnalysis ?? null);
      setManagementCapitalAllocationAnalysis(
        json?.managementCapitalAllocationAnalysis ?? json?.structured?.managementCapitalAllocationAnalysis ?? null
      );
      setEarningsQualityAccountingRiskAnalysis(
        json?.earningsQualityAccountingRiskAnalysis ??
          json?.structured?.earningsQualityAccountingRiskAnalysis ??
          null
      );
      setIndependentBearCaseAnalysis(
        json?.independentBearCaseAnalysis ?? json?.structured?.independentBearCaseAnalysis ?? null
      );
      setPortfolioExposureMap(json?.portfolioExposureMap ?? json?.structured?.portfolioExposureMap ?? null);
      setMacroContext(json?.macroContext ?? json?.structured?.macroContext ?? null);
      setCapitalAllocationDashboard(
        json?.capitalAllocationDashboard ?? json?.structured?.capitalAllocationDashboard ?? null
      );
      setPerformanceAttribution(
        json?.performanceAttribution ?? json?.structured?.performanceAttribution ?? null
      );
      setOriginalInvestmentThesis(
        json?.originalInvestmentThesis ?? json?.structured?.originalInvestmentThesis ?? originalInvestmentThesis
      );
      setInvestmentThesisReview(
        json?.investmentThesisReview ?? json?.structured?.investmentThesisReview ?? null
      );
      setPositionExitReview(json?.positionExitReview ?? json?.structured?.positionExitReview ?? null);
      setServerDecisionSupport(json?.decisionSupport ?? json?.structured?.decisionSupport ?? null);
      if (json?.caseId) setActiveCaseId(String(json.caseId));
      if (json?.reportId) setActiveReportId(String(json.reportId));
      await loadCaseList(json?.caseId ? String(json.caseId) : activeCaseId);
      await loadInvestmentCommittee(json?.caseId ? String(json.caseId) : activeCaseId);
      return true;
    } catch (error: any) {
      const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
      setAgentError(
        timedOut
          ? L(
              "The pre-valuation analysis took longer than four minutes and was stopped. Your data is safe; please run it again.",
              "El análisis previo a valoración tomó más de cuatro minutos y se detuvo. Tu data está segura; vuelve a correrlo."
            )
          : error?.message || "Neuro Analysis failed."
      );
      return false;
    } finally {
      setAgentLoading(false);
    }
  }

  async function runPerformanceAttribution() {
    try {
      setPerformanceAttributionLoading(true);
      setPerformanceAttributionError("");
      const res = await authedFetch("/api/neuro-analysis/performance-attribution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: isEs ? "es" : "en",
          holdings: researchHoldings.map((holding) => ({
            ticker: holding.ticker,
            shares: holding.shares,
            averageCost: holding.averageCost,
            currentPrice: holding.currentPrice,
            openedAt: holding.openedAt,
            researchOnly: Boolean((holding as any).researchOnly),
          })),
          marketData: marketPayload,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Performance attribution failed.");
      setPerformanceAttribution(json?.performanceAttribution ?? null);
    } catch (error: any) {
      setPerformanceAttributionError(
        error?.message || L("Performance attribution failed.", "Falló la atribución de performance.")
      );
    } finally {
      setPerformanceAttributionLoading(false);
    }
  }

  async function autoBuildEvidenceAndRun() {
    if (autoRunLoading || agentLoading) return;
    setAutoRunLoading(true);
    setAutoRunStatus("");
    setAgentError("");
    setDocumentLookupError("");
    setDocumentImportError("");

    try {
      if (!focusTicker.trim()) {
        throw new Error(L("Choose a focus ticker first.", "Escoge un ticker foco primero."));
      }

      if (focusInstrumentIsFundLike) {
        setAutoRunStatus(
          L(
            "Fund profile detected. Running with fund strategy, holdings, fees, yield, liquidity, and market history.",
            "Profile de fondo detectado. Corriendo con estrategia, holdings, costos, yield, liquidez e historial de mercado."
          )
        );
        const ok = await runNeuroAgent();
        if (ok) setAutoRunStatus(L("Report ready.", "Reporte listo."));
        return;
      }

      setAutoRunStatus(L("Finding recent official 10-K and 10-Q filings...", "Buscando filings oficiales 10-K y 10-Q recientes..."));
      const documents = await lookupCompanyDocuments({ quiet: true });
      if (!documents.length) {
        throw new Error(
          L(
            "No recent official filings were found for this ticker. Upload the 10-K/10-Q PDFs manually and run the analysis again.",
            "No se encontraron filings oficiales recientes para este ticker. Sube manualmente los PDFs 10-K/10-Q y vuelve a correr el análisis."
          )
        );
      }

      const missingOfficialDocs = latestCompanyDocuments(documents)
        .filter((document) => !companyDocumentIsImported(document));
      if (missingOfficialDocs.length) {
        setAutoRunStatus(L("Importing and indexing official filings...", "Importando e indexando filings oficiales..."));
      } else {
        setAutoRunStatus(L("Official filings are already indexed. Preparing AI analysis...", "Los filings oficiales ya están indexados. Preparando análisis AI..."));
      }

      const nextFilings = await importLatestCompanyDocuments(documents, filings);
      const stillMissingImportedDocs = latestCompanyDocuments(documents)
        .filter((document) => !companyDocumentIsImported(document, nextFilings));
      if (stillMissingImportedDocs.length) {
        throw new Error(
          L(
            "At least one official filing could not be imported. Review the document panel or upload the PDF manually before running AI.",
            "Al menos un filing oficial no pudo importarse. Revisa el panel de documentos o sube el PDF manualmente antes de correr AI."
          )
        );
      }
      setAutoRunStatus(L("Running evidence-backed AI profile...", "Corriendo profile AI con evidencia..."));
      const ok = await runNeuroAgent({ filingsOverride: nextFilings });
      if (ok) setAutoRunStatus(L("Report ready.", "Reporte listo."));
    } catch (error: any) {
      setAgentError(error?.message || L("Auto evidence run failed.", "Falló el run automático con evidencia."));
    } finally {
      setAutoRunLoading(false);
    }
  }

  async function askNeuroResearchAgent() {
    const question = agentQuestion.trim();
    if (!question) return;
    try {
      setAgentQaLoading(true);
      setAgentQaError("");
      const serializableFilings = filings.map((filing) => ({
        id: filing.id,
        ticker: filing.ticker,
        form: filing.form,
        fileName: filing.fileName,
        fiscalYear: filing.fiscalYear,
        period: filing.period,
        periodEnd: filing.periodEnd,
        fileId: filing.fileId,
        vectorStoreId: filing.vectorStoreId,
        bytes: filing.bytes,
        usageBytes: filing.usageBytes,
        expiresAt: filing.expiresAt,
        createdAt: filing.createdAt,
        status: filing.status,
      }));
      const res = await authedFetch("/api/neuro-analysis/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: activeCaseId,
          reportId: activeReportId,
          question,
          clientContext: {
            focusTicker,
            caseTitle,
            researchGoal,
            holdings: researchHoldings.map((holding) => ({
              ticker: holding.ticker,
              shares: holding.shares,
              averageCost: holding.averageCost,
              currentPrice: holding.currentPrice,
              weight: holding.weight,
              pnlPct: holding.pnlPct,
              openedAt: holding.openedAt,
              annualizedReturn: holding.annualizedReturn,
              researchOnly: Boolean((holding as any).researchOnly),
            })),
            availableCapital,
            macroContext,
            capitalAllocationDashboard,
            performanceAttribution: performanceAttribution
              ? { ...performanceAttribution, calculationInput: undefined }
              : null,
            marketData: marketPayload,
            documentReadiness: documentReadinessRows,
            engineSnapshot,
            currentReport: agentReport,
            filings: serializableFilings,
            thesisNotes,
          },
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Neuro Research Agent failed.");
      const item: AgentChatItem = {
        question,
        answer: String(json?.answer ?? ""),
        createdAt: new Date().toISOString(),
        groundedContext: json?.groundedContext ?? undefined,
      };
      setAgentConversation((prev) => [item, ...prev].slice(0, 8));
      setAgentQuestion("");
    } catch (error: any) {
      setAgentQaError(error?.message || "Neuro Research Agent failed.");
    } finally {
      setAgentQaLoading(false);
    }
  }

  async function saveThesisContext() {
    const note = thesisContextNote.trim();
    if (!note) return;
    if (!activeCaseId) {
      setThesisError(L(
        "Save or run the research case first so this thesis context has durable memory.",
        "Guarda o corre el caso de research primero para que este contexto de tesis tenga memoria durable."
      ));
      return;
    }
    try {
      setThesisSaving(true);
      setThesisError("");
      setThesisStatus("");
      const res = await authedFetch("/api/neuro-analysis/thesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: activeCaseId,
          ticker: focusTicker,
          note,
          sourceType: thesisSourceType,
          sourceLabel: thesisSourceLabel,
          impact: thesisImpact,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not save thesis context.");
      setThesisNotes(Array.isArray(json?.notes) ? json.notes : []);
      setThesisContextNote("");
      setThesisSourceLabel("");
      setThesisStatus(L("Thesis context saved.", "Contexto de tesis guardado."));
    } catch (error: any) {
      setThesisError(error?.message || "Could not save thesis context.");
    } finally {
      setThesisSaving(false);
    }
  }

  function stageThesisUpdateQuestion() {
    const freshContext = thesisContextNote.trim();
    const contextLine = freshContext
      ? L(
          `New user-provided context to consider: ${freshContext}`,
          `Nuevo contexto provisto por el usuario a considerar: ${freshContext}`
        )
      : L(
          "Use the saved user-provided thesis context for this case.",
          "Usa el contexto de tesis guardado por el usuario para este caso."
        );
    setAgentQuestion(
      [
        L(
          "Help me update the living investment thesis objectively.",
          "Ayúdame a actualizar objetivamente la tesis viva de inversión."
        ),
        contextLine,
        L(
          "Separate verified evidence from user-provided context. Tell me whether this changes the long-term thesis, dividend thesis, valuation view, watch items, or exit-review triggers. Do not guess.",
          "Separa evidencia verificada de contexto provisto por el usuario. Dime si esto cambia la tesis a largo plazo, tesis de dividendos, visión de valuation, puntos a vigilar o triggers de revisión de salida. No adivines."
        ),
      ].join("\n\n")
    );
  }

  async function runSectorScreener() {
    try {
      setScreenerLoading(true);
      setScreenerError("");
      const params = new URLSearchParams({ sector: screenerSector, strategy: screenerStrategy });
      if (screenerCustomTickers.trim()) params.set("tickers", screenerCustomTickers.trim());
      const res = await authedFetch(`/api/neuro-analysis/sector-screener?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Sector screener failed.");
      setScreenerResult(json as SectorScreenerResult);
      if (json?.sector) setScreenerSector(String(json.sector));
      if (json?.strategy) setScreenerStrategy(String(json.strategy));
    } catch (error: any) {
      setScreenerError(error?.message || "Sector screener failed.");
    } finally {
      setScreenerLoading(false);
    }
  }

  function openScreenerTicker(ticker: string) {
    const nextTicker = ticker.trim().toUpperCase();
    if (!nextTicker) return;
    if (originalInvestmentThesis && nextTicker !== originalInvestmentThesis.ticker) {
      startNewResearchCase(nextTicker);
      return;
    }
    setFocusTicker(nextTicker);
    setFocusTickerDraft(nextTicker);
    setResearchGoal(defaultResearchGoal(isEs));
    setActiveWorkspaceTab("research");
  }

  function applyFocusTicker(ticker = focusTickerDraft) {
    const nextTicker = ticker.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
    if (!nextTicker) return;
    if (originalInvestmentThesis && nextTicker !== originalInvestmentThesis.ticker) {
      setFocusTickerDraft(originalInvestmentThesis.ticker);
      setCaseStatus(
        L(
          "This case has a permanent original thesis. Start a new research case for another ticker.",
          "Este caso tiene una tesis original permanente. Inicia otro caso de research para usar otro ticker."
        )
      );
      return;
    }
    setFocusTicker(nextTicker);
    setFocusTickerDraft(nextTicker);
  }

  function startNewResearchCase(ticker = "") {
    const nextTicker = ticker.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
    setActiveCaseId(null);
    setActiveReportId(null);
    setCaseTitle("");
    setFocusTicker(nextTicker);
    setFocusTickerDraft(nextTicker);
    setResearchGoal(defaultResearchGoal(isEs));
    setFilings([]);
    setMarketData(nextTicker ? marketDataByTicker[nextTicker] ?? null : null);
    setAgentReport("");
    setEngineSnapshot(null);
    setReportFinancialDataIntegrity(null);
    setBusinessQualityAnalysis(null);
    setManagementCapitalAllocationAnalysis(null);
    setEarningsQualityAccountingRiskAnalysis(null);
    setIndependentBearCaseAnalysis(null);
    setPortfolioExposureMap(null);
    setMacroContext(null);
    setCapitalAllocationDashboard(null);
    setPerformanceAttribution(null);
    setServerDecisionSupport(null);
    setReports([]);
    setThesisNotes([]);
    setOriginalInvestmentThesis(null);
    setInvestmentThesisReview(null);
    setInvestmentThesisReviewHistory([]);
    setPositionExitReview(null);
    setPositionExitReviewHistory([]);
    setCommitteePackets([]);
    setCommitteeDecisions([]);
    setSelectedCommitteePacketId(null);
    setActiveWorkspaceTab("research");
    setCaseStatus(L("New research case ready.", "Nuevo caso de research listo."));
  }

  function updatePortfolioHolding(id: string, patch: Partial<Holding>) {
    setPortfolioHoldings((prev) =>
      prev.map((holding) =>
        holding.id === id
          ? {
              ...holding,
              ...patch,
              ticker:
                patch.ticker === undefined
                  ? holding.ticker
                  : String(patch.ticker).toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12),
              shares: patch.shares === undefined ? holding.shares : Math.max(0, toNumber(patch.shares)),
              averageCost:
                patch.averageCost === undefined
                  ? holding.averageCost
                  : optionalNumber(patch.averageCost) == null
                    ? null
                    : Math.max(0, Number(optionalNumber(patch.averageCost))),
              currentPrice:
                patch.currentPrice === undefined
                  ? holding.currentPrice
                  : optionalNumber(patch.currentPrice) == null
                    ? null
                    : Math.max(0, Number(optionalNumber(patch.currentPrice))),
              openedAt: patch.openedAt === undefined ? holding.openedAt : patch.openedAt || todayInputDate(),
            }
          : holding
      )
    );
  }

  function addPortfolioHolding(ticker = focusTicker) {
    const nextTicker = ticker.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
    setPortfolioHoldings((prev) => [...prev, makeHolding(nextTicker)]);
  }

  function removePortfolioHolding(id: string) {
    setPortfolioHoldings((prev) => prev.filter((holding) => holding.id !== id));
  }

  function updateFundShareholder(id: string, patch: Partial<FundShareholder>) {
    setFundShareholders((prev) =>
      prev.map((shareholder) =>
        shareholder.id === id
          ? {
              ...shareholder,
              ...patch,
              ownershipPct:
                patch.ownershipPct === undefined
                  ? shareholder.ownershipPct
                  : clampNumber(toNumber(patch.ownershipPct), 0, 100),
              annualWithdrawalPct:
                patch.annualWithdrawalPct === undefined
                  ? shareholder.annualWithdrawalPct
                  : clampNumber(toNumber(patch.annualWithdrawalPct), 0, 100),
            }
          : shareholder
      )
    );
  }

  function addFundShareholder() {
    setFundShareholders((prev) => [
      ...prev,
      {
        id: makeId("shareholder"),
        name: `Investor ${prev.length + 1}`,
        ownershipPct: 0,
        payoutMode: "reinvest",
        annualWithdrawalPct: 0,
      },
    ]);
  }

  function removeFundShareholder(id: string) {
    setFundShareholders((prev) => prev.filter((shareholder) => shareholder.id !== id));
  }

  if (accessAllowed === null) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="px-6 py-16 text-sm text-slate-400">
          {L("Checking beta access...", "Validando acceso beta...")}
        </div>
      </main>
    );
  }

  if (accessAllowed === false) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-6">
            <p className="text-xs font-semibold uppercase text-sky-300">
              {L("Smart Tools BETA", "Herramientas inteligentes BETA")}
            </p>
            <h1 className="mt-3 text-2xl font-semibold">{L("Closed beta", "Beta cerrada")}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {L(
                "Neuro Analysis is closed while the agent and private document library are being validated.",
                "Neuro Analysis está cerrado mientras se valida el agente y la biblioteca privada de documentos."
              )}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="mx-auto w-full max-w-none space-y-4 px-4 py-5 sm:px-6 md:px-10 xl:px-14">
        <header className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-end">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase text-sky-200">
                  {L("Private Investment Portal", "Portal privado de inversión")}
                </span>
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase text-emerald-200">
                  {L("Long-term / dividends", "Largo plazo / dividendos")}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">
                {L("Neuro Analysis Investment Portal", "Neuro Analysis Investment Portal")}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {L(
                  "Private research profiles for stocks, ETFs, dividend decisions, valuation, and living thesis reviews.",
                  "Profiles privados para acciones, ETFs, decisiones de dividendos, valoración y revisión de tesis viva."
                )}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.7fr)_auto_auto]">
                <input
                  value={caseTitle}
                  onChange={(event) => setCaseTitle(event.target.value)}
                  placeholder={L("Research case name", "Nombre del caso de research")}
                  className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-sky-400"
                />
                <label className="block">
                  <span className="sr-only">{L("Active ticker", "Ticker activo")}</span>
                  <div className="flex h-10 overflow-hidden rounded-lg border border-sky-500/40 bg-slate-950/70 focus-within:border-sky-300">
                    <input
                      value={focusTickerDraft}
                      disabled={Boolean(originalInvestmentThesis)}
                      onChange={(event) =>
                        setFocusTickerDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyFocusTicker();
                        }
                      }}
                      aria-label={L("Active ticker", "Ticker activo")}
                      title={originalInvestmentThesis ? L("Original thesis ticker is locked", "El ticker de la tesis original está bloqueado") : undefined}
                      className="min-w-0 flex-1 bg-transparent px-3 text-sm font-semibold text-slate-100 outline-none disabled:cursor-not-allowed disabled:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => applyFocusTicker()}
                      disabled={Boolean(originalInvestmentThesis)}
                      aria-label={L("Load company profile", "Cargar profile de compañía")}
                      title={L("Load company profile", "Cargar profile de compañía")}
                      className="inline-flex w-10 shrink-0 items-center justify-center border-l border-slate-800 text-sky-300 hover:bg-sky-400/10 hover:text-sky-100 disabled:cursor-not-allowed disabled:text-slate-600"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                  </div>
                </label>
                <button
                  type="button"
                  onClick={() => startNewResearchCase()}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/5 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {L("New case", "Nuevo caso")}
                </button>
                <button
                  type="button"
                  onClick={() => void saveResearchCase()}
                  disabled={caseSaving || !focusTicker.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-50"
                >
                  {caseSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  {caseSaving ? L("Saving", "Guardando") : L("Save case", "Guardar caso")}
                </button>
              </div>
              {caseStatus ? <p className="mt-2 text-xs text-emerald-300">{caseStatus}</p> : null}
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Readout label={L("Readiness", "Preparación")} value={`${readinessScore}%`} />
              <Readout label={L("Focus", "Foco")} value={focusTicker || "-"} />
            </div>
          </div>
        </header>

        <nav
          aria-label={L("Neuro Analysis workspaces", "Workspaces de Neuro Analysis")}
          className="flex flex-wrap gap-2 rounded-xl border border-slate-800 bg-slate-900/70 p-2"
        >
          {[
            {
              id: "daily_office" as const,
              icon: CalendarClock,
              title: L("Daily Office", "Oficina Diaria"),
            },
            {
              id: "research" as const,
              icon: Search,
              title: L("Profiles", "Profiles"),
            },
            {
              id: "committee" as const,
              icon: ShieldCheck,
              title: L("Investment Committee", "Comité de Inversión"),
            },
            {
              id: "fund_plan" as const,
              icon: BriefcaseBusiness,
              title: L("Fund Business Plan", "Business Plan del fondo"),
            },
            {
              id: "screener" as const,
              icon: BarChart3,
              title: L("Sector Screener", "Screener por sector"),
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeWorkspaceTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveWorkspaceTab(tab.id)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-emerald-400/70 bg-emerald-400/10 text-emerald-50"
                    : "border-slate-800 bg-slate-950/45 text-slate-300 hover:border-sky-400/70 hover:text-sky-100"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-emerald-300" : "text-sky-300"}`} />
                <span className="truncate">{tab.title}</span>
              </button>
            );
          })}
        </nav>

        <div className={activeWorkspaceTab === "daily_office" ? "" : "hidden"}>
          <DailyInvestmentOfficePanel isEs={isEs} />
        </div>

        <section className={activeWorkspaceTab === "committee" ? "space-y-4" : "hidden"}>
          <div className="border-y border-cyan-400/25 bg-cyan-400/5 px-4 py-5 sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                  {L("Human governance gate", "Compuerta de gobernanza humana")}
                </p>
                <h1 className="mt-2 text-xl font-semibold text-slate-50">
                  {L("Research cannot approve a portfolio position.", "Research no puede aprobar una posición de cartera.")}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {L(
                    "Neuro prepares the evidence packet. An authenticated human reviews one frozen version and records the final committee decision. APPROVED makes the proposal eligible for manual portfolio creation; it never executes or creates a position automatically.",
                    "Neuro prepara el packet de evidencia. Una persona autenticada revisa una versión congelada y registra la decisión final del comité. APPROVED hace la propuesta elegible para crear manualmente una posición; nunca ejecuta ni crea una posición automáticamente."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void createInvestmentCommitteePacket()}
                disabled={committeeGenerating || !activeCaseId || !activeReportId}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {committeeGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {committeeGenerating
                  ? L("Preparing packet", "Preparando packet")
                  : committeePackets.length
                    ? L("Create new version", "Crear nueva versión")
                    : L("Create committee packet", "Crear packet del comité")}
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Readout
                label={L("Research report", "Reporte de research")}
                value={activeReportId ? L("Frozen", "Congelado") : L("Required", "Requerido")}
                hint={activeReportId ? activeReportId.slice(0, 8) : L("Run Neuro first", "Corre Neuro primero")}
              />
              <Readout
                label={L("Packet version", "Versión del packet")}
                value={selectedCommitteePacket ? `v${selectedCommitteePacket.version}` : "-"}
                hint={selectedCommitteePacket?.generation_status ?? L("Not created", "No creado")}
              />
              <Readout
                label={L("Human decision", "Decisión humana")}
                value={selectedCommitteePacketDecision?.decision?.replaceAll("_", " ") ?? L("Pending", "Pendiente")}
                hint={selectedCommitteePacketDecision ? L("Immutable", "Inmutable") : L("AI cannot decide", "AI no puede decidir")}
              />
              <Readout
                label={L("Portfolio eligibility", "Elegibilidad de cartera")}
                value={selectedCommitteePacketDecision?.portfolio_eligible ? L("Eligible", "Elegible") : L("Blocked", "Bloqueada")}
                hint={L("No automatic execution", "Sin ejecución automática")}
              />
              <Readout
                label={L("Original thesis", "Tesis original")}
                value={originalInvestmentThesis ? L("Frozen", "Congelada") : L("Not recorded", "No registrada")}
                hint={originalInvestmentThesis ? originalInvestmentThesis.content_hash.slice(0, 10) : L("Requires real purchase", "Requiere compra real")}
              />
            </div>
            {committeeStatus ? <p className="mt-4 text-sm text-emerald-200">{committeeStatus}</p> : null}
            {committeeError ? <p className="mt-4 text-sm text-rose-200">{committeeError}</p> : null}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
            <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/75 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {L("Investment Committee Packet", "Packet del Comité de Inversión")}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-50">
                    {selectedCommitteePacket
                      ? `${selectedCommitteePacket.ticker} / v${selectedCommitteePacket.version}`
                      : L("No packet selected", "No hay packet seleccionado")}
                  </h2>
                </div>
                {committeePackets.length ? (
                  <label className="block min-w-[220px]">
                    <span className="sr-only">{L("Packet version", "Versión del packet")}</span>
                    <select
                      value={selectedCommitteePacket?.id ?? ""}
                      onChange={(event) => setSelectedCommitteePacketId(event.target.value || null)}
                      className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-300"
                    >
                      {committeePackets.map((packet) => {
                        const decision = committeeDecisions.find((item) => item.packet_id === packet.id);
                        return (
                          <option key={packet.id} value={packet.id}>
                            v{packet.version} / {decision?.decision?.replaceAll("_", " ") ?? L("PENDING", "PENDIENTE")}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                ) : null}
              </div>

              {committeeLoading ? (
                <div className="mt-8 flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {L("Loading committee record", "Cargando expediente del comité")}
                </div>
              ) : !selectedCommitteePacket ? (
                <div className="mt-6 border-y border-slate-800 py-12 text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-600" />
                  <p className="mt-3 text-sm font-semibold text-slate-200">
                    {L("Create the first packet from a saved Neuro report.", "Crea el primer packet desde un reporte Neuro guardado.")}
                  </p>
                  <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">
                    {L(
                      "The packet freezes the report, model, policy, evidence, sources, and dates reviewed by the committee.",
                      "El packet congela el reporte, modelo, policy, evidencia, fuentes y fechas revisadas por el comité."
                    )}
                  </p>
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {COMMITTEE_SECTION_KEYS.map((section) => (
                    <article
                      key={section}
                      className={`rounded-lg border border-slate-800 bg-slate-950/50 p-4 ${
                        section === "executiveSummary" || section === "investmentThesis" ? "lg:col-span-2" : ""
                      }`}
                    >
                      <h3 className="text-sm font-semibold text-slate-100">{committeeSectionLabels[section]}</h3>
                      <div className="mt-3 space-y-3">
                        {(selectedCommitteePacket.packet?.[section] ?? []).map((claim, index) => (
                          <div key={`${section}-${index}`} className="border-l border-slate-700 pl-3">
                            <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${committeeClassificationTone(claim.classification)}`}>
                              {claim.classification.replaceAll("_", " ")}
                            </span>
                            <p className="mt-2 text-sm leading-6 text-slate-300">{claim.text}</p>
                            <p className="mt-2 text-[11px] leading-5 text-slate-500">
                              {claim.sourceIds
                                .map((id) => committeeSourceMap.get(id)?.title ?? id)
                                .join(" · ")} / {new Date(claim.asOfDate).toLocaleDateString(localeTag)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
              <div className="rounded-xl border border-cyan-400/30 bg-slate-900/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
                      USER DECISION
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-slate-50">
                      {L("Authorized human review", "Revisión humana autorizada")}
                    </h2>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-cyan-300" />
                </div>

                {selectedCommitteePacketDecision ? (
                  <div className={`mt-4 rounded-lg border p-4 ${committeeDecisionTone(selectedCommitteePacketDecision.decision)}`}>
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-bold ${committeeClassificationTone("USER_DECISION")}`}>
                      USER DECISION
                    </span>
                    <p className="mt-3 text-lg font-semibold">{selectedCommitteePacketDecision.decision.replaceAll("_", " ")}</p>
                    <p className="mt-2 text-sm leading-6 opacity-85">{selectedCommitteePacketDecision.rationale}</p>
                    {selectedCommitteePacketDecision.conditions ? (
                      <p className="mt-3 border-t border-current/20 pt-3 text-xs leading-5 opacity-75">
                        {selectedCommitteePacketDecision.conditions}
                      </p>
                    ) : null}
                    <p className="mt-3 text-[11px] opacity-65">
                      {selectedCommitteePacketDecision.decision_maker_email || L("Authenticated owner", "Dueño autenticado")} / {new Date(selectedCommitteePacketDecision.decided_at).toLocaleString(localeTag)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      {COMMITTEE_DECISIONS.map((decision) => (
                        <button
                          key={decision}
                          type="button"
                          onClick={() => setCommitteeDecision(decision)}
                          disabled={decision === "APPROVED" && !selectedCommitteeResearchDossiersReady}
                          className={`min-h-10 rounded-lg border px-3 py-2 text-left text-xs font-semibold ${
                            committeeDecision === decision
                              ? committeeDecisionTone(decision)
                              : "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-cyan-400"
                          } disabled:cursor-not-allowed disabled:opacity-40`}
                        >
                          {decision.replaceAll("_", " ")}
                        </button>
                      ))}
                    </div>
                    {!selectedCommitteeResearchDossiersReady ? (
                      <p className="border-l-2 border-amber-300 pl-3 text-xs leading-5 text-amber-100/80">
                        {L(
                          "APPROVED remains blocked until this packet contains completed Business Quality, Management & Capital Allocation, Earnings Quality, and Independent Bear Case dossiers. Other human outcomes remain available.",
                          "APPROVED permanece bloqueado hasta que este packet contenga los expedientes completos de Calidad del Negocio, Gerencia y Asignación de Capital, Calidad de Ganancias y Caso Bajista Independiente. Las demás decisiones humanas siguen disponibles."
                        )}
                      </p>
                    ) : null}
                    <textarea
                      value={committeeRationale}
                      onChange={(event) => setCommitteeRationale(event.target.value)}
                      rows={4}
                      placeholder={L("Human rationale (required)", "Justificación humana (requerida)")}
                      className="w-full resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-cyan-300"
                    />
                    <textarea
                      value={committeeConditions}
                      onChange={(event) => setCommitteeConditions(event.target.value)}
                      rows={3}
                      placeholder={L("Conditions, monitoring triggers, or next evidence", "Condiciones, alertas o próxima evidencia")}
                      className="w-full resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-cyan-300"
                    />
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                      <input
                        type="checkbox"
                        checked={committeeHumanConfirmed}
                        onChange={(event) => setCommitteeHumanConfirmed(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-cyan-300"
                      />
                      <span className="text-xs leading-5 text-slate-300">
                        {L(
                          "I am the authenticated human decision maker. I reviewed this exact packet version; this is not an AI decision.",
                          "Soy la persona autenticada que toma la decisión. Revisé esta versión exacta; esto no es una decisión de AI."
                        )}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => void recordInvestmentCommitteeDecision()}
                      disabled={
                        committeeSavingDecision ||
                        !selectedCommitteePacket ||
                        (committeeDecision === "APPROVED" && !selectedCommitteeResearchDossiersReady) ||
                        !committeeHumanConfirmed ||
                        committeeRationale.trim().length < 12
                      }
                      className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {committeeSavingDecision ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {L("Record immutable decision", "Registrar decisión inmutable")}
                    </button>
                  </div>
                )}
              </div>

              {originalInvestmentThesis ? (
                <div className="rounded-xl border border-emerald-400/35 bg-slate-900/80 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                        {L("Permanent original thesis", "Tesis original permanente")}
                      </p>
                      <h2 className="mt-1 text-base font-semibold text-slate-50">
                        {originalInvestmentThesis.ticker} / {L("Purchase baseline", "Base de compra")}
                      </h2>
                    </div>
                    <LockKeyhole className="h-5 w-5 shrink-0 text-emerald-300" />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-slate-800 py-4 text-xs">
                    <div>
                      <p className="text-slate-500">{L("Purchase date", "Fecha de compra")}</p>
                      <p className="mt-1 font-semibold text-slate-100">{new Date(`${originalInvestmentThesis.purchase_date}T00:00:00`).toLocaleDateString(localeTag)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">{L("Purchase price", "Precio de compra")}</p>
                      <p className="mt-1 font-semibold text-slate-100">{formatCurrency(originalInvestmentThesis.purchase_price, localeTag)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">{L("Portfolio weight", "Peso en cartera")}</p>
                      <p className="mt-1 font-semibold text-slate-100">{Number(originalInvestmentThesis.portfolio_weight_pct).toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-slate-500">{L("Committee decision", "Decisión del comité")}</p>
                      <p className="mt-1 font-semibold text-emerald-200">APPROVED</p>
                    </div>
                  </div>
                  <details className="group mt-4 border-b border-slate-800 pb-4">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-200">
                      {L("View the exact frozen record", "Ver el registro congelado exacto")}
                    </summary>
                    <div className="mt-4 space-y-4 text-xs leading-5 text-slate-300">
                      {[
                        [L("Investment thesis", "Tesis de inversión"), originalInvestmentThesis.investment_thesis],
                        [L("Expected business developments", "Desarrollos esperados del negocio"), originalInvestmentThesis.expected_business_developments],
                        [L("Major risks", "Riesgos principales"), originalInvestmentThesis.major_risks],
                        [L("Expected catalysts", "Catalizadores esperados"), originalInvestmentThesis.expected_catalysts],
                        [L("Invalidation conditions", "Condiciones de invalidación"), originalInvestmentThesis.invalidation_conditions],
                      ].map(([label, claims]) => (
                        <div key={String(label)}>
                          <p className="font-semibold uppercase text-slate-500">{String(label)}</p>
                          <ul className="mt-1 space-y-1">
                            {(claims as OriginalInvestmentThesisRecord["investment_thesis"]).map((claim, index) => (
                              <li key={`${String(label)}-${index}`}>• {claim.text}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      <div>
                        <p className="font-semibold uppercase text-slate-500">{L("Valuation assumptions", "Supuestos de valoración")}</p>
                        <ul className="mt-1 space-y-1">
                          {(originalInvestmentThesis.valuation_assumptions?.committeeClaims ?? []).map((claim, index) => (
                            <li key={`valuation-${index}`}>• {claim.text}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold uppercase text-slate-500">{L("Key metrics to monitor", "Métricas clave a monitorear")}</p>
                        <ul className="mt-1 space-y-1">
                          {(originalInvestmentThesis.key_metrics_to_monitor ?? []).map((metric, index) => (
                            <li key={`metric-${index}`}>• {metric.metric}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold uppercase text-slate-500">{L("Supporting documents", "Documentos de soporte")}</p>
                        <ul className="mt-1 space-y-1">
                          {(originalInvestmentThesis.supporting_documents ?? []).map((source) => (
                            <li key={source.id}>• {source.title}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </details>
                  <p className="mt-3 break-all font-mono text-[10px] leading-4 text-slate-600">
                    SHA-256 {originalInvestmentThesis.content_hash}
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-slate-500">
                    {L(
                      "The original is never overwritten. Future research creates separate comparisons against this baseline.",
                      "El original nunca se sobrescribe. El research futuro crea comparaciones separadas contra esta base."
                    )}
                  </p>
                  {thesisFreezeStatus ? <p className="mt-3 text-xs text-emerald-200">{thesisFreezeStatus}</p> : null}
                </div>
              ) : selectedCommitteePacketDecision?.decision === "APPROVED" ? (
                <div className="rounded-xl border border-emerald-400/35 bg-slate-900/80 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                        {L("Record the real purchase", "Registrar la compra real")}
                      </p>
                      <h2 className="mt-1 text-base font-semibold text-slate-50">
                        {L("Freeze the original thesis", "Congelar la tesis original")}
                      </h2>
                    </div>
                    <LockKeyhole className="h-5 w-5 shrink-0 text-emerald-300" />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">
                    {L(
                      "Use the actual external purchase details. This records the position baseline; it does not place a trade.",
                      "Usa los datos reales de la compra externa. Esto registra la base de la posición; no ejecuta un trade."
                    )}
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <label className="text-xs text-slate-400">
                      {L("Purchase date", "Fecha de compra")}
                      <input
                        type="date"
                        max={new Date().toISOString().slice(0, 10)}
                        value={thesisPurchaseDate}
                        onChange={(event) => setThesisPurchaseDate(event.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-emerald-300"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      {L("Purchase price", "Precio de compra")}
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={thesisPurchasePrice}
                        onChange={(event) => setThesisPurchasePrice(event.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-emerald-300"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      {L("Portfolio weight (%)", "Peso en cartera (%)")}
                      <input
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        value={thesisPortfolioWeightPct}
                        onChange={(event) => setThesisPortfolioWeightPct(event.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-emerald-300"
                      />
                    </label>
                  </div>
                  <label className="mt-4 flex cursor-pointer items-start gap-3 border-y border-slate-800 py-3">
                    <input
                      type="checkbox"
                      checked={thesisFreezeConfirmed}
                      onChange={(event) => setThesisFreezeConfirmed(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-emerald-300"
                    />
                    <span className="text-xs leading-5 text-slate-300">
                      {L(
                        "These are the real purchase details. I understand that the original thesis and reviewed committee decision will be permanent.",
                        "Estos son los datos reales de compra. Entiendo que la tesis original y la decisión revisada del comité serán permanentes."
                      )}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => void freezeOriginalInvestmentThesis()}
                    disabled={
                      thesisFreezeLoading ||
                      !thesisFreezeConfirmed ||
                      !thesisPurchaseDate ||
                      Number(thesisPurchasePrice) <= 0 ||
                      Number(thesisPortfolioWeightPct) <= 0 ||
                      Number(thesisPortfolioWeightPct) > 100
                    }
                    className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {thesisFreezeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                    {L("Freeze original thesis", "Congelar tesis original")}
                  </button>
                  {thesisFreezeStatus ? <p className="mt-3 text-xs text-emerald-200">{thesisFreezeStatus}</p> : null}
                  {thesisFreezeError ? <p className="mt-3 text-xs text-rose-200">{thesisFreezeError}</p> : null}
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
                <h2 className="text-sm font-semibold text-slate-100">{L("Version history", "Historial de versiones")}</h2>
                <div className="mt-3 space-y-2">
                  {committeePackets.map((packet) => {
                    const decision = committeeDecisions.find((item) => item.packet_id === packet.id);
                    return (
                      <button
                        key={packet.id}
                        type="button"
                        onClick={() => setSelectedCommitteePacketId(packet.id)}
                        className={`w-full rounded-lg border p-3 text-left ${
                          selectedCommitteePacket?.id === packet.id
                            ? "border-cyan-300/60 bg-cyan-300/5"
                            : "border-slate-800 bg-slate-950/45 hover:border-slate-600"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-100">v{packet.version}</span>
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${committeeDecisionTone(decision?.decision)}`}>
                            {decision?.decision?.replaceAll("_", " ") ?? L("PENDING", "PENDIENTE")}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-500">{new Date(packet.created_at).toLocaleString(localeTag)}</p>
                      </button>
                    );
                  })}
                  {!committeePackets.length ? (
                    <p className="text-xs leading-5 text-slate-500">{L("No packet versions yet.", "Aún no hay versiones.")}</p>
                  ) : null}
                </div>
              </div>

              {selectedCommitteePacket ? (
                <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
                  <h2 className="text-sm font-semibold text-slate-100">{L("Frozen sources", "Fuentes congeladas")}</h2>
                  <div className="mt-3 max-h-72 space-y-2 overflow-auto pr-1">
                    {(selectedCommitteePacket.source_manifest ?? []).map((source) => (
                      <div key={source.id} className="rounded-lg border border-slate-800 bg-slate-950/45 p-3">
                        <p className="text-xs font-semibold text-slate-200">{source.title}</p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-500">
                          {source.sourceType.replaceAll("_", " ")} / {source.documentDate ? new Date(source.documentDate).toLocaleDateString(localeTag) : L("retrieval date", "fecha de consulta")} / {new Date(source.accessedAt).toLocaleDateString(localeTag)}
                        </p>
                        {source.url ? (
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-100"
                          >
                            {L("Open source", "Abrir fuente")} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 break-all font-mono text-[10px] leading-4 text-slate-600">
                    SHA-256 {selectedCommitteePacket.content_hash}
                  </p>
                </div>
              ) : null}
            </aside>
          </div>
        </section>

        <section className={activeWorkspaceTab === "research" ? "grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]" : "hidden"}>
          <div className="rounded-xl border border-emerald-500/25 bg-slate-900/85 p-5 shadow-lg shadow-slate-950/20">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                  {L("Investment Command Center", "Investment Command Center")}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-50">
                  {L("Portfolio, benchmark, thesis risk, and research queue", "Cartera, benchmark, riesgo de tesis y cola de research")}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMarketRefreshNonce((value) => value + 1)}
                disabled={marketLoading}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${marketLoading ? "animate-spin" : ""}`} />
                {L("Refresh market layer", "Refrescar data")}
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
              <Readout label={L("Mirror NAV", "NAV espejo")} value={formatCompactCurrency(portfolioSummary.totalValue, localeTag)} />
              <Readout label={L("Annualized", "Anualizado")} value={formatPercent(portfolioSummary.annualizedReturn, localeTag)} />
              <Readout label={configuredBenchmarkTicker} value={formatPercent(benchmarkAnnualizedReturn, localeTag)} hint={L("Benchmark", "Benchmark")} />
              <Readout label={L("Alpha", "Alpha")} value={formatPercent(portfolioAlpha, localeTag)} />
              <Readout label={L("Income yield", "Yield ingreso")} value={formatPercent(portfolioSummary.incomeYield, localeTag)} />
              <Readout label={L("Readiness", "Preparación")} value={`${readinessScore}%`} />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">{L("Top movement", "Movimiento principal")}</p>
                <div className="mt-3 space-y-2">
                  {topPortfolioMovers.length ? (
                    topPortfolioMovers.map((row) => (
                      <div key={row.id} className="grid grid-cols-[76px_1fr_auto] items-center gap-3 text-xs">
                        <span className="font-semibold text-slate-100">{row.ticker}</span>
                        <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={Number(row.pnl) >= 0 ? "h-full rounded-full bg-emerald-400" : "h-full rounded-full bg-rose-400"}
                            style={{
                              width: row.pnlPct == null
                                ? "0%"
                                : `${Math.min(100, Math.max(6, Math.abs(row.pnlPct) * 100))}%`,
                            }}
                          />
                        </div>
                        <span className={Number(row.pnl) >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}>
                          {formatPercent(row.pnlPct, localeTag)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">{L("Add real position sizes to activate movement tracking.", "Añade tamaños reales para activar tracking de movimiento.")}</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">{L("Command alerts", "Alertas del command center")}</p>
                <div className="mt-3 space-y-2">
                  {commandCenterAlerts.map((alert) => (
                    <div key={alert} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs leading-5 text-slate-300">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                      <span>{alert}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">
                  {L("Research Queue", "Cola de research")}
                </p>
                <h2 className="mt-2 text-base font-semibold">{L("What needs attention next", "Qué necesita atención")}</h2>
              </div>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-300">
                {researchQueue.length} {L("open", "abiertas")}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {researchQueue.length ? (
                researchQueue.map((row: any) => (
                  <div key={row.ticker} className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-amber-100">{row.ticker}</span>
                      <span className="text-amber-200">{(row.missing ?? []).join(", ")}</span>
                    </div>
                    <p className="mt-1 text-amber-100/75">
                      {L("Upload or index the missing evidence before treating the verdict as sufficiently supported.", "Sube o indexa la evidencia faltante antes de tratar el veredicto como suficientemente respaldado.")}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-xs text-emerald-100">
                  {L("No urgent evidence gaps detected for the active queue.", "No se detectan brechas urgentes de evidencia en la cola activa.")}
                </div>
              )}
            </div>
          </div>
        </section>

        {originalInvestmentThesis ? (
          <section className={activeWorkspaceTab === "research" ? "rounded-xl border border-emerald-400/30 bg-slate-900/85 p-4 shadow-lg shadow-slate-950/20 sm:p-5" : "hidden"}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <div className="flex items-center gap-2">
                  <LockKeyhole className="h-4 w-4 text-emerald-300" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
                    {L("Original Thesis Monitor", "Monitor de Tesis Original")}
                  </p>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-50">
                  {L(
                    "Current facts versus the purchase-date thesis",
                    "Hechos actuales versus la tesis de la fecha de compra"
                  )}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {L(
                    "The purchase baseline remains immutable. Every future Neuro run creates a separate, source-linked status review.",
                    "La base de compra permanece inmutable. Cada análisis futuro de Neuro crea una revisión separada con fuentes."
                  )}
                </p>
              </div>
              <span className={`inline-flex min-h-9 items-center self-start rounded-full border px-3 py-2 text-xs font-bold ${thesisClassificationTone(investmentThesisReview?.classification)}`}>
                {investmentThesisReview?.classification?.replaceAll("_", " ") ?? L("RUN CURRENT REVIEW", "CORRE REVISIÓN ACTUAL")}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Readout label={L("Original frozen", "Original congelada")} value={new Date(originalInvestmentThesis.created_at).toLocaleDateString(localeTag)} hint={originalInvestmentThesis.content_hash.slice(0, 10)} />
              <Readout label={L("Purchase price", "Precio de compra")} value={formatCurrency(originalInvestmentThesis.purchase_price, localeTag)} hint={originalInvestmentThesis.purchase_date} />
              <Readout label={L("Original weight", "Peso original")} value={`${Number(originalInvestmentThesis.portfolio_weight_pct).toFixed(2)}%`} />
              <Readout label={L("Review history", "Historial de revisiones")} value={investmentThesisReviewHistory.length} hint={L("Append-only", "Solo añade")}/>
            </div>
            {investmentThesisReviewHistory.length ? (
              <div className="mt-4 flex flex-wrap gap-2 border-y border-slate-800 py-3">
                {investmentThesisReviewHistory.slice(0, 8).map((review) => {
                  const linkedReport = reports.find((report) => report.id === review.report_id);
                  return (
                    <button
                      key={review.id}
                      type="button"
                      onClick={() => {
                        if (linkedReport) openSavedReport(linkedReport);
                        setInvestmentThesisReview(thesisReviewFromRecord(review, originalInvestmentThesis));
                      }}
                      className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${thesisClassificationTone(review.classification)}`}
                      title={review.summary}
                    >
                      {new Date(review.created_at).toLocaleDateString(localeTag)} / {review.classification.replace("THESIS_", "").replaceAll("_", " ")}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {investmentThesisReview ? (
              <div className="mt-5 border-t border-slate-800 pt-5">
                <p className="text-sm leading-6 text-slate-200">{investmentThesisReview.summary}</p>
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  {L(
                    "Thesis-status classification only. It is not an automatic trading decision.",
                    "Es solo una clasificación del estado de la tesis. No es una decisión automática de trading."
                  )}
                </p>
                {investmentThesisReview.classificationEvidence.length ? (
                  <div className="mt-4 border-l-2 border-cyan-400 pl-4">
                    <p className="text-[11px] font-semibold uppercase text-cyan-200">
                      {L("Classification evidence", "Evidencia de la clasificación")}
                    </p>
                    <div className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
                      {investmentThesisReview.classificationEvidence.map((evidence, index) => (
                        <p key={`classification-evidence-${index}`}>
                          {evidence.statement} {evidence.sourceUrl ? (
                            <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-cyan-300 hover:text-cyan-100">
                              [{evidence.sourceLabel} / {evidence.sourceDate ?? L("date unavailable", "fecha no disponible")}]
                            </a>
                          ) : (
                            <span className="text-slate-600">[{evidence.sourceLabel} / {evidence.sourceDate ?? L("date unavailable", "fecha no disponible")}]</span>
                          )}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-5 space-y-3">
                  {investmentThesisReview.changes.map((change, index) => (
                    <article key={`${change.field}-${index}`} className="border-y border-slate-800 bg-slate-950/35 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase text-slate-400">{change.field.replaceAll("_", " ")}</p>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
                          change.effect === "strengthens"
                            ? "border-emerald-400/40 text-emerald-200"
                            : change.effect === "weakens"
                              ? "border-amber-400/40 text-amber-200"
                              : change.effect === "invalidates"
                                ? "border-rose-400/40 text-rose-200"
                                : "border-slate-700 text-slate-300"
                        }`}>
                          {change.effect.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase text-slate-600">{L("Original expectation", "Expectativa original")}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-300">{change.originalExpectation}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase text-slate-600">{L("Current documented fact", "Hecho actual documentado")}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-200">{change.currentFact}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-400">{change.explanation}</p>
                      {change.matchedInvalidationCondition ? (
                        <p className="mt-3 border-l-2 border-rose-400 pl-3 text-xs leading-5 text-rose-100">
                          {L("Matched original invalidation condition", "Condición original de invalidación identificada")}: {change.matchedInvalidationCondition}
                        </p>
                      ) : null}
                      <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                        {change.currentEvidence.map((evidence, evidenceIndex) => (
                          <div key={`${change.field}-evidence-${evidenceIndex}`} className="flex flex-col gap-1 text-[11px] leading-5 text-slate-500 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                            <span>{evidence.statement}</span>
                            {evidence.sourceUrl ? (
                              <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-semibold text-cyan-300 hover:text-cyan-100">
                                {evidence.sourceLabel} / {evidence.sourceDate ?? L("date unavailable", "fecha no disponible")}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="shrink-0 text-slate-600">
                                {evidence.sourceLabel} / {evidence.sourceDate ?? L("date unavailable", "fecha no disponible")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                  {!investmentThesisReview.changes.length ? (
                    <p className="border-y border-slate-800 py-5 text-sm text-slate-500">
                      {L(
                        "No evidence-backed change could be established in this review.",
                        "No se pudo establecer un cambio respaldado por evidencia en esta revisión."
                      )}
                    </p>
                  ) : null}
                </div>

                {investmentThesisReview.missingEvidence.length ? (
                  <div className="mt-5 border-l-2 border-amber-300 pl-4">
                    <p className="text-xs font-semibold uppercase text-amber-200">{L("Evidence still needed", "Evidencia pendiente")}</p>
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100/75">
                      {investmentThesisReview.missingEvidence.map((item, index) => <li key={`missing-${index}`}>• {item}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-3 border-y border-slate-800 py-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-slate-400">
                  {L(
                    "Run Neuro with current filings and market evidence to create the first comparison.",
                    "Corre Neuro con filings y evidencia actual para crear la primera comparación."
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => void autoBuildEvidenceAndRun()}
                  disabled={autoRunLoading || agentLoading}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-50"
                >
                  {autoRunLoading || agentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {L("Run thesis review", "Correr revisión de tesis")}
                </button>
              </div>
            )}
          </section>
        ) : null}

        {originalInvestmentThesis ? (
          <section className={activeWorkspaceTab === "research" ? "rounded-xl border border-cyan-400/25 bg-slate-900/85 p-4 shadow-lg shadow-slate-950/20 sm:p-5" : "hidden"}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-cyan-300" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                    {L("Position Exit Review", "Revisión de Salida de Posición")}
                  </p>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-slate-50">
                  {L("What changed since the original decision?", "¿Qué cambió desde la decisión original?")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {L(
                    "Before a position is reconsidered, Neuro compares the frozen thesis, valuation, and financial expectations with current documented evidence. Only a human can decide what to do next.",
                    "Antes de reconsiderar una posición, Neuro compara la tesis, valoración y expectativas financieras congeladas con evidencia actual documentada. Solo una persona decide qué hacer después."
                  )}
                </p>
              </div>
              <span className={`inline-flex min-h-9 max-w-full items-center self-start rounded-full border px-3 py-2 text-xs font-bold ${positionExitStatusTone(positionExitReview?.status)}`}>
                {positionExitReview?.status.replaceAll("_", " ") ?? L("RUN CURRENT REVIEW", "CORRE REVISIÓN ACTUAL")}
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Readout
                label={L("Primary reason", "Motivo principal")}
                value={positionExitReasonLabel(positionExitReview?.primaryReason, isEs)}
              />
              <Readout
                label={L("Purchase price", "Precio de compra")}
                value={formatCurrency(originalInvestmentThesis.purchase_price, localeTag)}
                hint={originalInvestmentThesis.purchase_date}
              />
              <Readout
                label={L("Current price", "Precio actual")}
                value={
                  positionExitReview?.priceMovementAssessment.currentPrice != null
                    ? formatCurrency(positionExitReview.priceMovementAssessment.currentPrice, localeTag)
                    : L("Unavailable", "No disponible")
                }
                hint={
                  positionExitReview?.priceMovementAssessment.changePct != null
                    ? `${positionExitReview.priceMovementAssessment.changePct >= 0 ? "+" : ""}${positionExitReview.priceMovementAssessment.changePct.toFixed(1)}%`
                    : undefined
                }
              />
              <Readout
                label={L("Review history", "Historial de revisiones")}
                value={positionExitReviewHistory.length}
                hint={L("Append-only", "Solo añade")}
              />
            </div>

            {positionExitReviewHistory.length ? (
              <div className="mt-4 flex flex-wrap gap-2 border-y border-slate-800 py-3">
                {positionExitReviewHistory.slice(0, 8).map((review) => {
                  const linkedReport = reports.find((report) => report.id === review.report_id);
                  return (
                    <button
                      key={review.id}
                      type="button"
                      onClick={() => {
                        if (linkedReport) openSavedReport(linkedReport);
                        setPositionExitReview(positionExitReviewFromRecord(review, originalInvestmentThesis));
                      }}
                      className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold ${positionExitStatusTone(review.review_status)}`}
                      title={review.summary}
                    >
                      {new Date(review.created_at).toLocaleDateString(localeTag)} / {review.primary_reason ? positionExitReasonLabel(review.primary_reason, isEs) : review.review_status.replaceAll("_", " ")}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {positionExitReview ? (
              <div className="mt-5 border-t border-slate-800 pt-5">
                <p className="text-sm leading-6 text-slate-200">{positionExitReview.summary}</p>
                <div className="mt-3 border-l-2 border-cyan-400 pl-4">
                  <p className="text-xs font-semibold text-cyan-100">
                    {positionExitReview.priceMovementAssessment.conclusion}
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    {L(
                      "Price movement is displayed as context only. It cannot classify thesis success, thesis failure, or an exit reason by itself.",
                      "El movimiento de precio se muestra solo como contexto. Por sí solo no puede clasificar éxito, fracaso de tesis ni un motivo de salida."
                    )}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-1 border-y border-slate-800 lg:grid-cols-3 lg:divide-x lg:divide-slate-800">
                  {positionExitReview.comparisons.map((comparison) => {
                    const comparisonLabel =
                      comparison.type === "ORIGINAL_THESIS_VS_CURRENT_EVIDENCE"
                        ? L("Thesis vs evidence", "Tesis vs evidencia")
                        : comparison.type === "ORIGINAL_VALUATION_VS_CURRENT_VALUATION"
                          ? L("Valuation vs valuation", "Valoración vs valoración")
                          : L("Expectations vs results", "Expectativas vs resultados");
                    return (
                      <article key={comparison.type} className="px-0 py-4 lg:px-4 lg:first:pl-0 lg:last:pr-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-bold uppercase text-cyan-200">{comparisonLabel}</p>
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
                            comparison.materiality === "material"
                              ? "border-amber-400/40 text-amber-200"
                              : comparison.materiality === "not_material"
                                ? "border-emerald-400/40 text-emerald-200"
                                : "border-slate-700 text-slate-400"
                          }`}>
                            {comparison.materiality.replaceAll("_", " ").toUpperCase()}
                          </span>
                        </div>
                        <p className="mt-3 text-[10px] font-semibold uppercase text-slate-600">{L("Original", "Original")}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{comparison.originalBaseline}</p>
                        <p className="mt-3 text-[10px] font-semibold uppercase text-slate-600">{L("Current", "Actual")}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-300">{comparison.currentObservation}</p>
                        <p className="mt-3 text-xs font-semibold leading-5 text-slate-200">{comparison.change}</p>
                        {comparison.uncertainty ? (
                          <p className="mt-2 text-[11px] leading-5 text-slate-500">
                            {L("Uncertainty", "Incertidumbre")}: {comparison.uncertainty}
                          </p>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                {positionExitReview.whatChanged.length ? (
                  <div className="mt-5 space-y-3">
                    {positionExitReview.whatChanged.map((change, index) => (
                      <article key={`${change.reason}-${index}`} className="border-y border-slate-800 bg-slate-950/35 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase text-slate-300">
                            {positionExitReasonLabel(change.reason, isEs)}
                          </p>
                          <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
                            change.materiality === "material"
                              ? "border-amber-400/40 text-amber-200"
                              : change.materiality === "not_material"
                                ? "border-emerald-400/40 text-emerald-200"
                                : "border-slate-700 text-slate-400"
                          }`}>
                            {change.materiality.replaceAll("_", " ").toUpperCase()}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-100">{change.change}</p>
                        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-slate-600">{L("Original baseline", "Base original")}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">{change.originalBaseline}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-slate-600">{L("Current evidence", "Evidencia actual")}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-300">{change.currentObservation}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-400">{change.explanation}</p>
                        {change.matchedInvalidationCondition ? (
                          <p className="mt-3 border-l-2 border-rose-400 pl-3 text-xs leading-5 text-rose-100">
                            {L("Matched original invalidation condition", "Condición original de invalidación identificada")}: {change.matchedInvalidationCondition}
                          </p>
                        ) : null}
                        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                          {change.currentEvidence.map((evidence, evidenceIndex) => (
                            <div key={`${change.reason}-evidence-${evidenceIndex}`} className="flex flex-col gap-1 text-[11px] leading-5 text-slate-500 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                              <span>{evidence.statement}</span>
                              {evidence.sourceUrl ? (
                                <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-semibold text-cyan-300 hover:text-cyan-100">
                                  {evidence.sourceLabel} / {evidence.sourceDate ?? L("date unavailable", "fecha no disponible")}
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              ) : (
                                <span className="shrink-0 text-slate-600">
                                  {evidence.sourceLabel} / {evidence.sourceDate ?? L("date unavailable", "fecha no disponible")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 border-y border-slate-800 py-5 text-sm text-slate-500">
                    {L(
                      "No evidence-backed reason to reconsider the position was established.",
                      "No se estableció un motivo respaldado por evidencia para reconsiderar la posición."
                    )}
                  </p>
                )}

                {positionExitReview.missingEvidence.length ? (
                  <div className="mt-5 border-l-2 border-amber-300 pl-4">
                    <p className="text-xs font-semibold uppercase text-amber-200">{L("Evidence still needed", "Evidencia pendiente")}</p>
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100/75">
                      {positionExitReview.missingEvidence.map((item, index) => <li key={`exit-missing-${index}`}>• {item}</li>)}
                    </ul>
                  </div>
                ) : null}

                <p className="mt-5 border-t border-slate-800 pt-4 text-xs font-semibold text-slate-500">
                  {L(
                    "This review cannot approve or execute an exit. Human decision required.",
                    "Esta revisión no puede aprobar ni ejecutar una salida. Requiere decisión humana."
                  )}
                </p>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-3 border-y border-slate-800 py-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-slate-400">
                  {L(
                    "Run Neuro with current filings, valuation, and portfolio context to determine what changed.",
                    "Corre Neuro con filings, valoración y contexto de cartera actuales para determinar qué cambió."
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => void autoBuildEvidenceAndRun()}
                  disabled={autoRunLoading || agentLoading}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-cyan-400/50 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
                >
                  {autoRunLoading || agentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {L("Run exit review", "Correr revisión de salida")}
                </button>
              </div>
            )}
          </section>
        ) : null}

        <section className={activeWorkspaceTab === "research" ? "rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-5" : "hidden"}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <BriefcaseBusiness className="h-4 w-4 text-emerald-300" />
                <h2 className="text-base font-semibold">{L("Portfolio Monitor", "Monitor de cartera")}</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {L(
                  "Manual mirror of positions bought outside the platform. Neuro uses this for portfolio context, concentration, P&L, annualized return, and thesis review.",
                  "Réplica manual de posiciones compradas fuera de la plataforma. Neuro usa esto para contexto de cartera, concentración, P&L, retorno anualizado y revisión de tesis."
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => addPortfolioHolding()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              {L("Add position", "Añadir posición")}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Readout label={L("Portfolio value", "Valor cartera")} value={formatCompactCurrency(portfolioSummary.totalValue, localeTag)} />
            <Readout
              label={L("Unrealized P&L", "P&L no realizado")}
              value={formatCompactCurrency(portfolioSummary.totalPnl, localeTag)}
              hint={formatPercent(portfolioSummary.totalPnlPct, localeTag)}
            />
            <Readout
              label={L("Annualized return", "Retorno anualizado")}
              value={formatPercent(portfolioSummary.annualizedReturn, localeTag)}
              hint={L("Cost-weighted", "Ponderado por costo")}
            />
            <Readout
              label={L("Income yield", "Yield ingreso")}
              value={formatPercent(portfolioSummary.incomeYield, localeTag)}
              hint={L("Weighted by value", "Ponderado por valor")}
            />
            <Readout
              label={L("Largest position", "Mayor posición")}
              value={portfolioSummary.largestPosition?.ticker ?? "-"}
              hint={formatPercent(portfolioSummary.largestPosition?.weight ?? null, localeTag)}
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-slate-950/60 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">{L("Ticker", "Ticker")}</th>
                  <th className="px-3 py-2">{L("Shares", "Acciones")}</th>
                  <th className="px-3 py-2">{L("Avg cost", "Costo prom.")}</th>
                  <th className="px-3 py-2">{L("Opened", "Entrada")}</th>
                  <th className="px-3 py-2">{L("Last price", "Último precio")}</th>
                  <th className="px-3 py-2">{L("Value", "Valor")}</th>
                  <th className="px-3 py-2">{L("P&L", "P&L")}</th>
                  <th className="px-3 py-2">{L("Annualized", "Anualizado")}</th>
                  <th className="px-3 py-2">{L("Weight", "Peso")}</th>
                  <th className="px-3 py-2" aria-label={L("Actions", "Acciones")} />
                </tr>
              </thead>
              <tbody>
                {portfolioPositions.map((position) => (
                  <tr key={position.id} className="border-t border-slate-800">
                    <td className="px-3 py-2">
                      <input
                        value={position.ticker}
                        onChange={(event) => updatePortfolioHolding(position.id, { ticker: event.target.value })}
                        className="h-9 w-24 rounded-lg border border-slate-800 bg-slate-950/70 px-2 font-semibold text-slate-100 outline-none focus:border-sky-400"
                      />
                      <p className="mt-1 max-w-[180px] truncate text-[11px] text-slate-500">{position.companyName}</p>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={position.shares}
                        onChange={(event) => updatePortfolioHolding(position.id, { shares: toNumber(event.target.value) })}
                        className="h-9 w-24 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-slate-100 outline-none focus:border-sky-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={position.averageCost ?? ""}
                        onChange={(event) => updatePortfolioHolding(position.id, { averageCost: optionalNumber(event.target.value) })}
                        placeholder={DATA_NOT_AVAILABLE}
                        className="h-9 w-28 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-slate-100 outline-none focus:border-sky-400"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={position.openedAt || ""}
                        onChange={(event) => updatePortfolioHolding(position.id, { openedAt: event.target.value })}
                        className="h-9 w-36 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-slate-100 outline-none focus:border-sky-400"
                      />
                    </td>
                    <td className="px-3 py-2 font-semibold text-slate-100">{formatCurrency(position.currentPrice, localeTag)}</td>
                    <td className="px-3 py-2 text-slate-300">{formatCompactCurrency(position.value, localeTag)}</td>
                    <td className={`px-3 py-2 font-semibold ${position.pnl == null ? "text-slate-400" : position.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {formatCompactCurrency(position.pnl, localeTag)}
                      <span className="ml-1 text-xs text-slate-500">{formatPercent(position.pnlPct, localeTag)}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-300">{formatPercent(position.annualizedReturn, localeTag)}</td>
                    <td className="px-3 py-2 text-slate-300">{formatPercent(position.weight ?? null, localeTag)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (originalInvestmentThesis && position.ticker !== originalInvestmentThesis.ticker) {
                              startNewResearchCase(position.ticker);
                              return;
                            }
                            setFocusTicker(position.ticker);
                            setFocusTickerDraft(position.ticker);
                            setResearchGoal(defaultResearchGoal(isEs));
                          }}
                          className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-sky-400 hover:text-sky-200"
                          aria-label={L("Research position", "Investigar posición")}
                        >
                          <Search className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePortfolioHolding(position.id)}
                          className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-200"
                          aria-label={L("Remove position", "Quitar posición")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {portfolioPositions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-sm text-slate-500">
                      {L("Add positions to activate portfolio monitoring.", "Añade posiciones para activar el monitoreo de cartera.")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className={activeWorkspaceTab === "research" ? "rounded-xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20" : "hidden"}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-sky-300" />
                <h2 className="text-base font-semibold">{L("Portfolio X-Ray", "Portfolio X-Ray")}</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {L(
                  "Look-through style view of sector exposure, instrument mix, concentration, income, and ETF overlap.",
                  "Vista tipo look-through de exposición por sector, mezcla de instrumentos, concentración, ingreso y overlap de ETFs."
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs lg:min-w-[360px]">
              <Readout label={L("Top 3 weight", "Peso top 3")} value={formatPercent(engineSnapshot?.portfolio?.concentration?.top3Weight, localeTag)} />
              <Readout label={L("HHI", "HHI")} value={formatCompactNumber(engineSnapshot?.portfolio?.concentration?.hhi, localeTag)} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">{L("Sector / category exposure", "Exposición sector / categoría")}</p>
              <div className="mt-4 space-y-3">
                {portfolioXray.sectorRows.length ? (
                  portfolioXray.sectorRows.slice(0, 7).map((row) => {
                    const weight =
                      portfolioSummary.totalValue != null && portfolioSummary.totalValue > 0
                        ? row.value / portfolioSummary.totalValue
                        : null;
                    return (
                      <div key={row.name}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-slate-300">{row.name}</span>
                          <span className="font-semibold text-slate-100">{formatPercent(weight, localeTag)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-sky-400" style={{ width: `${weight == null ? 0 : Math.min(100, weight * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">{L("Add positions to see exposure.", "Añade posiciones para ver exposición.")}</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">{L("Instrument mix", "Mezcla de instrumentos")}</p>
              <div className="mt-4 space-y-3">
                {portfolioXray.instrumentRows.length ? (
                  portfolioXray.instrumentRows.map((row) => {
                    const weight =
                      portfolioSummary.totalValue != null && portfolioSummary.totalValue > 0
                        ? row.value / portfolioSummary.totalValue
                        : null;
                    return (
                      <div key={row.name} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-100">{row.name}</span>
                          <span className="text-sm font-semibold text-emerald-300">{formatPercent(weight, localeTag)}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{formatCompactCurrency(row.value, localeTag)}</p>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-slate-500">{L("Instrument classification will appear after market data loads.", "La clasificación aparecerá cuando cargue la data de mercado.")}</p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">{L("ETF overlap / look-through", "Overlap ETF / look-through")}</p>
              <div className="mt-4 space-y-2">
                {portfolioXray.overlapRows.length ? (
                  portfolioXray.overlapRows.map((row) => (
                    <div key={row.symbol} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-semibold text-slate-100">{row.symbol}</span>
                        <span className="font-semibold text-slate-100">{formatPercent(row.weight, localeTag)}</span>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-slate-500">{row.name}</p>
                      <p className="mt-1 text-[11px] text-slate-600">{row.funds.join(" / ")}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-6 text-slate-500">
                    {L(
                      "ETF holding overlap will appear when ETF holdings are available from market providers.",
                      "El overlap de holdings aparecerá cuando los proveedores traigan holdings de ETFs."
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {activeWorkspaceTab === "research" ? (
          <PortfolioExposureMapPanel
            map={portfolioExposureMap}
            isEs={isEs}
            loading={autoRunLoading || agentLoading}
            onRun={() => void autoBuildEvidenceAndRun()}
          />
        ) : null}

        {activeWorkspaceTab === "research" ? (
          <MacroContextPanel
            report={macroContext}
            isEs={isEs}
            loading={autoRunLoading || agentLoading}
            onRun={() => void autoBuildEvidenceAndRun()}
          />
        ) : null}

        {activeWorkspaceTab === "research" ? (
          <PerformanceAttributionPanel
            report={performanceAttribution}
            isEs={isEs}
            loading={performanceAttributionLoading}
            error={performanceAttributionError}
            onRun={() => void runPerformanceAttribution()}
          />
        ) : null}

        {activeWorkspaceTab === "research" ? (
          <CapitalAllocationDashboardPanel
            dashboard={capitalAllocationDashboard}
            availableCapital={availableCapital}
            isEs={isEs}
            loading={autoRunLoading || agentLoading}
            onAvailableCapitalChange={(value) => {
              setAvailableCapital(value);
              setCapitalAllocationDashboard(null);
            }}
            onRun={() => void autoBuildEvidenceAndRun()}
          />
        ) : null}

        <section
          className={
            activeWorkspaceTab !== "research"
              ? "space-y-5"
              : "grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]"
          }
        >
            <div className="space-y-5">
            <div className={`${activeWorkspaceTab === "fund_plan" ? "" : "hidden"} space-y-5`}>
              <CapitalAccountsPanel isEs={isEs} />

              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-4xl">
                    <div className="flex items-center gap-2">
                      <BriefcaseBusiness className="h-4 w-4 text-emerald-300" />
                      <h2 className="text-base font-semibold">{L("Fund Business Plan", "Business Plan del fondo")}</h2>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {L(
                        "Model the fund with a monthly capital goal and annual compound return. Shareholders can withdraw a percentage of their annual profit share or reinvest it back into the fund projection.",
                        "Modela el fondo con una meta mensual de capital y retorno anual compuesto. Los accionistas pueden retirar un porcentaje de su ganancia anual o reinvertirla dentro de la proyección del fondo."
                      )}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs xl:min-w-[420px]">
                    <Readout
                      label={L("Year 30 value", "Valor año 30")}
                      value={formatCompactCurrency(fundProjection.at(-1)?.endValue, localeTag)}
                      hint={L("After payouts", "Luego de pagos")}
                    />
                    <Readout
                      label={L("Cumulative payouts", "Pagos acumulados")}
                      value={formatCompactCurrency(fundProjection.at(-1)?.cumulativePayouts, localeTag)}
                      hint={L("Annual withdrawals", "Retiros anuales")}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Initial fund capital", "Capital inicial")}</span>
                    <input
                      type="number"
                      value={fundInitialCapital}
                      onChange={(event) => setFundInitialCapital(toNumber(event.target.value))}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Monthly goal", "Meta mensual")}</span>
                    <input
                      type="number"
                      value={fundMonthlyGoal}
                      onChange={(event) => setFundMonthlyGoal(toNumber(event.target.value))}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Annual return %", "Retorno anual %")}</span>
                    <input
                      type="number"
                      value={fundAnnualReturnPct}
                      onChange={(event) => setFundAnnualReturnPct(toNumber(event.target.value))}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Shareholder view year", "Año de vista")}</span>
                    <select
                      value={fundSelectedYear}
                      onChange={(event) => setFundSelectedYear(toNumber(event.target.value))}
                      className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                    >
                      {[1, 5, 10, 15, 20, 25, 30].map((year) => (
                        <option key={year} value={year}>
                          {L(`Year ${year}`, `Año ${year}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {shareholderOwnershipTotal > 100 ? (
                  <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                    {L(
                      "Shareholder ownership is above 100%. Payouts may exceed the modeled profit allocation.",
                      "La participación de accionistas está por encima de 100%. Los pagos pueden exceder la asignación de ganancias modelada."
                    )}
                  </p>
                ) : null}
              </section>

              <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_0.75fr]">
                <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-100">{L("Fund growth projection", "Proyección de crecimiento del fondo")}</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {L("Annual compounding, annual payouts, monthly capital goal added each year.", "Interés anual compuesto, pagos anuales y meta mensual añadida cada año.")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsLineChart data={fundProjection}>
                        <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                        <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(value) => formatCompactCurrency(Number(value), localeTag)} />
                        <Tooltip
                          formatter={(value: any) => formatCurrency(Number(value), localeTag)}
                          labelFormatter={(value) => L(`Year ${value}`, `Año ${value}`)}
                          labelStyle={{ color: "#0f172a" }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="endValue" name={L("Fund value", "Valor fondo")} stroke="#34d399" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="cumulativePayouts" name={L("Cumulative payouts", "Pagos acumulados")} stroke="#fbbf24" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="cumulativeContributions" name={L("Contributions", "Contribuciones")} stroke="#38bdf8" strokeWidth={2} dot={false} />
                      </RechartsLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
                  <h3 className="text-sm font-semibold text-slate-100">{L("Milestones", "Milestones")}</h3>
                  <div className="mt-4 space-y-3">
                    {fundMilestones.map((row) => (
                      <div key={row.year} className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-100">{L(`Year ${row.year}`, `Año ${row.year}`)}</p>
                          <p className="text-sm font-semibold text-emerald-300">{formatCompactCurrency(row.endValue, localeTag)}</p>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                          <span>{L("Annual payouts", "Pagos anuales")}: {formatCompactCurrency(row.shareholderPayouts, localeTag)}</span>
                          <span>{L("Gross return", "Retorno bruto")}: {formatCompactCurrency(row.grossReturn, localeTag)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{L("Shareholder annual payout plan", "Plan anual de pagos a accionistas")}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {L(
                        "Choose who withdraws annually and what percentage of that shareholder's annual profit share is paid out. Reinvested profit stays in the fund projection.",
                        "Escoge quién retira anualmente y qué porcentaje de su parte de ganancia anual se paga. La ganancia reinvertida se queda en la proyección del fondo."
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addFundShareholder}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {L("Add shareholder", "Añadir accionista")}
                  </button>
                </div>

                <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
                  <table className="w-full min-w-[980px] text-left text-sm">
                    <thead className="bg-slate-950/55 text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2">{L("Shareholder", "Accionista")}</th>
                        <th className="px-3 py-2">{L("Ownership %", "Participación %")}</th>
                        <th className="px-3 py-2">{L("Annual policy", "Política anual")}</th>
                        <th className="px-3 py-2">{L("Withdraw %", "Retiro %")}</th>
                        <th className="px-3 py-2">{L("Projected payout", "Pago proyectado")}</th>
                        <th className="px-3 py-2">{L("Reinvested", "Reinvertido")}</th>
                        <th className="px-3 py-2" aria-label={L("Actions", "Acciones")} />
                      </tr>
                    </thead>
                    <tbody>
                      {fundShareholders.map((shareholder) => {
                        const projectionRow = selectedFundProjection?.shareholderRows.find(
                          (row) => row.shareholderId === shareholder.id
                        );
                        return (
                          <tr key={shareholder.id} className="border-t border-slate-800">
                            <td className="px-3 py-2">
                              <input
                                value={shareholder.name}
                                onChange={(event) => updateFundShareholder(shareholder.id, { name: event.target.value })}
                                className="h-9 w-44 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-slate-100 outline-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                value={shareholder.ownershipPct}
                                onChange={(event) => updateFundShareholder(shareholder.id, { ownershipPct: toNumber(event.target.value) })}
                                className="h-9 w-24 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-slate-100 outline-none"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={shareholder.payoutMode}
                                onChange={(event) =>
                                  updateFundShareholder(shareholder.id, {
                                    payoutMode: event.target.value === "withdraw" ? "withdraw" : "reinvest",
                                    annualWithdrawalPct:
                                      event.target.value === "withdraw"
                                        ? shareholder.annualWithdrawalPct || 100
                                        : 0,
                                  })
                                }
                                className="h-9 w-36 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-slate-100 outline-none"
                              >
                                <option value="reinvest">{L("Reinvest", "Reinvertir")}</option>
                                <option value="withdraw">{L("Withdraw", "Retirar")}</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                value={shareholder.annualWithdrawalPct}
                                disabled={shareholder.payoutMode === "reinvest"}
                                onChange={(event) => updateFundShareholder(shareholder.id, { annualWithdrawalPct: toNumber(event.target.value) })}
                                className="h-9 w-24 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-slate-100 outline-none disabled:opacity-50"
                              />
                            </td>
                            <td className="px-3 py-2 font-semibold text-amber-300">
                              {formatCurrency(projectionRow?.payout, localeTag)}
                            </td>
                            <td className="px-3 py-2 text-emerald-300">
                              {formatCurrency(projectionRow?.reinvested, localeTag)}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => removeFundShareholder(shareholder.id)}
                                className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-200"
                                aria-label={L("Remove shareholder", "Eliminar accionista")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedFundProjection ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Readout label={L("Selected year", "Año seleccionado")} value={selectedFundProjection.year} />
                    <Readout label={L("Fund value", "Valor fondo")} value={formatCompactCurrency(selectedFundProjection.endValue, localeTag)} />
                    <Readout label={L("Annual payouts", "Pagos anuales")} value={formatCompactCurrency(selectedFundProjection.shareholderPayouts, localeTag)} />
                    <Readout label={L("Annual reinvested", "Reinvertido anual")} value={formatCompactCurrency(selectedFundProjection.reinvestedProfit, localeTag)} />
                  </div>
                ) : null}
              </section>

              <section className="rounded-xl border border-emerald-500/25 bg-slate-900/75 p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-emerald-300" />
                      <h3 className="text-sm font-semibold text-slate-100">{L("Investor Reporting Packet", "Paquete de reporte para inversionistas")}</h3>
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                      {L(
                        "A Morningstar-style fund summary for NAV, annual payouts, reinvestment policy, ownership, and long-horizon projections.",
                        "Resumen estilo Morningstar para NAV, pagos anuales, política de reinversión, participación y proyecciones de largo plazo."
                      )}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs lg:min-w-[420px]">
                    <Readout label={L("Ownership assigned", "Participación asignada")} value={formatPercent(shareholderOwnershipTotal / 100, localeTag)} />
                    <Readout label={L("Selected year NAV", "NAV año seleccionado")} value={formatCompactCurrency(selectedFundProjection?.endValue, localeTag)} />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">{L("Report summary", "Resumen del reporte")}</p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">{L("Initial capital", "Capital inicial")}</span>
                        <span className="font-semibold text-slate-100">{formatCompactCurrency(fundInitialCapital, localeTag)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">{L("Annual contribution goal", "Meta anual de aportes")}</span>
                        <span className="font-semibold text-slate-100">{formatCompactCurrency(fundMonthlyGoal * 12, localeTag)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">{L("Modeled annual return", "Retorno anual modelado")}</span>
                        <span className="font-semibold text-slate-100">{formatPercent(fundAnnualReturnPct / 100, localeTag)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">{L("Year 30 NAV", "NAV año 30")}</span>
                        <span className="font-semibold text-emerald-300">{formatCompactCurrency(fundProjection.at(-1)?.endValue, localeTag)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-400">{L("Year 30 cumulative payouts", "Pagos acumulados año 30")}</span>
                        <span className="font-semibold text-amber-300">{formatCompactCurrency(fundProjection.at(-1)?.cumulativePayouts, localeTag)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead className="bg-slate-950/55 text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2">{L("Investor", "Inversionista")}</th>
                          <th className="px-3 py-2">{L("Ownership", "Participación")}</th>
                          <th className="px-3 py-2">{L("Policy", "Política")}</th>
                          <th className="px-3 py-2">{L("Selected payout", "Pago año seleccionado")}</th>
                          <th className="px-3 py-2">{L("Selected reinvested", "Reinvertido seleccionado")}</th>
                          <th className="px-3 py-2">{L("Year 30 payout", "Pago año 30")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {investorReportingRows.map((row) => (
                          <tr key={row.id} className="border-t border-slate-800">
                            <td className="px-3 py-2 font-semibold text-slate-100">{row.name || "Investor"}</td>
                            <td className="px-3 py-2 text-slate-300">{formatPercent(row.ownershipPct / 100, localeTag)}</td>
                            <td className="px-3 py-2 text-slate-300">{row.policy}</td>
                            <td className="px-3 py-2 font-semibold text-amber-300">{formatCompactCurrency(row.selectedPayout, localeTag)}</td>
                            <td className="px-3 py-2 font-semibold text-emerald-300">{formatCompactCurrency(row.selectedReinvested, localeTag)}</td>
                            <td className="px-3 py-2 text-slate-300">{formatCompactCurrency(row.year30Payout, localeTag)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>

            <div className={`${activeWorkspaceTab === "screener" ? "" : "hidden"} rounded-xl border border-slate-800 bg-slate-900/75 p-5`}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-4xl">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-sky-300" />
                    <h2 className="text-base font-semibold">{L("Deterministic Sector Screener", "Screener determinístico por sector")}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "Apply explicit financial criteria to a sector universe. Every rule reports PASS, FAIL, or DATA NOT AVAILABLE without an investment score.",
                      "Aplica criterios financieros explícitos a un universo sectorial. Cada regla muestra PASS, FAIL o DATA NOT AVAILABLE sin crear un score de inversión."
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:min-w-[360px]">
                  <Readout label={L("Market", "Mercado")} value="US" />
                  <Readout label={L("Companies", "Compañías")} value={screenerResult?.rows?.length ?? "-"} />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[210px_260px_1fr_auto]">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Sector", "Sector")}</span>
                  <select
                    value={screenerSector}
                    onChange={(event) => setScreenerSector(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                  >
                    {(screenerResult?.sectors ?? [
                      { key: "technology", label: "Technology" },
                      { key: "communication", label: "Communication Services" },
                      { key: "consumer_discretionary", label: "Consumer Discretionary" },
                      { key: "consumer_staples", label: "Consumer Staples" },
                      { key: "healthcare", label: "Healthcare" },
                      { key: "financials", label: "Financials" },
                      { key: "industrials", label: "Industrials" },
                      { key: "energy", label: "Energy" },
                      { key: "utilities", label: "Utilities" },
                      { key: "real_estate", label: "Real Estate" },
                      { key: "materials", label: "Materials" },
                    ]).map((sector) => (
                      <option key={sector.key} value={sector.key}>
                        {sector.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Research strategy", "Estrategia de research")}</span>
                  <select
                    value={screenerStrategy}
                    onChange={(event) => setScreenerStrategy(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                  >
                    {(screenerResult?.templates ?? [
                      { key: "quality_compounder", name: "Quality Compounder" },
                      { key: "value_candidate", name: "Value Candidate" },
                      { key: "quality_at_reasonable_price", name: "Quality at a Reasonable Price" },
                      { key: "price_dislocation", name: "Price Dislocation" },
                      { key: "balance_sheet_strength", name: "Balance Sheet Strength" },
                    ]).map((template) => (
                      <option key={template.key} value={template.key}>{template.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">
                    {L("Custom tickers optional", "Tickers custom opcional")}
                  </span>
                  <input
                    value={screenerCustomTickers}
                    onChange={(event) => setScreenerCustomTickers(event.target.value.toUpperCase())}
                    placeholder="AAPL,MSFT,NVDA"
                    className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void runSectorScreener()}
                  disabled={screenerLoading}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-sky-400/60 bg-sky-500/10 px-4 text-sm font-semibold text-sky-100 hover:bg-sky-500/20 disabled:opacity-50 lg:self-end"
                >
                  {screenerLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {screenerLoading ? L("Screening", "Analizando") : L("Run screener", "Correr screener")}
                </button>
              </div>

              {screenerError ? <p className="mt-3 text-sm text-rose-300">{screenerError}</p> : null}

              {screenerResult ? (
                <>
                  <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Readout label={L("Sector", "Sector")} value={screenerResult.sectorLabel} />
                    <Readout label={L("Median FCF yield", "FCF yield mediana")} value={formatPercent(screenerResult.summary?.medianFcfYield, localeTag)} />
                    <Readout label={L("Median forward P/E", "Forward P/E mediana")} value={formatCompactNumber(screenerResult.summary?.medianForwardPE, localeTag)} />
                    <Readout label={L("Passed all criteria", "Cumplen todos los criterios")} value={screenerResult.summary?.passedAllRequiredCriteria ?? 0} />
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full min-w-[1120px] text-left text-sm">
                      <thead className="bg-slate-950/55 text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2">{L("Company", "Compañía")}</th>
                          <th className="px-3 py-2">{L("Screen result", "Resultado")}</th>
                          <th className="px-3 py-2">{L("Data coverage", "Cobertura de data")}</th>
                          <th className="px-3 py-2">{L("Criteria", "Criterios")}</th>
                          <th className="px-3 py-2">{L("FCF yield", "FCF yield")}</th>
                          <th className="px-3 py-2">{L("Forward P/E", "Forward P/E")}</th>
                          <th className="px-3 py-2">{L("Revenue CAGR", "Revenue CAGR")}</th>
                          <th className="px-3 py-2">{L("FCF margin", "Margen FCF")}</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {screenerResult.rows.map((row) => (
                          <tr key={row.ticker} className="border-t border-slate-800">
                            <td className="px-3 py-2">
                              <p className="font-semibold text-slate-100">{row.ticker}</p>
                              <p className="max-w-[240px] truncate text-xs text-slate-500">{row.name}</p>
                            </td>
                            <td className={`px-3 py-2 text-xs font-semibold ${row.status === "PASSED_ALL_REQUIRED_CRITERIA" ? "text-emerald-300" : row.status === "INSUFFICIENT_DATA" ? "text-amber-300" : "text-rose-300"}`}>
                              {row.status === "PASSED_ALL_REQUIRED_CRITERIA"
                                ? L("PASSED", "CUMPLE")
                                : row.status === "INSUFFICIENT_DATA"
                                  ? L("NEEDS DATA", "FALTA DATA")
                                  : L("CRITERIA FAILED", "NO CUMPLE")}
                            </td>
                            <td className="px-3 py-2 text-slate-300">{formatPercent(row.dataCompletenessPct / 100, localeTag)}</td>
                            <td className="px-3 py-2">
                              <div className="flex max-w-[300px] flex-wrap gap-1">
                                {row.criteria.map((criterion) => (
                                  <span
                                    key={criterion.key}
                                    title={criterion.explanation}
                                    className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${criterion.status === "PASS" ? "border-emerald-500/30 text-emerald-300" : criterion.status === "FAIL" ? "border-rose-500/30 text-rose-300" : "border-amber-500/30 text-amber-300"}`}
                                  >
                                    {criterion.label}: {criterion.status === "DATA_NOT_AVAILABLE" ? "N/A" : criterion.status}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-slate-300">{formatPercent(row.fcfYield, localeTag)}</td>
                            <td className="px-3 py-2 text-slate-300">{formatCompactNumber(row.forwardPE ?? row.trailingPE, localeTag)}</td>
                            <td className="px-3 py-2 text-slate-300">{formatPercent(row.revenueCagr, localeTag)}</td>
                            <td className="px-3 py-2 text-slate-300">{formatPercent(row.fcfMargin, localeTag)}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => openScreenerTicker(row.ticker)}
                                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
                              >
                                {L("Research", "Investigar")}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {L(
                      "Screen results are research triage, not investment decisions. Missing evidence remains visible and no result authorizes a purchase.",
                      "Los resultados organizan el research; no son decisiones de inversión. La evidencia faltante permanece visible y ningún resultado autoriza una compra."
                    )}
                  </p>
                </>
              ) : null}
            </div>

            <div className={`${activeWorkspaceTab === "research" ? "" : "hidden"} rounded-xl border border-slate-800 bg-slate-900/75 p-5 shadow-lg shadow-slate-950/20`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-sky-300" />
                    <h2 className="text-base font-semibold">{L("Stock / ETF Investment Profile", "Profile de inversión de acción / ETF")}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "Create one profile at a time. Neuro loads market data automatically and uses filings or ETF evidence to support the thesis.",
                      "Crea un profile a la vez. Neuro carga data de mercado automáticamente y usa filings o evidencia ETF para respaldar la tesis."
                    )}
                  </p>
                </div>
                <div className="min-w-[140px] rounded-lg border border-sky-500/30 bg-sky-500/5 px-3 py-2 lg:text-right">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Active profile", "Profile activo")}</span>
                  <p className="mt-1 text-sm font-semibold text-sky-200">{focusTicker}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,0.78fr)_minmax(0,0.78fr)]">
                <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                  <p className="text-xs text-slate-500">{L("Company", "Empresa")}</p>
                  <p className="mt-2 truncate text-lg font-semibold text-slate-50">
                    {marketData?.company?.name || focusTicker}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {[
                      focusInstrumentIsFundLike ? L("ETF / fund", "ETF / fondo") : marketData?.company?.quoteType,
                      marketData?.fund?.categoryName,
                      marketData?.company?.sector,
                      marketData?.company?.industry,
                      marketData?.company?.exchange,
                    ]
                      .filter(Boolean)
                      .join(" / ") || (marketLoading ? L("Loading data...", "Cargando data...") : L("Waiting for market data.", "Esperando data de mercado."))}
                  </p>
                </div>
                <Readout
                  label={L("Market price", "Precio mercado")}
                  value={formatCurrency(marketData?.market?.regularMarketPrice, localeTag)}
                  hint={
                    marketData?.market?.fiftyTwoWeekLow != null && marketData?.market?.fiftyTwoWeekHigh != null
                      ? `52W ${formatCurrency(marketData.market.fiftyTwoWeekLow, localeTag)} / ${formatCurrency(marketData.market.fiftyTwoWeekHigh, localeTag)}`
                      : ""
                  }
                />
                <Readout
                  label={focusInstrumentIsFundLike ? L("Fund profile", "Profile del fondo") : L("Latest fiscal year", "Último año fiscal")}
                  value={focusInstrumentIsFundLike ? marketData?.fund?.categoryName || marketData?.company?.quoteType || "ETF" : latestFundamentals?.year ?? DATA_NOT_AVAILABLE}
                  hint={
                    focusInstrumentIsFundLike
                      ? `${L("Yield", "Yield")} ${formatPercent(marketData?.fund?.yield ?? marketData?.market?.dividendYield, localeTag)} / ${L("Fee", "Costo")} ${formatPercent(marketData?.fund?.annualReportExpenseRatio, localeTag)}`
                      : `Rev ${formatCompactCurrency(latestFundamentals?.totalRevenue, localeTag)} / FCF ${formatCompactCurrency(latestFundamentals?.freeCashFlow, localeTag)}`
                  }
                />
              </div>
              {marketError ? <p className="mt-3 text-xs text-amber-300">{marketError}</p> : null}
              {focusInstrumentIsFundLike ? (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Readout
                    label={L("Net assets", "Activos netos")}
                    value={formatCompactCurrency(marketData?.fund?.netAssets, localeTag)}
                    hint={marketData?.fund?.family ?? ""}
                  />
                  <Readout
                    label={L("5Y avg return", "Retorno prom. 5Y")}
                    value={formatPercent(marketData?.fund?.fiveYearAverageReturn, localeTag)}
                    hint={L("When available", "Cuando esté disponible")}
                  />
                  <Readout
                    label={L("Liquidity", "Liquidez")}
                    value={formatCompactNumber(marketData?.market?.regularMarketVolume, localeTag)}
                    hint={L("Latest volume", "Volumen reciente")}
                  />
                </div>
              ) : null}
            </div>

            <div className={activeWorkspaceTab === "research" ? "" : "hidden"}>
              <FinancialIntegrityPanel
                manifest={reportFinancialDataIntegrity ?? marketData?.financialDataIntegrity}
                isEs={isEs}
              />
            </div>

            <section className={`${activeWorkspaceTab === "research" ? "" : "hidden"} border-y border-cyan-400/25 bg-cyan-400/[0.035] px-1 py-5`}>
              <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-4xl">
                  <div className="flex items-center gap-2">
                    <BriefcaseBusiness className="h-4 w-4 text-cyan-300" />
                    <h2 className="text-base font-semibold">{L("Business Quality Analysis", "Análisis de Calidad del Negocio")}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "Stage 1 of 2. Neuro evaluates the operating business without seeing price or valuation. Only after this dossier is complete does the stock analysis begin.",
                      "Etapa 1 de 2. Neuro evalúa el negocio operativo sin ver precio ni valoración. El análisis de la acción comienza solamente después de completar este expediente."
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase">
                  <span className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1.5 text-cyan-200">
                    {L("Business first", "Negocio primero")}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-slate-400">
                    {businessQualityAnalysis?.status?.replace(/_/g, " ") ?? L("Pending", "Pendiente")}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-slate-400">
                    {L("No score", "Sin score")}
                  </span>
                </div>
              </div>

              {focusInstrumentIsFundLike || businessQualityAnalysis?.status === "not_applicable" ? (
                <div className="mx-4 mt-5 border-l-2 border-sky-400 pl-4 text-sm leading-6 text-slate-300">
                  {L(
                    "This operating-company engine does not apply to an ETF or fund. Neuro uses the fund framework for strategy, holdings, concentration, fees, liquidity, distributions, and tracking risk instead.",
                    "Este motor de compañías operativas no aplica a un ETF o fondo. Neuro usa el marco de fondos para estrategia, holdings, concentración, costos, liquidez, distribuciones y tracking risk."
                  )}
                </div>
              ) : businessQualityAnalysis ? (
                <>
                  <div className="mt-5 border-t border-slate-800">
                    {BUSINESS_QUALITY_DIMENSIONS.map((definition, index) => {
                      const dimension = businessQualityAnalysis.dimensions.find((item) => item.key === definition.key);
                      if (!dimension) return null;
                      return (
                        <details key={definition.key} className="group border-b border-slate-800 px-4 py-1" open={index === 0}>
                          <summary className="grid cursor-pointer list-none grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-3 py-3 marker:content-none">
                            <span className="font-mono text-xs font-semibold text-cyan-400">{String(index + 1).padStart(2, "0")}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-100">{businessQualityLabels[definition.key]}</p>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 group-open:line-clamp-none">{dimension.conclusion}</p>
                            </div>
                            <ChevronRight className="mt-0.5 h-4 w-4 text-slate-600 transition-transform group-open:rotate-90" />
                          </summary>
                          <div className="grid grid-cols-1 gap-x-5 gap-y-4 pb-5 pl-[46px] lg:grid-cols-2 2xl:grid-cols-4">
                            <div>
                              <p className="mb-2 text-[10px] font-semibold uppercase text-emerald-300">{L("Supporting evidence", "Evidencia a favor")}</p>
                              <BusinessEvidenceList rows={dimension.supportingEvidence} />
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-semibold uppercase text-rose-300">{L("Contradictory evidence", "Evidencia contradictoria")}</p>
                              <BusinessEvidenceList rows={dimension.contradictoryEvidence} />
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-semibold uppercase text-amber-300">{L("Uncertainty", "Incertidumbre")}</p>
                              <ul className="space-y-2 text-xs leading-5 text-slate-400">
                                {dimension.uncertainty.map((item, itemIndex) => <li key={`${item}-${itemIndex}`} className="border-l border-slate-700 pl-3">{item}</li>)}
                              </ul>
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-semibold uppercase text-sky-300">{L("What would change it", "Qué cambiaría la conclusión")}</p>
                              <ul className="space-y-2 text-xs leading-5 text-slate-400">
                                {dimension.additionalInformation.map((item, itemIndex) => <li key={`${item}-${itemIndex}`} className="border-l border-slate-700 pl-3">{item}</li>)}
                              </ul>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>

                  <div className="mx-4 mt-6 border-l-2 border-amber-300 bg-amber-300/[0.04] px-4 py-4">
                    <p className="text-xs font-semibold uppercase text-amber-200">
                      WHAT MUST BE TRUE FOR THIS BUSINESS TO BE AN ATTRACTIVE INVESTMENT?
                    </p>
                    <div className="mt-4 divide-y divide-slate-800">
                      {businessQualityAnalysis.whatMustBeTrue.map((condition, index) => (
                        <div key={`${condition.condition}-${index}`} className="grid grid-cols-1 gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,1fr))]">
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-amber-300">{L("Condition", "Condición")}</p>
                            <p className="mt-1 text-sm font-semibold leading-6 text-slate-100">{condition.condition}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-slate-500">{L("Why it matters", "Por qué importa")}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">{condition.whyItMatters}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-slate-500">{L("Evidence needed", "Evidencia necesaria")}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">{condition.evidenceNeeded}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-rose-300">{L("Failure signal", "Señal de fallo")}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-400">{condition.failureSignal}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="mx-4 mt-5 border-l-2 border-slate-700 pl-4 text-sm leading-6 text-slate-500">
                  {L(
                    "Run Neuro Analysis to build the 20-dimension business dossier before valuation.",
                    "Corre Neuro Analysis para construir el expediente de 20 dimensiones antes de la valoración."
                  )}
                </div>
              )}
            </section>

            <section className={`${activeWorkspaceTab === "research" ? "" : "hidden"} border-y border-violet-400/25 bg-violet-400/[0.035] px-1 py-5`}>
              <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-4xl">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-violet-300" />
                    <h2 className="text-base font-semibold">{L("Management & Capital Allocation", "Gerencia y Asignación de Capital")}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "Documented decisions and subsequent financial outcomes. This module does not judge personality, honesty, intelligence, competence, motives, or character.",
                      "Decisiones documentadas y resultados financieros posteriores. Este módulo no juzga personalidad, honestidad, inteligencia, competencia, motivos ni carácter."
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase">
                  <span className="rounded-md border border-violet-400/30 bg-violet-400/10 px-2.5 py-1.5 text-violet-200">
                    {L("Actions, not personality", "Acciones, no personalidad")}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-slate-400">
                    {managementCapitalAllocationAnalysis?.status?.replace(/_/g, " ") ?? L("Pending", "Pendiente")}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-slate-400">
                    {L("No score", "Sin score")}
                  </span>
                </div>
              </div>

              {focusInstrumentIsFundLike || managementCapitalAllocationAnalysis?.status === "not_applicable" ? (
                <div className="mx-4 mt-5 border-l-2 border-sky-400 pl-4 text-sm leading-6 text-slate-300">
                  {L(
                    "This operating-company management module does not apply to an ETF or fund.",
                    "Este módulo de gerencia de compañías operativas no aplica a un ETF o fondo."
                  )}
                </div>
              ) : managementCapitalAllocationAnalysis ? (
                <>
                  <div className="mx-4 mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                    <div className="border-l-2 border-violet-300 pl-4">
                      <p className="text-[10px] font-semibold uppercase text-violet-300">{L("Observable allocation pattern", "Patrón observable de asignación")}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">{managementCapitalAllocationAnalysis.observableAllocationPattern}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Readout
                        label={L("Allocation calculation", "Cálculo de asignación")}
                        value={managementCapitalAllocationAnalysis.incrementalCapitalAllocation.status.replace(/_/g, " ")}
                      />
                      <Readout
                        label={L("Comparable uses", "Usos comparables")}
                        value={formatDocumentedAmount(
                          managementCapitalAllocationAnalysis.incrementalCapitalAllocation.totalComparableUses,
                          managementCapitalAllocationAnalysis.incrementalCapitalAllocation.currency,
                          localeTag
                        )}
                      />
                    </div>
                  </div>

                  <div className="mx-4 mt-6 border-t border-slate-800 pt-5">
                    <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-300">{L("Incremental capital allocation", "Asignación de capital incremental")}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {managementCapitalAllocationAnalysis.incrementalCapitalAllocation.periodStart && managementCapitalAllocationAnalysis.incrementalCapitalAllocation.periodEnd
                            ? `${managementCapitalAllocationAnalysis.incrementalCapitalAllocation.periodStart} / ${managementCapitalAllocationAnalysis.incrementalCapitalAllocation.periodEnd}`
                            : L("A comparable period could not be established.", "No se pudo establecer un periodo comparable.")}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold uppercase text-slate-500">
                        {managementCapitalAllocationAnalysis.incrementalCapitalAllocation.currency ?? L("Currency unresolved", "Moneda sin resolver")}
                      </span>
                    </div>

                    {managementCapitalAllocationAnalysis.incrementalCapitalAllocation.sourcesOfCapital.length ? (
                      <div className="mt-4">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">
                          {L("Documented sources of capital", "Fuentes de capital documentadas")}
                        </p>
                        <div className="mt-2 divide-y divide-slate-800 border-y border-slate-800">
                          {managementCapitalAllocationAnalysis.incrementalCapitalAllocation.sourcesOfCapital.map((row, index) => (
                            <div
                              key={`${row.label}-${index}`}
                              className="grid grid-cols-1 gap-2 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_150px_130px] sm:items-center"
                            >
                              <div>
                                <p className="font-semibold text-slate-200">{row.label}</p>
                                <p className="mt-1 text-[10px] uppercase text-slate-600">
                                  {row.source.sourceLabel}
                                  {row.source.sourceDate ? ` / ${row.source.sourceDate}` : ""}
                                </p>
                              </div>
                              <p className="text-slate-300">{formatDocumentedAmount(row.amount, row.currency, localeTag)}</p>
                              <p className={row.source.status === "identified" ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>
                                {row.source.status.replace(/_/g, " ")}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {managementCapitalAllocationAnalysis.incrementalCapitalAllocation.uses.length ? (
                      <div className="mt-4 overflow-x-auto border-y border-slate-800">
                        <table className="w-full min-w-[780px] text-left text-xs">
                          <thead className="bg-slate-950/40 text-[10px] uppercase text-slate-500">
                            <tr>
                              <th className="px-3 py-2">{L("Use", "Uso")}</th>
                              <th className="px-3 py-2">{L("Amount", "Cantidad")}</th>
                              <th className="px-3 py-2">{L("Comparable mix", "Mezcla comparable")}</th>
                              <th className="px-3 py-2">{L("Basis", "Base")}</th>
                              <th className="px-3 py-2">{L("Evidence status", "Estado evidencia")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {managementCapitalAllocationAnalysis.incrementalCapitalAllocation.uses.map((row, index) => (
                              <tr key={`${row.label}-${index}`} className="border-t border-slate-800">
                                <td className="px-3 py-3">
                                  <p className="font-semibold text-slate-100">{row.label}</p>
                                  {!row.includedInComparableTotal && row.exclusionReason ? (
                                    <p className="mt-1 max-w-[320px] text-[11px] leading-4 text-slate-500">{row.exclusionReason}</p>
                                  ) : null}
                                </td>
                                <td className="px-3 py-3 text-slate-300">{formatDocumentedAmount(row.amount, row.currency, localeTag)}</td>
                                <td className="px-3 py-3 text-slate-300">{formatPercent(row.percentOfComparableUses, localeTag)}</td>
                                <td className="px-3 py-3 text-slate-400">{row.basis.replace(/_/g, " ")}</td>
                                <td className={row.source.status === "identified" ? "px-3 py-3 text-emerald-300" : "px-3 py-3 text-amber-300"}>
                                  {row.source.status.replace(/_/g, " ")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mt-4 border-l border-amber-300 pl-3 text-xs leading-5 text-amber-100/80">
                        {L("No comparable capital uses could be calculated from verified documents.", "No se pudieron calcular usos de capital comparables desde documentos verificados.")}
                      </p>
                    )}
                    <p className="mt-3 text-xs leading-5 text-slate-500">{managementCapitalAllocationAnalysis.incrementalCapitalAllocation.methodology}</p>
                    <ul className="mt-2 space-y-1 text-[11px] leading-5 text-slate-600">
                      {managementCapitalAllocationAnalysis.incrementalCapitalAllocation.limitations.map((item, index) => <li key={`${item}-${index}`}>- {item}</li>)}
                    </ul>
                  </div>

                  <div className="mx-4 mt-6 border-t border-slate-800 pt-5">
                    <p className="text-xs font-semibold uppercase text-slate-300">{L("Guidance versus documented outcomes", "Guidance versus resultados documentados")}</p>
                    {managementCapitalAllocationAnalysis.guidanceOutcomeComparisons.length ? (
                      <div className="mt-4 overflow-x-auto border-y border-slate-800">
                        <table className="w-full min-w-[980px] text-left text-xs">
                          <thead className="bg-slate-950/40 text-[10px] uppercase text-slate-500">
                            <tr>
                              <th className="px-3 py-2">{L("Metric", "Métrica")}</th>
                              <th className="px-3 py-2">{L("Documented statement", "Declaración documentada")}</th>
                              <th className="px-3 py-2">{L("Subsequent outcome", "Resultado posterior")}</th>
                              <th className="px-3 py-2">{L("Result", "Resultado")}</th>
                              <th className="px-3 py-2">{L("Variance", "Variación")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {managementCapitalAllocationAnalysis.guidanceOutcomeComparisons.map((comparison, index) => (
                              <tr key={`${comparison.metric}-${index}`} className="border-t border-slate-800 align-top">
                                <td className="px-3 py-3 font-semibold text-slate-100">{comparison.metric}</td>
                                <td className="max-w-[280px] px-3 py-3 leading-5 text-slate-400">{comparison.managementStatement}</td>
                                <td className="max-w-[280px] px-3 py-3 leading-5 text-slate-400">{comparison.subsequentDocumentedOutcome}</td>
                                <td className="px-3 py-3 font-semibold text-violet-200">{comparison.result.replace(/_/g, " ")}</td>
                                <td className="max-w-[220px] px-3 py-3 leading-5 text-slate-500">{comparison.variance}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="mt-3 border-l border-slate-700 pl-3 text-xs leading-5 text-slate-500">
                        {L("No guidance statement could be matched reliably to a subsequent outcome.", "No se pudo vincular confiablemente una declaración de guidance con un resultado posterior.")}
                      </p>
                    )}
                  </div>

                  <div className="mt-6 border-t border-slate-800">
                    {MANAGEMENT_ACTION_CATEGORIES.map((definition, index) => {
                      const category = managementCapitalAllocationAnalysis.categories.find((item) => item.key === definition.key);
                      if (!category) return null;
                      return (
                        <details key={definition.key} className="group border-b border-slate-800 px-4 py-1" open={index === 0}>
                          <summary className="grid cursor-pointer list-none grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-3 py-3 marker:content-none">
                            <span className="font-mono text-xs font-semibold text-violet-400">{String(index + 1).padStart(2, "0")}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-100">{managementCategoryLabels[definition.key]}</p>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 group-open:line-clamp-none">{category.conclusion}</p>
                            </div>
                            <ChevronRight className="mt-0.5 h-4 w-4 text-slate-600 transition-transform group-open:rotate-90" />
                          </summary>
                          <div className="space-y-5 pb-5 pl-[46px]">
                            <div>
                              <p className="mb-2 text-[10px] font-semibold uppercase text-emerald-300">{L("Documented actions and consequences", "Acciones documentadas y consecuencias")}</p>
                              {category.documentedActions.length ? (
                                <div className="divide-y divide-slate-800 border-y border-slate-800">
                                  {category.documentedActions.map((action, actionIndex) => (
                                    <div key={`${action.decision}-${actionIndex}`} className="grid grid-cols-1 gap-3 py-3 lg:grid-cols-[110px_minmax(0,1fr)_140px_minmax(0,1fr)]">
                                      <p className="text-xs text-slate-500">{action.actionDate ?? L("Date unavailable", "Fecha no disponible")}</p>
                                      <p className="text-xs font-semibold leading-5 text-slate-200">{action.decision}</p>
                                      <p className="text-xs text-slate-300">{formatDocumentedAmount(action.amount, action.currency, localeTag)}</p>
                                      <div>
                                        <p className="text-xs leading-5 text-slate-400">{action.financialConsequence}</p>
                                        <p className="mt-1 text-[10px] uppercase text-slate-600">{action.source.sourceLabel} {action.source.sourceDate ? `/ ${action.source.sourceDate}` : ""}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="border-l border-slate-700 pl-3 text-xs leading-5 text-slate-500">{L("No verified action identified.", "No se identificó una acción verificada.")}</p>
                              )}
                            </div>
                            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase text-rose-300">{L("Documented inconsistencies", "Inconsistencias documentadas")}</p>
                                <BusinessEvidenceList rows={category.inconsistencies} />
                              </div>
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase text-amber-300">{L("Unresolved questions", "Preguntas sin resolver")}</p>
                                <ul className="space-y-2 text-xs leading-5 text-slate-400">
                                  {category.unresolvedQuestions.map((question, questionIndex) => <li key={`${question}-${questionIndex}`} className="border-l border-slate-700 pl-3">{question}</li>)}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>

                  <div className="mx-4 mt-6 grid grid-cols-1 gap-5 border-t border-slate-800 pt-5 lg:grid-cols-3">
                    {[
                      { label: L("Financial consequences", "Consecuencias financieras"), rows: managementCapitalAllocationAnalysis.financialConsequences, tone: "text-emerald-300" },
                      { label: L("Inconsistencies", "Inconsistencias"), rows: managementCapitalAllocationAnalysis.inconsistencies, tone: "text-rose-300" },
                      { label: L("Unresolved questions", "Preguntas sin resolver"), rows: managementCapitalAllocationAnalysis.unresolvedQuestions, tone: "text-amber-300" },
                    ].map((column) => (
                      <div key={column.label}>
                        <p className={`text-[10px] font-semibold uppercase ${column.tone}`}>{column.label}</p>
                        <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                          {column.rows.map((item, index) => <li key={`${item}-${index}`} className="border-l border-slate-700 pl-3">{item}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mx-4 mt-5 border-l-2 border-slate-700 pl-4 text-sm leading-6 text-slate-500">
                  {L(
                    "Run Neuro Analysis to build the documented management and capital-allocation record.",
                    "Corre Neuro Analysis para construir el expediente documentado de gerencia y asignación de capital."
                  )}
                </div>
              )}
            </section>

            <section className={`${activeWorkspaceTab === "research" ? "" : "hidden"} border-y border-amber-300/25 bg-amber-300/[0.025] px-1 py-5`}>
              <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-4xl">
                  <div className="flex items-center gap-2">
                    <FileWarning className="h-4 w-4 text-amber-300" />
                    <h2 className="text-base font-semibold">{L("Earnings Quality & Accounting Risk", "Calidad de Ganancias y Riesgo Contable")}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "Multi-year financial relationships that deserve additional investigation. Statistical anomalies are not fraud findings.",
                      "Relaciones financieras multianuales que merecen investigación adicional. Las anomalías estadísticas no son determinaciones de fraude."
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase">
                  <span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-amber-100">
                    {L("Investigation screen", "Filtro de investigación")}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-slate-400">
                    {earningsQualityAccountingRiskAnalysis?.status?.replace(/_/g, " ") ?? L("Pending", "Pendiente")}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-slate-400">
                    {L("No fraud score", "Sin score de fraude")}
                  </span>
                </div>
              </div>

              {focusInstrumentIsFundLike || earningsQualityAccountingRiskAnalysis?.status === "not_applicable" ? (
                <div className="mx-4 mt-5 border-l-2 border-sky-400 pl-4 text-sm leading-6 text-slate-300">
                  {L(
                    "This operating-company accounting module does not apply to an ETF or fund.",
                    "Este módulo contable de compañías operativas no aplica a un ETF o fondo."
                  )}
                </div>
              ) : earningsQualityAccountingRiskAnalysis ? (
                <>
                  <div className="mx-4 mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
                    <div className="border-l-2 border-amber-300 pl-4">
                      <p className="text-[10px] font-semibold uppercase text-amber-200">{L("Accounting read", "Lectura contable")}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-200">{earningsQualityAccountingRiskAnalysis.summary}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {L(
                          "The agent identifies relationships to reconcile. It does not determine fraud or misconduct.",
                          "El agente identifica relaciones que deben reconciliarse. No determina fraude ni conducta indebida."
                        )}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Readout
                        label={L("Investigate", "Investigar")}
                        value={earningsQualityAccountingRiskAnalysis.areas.filter((area) => area.investigationFlag.status === "investigate").length}
                      />
                      <Readout
                        label={L("Watch", "Observar")}
                        value={earningsQualityAccountingRiskAnalysis.areas.filter((area) => area.investigationFlag.status === "watch").length}
                      />
                      <Readout
                        label={L("Data gaps", "Brechas")}
                        value={earningsQualityAccountingRiskAnalysis.areas.filter((area) => area.investigationFlag.status === "data_gap").length}
                      />
                    </div>
                  </div>

                  <div className="mx-4 mt-6 border-y border-slate-800 py-4">
                    <p className="text-[10px] font-semibold uppercase text-slate-400">
                      {L("Priority investigation questions", "Preguntas prioritarias de investigación")}
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-2 lg:grid-cols-2">
                      {earningsQualityAccountingRiskAnalysis.prioritizedInvestigationQuestions.map((question, index) => (
                        <p key={`${question}-${index}`} className="border-l border-amber-300/50 pl-3 text-xs leading-5 text-slate-300">
                          {question}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 border-t border-slate-800">
                    {EARNINGS_QUALITY_AREAS.map((definition, index) => {
                      const area = earningsQualityAccountingRiskAnalysis.areas.find((item) => item.key === definition.key);
                      if (!area) return null;
                      const flagTone =
                        area.investigationFlag.status === "investigate"
                          ? "border-rose-400/35 bg-rose-400/10 text-rose-200"
                          : area.investigationFlag.status === "watch"
                            ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                            : area.investigationFlag.status === "data_gap"
                              ? "border-slate-700 bg-slate-900 text-slate-400"
                              : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
                      return (
                        <details key={definition.key} className="group border-b border-slate-800 px-4 py-1" open={index === 0}>
                          <summary className="grid cursor-pointer list-none grid-cols-[34px_minmax(0,1fr)_auto] items-start gap-3 py-3 marker:content-none">
                            <span className="font-mono text-xs font-semibold text-amber-300">{String(index + 1).padStart(2, "0")}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-100">{earningsQualityLabels[definition.key]}</p>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500 group-open:line-clamp-none">{area.conclusion}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase ${flagTone}`}>
                                {area.investigationFlag.status.replace(/_/g, " ")}
                              </span>
                              <ChevronRight className="h-4 w-4 text-slate-600 transition-transform group-open:rotate-90" />
                            </div>
                          </summary>
                          <div className="space-y-5 pb-6 pl-[46px]">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                              <div className="border-l border-amber-300/50 pl-3">
                                <p className="text-[10px] font-semibold uppercase text-amber-200">{L("Formula", "Fórmula")}</p>
                                <p className="mt-2 font-mono text-xs leading-5 text-slate-300">{area.investigationFlag.formula}</p>
                              </div>
                              <div>
                                <p className="text-xs leading-5 text-slate-300">{area.investigationFlag.mathematicalExplanation}</p>
                                <p className="mt-2 text-xs leading-5 text-slate-500">{area.investigationFlag.whyInvestigate}</p>
                              </div>
                            </div>

                            {area.multiYearTrend.length ? (
                              <div className="overflow-x-auto border-y border-slate-800">
                                <table className="w-full min-w-[760px] text-left text-xs">
                                  <thead className="bg-slate-950/40 text-[10px] uppercase text-slate-500">
                                    <tr>
                                      <th className="px-3 py-2">{L("Period", "Periodo")}</th>
                                      <th className="px-3 py-2">{L("Primary value", "Valor principal")}</th>
                                      <th className="px-3 py-2">{L("Comparison", "Comparación")}</th>
                                      <th className="px-3 py-2">{L("Calculated relationship", "Relación calculada")}</th>
                                      <th className="px-3 py-2">{L("Source", "Fuente")}</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {area.multiYearTrend.map((point, pointIndex) => (
                                      <tr key={`${point.period}-${pointIndex}`} className="border-t border-slate-800 align-top">
                                        <td className="px-3 py-3 font-semibold text-slate-200">{point.period}</td>
                                        <td className="px-3 py-3 text-slate-300">
                                          <p>{formatAccountingMetric(point.primaryValue, localeTag)}</p>
                                          <p className="mt-1 text-[10px] text-slate-600">{point.primaryLabel}</p>
                                        </td>
                                        <td className="px-3 py-3 text-slate-300">
                                          <p>{formatAccountingMetric(point.comparisonValue, localeTag)}</p>
                                          <p className="mt-1 text-[10px] text-slate-600">{point.comparisonLabel}</p>
                                        </td>
                                        <td className="px-3 py-3 font-semibold text-amber-100">{formatAccountingRelationship(point, localeTag)}</td>
                                        <td className={point.source.status === "identified" ? "px-3 py-3 text-emerald-300" : "px-3 py-3 text-amber-300"}>
                                          {point.source.sourceLabel}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="border-l border-slate-700 pl-3 text-xs leading-5 text-slate-500">
                                {L("No verified multi-year relationship could be calculated.", "No se pudo calcular una relación multianual verificada.")}
                              </p>
                            )}

                            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase text-slate-300">{L("Documented evidence", "Evidencia documentada")}</p>
                                <BusinessEvidenceList rows={area.documentedEvidence} />
                              </div>
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase text-emerald-300">{L("Mitigating evidence", "Evidencia mitigante")}</p>
                                <BusinessEvidenceList rows={area.mitigatingEvidence} />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase text-amber-300">{L("Uncertainty", "Incertidumbre")}</p>
                                <ul className="space-y-2 text-xs leading-5 text-slate-400">
                                  {area.uncertainty.map((item, itemIndex) => <li key={`${item}-${itemIndex}`} className="border-l border-slate-700 pl-3">{item}</li>)}
                                </ul>
                              </div>
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase text-sky-300">{L("Information needed", "Información necesaria")}</p>
                                <ul className="space-y-2 text-xs leading-5 text-slate-400">
                                  {area.additionalInformation.map((item, itemIndex) => <li key={`${item}-${itemIndex}`} className="border-l border-slate-700 pl-3">{item}</li>)}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="mx-4 mt-5 border-l-2 border-slate-700 pl-4 text-sm leading-6 text-slate-500">
                  {L(
                    "Run Neuro Analysis to build the multi-year earnings-quality and accounting-risk dossier.",
                    "Corre Neuro Analysis para construir el expediente multianual de calidad de ganancias y riesgo contable."
                  )}
                </div>
              )}
            </section>

            <div className={`${activeWorkspaceTab === "research" ? "" : "hidden"} rounded-xl border border-sky-500/25 bg-slate-900/75 p-5 shadow-lg shadow-slate-950/20`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-sky-300" />
                    <h2 className="text-base font-semibold">{L("Research Controls", "Controles de Research")}</h2>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    {L(
                      "Numeric controls for financial evidence, valuation, dividends, source readiness, and portfolio risk. The three pre-valuation dossiers remain separate and are not reduced to synthetic scores.",
                      "Controles numéricos para evidencia financiera, valoración, dividendos, fuentes y riesgo de cartera. Los tres expedientes previos a valoración permanecen separados y no se reducen a scores sintéticos."
                    )}
                  </p>
                </div>
                <div className="rounded-lg border border-sky-400/25 bg-sky-400/5 px-4 py-3 text-right">
                  <p className="text-[11px] font-semibold uppercase text-sky-300">{L("Business quality", "Calidad del negocio")}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-200">{L("Evidence, not a score", "Evidencia, no un score")}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-5">
                <ScoreBar
                  label={L("Financial data", "Data financiera")}
                  score={focusProfile360.financialEvidenceScore}
                  hint={L("Margins, leverage, history, and data availability only.", "Márgenes, deuda, historial y disponibilidad de data solamente.")}
                />
                <ScoreBar
                  label={L("Valuation", "Valoración")}
                  score={focusProfile360.valuationScore}
                  hint={L("Margin of safety or valuation status from the model.", "Margen de seguridad o estado de valoración del modelo.")}
                />
                <ScoreBar
                  label={L("Dividend", "Dividendo")}
                  score={focusProfile360.dividendScore}
                  hint={L("Yield, coverage, and balance-sheet pressure.", "Yield, cobertura y presión de balance.")}
                />
                <ScoreBar
                  label={L("Evidence", "Evidencia")}
                  score={focusProfile360.evidenceScore}
                  hint={L("Market data, filings, report, and thesis memory.", "Data de mercado, filings, reporte y memoria de tesis.")}
                />
                <ScoreBar
                  label={L("Risk", "Riesgo")}
                  score={focusProfile360.riskScore}
                  hint={L("Concentration, data quality, filings, leverage, and history.", "Concentración, calidad de data, filings, deuda e historial.")}
                />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Readout label={L("Decision state", "Estado decisión")} value={focusProfile360.verdict} />
                <Readout label={L("Valuation", "Valuation")} value={focusProfile360.valuationStatus} />
                <Readout label={L("Evidence gaps", "Brechas evidencia")} value={focusProfile360.missingEvidence.length || "-"} />
                <Readout label={L("Latest report", "Último reporte")} value={agentReport ? L("Available", "Disponible") : L("Pending", "Pendiente")} />
              </div>
            </div>

            <div className={`${activeWorkspaceTab === "research" ? "" : "hidden"} rounded-xl border border-emerald-500/25 bg-slate-900/75 p-5 shadow-lg shadow-slate-950/20`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" />
                    <h2 className="text-base font-semibold">{L("Investment Governance", "Gobernanza de inversión")}</h2>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    {L(
                      "Policy, evidence, valuation, AI interpretation, and human decision stay connected in one auditable flow.",
                      "Política, evidencia, valoración, interpretación AI y decisión humana quedan unidos en un flujo auditable."
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${systemDispositionTone(currentDecisionSupport?.systemDisposition?.code)}`}>
                    {systemDispositionLabel(currentDecisionSupport?.systemDisposition?.code)}
                  </div>
                  <div className={`rounded-lg border px-3 py-2 text-xs font-semibold ${decisionStateTone(currentDecisionSupport?.suggestedState)}`}>
                    {L("Research", "Research")}: {decisionStateLabel(currentDecisionSupport?.suggestedState)}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Readout
                  label={L("System posture", "Postura del sistema")}
                  value={systemDispositionLabel(currentDecisionSupport?.systemDisposition?.code)}
                  hint={L("Not a trade instruction", "No es una orden de trading")}
                />
                <Readout
                  label={L("Policy gate", "Compuerta policy")}
                  value={
                    policyLoading
                      ? L("Loading", "Cargando")
                      : investmentPolicy?.status === "active"
                        ? L("Active", "Activa")
                        : L("Draft", "Draft")
                  }
                  hint={investmentPolicy?.version ? `v${investmentPolicy.version}` : L("Needs approval", "Necesita aprobación")}
                />
                <Readout
                  label={L("Committee review", "Revisión de comité")}
                  value={currentDecisionSupport?.committeeReviewEligible ? L("Eligible", "Elegible") : L("Not ready", "No lista")}
                  hint={currentDecisionSupport?.blockingReasons?.[0] ?? L("Research may advance; AI cannot approve", "Research puede avanzar; AI no aprueba")}
                />
                <Readout
                  label={L("Evidence completeness", "Integridad de evidencia")}
                  value={
                    currentDecisionSupport?.evidenceCompleteness === "sufficient"
                      ? L("Sufficient", "Suficiente")
                      : currentDecisionSupport?.evidenceCompleteness === "partial"
                        ? L("Partial", "Parcial")
                        : currentDecisionSupport?.evidenceCompleteness === "insufficient"
                          ? L("Insufficient", "Insuficiente")
                          : "-"
                  }
                  hint={L("Not an investment probability", "No es probabilidad de inversión")}
                />
                <Readout
                  label={L("Committee packets", "Packets del comité")}
                  value={committeePackets.length}
                  hint={committeeDecisions.length ? `${committeeDecisions.length} ${L("human decision(s)", "decisión(es) humana(s)")}` : L("No approval yet", "Sin aprobación")}
                />
              </div>

              {currentDecisionSupport ? (
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
                  <ScoreBar
                    label={L("Financial data", "Data financiera")}
                    score={currentDecisionSupport.scorecard.financialEvidence ?? currentDecisionSupport.scorecard.businessQuality ?? 0}
                  />
                  <ScoreBar label={L("Value", "Valor")} score={currentDecisionSupport.scorecard.valuationDiscipline} />
                  <ScoreBar label={L("Evidence", "Evidencia")} score={currentDecisionSupport.scorecard.evidenceIntegrity} />
                  <ScoreBar label={L("Durability", "Durabilidad")} score={currentDecisionSupport.scorecard.financialDurability} />
                  <ScoreBar label={L("Portfolio", "Portfolio")} score={currentDecisionSupport.scorecard.portfolioFit} />
                  <ScoreBar label={L("Market", "Mercado")} score={currentDecisionSupport.scorecard.marketContext} />
                </div>
              ) : null}

              {currentDecisionSupport?.missingRequirements?.length ? (
                <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
                  <p className="font-semibold">{L("Open requirements before committee review", "Requisitos antes de revisión del comité")}</p>
                  <p className="mt-1 text-amber-100/80">{currentDecisionSupport.missingRequirements.slice(0, 5).join(" / ")}</p>
                </div>
              ) : null}

              {currentDecisionSupport?.systemDisposition ? (
                <div className={`mt-4 border-l-2 px-4 py-2 text-xs leading-5 ${
                  currentDecisionSupport.systemDisposition.code === "NEED_MORE_INFORMATION"
                    ? "border-amber-300 text-amber-100/90"
                    : currentDecisionSupport.systemDisposition.code === "THESIS_UNCERTAIN"
                      ? "border-violet-300 text-violet-100/90"
                      : currentDecisionSupport.systemDisposition.code === "KEEP_CASH"
                        ? "border-cyan-300 text-cyan-100/90"
                        : "border-slate-600 text-slate-300"
                }`}>
                  <p className="font-semibold">
                    {currentDecisionSupport.systemDisposition.basis[0]}
                  </p>
                  <p className="mt-1 text-slate-500">
                    {L("Deterministic policy", "Política determinística")} v{currentDecisionSupport.systemDisposition.policyVersion}. {L("A human remains accountable for the decision.", "La decisión sigue bajo responsabilidad humana.")}
                  </p>
                </div>
              ) : null}

              <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.78fr)]">
                <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase text-slate-500">{L("Investment policy", "Política de inversión")}</p>
                    <span className="text-[11px] text-slate-500">
                      {investmentPolicy?.approvedAt
                        ? `${L("Approved", "Aprobada")} ${new Date(investmentPolicy.approvedAt).toLocaleDateString(localeTag)}`
                        : L("Draft not approved", "Draft sin aprobar")}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-4">
                    <label className="block lg:col-span-2">
                      <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Universe", "Universo")}</span>
                      <input
                        value={policyDraft.universe}
                        onChange={(event) => setPolicyDraft((prev) => ({ ...prev, universe: event.target.value }))}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Horizon", "Horizonte")}</span>
                      <input
                        inputMode="numeric"
                        value={policyDraft.horizonYears}
                        onChange={(event) => setPolicyDraft((prev) => ({ ...prev, horizonYears: event.target.value }))}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Benchmark", "Benchmark")}</span>
                      <input
                        value={policyDraft.benchmark}
                        onChange={(event) => setPolicyDraft((prev) => ({ ...prev, benchmark: event.target.value.toUpperCase().slice(0, 24) }))}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      />
                    </label>
                  </div>
                  <label className="mt-3 block">
                    <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Strategy", "Estrategia")}</span>
                    <textarea
                      value={policyDraft.strategy}
                      onChange={(event) => setPolicyDraft((prev) => ({ ...prev, strategy: event.target.value }))}
                      rows={3}
                      className="mt-1 w-full resize-none rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </label>
                  <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Max position %", "Max posición %")}</span>
                      <input
                        inputMode="decimal"
                        value={policyDraft.maxPositionPct}
                        onChange={(event) => setPolicyDraft((prev) => ({ ...prev, maxPositionPct: event.target.value }))}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Max sector %", "Max sector %")}</span>
                      <input
                        inputMode="decimal"
                        value={policyDraft.maxSectorPct}
                        onChange={(event) => setPolicyDraft((prev) => ({ ...prev, maxSectorPct: event.target.value }))}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Allowed instruments", "Instrumentos")}</span>
                      <input
                        value={policyDraft.allowedInstruments}
                        onChange={(event) => setPolicyDraft((prev) => ({ ...prev, allowedInstruments: event.target.value }))}
                        className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void saveInvestmentPolicy(false)}
                      disabled={policySaving}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-50"
                    >
                      {policySaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      {L("Save draft", "Guardar draft")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveInvestmentPolicy(true)}
                      disabled={policySaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {L("Approve policy", "Aprobar policy")}
                    </button>
                  </div>
                  {policyStatus ? <p className="mt-3 text-xs text-emerald-300">{policyStatus}</p> : null}
                  {policyError ? <p className="mt-3 text-xs text-rose-300">{policyError}</p> : null}
                </div>

                <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/5 p-4">
                  <p className="text-xs font-semibold uppercase text-cyan-300">{L("Investment Committee handoff", "Entrega al Comité de Inversión")}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                    {L(
                      "Research can prepare a proposal, but it cannot approve capital. Freeze the current report into a committee packet, review every classified claim and source, then record the human decision in the Committee workspace.",
                      "Research puede preparar una propuesta, pero no puede aprobar capital. Congela el reporte actual en un packet, revisa cada afirmación clasificada y su fuente, y registra la decisión humana en el workspace del Comité."
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (committeePackets.length) setActiveWorkspaceTab("committee");
                      else void createInvestmentCommitteePacket();
                    }}
                    disabled={committeeGenerating || !activeCaseId || !activeReportId}
                    className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-50"
                  >
                    {committeeGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    {committeePackets.length
                      ? L("Open Investment Committee", "Abrir Comité de Inversión")
                      : L("Create committee packet", "Crear packet del comité")}
                  </button>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    {committeeDecisions.some((decision) => decision.portfolio_eligible)
                      ? L("A human-approved packet exists for this case.", "Existe un packet aprobado por una persona para este caso.")
                      : L("Portfolio eligibility remains blocked until a human marks a packet APPROVED.", "La elegibilidad de cartera sigue bloqueada hasta que una persona marque un packet APPROVED.")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <aside className={activeWorkspaceTab === "research" ? "space-y-5 xl:sticky xl:top-24 xl:self-start" : "hidden"}>
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-300" />
                <h2 className="text-base font-semibold">{L("Investment Thesis Run", "Investment Thesis Run")}</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {L(
                  "State the working investment thesis or research question. Neuro will test it against evidence, valuation, and an independent bear case.",
                  "Escribe la tesis de inversión de trabajo o pregunta de research. Neuro la probará contra evidencia, valoración y un caso bajista independiente."
                )}
              </p>

              <div className="mt-4 space-y-3">
                {readinessItems.map((item) => (
                  <StatusItem key={item.title} done={item.done} title={item.title} body={item.body} />
                ))}
              </div>

              <label className="mt-4 block">
                <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Working thesis / research question", "Tesis de trabajo / pregunta de research")}</span>
                <textarea
                  value={researchGoal}
                  onChange={(event) => setResearchGoal(event.target.value)}
                  rows={4}
                  className="mt-1 w-full resize-none rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-100 outline-none"
                />
              </label>

              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => void autoBuildEvidenceAndRun()}
                  disabled={agentLoading || autoRunLoading || documentBatchImporting || documentLookupLoading || !focusTicker.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {autoRunLoading || agentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {autoRunLoading || agentLoading
                    ? autoRunStatus ||
                      (agentElapsedSeconds < 15
                        ? L("Preparing evidence...", "Preparando evidencia...")
                        : agentElapsedSeconds < 45
                          ? L("Analyzing the business...", "Analizando el negocio...")
                          : agentElapsedSeconds < 110
                            ? L("Testing valuation...", "Validando valoración...")
                            : agentElapsedSeconds < 180
                              ? L("Challenging the thesis...", "Retando la tesis...")
                              : L("Finalizing report...", "Finalizando informe..."))
                    : L("Auto-build evidence + run AI", "Construir evidencia + correr AI")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAutoRunStatus("");
                    void runNeuroAgent();
                  }}
                  disabled={agentLoading || autoRunLoading || !focusTicker.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-sky-400 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {agentLoading && !autoRunLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {L("Run with current evidence only", "Correr solo con evidencia actual")}
                </button>
              </div>
              {agentLoading || autoRunStatus ? (
                <p className="mt-2 text-center text-xs tabular-nums text-slate-500">
                  {autoRunStatus || L("Evidence-backed analysis", "Análisis con evidencia")}
                  {agentLoading ? ` · ${agentElapsedSeconds}s` : ""}
                </p>
              ) : null}
              {agentError ? <p className="mt-3 text-xs text-rose-300">{agentError}</p> : null}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-300" />
                <h2 className="text-base font-semibold">
                  {focusInstrumentIsFundLike ? L("Fund Evidence", "Evidencia del fondo") : L("Company Documents", "Documentos de compañía")}
                </h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {focusInstrumentIsFundLike
                  ? L(
                      "ETF/fund profiles use strategy, holdings, costs, yield, liquidity, and market history.",
                      "Los profiles de ETF/fondo usan estrategia, holdings, costos, yield, liquidez e historial de mercado."
                    )
                  : L(
                      "Import official annual and quarterly filings from SEC, or upload your own 10-K/10-Q PDFs.",
                      "Importa filings oficiales anuales y trimestrales desde SEC, o sube tus propios PDFs 10-K/10-Q."
                    )}
              </p>

              {!focusInstrumentIsFundLike ? (
                <button
                  type="button"
                  onClick={() => void findCompanyDocuments()}
                  disabled={documentLookupLoading || !focusTicker.trim()}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400 hover:text-sky-200 disabled:opacity-50"
                >
                  {documentLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  {documentLookupLoading ? L("Searching", "Buscando") : L("Find recent documents", "Buscar documentos recientes")}
                </button>
              ) : null}
              {documentLookupError ? <p className="mt-2 text-xs text-rose-300">{documentLookupError}</p> : null}
              {documentLookup.length > 0 ? (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/45 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">
                      {L("Official documents found", "Documentos oficiales encontrados")}
                    </p>
                    <button
                      type="button"
                      onClick={() => void importLatestCompanyDocuments()}
                      disabled={
                        documentBatchImporting ||
                        latestCompanyDocuments().every((document) => companyDocumentIsImported(document))
                      }
                      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {documentBatchImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudDownload className="h-3.5 w-3.5" />}
                      {documentBatchImporting
                        ? L("Importing...", "Importando...")
                        : L("Import latest 10-K + 10-Q", "Importar últimos 10-K + 10-Q")}
                    </button>
                  </div>
                  <div className="max-h-56 space-y-2 overflow-auto">
                    {documentLookup.slice(0, 8).map((doc) => {
                      const key = companyDocumentKey(doc);
                      const importing = Boolean(documentImporting[key]);
                      const imported = companyDocumentIsImported(doc);
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-200">{doc.form}</span>
                            <span className="ml-2 text-slate-500">{doc.periodEnd || doc.filingDate || "-"}</span>
                            <p className="mt-1 truncate text-[10px] text-slate-600">{doc.filingDate}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <a
                              href={doc.documentUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={L("Open original document", "Abrir documento original")}
                              aria-label={L("Open original document", "Abrir documento original")}
                              className="rounded-md border border-slate-800 p-1.5 text-slate-400 hover:border-sky-400 hover:text-sky-200"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                            <button
                              type="button"
                              onClick={() => void importCompanyDocument(doc)}
                              disabled={importing || imported || documentBatchImporting}
                              className={`inline-flex min-w-20 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 font-semibold disabled:cursor-not-allowed ${
                                imported
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                  : "border-slate-700 text-slate-200 hover:border-sky-400 hover:text-sky-200 disabled:opacity-50"
                              }`}
                            >
                              {importing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : imported ? (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              ) : (
                                <CloudDownload className="h-3.5 w-3.5" />
                              )}
                              {importing ? L("Importing", "Importando") : imported ? L("Imported", "Importado") : L("Import", "Importar")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {documentImportError ? <p className="mt-2 text-xs text-rose-300">{documentImportError}</p> : null}

              <div className="mt-4 space-y-2">
                {documentReadinessRows.map((row: any) => (
                  <div key={row.ticker} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/45 px-3 py-2 text-xs">
                    <span className="font-semibold text-slate-200">{row.ticker}</span>
                    <span className={row.ready ? "text-emerald-300" : "text-amber-300"}>
                      {row.ready
                        ? row.evidenceModel === "fund_profile"
                          ? L("Fund evidence ready", "Evidencia de fondo lista")
                          : L("Documents ready", "Documentos listos")
                        : `${L("Missing", "Falta")}: ${(row.missing ?? []).join(", ")}`}
                    </span>
                  </div>
                ))}
              </div>

              {!focusInstrumentIsFundLike ? (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300 hover:border-sky-400">
                  <UploadCloud className="mb-2 h-4 w-4 text-sky-300" />
                  <span className="font-semibold">10-K PDFs</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={(event) => handleDocumentFiles("10-K", event.target.files)}
                    className="sr-only"
                  />
                </label>
                <label className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-300 hover:border-sky-400">
                  <UploadCloud className="mb-2 h-4 w-4 text-sky-300" />
                  <span className="font-semibold">10-Q PDFs</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={(event) => handleDocumentFiles("10-Q", event.target.files)}
                    className="sr-only"
                  />
                </label>
              </div>
              ) : null}

              <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950/45">
                {filingsLoading ? (
                  <p className="p-3 text-xs text-slate-400">{L("Loading library...", "Cargando biblioteca...")}</p>
                ) : filings.length === 0 ? (
                  <p className="p-3 text-xs text-slate-400">
                    {L("No documents added for this ticker yet.", "Aún no hay documentos para este ticker.")}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {filings.map((filing) => (
                      <div key={filing.id} className="grid grid-cols-[auto_1fr_auto] gap-3 p-3 text-xs">
                        <span className="rounded-full border border-slate-700 px-2 py-1 font-semibold text-slate-300">
                          {filing.form}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-200" title={filing.fileName}>
                            {filing.fileName}
                          </p>
                          <p className="mt-1 text-slate-500">
                            {filing.fiscalYear ?? "-"} / {filing.period || "-"} / {formatFileSize(filing.usageBytes || filing.bytes, localeTag)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeDocument(filing.id)}
                          className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-200"
                          aria-label={L("Remove document", "Quitar documento")}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {pendingDocuments.length ? (
                <p className="mt-3 text-xs text-amber-300">
                  {L(
                    `${pendingDocuments.length} document(s) will be indexed when you run Neuro.`,
                    `${pendingDocuments.length} documento(s) se indexarán cuando corras Neuro.`
                  )}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-emerald-300" />
                <h2 className="text-base font-semibold">{L("Research History", "Historial de research")}</h2>
              </div>
              <div className="mt-4 space-y-2">
                {cases.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {L("Saved cases will appear here.", "Los casos guardados aparecerán aquí.")}
                  </p>
                ) : (
                  cases.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void loadResearchCase(item.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                        activeCaseId === item.id
                          ? "border-sky-400 bg-sky-500/10 text-sky-100"
                          : "border-slate-800 bg-slate-950/45 text-slate-300 hover:border-sky-400"
                      }`}
                    >
                      <span className="block font-semibold">{item.title || item.focus_ticker || "Research case"}</span>
                      <span className="mt-1 block text-slate-500">
                        {item.updated_at ? new Date(item.updated_at).toLocaleString(localeTag) : "-"}
                      </span>
                    </button>
                  ))
                )}
              </div>

              {reports.length > 0 ? (
                <div className="mt-5">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">
                    {L("Reports", "Reportes")}
                  </p>
                  <div className="mt-2 space-y-2">
                    {reports.slice(0, 5).map((report) => (
                      <button
                        key={report.id}
                        type="button"
                        onClick={() => openSavedReport(report)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-xs ${
                          activeReportId === report.id
                            ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                            : "border-slate-800 bg-slate-950/45 text-slate-300 hover:border-emerald-400"
                        }`}
                      >
                        <span className="font-semibold">
                          {report.created_at ? new Date(report.created_at).toLocaleString(localeTag) : "Report"}
                        </span>
                        {report.requires_filings ? (
                          <span className="ml-2 text-amber-300">{L("Provisional", "Provisional")}</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </section>

        <section className={activeWorkspaceTab === "research" ? "space-y-4" : "hidden"}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-emerald-300" />
              <h2 className="text-base font-semibold">{L("Auto-loaded Market Layer", "Capa de mercado automática")}</h2>
            </div>
            <button
              type="button"
              onClick={() => setMarketRefreshNonce((value) => value + 1)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300 hover:border-sky-400 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={marketLoading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${marketLoading ? "animate-spin" : ""}`} />
              {marketLoading ? L("Loading", "Cargando") : marketData?.source ?? L("Market data", "Data de mercado")}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5 xl:col-span-2">
              <h3 className="text-sm font-semibold text-slate-100">
                {focusInstrumentIsFundLike
                  ? L("ETF / fund evidence snapshot", "Snapshot de evidencia ETF / fondo")
                  : L("Revenue, net income, and free cash flow", "Revenue, net income y free cash flow")}
              </h3>
              <div className="mt-4 h-60">
                {focusInstrumentIsFundLike ? (
                  <div className="grid h-full grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                      <p className="text-xs font-semibold uppercase text-slate-500">{L("Fund checks", "Checks del fondo")}</p>
                      <div className="mt-4 space-y-3 text-sm text-slate-300">
                        <div className="flex justify-between gap-4">
                          <span>{L("Expense ratio", "Expense ratio")}</span>
                          <span className="font-semibold text-slate-100">{formatPercent(marketData?.fund?.annualReportExpenseRatio, localeTag)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>{L("Yield", "Yield")}</span>
                          <span className="font-semibold text-slate-100">{formatPercent(marketData?.fund?.yield ?? marketData?.market?.dividendYield, localeTag)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>{L("Net assets", "Activos netos")}</span>
                          <span className="font-semibold text-slate-100">{formatCompactCurrency(marketData?.fund?.netAssets, localeTag)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>{L("Beta 3Y", "Beta 3Y")}</span>
                          <span className="font-semibold text-slate-100">{formatCompactNumber(marketData?.fund?.beta3Year, localeTag)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                      <p className="text-xs font-semibold uppercase text-slate-500">{L("Top holdings", "Top holdings")}</p>
                      {marketData?.fund?.topHoldings?.length ? (
                        <div className="mt-4 space-y-2">
                          {marketData.fund.topHoldings.slice(0, 6).map((holding, index) => (
                            <div key={`${holding.symbol ?? holding.holdingName ?? index}`} className="flex justify-between gap-3 text-xs text-slate-300">
                              <span className="truncate">{holding.symbol || holding.holdingName || "-"}</span>
                              <span className="font-semibold text-slate-100">{formatPercent(holding.holdingPercent, localeTag)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm leading-6 text-slate-500">
                          {L("Holdings breakdown was not available from the current market data response.", "El desglose de holdings no estuvo disponible en la respuesta actual de data de mercado.")}
                        </p>
                      )}
                    </div>
                  </div>
                ) : annualFundamentals.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={annualFundamentals}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(value) => formatCompactNumber(Number(value), localeTag)} />
                      <Tooltip formatter={(value: any) => formatCompactCurrency(Number(value), localeTag)} labelStyle={{ color: "#0f172a" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="totalRevenue" name={L("Revenue", "Ingresos")} fill="#38bdf8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="netIncome" name={L("Net income", "Ingreso neto")} fill="#34d399" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="freeCashFlow" name="FCF" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    {marketLoading ? L("Loading fundamentals...", "Cargando fundamentales...") : L("No annual company fundamentals available.", "Sin fundamentales anuales de compañía disponibles.")}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
              <h3 className="text-sm font-semibold text-slate-100">{L("Margins by year", "Márgenes por año")}</h3>
              <div className="mt-4 h-60">
                {annualFundamentals.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={annualFundamentals}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(value) => formatPercent(Number(value), localeTag)} />
                      <Tooltip formatter={(value: any) => formatPercent(Number(value), localeTag)} labelStyle={{ color: "#0f172a" }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="operatingMargin" name={L("Operating margin", "Margen operativo")} stroke="#38bdf8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="netMargin" name={L("Net margin", "Margen neto")} stroke="#34d399" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="fcfMargin" name={L("FCF margin", "Margen FCF")} stroke="#fbbf24" strokeWidth={2} dot={false} />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    {focusInstrumentIsFundLike
                      ? L("Margin data applies to operating companies, not ETF/fund profiles.", "La data de márgenes aplica a compañías operativas, no a profiles de ETF/fondo.")
                      : L("No margin data.", "Sin data de márgenes.")}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5 xl:col-span-3">
              <h3 className="text-sm font-semibold text-slate-100">
                {L("Monthly price history", "Precio histórico mensual")}
              </h3>
              <div className="mt-4 h-56">
                {marketData?.priceHistory?.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={marketData.priceHistory}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} minTickGap={24} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(value) => formatCurrency(Number(value), localeTag)} />
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value), localeTag)} labelStyle={{ color: "#0f172a" }} />
                      <Line type="monotone" dataKey="close" name={L("Close", "Cierre")} stroke="#38bdf8" strokeWidth={2} dot={false} />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    {L("No price history available.", "Sin precio histórico disponible.")}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {activeWorkspaceTab === "research" && Array.isArray(engineSnapshot?.positions) && engineSnapshot.positions.length > 0 ? (
          <section className="rounded-xl border border-sky-500/25 bg-slate-900/80 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-sky-300" />
                <div>
                  <h2 className="text-base font-semibold">{L("Company Valuation Model", "Modelo de valuation de compañía")}</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {L(
                      "A terminal-style fair-value ladder from year 2 through year 10. Values are model outputs, not promises.",
                      "Una escalera de fair value tipo terminal desde año 2 hasta año 10. Los valores son salidas del modelo, no promesas."
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              {engineSnapshot.positions.map((position: any, index: number) => {
                const profile = position?.valuationProfile ?? {};
                const projectionYears = Array.isArray(profile?.projectionYears) ? profile.projectionYears : [];
                const baseScenario = profile?.selectedHorizonScenarios?.base ?? position?.scenarios?.base ?? {};
                const valuationStatus = String(position?.derived?.valuationStatus ?? "unknown").replace(/_/g, " ");
                return (
                  <div key={position?.ticker ?? `position-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-300">
                          {L("Research profile", "Perfil de research")}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-50">
                          {position?.company?.name || position?.ticker}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {[position?.ticker, position?.company?.sector, position?.company?.industry]
                            .filter(Boolean)
                            .join(" / ")}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4 lg:min-w-[680px]">
                        <Readout
                          label={L("Market cap", "Market cap")}
                          value={formatCompactCurrency(profile?.currentMarketCap, localeTag)}
                        />
                        <Readout
                          label={L("Price today", "Precio hoy")}
                          value={formatCurrency(profile?.currentPrice, localeTag)}
                        />
                        <Readout
                          label={L("Base fair value", "Fair value base")}
                          value={formatCompactCurrency(baseScenario?.intrinsicEquityValue, localeTag)}
                          hint={formatPercent(baseScenario?.upsideToMarket, localeTag)}
                        />
                        <Readout
                          label={L("Valuation status", "Estado valuation")}
                          value={valuationStatus}
                        />
                      </div>
                    </div>

                    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="bg-slate-950/55 text-xs text-slate-500">
                          <tr>
                            <th className="px-3 py-2">{L("Year", "Año")}</th>
                            <th className="px-3 py-2">{L("Bear value", "Valor bear")}</th>
                            <th className="px-3 py-2">{L("Base value", "Valor base")}</th>
                            <th className="px-3 py-2">{L("Bull value", "Valor bull")}</th>
                            <th className="px-3 py-2">{L("Base upside", "Upside base")}</th>
                            <th className="px-3 py-2">{L("Status", "Estado")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectionYears.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                                {L("Run company intelligence to generate the 2-10 year valuation ladder.", "Corre inteligencia de compañía para generar la escalera de valuation 2-10 años.")}
                              </td>
                            </tr>
                          ) : (
                            projectionYears.map((row: any) => (
                              <tr key={`${position?.ticker}-${row.year}`} className="border-t border-slate-800">
                                <td className="px-3 py-2 font-semibold text-slate-100">{row.year}</td>
                                <td className="px-3 py-2 text-slate-300">{formatCompactCurrency(row?.bear?.intrinsicEquityValue, localeTag)}</td>
                                <td className="px-3 py-2 text-slate-300">{formatCompactCurrency(row?.base?.intrinsicEquityValue, localeTag)}</td>
                                <td className="px-3 py-2 text-slate-300">{formatCompactCurrency(row?.bull?.intrinsicEquityValue, localeTag)}</td>
                                <td className="px-3 py-2 font-semibold text-emerald-300">{formatPercent(row?.base?.upsideToMarket, localeTag)}</td>
                                <td className="px-3 py-2 text-slate-300">{String(row?.valuationStatus ?? "unknown").replace(/_/g, " ")}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {activeWorkspaceTab === "research" && Array.isArray(engineSnapshot?.positions) && engineSnapshot.positions.length > 0 ? (
          <section className="border-y border-amber-300/25 bg-amber-300/[0.025] py-6">
            <div className="flex flex-col gap-3 px-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-4xl">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-amber-300" />
                  <h2 className="text-base font-semibold">
                    {L("Reverse DCF: Market-Implied Expectations", "Reverse DCF: Expectativas implícitas del mercado")}
                  </h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {L(
                    "Multiple combinations that approximately reconcile today's enterprise value. They are mathematical cases, not forecasts, probabilities, or trade instructions.",
                    "Múltiples combinaciones que aproximan el enterprise value de hoy. Son casos matemáticos, no pronósticos, probabilidades ni instrucciones de inversión."
                  )}
                </p>
              </div>
              <span className="w-fit rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[10px] font-semibold uppercase text-amber-100">
                {L("No single implied scenario", "Sin un único escenario implícito")}
              </span>
            </div>

            <div className="mt-6">
              {engineSnapshot.positions.map((position: any, positionIndex: number) => {
                const reverse = position?.reverseDcf;
                if (!reverse) return null;
                if (reverse.status === "not_applicable" || reverse.status === "insufficient_information") {
                  return (
                    <div
                      key={(position?.ticker || "reverse") + "-" + positionIndex}
                      className="border-t border-slate-800 px-5 py-5"
                    >
                      <p className="text-sm font-semibold text-slate-200">{position?.ticker}</p>
                      <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
                        {reverse.limitations?.[0] ||
                          L(
                            "Reverse DCF requires current valuation, revenue, and operating-margin data.",
                            "Reverse DCF requiere valoración actual, revenue y margen operativo."
                          )}
                      </p>
                    </div>
                  );
                }

                const history = reverse.historicalPerformance ?? {};
                const scenarios = Array.isArray(reverse.impliedScenarios) ? reverse.impliedScenarios : [];
                return (
                  <div
                    key={(position?.ticker || "reverse") + "-" + positionIndex}
                    className="border-t border-slate-800 px-5 py-6 first:mt-0"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-amber-200">
                          {L("Market expectation profile", "Perfil de expectativas del mercado")}
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-50">
                          {position?.company?.name || position?.ticker}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {L(
                            "Enterprise value is reconciled through paired operating assumptions.",
                            "El enterprise value se reconcilia mediante supuestos operativos combinados."
                          )}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4 xl:min-w-[680px]">
                        <Readout
                          label={L("Price today", "Precio hoy")}
                          value={reverse?.marketInputs?.currentPrice == null ? "-" : formatCurrency(reverse.marketInputs.currentPrice, localeTag)}
                        />
                        <Readout
                          label={L("Implied EV", "EV implícito")}
                          value={formatCompactCurrency(reverse?.marketInputs?.targetEnterpriseValue, localeTag)}
                          hint={reverse?.marketInputs?.cashAssumedZero ? L("Cash missing", "Falta cash") : undefined}
                        />
                        <Readout
                          label={L("Historical revenue CAGR", "CAGR histórico de revenue")}
                          value={formatPercentPoints(history?.revenueCagrPct, localeTag)}
                        />
                        <Readout
                          label={L("Model horizon", "Horizonte del modelo")}
                          value={scenarios?.[0]?.horizonYears ?? "-"}
                          hint={L("Years", "Años")}
                        />
                      </div>
                    </div>

                    <div className="mt-5 overflow-x-auto border-y border-slate-800">
                      <table className="w-full min-w-[1180px] text-left text-xs">
                        <thead className="bg-slate-950/45 text-[10px] uppercase text-slate-500">
                          <tr>
                            <th className="px-3 py-2">{L("Combination", "Combinación")}</th>
                            <th className="px-3 py-2">{L("Revenue growth", "Crecimiento revenue")}</th>
                            <th className="px-3 py-2">{L("Target margin", "Margen objetivo")}</th>
                            <th className="px-3 py-2">{L("Reinvestment", "Reinversión")}</th>
                            <th className="px-3 py-2">{L("Implied ROIIC", "ROIIC implícito")}</th>
                            <th className="px-3 py-2">{L("Tax", "Impuesto")}</th>
                            <th className="px-3 py-2">{L("Cost of capital", "Costo de capital")}</th>
                            <th className="px-3 py-2">{L("Terminal growth", "Crecimiento terminal")}</th>
                            <th className="px-3 py-2">{L("Implied price", "Precio implícito")}</th>
                            <th className="px-3 py-2">{L("History check", "Chequeo histórico")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scenarios.map((scenario: any) => {
                            const growthComparison = scenario.historicalComparison?.find(
                              (row: any) => row.metric === "revenue_growth"
                            );
                            const marginComparison = scenario.historicalComparison?.find(
                              (row: any) => row.metric === "operating_margin"
                            );
                            return (
                              <tr key={scenario.id} className="border-t border-slate-800 align-top">
                                <td className="px-3 py-3">
                                  <p className="font-semibold text-slate-100">
                                    {reverseDcfScenarioLabel(scenario.id, lang)}
                                  </p>
                                  <p className="mt-1 text-[10px] uppercase text-slate-600">
                                    {scenario.solutionStatus === "solved"
                                      ? L("Reconciled", "Reconciliado")
                                      : L("Outside range", "Fuera del rango")}
                                  </p>
                                </td>
                                <td className="px-3 py-3 font-semibold text-amber-100">
                                  {formatPercentPoints(scenario.revenueGrowthPct, localeTag)}
                                </td>
                                <td className="px-3 py-3 text-slate-300">
                                  {formatPercentPoints(scenario.targetOperatingMarginPct, localeTag)}
                                </td>
                                <td className="px-3 py-3 text-slate-300">
                                  {formatPercentPoints(scenario.reinvestmentRatePct, localeTag)}
                                </td>
                                <td className="px-3 py-3 text-slate-300">
                                  {formatPercentPoints(scenario.impliedReturnOnIncrementalCapitalPct, localeTag)}
                                </td>
                                <td className="px-3 py-3 text-slate-300">
                                  {formatPercentPoints(scenario.taxRatePct, localeTag)}
                                </td>
                                <td className="px-3 py-3 text-slate-300">
                                  {formatPercentPoints(scenario.costOfCapitalPct, localeTag)}
                                </td>
                                <td className="px-3 py-3 text-slate-300">
                                  {formatPercentPoints(scenario.terminalGrowthPct, localeTag)}
                                </td>
                                <td className="px-3 py-3">
                                  <p className="font-semibold text-slate-100">
                                    {scenario.impliedPrice == null ? "-" : formatCurrency(scenario.impliedPrice, localeTag)}
                                  </p>
                                  <p className="mt-1 text-[10px] text-slate-500">
                                    {L("Gap", "Brecha")} {scenario.valuationGapPct == null ? "-" : formatPercent(scenario.valuationGapPct, localeTag)}
                                  </p>
                                </td>
                                <td className="px-3 py-3 text-[10px] uppercase leading-5 text-slate-500">
                                  <p>{L("Growth", "Growth")}: {String(growthComparison?.assessment ?? "unavailable").replace(/_/g, " ")}</p>
                                  <p>{L("Margin", "Margen")}: {String(marginComparison?.assessment ?? "unavailable").replace(/_/g, " ")}</p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-2">
                      {(reverse.sensitivityTables ?? []).map((table: any) => {
                        const rowLabel = table.rowMetric === "revenue_growth"
                          ? L("Revenue growth", "Crecimiento revenue")
                          : L("Cost of capital", "Costo de capital");
                        const columnLabel = table.columnMetric === "operating_margin"
                          ? L("Operating margin", "Margen operativo")
                          : L("Terminal growth", "Crecimiento terminal");
                        return (
                          <div key={table.rowMetric + "-" + table.columnMetric}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[10px] font-semibold uppercase text-slate-300">
                                {rowLabel} × {columnLabel}
                              </p>
                              <p className="text-[10px] text-sky-300">
                                {L("Blue = near today's price", "Azul = cerca del precio actual")}
                              </p>
                            </div>
                            <div className="mt-3 overflow-x-auto">
                              <table className="w-full min-w-[560px] table-fixed text-center text-[10px]">
                                <thead>
                                  <tr>
                                    <th className="w-20 px-1 py-2 text-left text-slate-600">{rowLabel}</th>
                                    {(table.columnValuesPct ?? []).map((columnValue: number) => (
                                      <th key={columnValue} className="px-1 py-2 font-semibold text-slate-500">
                                        {formatPercentPoints(columnValue, localeTag)}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(table.rowValuesPct ?? []).map((rowValue: number) => (
                                    <tr key={rowValue}>
                                      <th className="px-1 py-2 text-left font-semibold text-slate-500">
                                        {formatPercentPoints(rowValue, localeTag)}
                                      </th>
                                      {(table.columnValuesPct ?? []).map((columnValue: number) => {
                                        const cell = (table.cells ?? []).find(
                                          (item: any) =>
                                            item.rowValuePct === rowValue &&
                                            item.columnValuePct === columnValue
                                        );
                                        return (
                                          <td key={columnValue} className="p-1">
                                            <div className={"min-h-14 border px-2 py-2 " + reverseDcfCellTone(cell?.valuationGapPct)}>
                                              <p className="font-semibold">
                                                {cell?.impliedPrice != null
                                                  ? formatCurrency(cell.impliedPrice, localeTag)
                                                  : cell?.impliedEquityValue != null
                                                    ? formatCompactCurrency(cell.impliedEquityValue, localeTag)
                                                    : "-"}
                                              </p>
                                              <p className="mt-1 text-[9px] opacity-70">
                                                {cell?.valuationGapPct == null ? "-" : formatPercent(cell.valuationGapPct, localeTag)}
                                              </p>
                                            </div>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-7 grid grid-cols-1 gap-7 border-t border-slate-800 pt-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-amber-200">
                          {L(
                            "What must this company achieve for today's market price to make sense?",
                            "¿Qué debe lograr esta compañía para que el precio de hoy tenga sentido?"
                          )}
                        </p>
                        <div className="mt-3 space-y-3">
                          {(reverse.whatMustBeTrue ?? []).map((item: string, itemIndex: number) => (
                            <p
                              key={itemIndex}
                              className="border-l-2 border-amber-300/60 pl-4 text-sm leading-6 text-slate-200"
                            >
                              {item}
                            </p>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-sky-300">
                          {L("Industry evidence to verify", "Evidencia de industria por verificar")}
                        </p>
                        <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                          {(reverse.industryEvidenceRequirements ?? []).map((item: string, itemIndex: number) => (
                            <li key={itemIndex} className="border-l border-slate-700 pl-3">{item}</li>
                          ))}
                        </ul>
                        <p className="mt-4 text-xs leading-5 text-slate-500">
                          {L(
                            "The research report compares these assumptions with dated industry evidence when comparable evidence is available.",
                            "El reporte de research compara estos supuestos con evidencia fechada de la industria cuando existe evidencia comparable."
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {activeWorkspaceTab === "research" && independentBearCaseAnalysis ? (
          <section className="border-y border-rose-300/25 bg-rose-300/[0.025] py-6">
            <div className="px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-4xl">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-rose-300" />
                    <h2 className="text-base font-semibold">
                      {L("Independent Bear Case", "Caso Bajista Independiente")}
                    </h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "An adversarial test of the working thesis, completed before the final report and without access to a Bull Agent recommendation.",
                      "Una prueba adversarial de la tesis de trabajo, completada antes del reporte final y sin acceso a una recomendación del Bull Agent."
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-semibold uppercase">
                  <span className="rounded-md border border-rose-300/30 bg-rose-300/10 px-2.5 py-1.5 text-rose-100">
                    {independentBearCaseAnalysis.status.replace(/_/g, " ")}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-slate-300">
                    {L("Bull recommendation excluded", "Recomendación bull excluida")}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-950/60 px-2.5 py-1.5 text-slate-300">
                    {L("No probability", "Sin probabilidad")}
                  </span>
                </div>
              </div>

              {independentBearCaseAnalysis.status === "not_applicable" ? (
                <p className="mt-5 border-l-2 border-slate-700 pl-4 text-sm leading-6 text-slate-400">
                  {independentBearCaseAnalysis.strongestBearArgument}
                </p>
              ) : (
                <>
                  <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden border border-slate-800 bg-slate-800 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
                    <div className="bg-slate-950/70 p-5">
                      <p className="text-[10px] font-semibold uppercase text-rose-200">
                        {L("Strongest supported bear argument", "Argumento bajista mejor sustentado")}
                      </p>
                      <p className="mt-3 text-lg font-semibold leading-7 text-slate-50">
                        {independentBearCaseAnalysis.strongestBearArgument}
                      </p>
                      <p className="mt-4 line-clamp-3 text-xs leading-5 text-slate-500">
                        {L("Working thesis tested", "Tesis de trabajo evaluada")}: {independentBearCaseAnalysis.investmentThesis}
                      </p>
                    </div>
                    <div className="bg-slate-950/55 p-5">
                      <p className="text-[10px] font-semibold uppercase text-amber-200">
                        {L("Potential financial impact", "Impacto financiero potencial")}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-slate-200">
                        {independentBearCaseAnalysis.potentialFinancialImpact}
                      </p>
                    </div>
                  </div>

                  <div className="mt-px grid grid-cols-1 gap-px bg-slate-800 md:grid-cols-3">
                    {[
                      {
                        label: L("Indicators to monitor", "Indicadores a monitorear"),
                        rows: independentBearCaseAnalysis.indicatorsToMonitor,
                        tone: "text-sky-200",
                      },
                      {
                        label: L("Would confirm the bear thesis", "Confirmaría la tesis bajista"),
                        rows: independentBearCaseAnalysis.confirmationConditions,
                        tone: "text-rose-200",
                      },
                      {
                        label: L("Would invalidate it", "La invalidaría"),
                        rows: independentBearCaseAnalysis.invalidationConditions,
                        tone: "text-emerald-200",
                      },
                    ].map((column) => (
                      <div key={column.label} className="bg-slate-950/55 p-4">
                        <p className={`text-[10px] font-semibold uppercase ${column.tone}`}>{column.label}</p>
                        <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-300">
                          {column.rows.slice(0, 5).map((row, index) => (
                            <li key={`${column.label}-${index}`} className="border-l border-slate-700 pl-3">{row}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>

                  <div className="mt-7 border-t border-slate-800">
                    {BEAR_CASE_AREAS.map((definition, index) => {
                      const area = independentBearCaseAnalysis.areas.find((item) => item.key === definition.key);
                      if (!area) return null;
                      const statusTone =
                        area.status === "supported"
                          ? "border-rose-300/35 bg-rose-300/10 text-rose-100"
                          : area.status === "partially_supported"
                            ? "border-amber-300/35 bg-amber-300/10 text-amber-100"
                            : area.status === "not_supported"
                              ? "border-emerald-300/35 bg-emerald-300/10 text-emerald-100"
                              : "border-slate-700 bg-slate-950/60 text-slate-400";
                      return (
                        <details key={definition.key} className="group border-b border-slate-800 py-1">
                          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-2 py-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="text-[10px] font-semibold text-slate-600">{String(index + 1).padStart(2, "0")}</span>
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-100">{bearCaseLabels[definition.key]}</p>
                                <p className="mt-1 line-clamp-1 text-xs text-slate-500">{area.argument}</p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <span className={`rounded-md border px-2 py-1 text-[9px] font-semibold uppercase ${statusTone}`}>
                                {area.status.replace(/_/g, " ")}
                              </span>
                              <ChevronRight className="h-4 w-4 text-slate-600 transition-transform group-open:rotate-90" />
                            </div>
                          </summary>
                          <div className="grid grid-cols-1 gap-px border-t border-slate-800 bg-slate-800 lg:grid-cols-2">
                            <div className="bg-slate-950/60 p-4">
                              <p className="text-[10px] font-semibold uppercase text-rose-200">
                                {L("Evidence supporting the bear argument", "Evidencia que apoya el argumento bajista")}
                              </p>
                              <div className="mt-3 space-y-3">
                                {area.supportingEvidence.map((evidence, evidenceIndex) => (
                                  <div key={evidenceIndex} className="border-l-2 border-rose-300/40 pl-3 text-xs leading-5">
                                    <p className="text-slate-200">{evidence.statement}</p>
                                    <p className="mt-1 text-[10px] text-slate-600">
                                      {evidence.sourceLabel}{evidence.sourceDate ? ` / ${evidence.sourceDate}` : ""}
                                      {evidence.sourceUrl ? (
                                        <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="ml-2 text-cyan-300 hover:text-cyan-200">
                                          {L("Source", "Fuente")}
                                        </a>
                                      ) : null}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="bg-slate-950/60 p-4">
                              <p className="text-[10px] font-semibold uppercase text-emerald-200">
                                {L("Contradictory or mitigating evidence", "Evidencia contradictoria o mitigante")}
                              </p>
                              <div className="mt-3 space-y-3">
                                {area.contradictoryEvidence.map((evidence, evidenceIndex) => (
                                  <div key={evidenceIndex} className="border-l-2 border-emerald-300/40 pl-3 text-xs leading-5">
                                    <p className="text-slate-200">{evidence.statement}</p>
                                    <p className="mt-1 text-[10px] text-slate-600">
                                      {evidence.sourceLabel}{evidence.sourceDate ? ` / ${evidence.sourceDate}` : ""}
                                      {evidence.sourceUrl ? (
                                        <a href={evidence.sourceUrl} target="_blank" rel="noreferrer" className="ml-2 text-cyan-300 hover:text-cyan-200">
                                          {L("Source", "Fuente")}
                                        </a>
                                      ) : null}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-px bg-slate-800 md:grid-cols-2 xl:grid-cols-4">
                            {[
                              { label: L("Financial mechanism", "Mecanismo financiero"), rows: [area.potentialFinancialImpact] },
                              { label: L("Monitor", "Monitorear"), rows: area.indicatorsToMonitor },
                              { label: L("Confirm", "Confirmar"), rows: area.confirmationConditions },
                              { label: L("Invalidate", "Invalidar"), rows: area.invalidationConditions },
                            ].map((item) => (
                              <div key={item.label} className="bg-slate-950/45 p-4">
                                <p className="text-[10px] font-semibold uppercase text-slate-500">{item.label}</p>
                                <ul className="mt-2 space-y-2 text-xs leading-5 text-slate-300">
                                  {item.rows.slice(0, 4).map((row, rowIndex) => <li key={rowIndex}>{row}</li>)}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>

                  {independentBearCaseAnalysis.missingInformation.length ? (
                    <div className="mt-6 border-l-2 border-amber-300/50 pl-4">
                      <p className="text-[10px] font-semibold uppercase text-amber-200">
                        {L("Material evidence still needed", "Evidencia material pendiente")}
                      </p>
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
                        {independentBearCaseAnalysis.missingInformation.slice(0, 8).map((item, index) => <li key={index}>- {item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </section>
        ) : null}

        {activeWorkspaceTab === "research" && engineSnapshot ? (
          <section className="rounded-xl border border-emerald-500/25 bg-slate-900/80 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                <h2 className="text-base font-semibold">
                  {L("Portfolio Research Snapshot", "Snapshot de research del portfolio")}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3 sm:min-w-[520px]">
                <Readout
                  label={L("Positions", "Posiciones")}
                  value={engineSnapshot?.positions?.length ?? 0}
                  hint={L("Research universe", "Universo de research")}
                />
                <Readout
                  label={L("Evidence gaps", "Brechas de evidencia")}
                  value={(engineSnapshot?.documentReadiness ?? []).filter((row: any) => !row.ready).length}
                  hint={L("Missing required documents", "Documentos requeridos pendientes")}
                />
                <Readout
                  label={L("Risk flags", "Alertas de riesgo")}
                  value={engineSnapshot?.riskFlags?.length ?? 0}
                  hint={L("Human review context", "Contexto para revisión humana")}
                />
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-500">
              {L(
                "Valuation posture and evidence only. This engine does not generate target weights, position deltas, price predictions, or trade actions.",
                "Solo postura de valoración y evidencia. Este motor no genera pesos objetivo, deltas de posición, predicciones de precio ni acciones de trading."
              )}
            </p>

            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-950/55 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{L("Ticker", "Símbolo")}</th>
                    <th className="px-3 py-2">{L("Valuation posture", "Postura de valoración")}</th>
                    <th className="px-3 py-2">{L("Current weight", "Peso actual")}</th>
                    <th className="px-3 py-2">{L("Modeled margin of safety", "Margen de seguridad modelado")}</th>
                    <th className="px-3 py-2">{L("Evidence", "Evidencia")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(engineSnapshot?.positions ?? []).map((position: any) => (
                    <tr key={position.ticker} className="border-t border-slate-800">
                      <td className="px-3 py-2 font-semibold text-slate-100">{position.ticker}</td>
                      <td className="px-3 py-2 text-slate-300">{String(position.derived?.verdict ?? "-").replaceAll("_", " ")}</td>
                      <td className="px-3 py-2 text-slate-300">{formatPercent(position.weight, localeTag)}</td>
                      <td className="px-3 py-2 text-slate-300">{formatPercent(position.derived?.marginOfSafety, localeTag)}</td>
                      <td className="px-3 py-2 text-slate-300">
                        {position.documentReadiness?.ready ? L("Ready", "Lista") : L("Incomplete", "Incompleta")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {Array.isArray(engineSnapshot?.riskFlags) && engineSnapshot.riskFlags.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
                {engineSnapshot.riskFlags.map((flag: any, index: number) => (
                  <div key={`${flag.type}-${index}`} className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
                    <p className="font-semibold">{String(flag.type ?? "risk")}</p>
                    <p className="mt-1 text-amber-100/80">{String(flag.message ?? "")}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeWorkspaceTab === "research" && agentReport ? (
          <section className="rounded-xl border border-sky-500/30 bg-slate-900/80 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-sky-300" />
                <h2 className="text-base font-semibold">{L("Neuro Report", "Reporte Neuro")}</h2>
              </div>
              <button
                type="button"
                onClick={() => void downloadReportPdf()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400 hover:text-sky-200"
              >
                <Download className="h-3.5 w-3.5" />
                {L("Download PDF", "Descargar PDF")}
              </button>
            </div>
            <pre className="mt-4 max-h-[620px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm leading-6 text-slate-200">
              {agentReport}
            </pre>
          </section>
        ) : null}

        <section className={activeWorkspaceTab === "research" ? "rounded-xl border border-violet-500/25 bg-slate-900/80 p-5" : "hidden"}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-300" />
                <h2 className="text-base font-semibold">{L("Living Thesis Monitor", "Monitor de tesis viva")}</h2>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                {L(
                  "Tracks open risks, user-provided thesis context, evidence gaps, and what should be checked in the next filing or fund update.",
                  "Monitorea riesgos abiertos, contexto de tesis provisto por ti, brechas de evidencia y qué revisar en el próximo filing o update del fondo."
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs lg:min-w-[420px]">
              <Readout label={L("Thesis notes", "Notas tesis")} value={thesisNotes.length} />
              <Readout label={L("Reports", "Reportes")} value={thesisMonitor.verifiedReports} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
            <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">{L("Open watch items", "Puntos abiertos")}</p>
              <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
                {thesisMonitor.watchItems.length ? (
                  thesisMonitor.watchItems.map((item, index) => (
                    <div
                      key={`${item.title}-${index}`}
                      className={`rounded-lg border p-3 text-xs ${
                        item.tone === "high"
                          ? "border-rose-400/30 bg-rose-400/10 text-rose-100"
                          : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                      }`}
                    >
                      <p className="font-semibold capitalize">{item.title}</p>
                      <p className="mt-1 line-clamp-3 leading-5 opacity-80">{item.body}</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 p-3 text-xs text-emerald-100">
                    {L("No open risk flags yet. Run profile intelligence to generate monitored items.", "Aún no hay risk flags abiertas. Corre inteligencia del profile para generar puntos monitoreados.")}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/45 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">{L("Thesis signal mix", "Mezcla de señales de tesis")}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {["positive", "negative", "mixed", "uncertain"].map((key) => (
                  <div key={key} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-[11px] font-semibold uppercase text-slate-500">{key}</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{thesisMonitor.impactCounts[key] ?? 0}</p>
                  </div>
                ))}
              </div>
              {thesisMonitor.lastNote ? (
                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">{L("Latest context", "Contexto más reciente")}</p>
                  <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-300">
                    {String(thesisMonitor.lastNote.payload?.note ?? "")}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  {L("Add news, observations, or questions below so the agent can maintain a living thesis trail.", "Añade noticias, observaciones o preguntas abajo para que el agente mantenga una tesis viva.")}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className={activeWorkspaceTab === "research" ? "rounded-xl border border-violet-500/25 bg-slate-900/80 p-5" : "hidden"}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-300" />
                <h2 className="text-base font-semibold">{L("Neuro Research Agent", "Neuro Research Agent")}</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {L(
                  "Ask objective questions about the active profile, thesis, dividend safety, valuation, ETF exposure, or what future evidence would change the decision. The agent must say when evidence is missing instead of guessing.",
                  "Haz preguntas objetivas sobre el profile activo, tesis, seguridad del dividendo, valuation, exposición ETF o qué evidencia futura cambiaría la decisión. El agente debe decir cuando falta evidencia en vez de adivinar."
                )}
              </p>
              {!activeCaseId ? (
                <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                  {L(
                    "Save or run a research case to give the agent durable memory. Unsaved screen context is still included for this answer.",
                    "Guarda o corre un caso de research para darle memoria durable al agente. El contexto no guardado de esta pantalla todavía se incluye para esta respuesta."
                  )}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs lg:min-w-[360px]">
              <Readout label={L("Case memory", "Memoria caso")} value={activeCaseId ? L("Saved", "Guardada") : L("Local", "Local")} />
              <Readout label={L("Indexed docs", "Docs indexados")} value={indexedDocuments.length} />
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/45 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold text-slate-100">{L("Thesis Co-Builder", "Constructor de tesis")}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {L(
                    "Add news, events, observations, and questions you want the AI to consider. These notes stay labeled as user-provided context until verified by filings or durable evidence.",
                    "Añade noticias, eventos, observaciones y preguntas que quieres que la AI considere. Estas notas quedan marcadas como contexto provisto por el usuario hasta verificarse con filings o evidencia durable."
                  )}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-700 px-3 py-1 text-slate-400">
                  {thesisNotes.length} {L("context notes", "notas")}
                </span>
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-amber-100">
                  {L("User context", "Contexto usuario")}
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_260px]">
              <textarea
                value={thesisContextNote}
                onChange={(event) => setThesisContextNote(event.target.value)}
                rows={4}
                placeholder={L(
                  "Example: Management announced a product delay, but demand still looks strong. I want to know if this weakens the long-term thesis or only changes the timeline.",
                  "Ejemplo: La gerencia anunció un retraso de producto, pero la demanda todavía se ve fuerte. Quiero saber si esto debilita la tesis a largo plazo o solo cambia el timeline."
                )}
                className="min-h-[120px] w-full resize-none rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-violet-400"
              />
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Context type", "Tipo de contexto")}</span>
                  <select
                    value={thesisSourceType}
                    onChange={(event) => setThesisSourceType(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                  >
                    <option value="news">{L("News / event", "Noticia / evento")}</option>
                    <option value="earnings">{L("Earnings", "Earnings")}</option>
                    <option value="management">{L("Management", "Gerencia")}</option>
                    <option value="competition">{L("Competition", "Competencia")}</option>
                    <option value="macro">{L("Macro", "Macro")}</option>
                    <option value="personal_observation">{L("Observation", "Observación")}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Impact", "Impacto")}</span>
                  <select
                    value={thesisImpact}
                    onChange={(event) => setThesisImpact(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                  >
                    <option value="uncertain">{L("Uncertain", "Incierto")}</option>
                    <option value="positive">{L("Positive", "Positivo")}</option>
                    <option value="negative">{L("Negative", "Negativo")}</option>
                    <option value="mixed">{L("Mixed", "Mixto")}</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Source / title", "Fuente / título")}</span>
                  <input
                    value={thesisSourceLabel}
                    onChange={(event) => setThesisSourceLabel(event.target.value)}
                    placeholder={L("Optional", "Opcional")}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 text-sm text-slate-100 outline-none"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveThesisContext()}
                disabled={thesisSaving || !thesisContextNote.trim()}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-50"
              >
                {thesisSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {thesisSaving ? L("Saving", "Guardando") : L("Save thesis context", "Guardar contexto")}
              </button>
              <button
                type="button"
                onClick={stageThesisUpdateQuestion}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-400/50 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/20"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {L("Prepare thesis update question", "Preparar pregunta de tesis")}
              </button>
            </div>

            {thesisStatus ? <p className="mt-3 text-xs text-emerald-300">{thesisStatus}</p> : null}
            {thesisError ? <p className="mt-3 text-xs text-rose-300">{thesisError}</p> : null}

            {thesisNotes.length > 0 ? (
              <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
                {thesisNotes.slice(0, 4).map((note) => (
                  <div key={note.id} className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                      <span>{String(note.payload?.sourceType ?? "context").replace(/_/g, " ")}</span>
                      <span className="text-slate-700">/</span>
                      <span>{String(note.payload?.impact ?? "uncertain")}</span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-300">
                      {String(note.payload?.note ?? "")}
                    </p>
                    <p className="mt-2 text-[11px] text-slate-600">
                      {note.created_at ? new Date(note.created_at).toLocaleString(localeTag) : ""}
                      {note.payload?.sourceLabel ? ` / ${note.payload.sourceLabel}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
            <textarea
              value={agentQuestion}
              onChange={(event) => setAgentQuestion(event.target.value)}
              rows={3}
              placeholder={L(
                "Example: Based on the current 10-K/10-Q evidence, should this position stay in hold mode or move to exit review?",
                "Ejemplo: Según la evidencia actual de 10-K/10-Q, ¿esta posición debe mantenerse en hold o pasar a revisión de salida?"
              )}
              className="min-h-[92px] w-full resize-none rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-100 outline-none focus:border-violet-400"
            />
            <button
              type="button"
              onClick={() => void askNeuroResearchAgent()}
              disabled={agentQaLoading || !agentQuestion.trim()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-violet-400/60 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-500/20 disabled:opacity-50 lg:self-end"
            >
              {agentQaLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {agentQaLoading ? L("Thinking", "Pensando") : L("Ask agent", "Preguntar")}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {[
              L("What evidence would trigger exit review?", "¿Qué evidencia activaría revisión de salida?"),
              L("Is the dividend thesis supported?", "¿La tesis de dividendos está respaldada?"),
              L("What must remain true for a long-term hold?", "¿Qué debe seguir siendo cierto para mantener a largo plazo?"),
            ].map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => setAgentQuestion(question)}
                className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-violet-400 hover:text-violet-100"
              >
                {question}
              </button>
            ))}
          </div>

          {agentQaError ? <p className="mt-3 text-sm text-rose-300">{agentQaError}</p> : null}

          {agentConversation.length > 0 ? (
            <div className="mt-5 space-y-4">
              {agentConversation.map((item) => (
                <article key={`${item.createdAt}-${item.question}`} className="rounded-xl border border-slate-800 bg-slate-950/55 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
                    {L("Question", "Pregunta")}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-100">{item.question}</p>
                  <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-sm leading-6 text-slate-200">
                    {item.answer}
                  </pre>
                  {item.groundedContext ? (
                    <p className="mt-3 text-[11px] text-slate-500">
                      {L("Grounded on", "Basado en")}{" "}
                      {[
                        `${item.groundedContext.reports ?? 0} ${L("reports", "reportes")}`,
                        `${item.groundedContext.filings ?? 0} ${L("filings", "filings")}`,
                        `${item.groundedContext.priorMemory ?? 0} ${L("memory items", "memorias")}`,
                      ].join(" / ")}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <div className={activeWorkspaceTab === "research" ? "rounded-xl border border-slate-800 bg-slate-900/75 p-4 text-xs leading-5 text-slate-500" : "hidden"}>
          <div className="flex items-start gap-2">
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-sky-300" />
            <p>
              {L(
                "Output is analysis and simulation support for long-term investment decisions. Neuro does not execute trades, custody funds, or guarantee returns; each profile is private research for decisions you manage outside the platform.",
                "La salida es apoyo de análisis y simulación para decisiones de inversión a largo plazo. Neuro no ejecuta trades, no custodia fondos ni garantiza retornos; cada profile es research privado para decisiones que manejas fuera de la plataforma."
              )}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
