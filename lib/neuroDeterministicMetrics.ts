import { createHash } from "node:crypto";

import {
  type CanonicalFinancialConcept,
  type FinancialPeriodType,
  type NormalizedFinancialFact,
} from "@/lib/neuroFinancialStatements";
import { DATA_NOT_AVAILABLE } from "@/lib/neuroFinancialDataIntegrity";

export const DETERMINISTIC_METRICS_VERSION = "fundamental-metrics-v1";

export const DETERMINISTIC_METRIC_KEYS = [
  "revenue_growth",
  "revenue_cagr",
  "gross_margin",
  "operating_margin",
  "net_margin",
  "operating_cash_flow",
  "free_cash_flow",
  "fcf_margin",
  "fcf_conversion",
  "return_on_assets",
  "return_on_equity",
  "return_on_invested_capital",
  "current_ratio",
  "debt_to_equity",
  "debt_to_ebitda",
  "net_debt_to_ebitda",
  "interest_coverage",
  "capex_to_revenue",
  "research_and_development_to_revenue",
  "sga_to_revenue",
  "stock_based_compensation_to_revenue",
  "stock_based_compensation_to_fcf",
  "share_dilution",
  "working_capital",
  "working_capital_change",
  "cash_conversion",
] as const;

export type DeterministicMetricKey = (typeof DETERMINISTIC_METRIC_KEYS)[number];

export type MetricInput = {
  name: string;
  value: number | null;
  units: string;
  factId?: string | null;
  classification: "FACT" | "CALCULATION" | "ASSUMPTION";
};

export type DeterministicMetric = {
  metricKey: DeterministicMetricKey;
  status: "calculated" | "unavailable";
  value: number | null;
  displayValue: number | typeof DATA_NOT_AVAILABLE;
  units: string;
  periodEndDate: string;
  formula: string;
  formulaVersion: string;
  inputs: MetricInput[];
  calculationTimestamp: string;
  traceSha256: string;
  unavailableReason: string | null;
};

export type RoicMethodology = {
  id: "average_debt_plus_equity_less_cash" | "average_debt_plus_equity";
  taxRateAssumption?: number | null;
  goodwillTreatment?: "include" | "exclude";
};

export type DeterministicMetricsResult = {
  calculationVersion: string;
  periodType: "annual" | "ttm";
  periodEndDate: string;
  previousPeriodEndDate: string | null;
  calculatedAt: string;
  metrics: Record<DeterministicMetricKey, DeterministicMetric>;
  sourceFactIds: string[];
  methodology: {
    freeCashFlow: "Operating Cash Flow - Capital Expenditures";
    roic: RoicMethodology;
    missingValues: "No missing input is replaced with zero";
  };
};

