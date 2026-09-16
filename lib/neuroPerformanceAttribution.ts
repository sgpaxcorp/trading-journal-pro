import {
  createFinancialIntegrityManifest,
  financialCalculation,
  financialFact,
  financialNumberOrNull,
  financialTraceId,
  type FinancialDataIntegrityManifest,
  type FinancialTraceRecord,
} from "@/lib/neuroFinancialDataIntegrity";

export type PerformanceCalculationStatus =
  | "calculated"
  | "partial"
  | "unavailable"
  | "not_applicable";

export type ExternalCashFlow = {
  date: string;
  type: "contribution" | "withdrawal";
  amount: number;
};

export type LinkedReturnSubperiod = {
  startDate: string;
  endDate: string;
  beginningValue: number;
  endingValue: number;
};

export type PerformancePnlComponents = {
  realizedGains?: number | null;
  unrealizedGains?: number | null;
  dividends?: number | null;
  cashIncome?: number | null;
  feesAndExpenses?: number | null;
  currencyGainLoss?: number | null;
};

export type PerformancePositionInput = PerformancePnlComponents & {
  ticker: string;
  sector?: string | null;
  currency?: string | null;
  beginningMarketValue?: number | null;
  endingMarketValue?: number | null;
  beginningWeight?: number | null;
  baseReturnDecimal?: number | null;
  localReturnDecimal?: number | null;
};

export type BenchmarkSectorInput = {
  sector: string;
  weight: number;
  returnDecimal: number;
};

export type PerformanceAttributionInput = {
  period: {
    startDate: string;
    endDate: string;
  };
  baseCurrency: string;
  beginningValue?: number | null;
  endingValue?: number | null;
  linkedSubperiods?: LinkedReturnSubperiod[];
  externalCashFlows?: ExternalCashFlow[];
  positions?: PerformancePositionInput[];
  pnlComponents?: PerformancePnlComponents;
  cash?: {
    beginningValue?: number | null;
    endingValue?: number | null;
    returnDecimal?: number | null;
    income?: number | null;
  };
  benchmark: {
    ticker: string;
    returnDecimal?: number | null;
    startPrice?: number | null;
    endPrice?: number | null;
    sectors?: BenchmarkSectorInput[];
  };
  concentrationCapPct?: number | null;
};

export type PerformanceReturnMetric = {
  status: PerformanceCalculationStatus;
  method: string;
  valuePct: number | null;
  annualizedValuePct?: number | null;
  formula: string;
  note: string;
};

export type PerformanceMoneyComponent = {
  status: PerformanceCalculationStatus;
  amount: number | null;
  note: string;
};

export type PerformanceEffect = {
  status: PerformanceCalculationStatus;
  effectPct: number | null;
  additive: boolean;
  note: string;
};

