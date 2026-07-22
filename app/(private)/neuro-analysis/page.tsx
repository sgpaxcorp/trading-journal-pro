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
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type Lang = "en" | "es";
type WorkspaceTab = "research" | "portfolio";

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

const LOCALE_TAG: Record<Lang, string> = {
  en: "en-US",
  es: "es-ES",
};

const PREMIUM_OUTPUTS = [
  {
    title: "Terminal-style profile",
    esTitle: "Perfil tipo terminal",
    body: "Company snapshot, business model, drivers, market position, and evidence checklist.",
    esBody: "Snapshot de compañía, modelo de negocio, drivers, posición de mercado y checklist de evidencia.",
  },
  {
    title: "Market and competition",
    esTitle: "Mercado y competencia",
    body: "Industry structure, demand, competitors, substitutes, cyclicality, and regulatory risk.",
    esBody: "Estructura de industria, demanda, competidores, sustitutos, ciclos y riesgo regulatorio.",
  },
  {
    title: "2-10 year valuation",
    esTitle: "Valuation 2-10 años",
    body: "Bear/base/bull fair-value ladder with discount rate, terminal assumptions, and margin of safety.",
    esBody: "Escalera de fair value bear/base/bull con tasa de descuento, supuestos terminales y margen de seguridad.",
  },
  {
    title: "Investment verdict",
    esTitle: "Veredicto de inversión",
    body: "Add now, wait, hold, reduce, avoid, or watchlist based on valuation and evidence strength.",
    esBody: "Añadir ahora, esperar, mantener, reducir, evitar o watchlist según valuation y calidad de evidencia.",
  },
];

function defaultResearchGoal(isEs: boolean) {
  return isEs
    ? "Analiza objetivamente la compañía como inversión a largo plazo: perfil del negocio, mercado, competencia, documentos necesarios, valoración hoy y fair value proyectado de 2 a 10 años. Dime si parece buena inversión ahora, si conviene esperar por mejor precio/evidencia, mantener, reducir o evitar."
    : "Objectively analyze the company as a long-term investment: business profile, market, competition, required documents, valuation today, and projected fair value from years 2 through 10. Tell me whether it looks like a good investment now, whether it is better to wait for better price/evidence, hold, reduce, or avoid.";
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
            <p className="text-xs font-semibold uppercase text-sky-300">Smart Tools BETA</p>
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
                  Smart Tools Beta
                </span>
                <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase text-emerald-200">
                  {L("Research desk", "Mesa de research")}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">
                {L("Neuro Analysis Research", "Neuro Analysis Research")}
              </h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
                {L(
                  "Build a terminal-style company research profile: evidence checklist, market and competitor intelligence, financial statement review, valuation today, 2-10 year fair-value scenarios, and a long-term investment verdict.",
                  "Construye un perfil de compañía tipo terminal: checklist de evidencia, inteligencia de mercado y competencia, revisión financiera, valuation hoy, escenarios de fair value de 2 a 10 años y veredicto de inversión a largo plazo."
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
          className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-2 sm:grid-cols-2"
        >
          {[
            {
              id: "research" as const,
              icon: Search,
              title: L("Research Desk", "Research Desk"),
              body: L("Company profile, evidence checklist, market intelligence, valuation, and investment verdict.", "Perfil de compañía, checklist de evidencia, inteligencia de mercado, valuation y veredicto de inversión."),
            },
            {
              id: "portfolio" as const,
              icon: WalletCards,
              title: L("Portfolio Import", "Portfolio Import"),
              body: L("Optional: include real positions later without changing the company research flow.", "Opcional: incluye posiciones reales luego sin cambiar el flujo de research."),
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
            activeWorkspaceTab === "portfolio"
              ? "space-y-5"
              : "grid grid-cols-1 gap-5 xl:grid-cols-[1.08fr_0.92fr]"
          }
        >
          <div className="space-y-5">
            <div className={`${activeWorkspaceTab === "portfolio" ? "" : "hidden"} rounded-xl border border-slate-800 bg-slate-900/75 p-5`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <WalletCards className="h-4 w-4 text-emerald-300" />
                    <h2 className="text-base font-semibold">{L("Portfolio Import", "Portfolio Import")}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "Connect a broker read-only or maintain manual positions here. These positions feed Neuro Research, but this workspace stays separate from the research report itself.",
                      "Conecta un broker solo lectura o mantén posiciones manuales aquí. Estas posiciones alimentan Neuro Research, pero este workspace queda separado del reporte de research."
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void connectResearchPortfolio()}
                    disabled={brokerConnecting}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400 disabled:opacity-60"
                  >
                    {brokerConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    {L("Connect broker", "Conectar broker")}
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadResearchPortfolio(true)}
                    disabled={brokerLoading}
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
                      <th className="px-3 py-2">Ticker</th>
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
                    <h2 className="text-base font-semibold">{L("Company Intelligence Profile", "Perfil de inteligencia de compañía")}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {L(
                      "Choose the company Neuro should research. Market data loads automatically; 10-K, 10-Q, and company documents turn the verdict from provisional into evidence-backed.",
                      "Escoge la compañía que Neuro debe investigar. La data de mercado carga automática; 10-K, 10-Q y documentos de compañía convierten el veredicto de provisional a respaldado por evidencia."
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
                <h2 className="text-base font-semibold">{L("Research Run", "Research Run")}</h2>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                {L(
                  "Neuro reads the focus company, market layer, and uploaded documents, then builds a research profile, valuation ladder, and long-term investment verdict.",
                  "Neuro lee la compañía foco, la capa de mercado y documentos subidos, y crea un perfil de research, escalera de valuation y veredicto de inversión a largo plazo."
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
                  "Upload recent annual and quarterly PDFs when you want a stronger full-company verdict.",
                  "Sube PDFs anuales y trimestrales recientes cuando quieras un veredicto más fuerte."
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
                      <Bar dataKey="totalRevenue" name="Revenue" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="netIncome" name="Net income" fill="#34d399" radius={[4, 4, 0, 0]} />
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
                      <Line type="monotone" dataKey="operatingMargin" name="Op margin" stroke="#38bdf8" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="netMargin" name="Net margin" stroke="#34d399" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="fcfMargin" name="FCF margin" stroke="#fbbf24" strokeWidth={2} dot={false} />
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
                      <Line type="monotone" dataKey="close" name="Close" stroke="#38bdf8" strokeWidth={2} dot={false} />
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
                    <th className="px-3 py-2">Ticker</th>
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
                "Output is analysis and simulation support. Neuro does not execute trades and this research portfolio stays separate from trading accounts.",
                "La salida es apoyo de análisis y simulación. Neuro no ejecuta trades y este research portfolio se mantiene separado de las cuentas de trading."
              )}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
