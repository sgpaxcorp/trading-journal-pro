"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Download,
  FileText,
  History,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
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
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type Lang = "en" | "es";
type WorkspaceTab = "research" | "screener" | "fund_plan";

type Holding = {
  id: string;
  ticker: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
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
    totalRevenue?: number | null;
    operatingIncome?: number | null;
    netIncome?: number | null;
    operatingCashFlow?: number | null;
    freeCashFlow?: number | null;
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
  };
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
  fiveYearReturn?: number | null;
  valueScore: number;
  qualityScore: number;
  dividendScore: number;
  momentumScore: number;
  potentialScore: number;
  verdict: string;
  dataWarnings?: string[];
};

type SectorScreenerResult = {
  sector: string;
  sectorLabel: string;
  sectors: Array<{ key: string; label: string }>;
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
    ? "Analiza objetivamente esta acción o ETF como inversión a largo plazo y posible posición de dividendos. Si es acción, evalúa perfil del negocio, moat, competencia, calidad de earnings, free cash flow, seguridad del dividendo, documentos necesarios, valoración hoy y fair value proyectado de 2 a 10 años. Si es ETF, evalúa estrategia, holdings, concentración, costo, yield, liquidez, tracking risk y rol dentro de una tesis de largo plazo. Dime si el profile debe añadirse, esperar, mantenerse, aumentarse, reducirse o entrar en revisión de salida."
    : "Objectively analyze this stock or ETF as a long-term investment and possible dividend holding. If it is a stock, evaluate business profile, moat, competition, earnings quality, free cash flow, dividend safety, required documents, valuation today, and projected fair value from years 2 through 10. If it is an ETF, evaluate strategy, holdings, concentration, cost, yield, liquidity, tracking risk, and role inside a long-term thesis. Tell me whether the profile should be added, waited on, held, increased, reduced, or moved into exit review.";
}

function isLegacyResearchGoal(value: string) {
  const text = value.trim().toLowerCase();
  return (
    (text.includes("capital") && text.includes("well allocated")) ||
    (text.includes("capital") && text.includes("allocation")) ||
    (text.includes("capital") && text.includes("asignado"))
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
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(parsed) >= 1000 ? 0 : 2,
  }).format(parsed);
}

function formatCompactCurrency(value: number | null | undefined, localeTag: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(parsed);
}

