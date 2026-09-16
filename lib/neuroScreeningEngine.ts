export const SCREENING_ENGINE_VERSION = "deterministic-screening-v1";

export type ScreeningStrategy =
  | "quality_compounder"
  | "value_candidate"
  | "quality_at_reasonable_price"
  | "price_dislocation"
  | "balance_sheet_strength"
  | "custom";

export type ScreeningOperator = "gte" | "lte" | "gt" | "lt" | "between" | "positive" | "nonnegative";

export type ScreeningCriterion = {
  key: string;
  label: string;
  metricKey: string;
  operator: ScreeningOperator;
  value?: number;
  min?: number;
  max?: number;
  required: boolean;
  rationale: string;
};

export type ScreeningTemplate = {
  key: string;
  name: string;
  strategy: ScreeningStrategy;
  version: number;
  criteria: ScreeningCriterion[];
  disclosure: "This screen is deterministic research triage, not an investment recommendation.";
};

export type ScreeningCompanyInput = {
  companyId?: string | null;
  ticker: string;
  companyName: string;
  metrics: Record<string, number | null | undefined>;
  metricTraceIds?: Record<string, string | null | undefined>;
};

export type ScreeningCriterionResult = {
  key: string;
  label: string;
  metricKey: string;
  required: boolean;
  status: "PASS" | "FAIL" | "DATA_NOT_AVAILABLE";
  actualValue: number | null;
  operator: ScreeningOperator;
  threshold: { value?: number; min?: number; max?: number };
  traceId: string | null;
  explanation: string;
};

export type ScreeningCompanyResult = {
  companyId: string | null;
  ticker: string;
  companyName: string;
  passed: boolean;
  status: "PASSED_ALL_REQUIRED_CRITERIA" | "FAILED_REQUIRED_CRITERIA" | "INSUFFICIENT_DATA";
  criteria: ScreeningCriterionResult[];
  dataCompletenessPct: number;
  missingMetrics: string[];
  failedCriteria: string[];
  noMagicScore: true;
};

