import { createHash } from "node:crypto";

import { DATA_NOT_AVAILABLE } from "@/lib/neuroFinancialDataIntegrity";

export const RELATIVE_VALUATION_VERSION = "relative-valuation-v1";

export type ValuationMultipleKey = "price_to_earnings" | "price_to_fcf" | "price_to_book" | "enterprise_value_to_revenue";

export type ValuationObservation = {
  companyId?: string | null;
  ticker: string;
  asOfDate: string;
  marketCapitalization: number | null;
  enterpriseValue: number | null;
  netIncome: number | null;
  freeCashFlow: number | null;
  shareholdersEquity: number | null;
  revenue: number | null;
  sourceTraceIds: string[];
};

export type ValuationMultiple = {
  key: ValuationMultipleKey;
  status: "calculated" | "unavailable";
  value: number | null;
  displayValue: number | typeof DATA_NOT_AVAILABLE;
  formula: string;
  inputs: Record<string, number | null>;
  sourceTraceIds: string[];
  unavailableReason: string | null;
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function multiple(input: {
  key: ValuationMultipleKey;
  numeratorName: string;
  numerator: number | null;
  denominatorName: string;
  denominator: number | null;
  sourceTraceIds: string[];
}): ValuationMultiple {
  const numerator = finite(input.numerator);
  const denominator = finite(input.denominator);
  const value = numerator != null && denominator != null && denominator > 0 ? numerator / denominator : null;
  return {
    key: input.key,
    status: value == null ? "unavailable" : "calculated",
    value,
    displayValue: value == null ? DATA_NOT_AVAILABLE : value,
    formula: `${input.numeratorName} / ${input.denominatorName}`,
    inputs: { [input.numeratorName]: numerator, [input.denominatorName]: denominator },
    sourceTraceIds: input.sourceTraceIds,
    unavailableReason: value == null ? `Positive ${input.numeratorName} and ${input.denominatorName} are required.` : null,
  };
}

export function calculateValuationMultiples(observation: ValuationObservation) {
  return [
    multiple({ key: "price_to_earnings", numeratorName: "market capitalization", numerator: observation.marketCapitalization, denominatorName: "net income", denominator: observation.netIncome, sourceTraceIds: observation.sourceTraceIds }),
    multiple({ key: "price_to_fcf", numeratorName: "market capitalization", numerator: observation.marketCapitalization, denominatorName: "free cash flow", denominator: observation.freeCashFlow, sourceTraceIds: observation.sourceTraceIds }),
    multiple({ key: "price_to_book", numeratorName: "market capitalization", numerator: observation.marketCapitalization, denominatorName: "shareholders equity", denominator: observation.shareholdersEquity, sourceTraceIds: observation.sourceTraceIds }),
    multiple({ key: "enterprise_value_to_revenue", numeratorName: "enterprise value", numerator: observation.enterpriseValue, denominatorName: "revenue", denominator: observation.revenue, sourceTraceIds: observation.sourceTraceIds }),
  ];
}

function percentile(sorted: number[], quantile: number) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function distribution(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  return {
    observations: sorted.length,
    minimum: sorted[0] ?? null,
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    maximum: sorted.at(-1) ?? null,
  };
}

export function buildRelativeValuationAnalysis(input: {
  target: ValuationObservation;
  historical: ValuationObservation[];
  peers: ValuationObservation[];
  calculatedAt?: string;
}) {
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  const targetMultiples = calculateValuationMultiples(input.target);
  const historicalMultiples = input.historical.map((observation) => ({ observation, multiples: calculateValuationMultiples(observation) }));
  const peerMultiples = input.peers.map((observation) => ({ observation, multiples: calculateValuationMultiples(observation) }));
  const ranges = Object.fromEntries(targetMultiples.map((target) => {
    const historicalValues = historicalMultiples.flatMap((row) => row.multiples.filter((item) => item.key === target.key && item.value != null).map((item) => item.value!));
    const peerValues = peerMultiples.flatMap((row) => row.multiples.filter((item) => item.key === target.key && item.value != null).map((item) => item.value!));
    return [target.key, {
      target: target.value,
      historical: distribution(historicalValues),
      peers: distribution(peerValues),
      interpretationRequired: true,
    }];
  }));
  const missing = targetMultiples.filter((item) => item.status === "unavailable").map((item) => item.key);
  const traceSha256 = createHash("sha256").update(JSON.stringify({
    version: RELATIVE_VALUATION_VERSION,
    target: input.target,
    historical: input.historical,
    peers: input.peers,
    calculatedAt,
  })).digest("hex");
  return {
    calculationVersion: RELATIVE_VALUATION_VERSION,
    status: missing.length === targetMultiples.length ? "insufficient_information" as const : missing.length ? "partial" as const : "complete" as const,
    targetTicker: input.target.ticker,
    targetMultiples,
    historicalRangesAndPeerComparables: ranges,
    missingTargetMultiples: missing,
    assumptions: {
      peerSelectionMustBeDocumentedByHuman: true,
      negativeDenominatorsAreNotPresentedAsMeaningfulMultiples: true,
      accountingAndBusinessModelComparabilityMustBeReviewed: true,
    },
    notARecommendation: true as const,
    noCheapOrExpensiveVerdict: true as const,
    calculatedAt,
    traceSha256,
  };
}
