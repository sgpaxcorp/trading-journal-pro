import { createHash } from "node:crypto";

import { DATA_NOT_AVAILABLE } from "@/lib/neuroFinancialDataIntegrity";

export const DCF_ENGINE_VERSION = "fcff-dcf-v1";

export type DcfScenarioName = "downside" | "base" | "upside";

export type DcfScenarioAssumptions = {
  name: DcfScenarioName;
  revenueGrowthPct: number;
  targetOperatingMarginPct: number;
  taxRatePct: number;
  reinvestmentRatePct: number;
  discountRatePct: number;
  terminalGrowthPct: number;
};

export type DcfModelInput = {
  ticker: string;
  startingRevenue: number | null;
  startingOperatingMarginPct: number | null;
  netDebt: number | null;
  dilutedShares: number | null;
  horizonYears?: number;
  scenarios: DcfScenarioAssumptions[];
  calculatedAt?: string;
};

export type DcfScenarioResult = {
  name: DcfScenarioName;
  status: "calculated" | "unavailable";
  assumptions: DcfScenarioAssumptions;
  projectedFreeCashFlow: Array<{ year: number; revenue: number; operatingMarginPct: number; nopat: number; freeCashFlow: number; presentValue: number }>;
  enterpriseValue: number | null;
  equityValue: number | null;
  intrinsicValuePerShare: number | null;
  unavailableReason: string | null;
};

