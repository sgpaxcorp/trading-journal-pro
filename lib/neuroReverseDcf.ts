import {
  createFinancialIntegrityManifest,
  financialAssumption,
  financialCalculation,
  financialNumberOrNull,
  financialTraceId,
  type FinancialDataIntegrityManifest,
  type FinancialTraceRecord,
} from "@/lib/neuroFinancialDataIntegrity";

export type ReverseDcfFundamental = {
  year: number;
  totalRevenue?: number | null;
  operatingIncome?: number | null;
  freeCashFlow?: number | null;
  pretaxIncome?: number | null;
  incomeTaxExpense?: number | null;
  totalDebt?: number | null;
  cashAndCashEquivalents?: number | null;
  dilutedAverageShares?: number | null;
};

export type ReverseDcfHistoricalComparison = {
  metric: "revenue_growth" | "operating_margin" | "reinvestment" | "tax_rate";
  expectedPct: number;
  historicalLowPct: number | null;
  historicalMedianPct: number | null;
  historicalHighPct: number | null;
  assessment: "below_history" | "within_history" | "above_history" | "unavailable";
};

export type ReverseDcfScenario = {
  id: string;
  label: string;
  solutionStatus: "solved" | "outside_modeled_range";
  revenueGrowthPct: number;
  targetOperatingMarginPct: number;
  reinvestmentRatePct: number;
  impliedReturnOnIncrementalCapitalPct: number | null;
  taxRatePct: number;
  costOfCapitalPct: number;
  terminalGrowthPct: number;
  terminalReinvestmentRatePct: number;
  horizonYears: number;
  impliedEnterpriseValue: number | null;
  impliedEquityValue: number | null;
  impliedPrice: number | null;
  valuationGapPct: number | null;
  historicalComparison: ReverseDcfHistoricalComparison[];
};

export type ReverseDcfSensitivityTable = {
  rowMetric: "revenue_growth" | "cost_of_capital";
  columnMetric: "operating_margin" | "terminal_growth";
  rowValuesPct: number[];
  columnValuesPct: number[];
  cells: Array<{
    rowValuePct: number;
    columnValuePct: number;
    impliedEquityValue: number | null;
    impliedPrice: number | null;
    valuationGapPct: number | null;
  }>;
};

export type ReverseDcfAnalysis = {
  schemaVersion: "1.0";
  status: "complete" | "provisional" | "insufficient_information" | "not_applicable";
  ticker: string;
  companyName: string;
  objective: "what_must_the_company_achieve_for_todays_market_price_to_make_sense";
  model: "revenue_margin_fcff_reverse_dcf";
  notARecommendation: true;
  generatedAt: string;
  marketInputs: {
    currentPrice: number | null;
    currentMarketCapitalization: number | null;
    dilutedShares: number | null;
    totalDebt: number | null;
    cashAndCashEquivalents: number | null;
    targetEnterpriseValue: number | null;
    startingRevenue: number | null;
    startingOperatingMarginPct: number | null;
    cashAssumedZero: boolean;
  };
  historicalPerformance: {
    periods: number[];
    revenueCagrPct: number | null;
    annualRevenueGrowthPct: number[];
    operatingMarginPct: number[];
    effectiveTaxRatePct: number[];
    reinvestmentProxyPct: number[];
    methodology: string;
  };
  impliedScenarios: ReverseDcfScenario[];
  sensitivityTables: ReverseDcfSensitivityTable[];
  industryEvidenceRequirements: string[];
  whatMustBeTrue: string[];
  limitations: string[];
  missingInformation: string[];
  financialDataIntegrity: FinancialDataIntegrityManifest;
};

export type ReverseDcfModelInput = {
  startingRevenue: number;
  startingOperatingMargin: number;
  targetOperatingMargin: number;
  revenueGrowth: number;
  reinvestmentRate: number;
  taxRate: number;
  costOfCapital: number;
  terminalGrowth: number;
  horizonYears: number;
};

const GROWTH_FLOOR = -0.2;
const GROWTH_CEILING = 0.6;

