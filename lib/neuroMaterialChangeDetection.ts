import { createHash } from "node:crypto";

import type { CanonicalFinancialConcept, NormalizedFinancialFact } from "@/lib/neuroFinancialStatements";

export const MATERIAL_CHANGE_ENGINE_VERSION = "material-change-v1";

export type MaterialChangeThresholds = {
  revenueGrowthAccelerationPp: number;
  operatingMarginChangePp: number;
  freeCashFlowDeteriorationPct: number;
  debtIncreasePct: number;
  shareDilutionPct: number;
};

export const DEFAULT_MATERIAL_CHANGE_THRESHOLDS: MaterialChangeThresholds = {
  revenueGrowthAccelerationPp: 5,
  operatingMarginChangePp: 2,
  freeCashFlowDeteriorationPct: 20,
  debtIncreasePct: 20,
  shareDilutionPct: 5,
};

export type MaterialChangeEvent = {
  eventType: "revenue_acceleration" | "revenue_deceleration" | "operating_margin_change" | "free_cash_flow_deterioration" | "debt_increase" | "share_dilution";
  materiality: "medium" | "high" | "critical";
  detectedValue: Record<string, number | string | boolean | null>;
  thresholdSnapshot: MaterialChangeThresholds;
  sourceFactIds: string[];
  detectedAt: string;
  availableAt: string;
  eventSha256: string;
};

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function latestReportedSeries(facts: NormalizedFinancialFact[], concept: CanonicalFinancialConcept) {
  const byPeriod = new Map<string, NormalizedFinancialFact>();
  for (const fact of facts
    .filter((row) => row.canonicalConcept === concept && row.periodType === "annual" && row.value != null)
    .sort((left, right) => {
      const period = left.periodEndDate.localeCompare(right.periodEndDate);
      return period !== 0 ? period : Date.parse(left.publicAt) - Date.parse(right.publicAt);
    })) {
    byPeriod.set(fact.periodEndDate, fact);
  }
  return [...byPeriod.values()].sort((left, right) => left.periodEndDate.localeCompare(right.periodEndDate));
}

function latestInstantSeries(facts: NormalizedFinancialFact[], concept: CanonicalFinancialConcept) {
  const byPeriod = new Map<string, NormalizedFinancialFact>();
  for (const fact of facts
    .filter((row) => row.canonicalConcept === concept && row.periodType === "instant" && row.value != null)
    .sort((left, right) => {
      const period = left.periodEndDate.localeCompare(right.periodEndDate);
      return period !== 0 ? period : Date.parse(left.publicAt) - Date.parse(right.publicAt);
    })) {
    byPeriod.set(fact.periodEndDate, fact);
  }
  return [...byPeriod.values()].sort((left, right) => left.periodEndDate.localeCompare(right.periodEndDate));
}

function pctChange(current: number, previous: number) {
  return previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
}

function maxTimestamp(facts: NormalizedFinancialFact[]) {
  return facts.map((fact) => fact.publicAt).sort().at(-1)!;
}

function materiality(magnitude: number, threshold: number): MaterialChangeEvent["materiality"] {
  const multiple = magnitude / threshold;
  return multiple >= 3 ? "critical" : multiple >= 2 ? "high" : "medium";
}

function event(input: Omit<MaterialChangeEvent, "eventSha256">) {
  return {
    ...input,
    eventSha256: createHash("sha256").update(JSON.stringify({
      version: MATERIAL_CHANGE_ENGINE_VERSION,
      eventType: input.eventType,
      detectedValue: input.detectedValue,
      thresholdSnapshot: input.thresholdSnapshot,
      sourceFactIds: [...input.sourceFactIds].sort(),
      availableAt: input.availableAt,
    })).digest("hex"),
  };
}

