"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Download,
  FileText,
  History,
  Link2,
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
  WalletCards,
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
import {
  areBrokerConnectionsEnabledFromEnv,
  brokerConnectionsUnavailableMessage,
} from "@/lib/brokerConnections";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type Lang = "en" | "es";
type WorkspaceTab = "research" | "portfolio" | "screener" | "fund_plan";

type Holding = {
  id: string;
  ticker: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
  source?: "manual" | "broker";
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
  };
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
  errors?: Record<string, string | null>;
};

type BrokerAccount = {
  id?: string;
  accountId?: string;
  account_id?: string;
  name?: string;
  number?: string;
  institution_name?: string;
  institutionName?: string;
  brokerage_authorization?: { name?: string };
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

const PREMIUM_OUTPUTS = [
  {
    title: "Private company profile",
    esTitle: "Perfil privado de compañía",
    body: "Business model, durability, moat, competitors, filing evidence, and why the company matters.",
    esBody: "Modelo de negocio, durabilidad, moat, competidores, evidencia de filings y por qué importa la compañía.",
  },
  {
    title: "Dividend and cash-flow quality",
    esTitle: "Calidad de dividendos y cash flow",
    body: "Dividend safety, payout pressure, free-cash-flow coverage, balance sheet risk, and reinvestment runway.",
    esBody: "Seguridad del dividendo, presión del payout, cobertura de free cash flow, riesgo de balance y runway de reinversión.",
  },
  {
    title: "Long-term intrinsic value",
    esTitle: "Valor intrínseco a largo plazo",
    body: "Bear/base/bull fair-value ladder with discount rate, owner earnings logic, and margin of safety.",
    esBody: "Escalera de fair value bear/base/bull con tasa de descuento, lógica de owner earnings y margen de seguridad.",
  },
  {
    title: "Living thesis verdict",
    esTitle: "Veredicto de tesis viva",
    body: "Add, wait, hold, reduce, exit review, or watchlist based on valuation, dividends, and future filings.",
    esBody: "Añadir, esperar, mantener, reducir, revisar salida o watchlist según valuation, dividendos y filings futuros.",
  },
];

function defaultResearchGoal(isEs: boolean) {
  return isEs
    ? "Analiza objetivamente la compañía como inversión a largo plazo y posible posición de dividendos: perfil del negocio, moat, competencia, calidad de earnings, free cash flow, seguridad del dividendo, documentos necesarios, valoración hoy y fair value proyectado de 2 a 10 años. Dime si la posición debe añadirse, esperar, mantenerse, aumentarse, reducirse o entrar en revisión de salida. Define qué tendría que aparecer en futuros 10-Q/10-K para cambiar la tesis."
    : "Objectively analyze the company as a long-term investment and possible dividend holding: business profile, moat, competition, earnings quality, free cash flow, dividend safety, required documents, valuation today, and projected fair value from years 2 through 10. Tell me whether the position should be added, waited on, held, increased, reduced, or moved into exit review. Define what future 10-Q/10-K evidence would change the thesis.";
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

function makeHolding(ticker = "", shares = 0, averageCost = 0, currentPrice = 0, source: Holding["source"] = "manual"): Holding {
  return {
    id: makeId(ticker || "holding"),
    ticker,
    shares,
    averageCost,
    currentPrice,
    source,
  };
}

function accountIdOf(account: BrokerAccount) {
  return String(account?.id ?? account?.accountId ?? account?.account_id ?? "");
}

function accountLabel(account: BrokerAccount) {
  return String(
    pickFirst(
      account?.name,
      account?.institution_name,
      account?.institutionName,
      account?.brokerage_authorization?.name,
      account?.number,
      accountIdOf(account)
    ) ?? "Research account"
  );
}

function extractPositions(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (Array.isArray(item?.positions)) return item.positions;
      if (Array.isArray(item?.holdings)) return item.holdings;
      return item ? [item] : [];
    });
  }
  if (Array.isArray(raw?.positions)) return raw.positions;
  if (Array.isArray(raw?.holdings)) return raw.holdings;
  if (Array.isArray(raw?.accounts)) {
    return raw.accounts.flatMap((account: any) => account?.positions ?? account?.holdings ?? []);
  }
  return [];
}