function numberOrNull(value: unknown) {
  return financialNumberOrNull(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function statistics(values: number[]) {
  return values.length
    ? { low: Math.min(...values), middle: median(values), high: Math.max(...values) }
    : { low: null, middle: null, high: null };
}

function cleanTicker(value: unknown) {
  return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12);
}

export function calculateReverseDcfEnterpriseValue(input: ReverseDcfModelInput) {
  if (
    input.startingRevenue <= 0 ||
    input.horizonYears < 1 ||
    input.costOfCapital <= input.terminalGrowth ||
    input.costOfCapital <= 0
  ) {
    return null;
  }

  const incrementalReturn =
    input.reinvestmentRate > 0 && input.revenueGrowth > 0
      ? input.revenueGrowth / input.reinvestmentRate
      : null;
  const terminalReinvestment =
    incrementalReturn != null && incrementalReturn > input.terminalGrowth
      ? clamp(input.terminalGrowth / incrementalReturn, 0, 0.95)
      : clamp(input.reinvestmentRate, 0, 0.95);

  let revenue = input.startingRevenue;
  let presentValue = 0;
  let finalNopat = 0;
  for (let year = 1; year <= input.horizonYears; year += 1) {
    revenue *= 1 + input.revenueGrowth;
    const progress = year / input.horizonYears;
    const margin =
      input.startingOperatingMargin +
      (input.targetOperatingMargin - input.startingOperatingMargin) * progress;
    const nopat = revenue * margin * (1 - input.taxRate);
    presentValue += (nopat * (1 - input.reinvestmentRate)) / (1 + input.costOfCapital) ** year;
    finalNopat = nopat;
  }

  const terminalFcff = finalNopat * (1 + input.terminalGrowth) * (1 - terminalReinvestment);
  const terminalValue = terminalFcff / (input.costOfCapital - input.terminalGrowth);
  const enterpriseValue =
    presentValue + terminalValue / (1 + input.costOfCapital) ** input.horizonYears;
  return Number.isFinite(enterpriseValue) ? enterpriseValue : null;
}

function solveGrowth(target: number, model: Omit<ReverseDcfModelInput, "revenueGrowth">) {
  const valueAt = (growth: number) =>
    calculateReverseDcfEnterpriseValue({ ...model, revenueGrowth: growth });
  const lowValue = valueAt(GROWTH_FLOOR);
  const highValue = valueAt(GROWTH_CEILING);
  if (lowValue == null || highValue == null) return null;
  if (target < lowValue || target > highValue) {
    const useLow = Math.abs(lowValue / target - 1) <= Math.abs(highValue / target - 1);
    return {
      growth: useLow ? GROWTH_FLOOR : GROWTH_CEILING,
      enterpriseValue: useLow ? lowValue : highValue,
      solved: false,
    };
  }

  let low = GROWTH_FLOOR;
  let high = GROWTH_CEILING;
  for (let index = 0; index < 90; index += 1) {
    const midpoint = (low + high) / 2;
    const value = valueAt(midpoint);
    if (value == null) return null;
    if (value < target) low = midpoint;
    else high = midpoint;
  }
  const growth = (low + high) / 2;
  const enterpriseValue = valueAt(growth);
  return enterpriseValue == null ? null : { growth, enterpriseValue, solved: true };
}

function compareHistory(
  metric: ReverseDcfHistoricalComparison["metric"],
  expected: number,
  values: number[]
): ReverseDcfHistoricalComparison {
  const history = statistics(values);
  const assessment =
    history.low == null || history.high == null
      ? "unavailable"
      : expected < history.low - 0.02
        ? "below_history"
        : expected > history.high + 0.02
          ? "above_history"
          : "within_history";
  return {
    metric,
    expectedPct: round(expected * 100, 2),
    historicalLowPct: history.low == null ? null : round(history.low * 100, 2),
    historicalMedianPct: history.middle == null ? null : round(history.middle * 100, 2),
    historicalHighPct: history.high == null ? null : round(history.high * 100, 2),
    assessment,
  };
}

function pctGrid(center: number, offsets: number[], min: number, max: number) {
  return Array.from(
    new Set(offsets.map((offset) => round(clamp(center + offset, min, max), 4)))
  ).sort((a, b) => a - b);
}

function equityOutput(input: {
  model: ReverseDcfModelInput;
  debt: number;
  cash: number;
  shares: number | null;
  marketCap: number;
}) {
  const enterpriseValue = calculateReverseDcfEnterpriseValue(input.model);
  const equityValue = enterpriseValue == null ? null : enterpriseValue - input.debt + input.cash;
  return {
    impliedEquityValue: equityValue,
    impliedPrice: equityValue != null && input.shares && input.shares > 0 ? equityValue / input.shares : null,
    valuationGapPct: equityValue != null ? equityValue / input.marketCap - 1 : null,
  };
}

function unsupportedIndustry(sector: string, industry: string) {
  return /bank|insurance|reit|mortgage|credit services|capital markets|asset management/.test(
    (sector + " " + industry).toLowerCase()
  );
}

export function buildReverseDcfAnalysis(input: {
  language?: "en" | "es";
  ticker: string;
  companyName?: string | null;
  sector?: string | null;
  industry?: string | null;
  instrumentType?: string | null;
  currentPrice?: number | null;
  marketCap?: number | null;
  annualFundamentals?: ReverseDcfFundamental[];
  horizonYears?: number | null;
  defaultCostOfCapitalPct?: number | null;
  defaultTerminalGrowthPct?: number | null;
  generatedAt?: string;
}): ReverseDcfAnalysis {
  const isEs = input.language === "es";
  const ticker = cleanTicker(input.ticker);
  const companyName = String(input.companyName ?? ticker ?? "Company").trim();
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const rows = (input.annualFundamentals ?? [])
    .filter((row) => Number.isFinite(Number(row?.year)))
    .sort((a, b) => Number(a.year) - Number(b.year));
  const latest = rows.at(-1) ?? null;
  const currentPrice = numberOrNull(input.currentPrice);
  const latestShares = numberOrNull(latest?.dilutedAverageShares);
  const suppliedMarketCap = numberOrNull(input.marketCap);
  const marketCap =
    suppliedMarketCap && suppliedMarketCap > 0
      ? suppliedMarketCap
      : currentPrice && latestShares && currentPrice > 0 && latestShares > 0
        ? currentPrice * latestShares
        : null;
  const shares =
    currentPrice && marketCap && currentPrice > 0 && marketCap > 0
      ? marketCap / currentPrice
      : latestShares;
  const debt = numberOrNull(latest?.totalDebt);
  const cash = numberOrNull(latest?.cashAndCashEquivalents);
  const revenue = numberOrNull(latest?.totalRevenue);
  const operatingIncome = numberOrNull(latest?.operatingIncome);
  const startingMargin =
    revenue && revenue > 0 && operatingIncome != null ? operatingIncome / revenue : null;
  const targetEnterpriseValue =
    marketCap == null || debt == null || cash == null ? null : marketCap + debt - cash;
  const missingInformation = [
    ...(currentPrice == null ? [isEs ? "Precio de mercado actual" : "Current market price"] : []),
    ...(marketCap == null
      ? [isEs ? "Capitalización de mercado actual o precio actual más acciones diluidas" : "Current market capitalization or current price plus diluted shares"]
      : []),
    ...(revenue == null || revenue <= 0 ? [isEs ? "Revenue anual más reciente" : "Latest annual revenue"] : []),
    ...(startingMargin == null ? [isEs ? "Ingreso operativo más reciente" : "Latest operating income"] : []),
    ...(debt == null ? [isEs ? "Deuda total más reciente" : "Latest total debt"] : []),
    ...(cash == null ? [isEs ? "Cash y equivalentes más recientes" : "Latest cash and cash equivalents"] : []),
  ];
  const base = {
    schemaVersion: "1.0" as const,
    ticker,
    companyName,
    objective: "what_must_the_company_achieve_for_todays_market_price_to_make_sense" as const,
    model: "revenue_margin_fcff_reverse_dcf" as const,
    notARecommendation: true as const,
    generatedAt,
    marketInputs: {
      currentPrice,
      currentMarketCapitalization: marketCap,
      dilutedShares: shares,
      totalDebt: debt,
      cashAndCashEquivalents: cash,
      targetEnterpriseValue,
      startingRevenue: revenue,
      startingOperatingMarginPct: startingMargin == null ? null : round(startingMargin * 100, 2),
      cashAssumedZero: false,
    },
  };

  const empty = (
    status: ReverseDcfAnalysis["status"],
    limitation: string
  ): ReverseDcfAnalysis => ({
    ...base,
    status,
    historicalPerformance: {
      periods: rows.map((row) => row.year),
      revenueCagrPct: null,
      annualRevenueGrowthPct: [],
      operatingMarginPct: [],
      effectiveTaxRatePct: [],
      reinvestmentProxyPct: [],
      methodology:
        isEs
          ? "Las comparaciones históricas requieren revenue, ingreso operativo, impuestos y free cash flow anuales consistentes."
          : "Historical comparisons require consistent annual revenue, operating income, taxes, and free cash flow.",
    },
    impliedScenarios: [],
    sensitivityTables: [],
    industryEvidenceRequirements: [],
    whatMustBeTrue: [],
    limitations: [limitation],
    missingInformation,
    financialDataIntegrity: createFinancialIntegrityManifest([], generatedAt),
  });

  const instrumentType = String(input.instrumentType ?? "").toLowerCase();
  if (instrumentType === "etf" || instrumentType === "fund") {
    return empty(
      "not_applicable",
      isEs
        ? "Un Reverse DCF de FCFF para compañías no aplica a un ETF o fondo."
        : "A company FCFF reverse DCF is not applicable to an ETF or fund."
    );
  }
  if (unsupportedIndustry(String(input.sector ?? ""), String(input.industry ?? ""))) {
    return empty(
      "not_applicable",
      isEs
        ? "Este modelo FCFF de revenue y margen no es apropiado para instituciones financieras o REITs; utiliza un marco específico para esa industria."
        : "This revenue-margin FCFF model is not appropriate for financial institutions or REITs; use an industry-specific valuation framework."
    );
  }
  if (
    marketCap == null ||
    debt == null ||
    cash == null ||
    targetEnterpriseValue == null ||
    targetEnterpriseValue <= 0 ||
    revenue == null ||
    revenue <= 0 ||
    startingMargin == null
  ) {
    return empty(
      "insufficient_information",
      isEs
        ? "No se puede reconstruir la valoración actual sin market value, deuda, efectivo, revenue y margen operativo verificados."
        : "The current valuation cannot be reverse-engineered without verified market value, debt, cash, revenue, and operating margin data."
    );
  }
  const resolvedMarketCap = marketCap;
  const resolvedDebt = debt;
  const resolvedCash = cash;

  const revenueRows = rows.filter(
    (row) => numberOrNull(row.totalRevenue) != null && Number(row.totalRevenue) > 0
  );
  const annualGrowth = revenueRows
    .slice(1)
    .map((row, index) => {
      const previous = numberOrNull(revenueRows[index]?.totalRevenue);
      const current = numberOrNull(row.totalRevenue);
      return previous && current ? current / previous - 1 : null;
    })
    .filter((value): value is number => value != null && Number.isFinite(value));
  const margins = rows
    .map((row) => {
      const rowRevenue = numberOrNull(row.totalRevenue);
      const rowOperatingIncome = numberOrNull(row.operatingIncome);
      return rowRevenue && rowOperatingIncome != null
        ? rowOperatingIncome / rowRevenue
        : null;
    })
    .filter((value): value is number => value != null && Number.isFinite(value));
  const taxRates = rows
    .map((row) => {
      const pretax = numberOrNull(row.pretaxIncome);
      const tax = numberOrNull(row.incomeTaxExpense);
      return pretax && pretax > 0 && tax != null ? clamp(tax / pretax, 0, 0.5) : null;
    })
    .filter((value): value is number => value != null);
  const taxRate = clamp(median(taxRates) ?? 0.21, 0.1, 0.35);
  const reinvestmentRates = rows
    .map((row) => {
      const rowOperatingIncome = numberOrNull(row.operatingIncome);
      const freeCashFlow = numberOrNull(row.freeCashFlow);
      const pretax = numberOrNull(row.pretaxIncome);
      const tax = numberOrNull(row.incomeTaxExpense);
      const rowTaxRate = pretax && pretax > 0 && tax != null ? clamp(tax / pretax, 0, 0.5) : taxRate;
      if (rowOperatingIncome == null || freeCashFlow == null) return null;
      const nopat = rowOperatingIncome * (1 - rowTaxRate);
      return nopat > 0 ? clamp((nopat - freeCashFlow) / nopat, -1, 2) : null;
    })
    .filter((value): value is number => value != null);
  if (revenueRows.length < 2) {
    missingInformation.push(isEs ? "Al menos dos años comparables de revenue" : "At least two comparable years of revenue");
  }
  if (!taxRates.length) {
    missingInformation.push(isEs ? "Historial de pretax income y gasto de impuestos" : "Historical pretax income and tax expense");
  }
  if (!reinvestmentRates.length) {
    missingInformation.push(isEs ? "Historial comparable de NOPAT y free cash flow" : "Comparable NOPAT and free-cash-flow history");
  }

  const reinvestment = clamp(median(reinvestmentRates) ?? 0.4, 0.1, 0.8);
  const historicalMargin = clamp(
    median(margins) ?? Math.max(startingMargin, 0.1),
    0.03,
    0.5
  );
  const upperMargin = clamp(Math.max(historicalMargin, ...margins, 0.1), 0.05, 0.55);
  const horizonYears = clamp(Math.round(numberOrNull(input.horizonYears) ?? 10), 5, 15);
  const wacc = clamp((numberOrNull(input.defaultCostOfCapitalPct) ?? 10) / 100, 0.07, 0.16);
  const terminalGrowth = clamp(
    (numberOrNull(input.defaultTerminalGrowthPct) ?? 2.5) / 100,
    0,
    0.04
  );
  const templates = [
    { id: "historical_economics", label: "Historical economics", margin: historicalMargin, reinvestment, tax: taxRate, wacc, terminalGrowth },
    { id: "margin_execution", label: "Margin execution", margin: upperMargin, reinvestment, tax: taxRate, wacc, terminalGrowth },
    { id: "capital_efficient", label: "Capital-efficient growth", margin: historicalMargin, reinvestment: clamp(reinvestment - 0.15, 0.1, 0.75), tax: taxRate, wacc: clamp(wacc - 0.01, 0.07, 0.16), terminalGrowth },
    { id: "reinvestment_heavy", label: "Reinvestment-heavy growth", margin: upperMargin, reinvestment: clamp(reinvestment + 0.15, 0.15, 0.85), tax: taxRate, wacc, terminalGrowth },
    { id: "higher_hurdle", label: "Higher return hurdle", margin: upperMargin, reinvestment, tax: clamp(taxRate + 0.02, 0.1, 0.35), wacc: clamp(wacc + 0.02, 0.07, 0.18), terminalGrowth },
    { id: "lower_terminal_support", label: "Lower terminal support", margin: upperMargin, reinvestment: clamp(reinvestment - 0.1, 0.1, 0.8), tax: taxRate, wacc, terminalGrowth: clamp(terminalGrowth - 0.01, 0, 0.04) },
  ];

  const scenarios = templates.map((template): ReverseDcfScenario => {
    const solution = solveGrowth(targetEnterpriseValue, {
      startingRevenue: revenue,
      startingOperatingMargin: startingMargin,
      targetOperatingMargin: template.margin,
      reinvestmentRate: template.reinvestment,
      taxRate: template.tax,
      costOfCapital: template.wacc,
      terminalGrowth: template.terminalGrowth,
      horizonYears,
    });
    const growth = solution?.growth ?? GROWTH_CEILING;
    const enterpriseValue = solution?.enterpriseValue ?? null;
    const equityValue = enterpriseValue == null ? null : enterpriseValue - resolvedDebt + resolvedCash;
    const incrementalReturn =
      template.reinvestment > 0 && growth > 0 ? growth / template.reinvestment : null;
    const terminalReinvestment =
      incrementalReturn != null && incrementalReturn > template.terminalGrowth
        ? clamp(template.terminalGrowth / incrementalReturn, 0, 0.95)
        : template.reinvestment;
    return {
      id: template.id,
      label: template.label,
      solutionStatus: solution?.solved ? "solved" : "outside_modeled_range",
      revenueGrowthPct: round(growth * 100, 2),
      targetOperatingMarginPct: round(template.margin * 100, 2),
      reinvestmentRatePct: round(template.reinvestment * 100, 2),
      impliedReturnOnIncrementalCapitalPct:
        incrementalReturn == null ? null : round(incrementalReturn * 100, 2),
      taxRatePct: round(template.tax * 100, 2),
      costOfCapitalPct: round(template.wacc * 100, 2),
      terminalGrowthPct: round(template.terminalGrowth * 100, 2),
      terminalReinvestmentRatePct: round(terminalReinvestment * 100, 2),
      horizonYears,
      impliedEnterpriseValue: enterpriseValue,
      impliedEquityValue: equityValue,
      impliedPrice: equityValue != null && shares && shares > 0 ? equityValue / shares : null,
      valuationGapPct: equityValue != null ? equityValue / resolvedMarketCap - 1 : null,
      historicalComparison: [
        compareHistory("revenue_growth", growth, annualGrowth),
        compareHistory("operating_margin", template.margin, margins),
        compareHistory("reinvestment", template.reinvestment, reinvestmentRates),
        compareHistory("tax_rate", template.tax, taxRates),
      ],
    };
  });

  const reference = scenarios[0];
  const referenceModel: ReverseDcfModelInput = {
    startingRevenue: revenue,
    startingOperatingMargin: startingMargin,
    targetOperatingMargin: reference.targetOperatingMarginPct / 100,
    revenueGrowth: reference.revenueGrowthPct / 100,
    reinvestmentRate: reference.reinvestmentRatePct / 100,
    taxRate: reference.taxRatePct / 100,
    costOfCapital: reference.costOfCapitalPct / 100,
    terminalGrowth: reference.terminalGrowthPct / 100,
    horizonYears,
  };
  const growthRows = pctGrid(referenceModel.revenueGrowth, [-0.06, -0.03, 0, 0.03, 0.06], GROWTH_FLOOR, GROWTH_CEILING);
  const marginColumns = pctGrid(referenceModel.targetOperatingMargin, [-0.06, -0.03, 0, 0.03, 0.06], 0.01, 0.6);
  const waccRows = pctGrid(referenceModel.costOfCapital, [-0.02, -0.01, 0, 0.01, 0.02], 0.06, 0.2);
  const terminalColumns = pctGrid(referenceModel.terminalGrowth, [-0.01, -0.005, 0, 0.005, 0.01], -0.01, 0.05)
    .filter((value) => value < Math.min(...waccRows) - 0.005);
  const sensitivityTables: ReverseDcfSensitivityTable[] = [
    {
      rowMetric: "revenue_growth",
      columnMetric: "operating_margin",
      rowValuesPct: growthRows.map((value) => round(value * 100, 2)),
      columnValuesPct: marginColumns.map((value) => round(value * 100, 2)),
      cells: growthRows.flatMap((growth) =>
        marginColumns.map((margin) => ({
          rowValuePct: round(growth * 100, 2),
          columnValuePct: round(margin * 100, 2),
          ...equityOutput({
            model: { ...referenceModel, revenueGrowth: growth, targetOperatingMargin: margin },
            debt: resolvedDebt,
            cash: resolvedCash,
            shares,
            marketCap: resolvedMarketCap,
          }),
        }))
      ),
    },
    {
      rowMetric: "cost_of_capital",
      columnMetric: "terminal_growth",
      rowValuesPct: waccRows.map((value) => round(value * 100, 2)),
      columnValuesPct: terminalColumns.map((value) => round(value * 100, 2)),
      cells: waccRows.flatMap((costOfCapital) =>
        terminalColumns.map((stableGrowth) => ({
          rowValuePct: round(costOfCapital * 100, 2),
          columnValuePct: round(stableGrowth * 100, 2),
          ...equityOutput({
            model: { ...referenceModel, costOfCapital, terminalGrowth: stableGrowth },
            debt: resolvedDebt,
            cash: resolvedCash,
            shares,
            marketCap: resolvedMarketCap,
          }),
        }))
      ),
    },
  ];

  const solved = scenarios.filter((scenario) => scenario.solutionStatus === "solved");
  const growthRange = statistics(solved.map((scenario) => scenario.revenueGrowthPct));
  const marginRange = statistics(solved.map((scenario) => scenario.targetOperatingMarginPct));
  const reinvestmentRange = statistics(solved.map((scenario) => scenario.reinvestmentRatePct));
  const firstRevenue = numberOrNull(revenueRows[0]?.totalRevenue);
  const lastRevenue = numberOrNull(revenueRows.at(-1)?.totalRevenue);
  const revenueYears =
    revenueRows.length >= 2 ? revenueRows.at(-1)!.year - revenueRows[0].year : 0;
  const revenueCagr =
    firstRevenue && lastRevenue && revenueYears > 0
      ? (lastRevenue / firstRevenue) ** (1 / revenueYears) - 1
      : null;
  const traceRecords: FinancialTraceRecord[] = [
    financialCalculation({
      id: financialTraceId(ticker, "reverseDcf.marketInputs.targetEnterpriseValue"),
      path: "reverseDcf.marketInputs.targetEnterpriseValue",
      label: `${ticker} target enterprise value`,
      value: targetEnterpriseValue,
      formula: "currentMarketCapitalization + totalDebt - cashAndCashEquivalents",
      inputs: [
        { name: "currentMarketCapitalization", value: resolvedMarketCap, traceId: financialTraceId(ticker, "market.marketCap") },
        { name: "totalDebt", value: resolvedDebt },
        { name: "cashAndCashEquivalents", value: resolvedCash },
      ],
      calculationTimestamp: generatedAt,
      reportingPeriod: latest?.year ? `FY ${latest.year}` : generatedAt,
      currency: "USD",
      units: "USD",
    }),
  ];
  scenarios.forEach((scenario, index) => {
    const scope = `${ticker}.reverseDcf.scenarios.${index}`;
    const scenarioInputs = [
      { name: "startingRevenue", value: revenue },
      { name: "startingOperatingMargin", value: startingMargin },
      { name: "targetOperatingMargin", value: scenario.targetOperatingMarginPct / 100 },
      { name: "revenueGrowth", value: scenario.revenueGrowthPct / 100 },
      { name: "reinvestmentRate", value: scenario.reinvestmentRatePct / 100 },
      { name: "taxRate", value: scenario.taxRatePct / 100 },
      { name: "costOfCapital", value: scenario.costOfCapitalPct / 100 },
      { name: "terminalGrowth", value: scenario.terminalGrowthPct / 100 },
      { name: "horizonYears", value: scenario.horizonYears },
      { name: "totalDebt", value: resolvedDebt },
      { name: "cashAndCashEquivalents", value: resolvedCash },
    ];
    for (const [name, value] of [
      ["targetOperatingMarginPct", scenario.targetOperatingMarginPct],
      ["reinvestmentRatePct", scenario.reinvestmentRatePct],
      ["taxRatePct", scenario.taxRatePct],
      ["costOfCapitalPct", scenario.costOfCapitalPct],
      ["terminalGrowthPct", scenario.terminalGrowthPct],
      ["horizonYears", scenario.horizonYears],
    ] as const) {
      traceRecords.push(financialAssumption({
        id: financialTraceId(scope, name),
        path: `reverseDcf.impliedScenarios.${index}.${name}`,
        label: `${scenario.label} ${name}`,
        value,
        source: "Reverse DCF scenario definition",
        document: "Deterministic reverse DCF assumption set",
        reportingPeriod: generatedAt,
        publicationDate: generatedAt,
        currency: "N/A",
        units: name === "horizonYears" ? "years" : "percent",
      }));
    }
    for (const [name, value, units] of [
      ["revenueGrowthPct", scenario.revenueGrowthPct, "percent"],
      ["impliedEnterpriseValue", scenario.impliedEnterpriseValue, "USD"],
      ["impliedEquityValue", scenario.impliedEquityValue, "USD"],
      ["impliedPrice", scenario.impliedPrice, "USD/share"],
      ["valuationGapPct", scenario.valuationGapPct == null ? null : scenario.valuationGapPct * 100, "percent"],
    ] as const) {
      traceRecords.push(financialCalculation({
        id: financialTraceId(scope, name),
        path: `reverseDcf.impliedScenarios.${index}.${name}`,
        label: `${scenario.label} ${name}`,
        value,
        classification: "ESTIMATE",
        formula:
          name === "revenueGrowthPct"
            ? "Binary-search revenue growth that reconciles modeled enterprise value with target enterprise value"
            : "Revenue-margin FCFF reverse DCF using the complete scenario input set",
        inputs: scenarioInputs,
        calculationTimestamp: generatedAt,
        reportingPeriod: generatedAt,
        currency: units.startsWith("USD") ? "USD" : "N/A",
        units,
      }));
    }
  });
  sensitivityTables.forEach((table, tableIndex) => {
    table.cells.forEach((cell, cellIndex) => {
      const scope = `${ticker}.reverseDcf.sensitivity.${tableIndex}.${cellIndex}`;
      const cellInputs = [
        { name: table.rowMetric, value: cell.rowValuePct / 100 },
        { name: table.columnMetric, value: cell.columnValuePct / 100 },
        { name: "startingRevenue", value: revenue },
        { name: "totalDebt", value: resolvedDebt },
        { name: "cashAndCashEquivalents", value: resolvedCash },
      ];
      traceRecords.push(
        financialCalculation({
          id: financialTraceId(scope, "impliedEquityValue"),
          path: `reverseDcf.sensitivityTables.${tableIndex}.cells.${cellIndex}.impliedEquityValue`,
          label: `${table.rowMetric}/${table.columnMetric} sensitivity equity value`,
          value: cell.impliedEquityValue,
          classification: "ESTIMATE",
          formula: "Revenue-margin FCFF sensitivity scenario enterprise value - totalDebt + cashAndCashEquivalents",
          inputs: cellInputs,
          calculationTimestamp: generatedAt,
          reportingPeriod: generatedAt,
          currency: "USD",
          units: "USD",
        }),
        financialCalculation({
          id: financialTraceId(scope, "impliedPrice"),
          path: `reverseDcf.sensitivityTables.${tableIndex}.cells.${cellIndex}.impliedPrice`,
          label: `${table.rowMetric}/${table.columnMetric} sensitivity implied price`,
          value: cell.impliedPrice,
          classification: "ESTIMATE",
          formula: "impliedEquityValue / dilutedShares",
          inputs: [...cellInputs, { name: "dilutedShares", value: shares }],
          calculationTimestamp: generatedAt,
          reportingPeriod: generatedAt,
          currency: "USD",
          units: "USD/share",
        })
      );
    });
  });
  const financialDataIntegrity = createFinancialIntegrityManifest(traceRecords, generatedAt);

  return {
    ...base,
    status: missingInformation.length ? "provisional" : "complete",
    historicalPerformance: {
      periods: rows.map((row) => row.year),
      revenueCagrPct: revenueCagr == null ? null : round(revenueCagr * 100, 2),
      annualRevenueGrowthPct: annualGrowth.map((value) => round(value * 100, 2)),
      operatingMarginPct: margins.map((value) => round(value * 100, 2)),
      effectiveTaxRatePct: taxRates.map((value) => round(value * 100, 2)),
      reinvestmentProxyPct: reinvestmentRates.map((value) => round(value * 100, 2)),
      methodology:
        isEs
          ? "Proxy de reinversión = (NOPAT - free cash flow) / NOPAT. Es un filtro analítico, no una métrica definida por el filing."
          : "Reinvestment proxy = (NOPAT - free cash flow) / NOPAT. It is a screening proxy, not a filing-defined measure.",
    },
    impliedScenarios: scenarios,
    sensitivityTables,
    industryEvidenceRequirements: isEs
      ? [
          "Evidencia fechada de crecimiento de revenue de peers e industria con periodos y definiciones comparables",
          "Rangos de margen operativo de peers explicando diferencias del modelo de negocio",
          "Evidencia de intensidad de capital o retorno incremental de la industria que apoye la reinversión",
          "Un rango documentado de costo de capital y un ancla de crecimiento a largo plazo",
        ]
      : [
          "Dated peer and industry revenue-growth evidence using comparable periods and definitions",
          "Peer operating-margin ranges with business-model differences explained",
          "Industry capital-intensity or incremental-return evidence supporting reinvestment",
          "A documented cost-of-capital range and long-run growth anchor",
        ],
    whatMustBeTrue: solved.length
      ? [
          (isEs ? "Las combinaciones resueltas requieren crecimiento anual de revenue entre " : "Solved combinations require annual revenue growth between ") +
            growthRange.low?.toFixed(1) +
            (isEs ? "% y " : "% and ") +
            growthRange.high?.toFixed(1) +
            (isEs ? "% durante " : "% for ") +
            horizonYears +
            (isEs ? " años, condicionado a cada combinación de margen y reinversión." : " years, conditional on each paired margin and reinvestment assumption."),
          (isEs ? "El margen operativo objetivo debe estar entre " : "Target operating margin must fall between ") +
            marginRange.low?.toFixed(1) +
            (isEs ? "% y " : "% and ") +
            marginRange.high?.toFixed(1) +
            (isEs ? "% entre las combinaciones resueltas." : "% across the solved combinations."),
          (isEs ? "La reinversión proyectada consume entre " : "Forecast reinvestment consumes ") +
            reinvestmentRange.low?.toFixed(1) +
            (isEs ? "% y " : "% to ") +
            reinvestmentRange.high?.toFixed(1) +
            (isEs
              ? "% del beneficio operativo después de impuestos y debe obtener el retorno incremental indicado en cada escenario."
              : "% of after-tax operating profit and must earn each scenario's stated incremental return."),
          isEs
            ? "La economía terminal debe sostener el crecimiento perpetuo indicado al costo de capital correspondiente."
            : "The terminal economics must support the stated perpetual growth at the paired cost of capital.",
        ]
      : [
          isEs
            ? "Ninguna combinación dentro del rango modelado reconcilió el enterprise value actual; amplía la evidencia o utiliza otro marco de valoración."
            : "No combination inside the modeled growth range reconciled the current enterprise value; expand the evidence set or use a different valuation framework.",
        ],
    limitations: [
      isEs
        ? "Estas son combinaciones implícitas del mercado, no pronósticos ni probabilidades."
        : "These are market-implied combinations, not forecasts and not probabilities.",
      isEs
        ? "Diferentes combinaciones pueden justificar el mismo precio; ningún escenario individual es la respuesta."
        : "Different combinations can justify the same price; no single scenario is the answer.",
      isEs
        ? "El crecimiento de revenue, los márgenes y la reinversión deben leerse juntos."
        : "Revenue growth, margins, and reinvestment must be read together.",
      isEs
        ? "Los supuestos fuera del historial son preguntas de research, no conclusiones automáticas de compra o venta."
        : "Assumptions outside history are research questions, not automatic buy or sell conclusions.",
    ],
    missingInformation,
    financialDataIntegrity,
  };
}
