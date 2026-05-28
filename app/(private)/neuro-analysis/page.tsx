"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Brain,
  Calculator,
  FileText,
  Landmark,
  LineChart,
  Plus,
  Scale,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import TopNav from "@/app/components/TopNav";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type Lang = "en" | "es";

type Holding = {
  id: string;
  ticker: string;
  shares: number;
  averageCost: number;
  currentPrice: number;
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

const LOCALE_TAG: Record<Lang, string> = {
  en: "en-US",
  es: "es-ES",
};

const CFA_CORPUS = [
  "Level I Vol 1 - Quantitative Methods",
  "Level I Vol 2 - Economics",
  "Level I Vol 3 - Corporate Issuers",
  "Level I Vol 4 - Financial Statement Analysis",
  "Level I Vol 5 - Equity Investments",
  "Level I Vol 6 - Fixed Income",
  "Level I Vol 7 - Derivatives",
  "Level I Vol 8 - Alternative Investments",
  "Level I Vol 9 - Portfolio Management",
  "Level I Vol 10 - Ethical and Professional Standards",
];

const CFA_LENSES = [
  {
    icon: FileText,
    title: "Financial Statement Analysis",
    esTitle: "Análisis de estados financieros",
    body: "Revenue quality, margins, accruals, cash conversion, leverage, and red flags.",
    esBody: "Calidad de ingresos, márgenes, accruals, conversión a cash, deuda y red flags.",
  },
  {
    icon: Landmark,
    title: "Corporate Issuer Quality",
    esTitle: "Calidad del emisor",
    body: "Capital allocation, governance, ROIC, reinvestment runway, and balance sheet discipline.",
    esBody: "Allocation de capital, gobierno, ROIC, runway de reinversión y disciplina financiera.",
  },
  {
    icon: BarChart3,
    title: "Equity Valuation",
    esTitle: "Valoración de equity",
    body: "Multiples, intrinsic value, scenario analysis, sensitivity, and margin of safety.",
    esBody: "Múltiplos, valor intrínseco, escenarios, sensibilidad y margen de seguridad.",
  },
  {
    icon: Scale,
    title: "Portfolio Construction",
    esTitle: "Construcción de portfolio",
    body: "Position sizing, diversification, risk budget, drawdown discipline, and expected return.",
    esBody: "Tamaño de posición, diversificación, presupuesto de riesgo, drawdown y retorno esperado.",
  },
];

const BUFFETT_LENSES = [
  "Durable economic moat",
  "Owner earnings and cash conversion",
  "Management aligned with shareholders",
  "Circle of competence",
  "Margin of safety",
  "Long-term compounding runway",
];

const PREMIUM_OUTPUTS = [
  {
    title: "Company summary",
    esTitle: "Resumen de la compañía",
    body: "Business model, revenue drivers, competitive position, management, and key risks.",
    esBody: "Modelo de negocio, drivers de ingresos, posición competitiva, management y riesgos clave.",
  },
  {
    title: "Key metrics",
    esTitle: "Métricas principales",
    body: "Revenue growth, margins, ROIC, leverage, liquidity, EPS, free cash flow, and valuation.",
    esBody: "Crecimiento, márgenes, ROIC, deuda, liquidez, EPS, free cash flow y valoración.",
  },
  {
    title: "Future cash flows",
    esTitle: "Future cash flows",
    body: "Bear/base/bull owner-earnings projection with discount rate and margin of safety.",
    esBody: "Proyección bear/base/bull de owner earnings con tasa de descuento y margen de seguridad.",
  },
  {
    title: "Trend analysis",
    esTitle: "Análisis de tendencias",
    body: "Multi-year revenue, margin, cash generation, debt, and capital allocation direction.",
    esBody: "Tendencias multi-año de ingresos, márgenes, cash, deuda y allocation de capital.",
  },
  {
    title: "Market analysis",
    esTitle: "Análisis de mercado",
    body: "Industry structure, cyclicality, competitive forces, market risk, and macro sensitivity.",
    esBody: "Estructura de industria, ciclicidad, fuerzas competitivas, riesgo de mercado y sensibilidad macro.",
  },
  {
    title: "Capital verdict",
    esTitle: "Veredicto de capital",
    body: "Hold, add, trim, avoid, or watchlist, with evidence and uncertainty clearly separated.",
    esBody: "Mantener, añadir, reducir, evitar o watchlist, separando evidencia e incertidumbre.",
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

function formatPercent(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatFileSize(bytes: number | undefined, localeTag: string) {
  if (!bytes || bytes <= 0) return "0 MB";
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits: bytes >= 1024 * 1024 ? 1 : 0,
  }).format(bytes / (1024 * 1024)) + " MB";
}

function guessFiscalYear(fileName: string) {
  const match = fileName.match(/\b(20\d{2}|19\d{2})\b/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

function makeHolding(ticker: string, shares: number, averageCost: number, currentPrice: number): Holding {
  return {
    id: `${ticker}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ticker,
    shares,
    averageCost,
    currentPrice,
  };
}

function Readout({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="block">
      <span className="text-[11px] font-semibold text-slate-400">{label}</span>
      <div className="mt-1 flex h-10 items-center rounded-lg border border-slate-800 bg-slate-950/60 px-3">
        <span className="text-sm font-semibold text-slate-100">{value}</span>
        {suffix ? <span className="ml-1 text-xs text-slate-500">{suffix}</span> : null}
      </div>
    </div>
  );
}

export default function NeuroAnalysisPage() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale) as Lang;
  const isEs = lang === "es";
  const localeTag = LOCALE_TAG[lang];

  const [holdings, setHoldings] = useState<Holding[]>([
    makeHolding("AAPL", 40, 155, 190),
    makeHolding("MSFT", 20, 330, 420),
    makeHolding("NVDA", 12, 780, 920),
  ]);
  const [ticker, setTicker] = useState("AAPL");
  const [capital] = useState(25000);
  const [horizon] = useState(5);
  const [currentPrice] = useState(190);
  const [eps] = useState(7);
  const [freeCashFlow] = useState(8);
  const [fcfGrowth] = useState(7);
  const [growth] = useState(8);
  const [targetPe] = useState(24);
  const [discountRate] = useState(10);
  const [marginOfSafety] = useState(25);
  const [moat] = useState(8);
  const [management] = useState(8);
  const [balanceSheet] = useState(7);
  const [predictability] = useState(7);
  const [cyclicality] = useState(4);
  const [filings, setFilings] = useState<FilingUpload[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState<boolean | null>(null);
  const [agentReport, setAgentReport] = useState("");
  const [agentError, setAgentError] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);

  const portfolio = useMemo(() => {
    const rows = holdings.map((holding) => {
      const invested = holding.shares * holding.averageCost;
      const value = holding.shares * holding.currentPrice;
      const pnl = value - invested;
      const pnlPct = invested > 0 ? pnl / invested : 0;
      return { ...holding, invested, value, pnl, pnlPct };
    });
    const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
    const totalInvested = rows.reduce((sum, row) => sum + row.invested, 0);
    const totalPnl = totalValue - totalInvested;
    const largest = rows.reduce<(typeof rows)[number] | null>(
      (current, row) => (!current || row.value > current.value ? row : current),
      null
    );

    return {
      rows: rows.map((row) => ({
        ...row,
        weight: totalValue > 0 ? row.value / totalValue : 0,
      })),
      totalValue,
      totalInvested,
      totalPnl,
      totalPnlPct: totalInvested > 0 ? totalPnl / totalInvested : 0,
      largest,
    };
  }, [holdings]);

  const analysis = useMemo(() => {
    const normalizedHorizon = Math.max(1, horizon);
    const qualityScore = Math.round(
      clamp(
        moat * 2.4 +
          management * 2 +
          balanceSheet * 2 +
          predictability * 2.2 +
          (10 - cyclicality) * 1.4,
        0,
        100
      )
    );
    const suggestedAllocationPct = clamp(
      qualityScore / 420 + marginOfSafety / 900 - cyclicality / 380,
      0.02,
      0.28
    );
    const scenarios = [
      {
        key: "bear",
        label: isEs ? "Bear" : "Bear",
        growth: growth - 6,
        pe: targetPe * 0.75,
        probability: 0.25,
      },
      {
        key: "base",
        label: isEs ? "Base" : "Base",
        growth,
        pe: targetPe,
        probability: 0.5,
      },
      {
        key: "bull",
        label: isEs ? "Bull" : "Bull",
        growth: growth + 5,
        pe: targetPe * 1.15,
        probability: 0.25,
      },
    ].map((scenario) => {
      const futureEps = Math.max(0, eps) * Math.pow(1 + scenario.growth / 100, normalizedHorizon);
      const futureFcf =
        Math.max(0, freeCashFlow) *
        Math.pow(1 + (scenario.growth + fcfGrowth - growth) / 100, normalizedHorizon);
      const futurePrice = futureEps * Math.max(0, scenario.pe);
      const presentValue = futurePrice / Math.pow(1 + discountRate / 100, normalizedHorizon);
      const safetyPrice = presentValue * (1 - marginOfSafety / 100);
      const cagr =
        currentPrice > 0
          ? Math.pow(Math.max(0, futurePrice) / currentPrice, 1 / normalizedHorizon) - 1
          : 0;
      const allocatedCapital = capital * suggestedAllocationPct;
      const shares = currentPrice > 0 ? allocatedCapital / currentPrice : 0;

      return {
        ...scenario,
        futureEps,
        futureFcf,
        futurePrice,
        presentValue,
        safetyPrice,
        cagr,
        futureValue: shares * futurePrice,
      };
    });
    const expectedCagr = scenarios.reduce((sum, scenario) => sum + scenario.cagr * scenario.probability, 0);
    const baseScenario = scenarios.find((scenario) => scenario.key === "base") ?? scenarios[1];

    return {
      qualityScore,
      suggestedAllocationPct,
      suggestedAllocation: capital * suggestedAllocationPct,
      scenarios,
      expectedCagr,
      baseScenario,
    };
  }, [
    balanceSheet,
    capital,
    currentPrice,
    cyclicality,
    discountRate,
    eps,
    fcfGrowth,
    freeCashFlow,
    growth,
    horizon,
    isEs,
    management,
    marginOfSafety,
    moat,
    predictability,
    targetPe,
  ]);

  useEffect(() => {
    let alive = true;
    async function checkAccess() {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        if (alive) setAccessAllowed(false);
        return;
      }
      const res = await fetch("/api/smart-tools/access", {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (alive) setAccessAllowed(Boolean(json?.allowed));
    }

    void checkAccess();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadFilingLibrary() {
      if (!ticker.trim()) return;
      setFilingsLoading(true);
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        if (alive) setFilingsLoading(false);
        return;
      }

      const res = await fetch(`/api/neuro-analysis/filings?ticker=${encodeURIComponent(ticker)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
      const json = res ? await res.json().catch(() => ({})) : {};
      if (!alive) return;

      if (res?.ok && Array.isArray(json?.filings)) {
        setFilings((prev) => {
          const pending = prev.filter((filing) => filing.file && filing.ticker === ticker);
          const persisted = json.filings.map((filing: any) => ({
            id: String(filing.id ?? `${filing.form}-${filing.fileName}`),
            ticker: String(filing.ticker ?? ticker),
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

    void loadFilingLibrary();
    return () => {
      alive = false;
    };
  }, [ticker]);

  const indexedFilings = filings.filter((filing) => Boolean(filing.vectorStoreId));
  const pendingFilings = filings.filter((filing) => !filing.vectorStoreId);
  const indexed10kCount = indexedFilings.filter((filing) => filing.form === "10-K").length;
  const indexed10qCount = indexedFilings.filter((filing) => filing.form === "10-Q").length;
  const filingReady = indexed10kCount > 0 && indexed10qCount > 0;
  const filingSelected = filings.length > 0;
  const concentrationRisk = portfolio.rows.some((row) => row.weight > 0.35);
  const objectiveRead = filingReady
    ? isEs
      ? `${indexedFilings.length} filings indexados: Neuro Analysis puede comparar años, detectar tendencias y usar el corpus CFA como marco de razonamiento.`
      : `${indexedFilings.length} indexed filings: Neuro Analysis can compare years, detect trends, and use the CFA corpus as its reasoning framework.`
    : filingSelected
    ? isEs
      ? `${pendingFilings.length} filings pendientes: al correr el agente se subirán e indexarán antes del análisis.`
      : `${pendingFilings.length} pending filings: running the agent will upload and index them before analysis.`
    : isEs
    ? "Análisis incompleto: para decidir si el dinero está bien asignado, Neuro Analysis debe pedir el 10-K y 10-Q más recientes antes de emitir una conclusión."
    : "Incomplete analysis: to judge whether capital is well allocated, Neuro Analysis must request the latest 10-K and 10-Q before issuing a conclusion.";

  function updateHolding(id: string, patch: Partial<Holding>) {
    setHoldings((prev) =>
      prev.map((holding) => (holding.id === id ? { ...holding, ...patch } : holding))
    );
  }

  function addHolding() {
    setHoldings((prev) => [...prev, makeHolding("NEW", 0, 0, 0)]);
  }

  function removeHolding(id: string) {
    setHoldings((prev) => prev.filter((holding) => holding.id !== id));
  }

  function handleFilingFiles(form: "10-K" | "10-Q", fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    setFilings((prev) => [
      ...prev,
      ...files.map((file) => {
        const fiscalYear = guessFiscalYear(file.name);
        return {
          id: `${form}-${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          ticker,
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

  function updateFiling(id: string, patch: Partial<FilingUpload>) {
    setFilings((prev) =>
      prev.map((filing) => (filing.id === id ? { ...filing, ...patch } : filing))
    );
  }

  function removeFiling(id: string) {
    setFilings((prev) => prev.filter((filing) => filing.id !== id));
  }

  async function uploadFilingIfNeeded(filing: FilingUpload, token: string) {
    if (!filing.fileName) return null;
    if (filing.vectorStoreId) {
      return {
        ticker: filing.ticker || ticker,
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
      throw new Error(isEs ? `Selecciona el PDF ${filing.form}.` : `Select the ${filing.form} PDF.`);
    }

    updateFiling(filing.id, { status: "uploading", error: "" });

    const formData = new FormData();
    formData.append("ticker", ticker);
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
      const message = String(json?.error || "Filing upload failed.");
      updateFiling(filing.id, { status: "error", error: message });
      throw new Error(message);
    }

    const ready: FilingUpload = {
      ...filing,
      id: String(json.id ?? filing.id),
      ticker: String(json.ticker ?? ticker),
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
      ticker: String(json.ticker ?? ticker),
      form: filing.form,
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
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data?.session?.access_token;
      if (!token) {
        throw new Error(isEs ? "Inicia sesión para correr Neuro Analysis." : "Sign in to run Neuro Analysis.");
      }

      const uploadedFilings = (
        await Promise.all(filings.map((filing) => uploadFilingIfNeeded(filing, token)))
      ).filter(Boolean);

      const res = await fetch("/api/neuro-analysis/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          language: isEs ? "es" : "en",
          holdings: portfolio.rows.map((holding) => ({
            ticker: holding.ticker,
            shares: holding.shares,
            averageCost: holding.averageCost,
            currentPrice: holding.currentPrice,
          })),
          assumptions: {
            horizonYears: horizon,
            discountRatePct: discountRate,
            marginOfSafetyPct: marginOfSafety,
            baseGrowthPct: growth,
          },
          uploadedFilings,
          question: isEs
            ? "Evalúa objetivamente si el dinero está bien ubicado en estas posiciones. Usa el corpus CFA privado como framework de razonamiento, principios Buffett y todos los filings históricos indexados para detectar tendencias, calidad del negocio, análisis de mercado, future cash flows y cambios de riesgo. Si falta un filing actual o no está indexado, marca el veredicto como provisional."
            : "Objectively evaluate whether capital is well placed in these holdings. Use the private CFA corpus as the reasoning framework, Buffett principles, and all indexed historical filings to detect trends, business quality, market analysis, future cash flows, and risk changes. If a current filing is missing or not indexed, mark the verdict as provisional.",
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Neuro Analysis failed.");
      }
      setAgentReport(String(json?.report ?? ""));
    } catch (error: any) {
      setAgentError(error?.message || "Neuro Analysis failed.");
    } finally {
      setAgentLoading(false);
    }
  }

  const qualityLabel =
    analysis.qualityScore >= 78
      ? isEs
        ? "Alta calidad"
        : "High quality"
      : analysis.qualityScore >= 58
      ? isEs
        ? "Calidad media"
        : "Medium quality"
      : isEs
      ? "Requiere más evidencia"
      : "Needs more evidence";

  if (accessAllowed === null) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="px-6 py-16 text-sm text-slate-400">
          {isEs ? "Validando acceso beta..." : "Checking beta access..."}
        </div>
      </main>
    );
  }

  if (accessAllowed === false) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-6">
            <p className="text-xs font-semibold uppercase text-sky-300">Smart Tools BETA</p>
            <h1 className="mt-3 text-2xl font-semibold">
              {isEs ? "Beta cerrada" : "Closed beta"}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {isEs
                ? "Neuro Analysis está cerrado mientras se valida el agente, el corpus CFA y la biblioteca de filings."
                : "Neuro Analysis is closed while the agent, CFA corpus, and filing library are being validated."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="mx-auto w-full max-w-none space-y-6 px-4 py-6 sm:px-6 md:px-16 sm:py-8">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase text-sky-300">Neuro Analysis</p>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
              {isEs ? "Portfolio Intelligence CFA + Buffett" : "CFA + Buffett Portfolio Intelligence"}
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">
              {isEs
                ? "Un producto premium para que el usuario añada sus posiciones reales, costo promedio y filings recientes; luego Neuro Analysis evalúa objetivamente si ese capital está en compañías que valen la pena."
                : "A premium product where users add real holdings, average cost, and recent filings; then Neuro Analysis objectively evaluates whether that capital is sitting in companies worth owning."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg border border-sky-400/50 bg-sky-500/10 px-3 py-2 text-sky-200">
              {isEs ? "Simulación" : "Simulation"}
            </span>
            <span className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-amber-200">
              Warren Buffett
            </span>
            <span className="rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-emerald-200">
              CFA Level I
            </span>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-emerald-300" />
                <h2 className="text-base font-semibold text-slate-50">
                  {isEs ? "Posiciones actuales" : "Current Holdings"}
                </h2>
              </div>
              <button
                type="button"
                onClick={addHolding}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:border-emerald-300"
              >
                <Plus className="h-3.5 w-3.5" />
                {isEs ? "Añadir acción" : "Add stock"}
              </button>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b border-slate-800">
                    <th className="py-2 pr-3">Ticker</th>
                    <th className="py-2 pr-3">{isEs ? "Acciones" : "Shares"}</th>
                    <th className="py-2 pr-3">{isEs ? "Costo prom." : "Avg. cost"}</th>
                    <th className="py-2 pr-3">{isEs ? "Precio actual" : "Current price"}</th>
                    <th className="py-2 pr-3">{isEs ? "Valor" : "Value"}</th>
                    <th className="py-2 pr-3">P&L</th>
                    <th className="py-2 pr-3">{isEs ? "Peso" : "Weight"}</th>
                    <th className="py-2" aria-label={isEs ? "Acciones" : "Actions"} />
                  </tr>
                </thead>
                <tbody>
                  {portfolio.rows.map((holding) => (
                    <tr key={holding.id} className="border-b border-slate-800/70">
                      <td className="py-3 pr-3">
                        <input
                          value={holding.ticker}
                          onChange={(event) => updateHolding(holding.id, { ticker: event.target.value.toUpperCase() })}
                          className="h-9 w-24 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-sm font-semibold text-slate-100 outline-none"
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <input
                          type="number"
                          value={holding.shares}
                          onChange={(event) => updateHolding(holding.id, { shares: toNumber(event.target.value) })}
                          className="h-9 w-24 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-sm text-slate-100 outline-none"
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <input
                          type="number"
                          value={holding.averageCost}
                          onChange={(event) => updateHolding(holding.id, { averageCost: toNumber(event.target.value) })}
                          className="h-9 w-28 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-sm text-slate-100 outline-none"
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <input
                          type="number"
                          value={holding.currentPrice}
                          onChange={(event) => updateHolding(holding.id, { currentPrice: toNumber(event.target.value) })}
                          className="h-9 w-28 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-sm text-slate-100 outline-none"
                        />
                      </td>
                      <td className="py-3 pr-3 text-slate-300">{formatCurrency(holding.value, localeTag)}</td>
                      <td className={`py-3 pr-3 font-semibold ${holding.pnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {formatCurrency(holding.pnl, localeTag)} · {formatPercent(holding.pnlPct, localeTag)}
                      </td>
                      <td className="py-3 pr-3 text-slate-300">{formatPercent(holding.weight, localeTag)}</td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => removeHolding(holding.id)}
                          className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:border-rose-400/60 hover:text-rose-200"
                          aria-label={isEs ? "Eliminar posición" : "Remove holding"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-base font-semibold text-slate-50">
                {isEs ? "Resumen del portfolio" : "Portfolio Summary"}
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs text-slate-500">{isEs ? "Valor total" : "Total value"}</p>
                  <p className="mt-1 font-semibold text-slate-100">{formatCurrency(portfolio.totalValue, localeTag)}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs text-slate-500">P&L</p>
                  <p className={`mt-1 font-semibold ${portfolio.totalPnl >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {formatPercent(portfolio.totalPnlPct, localeTag)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs text-slate-500">{isEs ? "Mayor posición" : "Largest holding"}</p>
                  <p className="mt-1 font-semibold text-slate-100">{portfolio.largest?.ticker ?? "—"}</p>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <p className="text-xs text-slate-500">{isEs ? "Concentración" : "Concentration"}</p>
                  <p className={`mt-1 font-semibold ${concentrationRisk ? "text-amber-300" : "text-emerald-300"}`}>
                    {concentrationRisk ? (isEs ? "Alta" : "High") : (isEs ? "Normal" : "Normal")}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-300">{objectiveRead}</p>
              <button
                type="button"
                onClick={runNeuroAgent}
                disabled={agentLoading || portfolio.rows.length === 0}
                className="mt-4 w-full rounded-lg bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {agentLoading
                  ? isEs
                    ? "Corriendo agente..."
                    : "Running agent..."
                  : isEs
                  ? "Run Neuro Agent"
                  : "Run Neuro Agent"}
              </button>
              {agentError ? <p className="mt-3 text-xs text-rose-300">{agentError}</p> : null}
            </div>

            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-5">
              <h2 className="text-base font-semibold text-slate-50">
                {isEs ? "Biblioteca de filings" : "Filing Library"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {isEs
                  ? "Sube varios 10-K y 10-Q de diferentes años. Neuro Analysis los guarda por ticker para comparar tendencias, ciclos, management, riesgos y mercado en análisis futuros."
                  : "Upload multiple 10-K and 10-Q PDFs across years. Neuro Analysis saves them by ticker for future trend, cycle, management, risk, and market analysis."}
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-400">10-K PDFs</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={(event) => handleFilingFiles("10-K", event.target.files)}
                    className="mt-1 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-400 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-950"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-400">10-Q PDFs</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={(event) => handleFilingFiles("10-Q", event.target.files)}
                    className="mt-1 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-400 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-950"
                  />
                </label>
              </div>
              <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950/50">
                {filingsLoading ? (
                  <p className="p-3 text-xs text-slate-400">
                    {isEs ? "Cargando biblioteca..." : "Loading library..."}
                  </p>
                ) : filings.length === 0 ? (
                  <p className="p-3 text-xs text-slate-400">
                    {isEs
                      ? "Aún no hay filings para este ticker."
                      : "No filings have been added for this ticker yet."}
                  </p>
                ) : (
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2 pl-3 pr-2">Form</th>
                        <th className="py-2 pr-2">{isEs ? "Año" : "Year"}</th>
                        <th className="py-2 pr-2">{isEs ? "Periodo" : "Period"}</th>
                        <th className="py-2 pr-2">{isEs ? "Archivo" : "File"}</th>
                        <th className="py-2 pr-2">Status</th>
                        <th className="py-2 pr-3" aria-label={isEs ? "Acciones" : "Actions"} />
                      </tr>
                    </thead>
                    <tbody>
                      {filings.map((filing) => (
                        <tr key={filing.id} className="border-b border-slate-800/70">
                          <td className="py-2 pl-3 pr-2 font-semibold text-slate-200">{filing.form}</td>
                          <td className="py-2 pr-2">
                            <input
                              type="number"
                              value={filing.fiscalYear ?? ""}
                              onChange={(event) =>
                                updateFiling(filing.id, { fiscalYear: toNumber(event.target.value) || null })
                              }
                              className="h-8 w-20 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              value={filing.period ?? ""}
                              onChange={(event) => updateFiling(filing.id, { period: event.target.value })}
                              placeholder={filing.form === "10-K" ? "FY" : "Q1/Q2/Q3"}
                              className="h-8 w-24 rounded-lg border border-slate-800 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none"
                            />
                          </td>
                          <td className="max-w-[220px] truncate py-2 pr-2 text-slate-300" title={filing.fileName}>
                            {filing.fileName}
                          </td>
                          <td className="py-2 pr-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                filing.status === "ready"
                                  ? "bg-emerald-500/10 text-emerald-300"
                                  : filing.status === "uploading"
                                  ? "bg-sky-500/10 text-sky-300"
                                  : filing.status === "error"
                                  ? "bg-rose-500/10 text-rose-300"
                                  : "bg-amber-500/10 text-amber-300"
                              }`}
                            >
                              {filing.status === "ready"
                                ? isEs
                                  ? "Indexado"
                                  : "Indexed"
                                : filing.status === "uploading"
                                ? isEs
                                  ? "Indexando"
                                  : "Indexing"
                                : filing.status === "error"
                                ? "Error"
                                : isEs
                                ? "Pendiente"
                                : "Pending"}
                            </span>
                            <p className="mt-1 text-[10px] text-slate-500">
                              {formatFileSize(filing.usageBytes || filing.bytes, localeTag)}
                            </p>
                          </td>
                          <td className="py-2 pr-3">
                            <button
                              type="button"
                              onClick={() => removeFiling(filing.id)}
                              className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:border-rose-400/60 hover:text-rose-200"
                              aria-label={isEs ? "Quitar filing" : "Remove filing"}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {isEs
                  ? "Límite del producto: 35 MB por filing. Los filings se guardan por ticker en una biblioteca vectorial reutilizable y expiran tras 90 días sin uso para controlar costo y storage."
                  : "Product limit: 35 MB per filing. Filings are saved by ticker in a reusable vector library and expire after 90 inactive days to control cost and storage."}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-sky-300" />
              <h2 className="text-base font-semibold text-slate-50">
                {isEs ? "Modelo calculado por AI" : "AI-Calculated Model"}
              </h2>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-400">Ticker</span>
                <input
                  value={ticker}
                  onChange={(event) => setTicker(event.target.value.toUpperCase())}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-800 bg-slate-950/70 px-3 text-sm text-slate-100 outline-none"
                />
              </label>
              <Readout label={isEs ? "Capital virtual" : "Virtual capital"} value={formatCurrency(capital, localeTag)} />
              <Readout label={isEs ? "Horizonte" : "Horizon"} value={horizon} suffix={isEs ? "años" : "yrs"} />
              <Readout label={isEs ? "Precio actual" : "Current price"} value={formatCurrency(currentPrice, localeTag)} />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Readout label="EPS" value="AI" />
              <Readout label={isEs ? "Crecimiento EPS" : "EPS growth"} value="AI" />
              <Readout label={isEs ? "FCF/acción" : "FCF/share"} value="AI" />
              <Readout label={isEs ? "Crecimiento FCF" : "FCF growth"} value="AI" />
              <Readout label={isEs ? "P/E objetivo" : "Target P/E"} value="AI" />
              <Readout label={isEs ? "Tasa descuento" : "Discount rate"} value="AI" />
              <Readout label={isEs ? "Margen seguridad" : "Safety margin"} value="AI" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-amber-300" />
              <h2 className="text-base font-semibold text-slate-50">
                {isEs ? "Lectura Buffett/CFA" : "Buffett/CFA Read"}
              </h2>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Readout label="Moat" value="AI" />
              <Readout label="Management" value="AI" />
              <Readout label="Balance sheet" value="AI" />
              <Readout label={isEs ? "Previsibilidad" : "Predictability"} value="AI" />
              <Readout label={isEs ? "Ciclicidad" : "Cyclicality"} value="AI" />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs text-slate-400">{isEs ? "Calidad" : "Quality"}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-50">{analysis.qualityScore}/100</p>
            <p className="mt-1 text-sm text-emerald-300">{qualityLabel}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs text-slate-400">{isEs ? "Allocation sugerido" : "Suggested allocation"}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-50">
              {formatPercent(analysis.suggestedAllocationPct, localeTag)}
            </p>
            <p className="mt-1 text-sm text-slate-400">{formatCurrency(analysis.suggestedAllocation, localeTag)}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs text-slate-400">{isEs ? "CAGR esperado" : "Expected CAGR"}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-50">
              {formatPercent(analysis.expectedCagr, localeTag)}
            </p>
            <p className="mt-1 text-sm text-slate-400">{isEs ? "Probabilidad ponderada" : "Probability weighted"}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs text-slate-400">{isEs ? "Precio con margen" : "Safety price"}</p>
            <p className="mt-2 text-3xl font-semibold text-slate-50">
              {formatCurrency(analysis.baseScenario.safetyPrice, localeTag)}
            </p>
            <p className="mt-1 text-sm text-slate-400">{isEs ? "Escenario base" : "Base scenario"}</p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_0.75fr]">
          {agentReport ? (
            <div className="rounded-2xl border border-sky-500/30 bg-slate-900/80 p-5 xl:col-span-2">
              <h2 className="text-base font-semibold text-slate-50">
                {isEs ? "Reporte del agente" : "Agent Report"}
              </h2>
              <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-sm leading-6 text-slate-200">
                {agentReport}
              </pre>
            </div>
          ) : null}

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-emerald-300" />
              <h2 className="text-base font-semibold text-slate-50">
                {isEs ? "Proyecciones futuras por escenario" : "Future Scenario Projections"}
              </h2>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b border-slate-800">
                    <th className="py-2 pr-4">{isEs ? "Escenario" : "Scenario"}</th>
                    <th className="py-2 pr-4">EPS</th>
                    <th className="py-2 pr-4">FCF/share</th>
                    <th className="py-2 pr-4">{isEs ? "Precio futuro" : "Future price"}</th>
                    <th className="py-2 pr-4">{isEs ? "Valor presente" : "Present value"}</th>
                    <th className="py-2 pr-4">CAGR</th>
                    <th className="py-2">{isEs ? "Valor virtual" : "Virtual value"}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.scenarios.map((scenario) => (
                    <tr key={scenario.key} className="border-b border-slate-800/70">
                      <td className="py-3 pr-4 font-semibold text-slate-100">{scenario.label}</td>
                      <td className="py-3 pr-4 text-slate-300">{scenario.futureEps.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-slate-300">{scenario.futureFcf.toFixed(2)}</td>
                      <td className="py-3 pr-4 text-slate-300">{formatCurrency(scenario.futurePrice, localeTag)}</td>
                      <td className="py-3 pr-4 text-slate-300">{formatCurrency(scenario.presentValue, localeTag)}</td>
                      <td className={`py-3 pr-4 font-semibold ${scenario.cagr >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {formatPercent(scenario.cagr, localeTag)}
                      </td>
                      <td className="py-3 text-slate-300">{formatCurrency(scenario.futureValue, localeTag)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-violet-300" />
              <h2 className="text-base font-semibold text-slate-50">
                {isEs ? "Lectura Neuro" : "Neuro Read"}
              </h2>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <p>
                <span className="font-semibold text-slate-100">{ticker || "TICKER"}</span>{" "}
                {isEs
                  ? "se evalúa con un framework de calidad, valoración y margen de seguridad. El allocation sugerido es una simulación, no una instrucción de inversión."
                  : "is evaluated through quality, valuation, and margin-of-safety discipline. The suggested allocation is a simulation, not an investment instruction."}
              </p>
              <p>
                {isEs
                  ? "El backend ya consulta el corpus CFA privado y, cuando subes los filings, indexa el 10-K/10-Q antes de emitir el reporte del agente."
                  : "The backend now queries the private CFA corpus and, when filings are uploaded, indexes the 10-K/10-Q before producing the agent report."}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 xl:col-span-2">
            <h2 className="text-base font-semibold text-slate-50">
              {isEs ? "Qué debe entregar el análisis premium" : "What The Premium Analysis Must Produce"}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
              {PREMIUM_OUTPUTS.map((item) => (
                <div key={item.title} className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                  <p className="text-sm font-semibold text-slate-100">{isEs ? item.esTitle : item.title}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{isEs ? item.esBody : item.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-base font-semibold text-slate-50">
              {isEs ? "Motor CFA esperado" : "Expected CFA Engine"}
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CFA_LENSES.map((lens) => {
                const Icon = lens.icon;
                return (
                  <div key={lens.title} className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                    <Icon className="h-4 w-4 text-sky-300" />
                    <p className="mt-3 text-sm font-semibold text-slate-100">{isEs ? lens.esTitle : lens.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{isEs ? lens.esBody : lens.body}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-base font-semibold text-slate-50">
              {isEs ? "Corpus privado para Neuro Analysis" : "Private Corpus For Neuro Analysis"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {isEs
                ? "Estos PDFs quedan como fuentes privadas para indexar y consultar desde el backend. La interfaz no copia el contenido del curriculum; lo usa como base de razonamiento y citación."
                : "These PDFs are private sources to index and query from the backend. The interface does not copy curriculum text; it uses them as reasoning and citation sources."}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CFA_CORPUS.map((item) => (
                <div key={item} className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <h2 className="text-base font-semibold text-slate-50">
            {isEs ? "Principios Buffett integrados" : "Integrated Buffett Principles"}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {BUFFETT_LENSES.map((item) => (
              <div key={item} className="rounded-lg border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
                {item}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
