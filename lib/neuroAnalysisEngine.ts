import { buildReverseDcfAnalysis } from "@/lib/neuroReverseDcf";
import {
  createFinancialIntegrityManifest,
  financialAssumption,
  financialCalculation,
  financialFact,
  financialNumberOrNull,
  financialTraceId,
  mergeFinancialIntegrityManifests,
  type FinancialDataIntegrityManifest,
  type FinancialTraceRecord,
} from "@/lib/neuroFinancialDataIntegrity";

export type NeuroHoldingInput = {
  ticker: string;
  shares: number;
  averageCost: number | null;
  currentPrice?: number | null;
  openedAt?: string | null;
  researchOnly?: boolean;
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
  instrumentType?: "equity" | "etf" | "fund" | "unknown" | string;
  company?: {
    name?: string | null;
    sector?: string | null;
    industry?: string | null;
    exchange?: string | null;
    quoteType?: string | null;
  };
  market?: {
    regularMarketPrice?: number | null;
    previousClose?: number | null;
    marketCap?: number | null;
    trailingPE?: number | null;
    forwardPE?: number | null;
    dividendYield?: number | null;
  };
  fund?: {
    categoryName?: string | null;
    annualReportExpenseRatio?: number | null;
    netAssets?: number | null;
    yield?: number | null;
    topHoldings?: Array<{ symbol?: string | null; holdingName?: string | null; holdingPercent?: number | null }>;
    sectorWeightings?: Record<string, number | null>;
  } | null;
  annualFundamentals?: Array<{
    year: number;
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
  priceHistory?: Array<{ date: string; close: number }>;
  yearlyPrice?: Array<{ year: number; firstClose: number; lastClose: number; returnPct?: number | null }>;
  financialDataIntegrity?: FinancialDataIntegrityManifest;
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
  return financialNumberOrNull(value) ?? fallback;
}

function maybeNumber(value: unknown) {
  return financialNumberOrNull(value);
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

function isFundLikeMarketItem(item?: NeuroMarketDataItem | null) {
  const instrumentType = String(item?.instrumentType ?? "").toLowerCase();
  const quoteType = String(item?.company?.quoteType ?? "").toUpperCase();
  return instrumentType === "etf" || instrumentType === "fund" || quoteType.includes("ETF") || quoteType.includes("FUND");
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

function daysSince(value?: string | null) {
  if (!value) return null;
  const started = Date.parse(value);
  if (!Number.isFinite(started)) return null;
  return Math.max(1, Math.round((Date.now() - started) / (24 * 60 * 60 * 1000)));
}

function annualizedReturn(currentValue: number | null, invested: number | null, openedAt?: string | null) {
  const days = daysSince(openedAt);
  if (!days || days < 30 || currentValue == null || invested == null || currentValue <= 0 || invested <= 0) return null;
  const value = Math.pow(currentValue / invested, 365 / days) - 1;
  return Number.isFinite(value) ? value : null;
}

function deriveGrowth(item?: NeuroMarketDataItem | null, overridePct?: number | null) {
  if (overridePct != null && Number.isFinite(Number(overridePct))) {
    return clamp(Number(overridePct) / 100, -0.15, 0.3);
  }
  const rows = [...(item?.annualFundamentals ?? [])].sort((a, b) => Number(a.year) - Number(b.year));
  if (rows.length < 2) return null;

  const first = rows[0];
  const last = rows[rows.length - 1];
  const years = Math.max(1, Number(last.year) - Number(first.year));
  const revenueGrowth = cagr(maybeNumber(first.totalRevenue), maybeNumber(last.totalRevenue), years);
  const fcfGrowth = cagr(maybeNumber(first.freeCashFlow), maybeNumber(last.freeCashFlow), years);
  const values = [revenueGrowth, fcfGrowth].filter((value): value is number => value != null);
  if (!values.length) return null;
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

function scenarioGrowths(baseGrowth: number | null): Record<ScenarioName, number | null> {
  if (baseGrowth == null) return { bear: null, base: null, bull: null };
  return {
    bear: clamp(baseGrowth - 0.06, -0.15, 0.12),
    base: clamp(baseGrowth, -0.1, 0.18),
    bull: clamp(baseGrowth + 0.05, -0.05, 0.3),
  };
}

function valuationStatusFromUpside(upside: number | null) {
  if (upside == null) return "unknown";
  if (upside >= 0.15) return "undervalued";
  if (upside <= -0.15) return "overvalued";
  return "fairly_valued";
}

function valuationPostureFromMargin(marginOfSafety: number | null, missingFilings: boolean) {
  if (missingFilings) return "evidence_incomplete";
  if (marginOfSafety == null) return "valuation_unavailable";
  if (marginOfSafety >= 0.25) return "material_discount_to_model";
  if (marginOfSafety >= 0.05) return "discount_to_model";
  if (marginOfSafety >= -0.15) return "near_model_value";
  return "premium_to_model";
}

export function computeDocumentReadiness(
  holdings: NeuroHoldingInput[],
  filings: NeuroFilingMetadata[] = [],
  marketData?: unknown
) {
  const tickers = uniqueTickers(holdings);
  const marketMap = normalizeMarketMap(marketData);
  return tickers.map((ticker) => {
    const marketItem = marketMap[ticker];
    if (isFundLikeMarketItem(marketItem)) {
      return {
        ticker,
        has10k: false,
        has10q: false,
        ready: true,
        latest10k: null,
        latest10q: null,
        missing: [],
        requiresCompanyFilings: false,
        evidenceModel: "fund_profile",
        note: "ETF/fund analysis uses holdings, strategy, fees, yield, liquidity, and market history instead of issuer 10-K/10-Q documents.",
      };
    }

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
      requiresCompanyFilings: true,
      evidenceModel: "company_filings",
    };
  });
}

export function buildNeuroAnalysisEngine(input: {
  language?: "en" | "es";
  holdings: NeuroHoldingInput[];
  marketData?: unknown;
  filings?: NeuroFilingMetadata[];
  assumptions?: NeuroAssumptions;
}) {
  const generatedAt = new Date().toISOString();
  const assumptions = {
    ...DEFAULT_ASSUMPTIONS,
    ...(input.assumptions ?? {}),
  };
  const horizonYears = clamp(Math.round(finiteNumber(assumptions.horizonYears, 5)), 1, 15);
  const discountRate = clamp(finiteNumber(assumptions.discountRatePct, 10) / 100, 0.03, 0.25);
  const terminalGrowth = clamp(finiteNumber(assumptions.terminalGrowthPct, 2.5) / 100, -0.02, 0.06);
  const marginOfSafetyTarget = clamp(finiteNumber(assumptions.marginOfSafetyPct, 25) / 100, 0, 0.75);
  const marketMap = normalizeMarketMap(input.marketData);
  const documentReadiness = computeDocumentReadiness(input.holdings, input.filings ?? [], input.marketData);

  const positions = input.holdings
    .map((holding) => {
      const ticker = normalizeNeuroTicker(holding.ticker);
      const market = marketMap[ticker];
      const price =
        maybeNumber(holding.currentPrice) ??
        maybeNumber(market?.market?.regularMarketPrice) ??
        maybeNumber(market?.market?.previousClose);
      const shares = Math.max(0, finiteNumber(holding.shares));
      const averageCostValue = maybeNumber(holding.averageCost);
      const averageCost = averageCostValue == null ? null : Math.max(0, averageCostValue);
      const invested = averageCost == null ? null : shares * averageCost;
      const currentValue = price == null ? null : shares * price;
      const pnl = currentValue == null || invested == null ? null : currentValue - invested;
      const positionAnnualizedReturn = annualizedReturn(currentValue, invested, holding.openedAt);
      const latest = latestFundamentals(market);
      const baseCashFlow =
        maybeNumber(latest?.freeCashFlow) ??
        maybeNumber(latest?.operatingCashFlow) ??
        maybeNumber(latest?.netIncome);
      const marketCap = maybeNumber(market?.market?.marketCap);
      const baseGrowth = deriveGrowth(market, assumptions.baseGrowthPct ?? null);
      const growths = scenarioGrowths(baseGrowth);
      const debt = maybeNumber(latest?.totalDebt);
      const cash = maybeNumber(latest?.cashAndCashEquivalents);
      const scenarioValueForHorizon = (scenario: ScenarioName, years: number) => {
        const scenarioGrowth = growths[scenario];
        const enterpriseValue =
          baseCashFlow == null || scenarioGrowth == null || debt == null || cash == null
            ? null
            : dcfValue({
                baseCashFlow,
                growth: scenarioGrowth,
                discountRate,
                terminalGrowth,
                horizonYears: years,
              });
        const adjustedEquityValue =
          enterpriseValue == null || debt == null || cash == null
            ? null
            : Math.max(0, enterpriseValue - debt + cash);
        const upsideToMarket =
          adjustedEquityValue != null && marketCap && marketCap > 0
            ? adjustedEquityValue / marketCap - 1
            : null;
        return {
          growth: scenarioGrowth,
          intrinsicEquityValue: adjustedEquityValue,
          upsideToMarket,
        };
      };
      const scenarioValues = Object.fromEntries(
        (Object.keys(growths) as ScenarioName[]).map((scenario) => {
          return [scenario, scenarioValueForHorizon(scenario, horizonYears)];
        })
      ) as Record<ScenarioName, { growth: number | null; intrinsicEquityValue: number | null; upsideToMarket: number | null }>;
      const valuationLadder = Array.from({ length: 9 }, (_, index) => index + 2).map((year) => {
        const bear = scenarioValueForHorizon("bear", year);
        const base = scenarioValueForHorizon("base", year);
        const bull = scenarioValueForHorizon("bull", year);
        return {
          year,
          bear,
          base,
          bull,
          valuationStatus: valuationStatusFromUpside(base.upsideToMarket),
        };
      });

      const marginOfSafety = pct(scenarioValues.base.upsideToMarket);
      const docs = documentReadiness.find((row) => row.ticker === ticker);
      const missingFilings = !docs?.ready;
      const verdict = valuationPostureFromMargin(marginOfSafety, missingFilings);
      const fcfMargin = pct(latest?.fcfMargin);
      const debtToEquity = pct(latest?.debtToEquity);
      const reverseDcf = buildReverseDcfAnalysis({
        language: input.language,
        ticker,
        companyName: market?.company?.name,
        sector: market?.company?.sector,
        industry: market?.company?.industry,
        instrumentType: market?.instrumentType ?? market?.company?.quoteType,
        currentPrice: price,
        marketCap,
        annualFundamentals: market?.annualFundamentals,
        horizonYears: Math.max(10, horizonYears),
        defaultCostOfCapitalPct: discountRate * 100,
        defaultTerminalGrowthPct: terminalGrowth * 100,
      });
      return {
        ticker,
        researchOnly: Boolean(holding.researchOnly),
        company: market?.company ?? null,
        shares,
        averageCost,
        currentPrice: price,
        invested,
        currentValue,
        pnl,
        pnlPct: invested != null && invested > 0 && pnl != null ? pnl / invested : null,
        openedAt: holding.openedAt ?? null,
        annualizedReturn: positionAnnualizedReturn,
        marketCap,
        latestFundamentals: latest,
        derived: {
          revenueGrowth: deriveGrowth(market, null),
          baseGrowth,
          baseCashFlow,
          fcfMargin,
          debtToEquity,
          marginOfSafety,
          valuationStatus: valuationStatusFromUpside(marginOfSafety),
          verdict,
        },
        scenarios: scenarioValues,
        valuationProfile: {
          currentMarketCap: marketCap,
          currentPrice: price,
          baseCashFlow,
          discountRatePct: discountRate * 100,
          terminalGrowthPct: terminalGrowth * 100,
          selectedHorizonYears: horizonYears,
          selectedHorizonScenarios: scenarioValues,
          projectionYears: valuationLadder,
        },
        reverseDcf,
        documentReadiness: docs ?? null,
      };
    })
    .filter((position) => position.ticker && position.shares > 0);

  const totalValue = positions.some((row) => row.currentValue == null)
    ? null
    : positions.reduce((sum, row) => sum + (row.currentValue ?? 0), 0);
  const totalInvested = positions.some((row) => row.invested == null)
    ? null
    : positions.reduce((sum, row) => sum + (row.invested ?? 0), 0);
  const annualizedCostBase = positions.reduce(
      (sum, row) => sum + (row.annualizedReturn != null && row.invested != null ? row.invested : 0),
    0
  );
  const portfolioAnnualizedReturn =
    annualizedCostBase > 0
      ? positions.reduce(
          (sum, row) => sum + (row.annualizedReturn != null && row.invested != null ? row.annualizedReturn * row.invested : 0),
          0
        ) / annualizedCostBase
      : null;
  const enrichedPositions = positions.map((position) => ({
    ...position,
    weight:
      totalValue != null && totalValue > 0 && position.currentValue != null
        ? position.currentValue / totalValue
        : null,
  }));
  const concentration = {
    largest: enrichedPositions.reduce<any | null>(
      (current, row) =>
        row.currentValue != null && (!current || row.currentValue > current.currentValue) ? row : current,
      null
    ),
    top3Weight: enrichedPositions.some((row) => row.weight == null)
      ? null
      : enrichedPositions
      .slice()
      .sort((a, b) => (b.currentValue ?? -Infinity) - (a.currentValue ?? -Infinity))
      .slice(0, 3)
      .reduce((sum, row) => sum + (row.weight ?? 0), 0),
    hhi: enrichedPositions.some((row) => row.weight == null)
      ? null
      : enrichedPositions.reduce((sum, row) => sum + (row.weight ?? 0) * (row.weight ?? 0), 0),
  };

  const allocation = enrichedPositions.map((position) => ({
    ticker: position.ticker,
    currentWeight: position.weight,
    verdict: position.derived.verdict,
    targetWeight: null,
    targetValue: null,
    deltaValue: null,
  }));

  const riskFlags = [
    ...(concentration.largest && concentration.largest.weight != null && concentration.largest.weight > 0.35
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

  const integrityRecords: FinancialTraceRecord[] = [
    financialAssumption({
      id: financialTraceId("engine", "assumptions.horizonYears"),
      path: "engine.assumptions.horizonYears",
      label: "Selected forecast horizon",
      value: horizonYears,
      reportingPeriod: generatedAt,
      publicationDate: generatedAt,
      currency: "N/A",
      units: "years",
    }),
    financialAssumption({
      id: financialTraceId("engine", "assumptions.discountRatePct"),
      path: "engine.assumptions.discountRatePct",
      label: "Discount rate assumption",
      value: discountRate * 100,
      reportingPeriod: generatedAt,
      publicationDate: generatedAt,
      currency: "N/A",
      units: "percent",
    }),
    financialAssumption({
      id: financialTraceId("engine", "assumptions.terminalGrowthPct"),
      path: "engine.assumptions.terminalGrowthPct",
      label: "Terminal growth assumption",
      value: terminalGrowth * 100,
      reportingPeriod: generatedAt,
      publicationDate: generatedAt,
      currency: "N/A",
      units: "percent",
    }),
  ];
  for (const [index, position] of enrichedPositions.entries()) {
    const scope = `${position.ticker}.position.${index}`;
    integrityRecords.push(
      financialFact({
        id: financialTraceId(scope, "shares"),
        path: `engine.positions.${index}.shares`,
        label: `${position.ticker} shares`,
        value: position.shares,
        source: "User portfolio input",
        document: "Research request holdings snapshot",
        reportingPeriod: generatedAt,
        publicationDate: generatedAt,
        currency: "N/A",
        units: "shares",
      }),
      financialFact({
        id: financialTraceId(scope, "averageCost"),
        path: `engine.positions.${index}.averageCost`,
        label: `${position.ticker} average cost`,
        value: position.averageCost,
        source: "User portfolio input",
        document: "Research request holdings snapshot",
        reportingPeriod: generatedAt,
        publicationDate: generatedAt,
        currency: "USD",
        units: "USD/share",
      }),
      financialCalculation({
        id: financialTraceId(scope, "invested"),
        path: `engine.positions.${index}.invested`,
        label: `${position.ticker} invested cost basis`,
        value: position.invested,
        formula: "shares * averageCost",
        inputs: [
          { name: "shares", value: position.shares, traceId: financialTraceId(scope, "shares") },
          { name: "averageCost", value: position.averageCost, traceId: financialTraceId(scope, "averageCost") },
        ],
        calculationTimestamp: generatedAt,
        reportingPeriod: generatedAt,
        currency: "USD",
        units: "USD",
      }),
      financialCalculation({
        id: financialTraceId(scope, "currentValue"),
        path: `engine.positions.${index}.currentValue`,
        label: `${position.ticker} current position value`,
        value: position.currentValue,
        formula: "shares * currentPrice",
        inputs: [
          { name: "shares", value: position.shares, traceId: financialTraceId(scope, "shares") },
          { name: "currentPrice", value: position.currentPrice, traceId: financialTraceId(position.ticker, "market.regularMarketPrice") },
        ],
        calculationTimestamp: generatedAt,
        reportingPeriod: generatedAt,
        currency: "USD",
        units: "USD",
      }),
      financialCalculation({
        id: financialTraceId(scope, "pnl"),
        path: `engine.positions.${index}.pnl`,
        label: `${position.ticker} unrealized result`,
        value: position.pnl,
        formula: "currentValue - invested",
        inputs: [
          { name: "currentValue", value: position.currentValue, traceId: financialTraceId(scope, "currentValue") },
          { name: "invested", value: position.invested, traceId: financialTraceId(scope, "invested") },
        ],
        calculationTimestamp: generatedAt,
        reportingPeriod: generatedAt,
        currency: "USD",
        units: "USD",
      })
    );
    for (const scenario of ["bear", "base", "bull"] as const) {
      const scenarioValue = position.scenarios[scenario];
      integrityRecords.push(financialCalculation({
        id: financialTraceId(scope, `scenarios.${scenario}.intrinsicEquityValue`),
        path: `engine.positions.${index}.scenarios.${scenario}.intrinsicEquityValue`,
        label: `${position.ticker} ${scenario} intrinsic equity value`,
        value: scenarioValue.intrinsicEquityValue,
        classification: "ESTIMATE",
        formula: "DCF(baseCashFlow, growth, discountRate, terminalGrowth, horizonYears) - totalDebt + cashAndCashEquivalents",
        inputs: [
          { name: "baseCashFlow", value: position.derived.baseCashFlow },
          { name: "growth", value: scenarioValue.growth },
          { name: "discountRate", value: discountRate },
          { name: "terminalGrowth", value: terminalGrowth },
          { name: "horizonYears", value: horizonYears },
          { name: "totalDebt", value: maybeNumber(position.latestFundamentals?.totalDebt) },
          { name: "cashAndCashEquivalents", value: maybeNumber(position.latestFundamentals?.cashAndCashEquivalents) },
        ],
        calculationTimestamp: generatedAt,
        reportingPeriod: position.latestFundamentals?.year ? `FY ${position.latestFundamentals.year}` : generatedAt,
        currency: "USD",
        units: "USD",
      }));
    }
  }
  const financialDataIntegrity = mergeFinancialIntegrityManifests([
    ...Object.values(marketMap).map((item) => item.financialDataIntegrity),
    ...enrichedPositions.map((position) => position.reverseDcf.financialDataIntegrity),
    createFinancialIntegrityManifest(integrityRecords, generatedAt),
  ], generatedAt);

  return {
    version: "2026-09-16",
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
      totalPnl: totalValue == null || totalInvested == null ? null : totalValue - totalInvested,
      totalPnlPct: totalValue != null && totalInvested != null && totalInvested > 0 ? (totalValue - totalInvested) / totalInvested : null,
      annualizedReturn: portfolioAnnualizedReturn,
      concentration,
      currentExpectedReturn: null,
      suggestedExpectedReturn: null,
    },
    positions: enrichedPositions,
    documentReadiness,
    allocation,
    simulation: {
      currentExpectedReturn: null,
      suggestedExpectedReturn: null,
      expectedReturnDelta: null,
      horizonYears,
      currentProjectedValue: null,
      suggestedProjectedValue: null,
      automaticAllocationGenerated: false,
      stockPricePredictionGenerated: false,
    },
    riskFlags,
    financialDataIntegrity,
  };
}
