export type NeuroHoldingInput = {
  ticker: string;
  shares: number;
  averageCost: number;
  currentPrice?: number | null;
};

export type NeuroAssumptions = {
  horizonYears?: number | null;
  discountRatePct?: number | null;
  marginOfSafetyPct?: number | null;
  baseGrowthPct?: number | null;
  terminalGrowthPct?: number | null;
};

export type NeuroMarketDataItem = {
  ticker?: string;
  company?: {
    name?: string | null;
    sector?: string | null;
    industry?: string | null;
    exchange?: string | null;
  };
  market?: {
    regularMarketPrice?: number | null;
    previousClose?: number | null;
    marketCap?: number | null;
    trailingPE?: number | null;
    forwardPE?: number | null;
  };
  annualFundamentals?: Array<{
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
  priceHistory?: Array<{ date: string; close: number }>;
  yearlyPrice?: Array<{ year: number; firstClose: number; lastClose: number; returnPct?: number | null }>;
  errors?: Record<string, string | null>;
};

export type NeuroFilingMetadata = {
  ticker: string;
  form: "10-K" | "10-Q";
  fiscalYear?: number | null;
  period?: string | null;
  periodEnd?: string | null;
  vectorStoreId?: string;
  expiresAt?: string | null;
};

type ScenarioName = "bear" | "base" | "bull";

const DEFAULT_ASSUMPTIONS = {
  horizonYears: 5,
  discountRatePct: 10,
  marginOfSafetyPct: 25,
  terminalGrowthPct: 2.5,
};

function finiteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function maybeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return value;
}