export const DEFAULT_SCREENING_TEMPLATES: Record<Exclude<ScreeningStrategy, "custom">, ScreeningTemplate> = {
  quality_compounder: {
    key: "quality_compounder",
    name: "Quality Compounder",
    strategy: "quality_compounder",
    version: 1,
    disclosure: "This screen is deterministic research triage, not an investment recommendation.",
    criteria: [
      { key: "revenue_cagr", label: "Persistent revenue growth", metricKey: "revenue_cagr", operator: "gte", value: 0.05, required: true, rationale: "Looks for documented multi-period expansion." },
      { key: "positive_fcf", label: "Positive free cash flow", metricKey: "free_cash_flow", operator: "positive", required: true, rationale: "Requires cash generation under the configured FCF methodology." },
      { key: "roic", label: "Return on invested capital", metricKey: "return_on_invested_capital", operator: "gte", value: 0.1, required: true, rationale: "Tests whether operating returns clear a configurable quality threshold." },
      { key: "leverage", label: "Manageable debt to equity", metricKey: "debt_to_equity", operator: "lte", value: 1.5, required: true, rationale: "Limits balance-sheet leverage without treating it as a recommendation." },
      { key: "dilution", label: "Limited share dilution", metricKey: "share_dilution", operator: "lte", value: 0.03, required: true, rationale: "Surfaces persistent ownership dilution." },
    ],
  },
  value_candidate: {
    key: "value_candidate",
    name: "Value Candidate",
    strategy: "value_candidate",
    version: 1,
    disclosure: "This screen is deterministic research triage, not an investment recommendation.",
    criteria: [
      { key: "fcf_yield", label: "Free cash flow yield", metricKey: "fcf_yield", operator: "gte", value: 0.05, required: true, rationale: "Compares verified FCF with current market capitalization." },
      { key: "positive_fcf", label: "Positive free cash flow", metricKey: "free_cash_flow", operator: "positive", required: true, rationale: "Rejects a yield calculated from negative FCF." },
      { key: "leverage", label: "Manageable debt to equity", metricKey: "debt_to_equity", operator: "lte", value: 2, required: true, rationale: "Keeps leverage visible in value triage." },
      { key: "revenue_trend", label: "No severe revenue contraction", metricKey: "revenue_growth", operator: "gte", value: -0.1, required: true, rationale: "Flags potential structural deterioration for human review." },
    ],
  },
  quality_at_reasonable_price: {
    key: "quality_at_reasonable_price",
    name: "Quality at a Reasonable Price",
    strategy: "quality_at_reasonable_price",
    version: 1,
    disclosure: "This screen is deterministic research triage, not an investment recommendation.",
    criteria: [
      { key: "roic", label: "Return on invested capital", metricKey: "return_on_invested_capital", operator: "gte", value: 0.1, required: true, rationale: "Requires documented operating quality." },
      { key: "fcf_margin", label: "Free cash flow margin", metricKey: "fcf_margin", operator: "gte", value: 0.08, required: true, rationale: "Requires cash conversion before valuation review." },
      { key: "fcf_yield", label: "Free cash flow yield", metricKey: "fcf_yield", operator: "gte", value: 0.03, required: true, rationale: "Uses a configurable valuation floor without creating a buy signal." },
      { key: "dilution", label: "Share dilution", metricKey: "share_dilution", operator: "lte", value: 0.04, required: true, rationale: "Keeps dilution visible beside quality and valuation." },
    ],
  },
  price_dislocation: {
    key: "price_dislocation",
    name: "Price Dislocation",
    strategy: "price_dislocation",
    version: 1,
    disclosure: "This screen is deterministic research triage, not an investment recommendation.",
    criteria: [
      { key: "researched", label: "Previously researched company", metricKey: "has_frozen_research", operator: "gte", value: 1, required: true, rationale: "A price move is meaningful only relative to prior documented research." },
      { key: "price_change", label: "Material price change", metricKey: "price_change_from_research", operator: "lte", value: -0.2, required: true, rationale: "Finds valuation changes without calling a falling price thesis failure." },
      { key: "thesis_not_invalidated", label: "Original thesis not invalidated", metricKey: "thesis_invalidated", operator: "lte", value: 0, required: true, rationale: "Requires current evidence to remain distinct from price action." },
    ],
  },
  balance_sheet_strength: {
    key: "balance_sheet_strength",
    name: "Balance Sheet Strength",
    strategy: "balance_sheet_strength",
    version: 1,
    disclosure: "This screen is deterministic research triage, not an investment recommendation.",
    criteria: [
      { key: "current_ratio", label: "Current ratio", metricKey: "current_ratio", operator: "gte", value: 1.5, required: true, rationale: "Tests short-term liquidity." },
      { key: "debt_to_equity", label: "Debt to equity", metricKey: "debt_to_equity", operator: "lte", value: 0.75, required: true, rationale: "Tests balance-sheet leverage." },
      { key: "interest_coverage", label: "Interest coverage", metricKey: "interest_coverage", operator: "gte", value: 5, required: true, rationale: "Tests documented capacity to service interest expense." },
      { key: "positive_fcf", label: "Positive free cash flow", metricKey: "free_cash_flow", operator: "positive", required: true, rationale: "Requires current cash generation." },
    ],
  },
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function evaluate(value: number, criterion: ScreeningCriterion) {
  if (criterion.operator === "positive") return value > 0;
  if (criterion.operator === "nonnegative") return value >= 0;
  if (criterion.operator === "gte") return criterion.value != null && value >= criterion.value;
  if (criterion.operator === "lte") return criterion.value != null && value <= criterion.value;
  if (criterion.operator === "gt") return criterion.value != null && value > criterion.value;
  if (criterion.operator === "lt") return criterion.value != null && value < criterion.value;
  return criterion.min != null && criterion.max != null && value >= criterion.min && value <= criterion.max;
}

function thresholdText(criterion: ScreeningCriterion) {
  if (criterion.operator === "positive") return "> 0";
  if (criterion.operator === "nonnegative") return ">= 0";
  if (criterion.operator === "between") return `${criterion.min} to ${criterion.max}`;
  return `${criterion.operator} ${criterion.value}`;
}

export function runDeterministicScreen(input: {
  template: ScreeningTemplate;
  companies: ScreeningCompanyInput[];
}) {
  if (!input.template.criteria.length) throw new Error("A deterministic screen requires at least one criterion.");
  const results: ScreeningCompanyResult[] = input.companies.map((company) => {
    const criteria = input.template.criteria.map((criterion): ScreeningCriterionResult => {
      const actualValue = finite(company.metrics[criterion.metricKey]);
      const status = actualValue == null
        ? "DATA_NOT_AVAILABLE"
        : evaluate(actualValue, criterion) ? "PASS" : "FAIL";
      return {
        key: criterion.key,
        label: criterion.label,
        metricKey: criterion.metricKey,
        required: criterion.required,
        status,
        actualValue,
        operator: criterion.operator,
        threshold: { value: criterion.value, min: criterion.min, max: criterion.max },
        traceId: company.metricTraceIds?.[criterion.metricKey] ?? null,
        explanation: status === "DATA_NOT_AVAILABLE"
          ? `${criterion.label}: DATA NOT AVAILABLE. ${criterion.rationale}`
          : `${criterion.label}: ${status}. Actual ${actualValue}; required ${thresholdText(criterion)}. ${criterion.rationale}`,
      };
    });
    const required = criteria.filter((criterion) => criterion.required);
    const missingMetrics = required.filter((criterion) => criterion.status === "DATA_NOT_AVAILABLE").map((criterion) => criterion.metricKey);
    const failedCriteria = required.filter((criterion) => criterion.status === "FAIL").map((criterion) => criterion.key);
    const passed = missingMetrics.length === 0 && failedCriteria.length === 0;
    const status = missingMetrics.length
      ? "INSUFFICIENT_DATA"
      : passed ? "PASSED_ALL_REQUIRED_CRITERIA" : "FAILED_REQUIRED_CRITERIA";
    const available = criteria.filter((criterion) => criterion.status !== "DATA_NOT_AVAILABLE").length;
    return {
      companyId: company.companyId ?? null,
      ticker: company.ticker,
      companyName: company.companyName,
      passed,
      status,
      criteria,
      dataCompletenessPct: Math.round((available / criteria.length) * 10_000) / 100,
      missingMetrics: Array.from(new Set(missingMetrics)),
      failedCriteria,
      noMagicScore: true,
    };
  });

  results.sort((left, right) => {
    if (left.passed !== right.passed) return left.passed ? -1 : 1;
    if (left.status !== right.status) return left.status === "INSUFFICIENT_DATA" ? 1 : -1;
    if (left.dataCompletenessPct !== right.dataCompletenessPct) return right.dataCompletenessPct - left.dataCompletenessPct;
    return left.ticker.localeCompare(right.ticker);
  });

  return {
    engineVersion: SCREENING_ENGINE_VERSION,
    template: input.template,
    generatedAt: new Date().toISOString(),
    noLlmUsed: true,
    noMagicScore: true,
    results,
  } as const;
}