export type PerformanceAttributionReport = {
  version: "2026-09-16";
  calculationAuthority: "deterministic_financial_code";
  llmCalculationAllowed: false;
  generatedAt: string;
  mode: "full_period" | "cost_basis_snapshot";
  period: {
    startDate: string | null;
    endDate: string;
    baseCurrency: string;
  };
  portfolioReturn: PerformanceReturnMetric;
  investorReturn: PerformanceReturnMetric;
  benchmark: {
    ticker: string;
    status: PerformanceCalculationStatus;
    returnPct: number | null;
    method: string;
  };
  activeReturnPct: number | null;
  externalCashFlows: {
    contributions: number;
    withdrawals: number;
    netIntoPortfolio: number;
    excludedFromInvestmentPnl: true;
  };
  pnlAttribution: {
    beginningValue: number | null;
    endingValue: number | null;
    investmentPnl: number | null;
    realizedGains: PerformanceMoneyComponent;
    unrealizedGains: PerformanceMoneyComponent;
    dividends: PerformanceMoneyComponent;
    cashIncome: PerformanceMoneyComponent;
    feesAndExpenses: PerformanceMoneyComponent;
    currencyGainLoss: PerformanceMoneyComponent;
    explainedPnl: number | null;
    unexplainedResidual: PerformanceMoneyComponent;
    reconciled: boolean;
  };
  activeAttribution: {
    status: PerformanceCalculationStatus;
    sectorExposure: PerformanceEffect;
    securitySelection: PerformanceEffect;
    cash: PerformanceEffect;
    currency: PerformanceEffect;
    feesAndExpenses: PerformanceEffect;
    residual: PerformanceEffect;
    explainedActiveReturnPct: number | null;
    methodology: string;
  };
  concentration: {
    status: PerformanceCalculationStatus;
    capPct: number | null;
    positionsAboveCap: Array<{
      ticker: string;
      beginningWeightPct: number;
      excessWeightPct: number;
    }>;
    totalExcessWeightPct: number | null;
    effectPct: number | null;
    additive: false;
    note: string;
  };
  snapshot: {
    costBasis: number;
    currentValue: number;
    unrealizedGain: number;
    costBasisReturnPct: number | null;
    isTimeWeightedReturn: false;
  } | null;
  dataQuality: {
    status: "complete" | "partial" | "insufficient";
    available: string[];
    missing: string[];
  };
  methodology: {
    portfolioLevel: string;
    investorLevel: string;
    pnl: string;
    activeAttribution: string;
    concentration: string;
  };
  calculationInput: PerformanceAttributionInput;
  financialDataIntegrity: FinancialDataIntegrityManifest;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EPSILON = 1e-9;

function finiteOrNull(value: unknown): number | null {
  return financialNumberOrNull(value);
}

function round(value: number | null, digits = 10) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function roundMoney(value: number | null) {
  return round(value, 2);
}

function roundPct(decimal: number | null) {
  return decimal == null ? null : round(decimal * 100, 8);
}

function parseDate(value: string) {
  const time = Date.parse(`${String(value ?? "").slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(time) ? time : null;
}

function daysBetween(startDate: string, endDate: string) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (start == null || end == null || end <= start) return null;
  return (end - start) / DAY_MS;
}

function signedPortfolioFlow(flow: ExternalCashFlow) {
  const amount = Math.abs(flow.amount);
  return flow.type === "withdrawal" ? -amount : amount;
}

function normalizedFlows(flows: ExternalCashFlow[] | undefined) {
  return (flows ?? [])
    .slice(0, 10_000)
    .flatMap((flow) => {
      const amount = finiteOrNull(flow?.amount);
      if (amount == null) return [];
      return [{
        date: String(flow?.date ?? "").slice(0, 10),
        type: flow?.type === "withdrawal" ? ("withdrawal" as const) : ("contribution" as const),
        amount: Math.abs(amount),
      }];
    })
    .filter((flow) => parseDate(flow.date) != null && flow.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function calculateLinkedTimeWeightedReturn(subperiods: LinkedReturnSubperiod[]) {
  if (!Array.isArray(subperiods) || subperiods.length === 0) return null;
  let growth = 1;
  let previousEnd: number | null = null;
  for (const period of subperiods.slice(0, 10_000)) {
    const beginningValue = finiteOrNull(period.beginningValue);
    const endingValue = finiteOrNull(period.endingValue);
    const start = parseDate(period.startDate);
    const end = parseDate(period.endDate);
    if (
      beginningValue == null ||
      endingValue == null ||
      beginningValue <= 0 ||
      endingValue < 0 ||
      start == null ||
      end == null ||
      end <= start ||
      (previousEnd != null && start < previousEnd)
    ) {
      return null;
    }
    growth *= 1 + (endingValue / beginningValue - 1);
    previousEnd = end;
  }
  const result = growth - 1;
  return Number.isFinite(result) ? result : null;
}

export function calculateModifiedDietzReturn(input: {
  startDate: string;
  endDate: string;
  beginningValue: number;
  endingValue: number;
  externalCashFlows?: ExternalCashFlow[];
}) {
  const totalDays = daysBetween(input.startDate, input.endDate);
  const beginningValue = finiteOrNull(input.beginningValue);
  const endingValue = finiteOrNull(input.endingValue);
  if (totalDays == null || beginningValue == null || endingValue == null || beginningValue < 0 || endingValue < 0) {
    return null;
  }

  let netFlow = 0;
  let weightedFlow = 0;
  const start = parseDate(input.startDate)!;
  const end = parseDate(input.endDate)!;
  for (const flow of normalizedFlows(input.externalCashFlows)) {
    const flowTime = parseDate(flow.date)!;
    if (flowTime < start || flowTime > end) continue;
    const signed = signedPortfolioFlow(flow);
    const remainingDays = Math.max(0, (end - flowTime) / DAY_MS);
    const weight = remainingDays / totalDays;
    netFlow += signed;
    weightedFlow += signed * weight;
  }

  const denominator = beginningValue + weightedFlow;
  if (Math.abs(denominator) <= EPSILON) return null;
  const result = (endingValue - beginningValue - netFlow) / denominator;
  return Number.isFinite(result) ? result : null;
}

function xnpv(rate: number, cashFlows: Array<{ date: string; amount: number }>) {
  if (rate <= -1) return Number.POSITIVE_INFINITY;
  const first = parseDate(cashFlows[0]?.date ?? "");
  if (first == null) return Number.NaN;
  return cashFlows.reduce((sum, flow) => {
    const current = parseDate(flow.date);
    if (current == null) return Number.NaN;
    const years = (current - first) / DAY_MS / 365;
    return sum + flow.amount / Math.pow(1 + rate, years);
  }, 0);
}

export function calculateXirr(cashFlows: Array<{ date: string; amount: number }>) {
  const rows = cashFlows
    .map((flow) => ({ date: String(flow?.date ?? "").slice(0, 10), amount: finiteOrNull(flow?.amount) }))
    .filter((flow): flow is { date: string; amount: number } => parseDate(flow.date) != null && flow.amount != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2 || !rows.some((row) => row.amount < 0) || !rows.some((row) => row.amount > 0)) {
    return null;
  }

  let low = -0.999999;
  let high = 1;
  let lowValue = xnpv(low, rows);
  let highValue = xnpv(high, rows);
  let expansions = 0;
  while (Number.isFinite(highValue) && Math.sign(lowValue) === Math.sign(highValue) && expansions < 60) {
    high = high * 2 + 1;
    highValue = xnpv(high, rows);
    expansions += 1;
  }
  if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || Math.sign(lowValue) === Math.sign(highValue)) {
    return null;
  }

  for (let iteration = 0; iteration < 240; iteration += 1) {
    const midpoint = (low + high) / 2;
    const value = xnpv(midpoint, rows);
    if (!Number.isFinite(value)) return null;
    if (Math.abs(value) < 1e-10 || Math.abs(high - low) < 1e-12) return midpoint;
    if (Math.sign(value) === Math.sign(lowValue)) {
      low = midpoint;
      lowValue = value;
    } else {
      high = midpoint;
      highValue = value;
    }
  }
  const result = (low + high) / 2;
  return Number.isFinite(result) ? result : null;
}

function unavailableReturn(method: string, note: string): PerformanceReturnMetric {
  return {
    status: "unavailable",
    method,
    valuePct: null,
    formula: "Insufficient dated valuation data.",
    note,
  };
}

function aggregatePnlComponent(
  key: keyof PerformancePnlComponents,
  topLevel: PerformancePnlComponents | undefined,
  positions: PerformancePositionInput[],
  note: string,
  transform: (value: number) => number = (value) => value
): PerformanceMoneyComponent {
  const direct = finiteOrNull(topLevel?.[key]);
  if (direct != null) {
    return { status: "calculated", amount: roundMoney(transform(direct)), note };
  }
  const values = positions.map((position) => finiteOrNull(position[key]));
  const known = values.filter((value): value is number => value != null);
  if (!known.length) return { status: "unavailable", amount: null, note };
  return {
    status: known.length === values.length ? "calculated" : "partial",
    amount: roundMoney(known.reduce((sum, value) => sum + transform(value), 0)),
    note,
  };
}

function benchmarkReturn(input: PerformanceAttributionInput) {
  const supplied = finiteOrNull(input.benchmark.returnDecimal);
  if (supplied != null) {
    return { status: "calculated" as const, decimal: supplied, method: "configured total return" };
  }
  const start = finiteOrNull(input.benchmark.startPrice);
  const end = finiteOrNull(input.benchmark.endPrice);
  if (start != null && end != null && start > 0 && end >= 0) {
    return {
      status: "partial" as const,
      decimal: end / start - 1,
      method: "price return only; distributions unavailable",
    };
  }
  const sectors = (input.benchmark.sectors ?? []).filter(
    (row) => finiteOrNull(row.weight) != null && finiteOrNull(row.returnDecimal) != null
  );
  const weight = sectors.reduce((sum, row) => sum + Number(row.weight), 0);
  if (sectors.length && weight > 0) {
    return {
      status: "calculated" as const,
      decimal: sectors.reduce((sum, row) => sum + Number(row.weight) * Number(row.returnDecimal), 0) / weight,
      method: "weighted benchmark sector total return",
    };
  }
  return { status: "unavailable" as const, decimal: null, method: "benchmark return unavailable" };
}

function positionWeight(position: PerformancePositionInput, totalBeginningValue: number) {
  const supplied = finiteOrNull(position.beginningWeight);
  if (supplied != null && supplied >= 0) return supplied;
  const beginningValue = finiteOrNull(position.beginningMarketValue);
  if (beginningValue != null && beginningValue >= 0 && totalBeginningValue > 0) {
    return beginningValue / totalBeginningValue;
  }
  return null;
}

function positionBaseReturn(position: PerformancePositionInput) {
  const supplied = finiteOrNull(position.baseReturnDecimal);
  if (supplied != null) return supplied;
  return finiteOrNull(position.localReturnDecimal);
}

function sectorKey(value: unknown) {
  return String(value || "Unclassified")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizedWeight(value: unknown) {
  const parsed = finiteOrNull(value);
  if (parsed == null || parsed < 0) return null;
  return parsed > 1 ? parsed / 100 : parsed;
}

function completeBeginningValue(input: PerformanceAttributionInput, positions: PerformancePositionInput[]) {
  const supplied = finiteOrNull(input.beginningValue);
  if (supplied != null) return supplied;
  const positionValues = positions.map((row) => finiteOrNull(row.beginningMarketValue));
  const cashValue = finiteOrNull(input.cash?.beginningValue);
  if (!positionValues.length || positionValues.some((value) => value == null) || cashValue == null) return null;
  return positionValues.reduce<number>((sum, value) => sum + Math.max(0, value!), 0) + Math.max(0, cashValue);
}

function calculateActiveAttribution(
  input: PerformanceAttributionInput,
  portfolioReturnDecimal: number | null,
  benchmarkReturnDecimal: number | null
): PerformanceAttributionReport["activeAttribution"] {
  const unavailable = (note: string): PerformanceEffect => ({
    status: "unavailable",
    effectPct: null,
    additive: true,
    note,
  });
  const positions = (input.positions ?? []).slice(0, 5_000);
  const benchmarkSectors = (input.benchmark.sectors ?? []).slice(0, 1_000);
  const totalBeginningValue = completeBeginningValue(input, positions);
  if (
    portfolioReturnDecimal == null ||
    benchmarkReturnDecimal == null ||
    totalBeginningValue == null ||
    totalBeginningValue <= 0 ||
    !positions.length ||
    !benchmarkSectors.length
  ) {
    return {
      status: "unavailable",
      sectorExposure: unavailable("Requires period returns, beginning weights, and benchmark sector returns."),
      securitySelection: unavailable("Requires period returns, beginning weights, and benchmark sector returns."),
      cash: unavailable("Requires beginning cash weight and a cash return."),
      currency: unavailable("Requires local-currency and base-currency returns for foreign holdings."),
      feesAndExpenses: unavailable("Requires period fees and beginning portfolio value."),
      residual: unavailable("Active-return reconciliation is unavailable."),
      explainedActiveReturnPct: null,
      methodology: "Brinson-Fachler allocation with selection and interaction combined as security selection.",
    };
  }

  const benchmarkBySector = new Map(
    benchmarkSectors.map((row) => [sectorKey(row.sector), row])
  );
  const benchmarkWeights = benchmarkSectors.map((row) => normalizedWeight(row.weight));
  const benchmarkSectorWeightTotal = benchmarkWeights.some((weight) => weight == null)
    ? null
    : benchmarkWeights.reduce<number>((sum, weight) => sum + weight!, 0);
  const portfolioRows = positions
    .map((position) => {
      const weight = positionWeight(position, totalBeginningValue);
      const baseReturn = positionBaseReturn(position);
      const localReturn = finiteOrNull(position.localReturnDecimal) ?? baseReturn;
      return {
        ...position,
        sectorKey: sectorKey(position.sector),
        weight,
        baseReturn,
        localReturn,
      };
    })
    .filter(
      (row): row is typeof row & { weight: number; baseReturn: number; localReturn: number } =>
        row.weight != null && row.baseReturn != null && row.localReturn != null
    );

  const grouped = new Map<string, { weight: number; weightedReturn: number }>();
  for (const row of portfolioRows) {
    const current = grouped.get(row.sectorKey) ?? { weight: 0, weightedReturn: 0 };
    current.weight += row.weight;
    current.weightedReturn += row.weight * row.localReturn;
    grouped.set(row.sectorKey, current);
  }

  let allocation = 0;
  let selection = 0;
  let missingSectorEvidence = false;
  for (const [sectorKey, portfolioSector] of grouped.entries()) {
    const benchmarkSector = benchmarkBySector.get(sectorKey);
    if (!benchmarkSector || portfolioSector.weight <= 0) {
      missingSectorEvidence = true;
      continue;
    }
    const portfolioSectorReturn = portfolioSector.weightedReturn / portfolioSector.weight;
    const normalizedBenchmarkWeight = normalizedWeight(benchmarkSector.weight);
    const benchmarkSectorReturn = finiteOrNull(benchmarkSector.returnDecimal);
    if (benchmarkSectorWeightTotal == null || benchmarkSectorWeightTotal <= 0 || normalizedBenchmarkWeight == null || benchmarkSectorReturn == null) {
      missingSectorEvidence = true;
      continue;
    }
    const benchmarkWeight = normalizedBenchmarkWeight / benchmarkSectorWeightTotal;
    allocation +=
      (portfolioSector.weight - benchmarkWeight) * (benchmarkSectorReturn - benchmarkReturnDecimal);
    selection += portfolioSector.weight * (portfolioSectorReturn - benchmarkSectorReturn);
  }

  const cashBeginningValue = finiteOrNull(input.cash?.beginningValue);
  const cashBeginning = cashBeginningValue == null ? null : Math.max(0, cashBeginningValue);
  const cashWeight = cashBeginning == null ? null : cashBeginning / totalBeginningValue;
  const cashReturn = finiteOrNull(input.cash?.returnDecimal);
  const cashEffect = cashWeight != null && cashWeight > 0 && cashReturn != null
    ? cashWeight * (cashReturn - benchmarkReturnDecimal)
    : cashWeight === 0
      ? 0
      : null;

  const foreignPositions = positions.filter(
    (row) => String(row.currency || input.baseCurrency).toUpperCase() !== input.baseCurrency.toUpperCase()
  );
  const foreignRows = portfolioRows.filter(
    (row) => String(row.currency || input.baseCurrency).toUpperCase() !== input.baseCurrency.toUpperCase()
  );
  const currencyKnown = foreignRows.filter(
    (row) => finiteOrNull(row.baseReturnDecimal) != null && finiteOrNull(row.localReturnDecimal) != null
  );
  const currencyEffect = foreignPositions.length
    ? currencyKnown.reduce(
        (sum, row) => sum + row.weight * (Number(row.baseReturnDecimal) - Number(row.localReturnDecimal)),
        0
      )
    : 0;

  const fees = aggregatePnlComponent(
    "feesAndExpenses",
    input.pnlComponents,
    positions,
    "Observed fees and expenses reduce return.",
    (value) => -Math.abs(value)
  );
  const feeEffect = fees.amount != null ? fees.amount / totalBeginningValue : null;
  const knownEffects = [allocation, selection, cashEffect, currencyEffect, feeEffect].filter(
    (value): value is number => value != null
  );
  const explained = knownEffects.reduce((sum, value) => sum + value, 0);
  const activeReturn = portfolioReturnDecimal - benchmarkReturnDecimal;
  const residual = activeReturn - explained;
  const partial =
    missingSectorEvidence ||
    portfolioRows.length !== positions.length ||
    cashEffect == null ||
    (foreignPositions.length > 0 && currencyKnown.length !== foreignPositions.length) ||
    feeEffect == null;

  return {
    status: partial ? "partial" : "calculated",
    sectorExposure: {
      status: missingSectorEvidence ? "partial" : "calculated",
      effectPct: roundPct(allocation),
      additive: true,
      note: "Brinson-Fachler sector allocation effect, excluding cash.",
    },
    securitySelection: {
      status: missingSectorEvidence ? "partial" : "calculated",
      effectPct: roundPct(selection),
      additive: true,
      note: "Within-sector selection plus interaction; this avoids presenting interaction as a hidden extra bucket.",
    },
    cash: {
      status: cashEffect == null ? "unavailable" : "calculated",
      effectPct: roundPct(cashEffect),
      additive: true,
      note: "Beginning cash weight multiplied by cash return minus benchmark return.",
    },
    currency: {
      status: foreignPositions.length === 0
        ? "not_applicable"
        : currencyKnown.length === foreignPositions.length
          ? "calculated"
          : currencyKnown.length
            ? "partial"
            : "unavailable",
      effectPct: foreignPositions.length === 0 || currencyKnown.length ? roundPct(currencyEffect) : null,
      additive: true,
      note: "Weighted difference between base-currency and local-currency total return.",
    },
    feesAndExpenses: {
      status: fees.status,
      effectPct: roundPct(feeEffect),
      additive: true,
      note: "Observed period fees and expenses divided by beginning portfolio value.",
    },
    residual: {
      status: "calculated",
      effectPct: roundPct(residual),
      additive: true,
      note: partial
        ? "Includes missing sector, security, cash, currency, fee, timing, and compounding evidence."
        : "Rounding, timing, and geometric-versus-arithmetic reconciliation residual.",
    },
    explainedActiveReturnPct: roundPct(explained),
    methodology: "Brinson-Fachler allocation; selection and interaction combined; cash, currency, and fees shown separately.",
  };
}

function calculateConcentration(
  input: PerformanceAttributionInput,
  benchmarkReturnDecimal: number | null
): PerformanceAttributionReport["concentration"] {
  const positions = (input.positions ?? []).slice(0, 5_000);
  const capPct = finiteOrNull(input.concentrationCapPct);
  const totalBeginningValue = completeBeginningValue(input, positions);
  if (capPct == null || capPct <= 0 || totalBeginningValue == null || totalBeginningValue <= 0) {
    return {
      status: "unavailable",
      capPct: capPct == null ? null : round(capPct, 4),
      positionsAboveCap: [],
      totalExcessWeightPct: null,
      effectPct: null,
      additive: false,
      note: "A configured position cap and beginning weights are required.",
    };
  }

  const cap = capPct / 100;
  const rows = positions
    .map((position) => {
      const weight = positionWeight(position, totalBeginningValue);
      return {
        ticker: String(position.ticker ?? "").toUpperCase(),
        weight,
        returnDecimal: positionBaseReturn(position),
      };
    })
    .filter((row): row is { ticker: string; weight: number; returnDecimal: number | null } => row.weight != null)
    .filter((row) => row.weight > cap);
  const withReturn = rows.filter(
    (row): row is { ticker: string; weight: number; returnDecimal: number } => row.returnDecimal != null
  );
  const totalExcess = rows.reduce((sum, row) => sum + (row.weight - cap), 0);
  const effect = benchmarkReturnDecimal == null || withReturn.length !== rows.length
    ? null
    : withReturn.reduce(
        (sum, row) => sum + (row.weight - cap) * (row.returnDecimal - benchmarkReturnDecimal),
        0
      );
  return {
    status: effect != null ? "calculated" : rows.length ? "partial" : "calculated",
    capPct: round(capPct, 4),
    positionsAboveCap: rows.map((row) => ({
      ticker: row.ticker,
      beginningWeightPct: roundPct(row.weight) ?? 0,
      excessWeightPct: roundPct(row.weight - cap) ?? 0,
    })),
    totalExcessWeightPct: roundPct(totalExcess),
    effectPct: roundPct(effect),
    additive: false,
    note: "Counterfactual excess-weight effect versus the benchmark. It is diagnostic and is not added to active-return attribution.",
  };
}

function snapshotFromEngine(engine: any): PerformanceAttributionReport["snapshot"] {
  const positions = (Array.isArray(engine?.positions) ? engine.positions : []).filter(
    (position: any) => !position?.researchOnly
  );
  if (!positions.length) return null;
  const costBasisValues: Array<number | null> = positions.map((position: any) => finiteOrNull(position?.invested));
  const currentValues: Array<number | null> = positions.map((position: any) => finiteOrNull(position?.currentValue));
  if (costBasisValues.some((value: number | null) => value == null) || currentValues.some((value: number | null) => value == null)) return null;
  const costBasis = costBasisValues.reduce<number>((sum: number, value: number | null) => sum + Math.max(0, value!), 0);
  const currentValue = currentValues.reduce<number>((sum: number, value: number | null) => sum + Math.max(0, value!), 0);
  return {
    costBasis: roundMoney(costBasis)!,
    currentValue: roundMoney(currentValue)!,
    unrealizedGain: roundMoney(currentValue - costBasis)!,
    costBasisReturnPct: costBasis > 0 ? roundPct(currentValue / costBasis - 1) : null,
    isTimeWeightedReturn: false,
  };
}

export function calculatePerformanceAttribution(
  input: PerformanceAttributionInput,
  options: { generatedAt?: string; snapshot?: PerformanceAttributionReport["snapshot"] } = {}
): PerformanceAttributionReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const positions = Array.isArray(input.positions) ? input.positions.slice(0, 5_000) : [];
  const startTime = parseDate(input.period.startDate);
  const endTime = parseDate(input.period.endDate);
  const flows = normalizedFlows(input.externalCashFlows).filter((flow) => {
    const flowTime = parseDate(flow.date);
    return flowTime != null && startTime != null && endTime != null && flowTime >= startTime && flowTime <= endTime;
  });
  input = {
    ...input,
    positions,
    externalCashFlows: flows,
    linkedSubperiods: (input.linkedSubperiods ?? []).slice(0, 10_000),
    benchmark: {
      ...input.benchmark,
      sectors: (input.benchmark.sectors ?? []).slice(0, 1_000),
    },
  };
  const beginningValue = finiteOrNull(input.beginningValue);
  const endingValue = finiteOrNull(input.endingValue);
  const linkedReturn = calculateLinkedTimeWeightedReturn(input.linkedSubperiods ?? []);
  const modifiedDietz =
    linkedReturn == null && beginningValue != null && endingValue != null
      ? calculateModifiedDietzReturn({
          startDate: input.period.startDate,
          endDate: input.period.endDate,
          beginningValue,
          endingValue,
          externalCashFlows: flows,
        })
      : null;
  const portfolioReturnDecimal = linkedReturn ?? modifiedDietz;
  const portfolioReturn: PerformanceReturnMetric = linkedReturn != null
    ? {
        status: "calculated",
        method: "geometrically_linked_time_weighted_return",
        valuePct: roundPct(linkedReturn),
        formula: "Product(1 + subperiod return) - 1",
        note: "Each supplied subperiod begins and ends at a valuation boundary, removing external-flow timing from portfolio performance.",
      }
    : modifiedDietz != null
      ? {
          status: "calculated",
          method: "modified_dietz",
          valuePct: roundPct(modifiedDietz),
          formula: "(Ending value - Beginning value - net external flows) / (Beginning value + daily-weighted external flows)",
          note: "Daily-weighted approximation used because flow-date valuation subperiods were not supplied.",
        }
      : unavailableReturn(
          "time_weighted_return",
          "Supply beginning and ending valuations plus dated external flows, or valuation subperiods at each external flow."
        );

  const xirrCashFlows: Array<{ date: string; amount: number }> = [];
  if (beginningValue != null && beginningValue > 0) {
    xirrCashFlows.push({ date: input.period.startDate, amount: -beginningValue });
    for (const flow of flows) {
      xirrCashFlows.push({
        date: flow.date,
        amount: flow.type === "contribution" ? -flow.amount : flow.amount,
      });
    }
    if (endingValue != null && endingValue >= 0) {
      xirrCashFlows.push({ date: input.period.endDate, amount: endingValue });
    }
  }
  const annualizedXirr = calculateXirr(xirrCashFlows);
  const periodDays = daysBetween(input.period.startDate, input.period.endDate);
  const periodMwr = annualizedXirr != null && periodDays != null && annualizedXirr > -1
    ? Math.pow(1 + annualizedXirr, periodDays / 365) - 1
    : null;
  const investorReturn: PerformanceReturnMetric = annualizedXirr != null
    ? {
        status: "calculated",
        method: "xirr_money_weighted_return",
        valuePct: roundPct(periodMwr),
        annualizedValuePct: roundPct(annualizedXirr),
        formula: "Solve sum(investor cash flow / (1 + r)^(days/365)) = 0",
        note: "Contributions are investor outflows and withdrawals are investor inflows; they affect timing, not investment profit.",
      }
    : unavailableReturn(
        "xirr_money_weighted_return",
        "Supply valid period dates, beginning and ending values, and dated external flows."
      );

  const contributions = flows
    .filter((flow) => flow.type === "contribution")
    .reduce((sum, flow) => sum + flow.amount, 0);
  const withdrawals = flows
    .filter((flow) => flow.type === "withdrawal")
    .reduce((sum, flow) => sum + flow.amount, 0);
  const netExternalFlow = contributions - withdrawals;
  const investmentPnl = beginningValue != null && endingValue != null
    ? endingValue - beginningValue - netExternalFlow
    : null;

  const realizedGains = aggregatePnlComponent(
    "realizedGains",
    input.pnlComponents,
    positions,
    "Realized gain or loss from closed lots during the period."
  );
  const unrealizedGains = aggregatePnlComponent(
    "unrealizedGains",
    input.pnlComponents,
    positions,
    "Change in unrealized gain or loss for open lots during the period."
  );
  const dividends = aggregatePnlComponent(
    "dividends",
    input.pnlComponents,
    positions,
    "Cash and accrued dividends attributable to the period."
  );
  const cashIncome = aggregatePnlComponent(
    "cashIncome",
    {
      ...input.pnlComponents,
      cashIncome: input.pnlComponents?.cashIncome ?? input.cash?.income,
    },
    positions,
    "Interest or equivalent return earned by cash and cash-management instruments."
  );
  const feesAndExpenses = aggregatePnlComponent(
    "feesAndExpenses",
    input.pnlComponents,
    positions,
    "Fees and expenses are shown as a negative contribution.",
    (value) => -Math.abs(value)
  );
  const currencyGainLoss = aggregatePnlComponent(
    "currencyGainLoss",
    input.pnlComponents,
    positions,
    "Realized and unrealized translation effect into the configured base currency."
  );
  const moneyComponents = [
    realizedGains,
    unrealizedGains,
    dividends,
    cashIncome,
    feesAndExpenses,
    currencyGainLoss,
  ];
  const knownMoney = moneyComponents.filter((component) => component.amount != null);
  const explainedPnl = knownMoney.length
    ? knownMoney.reduce((sum, component) => sum + Number(component.amount), 0)
    : null;
  const residual = investmentPnl != null && explainedPnl != null ? investmentPnl - explainedPnl : null;
  const allMoneyKnown = moneyComponents.every((component) => component.status === "calculated");
  const residualTolerance = Math.max(0.01, Math.abs(investmentPnl ?? 0) * 1e-8);
  const reconciled = investmentPnl != null && allMoneyKnown && residual != null && Math.abs(residual) <= residualTolerance;

  const benchmark = benchmarkReturn(input);
  const activeReturnPct = portfolioReturnDecimal != null && benchmark.decimal != null
    ? roundPct(portfolioReturnDecimal - benchmark.decimal)
    : null;
  const activeAttribution = calculateActiveAttribution(input, portfolioReturnDecimal, benchmark.decimal);
  const concentration = calculateConcentration(input, benchmark.decimal);
  const snapshot = options.snapshot ?? null;

  const available: string[] = [];
  const missing: string[] = [];
  if (portfolioReturnDecimal != null) available.push("portfolio-level return");
  else missing.push("dated portfolio valuations and external cash flows");
  if (annualizedXirr != null) available.push("investor-level money-weighted return");
  else missing.push("complete investor cash-flow chronology");
  if (investmentPnl != null) available.push("cash-flow-adjusted investment P&L");
  else missing.push("beginning and ending portfolio values");
  if (benchmark.decimal != null) available.push("configured benchmark return");
  else missing.push("configured benchmark total return");
  if (activeAttribution.status !== "unavailable") available.push("active return attribution");
  else missing.push("security period returns and benchmark sector returns");
  if (snapshot) available.push("current holding cost-basis snapshot");
  if (moneyComponents.some((component) => component.status !== "calculated")) {
    missing.push("complete realized gains, dividends, fees, cash income, and currency ledger");
  }

  const period = `${input.period.startDate || "start unavailable"} to ${input.period.endDate || "end unavailable"}`;
  const currency = String(input.baseCurrency || "").toUpperCase() || "DATA NOT AVAILABLE";
  const traceRecords: FinancialTraceRecord[] = [
    financialFact({
      id: financialTraceId("performance", "beginningValue"),
      path: "performance.pnlAttribution.beginningValue",
      label: "Beginning portfolio value",
      value: beginningValue,
      source: "User performance ledger",
      document: "Performance attribution input",
      reportingPeriod: input.period.startDate,
      publicationDate: generatedAt,
      currency,
      units: currency,
    }),
    financialFact({
      id: financialTraceId("performance", "endingValue"),
      path: "performance.pnlAttribution.endingValue",
      label: "Ending portfolio value",
      value: endingValue,
      source: "User performance ledger",
      document: "Performance attribution input",
      reportingPeriod: input.period.endDate,
      publicationDate: generatedAt,
      currency,
      units: currency,
    }),
    financialCalculation({
      id: financialTraceId("performance", "portfolioReturnPct"),
      path: "performance.portfolioReturn.valuePct",
      label: "Portfolio return",
      value: portfolioReturn.valuePct,
      formula: portfolioReturn.formula,
      inputs: linkedReturn != null
        ? (input.linkedSubperiods ?? []).flatMap((row, index) => [
            { name: `subperiod_${index + 1}_beginningValue`, value: finiteOrNull(row.beginningValue) },
            { name: `subperiod_${index + 1}_endingValue`, value: finiteOrNull(row.endingValue) },
          ])
        : [
            { name: "beginningValue", value: beginningValue },
            { name: "endingValue", value: endingValue },
            { name: "netExternalFlow", value: netExternalFlow },
          ],
      calculationTimestamp: generatedAt,
      reportingPeriod: period,
      currency: "N/A",
      units: "percent",
    }),
    financialCalculation({
      id: financialTraceId("performance", "investorReturnPct"),
      path: "performance.investorReturn.valuePct",
      label: "Investor money-weighted return",
      value: investorReturn.valuePct,
      formula: investorReturn.formula,
      inputs: xirrCashFlows.map((row, index) => ({ name: `datedCashFlow_${index + 1}_${row.date}`, value: row.amount })),
      calculationTimestamp: generatedAt,
      reportingPeriod: period,
      currency: "N/A",
      units: "percent",
    }),
    financialCalculation({
      id: financialTraceId("performance", "investmentPnl"),
      path: "performance.pnlAttribution.investmentPnl",
      label: "Cash-flow-adjusted investment result",
      value: investmentPnl,
      formula: "endingValue - beginningValue - contributions + withdrawals",
      inputs: [
        { name: "endingValue", value: endingValue },
        { name: "beginningValue", value: beginningValue },
        { name: "contributions", value: contributions },
        { name: "withdrawals", value: withdrawals },
      ],
      calculationTimestamp: generatedAt,
      reportingPeriod: period,
      currency,
      units: currency,
    }),
  ];
  for (const [name, value] of [
    ["contributions", contributions],
    ["withdrawals", withdrawals],
    ["netExternalFlow", netExternalFlow],
  ] as const) {
    traceRecords.push(financialCalculation({
      id: financialTraceId("performance", name),
      path: `performance.externalCashFlows.${name === "netExternalFlow" ? "netIntoPortfolio" : name}`,
      label: `Performance ${name}`,
      value,
      formula: name === "netExternalFlow" ? "contributions - withdrawals" : `sum(${name} cash-flow ledger entries)`,
      inputs: name === "netExternalFlow"
        ? [
            { name: "contributions", value: contributions },
            { name: "withdrawals", value: withdrawals },
          ]
        : [
            { name: `${name}EntryCount`, value: flows.filter((flow) => `${flow.type}s` === name).length },
            ...flows
              .filter((flow) => `${flow.type}s` === name)
              .map((flow, index) => ({ name: `${name}_${index + 1}_${flow.date}`, value: flow.amount })),
          ],
      calculationTimestamp: generatedAt,
      reportingPeriod: period,
      currency,
      units: currency,
    }));
  }
  for (const [name, component] of [
    ["realizedGains", realizedGains],
    ["unrealizedGains", unrealizedGains],
    ["dividends", dividends],
    ["cashIncome", cashIncome],
    ["feesAndExpenses", feesAndExpenses],
    ["currencyGainLoss", currencyGainLoss],
  ] as const) {
    const direct = finiteOrNull(input.pnlComponents?.[name]);
    const positionInputs = positions
      .map((position, index) => ({ name: `${position.ticker || index}_${name}`, value: finiteOrNull(position[name]) }))
      .filter((row) => row.value != null);
    traceRecords.push(financialCalculation({
      id: financialTraceId("performance", name),
      path: `performance.pnlAttribution.${name}.amount`,
      label: `Performance ${name}`,
      value: component.amount,
      formula: direct != null ? `direct ${name} ledger amount` : `sum(position ${name})`,
      inputs: direct != null ? [{ name, value: direct }] : positionInputs,
      calculationTimestamp: generatedAt,
      reportingPeriod: period,
      currency,
      units: currency,
    }));
  }
  if (snapshot) {
    for (const [name, value] of [
      ["costBasis", snapshot.costBasis],
      ["currentValue", snapshot.currentValue],
      ["unrealizedGain", snapshot.unrealizedGain],
    ] as const) {
      traceRecords.push(financialCalculation({
        id: financialTraceId("performance", `snapshot.${name}`),
        path: `performance.snapshot.${name}`,
        label: `Performance snapshot ${name}`,
        value,
        formula: name === "unrealizedGain" ? "currentValue - costBasis" : `sum(position ${name})`,
        inputs: name === "unrealizedGain"
          ? [
              { name: "currentValue", value: snapshot.currentValue },
              { name: "costBasis", value: snapshot.costBasis },
            ]
          : [{ name: `${name}Total`, value }],
        calculationTimestamp: generatedAt,
        reportingPeriod: generatedAt,
        currency,
        units: currency,
      }));
    }
  }
  const financialDataIntegrity = createFinancialIntegrityManifest(traceRecords, generatedAt);

  return {
    version: "2026-09-16",
    calculationAuthority: "deterministic_financial_code",
    llmCalculationAllowed: false,
    generatedAt,
    mode: portfolioReturnDecimal != null ? "full_period" : "cost_basis_snapshot",
    period: {
      startDate: parseDate(input.period.startDate) == null ? null : input.period.startDate.slice(0, 10),
      endDate: input.period.endDate.slice(0, 10),
      baseCurrency: String(input.baseCurrency || "USD").toUpperCase(),
    },
    portfolioReturn,
    investorReturn,
    benchmark: {
      ticker: String(input.benchmark.ticker || "").toUpperCase(),
      status: benchmark.status,
      returnPct: roundPct(benchmark.decimal),
      method: benchmark.method,
    },
    activeReturnPct,
    externalCashFlows: {
      contributions: roundMoney(contributions) ?? 0,
      withdrawals: roundMoney(withdrawals) ?? 0,
      netIntoPortfolio: roundMoney(netExternalFlow) ?? 0,
      excludedFromInvestmentPnl: true,
    },
    pnlAttribution: {
      beginningValue: roundMoney(beginningValue),
      endingValue: roundMoney(endingValue),
      investmentPnl: roundMoney(investmentPnl),
      realizedGains,
      unrealizedGains,
      dividends,
      cashIncome,
      feesAndExpenses,
      currencyGainLoss,
      explainedPnl: roundMoney(explainedPnl),
      unexplainedResidual: {
        status: residual == null ? "unavailable" : allMoneyKnown ? "calculated" : "partial",
        amount: roundMoney(residual),
        note: allMoneyKnown
          ? "Difference between cash-flow-adjusted investment P&L and the complete observed component ledger."
          : "Contains any unavailable realized, income, fee, currency, timing, or valuation component.",
      },
      reconciled,
    },
    activeAttribution,
    concentration,
    snapshot,
    dataQuality: {
      status: missing.length === 0 ? "complete" : available.length > 0 ? "partial" : "insufficient",
      available,
      missing: Array.from(new Set(missing)),
    },
    methodology: {
      portfolioLevel: "Geometrically linked TWR at valuation boundaries; Modified Dietz is the documented fallback approximation.",
      investorLevel: "XIRR money-weighted return from the investor perspective, with irregular dated cash flows.",
      pnl: "Ending value minus beginning value minus net external capital. Contributions and withdrawals are never investment P&L.",
      activeAttribution: "Brinson-Fachler sector allocation; selection plus interaction; cash, currency, fees, and residual shown separately.",
      concentration: "Non-additive counterfactual excess-weight effect versus the benchmark at the configured position cap.",
    },
    calculationInput: input,
    financialDataIntegrity,
  };
}

export function buildNeuroPerformanceAttribution(input: {
  engine?: any;
  marketData?: any;
  investmentPolicy?: { baseCurrency?: string | null; benchmark?: string | null; limits?: { maxPositionPct?: number | null } } | null;
  performanceInput?: PerformanceAttributionInput | null;
  generatedAt?: string;
}): PerformanceAttributionReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const snapshot = snapshotFromEngine(input.engine);
  if (input.performanceInput) {
    return calculatePerformanceAttribution(
      {
        ...input.performanceInput,
        baseCurrency:
          input.performanceInput.baseCurrency || input.investmentPolicy?.baseCurrency || "USD",
        benchmark: {
          ...input.performanceInput.benchmark,
          ticker:
            input.performanceInput.benchmark?.ticker || input.investmentPolicy?.benchmark || "SPY",
        },
        concentrationCapPct:
          input.performanceInput.concentrationCapPct ??
          input.investmentPolicy?.limits?.maxPositionPct ??
          null,
      },
      { generatedAt, snapshot }
    );
  }

  const positions = (Array.isArray(input.engine?.positions) ? input.engine.positions : [])
    .filter((position: any) => !position?.researchOnly)
    .map((position: any) => ({
      ticker: String(position?.ticker ?? ""),
      sector: position?.company?.sector ?? null,
      currency: null,
      beginningWeight: finiteOrNull(position?.weight),
      beginningMarketValue: finiteOrNull(position?.currentValue),
      unrealizedGains: finiteOrNull(position?.pnl),
    }));
  const endDate = generatedAt.slice(0, 10);
  return calculatePerformanceAttribution(
    {
      period: { startDate: "", endDate },
      baseCurrency: input.investmentPolicy?.baseCurrency || "USD",
      positions,
      benchmark: {
        ticker: input.investmentPolicy?.benchmark || "SPY",
      },
      concentrationCapPct: input.investmentPolicy?.limits?.maxPositionPct ?? null,
    },
    { generatedAt, snapshot }
  );
}
