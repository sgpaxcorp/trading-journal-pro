import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { fetchNeuroMarketData, mapWithConcurrency, sanitizeNeuroTicker, type NeuroMarketData } from "@/lib/neuroMarketData";
import { checkNeuroQuota, recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function scoreLowerBetter(value: number | null, best: number, worst: number) {
  if (value == null || value <= 0) return 35;
  return clamp(((worst - value) / (worst - best)) * 100, 0, 100);
}

function scoreHigherBetter(value: number | null, best: number, worst: number) {
  if (value == null) return 35;
  return clamp(((value - worst) / (best - worst)) * 100, 0, 100);
}

function median(values: Array<number | null | undefined>) {
  const clean = values.map(Number).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

function percentileRank(value: number | null, values: Array<number | null>, higherBetter = true) {
  const clean = values.filter((item): item is number => item != null && Number.isFinite(item)).sort((a, b) => a - b);
  if (value == null || !clean.length) return 35;
  const lower = clean.filter((item) => item <= value).length;
  const pct = (lower / clean.length) * 100;
  return higherBetter ? pct : 100 - pct;
}

function analyzeCompany(item: NeuroMarketData) {
  const latest = latestFundamentals(item);
  const marketCap = numberOrNull(item.market.marketCap);
  const freeCashFlow = numberOrNull(latest?.freeCashFlow);
  const netIncome = numberOrNull(latest?.netIncome);
  const fcfYield = marketCap && freeCashFlow != null ? freeCashFlow / marketCap : null;
  const earningsYield = marketCap && netIncome != null ? netIncome / marketCap : null;
  const revenueCagr = growthFromRows(item.annualFundamentals, "totalRevenue");
  const fcfCagr = growthFromRows(item.annualFundamentals, "freeCashFlow");
  const fiveYearReturn = item.yearlyPrice?.length
    ? (() => {
        const rows = [...item.yearlyPrice].sort((a, b) => a.year - b.year);
        const first = rows[0];
        const last = rows.at(-1);
        return first?.firstClose && last?.lastClose ? last.lastClose / first.firstClose - 1 : null;
      })()
    : null;

  const valueScore = Math.round(
    scoreHigherBetter(fcfYield, 0.08, -0.02) * 0.35 +
      scoreHigherBetter(earningsYield, 0.08, -0.02) * 0.2 +
      scoreLowerBetter(numberOrNull(item.market.forwardPE ?? item.market.trailingPE), 12, 45) * 0.25 +
      scoreLowerBetter(numberOrNull(item.market.priceToBook), 1.5, 12) * 0.2
  );
  const qualityScore = Math.round(
    scoreHigherBetter(numberOrNull(latest?.fcfMargin), 0.28, -0.05) * 0.35 +
      scoreHigherBetter(numberOrNull(latest?.operatingMargin), 0.3, -0.05) * 0.25 +
      scoreHigherBetter(revenueCagr, 0.15, -0.08) * 0.2 +
      scoreLowerBetter(numberOrNull(latest?.debtToEquity), 0.2, 3) * 0.2
  );
  const dividendScore = Math.round(
    scoreHigherBetter(numberOrNull(item.market.dividendYield), 0.05, 0) * 0.45 +
      scoreHigherBetter(fcfYield, 0.08, -0.02) * 0.35 +
      scoreLowerBetter(numberOrNull(latest?.debtToEquity), 0.2, 3) * 0.2
  );
  const momentumScore = Math.round(scoreHigherBetter(fiveYearReturn, 2, -0.5));

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
    fiveYearReturn,
    valueScore,
    qualityScore,
    dividendScore,
    momentumScore,
    potentialScore: 0,
    verdict: "review",
    dataWarnings: Object.entries(item.errors ?? {})
      .filter(([, error]) => Boolean(error))
      .map(([key]) => key),
  };
}

function withRelativePotential(rows: ReturnType<typeof analyzeCompany>[]) {
  const fcfYields = rows.map((row) => row.fcfYield);
  const peValues = rows.map((row) => row.forwardPE ?? row.trailingPE);
  const qualityScores = rows.map((row) => row.qualityScore);
  const growthValues = rows.map((row) => row.revenueCagr);

  return rows.map((row) => {
    const relativeValue =
      percentileRank(row.fcfYield, fcfYields, true) * 0.4 +
      percentileRank(row.forwardPE ?? row.trailingPE, peValues, false) * 0.25 +
      percentileRank(row.qualityScore, qualityScores, true) * 0.25 +
      percentileRank(row.revenueCagr, growthValues, true) * 0.1;
    const potentialScore = Math.round(
      row.valueScore * 0.35 +
        row.qualityScore * 0.3 +
        row.dividendScore * 0.15 +
        row.momentumScore * 0.1 +
        relativeValue * 0.1
    );
    const verdict =
      potentialScore >= 78 && row.qualityScore >= 60
        ? "high_potential_review"
        : potentialScore >= 65
        ? "watchlist"
        : potentialScore >= 50
        ? "fair_value_monitor"
        : "low_priority";
    return { ...row, potentialScore, verdict };
  });
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

    const rows = withRelativePotential(marketData.map(analyzeCompany)).sort(
      (a, b) => b.potentialScore - a.potentialScore
    );
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
      medianQualityScore: median(rows.map((row) => row.qualityScore)),
      medianValueScore: median(rows.map((row) => row.valueScore)),
      highPotentialCount: rows.filter((row) => row.verdict === "high_potential_review").length,
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
        "Ranks each company on value, quality, dividend support, momentum, and relative sector potential. This is screening support, not an investment recommendation.",
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
