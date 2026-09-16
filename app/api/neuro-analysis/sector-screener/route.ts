import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { fetchNeuroMarketData, mapWithConcurrency, sanitizeNeuroTicker, type NeuroMarketData } from "@/lib/neuroMarketData";
import { financialNumberOrNull } from "@/lib/neuroFinancialDataIntegrity";
import { checkNeuroQuota, recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import {
  DEFAULT_SCREENING_TEMPLATES,
  runDeterministicScreen,
  type ScreeningStrategy,
} from "@/lib/neuroScreeningEngine";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

type SectorKey =
  | "technology"
  | "communication"
  | "consumer_discretionary"
  | "consumer_staples"
  | "healthcare"
  | "financials"
  | "industrials"
  | "energy"
  | "utilities"
  | "real_estate"
  | "materials";

const SECTOR_UNIVERSES: Record<SectorKey, { label: string; tickers: string[] }> = {
  technology: {
    label: "Technology",
    tickers: ["AAPL", "MSFT", "NVDA", "AVGO", "ORCL", "CRM", "AMD", "ADBE", "CSCO", "IBM", "INTU", "QCOM", "TXN", "NOW", "AMAT"],
  },
  communication: {
    label: "Communication Services",
    tickers: ["GOOGL", "META", "NFLX", "DIS", "TMUS", "VZ", "T", "CMCSA", "CHTR", "EA", "TTWO"],
  },
  consumer_discretionary: {
    label: "Consumer Discretionary",
    tickers: ["AMZN", "TSLA", "HD", "MCD", "NKE", "LOW", "SBUX", "BKNG", "TJX", "ORLY", "CMG", "MAR"],
  },
  consumer_staples: {
    label: "Consumer Staples",
    tickers: ["WMT", "COST", "PG", "KO", "PEP", "PM", "MDLZ", "MO", "CL", "KMB", "KR", "GIS"],
  },
  healthcare: {
    label: "Healthcare",
    tickers: ["LLY", "UNH", "JNJ", "ABBV", "MRK", "TMO", "ABT", "DHR", "PFE", "ISRG", "AMGN", "GILD"],
  },
  financials: {
    label: "Financials",
    tickers: ["BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "BLK", "C", "SCHW"],
  },
  industrials: {
    label: "Industrials",
    tickers: ["GE", "CAT", "RTX", "HON", "UNP", "UPS", "DE", "LMT", "BA", "ETN", "PH", "MMM"],
  },
  energy: {
    label: "Energy",
    tickers: ["XOM", "CVX", "COP", "EOG", "SLB", "MPC", "PSX", "VLO", "OXY", "KMI", "WMB", "HAL"],
  },
  utilities: {
    label: "Utilities",
    tickers: ["NEE", "SO", "DUK", "CEG", "AEP", "SRE", "D", "PEG", "EXC", "XEL", "ED", "WEC"],
  },
  real_estate: {
    label: "Real Estate",
    tickers: ["PLD", "AMT", "EQIX", "WELL", "SPG", "O", "DLR", "PSA", "CCI", "CBRE", "VICI", "AVB"],
  },
  materials: {
    label: "Materials",
    tickers: ["LIN", "SHW", "APD", "ECL", "FCX", "NEM", "DOW", "DD", "PPG", "CTVA", "MLM", "VMC"],
  },
};

function cleanSector(value: string | null): SectorKey {
  const key = String(value ?? "technology").trim().toLowerCase().replace(/[^a-z_]/g, "_") as SectorKey;
  return SECTOR_UNIVERSES[key] ? key : "technology";
}

function parseTickers(value: string | null) {
  return Array.from(new Set(String(value ?? "")
    .split(",")
    .map((ticker) => sanitizeNeuroTicker(ticker))
    .filter(Boolean)))
    .slice(0, 25);
}

function numberOrNull(value: unknown) {
  return financialNumberOrNull(value);
}

function latestFundamentals(item: NeuroMarketData) {
  return [...(item.annualFundamentals ?? [])].sort((a, b) => Number(a.year) - Number(b.year)).at(-1) ?? null;
}

function cagr(first: number | null, last: number | null, years: number) {
  if (!first || !last || first <= 0 || last <= 0 || years <= 0) return null;
  const value = Math.pow(last / first, 1 / years) - 1;
  return Number.isFinite(value) ? value : null;
}

function growthFromRows(rows: NeuroMarketData["annualFundamentals"], key: "totalRevenue" | "freeCashFlow" | "netIncome") {
  const clean = [...(rows ?? [])]
    .filter((row) => numberOrNull(row[key]) != null)
    .sort((a, b) => Number(a.year) - Number(b.year));
  if (clean.length < 2) return null;
  const first = clean[0];
  const last = clean[clean.length - 1];
  return cagr(numberOrNull(first[key]), numberOrNull(last[key]), Math.max(1, Number(last.year) - Number(first.year)));
}

function median(values: Array<number | null | undefined>) {
  const clean = values.map(Number).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function analyzeCompany(item: NeuroMarketData) {
  const latest = latestFundamentals(item);
  const annual = [...(item.annualFundamentals ?? [])].sort((a, b) => Number(a.year) - Number(b.year));
  const previous = annual.at(-2) ?? null;
  const marketCap = numberOrNull(item.market.marketCap);
  const freeCashFlow = numberOrNull(latest?.freeCashFlow);
  const netIncome = numberOrNull(latest?.netIncome);
  const fcfYield = marketCap && freeCashFlow != null ? freeCashFlow / marketCap : null;
  const earningsYield = marketCap && netIncome != null ? netIncome / marketCap : null;
  const revenueCagr = growthFromRows(item.annualFundamentals, "totalRevenue");
  const fcfCagr = growthFromRows(item.annualFundamentals, "freeCashFlow");
  const latestRevenue = numberOrNull(latest?.totalRevenue);
  const previousRevenue = numberOrNull(previous?.totalRevenue);
  const revenueGrowth = latestRevenue != null && previousRevenue != null && previousRevenue !== 0
    ? (latestRevenue - previousRevenue) / Math.abs(previousRevenue)
    : null;
  const currentShares = numberOrNull(latest?.dilutedAverageShares);
  const previousShares = numberOrNull(previous?.dilutedAverageShares);
  const shareDilution = currentShares != null && previousShares != null && previousShares !== 0
    ? (currentShares - previousShares) / Math.abs(previousShares)
    : null;

  return {
    ticker: item.ticker,
    name: item.company.name ?? item.ticker,
    sector: item.company.sector ?? null,
    industry: item.company.industry ?? null,
    marketCap,
    price: numberOrNull(item.market.regularMarketPrice ?? item.market.previousClose),
    trailingPE: numberOrNull(item.market.trailingPE),
    forwardPE: numberOrNull(item.market.forwardPE),
    priceToBook: numberOrNull(item.market.priceToBook),
    dividendYield: numberOrNull(item.market.dividendYield),
    fcfYield,
    earningsYield,
    revenueCagr,
    fcfCagr,
    operatingMargin: numberOrNull(latest?.operatingMargin),
    fcfMargin: numberOrNull(latest?.fcfMargin),
    debtToEquity: numberOrNull(latest?.debtToEquity),
    freeCashFlow,
    revenueGrowth,
    shareDilution,
    dataWarnings: Object.entries(item.errors ?? {})
      .filter(([, error]) => Boolean(error))
      .map(([key]) => key),
  };
}

function cleanStrategy(value: string | null): Exclude<ScreeningStrategy, "custom"> {
  const strategy = String(value ?? "value_candidate") as Exclude<ScreeningStrategy, "custom">;
  return strategy in DEFAULT_SCREENING_TEMPLATES ? strategy : "value_candidate";
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const limiter = await rateLimit(`neuro-analysis:sector-screener:${authUser.userId}`, {
      limit: 8,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(retryAfter), ...rateLimitHeaders(limiter) } }
      );
    }

    const quota = await checkNeuroQuota(authUser.userId, "market_data");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Monthly market data quota exceeded.", quota },
        { status: 429, headers: rateLimitHeaders({ ...limiter, remaining: 0 }) }
      );
    }

    const url = new URL(req.url);
    const sector = cleanSector(url.searchParams.get("sector"));
    const strategy = cleanStrategy(url.searchParams.get("strategy"));
    const customTickers = parseTickers(url.searchParams.get("tickers"));
    const universe = SECTOR_UNIVERSES[sector];
    const tickers = (customTickers.length ? customTickers : universe.tickers).slice(0, 25);

    const marketData = await mapWithConcurrency(tickers, 4, async (ticker) => {
      try {
        return await fetchNeuroMarketData(ticker);
      } catch (error: any) {
        return {
          source: "Market Data",
          ticker,
          company: { name: ticker },
          market: {},
          annualFundamentals: [],
          priceHistory: [],
          yearlyPrice: [],
          errors: { request: error?.message || "Market request failed." },
        } as NeuroMarketData;
      }
    });

    const analyzed = marketData.map(analyzeCompany);
    const screening = runDeterministicScreen({
      template: DEFAULT_SCREENING_TEMPLATES[strategy],
      companies: analyzed.map((row) => ({
        ticker: row.ticker,
        companyName: row.name,
        metrics: {
          market_capitalization: row.marketCap,
          free_cash_flow: row.freeCashFlow,
          fcf_yield: row.fcfYield,
          earnings_yield: row.earningsYield,
          revenue_growth: row.revenueGrowth,
          revenue_cagr: row.revenueCagr,
          fcf_growth: row.fcfCagr,
          operating_margin: row.operatingMargin,
          fcf_margin: row.fcfMargin,
          debt_to_equity: row.debtToEquity,
          share_dilution: row.shareDilution,
          trailing_pe: row.trailingPE,
          forward_pe: row.forwardPE,
          price_to_book: row.priceToBook,
        },
      })),
    });
    const analyzedByTicker = new Map(analyzed.map((row) => [row.ticker, row]));
    const rows = screening.results.map((result) => ({ ...analyzedByTicker.get(result.ticker)!, ...result }));
    const summary = {
      market: "US",
      sector,
      sectorLabel: universe.label,
      companies: rows.length,
      medianMarketCap: median(rows.map((row) => row.marketCap)),
      medianTrailingPE: median(rows.map((row) => row.trailingPE)),
      medianForwardPE: median(rows.map((row) => row.forwardPE)),
      medianFcfYield: median(rows.map((row) => row.fcfYield)),
      medianDividendYield: median(rows.map((row) => row.dividendYield)),
      medianRevenueCagr: median(rows.map((row) => row.revenueCagr)),
      passedAllRequiredCriteria: rows.filter((row) => row.status === "PASSED_ALL_REQUIRED_CRITERIA").length,
      failedRequiredCriteria: rows.filter((row) => row.status === "FAILED_REQUIRED_CRITERIA").length,
      insufficientData: rows.filter((row) => row.status === "INSUFFICIENT_DATA").length,
    };

    await recordNeuroUsage({
      userId: authUser.userId,
      eventType: "market_data",
      units: tickers.length,
      metadata: { operation: "sector_screener", sector, tickers },
    });

    return NextResponse.json({
      source: "Market Data",
      methodology:
        "Applies explicit deterministic criteria and reports PASS, FAIL, or DATA NOT AVAILABLE for each criterion. It does not create an investment score or recommendation.",
      noMagicScore: true,
      noLlmUsed: true,
      strategy,
      template: screening.template,
      templates: Object.values(DEFAULT_SCREENING_TEMPLATES).map((template) => ({ key: template.key, name: template.name })),
      market: "US",
      sector,
      sectorLabel: universe.label,
      sectors: Object.entries(SECTOR_UNIVERSES).map(([key, value]) => ({ key, label: value.label })),
      tickers,
      summary,
      rows,
      generatedAt: new Date().toISOString(),
      quota: { remaining: quota.remaining, limit: quota.limit },
    });
  } catch (error: any) {
    console.error("[neuro-analysis/sector-screener] error:", error);
    return NextResponse.json(
      { error: error?.message || "Sector screener failed." },
      { status: 500 }
    );
  }
}