function formatPercent(value: number | null | undefined, localeTag: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return new Intl.NumberFormat(localeTag, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(parsed);
}

function formatCompactNumber(value: number | null | undefined, localeTag: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
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

function makeHolding(ticker = "", shares = 0, averageCost = 0, currentPrice = 0): Holding {
  return {
    id: makeId(ticker || "position"),
    ticker,
    shares,
    averageCost,
    currentPrice,
    openedAt: oneYearAgoInputDate(),
  };
}

const INITIAL_PORTFOLIO_HOLDINGS: Holding[] = [
  {
    id: "position-aapl-initial",
    ticker: "AAPL",
    shares: 0,
    averageCost: 0,
    currentPrice: 0,
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

function annualizedReturn(currentValue: number, invested: number, openedAt?: string | null) {
  const days = daysSince(openedAt);
  if (!days || days < 30 || currentValue <= 0 || invested <= 0) return null;
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

export default function NeuroAnalysisPage() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale) as Lang;
  const isEs = lang === "es";
  const localeTag = LOCALE_TAG[lang];
  const L = (en: string, es: string) => (isEs ? es : en);

  const [focusTicker, setFocusTicker] = useState("AAPL");
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
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [caseTitle, setCaseTitle] = useState("");
  const [cases, setCases] = useState<NeuroCaseSummary[]>([]);
  const [reports, setReports] = useState<NeuroReportSummary[]>([]);
  const [caseSaving, setCaseSaving] = useState(false);
  const [caseStatus, setCaseStatus] = useState("");
  const [agentError, setAgentError] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [documentLookup, setDocumentLookup] = useState<any[]>([]);
  const [documentLookupLoading, setDocumentLookupLoading] = useState(false);
  const [documentLookupError, setDocumentLookupError] = useState("");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>("research");
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
  const [screenerSector, setScreenerSector] = useState("technology");
  const [screenerCustomTickers, setScreenerCustomTickers] = useState("");
  const [screenerLoading, setScreenerLoading] = useState(false);
  const [screenerError, setScreenerError] = useState("");
  const [screenerResult, setScreenerResult] = useState<SectorScreenerResult | null>(null);
  const [fundInitialCapital, setFundInitialCapital] = useState(100000);
  const [fundMonthlyGoal, setFundMonthlyGoal] = useState(5000);
  const [fundAnnualReturnPct, setFundAnnualReturnPct] = useState(10);
  const [fundSelectedYear, setFundSelectedYear] = useState(10);
  const [portfolioHoldings, setPortfolioHoldings] = useState<Holding[]>(INITIAL_PORTFOLIO_HOLDINGS);
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
      return;
    }
    void loadThesisContext(activeCaseId);
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
          toNumber(marketItem?.market?.regularMarketPrice) ||
          toNumber(marketItem?.market?.previousClose) ||
          toNumber(holding.currentPrice);
        const shares = Math.max(0, toNumber(holding.shares));
        const averageCost = Math.max(0, toNumber(holding.averageCost));
        const invested = shares * averageCost;
        const value = shares * currentPrice;
        const pnl = value - invested;
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
          pnlPct: invested > 0 ? pnl / invested : null,
          annualizedReturn: annualized,
          dividendYield: marketItem?.fund?.yield ?? marketItem?.market?.dividendYield ?? null,
          companyName: marketItem?.company?.shortName || marketItem?.company?.name || ticker,
          sector: marketItem?.company?.sector || marketItem?.fund?.categoryName || marketItem?.company?.quoteType || null,
        };
      })
      .filter(Boolean) as Array<
      Holding & {
        invested: number;
        value: number;
        pnl: number;
        pnlPct: number | null;
        annualizedReturn: number | null;
        dividendYield: number | null;
        companyName: string;
        sector: string | null;
      }
    >;
    const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
    return rows.map((row) => ({
      ...row,
      weight: totalValue > 0 ? row.value / totalValue : null,
    }));
  }, [marketDataByTicker, portfolioHoldings]);
  const portfolioSummary = useMemo(() => {
    const activeRows = portfolioPositions.filter((row) => row.shares > 0 && row.ticker);
    const totalValue = activeRows.reduce((sum, row) => sum + row.value, 0);
    const totalInvested = activeRows.reduce((sum, row) => sum + row.invested, 0);
    const totalPnl = totalValue - totalInvested;
    const annualizedWeightBase = activeRows.reduce(
      (sum, row) => sum + (row.annualizedReturn != null ? row.invested : 0),
      0
    );
    const annualized =
      annualizedWeightBase > 0
        ? activeRows.reduce(
            (sum, row) => sum + (row.annualizedReturn != null ? row.annualizedReturn * row.invested : 0),
            0
          ) / annualizedWeightBase
        : null;
    const incomeYield =
      totalValue > 0
        ? activeRows.reduce((sum, row) => sum + row.value * (toNumber(row.dividendYield) || 0), 0) / totalValue
        : null;
    return {
      count: activeRows.length,
      totalValue,
      totalInvested,
      totalPnl,
      totalPnlPct: totalInvested > 0 ? totalPnl / totalInvested : null,
      annualizedReturn: annualized,
      incomeYield,
      largestPosition: activeRows
        .slice()
        .sort((a, b) => b.value - a.value)[0] ?? null,
    };
  }, [portfolioPositions]);
  const researchHoldings = useMemo(() => {
    const activePortfolioRows = portfolioPositions.filter((row) => row.ticker && row.shares > 0);
    if (activePortfolioRows.length) {
      return activePortfolioRows.map((row) => ({
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
        weight: row.weight ?? 0,
      }));
    }
    const ticker = focusTicker.trim().toUpperCase();
    if (!ticker) return [];
    const price =
      toNumber(marketData?.market?.regularMarketPrice) ||
      toNumber(marketData?.market?.previousClose) ||
      toNumber(marketDataByTicker[ticker]?.market?.regularMarketPrice) ||
      toNumber(marketDataByTicker[ticker]?.market?.previousClose);
    return [
      {
        id: `profile-${ticker}`,
        ticker,
        shares: 1,
        averageCost: price,
        currentPrice: price,
        openedAt: null,
        invested: price,
        value: price,
        pnl: 0,
        pnlPct: 0,
        annualizedReturn: null,
        weight: 1,
        researchOnly: true,
      },
    ];
  }, [
    focusTicker,
    marketData?.market?.previousClose,
    marketData?.market?.regularMarketPrice,
    marketDataByTicker,
    portfolioPositions,
  ]);

  const indexedDocuments = filings.filter((filing) => Boolean(filing.vectorStoreId));
  const pendingDocuments = filings.filter((filing) => !filing.vectorStoreId);
  const profileTickers = useMemo(
    () =>
      Array.from(
        new Set([
          focusTicker.trim().toUpperCase(),
          BENCHMARK_TICKER,
          ...portfolioHoldings.map((holding) => holding.ticker.trim().toUpperCase()),
        ])
      ).filter(Boolean),
    [focusTicker, portfolioHoldings]
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
  const benchmarkData = marketDataByTicker[BENCHMARK_TICKER] ?? null;
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
    .slice()
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
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
    const sectorRows = aggregateByKey(
      activePortfolioPositions,
      (row) => row.sector || "Unclassified",
      (row) => row.value
    );
    const instrumentRows = aggregateByKey(
      activePortfolioPositions,
      (row) => {
        const item = marketDataByTicker[row.ticker];
        if (isFundLikeMarketData(item)) return "ETF / fund";
        return item?.company?.quoteType || item?.instrumentType || "Stock";
      },
      (row) => row.value
    );
    const topHoldings = new Map<string, { name: string; value: number; funds: string[] }>();
    for (const row of activePortfolioPositions) {
      const item = marketDataByTicker[row.ticker];
      for (const holding of item?.fund?.topHoldings ?? []) {
        const symbol = String(holding.symbol ?? holding.holdingName ?? "").trim().toUpperCase();
        if (!symbol) continue;
        const holdingWeight = toNumber(holding.holdingPercent);
        const contribution = row.value * (holdingWeight > 1 ? holdingWeight / 100 : holdingWeight);
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
        weight: portfolioSummary.totalValue > 0 ? row.value / portfolioSummary.totalValue : null,
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
    const marginOfSafety = Number(focusEnginePosition?.derived?.marginOfSafety);
    const fcfMargin = Number(latest?.fcfMargin ?? focusEnginePosition?.derived?.fcfMargin);
    const debtToEquity = Number(latest?.debtToEquity ?? focusEnginePosition?.derived?.debtToEquity);
    const dividendYield = toNumber(marketData?.fund?.yield ?? marketData?.market?.dividendYield);
    const qualityScore =
      scoreFromBoolean(annualFundamentals.length >= 3 || Boolean(marketData?.fund), 20) +
      scoreFromBoolean(Number.isFinite(fcfMargin) && fcfMargin > 0.05, 25) +
      scoreFromBoolean(!Number.isFinite(debtToEquity) || debtToEquity < 1.5, 20) +
      scoreFromBoolean(Boolean(marketData?.priceHistory?.length), 15) +
      scoreFromBoolean(!marketData?.dataQuality?.degraded, 20);
    const valuationScore =
      Number.isFinite(marginOfSafety)
        ? clampNumber(50 + marginOfSafety * 140, 0, 100)
        : focusEnginePosition?.derived?.valuationStatus === "undervalued"
        ? 75
        : focusEnginePosition?.derived?.valuationStatus === "overvalued"
        ? 35
        : 50;
    const dividendScore =
      scoreFromBoolean(dividendYield > 0, 30) +
      scoreFromBoolean(dividendYield > 0.015 && dividendYield < 0.08, 30) +
      scoreFromBoolean(Number.isFinite(fcfMargin) && fcfMargin > 0, 25) +
      scoreFromBoolean(!Number.isFinite(debtToEquity) || debtToEquity < 2, 15);
    const evidenceScore =
      scoreFromBoolean(Boolean(marketLayerReady), 25) +
      scoreFromBoolean(Boolean(documentRow?.ready), 35) +
      scoreFromBoolean(Boolean(agentReport), 25) +
      scoreFromBoolean(thesisNotes.length > 0, 15);
    const riskScore =
      scoreFromBoolean(!(portfolioSummary.largestPosition?.weight && portfolioSummary.largestPosition.weight > 0.35), 25) +
      scoreFromBoolean(!marketData?.dataQuality?.degraded, 20) +
      scoreFromBoolean(!researchQueue.length, 20) +
      scoreFromBoolean(!(Number.isFinite(debtToEquity) && debtToEquity > 2), 20) +
      scoreFromBoolean(Boolean(marketData?.priceHistory?.length), 15);
    const overall = Math.round((qualityScore + valuationScore + dividendScore + evidenceScore + riskScore) / 5);
    return {
      overall,
      qualityScore,
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
          readiness: { documentReadiness: documentReadinessRows, readinessScore },
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
    setFocusTicker(String(researchCase.focus_ticker ?? focusTicker));
    setResearchGoal(String(researchCase.research_goal ?? researchGoal));
    if (Array.isArray(researchCase.holdings) && researchCase.holdings.length > 0) {
      setPortfolioHoldings(
        researchCase.holdings.map((holding: any, index: number) => ({
          id: makeId(`${holding?.ticker ?? "position"}-${index}`),
          ticker: String(holding?.ticker ?? "").toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12),
          shares: Math.max(0, toNumber(holding?.shares)),
          averageCost: Math.max(0, toNumber(holding?.averageCost)),
          currentPrice: Math.max(0, toNumber(holding?.currentPrice)),
          openedAt: String(holding?.openedAt ?? holding?.opened_at ?? oneYearAgoInputDate()).slice(0, 10),
        }))
      );
    }
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
    }
  }

  function openSavedReport(report: NeuroReportSummary) {
    setActiveReportId(String(report.id));
    setAgentReport(String(report.report_text ?? ""));
    setEngineSnapshot(report.engine ?? report.structured?.engine ?? null);
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

  async function findCompanyDocuments() {
    try {
      setDocumentLookupLoading(true);
      setDocumentLookupError("");
      const res = await authedFetch(`/api/neuro-analysis/company-documents?ticker=${encodeURIComponent(focusTicker)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not find recent company documents.");
      setDocumentLookup(Array.isArray(json?.documents) ? json.documents : []);
    } catch (error: any) {
      setDocumentLookupError(error?.message || "Could not find recent company documents.");
    } finally {
      setDocumentLookupLoading(false);
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

    const ready: FilingUpload = {
      ...filing,
      id: String(json.id ?? filing.id),
      ticker: String(json.ticker ?? focusTicker),
      file: undefined,
      fileId: String(json.fileId ?? ""),
      vectorStoreId: String(json.vectorStoreId ?? ""),
      fiscalYear: json.fiscalYear == null ? filing.fiscalYear ?? null : Number(json.fiscalYear),
      period: json.period ?? filing.period ?? null,
      periodEnd: json.periodEnd ?? filing.periodEnd ?? null,
      bytes: Number(json.bytes ?? filing.bytes ?? 0),
      usageBytes: Number(json.usageBytes ?? 0),
      expiresAt: json.expiresAt ?? null,
      createdAt: json.createdAt ?? null,
      expiresAfterDays: Number(json.expiresAfterDays ?? 0),
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

  async function runNeuroAgent() {
    setAgentLoading(true);
    setAgentError("");
    setAgentReport("");
    try {
      const token = await authToken();
      if (!token) throw new Error(L("Sign in to run Neuro Analysis.", "Inicia sesión para correr Neuro Analysis."));
      if (!focusTicker.trim()) {
        throw new Error(L("Choose a focus ticker first.", "Escoge un ticker foco primero."));
      }

      const uploadedFilings = (
        await Promise.all(filings.map((filing) => uploadDocumentIfNeeded(filing, token)))
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
          })),
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
          },
          marketData: marketPayload,
          uploadedFilings,
          question: `${researchGoal}\n\n${isEs ? "No reveles nombres de proveedores, fuentes privadas ni metodologías internas." : "Do not reveal provider names, private sources, or internal methodologies."}`,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Neuro Analysis failed.");
      }
      setAgentReport(String(json?.report ?? ""));
      setEngineSnapshot(json?.engine ?? json?.structured?.engine ?? null);
      if (json?.caseId) setActiveCaseId(String(json.caseId));
      if (json?.reportId) setActiveReportId(String(json.reportId));
      await loadCaseList(json?.caseId ? String(json.caseId) : activeCaseId);
    } catch (error: any) {
      setAgentError(error?.message || "Neuro Analysis failed.");
    } finally {
      setAgentLoading(false);
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
            })),
            marketData: marketPayload,
            documentReadiness: documentReadinessRows,
            engineSnapshot,
            currentReport: agentReport,
            filings: serializableFilings,
            thesisNotes,
          },
        }),
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
      const params = new URLSearchParams({ sector: screenerSector });
      if (screenerCustomTickers.trim()) params.set("tickers", screenerCustomTickers.trim());
      const res = await authedFetch(`/api/neuro-analysis/sector-screener?${params.toString()}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Sector screener failed.");
      setScreenerResult(json as SectorScreenerResult);
      if (json?.sector) setScreenerSector(String(json.sector));
    } catch (error: any) {
      setScreenerError(error?.message || "Sector screener failed.");
    } finally {
      setScreenerLoading(false);
    }
  }

  function openScreenerTicker(ticker: string) {
    const nextTicker = ticker.trim().toUpperCase();
    if (!nextTicker) return;
    setFocusTicker(nextTicker);
    setResearchGoal(defaultResearchGoal(isEs));
    setActiveWorkspaceTab("research");
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
                patch.averageCost === undefined ? holding.averageCost : Math.max(0, toNumber(patch.averageCost)),
              currentPrice:
                patch.currentPrice === undefined ? holding.currentPrice : Math.max(0, toNumber(patch.currentPrice)),
              openedAt: patch.openedAt === undefined ? holding.openedAt : patch.openedAt || todayInputDate(),
            }
          : holding
      )
    );
  }

  function addPortfolioHolding(ticker = focusTicker) {
    const nextTicker = ticker.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
    setPortfolioHoldings((prev) => [...prev, makeHolding(nextTicker, 0, 0, 0)]);
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
              <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,420px)_auto] sm:items-center">
                <input
                  value={caseTitle}
                  onChange={(event) => setCaseTitle(event.target.value)}
                  placeholder={L("Research case name", "Nombre del caso de research")}
                  className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none focus:border-sky-400"
                />
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
              id: "research" as const,
              icon: Search,
              title: L("Profiles", "Profiles"),
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
              <Readout label={BENCHMARK_TICKER} value={formatPercent(benchmarkAnnualizedReturn, localeTag)} hint={L("Benchmark", "Benchmark")} />
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
                            className={row.pnl >= 0 ? "h-full rounded-full bg-emerald-400" : "h-full rounded-full bg-rose-400"}
                            style={{
                              width: `${Math.min(100, Math.max(6, Math.abs(row.pnlPct ?? 0) * 100))}%`,
                            }}
                          />
                        </div>
                        <span className={row.pnl >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}>
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
                      {L("Upload or index the missing evidence before treating the verdict as high confidence.", "Sube o indexa la evidencia faltante antes de tratar el veredicto como alta confianza.")}
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
                        value={position.averageCost}
                        onChange={(event) => updatePortfolioHolding(position.id, { averageCost: toNumber(event.target.value) })}
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
                    <td className={`px-3 py-2 font-semibold ${position.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
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
                            setFocusTicker(position.ticker);
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
                    const weight = portfolioSummary.totalValue > 0 ? row.value / portfolioSummary.totalValue : 0;
                    return (
                      <div key={row.name}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="truncate text-slate-300">{row.name}</span>
                          <span className="font-semibold text-slate-100">{formatPercent(weight, localeTag)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.min(100, weight * 100)}%` }} />
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
                    const weight = portfolioSummary.totalValue > 0 ? row.value / portfolioSummary.totalValue : 0;
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

        <section
          className={
            activeWorkspaceTab !== "research"
              ? "space-y-5"
              : "grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]"
          }
        >
          <div className="space-y-5">
            <div className={`${activeWorkspaceTab === "fund_plan" ? "" : "hidden"} space-y-5`}>
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
                    <h2 className="text-base font-semibold">{L("Sector Value Screener", "Screener de valor por sector")}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "Pull market and fundamental data for a sector universe, calculate sector valuation medians, and rank companies by value, quality, dividends, momentum, and relative potential.",
                      "Trae data de mercado y fundamentales para un universo sectorial, calcula medianas de valuation del sector y rankea compañías por valor, calidad, dividendos, momentum y potencial relativo."
                    )}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:min-w-[360px]">
                  <Readout label={L("Market", "Mercado")} value="US" />
                  <Readout label={L("Companies", "Compañías")} value={screenerResult?.rows?.length ?? "-"} />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-[220px_1fr_auto]">
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
                    <Readout label={L("High potential", "Alto potencial")} value={screenerResult.summary?.highPotentialCount ?? 0} />
                  </div>

                  <div className="mt-5 overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full min-w-[1180px] text-left text-sm">
                      <thead className="bg-slate-950/55 text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2">{L("Company", "Compañía")}</th>
                          <th className="px-3 py-2">{L("Potential", "Potencial")}</th>
                          <th className="px-3 py-2">{L("Value", "Valor")}</th>
                          <th className="px-3 py-2">{L("Quality", "Calidad")}</th>
                          <th className="px-3 py-2">{L("Dividend", "Dividendo")}</th>
                          <th className="px-3 py-2">{L("FCF yield", "FCF yield")}</th>
                          <th className="px-3 py-2">{L("Forward P/E", "Forward P/E")}</th>
                          <th className="px-3 py-2">{L("Revenue CAGR", "Revenue CAGR")}</th>
                          <th className="px-3 py-2">{L("FCF margin", "Margen FCF")}</th>
                          <th className="px-3 py-2">{L("Verdict", "Veredicto")}</th>
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
                            <td className="px-3 py-2 font-semibold text-emerald-300">{row.potentialScore}</td>
                            <td className="px-3 py-2 text-slate-300">{row.valueScore}</td>
                            <td className="px-3 py-2 text-slate-300">{row.qualityScore}</td>
                            <td className="px-3 py-2 text-slate-300">{row.dividendScore}</td>
                            <td className="px-3 py-2 text-slate-300">{formatPercent(row.fcfYield, localeTag)}</td>
                            <td className="px-3 py-2 text-slate-300">{formatCompactNumber(row.forwardPE ?? row.trailingPE, localeTag)}</td>
                            <td className="px-3 py-2 text-slate-300">{formatPercent(row.revenueCagr, localeTag)}</td>
                            <td className="px-3 py-2 text-slate-300">{formatPercent(row.fcfMargin, localeTag)}</td>
                            <td className="px-3 py-2 text-slate-300">{row.verdict.replace(/_/g, " ")}</td>
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
                      "This screener is a first-pass ranking. A high score means the company deserves deeper research, not that it should be bought. Confirm with filings, thesis context, valuation, and risk review.",
                      "Este screener es un ranking inicial. Un score alto significa que la compañía merece research más profundo, no que se debe comprar. Confirma con filings, contexto de tesis, valuation y revisión de riesgo."
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
                <label className="block lg:w-40">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Focus ticker", "Ticker foco")}</span>
                  <input
                    value={focusTicker}
                    onChange={(event) => setFocusTicker(event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12))}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 text-sm font-semibold text-slate-100 outline-none focus:border-sky-400"
                  />
                </label>
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
                  value={focusInstrumentIsFundLike ? marketData?.fund?.categoryName || marketData?.company?.quoteType || "ETF" : latestFundamentals?.year ?? "-"}
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

            <div className={`${activeWorkspaceTab === "research" ? "" : "hidden"} rounded-xl border border-sky-500/25 bg-slate-900/75 p-5 shadow-lg shadow-slate-950/20`}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-sky-300" />
                    <h2 className="text-base font-semibold">{L("Company / ETF Profile 360", "Company / ETF Profile 360")}</h2>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    {L(
                      "Fast research card for quality, valuation, dividends, evidence, and portfolio risk.",
                      "Tarjeta rápida de research para calidad, valoración, dividendos, evidencia y riesgo de cartera."
                    )}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/55 px-4 py-3 text-right">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">{L("Overall score", "Score general")}</p>
                  <p className={`mt-1 text-2xl font-bold ${scoreTone(focusProfile360.overall)}`}>{focusProfile360.overall}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-5">
                <ScoreBar
                  label={L("Quality", "Calidad")}
                  score={focusProfile360.qualityScore}
                  hint={L("Margins, balance sheet, history, and data quality.", "Márgenes, balance, historial y calidad de data.")}
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
          </div>

          <aside className={activeWorkspaceTab === "research" ? "space-y-5 xl:sticky xl:top-24 xl:self-start" : "hidden"}>
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-300" />
                <h2 className="text-base font-semibold">{L("Investment Thesis Run", "Investment Thesis Run")}</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {L(
                  "Run the current profile through market data, evidence, valuation, dividends, and thesis review.",
                  "Corre el profile actual con data de mercado, evidencia, valoración, dividendos y revisión de tesis."
                )}
              </p>

              <div className="mt-4 space-y-3">
                {readinessItems.map((item) => (
                  <StatusItem key={item.title} done={item.done} title={item.title} body={item.body} />
                ))}
              </div>

              <label className="mt-4 block">
                <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Research question", "Pregunta de research")}</span>
                <textarea
                  value={researchGoal}
                  onChange={(event) => setResearchGoal(event.target.value)}
                  rows={4}
                  className="mt-1 w-full resize-none rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm leading-6 text-slate-100 outline-none"
                />
              </label>

              <button
                type="button"
                onClick={() => void runNeuroAgent()}
                disabled={agentLoading || !focusTicker.trim()}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {agentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {agentLoading ? L("Running research...", "Corriendo research...") : L("Run profile intelligence", "Correr inteligencia del profile")}
              </button>
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
                      "Add recent annual and quarterly PDFs to strengthen future thesis reviews.",
                      "Añade PDFs anuales y trimestrales recientes para fortalecer futuras revisiones de tesis."
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
                <div className="mt-3 max-h-40 space-y-2 overflow-auto rounded-lg border border-slate-800 bg-slate-950/45 p-2">
                  {documentLookup.slice(0, 6).map((doc: any) => (
                    <a
                      key={`${doc.accessionNumber}-${doc.form}`}
                      href={doc.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300 hover:border-sky-400 hover:text-sky-200"
                    >
                      <span className="font-semibold">{doc.form}</span>
                      <span className="ml-2 text-slate-500">{doc.periodEnd || doc.filingDate || "-"}</span>
                    </a>
                  ))}
                </div>
              ) : null}

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

        {activeWorkspaceTab === "research" && engineSnapshot ? (
          <section className="rounded-xl border border-emerald-500/25 bg-slate-900/80 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                <h2 className="text-base font-semibold">
                  {L("Investment Decision Simulation", "Simulación de decisión de inversión")}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3 sm:min-w-[520px]">
                <Readout
                  label={L("Current projection", "Proyección actual")}
                  value={formatCurrency(engineSnapshot?.simulation?.currentProjectedValue, localeTag)}
                  hint={formatPercent(engineSnapshot?.simulation?.currentExpectedReturn, localeTag)}
                />
                <Readout
                  label={L("Suggested projection", "Proyección sugerida")}
                  value={formatCurrency(engineSnapshot?.simulation?.suggestedProjectedValue, localeTag)}
                  hint={formatPercent(engineSnapshot?.simulation?.suggestedExpectedReturn, localeTag)}
                />
                <Readout
                  label={L("Expected delta", "Delta esperado")}
                  value={formatPercent(engineSnapshot?.simulation?.expectedReturnDelta, localeTag)}
                  hint={`${engineSnapshot?.simulation?.horizonYears ?? 5} yrs`}
                />
              </div>
            </div>

            <div className="mt-5 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-950/55 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{L("Ticker", "Símbolo")}</th>
                    <th className="px-3 py-2">{L("Verdict", "Veredicto")}</th>
                    <th className="px-3 py-2">{L("Current weight", "Peso actual")}</th>
                    <th className="px-3 py-2">{L("Target weight", "Peso sugerido")}</th>
                    <th className="px-3 py-2">{L("Position delta", "Delta posición")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(engineSnapshot?.allocation ?? []).map((row: any) => (
                    <tr key={row.ticker} className="border-t border-slate-800">
                      <td className="px-3 py-2 font-semibold text-slate-100">{row.ticker}</td>
                      <td className="px-3 py-2 text-slate-300">{String(row.verdict ?? "-")}</td>
                      <td className="px-3 py-2 text-slate-300">{formatPercent(row.currentWeight, localeTag)}</td>
                      <td className="px-3 py-2 text-slate-300">{formatPercent(row.targetWeight, localeTag)}</td>
                      <td className={`px-3 py-2 font-semibold ${Number(row.deltaValue) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {formatCurrency(row.deltaValue, localeTag)}
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