export type DcfSensitivityTable = {
  scenario: DcfScenarioName;
  rowVariable: "discount_rate" | "revenue_growth";
  columnVariable: "terminal_growth" | "operating_margin";
  rowValuesPct: number[];
  columnValuesPct: number[];
  cells: Array<{ rowValuePct: number; columnValuePct: number; intrinsicValuePerShare: number | null }>;
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function round(value: number, digits = 8) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function calculateScenario(input: {
  startingRevenue: number;
  startingOperatingMarginPct: number;
  netDebt: number;
  dilutedShares: number;
  horizonYears: number;
  assumptions: DcfScenarioAssumptions;
}): DcfScenarioResult {
  const assumptions = input.assumptions;
  const growth = assumptions.revenueGrowthPct / 100;
  const startMargin = input.startingOperatingMarginPct / 100;
  const targetMargin = assumptions.targetOperatingMarginPct / 100;
  const taxRate = assumptions.taxRatePct / 100;
  const reinvestmentRate = assumptions.reinvestmentRatePct / 100;
  const discountRate = assumptions.discountRatePct / 100;
  const terminalGrowth = assumptions.terminalGrowthPct / 100;
  if (discountRate <= terminalGrowth) {
    return { name: assumptions.name, status: "unavailable", assumptions, projectedFreeCashFlow: [], enterpriseValue: null, equityValue: null, intrinsicValuePerShare: null, unavailableReason: "Discount rate must exceed terminal growth." };
  }
  if (taxRate < 0 || taxRate >= 1 || reinvestmentRate < 0 || reinvestmentRate > 1 || input.dilutedShares <= 0 || input.startingRevenue <= 0) {
    return { name: assumptions.name, status: "unavailable", assumptions, projectedFreeCashFlow: [], enterpriseValue: null, equityValue: null, intrinsicValuePerShare: null, unavailableReason: "One or more DCF assumptions are outside the supported economic range." };
  }

  let revenue = input.startingRevenue;
  let enterpriseValue = 0;
  let finalNopat = 0;
  const projectedFreeCashFlow: DcfScenarioResult["projectedFreeCashFlow"] = [];
  for (let year = 1; year <= input.horizonYears; year += 1) {
    revenue *= 1 + growth;
    const margin = startMargin + (targetMargin - startMargin) * (year / input.horizonYears);
    const nopat = revenue * margin * (1 - taxRate);
    const freeCashFlow = nopat * (1 - reinvestmentRate);
    const presentValue = freeCashFlow / (1 + discountRate) ** year;
    enterpriseValue += presentValue;
    finalNopat = nopat;
    projectedFreeCashFlow.push({
      year,
      revenue: round(revenue),
      operatingMarginPct: round(margin * 100, 4),
      nopat: round(nopat),
      freeCashFlow: round(freeCashFlow),
      presentValue: round(presentValue),
    });
  }
  const terminalFcf = finalNopat * (1 + terminalGrowth) * (1 - reinvestmentRate);
  const terminalValue = terminalFcf / (discountRate - terminalGrowth);
  enterpriseValue += terminalValue / (1 + discountRate) ** input.horizonYears;
  const equityValue = enterpriseValue - input.netDebt;
  const intrinsicValuePerShare = equityValue / input.dilutedShares;
  if (![enterpriseValue, equityValue, intrinsicValuePerShare].every(Number.isFinite)) {
    return { name: assumptions.name, status: "unavailable", assumptions, projectedFreeCashFlow: [], enterpriseValue: null, equityValue: null, intrinsicValuePerShare: null, unavailableReason: "DCF calculation did not produce finite values." };
  }
  return {
    name: assumptions.name,
    status: "calculated",
    assumptions,
    projectedFreeCashFlow,
    enterpriseValue: round(enterpriseValue),
    equityValue: round(equityValue),
    intrinsicValuePerShare: round(intrinsicValuePerShare),
    unavailableReason: null,
  };
}

function sensitivityValues(center: number, step: number) {
  return [-2, -1, 0, 1, 2].map((offset) => round(center + offset * step, 4));
}

export function buildDeterministicDcf(input: DcfModelInput) {
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  const startingRevenue = finite(input.startingRevenue);
  const startingOperatingMarginPct = finite(input.startingOperatingMarginPct);
  const netDebt = finite(input.netDebt);
  const dilutedShares = finite(input.dilutedShares);
  const horizonYears = Math.max(1, Math.min(20, Math.floor(input.horizonYears ?? 10)));
  const missingInputs = [
    ["starting revenue", startingRevenue],
    ["starting operating margin", startingOperatingMarginPct],
    ["net debt", netDebt],
    ["diluted shares", dilutedShares],
  ].filter(([, value]) => value == null).map(([name]) => String(name));
  const scenarioNames = new Set(input.scenarios.map((scenario) => scenario.name));
  for (const required of ["downside", "base", "upside"] as const) {
    if (!scenarioNames.has(required)) missingInputs.push(`${required} scenario`);
  }
  if (missingInputs.length) {
    return {
      schemaVersion: "1.0",
      calculationVersion: DCF_ENGINE_VERSION,
      ticker: input.ticker,
      status: "insufficient_information" as const,
      notARecommendation: true as const,
      scenariosAreNotPredictions: true as const,
      missingInputs,
      assumptions: input.scenarios,
      scenarios: [],
      sensitivityTables: [],
      calculatedAt,
      displayValue: DATA_NOT_AVAILABLE,
      traceSha256: createHash("sha256").update(JSON.stringify({ input, calculatedAt })).digest("hex"),
    };
  }

  const shared = {
    startingRevenue: startingRevenue!,
    startingOperatingMarginPct: startingOperatingMarginPct!,
    netDebt: netDebt!,
    dilutedShares: dilutedShares!,
    horizonYears,
  };
  const scenarios = input.scenarios
    .filter((scenario, index, all) => all.findIndex((candidate) => candidate.name === scenario.name) === index)
    .map((assumptions) => calculateScenario({ ...shared, assumptions }));
  const sensitivityTables: DcfSensitivityTable[] = [];
  for (const scenario of input.scenarios) {
    const discountRates = sensitivityValues(scenario.discountRatePct, 1);
    const terminalGrowthRates = sensitivityValues(scenario.terminalGrowthPct, 0.5);
    sensitivityTables.push({
      scenario: scenario.name,
      rowVariable: "discount_rate",
      columnVariable: "terminal_growth",
      rowValuesPct: discountRates,
      columnValuesPct: terminalGrowthRates,
      cells: discountRates.flatMap((discountRatePct) => terminalGrowthRates.map((terminalGrowthPct) => ({
        rowValuePct: discountRatePct,
        columnValuePct: terminalGrowthPct,
        intrinsicValuePerShare: calculateScenario({ ...shared, assumptions: { ...scenario, discountRatePct, terminalGrowthPct } }).intrinsicValuePerShare,
      }))),
    });
    const growthRates = sensitivityValues(scenario.revenueGrowthPct, 2);
    const margins = sensitivityValues(scenario.targetOperatingMarginPct, 2);
    sensitivityTables.push({
      scenario: scenario.name,
      rowVariable: "revenue_growth",
      columnVariable: "operating_margin",
      rowValuesPct: growthRates,
      columnValuesPct: margins,
      cells: growthRates.flatMap((revenueGrowthPct) => margins.map((targetOperatingMarginPct) => ({
        rowValuePct: revenueGrowthPct,
        columnValuePct: targetOperatingMarginPct,
        intrinsicValuePerShare: calculateScenario({ ...shared, assumptions: { ...scenario, revenueGrowthPct, targetOperatingMarginPct } }).intrinsicValuePerShare,
      }))),
    });
  }
  const traceSha256 = createHash("sha256").update(JSON.stringify({ shared, assumptions: input.scenarios, calculatedAt, calculationVersion: DCF_ENGINE_VERSION })).digest("hex");
  return {
    schemaVersion: "1.0",
    calculationVersion: DCF_ENGINE_VERSION,
    ticker: input.ticker,
    status: scenarios.every((scenario) => scenario.status === "calculated") ? "complete" as const : "partial" as const,
    notARecommendation: true as const,
    scenariosAreNotPredictions: true as const,
    missingInputs: [],
    assumptions: input.scenarios,
    scenarios,
    sensitivityTables,
    calculatedAt,
    displayValue: null,
    traceSha256,
  };
}