function normalizeBrokerHoldings(raw: any): Holding[] {
  const positions = extractPositions(raw);
  return positions
    .map((position, index) => {
      const ticker = String(
        pickFirst(
          position?.symbol?.symbol,
          position?.symbol?.ticker,
          position?.instrument?.symbol,
          position?.instrument?.ticker,
          position?.security?.symbol,
          position?.ticker,
          position?.symbol
        ) ?? ""
      )
        .toUpperCase()
        .replace(/[^A-Z0-9.-]/g, "")
        .slice(0, 12);
      if (!ticker) return null;

      const shares = toNumber(
        pickFirst(position?.quantity, position?.qty, position?.units, position?.shares, position?.open_quantity)
      );
      if (shares <= 0) return null;

      const marketValue = toNumber(
        pickFirst(position?.market_value, position?.marketValue, position?.value, position?.marketValueUsd)
      );
      const currentPrice =
        toNumber(pickFirst(position?.price, position?.market_price, position?.last_price, position?.lastPrice)) ||
        (marketValue > 0 ? marketValue / shares : 0);
      const averageCost =
        toNumber(
          pickFirst(
            position?.average_purchase_price,
            position?.averagePurchasePrice,
            position?.average_price,
            position?.avg_price,
            position?.avgCost,
            position?.cost_basis_price
          )
        ) || currentPrice;

      return {
        id: makeId(`${ticker}-${index}`),
        ticker,
        shares,
        averageCost,
        currentPrice,
        source: "broker" as const,
      };
    })
    .filter(Boolean) as Holding[];
}

function normalizeSavedHoldings(raw: any): Holding[] {
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .map((holding, index) => {
      if (holding?.researchOnly) return null;
      const ticker = String(holding?.ticker ?? "")
        .toUpperCase()
        .replace(/[^A-Z0-9.-]/g, "")
        .slice(0, 12);
      if (!ticker) return null;
      return {
        id: String(holding?.id ?? makeId(`${ticker}-${index}`)),
        ticker,
        shares: toNumber(holding?.shares),
        averageCost: toNumber(holding?.averageCost),
        currentPrice: toNumber(holding?.currentPrice),
        source: holding?.source === "broker" ? ("broker" as const) : ("manual" as const),
      };
    })
    .filter(Boolean) as Holding[];
}

function pickBalanceObject(raw: any) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  if (Array.isArray(raw?.data)) return raw.data[0] ?? null;
  if (Array.isArray(raw?.balances)) return raw.balances[0] ?? null;
  if (raw?.balances && typeof raw.balances === "object") return raw.balances;
  if (raw?.data && typeof raw.data === "object") return raw.data;
  if (raw?.balance && typeof raw.balance === "object") return raw.balance;
  return raw;
}

function Readout({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/55 p-3">
      <p className="text-[11px] font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-50">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
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
    <div className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/45 p-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      )}
      <div>
        <p className="text-sm font-semibold text-slate-100">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{body}</p>
      </div>
    </div>
  );
}