export function detectMaterialFinancialChanges(input: {
  facts: NormalizedFinancialFact[];
  thresholds?: Partial<MaterialChangeThresholds>;
  detectedAt?: string;
}) {
  const thresholds = { ...DEFAULT_MATERIAL_CHANGE_THRESHOLDS, ...(input.thresholds ?? {}) };
  const detectedAt = input.detectedAt ?? new Date().toISOString();
  const events: MaterialChangeEvent[] = [];
  const revenues = latestReportedSeries(input.facts, "revenue");
  if (revenues.length >= 3) {
    const [prior, previous, current] = revenues.slice(-3);
    const priorGrowth = pctChange(previous.value!, prior.value!);
    const currentGrowth = pctChange(current.value!, previous.value!);
    if (priorGrowth != null && currentGrowth != null) {
      const changePp = currentGrowth - priorGrowth;
      if (Math.abs(changePp) >= thresholds.revenueGrowthAccelerationPp) {
        const sources = [prior, previous, current];
        events.push(event({
          eventType: changePp > 0 ? "revenue_acceleration" : "revenue_deceleration",
          materiality: materiality(Math.abs(changePp), thresholds.revenueGrowthAccelerationPp),
          detectedValue: { priorGrowthPct: priorGrowth, currentGrowthPct: currentGrowth, changePp, periodEndDate: current.periodEndDate },
          thresholdSnapshot: thresholds,
          sourceFactIds: sources.map((fact) => fact.id),
          detectedAt,
          availableAt: maxTimestamp(sources),
        }));
      }
    }
  }

  const revenuesByPeriod = new Map(revenues.map((fact) => [fact.periodEndDate, fact]));
  const operatingIncome = latestReportedSeries(input.facts, "operating_income")
    .filter((fact) => revenuesByPeriod.has(fact.periodEndDate));
  if (operatingIncome.length >= 2) {
    const [previous, current] = operatingIncome.slice(-2);
    const previousRevenue = revenuesByPeriod.get(previous.periodEndDate)!;
    const currentRevenue = revenuesByPeriod.get(current.periodEndDate)!;
    const previousMargin = previousRevenue.value === 0 ? null : previous.value! / previousRevenue.value! * 100;
    const currentMargin = currentRevenue.value === 0 ? null : current.value! / currentRevenue.value! * 100;
    if (previousMargin != null && currentMargin != null) {
      const changePp = currentMargin - previousMargin;
      if (Math.abs(changePp) >= thresholds.operatingMarginChangePp) {
        const sources = [previous, current, previousRevenue, currentRevenue];
        events.push(event({
          eventType: "operating_margin_change",
          materiality: materiality(Math.abs(changePp), thresholds.operatingMarginChangePp),
          detectedValue: { previousMarginPct: previousMargin, currentMarginPct: currentMargin, changePp, periodEndDate: current.periodEndDate },
          thresholdSnapshot: thresholds,
          sourceFactIds: sources.map((fact) => fact.id),
          detectedAt,
          availableAt: maxTimestamp(sources),
        }));
      }
    }
  }

  const operatingCashFlow = new Map(latestReportedSeries(input.facts, "operating_cash_flow").map((fact) => [fact.periodEndDate, fact]));
  const capex = new Map(latestReportedSeries(input.facts, "capital_expenditures").map((fact) => [fact.periodEndDate, fact]));
  const fcfPeriods = [...operatingCashFlow.keys()].filter((period) => capex.has(period)).sort();
  if (fcfPeriods.length >= 2) {
    const [previousPeriod, currentPeriod] = fcfPeriods.slice(-2);
    const previousInputs = [operatingCashFlow.get(previousPeriod)!, capex.get(previousPeriod)!];
    const currentInputs = [operatingCashFlow.get(currentPeriod)!, capex.get(currentPeriod)!];
    const previousFcf = previousInputs[0].value! - Math.abs(previousInputs[1].value!);
    const currentFcf = currentInputs[0].value! - Math.abs(currentInputs[1].value!);
    const changePct = pctChange(currentFcf, previousFcf);
    if (changePct != null && changePct <= -thresholds.freeCashFlowDeteriorationPct) {
      const sources = [...previousInputs, ...currentInputs];
      events.push(event({
        eventType: "free_cash_flow_deterioration",
        materiality: materiality(Math.abs(changePct), thresholds.freeCashFlowDeteriorationPct),
        detectedValue: { previousFreeCashFlow: previousFcf, currentFreeCashFlow: currentFcf, changePct, periodEndDate: currentPeriod },
        thresholdSnapshot: thresholds,
        sourceFactIds: sources.map((fact) => fact.id),
        detectedAt,
        availableAt: maxTimestamp(sources),
      }));
    }
  }

  const totalDebt = latestInstantSeries(input.facts, "total_debt");
  if (totalDebt.length >= 2) {
    const [previous, current] = totalDebt.slice(-2);
    const changePct = pctChange(current.value!, previous.value!);
    if (changePct != null && changePct >= thresholds.debtIncreasePct) {
      events.push(event({
        eventType: "debt_increase",
        materiality: materiality(changePct, thresholds.debtIncreasePct),
        detectedValue: { previousDebt: previous.value, currentDebt: current.value, changePct, periodEndDate: current.periodEndDate },
        thresholdSnapshot: thresholds,
        sourceFactIds: [previous.id, current.id],
        detectedAt,
        availableAt: maxTimestamp([previous, current]),
      }));
    }
  }

  const shares = latestReportedSeries(input.facts, "diluted_shares");
  if (shares.length >= 2) {
    const [previous, current] = shares.slice(-2);
    const changePct = pctChange(current.value!, previous.value!);
    if (changePct != null && changePct >= thresholds.shareDilutionPct) {
      events.push(event({
        eventType: "share_dilution",
        materiality: materiality(changePct, thresholds.shareDilutionPct),
        detectedValue: { previousShares: previous.value, currentShares: current.value, changePct, periodEndDate: current.periodEndDate },
        thresholdSnapshot: thresholds,
        sourceFactIds: [previous.id, current.id],
        detectedAt,
        availableAt: maxTimestamp([previous, current]),
      }));
    }
  }

  return {
    engineVersion: MATERIAL_CHANGE_ENGINE_VERSION,
    thresholds,
    detectedAt,
    events,
    ignoredAsImmaterial: events.length === 0,
    aiUsed: false,
  } as const;
}