export function normalizeNeuroTicker(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function uniqueTickers(holdings: NeuroHoldingInput[]) {
  return Array.from(new Set(holdings.map((holding) => normalizeNeuroTicker(holding.ticker)).filter(Boolean)));
}

function normalizeMarketMap(marketData: unknown): Record<string, NeuroMarketDataItem> {
  const out: Record<string, NeuroMarketDataItem> = {};
  if (!marketData) return out;

  if (Array.isArray(marketData)) {
    for (const item of marketData) {
      const ticker = normalizeNeuroTicker((item as any)?.ticker);
      if (ticker) out[ticker] = item as NeuroMarketDataItem;
    }
    return out;
  }

  const raw = marketData as any;
  if (raw?.items && typeof raw.items === "object") {
    for (const [key, value] of Object.entries(raw.items)) {
      const ticker = normalizeNeuroTicker((value as any)?.ticker || key);
      if (ticker) out[ticker] = value as NeuroMarketDataItem;
    }
    return out;
  }

  const singleTicker = normalizeNeuroTicker(raw?.ticker);
  if (singleTicker) out[singleTicker] = raw as NeuroMarketDataItem;
  return out;
}

function latestFundamentals(item?: NeuroMarketDataItem | null) {
  const rows = Array.isArray(item?.annualFundamentals) ? item.annualFundamentals : [];
  return [...rows].sort((a, b) => Number(a.year) - Number(b.year)).at(-1) ?? null;
}

function cagr(first: number | null, last: number | null, years: number) {
  if (!first || !last || first <= 0 || last <= 0 || years <= 0) return null;
  const value = Math.pow(last / first, 1 / years) - 1;
  return Number.isFinite(value) ? value : null;
}

function deriveGrowth(item?: NeuroMarketDataItem | null, overridePct?: number | null) {
  if (overridePct != null && Number.isFinite(Number(overridePct))) {
    return clamp(Number(overridePct) / 100, -0.15, 0.3);
  }
  const rows = [...(item?.annualFundamentals ?? [])].sort((a, b) => Number(a.year) - Number(b.year));
  if (rows.length < 2) return 0.04;

  const first = rows[0];
  const last = rows[rows.length - 1];
  const years = Math.max(1, Number(last.year) - Number(first.year));
  const revenueGrowth = cagr(maybeNumber(first.totalRevenue), maybeNumber(last.totalRevenue), years);
  const fcfGrowth = cagr(maybeNumber(first.freeCashFlow), maybeNumber(last.freeCashFlow), years);
  const values = [revenueGrowth, fcfGrowth].filter((value): value is number => value != null);
  if (!values.length) return 0.04;
  return clamp(values.reduce((sum, value) => sum + value, 0) / values.length, -0.1, 0.18);
}

function dcfValue({
  baseCashFlow,
  growth,
  discountRate,
  terminalGrowth,
  horizonYears,
}: {
  baseCashFlow: number;
  growth: number;
  discountRate: number;
  terminalGrowth: number;
  horizonYears: number;
}) {
  if (baseCashFlow <= 0 || discountRate <= terminalGrowth) return null;

  let presentValue = 0;
  let cashFlow = baseCashFlow;
  for (let year = 1; year <= horizonYears; year += 1) {
    cashFlow *= 1 + growth;
    presentValue += cashFlow / Math.pow(1 + discountRate, year);
  }

  const terminalValue = (cashFlow * (1 + terminalGrowth)) / (discountRate - terminalGrowth);
  presentValue += terminalValue / Math.pow(1 + discountRate, horizonYears);
  return Number.isFinite(presentValue) ? presentValue : null;
}

function scenarioGrowths(baseGrowth: number): Record<ScenarioName, number> {
  return {
    bear: clamp(baseGrowth - 0.06, -0.15, 0.12),
    base: clamp(baseGrowth, -0.1, 0.18),
    bull: clamp(baseGrowth + 0.05, -0.05, 0.3),
  };
}

function targetWeightFromQuality(input: {
  marginOfSafety: number | null;
  fcfMargin: number | null;
  debtToEquity: number | null;
  currentWeight: number;
  missingFilings: boolean;
}) {
  let score = 0.5;
  if (input.marginOfSafety != null) score += clamp(input.marginOfSafety, -0.5, 0.5);
  if (input.fcfMargin != null) score += clamp(input.fcfMargin, -0.2, 0.25);
  if (input.debtToEquity != null && input.debtToEquity > 1.5) score -= 0.12;
  if (input.missingFilings) score -= 0.08;
  if (input.currentWeight > 0.25) score -= 0.1;
  return clamp(score, 0.05, 0.9);
}

function verdictFromMargin(marginOfSafety: number | null, missingFilings: boolean) {
  if (missingFilings) return "provisional";
  if (marginOfSafety == null) return "watchlist";
  if (marginOfSafety >= 0.25) return "add";
  if (marginOfSafety >= 0.05) return "hold";
  if (marginOfSafety >= -0.15) return "trim";
  return "avoid";
}

export function computeDocumentReadiness(
  holdings: NeuroHoldingInput[],
  filings: NeuroFilingMetadata[] = []
) {
  const tickers = uniqueTickers(holdings);
  return tickers.map((ticker) => {
    const tickerFilings = filings.filter((filing) => normalizeNeuroTicker(filing.ticker) === ticker);
    const has10k = tickerFilings.some((filing) => filing.form === "10-K" && filing.vectorStoreId);
    const has10q = tickerFilings.some((filing) => filing.form === "10-Q" && filing.vectorStoreId);
    const latest10k = tickerFilings
      .filter((filing) => filing.form === "10-K")
      .sort((a, b) => finiteNumber(b.fiscalYear) - finiteNumber(a.fiscalYear))[0];
    const latest10q = tickerFilings
      .filter((filing) => filing.form === "10-Q")
      .sort((a, b) => String(b.periodEnd ?? "").localeCompare(String(a.periodEnd ?? "")))[0];

    return {
      ticker,
      has10k,
      has10q,
      ready: has10k && has10q,
      latest10k: latest10k
        ? { fiscalYear: latest10k.fiscalYear ?? null, periodEnd: latest10k.periodEnd ?? null }
        : null,
      latest10q: latest10q
        ? { fiscalYear: latest10q.fiscalYear ?? null, periodEnd: latest10q.periodEnd ?? null }
        : null,
      missing: [
        ...(!has10k ? ["10-K"] : []),
        ...(!has10q ? ["10-Q"] : []),
      ],
    };
  });
}

export function buildNeuroAnalysisEngine(input: {
  holdings: NeuroHoldingInput[];
  marketData?: unknown;
  filings?: NeuroFilingMetadata[];
  assumptions?: NeuroAssumptions;
}) {
  const assumptions = {
    ...DEFAULT_ASSUMPTIONS,
    ...(input.assumptions ?? {}),
  };
  const horizonYears = clamp(Math.round(finiteNumber(assumptions.horizonYears, 5)), 1, 15);
  const discountRate = clamp(finiteNumber(assumptions.discountRatePct, 10) / 100, 0.03, 0.25);
  const terminalGrowth = clamp(finiteNumber(assumptions.terminalGrowthPct, 2.5) / 100, -0.02, 0.06);
  const marginOfSafetyTarget = clamp(finiteNumber(assumptions.marginOfSafetyPct, 25) / 100, 0, 0.75);
  const marketMap = normalizeMarketMap(input.marketData);
  const documentReadiness = computeDocumentReadiness(input.holdings, input.filings ?? []);

  const positions = input.holdings
    .map((holding) => {
      const ticker = normalizeNeuroTicker(holding.ticker);
      const market = marketMap[ticker];
      const price =
        maybeNumber(holding.currentPrice) ??
        maybeNumber(market?.market?.regularMarketPrice) ??
        maybeNumber(market?.market?.previousClose) ??
        0;
      const shares = Math.max(0, finiteNumber(holding.shares));
      const averageCost = Math.max(0, finiteNumber(holding.averageCost));
      const invested = shares * averageCost;
      const currentValue = shares * price;
      const pnl = currentValue - invested;
      const latest = latestFundamentals(market);
      const baseCashFlow =
        maybeNumber(latest?.freeCashFlow) ??
        maybeNumber(latest?.operatingCashFlow) ??
        maybeNumber(latest?.netIncome) ??
        0;
      const marketCap = maybeNumber(market?.market?.marketCap);
      const baseGrowth = deriveGrowth(market, assumptions.baseGrowthPct ?? null);
      const growths = scenarioGrowths(baseGrowth);
      const scenarioValues = Object.fromEntries(
        (Object.keys(growths) as ScenarioName[]).map((scenario) => {
          const equityValue = dcfValue({
            baseCashFlow,
            growth: growths[scenario],
            discountRate,
            terminalGrowth,
            horizonYears,
          });
          const debt = maybeNumber(latest?.totalDebt) ?? 0;
          const adjustedEquityValue = equityValue == null ? null : Math.max(0, equityValue - debt);
          const upsideToMarket =
            adjustedEquityValue != null && marketCap && marketCap > 0
              ? adjustedEquityValue / marketCap - 1
              : null;
          return [
            scenario,
            {
              growth: growths[scenario],
              intrinsicEquityValue: adjustedEquityValue,
              upsideToMarket,
            },
          ];
        })
      ) as Record<ScenarioName, { growth: number; intrinsicEquityValue: number | null; upsideToMarket: number | null }>;

      const marginOfSafety = pct(scenarioValues.base.upsideToMarket);
      const docs = documentReadiness.find((row) => row.ticker === ticker);
      const missingFilings = !docs?.ready;
      const verdict = verdictFromMargin(marginOfSafety, missingFilings);
      const fcfMargin = pct(latest?.fcfMargin);
      const debtToEquity = pct(latest?.debtToEquity);
      return {
        ticker,
        company: market?.company ?? null,
        shares,
        averageCost,
        currentPrice: price,
        invested,
        currentValue,
        pnl,
        pnlPct: invested > 0 ? pnl / invested : null,
        marketCap,
        latestFundamentals: latest,
        derived: {
          revenueGrowth: deriveGrowth(market, null),
          baseGrowth,
          baseCashFlow,
          fcfMargin,
          debtToEquity,
          marginOfSafety,
          verdict,
        },
        scenarios: scenarioValues,
        documentReadiness: docs ?? null,
      };
    })
    .filter((position) => position.ticker && position.shares > 0);

  const totalValue = positions.reduce((sum, row) => sum + row.currentValue, 0);
  const totalInvested = positions.reduce((sum, row) => sum + row.invested, 0);
  const enrichedPositions = positions.map((position) => ({
    ...position,
    weight: totalValue > 0 ? position.currentValue / totalValue : 0,
  }));
  const concentration = {
    largest: enrichedPositions.reduce<any | null>(
      (current, row) => (!current || row.currentValue > current.currentValue ? row : current),
      null
    ),
    top3Weight: enrichedPositions
      .slice()
      .sort((a, b) => b.currentValue - a.currentValue)
      .slice(0, 3)
      .reduce((sum, row) => sum + row.weight, 0),
    hhi: enrichedPositions.reduce((sum, row) => sum + row.weight * row.weight, 0),
  };

  const allocationRaw = enrichedPositions.map((position) => ({
    ticker: position.ticker,
    currentWeight: position.weight,
    targetScore: targetWeightFromQuality({
      marginOfSafety: position.derived.marginOfSafety,
      fcfMargin: position.derived.fcfMargin,
      debtToEquity: position.derived.debtToEquity,
      currentWeight: position.weight,
      missingFilings: !position.documentReadiness?.ready,
    }),
    verdict: position.derived.verdict,
  }));
  const scoreTotal = allocationRaw.reduce((sum, row) => sum + row.targetScore, 0) || 1;
  const allocation = allocationRaw.map((row) => {
    const targetWeight = row.targetScore / scoreTotal;
    return {
      ticker: row.ticker,
      verdict: row.verdict,
      currentWeight: row.currentWeight,
      targetWeight,
      targetValue: totalValue * targetWeight,
      deltaValue: totalValue * targetWeight - totalValue * row.currentWeight,
    };
  });

  const expectedReturn =
    allocation.reduce((sum, row) => {
      const pos = enrichedPositions.find((item) => item.ticker === row.ticker);
      const baseUpside = pos?.scenarios?.base?.upsideToMarket ?? 0;
      return sum + row.targetWeight * clamp(baseUpside, -0.5, 1);
    }, 0) || 0;
  const currentExpectedReturn =
    enrichedPositions.reduce((sum, row) => sum + row.weight * clamp(row.scenarios.base.upsideToMarket ?? 0, -0.5, 1), 0) || 0;

  const riskFlags = [
    ...(concentration.largest && concentration.largest.weight > 0.35
      ? [
          {
            type: "concentration",
            severity: "high",
            message: `${concentration.largest.ticker} is above 35% of the research portfolio.`,
          },
        ]
      : []),
    ...(documentReadiness.some((row) => !row.ready)
      ? [
          {
            type: "documents",
            severity: "medium",
            message: "One or more holdings are missing current company documents.",
          },
        ]
      : []),
    ...(enrichedPositions.some((row) => row.latestFundamentals?.freeCashFlow != null && Number(row.latestFundamentals.freeCashFlow) < 0)
      ? [
          {
            type: "cash_flow",
            severity: "medium",
            message: "At least one company has negative free cash flow in the latest annual data.",
          },
        ]
      : []),
  ];

  return {
    version: "2026-06-01",
    assumptions: {
      horizonYears,
      discountRatePct: discountRate * 100,
      terminalGrowthPct: terminalGrowth * 100,
      marginOfSafetyPct: marginOfSafetyTarget * 100,
      baseGrowthPct: assumptions.baseGrowthPct ?? null,
    },
    portfolio: {
      totalValue,
      totalInvested,
      totalPnl: totalValue - totalInvested,
      totalPnlPct: totalInvested > 0 ? (totalValue - totalInvested) / totalInvested : null,
      concentration,
      currentExpectedReturn,
      suggestedExpectedReturn: expectedReturn,
    },
    positions: enrichedPositions,
    documentReadiness,
    allocation,
    simulation: {
      currentExpectedReturn,
      suggestedExpectedReturn: expectedReturn,
      expectedReturnDelta: expectedReturn - currentExpectedReturn,
      horizonYears,
      currentProjectedValue: totalValue * Math.pow(1 + currentExpectedReturn, horizonYears),
      suggestedProjectedValue: totalValue * Math.pow(1 + expectedReturn, horizonYears),
    },
    riskFlags,
  };
}