export default function NeuroAnalysisPage() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale) as Lang;
  const isEs = lang === "es";
  const localeTag = LOCALE_TAG[lang];
  const L = (en: string, es: string) => (isEs ? es : en);
  const brokerConnectionsEnabled = areBrokerConnectionsEnabledFromEnv();
  const brokerUnavailableMessage = brokerConnectionsUnavailableMessage(lang);

  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [focusTicker, setFocusTicker] = useState("AAPL");
  const [researchGoal, setResearchGoal] = useState(defaultResearchGoal(isEs));
  const [filings, setFilings] = useState<FilingUpload[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(false);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [marketDataByTicker, setMarketDataByTicker] = useState<Record<string, MarketData>>({});
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");
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
  const [brokerAccounts, setBrokerAccounts] = useState<BrokerAccount[]>([]);
  const [brokerAccountId, setBrokerAccountId] = useState("");
  const [brokerLoading, setBrokerLoading] = useState(false);
  const [brokerConnecting, setBrokerConnecting] = useState(false);
  const [brokerStatus, setBrokerStatus] = useState("");
  const [brokerError, setBrokerError] = useState("");
  const [brokerBalances, setBrokerBalances] = useState<any | null>(null);
  const [lastPortfolioImportAt, setLastPortfolioImportAt] = useState<string | null>(null);
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

  const portfolio = useMemo(() => {
    const rows = holdings
      .filter((holding) => holding.ticker.trim())
      .map((holding) => {
        const invested = holding.shares * holding.averageCost;
        const value = holding.shares * holding.currentPrice;
        const pnl = value - invested;
        const pnlPct = invested > 0 ? pnl / invested : 0;
        return { ...holding, invested, value, pnl, pnlPct };
      });
    const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
    const totalInvested = rows.reduce((sum, row) => sum + row.invested, 0);
    const totalPnl = totalValue - totalInvested;
    const weightedRows = rows.map((row) => ({
      ...row,
      weight: totalValue > 0 ? row.value / totalValue : 0,
    }));
    const largest = weightedRows.reduce<(typeof weightedRows)[number] | null>(
      (current, row) => (!current || row.value > current.value ? row : current),
      null
    );

    return {
      rows: weightedRows,
      totalValue,
      totalInvested,
      totalPnl,
      totalPnlPct: totalInvested > 0 ? totalPnl / totalInvested : 0,
      largest,
    };
  }, [holdings]);
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
  const researchHoldings = useMemo(() => {
    if (portfolio.rows.length > 0) return portfolio.rows;
    const ticker = focusTicker.trim().toUpperCase();
    if (!ticker) return [];
    const price =
      toNumber(marketData?.market?.regularMarketPrice) ||
      toNumber(marketData?.market?.previousClose) ||
      toNumber(marketDataByTicker[ticker]?.market?.regularMarketPrice) ||
      toNumber(marketDataByTicker[ticker]?.market?.previousClose);
    return [
      {
        id: `research-${ticker}`,
        ticker,
        shares: 1,
        averageCost: price,
        currentPrice: price,
        source: "manual" as const,
        invested: price,
        value: price,
        pnl: 0,
        pnlPct: 0,
        weight: 1,
      },
    ];
  }, [
    focusTicker,
    marketData?.market?.previousClose,
    marketData?.market?.regularMarketPrice,
    marketDataByTicker,
    portfolio.rows,
  ]);

  const indexedDocuments = filings.filter((filing) => Boolean(filing.vectorStoreId));
  const pendingDocuments = filings.filter((filing) => !filing.vectorStoreId);
  const portfolioTickers = useMemo(
    () =>
      Array.from(
        new Set([
          ...portfolio.rows.map((holding) => holding.ticker.trim().toUpperCase()).filter(Boolean),
          focusTicker.trim().toUpperCase(),
        ])
      ).filter(Boolean),
    [portfolio.rows, focusTicker]
  );
  const marketPayload = useMemo(
    () => ({
      source: "Market Data",
      focusTicker,
      items: marketDataByTicker,
    }),
    [focusTicker, marketDataByTicker]
  );
  const localDocumentReadiness = useMemo(
    () =>
      portfolioTickers.map((ticker) => {
        const docs = filings.filter((filing) => (filing.ticker || focusTicker).toUpperCase() === ticker);
        const tickerHas10k = docs.some((filing) => filing.form === "10-K" && filing.vectorStoreId);
        const tickerHas10q = docs.some((filing) => filing.form === "10-Q" && filing.vectorStoreId);
        return {
          ticker,
          has10k: tickerHas10k,
          has10q: tickerHas10q,
          ready: tickerHas10k && tickerHas10q,
          missing: [...(!tickerHas10k ? ["10-K"] : []), ...(!tickerHas10q ? ["10-Q"] : [])],
        };
      }),
    [filings, focusTicker, portfolioTickers]
  );
  const documentReadinessRows = Array.isArray(engineSnapshot?.documentReadiness)
    ? engineSnapshot.documentReadiness
    : localDocumentReadiness;
  const annualFundamentals = marketData?.annualFundamentals ?? [];
  const latestFundamentals = annualFundamentals[annualFundamentals.length - 1] ?? null;
  const selectedAccountLabel =
    brokerAccounts.find((account) => accountIdOf(account) === brokerAccountId) ?? brokerAccounts[0] ?? null;
  const balanceObject = pickBalanceObject(brokerBalances);
  const externalEquity = toNumber(
    pickFirst(
      balanceObject?.equity,
      balanceObject?.total_equity,
      balanceObject?.net_liquidation_value,
      balanceObject?.market_value
    )
  );
  const readinessItems = [
    {
      done: researchHoldings.length > 0,
      title: L("Company selected", "Compañía seleccionada"),
      body: L(
        "Pick the ticker you want Neuro to evaluate as a long-term investment.",
        "Escoge el ticker que quieres que Neuro evalúe como inversión a largo plazo."
      ),
    },
    {
      done: Boolean(marketData),
      title: L("Market layer ready", "Capa de mercado lista"),
      body: L("Price and annual metrics are loaded automatically for the focus company.", "Precio y métricas anuales se cargan automáticamente para la compañía activa."),
    },
    {
      done: documentReadinessRows.length > 0 && documentReadinessRows.every((row: any) => row.ready),
      title: L("Company documents ready", "Documentos listos"),
      body: L("A full verdict is stronger when recent 10-K and 10-Q documents are indexed.", "El veredicto completo mejora cuando hay 10-K y 10-Q recientes indexados."),
    },
  ];
  const readinessScore = Math.round(
    (readinessItems.filter((item) => item.done).length / readinessItems.length) * 100
  );

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
          holdings,
          selectedAccountId: brokerAccountId || null,
          brokerSnapshot: {
            accounts: brokerAccounts,
            accountId: brokerAccountId,
            balances: brokerBalances,
            importedAt: lastPortfolioImportAt,
          },
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
    setHoldings(normalizeSavedHoldings(researchCase.holdings));
    setBrokerAccountId(String(researchCase.selected_account_id ?? ""));
    setBrokerAccounts(Array.isArray(researchCase.broker_snapshot?.accounts) ? researchCase.broker_snapshot.accounts : []);
    setBrokerBalances(researchCase.broker_snapshot?.balances ?? null);
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
      if (accessAllowed !== true || portfolioTickers.length === 0) return;
      setMarketLoading(true);
      setMarketError("");

      const res = await authedFetch(`/api/neuro-analysis/market-data?tickers=${encodeURIComponent(portfolioTickers.join(","))}`).catch(
        () => null
      );
      const json = res ? await res.json().catch(() => ({})) : {};
      if (!alive) return;

      if (res?.ok) {
        const items = json?.items && typeof json.items === "object" ? json.items : { [focusTicker]: json };
        setMarketDataByTicker(items as Record<string, MarketData>);
        const typedItems = items as Record<string, MarketData>;
        setMarketData(typedItems[focusTicker] ?? Object.values(typedItems)[0] ?? null);
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
  }, [accessAllowed, portfolioTickers.join(",")]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("portfolio") === "connected") {
      setActiveWorkspaceTab("portfolio");
      if (!brokerConnectionsEnabled) {
        setBrokerError(brokerUnavailableMessage);
        window.history.replaceState({}, "", window.location.pathname);
        return;
      }
      void loadResearchPortfolio(false);
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateHolding(id: string, patch: Partial<Holding>) {
    setHoldings((prev) =>
      prev.map((holding) => (holding.id === id ? { ...holding, ...patch } : holding))
    );
  }

  function addHolding() {
    setHoldings((prev) => [...prev, makeHolding("", 0, 0, 0)]);
  }

  function removeHolding(id: string) {
    setHoldings((prev) => prev.filter((holding) => holding.id !== id));
  }

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

  async function connectResearchPortfolio() {
    if (!brokerConnectionsEnabled) {
      setBrokerError(brokerUnavailableMessage);
      return;
    }
    try {
      setBrokerError("");
      setBrokerStatus("");
      setBrokerConnecting(true);
      const res = await authedFetch("/api/neuro-analysis/research-portfolio/snaptrade-connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionType: "read",
          immediateRedirect: true,
          darkMode: true,
          customRedirect: `${window.location.origin}/neuro-analysis?portfolio=connected`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.detail || json?.error || "Broker connection failed.");
      const url = String(json?.url ?? "");
      if (!url) throw new Error(L("Missing secure connection URL.", "Falta el enlace seguro de conexión."));
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        window.location.href = url;
        return;
      }
      setBrokerStatus(
        L(
          "Secure connection opened. Complete it, then return and import the research portfolio.",
          "Conexión segura abierta. Complétala, vuelve aquí e importa el research portfolio."
        )
      );
    } catch (error: any) {
      setBrokerError(error?.message || "Broker connection failed.");
    } finally {
      setBrokerConnecting(false);
    }
  }

  async function loadResearchPortfolio(importHoldings = true) {
    if (!brokerConnectionsEnabled) {
      setBrokerError(brokerUnavailableMessage);
      return;
    }
    try {
      setBrokerError("");
      setBrokerStatus("");
      setBrokerLoading(true);
      const accountParam = brokerAccountId ? `?accountId=${encodeURIComponent(brokerAccountId)}` : "";
      const res = await authedFetch(`/api/neuro-analysis/research-portfolio/snaptrade${accountParam}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.detail || json?.error || "Could not load research portfolio.");

      const accounts = Array.isArray(json?.accounts) ? json.accounts : [];
      setBrokerAccounts(accounts);
      const nextAccountId = String(json?.accountId || accountIdOf(accounts[0] ?? {}));
      if (nextAccountId) setBrokerAccountId(nextAccountId);
      setBrokerBalances(json?.balances ?? null);

      if (!json?.connected) {
        setBrokerStatus(
          L(
            "No secure portfolio connection found yet. Connect once, then Neuro can import holdings for research.",
            "Todavía no hay conexión segura. Conecta una vez y Neuro podrá importar posiciones para research."
          )
        );
        return;
      }

      const imported = normalizeBrokerHoldings(json?.holdings);
      if (importHoldings && imported.length) {
        setHoldings(imported);
        setFocusTicker(imported[0].ticker);
        setLastPortfolioImportAt(new Date().toISOString());
        setBrokerStatus(
          L(
            `Imported ${imported.length} positions into the research portfolio.`,
            `Importadas ${imported.length} posiciones al research portfolio.`
          )
        );
      } else {
        setBrokerStatus(
          accounts.length
            ? L("Research account loaded. Choose an account and import positions.", "Cuenta de research cargada. Escoge una cuenta e importa posiciones.")
            : L("Connected, but no accounts were returned yet.", "Conectado, pero todavía no aparecen cuentas.")
        );
      }
    } catch (error: any) {
      setBrokerError(error?.message || "Could not load research portfolio.");
    } finally {
      setBrokerLoading(false);
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
          })),
          caseId: activeCaseId,
          caseTitle:
            caseTitle.trim() ||
            marketData?.company?.name ||
            (focusTicker ? `${focusTicker} research` : "Research case"),
          selectedAccountId: brokerAccountId || null,
          brokerSnapshot: {
            accounts: brokerAccounts,
            accountId: brokerAccountId,
            balances: brokerBalances,
            importedAt: lastPortfolioImportAt,
          },
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

      <div className="mx-auto w-full max-w-none space-y-5 px-4 py-6 sm:px-6 md:px-12 xl:px-16">
        <header className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-5xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase text-sky-200">
                  {L("Private Investment Portal", "Portal privado de inversión")}
                </span>
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase text-emerald-200">
                  {L("Long-term and dividends", "Largo plazo y dividendos")}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">
                {L("Neuro Analysis Investment Portal", "Neuro Analysis Investment Portal")}
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
                {L(
                  "Run a private investment desk for long-term decisions: record positions you bought outside the platform, track the portfolio, read 10-K/10-Q evidence, evaluate dividend durability, and keep a living thesis for when to add, hold, wait, reduce, or review an exit.",
                  "Opera una mesa privada de inversión para decisiones a largo plazo: registra posiciones que compraste fuera de la plataforma, sigue el portfolio, lee evidencia de 10-K/10-Q, evalúa durabilidad de dividendos y mantén una tesis viva para añadir, mantener, esperar, reducir o revisar salida."
                )}
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={caseTitle}
                  onChange={(event) => setCaseTitle(event.target.value)}
                  placeholder={L("Research case name", "Nombre del caso de research")}
                  className="h-10 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none sm:max-w-md"
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

            <div className="grid grid-cols-2 gap-2 text-sm xl:w-[360px]">
              <Readout label={L("Readiness", "Preparación")} value={`${readinessScore}%`} />
              <Readout label={L("Focus", "Foco")} value={focusTicker || "-"} />
            </div>
          </div>
        </header>

        <nav
          aria-label={L("Neuro Analysis workspaces", "Workspaces de Neuro Analysis")}
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-2 sm:grid-cols-2 xl:grid-cols-4"
        >
          {[
            {
              id: "research" as const,
              icon: Search,
              title: L("Company Research", "Research de compañías"),
              body: L("Company profile, 10-K/10-Q evidence, dividend quality, valuation, and living investment thesis.", "Perfil de compañía, evidencia 10-K/10-Q, calidad de dividendos, valuation y tesis viva de inversión."),
            },
            {
              id: "portfolio" as const,
              icon: WalletCards,
              title: L("Portfolio Tracker", "Portfolio Tracker"),
              body: L("Record what you bought outside the platform so Neuro can follow the holding, weight, P&L, and thesis.", "Registra lo que compraste fuera de la plataforma para que Neuro siga la posición, peso, P&L y tesis."),
            },
            {
              id: "fund_plan" as const,
              icon: BriefcaseBusiness,
              title: L("Fund Business Plan", "Business Plan del fondo"),
              body: L("Project monthly capital goals, annual compounding, and shareholder withdrawals or reinvestment.", "Proyecta metas mensuales, interés compuesto anual y retiros o reinversión de accionistas."),
            },
            {
              id: "screener" as const,
              icon: BarChart3,
              title: L("Sector Screener", "Screener por sector"),
              body: L("Compare companies inside a market sector and surface potential value candidates.", "Compara compañías dentro de un sector de mercado y detecta candidatas con valor potencial."),
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeWorkspaceTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveWorkspaceTab(tab.id)}
                className={`flex items-start gap-3 rounded-lg border p-4 text-left transition ${
                  active
                    ? "border-emerald-400/70 bg-emerald-400/10 text-emerald-50"
                    : "border-slate-800 bg-slate-950/45 text-slate-300 hover:border-sky-400/70 hover:text-sky-100"
                }`}
              >
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-emerald-300" : "text-sky-300"}`} />
                <span>
                  <span className="block text-sm font-semibold">{tab.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">{tab.body}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <section
          className={
            activeWorkspaceTab !== "research"
              ? "space-y-5"
              : "grid grid-cols-1 gap-5 xl:grid-cols-[1.08fr_0.92fr]"
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

            <div className={`${activeWorkspaceTab === "portfolio" ? "" : "hidden"} rounded-xl border border-slate-800 bg-slate-900/75 p-5`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <WalletCards className="h-4 w-4 text-emerald-300" />
                    <h2 className="text-base font-semibold">{L("Portfolio Tracker", "Portfolio Tracker")}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "Record positions after you buy them outside the platform. Neuro follows price, weight, gain/loss, dividend evidence, and future filing changes so the thesis can be reviewed over time. Read-only broker sync can be connected after provider approvals are complete.",
                      "Registra posiciones después de comprarlas fuera de la plataforma. Neuro sigue precio, peso, ganancia/pérdida, evidencia de dividendos y cambios en filings futuros para revisar la tesis con el tiempo. El sync de broker solo lectura se podrá conectar cuando terminen las aprobaciones de proveedores."
                    )}
                  </p>
                  {!brokerConnectionsEnabled ? (
                    <p className="mt-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                      {brokerUnavailableMessage}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void connectResearchPortfolio()}
                    disabled={brokerConnecting || !brokerConnectionsEnabled}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400 disabled:opacity-60"
                  >
                    {brokerConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    {brokerConnectionsEnabled
                      ? L("Connect broker", "Conectar broker")
                      : L("Coming soon", "Proximamente")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadResearchPortfolio(true)}
                    disabled={brokerLoading || !brokerConnectionsEnabled}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                  >
                    {brokerLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
                    {L("Import portfolio", "Importar portfolio")}
                  </button>
                </div>
              </div>

              {brokerAccounts.length > 0 ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="text-xs font-semibold text-slate-400">{L("Import account", "Cuenta para importar")}</label>
                  <select
                    value={brokerAccountId}
                    onChange={(event) => setBrokerAccountId(event.target.value)}
                    className="h-9 rounded-lg border border-slate-800 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none"
                  >
                    {brokerAccounts.map((account) => (
                      <option key={accountIdOf(account)} value={accountIdOf(account)}>
                        {accountLabel(account)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {brokerStatus ? <p className="mt-3 text-xs text-emerald-300">{brokerStatus}</p> : null}
              {brokerError ? <p className="mt-3 text-xs text-rose-300">{brokerError}</p> : null}

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Readout
                  label={L("Imported", "Importado")}
                  value={lastPortfolioImportAt ? new Date(lastPortfolioImportAt).toLocaleTimeString(localeTag) : "-"}
                  hint={selectedAccountLabel ? accountLabel(selectedAccountLabel) : L("Manual or broker", "Manual o broker")}
                />
                <Readout
                  label={L("External equity", "Equity externo")}
                  value={externalEquity > 0 ? formatCurrency(externalEquity, localeTag) : "-"}
                  hint={L("Read-only", "Solo lectura")}
                />
                <Readout
                  label={L("Largest position", "Mayor posición")}
                  value={portfolio.largest?.ticker ?? "-"}
                  hint={portfolio.largest ? formatPercent(portfolio.largest.weight, localeTag) : ""}
                />
              </div>

              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-slate-950/55 text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{L("Ticker", "Símbolo")}</th>
                      <th className="px-3 py-2">{L("Shares", "Acciones")}</th>
                      <th className="px-3 py-2">{L("Avg. cost", "Costo prom.")}</th>
                      <th className="px-3 py-2">{L("Current price", "Precio actual")}</th>
                      <th className="px-3 py-2">{L("Value", "Valor")}</th>
                      <th className="px-3 py-2">P&L</th>
                      <th className="px-3 py-2">{L("Weight", "Peso")}</th>
                      <th className="px-3 py-2">{L("Focus", "Foco")}</th>
                      <th className="px-3 py-2" aria-label={L("Actions", "Acciones")} />
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.rows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-500">
                          {L(
                            "Import a read-only portfolio or add positions manually to create research inputs.",
                            "Importa un portfolio solo lectura o añade posiciones manualmente para crear los insumos de research."
                          )}
                        </td>
                      </tr>
                    ) : (
                      portfolio.rows.map((holding) => (
                        <tr key={holding.id} className="border-t border-slate-800">
                          <td className="px-3 py-2">
                            <input
                              value={holding.ticker}
                              onChange={(event) =>
                                updateHolding(holding.id, { ticker: event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, "") })
                              }
                              className="h-9 w-24 rounded-lg border border-slate-800 bg-slate-950/70 px-2 font-semibold text-slate-100 outline-none"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={holding.shares}
                              onChange={(event) => updateHolding(holding.id, { shares: toNumber(event.target.value) })}
                              className="h-9 w-24 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-slate-100 outline-none"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={holding.averageCost}
                              onChange={(event) => updateHolding(holding.id, { averageCost: toNumber(event.target.value) })}
                              className="h-9 w-28 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-slate-100 outline-none"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={holding.currentPrice}
                              onChange={(event) => updateHolding(holding.id, { currentPrice: toNumber(event.target.value) })}
                              className="h-9 w-28 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-slate-100 outline-none"
                            />
                          </td>
                          <td className="px-3 py-2 text-slate-300">{formatCurrency(holding.value, localeTag)}</td>
                          <td className={`px-3 py-2 font-semibold ${holding.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {formatPercent(holding.pnlPct, localeTag)}
                          </td>
                          <td className="px-3 py-2 text-slate-300">{formatPercent(holding.weight, localeTag)}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setFocusTicker(holding.ticker)}
                              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                                focusTicker === holding.ticker
                                  ? "border-sky-400 bg-sky-500/15 text-sky-200"
                                  : "border-slate-700 text-slate-400 hover:border-sky-400"
                              }`}
                            >
                              {focusTicker === holding.ticker ? L("Active", "Activo") : L("Analyze", "Analizar")}
                            </button>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => removeHolding(holding.id)}
                              className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-200"
                              aria-label={L("Remove holding", "Eliminar posición")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <button
                type="button"
                onClick={addHolding}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
              >
                <Plus className="h-3.5 w-3.5" />
                {L("Add position manually", "Añadir posición manual")}
              </button>
            </div>

            <div className={`${activeWorkspaceTab === "research" ? "" : "hidden"} rounded-xl border border-slate-800 bg-slate-900/75 p-5`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-sky-300" />
                    <h2 className="text-base font-semibold">{L("Company Investment Profile", "Perfil de inversión de compañía")}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "Choose the company Neuro should research. Market data loads automatically; 10-K, 10-Q, dividend records, and company documents turn the thesis from provisional into evidence-backed.",
                      "Escoge la compañía que Neuro debe investigar. La data de mercado carga automática; 10-K, 10-Q, récords de dividendos y documentos de compañía convierten la tesis de provisional a respaldada por evidencia."
                    )}
                  </p>
                </div>
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase text-slate-500">{L("Focus ticker", "Ticker foco")}</span>
                  <input
                    value={focusTicker}
                    onChange={(event) => setFocusTicker(event.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12))}
                    className="mt-1 h-10 w-36 rounded-lg border border-slate-800 bg-slate-950/70 px-3 text-sm font-semibold text-slate-100 outline-none"
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 md:col-span-2">
                  <p className="text-xs text-slate-500">{L("Company", "Empresa")}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-50">
                    {marketData?.company?.name || focusTicker}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {[marketData?.company?.sector, marketData?.company?.industry, marketData?.company?.exchange]
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
                  label={L("Latest fiscal year", "Último año fiscal")}
                  value={latestFundamentals?.year ?? "-"}
                  hint={`Rev ${formatCompactCurrency(latestFundamentals?.totalRevenue, localeTag)} / FCF ${formatCompactCurrency(latestFundamentals?.freeCashFlow, localeTag)}`}
                />
              </div>
              {marketError ? <p className="mt-3 text-xs text-amber-300">{marketError}</p> : null}
            </div>
          </div>

          <aside className={activeWorkspaceTab === "research" ? "space-y-5" : "hidden"}>
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-sky-300" />
                <h2 className="text-base font-semibold">{L("Investment Thesis Run", "Investment Thesis Run")}</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {L(
                  "Neuro reads the focus company, market layer, portfolio context, and uploaded documents, then builds a living thesis, valuation ladder, dividend review, and long-term decision support.",
                  "Neuro lee la compañía foco, capa de mercado, contexto del portfolio y documentos subidos, y crea una tesis viva, escalera de valuation, revisión de dividendos y apoyo de decisión a largo plazo."
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
                {agentLoading ? L("Running research...", "Corriendo research...") : L("Run company intelligence", "Correr inteligencia de compañía")}
              </button>
              {agentError ? <p className="mt-3 text-xs text-rose-300">{agentError}</p> : null}
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

            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-300" />
                <h2 className="text-base font-semibold">{L("Company Documents", "Documentos de compañía")}</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {L(
                  "Upload recent annual and quarterly PDFs so future thesis reviews can compare the latest business evidence against the original buy/hold reason.",
                  "Sube PDFs anuales y trimestrales recientes para que futuras revisiones de tesis comparen la evidencia más nueva contra la razón original de compra o hold."
                )}
              </p>

              <button
                type="button"
                onClick={() => void findCompanyDocuments()}
                disabled={documentLookupLoading || !focusTicker.trim()}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400 hover:text-sky-200 disabled:opacity-50"
              >
                {documentLookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                {documentLookupLoading ? L("Searching", "Buscando") : L("Find recent documents", "Buscar documentos recientes")}
              </button>
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
                        ? L("Documents ready", "Documentos listos")
                        : `${L("Missing", "Falta")}: ${(row.missing ?? []).join(", ")}`}
                    </span>
                  </div>
                ))}
              </div>

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
              onClick={() => setFocusTicker((value) => value)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300"
              disabled
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {marketLoading ? L("Loading", "Cargando") : marketData?.source ?? L("Market data", "Data de mercado")}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5 xl:col-span-2">
              <h3 className="text-sm font-semibold text-slate-100">
                {L("Revenue, net income, and free cash flow", "Revenue, net income y free cash flow")}
              </h3>
              <div className="mt-4 h-72">
                {annualFundamentals.length ? (
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
                    {marketLoading ? L("Loading fundamentals...", "Cargando fundamentales...") : L("No annual fundamentals available.", "Sin fundamentales anuales disponibles.")}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
              <h3 className="text-sm font-semibold text-slate-100">{L("Margins by year", "Márgenes por año")}</h3>
              <div className="mt-4 h-72">
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
                    {L("No margin data.", "Sin data de márgenes.")}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-5 xl:col-span-3">
              <h3 className="text-sm font-semibold text-slate-100">
                {L("Monthly price history", "Precio histórico mensual")}
              </h3>
              <div className="mt-4 h-64">
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
            <div className="max-w-3xl">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-300" />
                <h2 className="text-base font-semibold">{L("Neuro Research Agent", "Neuro Research Agent")}</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {L(
                  "Ask objective questions about the active case, portfolio thesis, dividend safety, valuation, or what future 10-Q/10-K evidence would change the decision. The agent must say when evidence is missing instead of guessing.",
                  "Haz preguntas objetivas sobre el caso activo, tesis del portfolio, seguridad del dividendo, valuation o qué evidencia futura de 10-Q/10-K cambiaría la decisión. El agente debe decir cuando falta evidencia en vez de adivinar."
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

        <section className={activeWorkspaceTab === "research" ? "grid grid-cols-1 gap-4 lg:grid-cols-4" : "hidden"}>
          {PREMIUM_OUTPUTS.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-800 bg-slate-900/75 p-5">
              <BriefcaseBusiness className="h-4 w-4 text-emerald-300" />
              <p className="mt-3 text-sm font-semibold text-slate-100">{isEs ? item.esTitle : item.title}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{isEs ? item.esBody : item.body}</p>
            </div>
          ))}
        </section>

        <div className={activeWorkspaceTab === "research" ? "rounded-xl border border-slate-800 bg-slate-900/75 p-4 text-xs leading-5 text-slate-500" : "hidden"}>
          <div className="flex items-start gap-2">
            <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-sky-300" />
            <p>
              {L(
                "Output is analysis and simulation support for long-term investment decisions. Neuro does not execute trades, custody funds, or guarantee returns; the research portfolio is a private replica of positions you manage outside the platform.",
                "La salida es apoyo de análisis y simulación para decisiones de inversión a largo plazo. Neuro no ejecuta trades, no custodia fondos ni garantiza retornos; el research portfolio es una réplica privada de posiciones que manejas fuera de la plataforma."
              )}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