type FactLookup = {
  current: Map<CanonicalFinancialConcept, NormalizedFinancialFact>;
  previous: Map<CanonicalFinancialConcept, NormalizedFinancialFact>;
  cagrComparison: Map<CanonicalFinancialConcept, NormalizedFinancialFact>;
};

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function round(value: number, digits = 12) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function yearFraction(start: string, end: string) {
  if (start.slice(5) === end.slice(5)) {
    const wholeYears = Number(end.slice(0, 4)) - Number(start.slice(0, 4));
    if (wholeYears > 0) return wholeYears;
  }
  return (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / (365.2425 * 86_400_000);
}

function latestByConcept(
  facts: NormalizedFinancialFact[],
  periodEndDate: string,
  periodType: "annual" | "ttm"
) {
  const selected = new Map<CanonicalFinancialConcept, NormalizedFinancialFact>();
  const duration = facts
    .filter((fact) => fact.periodEndDate === periodEndDate && fact.periodType === periodType)
    .sort((left, right) => Date.parse(left.publicAt) - Date.parse(right.publicAt));
  for (const fact of duration) selected.set(fact.canonicalConcept, fact);

  const instants = facts
    .filter((fact) => fact.periodType === "instant" && fact.periodEndDate <= periodEndDate)
    .sort((left, right) => {
      const period = left.periodEndDate.localeCompare(right.periodEndDate);
      return period !== 0 ? period : Date.parse(left.publicAt) - Date.parse(right.publicAt);
    });
  for (const fact of instants) selected.set(fact.canonicalConcept, fact);
  return selected;
}

function factInput(name: string, fact?: NormalizedFinancialFact | null): MetricInput {
  return {
    name,
    value: finite(fact?.value),
    units: fact?.units ?? "unknown",
    factId: fact?.id ?? null,
    classification: "FACT",
  };
}

function valueOf(map: Map<CanonicalFinancialConcept, NormalizedFinancialFact>, concept: CanonicalFinancialConcept) {
  return finite(map.get(concept)?.value);
}

function metric(input: {
  metricKey: DeterministicMetricKey;
  value: number | null;
  units: string;
  periodEndDate: string;
  formula: string;
  inputs: MetricInput[];
  calculatedAt: string;
  unavailableReason?: string | null;
}) {
  const missing = input.inputs.filter((item) => item.value == null).map((item) => item.name);
  const value = finite(input.value);
  const unavailableReason = value == null
    ? input.unavailableReason || (missing.length ? `Missing required input(s): ${missing.join(", ")}.` : "The calculation did not produce a finite value.")
    : null;
  const identity = {
    metricKey: input.metricKey,
    value,
    units: input.units,
    periodEndDate: input.periodEndDate,
    formula: input.formula,
    inputs: input.inputs,
    calculatedAt: input.calculatedAt,
    formulaVersion: DETERMINISTIC_METRICS_VERSION,
    unavailableReason,
  };
  return {
    metricKey: input.metricKey,
    status: value == null ? "unavailable" : "calculated",
    value: value == null ? null : round(value),
    displayValue: value == null ? DATA_NOT_AVAILABLE : round(value),
    units: input.units,
    periodEndDate: input.periodEndDate,
    formula: input.formula,
    formulaVersion: DETERMINISTIC_METRICS_VERSION,
    inputs: input.inputs,
    calculationTimestamp: input.calculatedAt,
    traceSha256: hash(identity),
    unavailableReason,
  } satisfies DeterministicMetric;
}

function divide(numerator: number | null, denominator: number | null) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

function average(left: number | null, right: number | null) {
  return left == null || right == null ? null : (left + right) / 2;
}

function sumRequired(values: Array<number | null>) {
  return values.some((value) => value == null) ? null : values.reduce<number>((sum, value) => sum + Number(value), 0);
}

function metricFactory(input: {
  lookup: FactLookup;
  periodEndDate: string;
  previousPeriodEndDate: string | null;
  calculatedAt: string;
  roicMethodology: RoicMethodology;
}) {
  const { current, previous, cagrComparison } = input.lookup;
  const { periodEndDate, previousPeriodEndDate, calculatedAt, roicMethodology } = input;
  const currentFact = (concept: CanonicalFinancialConcept) => current.get(concept);
  const previousFact = (concept: CanonicalFinancialConcept) => previous.get(concept);
  const cagrFact = (concept: CanonicalFinancialConcept) => cagrComparison.get(concept);
  const c = (concept: CanonicalFinancialConcept) => valueOf(current, concept);
  const p = (concept: CanonicalFinancialConcept) => valueOf(previous, concept);
  const inputs = (...pairs: Array<[string, NormalizedFinancialFact | undefined]>) => pairs.map(([name, fact]) => factInput(name, fact));
  const revenue = c("revenue");
  const previousRevenue = p("revenue");
  const cagrRevenue = finite(cagrFact("revenue")?.value);
  const operatingCashFlow = c("operating_cash_flow");
  const capex = c("capital_expenditures");
  const freeCashFlow = sumRequired([operatingCashFlow, capex == null ? null : -Math.abs(capex)]);
  const totalDebt = c("total_debt") ?? sumRequired([c("short_term_debt"), c("long_term_debt")]);
  const previousTotalDebt = p("total_debt") ?? sumRequired([p("short_term_debt"), p("long_term_debt")]);
  const currentWorkingCapital = sumRequired([c("current_assets"), c("current_liabilities") == null ? null : -c("current_liabilities")!]);
  const previousWorkingCapital = sumRequired([p("current_assets"), p("current_liabilities") == null ? null : -p("current_liabilities")!]);
  const pretaxIncome = c("pretax_income");
  const incomeTaxes = c("income_taxes");
  const observedTaxRate = divide(incomeTaxes, pretaxIncome);
  const configuredTaxRate = finite(roicMethodology.taxRateAssumption);
  const taxRate = configuredTaxRate ?? observedTaxRate;
  const operatingIncome = c("operating_income");
  const depreciationAndAmortization = c("depreciation_depletion_amortization");
  const ebitda = operatingIncome == null || depreciationAndAmortization == null
    ? null
    : operatingIncome + depreciationAndAmortization;
  const nopat = operatingIncome == null || taxRate == null ? null : operatingIncome * (1 - taxRate);

  const currentGoodwill = roicMethodology.goodwillTreatment === "exclude" ? c("goodwill") : 0;
  const previousGoodwill = roicMethodology.goodwillTreatment === "exclude" ? p("goodwill") : 0;
  const currentInvestedCapitalBase = sumRequired([
    totalDebt,
    c("shareholders_equity"),
    roicMethodology.id === "average_debt_plus_equity_less_cash" && c("cash") != null ? -c("cash")! : 0,
    currentGoodwill == null ? null : -currentGoodwill,
  ]);
  const previousInvestedCapitalBase = sumRequired([
    previousTotalDebt,
    p("shareholders_equity"),
    roicMethodology.id === "average_debt_plus_equity_less_cash" && p("cash") != null ? -p("cash")! : 0,
    previousGoodwill == null ? null : -previousGoodwill,
  ]);
  const averageInvestedCapital = average(currentInvestedCapitalBase, previousInvestedCapitalBase);
  const taxInput: MetricInput = {
    name: configuredTaxRate == null ? "observed effective tax rate" : "configured tax rate",
    value: taxRate,
    units: "decimal",
    classification: configuredTaxRate == null ? "CALCULATION" : "ASSUMPTION",
  };

  const make = (spec: Omit<Parameters<typeof metric>[0], "periodEndDate" | "calculatedAt">) =>
    metric({ ...spec, periodEndDate, calculatedAt });

  const metrics = {} as Record<DeterministicMetricKey, DeterministicMetric>;
  const add = (result: DeterministicMetric) => { metrics[result.metricKey] = result; };

  add(make({
    metricKey: "revenue_growth",
    value: previousRevenue == null ? null : divide(revenue == null ? null : revenue - previousRevenue, Math.abs(previousRevenue)),
    units: "decimal",
    formula: "(current revenue - previous revenue) / abs(previous revenue)",
    inputs: inputs(["current revenue", currentFact("revenue")], ["previous revenue", previousFact("revenue")]),
  }));
  const cagrPeriodEndDate = cagrFact("revenue")?.periodEndDate ?? null;
  const years = cagrPeriodEndDate ? yearFraction(cagrPeriodEndDate, periodEndDate) : null;
  add(make({
    metricKey: "revenue_cagr",
    value: revenue != null && cagrRevenue != null && revenue > 0 && cagrRevenue > 0 && years != null && years > 0
      ? (revenue / cagrRevenue) ** (1 / years) - 1
      : null,
    units: "decimal",
    formula: "(current revenue / comparison revenue) ^ (1 / elapsed years) - 1",
    inputs: [
      ...inputs(["current revenue", currentFact("revenue")], ["comparison revenue", cagrFact("revenue")]),
      { name: "elapsed years", value: years, units: "years", classification: "CALCULATION" },
    ],
  }));
  add(make({ metricKey: "gross_margin", value: divide(c("gross_profit"), revenue), units: "decimal", formula: "gross profit / revenue", inputs: inputs(["gross profit", currentFact("gross_profit")], ["revenue", currentFact("revenue")]) }));
  add(make({ metricKey: "operating_margin", value: divide(operatingIncome, revenue), units: "decimal", formula: "operating income / revenue", inputs: inputs(["operating income", currentFact("operating_income")], ["revenue", currentFact("revenue")]) }));
  add(make({ metricKey: "net_margin", value: divide(c("net_income"), revenue), units: "decimal", formula: "net income / revenue", inputs: inputs(["net income", currentFact("net_income")], ["revenue", currentFact("revenue")]) }));
  add(make({ metricKey: "operating_cash_flow", value: operatingCashFlow, units: currentFact("operating_cash_flow")?.units ?? "currency", formula: "reported operating cash flow", inputs: inputs(["operating cash flow", currentFact("operating_cash_flow")]) }));
  add(make({ metricKey: "free_cash_flow", value: freeCashFlow, units: currentFact("operating_cash_flow")?.units ?? "currency", formula: "operating cash flow - abs(capital expenditures)", inputs: inputs(["operating cash flow", currentFact("operating_cash_flow")], ["capital expenditures", currentFact("capital_expenditures")]), unavailableReason: capex == null ? "Capital expenditures cannot be reliably determined." : null }));
  add(make({ metricKey: "fcf_margin", value: divide(freeCashFlow, revenue), units: "decimal", formula: "free cash flow / revenue", inputs: [...inputs(["revenue", currentFact("revenue")]), { name: "free cash flow", value: freeCashFlow, units: currentFact("operating_cash_flow")?.units ?? "currency", classification: "CALCULATION" }] }));
  add(make({ metricKey: "fcf_conversion", value: divide(freeCashFlow, c("net_income")), units: "decimal", formula: "free cash flow / net income", inputs: [...inputs(["net income", currentFact("net_income")]), { name: "free cash flow", value: freeCashFlow, units: currentFact("operating_cash_flow")?.units ?? "currency", classification: "CALCULATION" }] }));
  add(make({ metricKey: "return_on_assets", value: divide(c("net_income"), average(c("total_assets"), p("total_assets"))), units: "decimal", formula: "net income / average total assets", inputs: inputs(["net income", currentFact("net_income")], ["current total assets", currentFact("total_assets")], ["previous total assets", previousFact("total_assets")]) }));
  add(make({ metricKey: "return_on_equity", value: divide(c("net_income"), average(c("shareholders_equity"), p("shareholders_equity"))), units: "decimal", formula: "net income / average shareholders equity", inputs: inputs(["net income", currentFact("net_income")], ["current equity", currentFact("shareholders_equity")], ["previous equity", previousFact("shareholders_equity")]) }));
  add(make({
    metricKey: "return_on_invested_capital",
    value: divide(nopat, averageInvestedCapital),
    units: "decimal",
    formula: `NOPAT / average invested capital; NOPAT = operating income * (1 - tax rate); methodology = ${roicMethodology.id}; goodwill = ${roicMethodology.goodwillTreatment ?? "include"}`,
    inputs: [
      ...inputs(
        ["operating income", currentFact("operating_income")],
        ["current total debt", currentFact("total_debt")],
        ["current short-term debt", currentFact("short_term_debt")],
        ["current long-term debt", currentFact("long_term_debt")],
        ["previous total debt", previousFact("total_debt")],
        ["previous short-term debt", previousFact("short_term_debt")],
        ["previous long-term debt", previousFact("long_term_debt")],
        ["current equity", currentFact("shareholders_equity")],
        ["previous equity", previousFact("shareholders_equity")],
        ["current cash", currentFact("cash")],
        ["previous cash", previousFact("cash")]
      ),
      taxInput,
      { name: "NOPAT", value: nopat, units: currentFact("operating_income")?.units ?? "currency", classification: "CALCULATION" },
      { name: "average invested capital", value: averageInvestedCapital, units: currentFact("shareholders_equity")?.units ?? "currency", classification: "CALCULATION" },
    ],
  }));
  add(make({ metricKey: "current_ratio", value: divide(c("current_assets"), c("current_liabilities")), units: "ratio", formula: "current assets / current liabilities", inputs: inputs(["current assets", currentFact("current_assets")], ["current liabilities", currentFact("current_liabilities")]) }));
  add(make({ metricKey: "debt_to_equity", value: divide(totalDebt, c("shareholders_equity")), units: "ratio", formula: "total debt / shareholders equity", inputs: inputs(["total debt", currentFact("total_debt")], ["short-term debt", currentFact("short_term_debt")], ["long-term debt", currentFact("long_term_debt")], ["shareholders equity", currentFact("shareholders_equity")]) }));
  add(make({ metricKey: "debt_to_ebitda", value: divide(totalDebt, ebitda), units: "ratio", formula: "total debt / (operating income + depreciation, depletion and amortization)", inputs: [...inputs(["total debt", currentFact("total_debt")], ["short-term debt", currentFact("short_term_debt")], ["long-term debt", currentFact("long_term_debt")], ["operating income", currentFact("operating_income")], ["depreciation, depletion and amortization", currentFact("depreciation_depletion_amortization")]), { name: "EBITDA", value: ebitda, units: currentFact("operating_income")?.units ?? "currency", classification: "CALCULATION" }], unavailableReason: ebitda == null ? "EBITDA requires operating income plus a verified depreciation, depletion and amortization input." : null }));
  const netDebt = totalDebt == null || c("cash") == null ? null : totalDebt - c("cash")!;
  add(make({ metricKey: "net_debt_to_ebitda", value: divide(netDebt, ebitda), units: "ratio", formula: "(total debt - cash) / (operating income + depreciation, depletion and amortization)", inputs: [...inputs(["total debt", currentFact("total_debt")], ["short-term debt", currentFact("short_term_debt")], ["long-term debt", currentFact("long_term_debt")], ["cash", currentFact("cash")], ["operating income", currentFact("operating_income")], ["depreciation, depletion and amortization", currentFact("depreciation_depletion_amortization")]), { name: "net debt", value: netDebt, units: currentFact("cash")?.units ?? "currency", classification: "CALCULATION" }, { name: "EBITDA", value: ebitda, units: currentFact("operating_income")?.units ?? "currency", classification: "CALCULATION" }], unavailableReason: ebitda == null ? "Net Debt / EBITDA requires a verified EBITDA input." : null }));
  add(make({ metricKey: "interest_coverage", value: divide(operatingIncome, c("interest_expense")), units: "ratio", formula: "operating income / interest expense", inputs: inputs(["operating income", currentFact("operating_income")], ["interest expense", currentFact("interest_expense")]) }));
  add(make({ metricKey: "capex_to_revenue", value: capex == null ? null : divide(Math.abs(capex), revenue), units: "decimal", formula: "abs(capital expenditures) / revenue", inputs: inputs(["capital expenditures", currentFact("capital_expenditures")], ["revenue", currentFact("revenue")]) }));
  add(make({ metricKey: "research_and_development_to_revenue", value: divide(c("research_and_development"), revenue), units: "decimal", formula: "research and development / revenue", inputs: inputs(["research and development", currentFact("research_and_development")], ["revenue", currentFact("revenue")]) }));
  add(make({ metricKey: "sga_to_revenue", value: divide(c("selling_general_administrative"), revenue), units: "decimal", formula: "selling, general and administrative expense / revenue", inputs: inputs(["SG&A", currentFact("selling_general_administrative")], ["revenue", currentFact("revenue")]) }));
  add(make({ metricKey: "stock_based_compensation_to_revenue", value: divide(c("stock_based_compensation"), revenue), units: "decimal", formula: "stock-based compensation / revenue", inputs: inputs(["stock-based compensation", currentFact("stock_based_compensation")], ["revenue", currentFact("revenue")]) }));
  add(make({ metricKey: "stock_based_compensation_to_fcf", value: divide(c("stock_based_compensation"), freeCashFlow), units: "decimal", formula: "stock-based compensation / free cash flow", inputs: [...inputs(["stock-based compensation", currentFact("stock_based_compensation")]), { name: "free cash flow", value: freeCashFlow, units: currentFact("operating_cash_flow")?.units ?? "currency", classification: "CALCULATION" }] }));
  add(make({ metricKey: "share_dilution", value: p("diluted_shares") == null ? null : divide(c("diluted_shares") == null ? null : c("diluted_shares")! - p("diluted_shares")!, Math.abs(p("diluted_shares")!)), units: "decimal", formula: "(current diluted shares - previous diluted shares) / abs(previous diluted shares)", inputs: inputs(["current diluted shares", currentFact("diluted_shares")], ["previous diluted shares", previousFact("diluted_shares")]) }));
  add(make({ metricKey: "working_capital", value: currentWorkingCapital, units: currentFact("current_assets")?.units ?? "currency", formula: "current assets - current liabilities", inputs: inputs(["current assets", currentFact("current_assets")], ["current liabilities", currentFact("current_liabilities")]) }));
  add(make({ metricKey: "working_capital_change", value: currentWorkingCapital == null || previousWorkingCapital == null ? null : currentWorkingCapital - previousWorkingCapital, units: currentFact("current_assets")?.units ?? "currency", formula: "current working capital - previous working capital", inputs: inputs(["current assets", currentFact("current_assets")], ["current liabilities", currentFact("current_liabilities")], ["previous current assets", previousFact("current_assets")], ["previous current liabilities", previousFact("current_liabilities")]) }));
  add(make({ metricKey: "cash_conversion", value: divide(operatingCashFlow, c("net_income")), units: "ratio", formula: "operating cash flow / net income", inputs: inputs(["operating cash flow", currentFact("operating_cash_flow")], ["net income", currentFact("net_income")]) }));

  return metrics;
}

export function calculateDeterministicFinancialMetrics(input: {
  facts: NormalizedFinancialFact[];
  periodType: "annual" | "ttm";
  periodEndDate?: string;
  previousPeriodEndDate?: string | null;
  calculatedAt?: string;
  roicMethodology?: RoicMethodology;
}): DeterministicMetricsResult {
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  const relevantEnds = Array.from(new Set(
    input.facts
      .filter((fact) => fact.periodType === input.periodType)
      .map((fact) => fact.periodEndDate)
  )).sort();
  const periodEndDate = input.periodEndDate ?? relevantEnds.at(-1);
  if (!periodEndDate) throw new Error(`No ${input.periodType} financial period is available.`);
  const priorEnds = relevantEnds.filter((end) => end < periodEndDate);
  const previousPeriodEndDate = input.previousPeriodEndDate === undefined ? priorEnds.at(-1) ?? null : input.previousPeriodEndDate;
  const cagrComparisonPeriodEndDate = priorEnds.at(-5) ?? priorEnds[0] ?? null;
  const lookup: FactLookup = {
    current: latestByConcept(input.facts, periodEndDate, input.periodType),
    previous: previousPeriodEndDate ? latestByConcept(input.facts, previousPeriodEndDate, input.periodType) : new Map(),
    cagrComparison: cagrComparisonPeriodEndDate
      ? latestByConcept(input.facts, cagrComparisonPeriodEndDate, input.periodType)
      : new Map(),
  };
  const roicMethodology: RoicMethodology = {
    id: input.roicMethodology?.id ?? "average_debt_plus_equity_less_cash",
    taxRateAssumption: input.roicMethodology?.taxRateAssumption ?? null,
    goodwillTreatment: input.roicMethodology?.goodwillTreatment ?? "include",
  };
  const metrics = metricFactory({ lookup, periodEndDate, previousPeriodEndDate, calculatedAt, roicMethodology });
  const sourceFactIds = Array.from(new Set(
    Object.values(metrics).flatMap((entry) => entry.inputs.map((item) => item.factId).filter((id): id is string => Boolean(id)))
  ));
  return {
    calculationVersion: DETERMINISTIC_METRICS_VERSION,
    periodType: input.periodType,
    periodEndDate,
    previousPeriodEndDate,
    calculatedAt,
    metrics,
    sourceFactIds,
    methodology: {
      freeCashFlow: "Operating Cash Flow - Capital Expenditures",
      roic: roicMethodology,
      missingValues: "No missing input is replaced with zero",
    },
  };
}
