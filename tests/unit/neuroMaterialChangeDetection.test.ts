import { describe, expect, it } from "vitest";

import { detectMaterialFinancialChanges } from "@/lib/neuroMaterialChangeDetection";
import type { CanonicalFinancialConcept, NormalizedFinancialFact } from "@/lib/neuroFinancialStatements";

function fact(concept: CanonicalFinancialConcept, year: number, value: number, periodType: "annual" | "instant" = "annual"): NormalizedFinancialFact {
  const id = `${concept}-${year}`;
  return {
    id,
    rawFactId: id,
    cik: "0000000001",
    canonicalConcept: concept,
    originalTaxonomy: "us-gaap",
    originalConcept: concept,
    mappingPriority: 100,
    value,
    units: concept === "diluted_shares" ? "shares" : "USD",
    periodType,
    periodStartDate: periodType === "instant" ? null : `${year}-01-01`,
    periodEndDate: `${year}-12-31`,
    fiscalYear: year,
    fiscalPeriod: "FY",
    reportedOrDerived: "REPORTED",
    formula: null,
    inputFactIds: [id],
    accessionNumber: null,
    filingDate: `${year + 1}-02-01`,
    acceptedAt: `${year + 1}-02-01T20:00:00.000Z`,
    publicAt: `${year + 1}-02-01T20:00:00.000Z`,
    mappingVersion: "test",
    calculationVersion: null,
    normalizedAt: `${year + 1}-02-01T21:00:00.000Z`,
    lineageSha256: id.padEnd(64, "a").slice(0, 64),
    unavailableReason: null,
  };
}

describe("material financial change detection", () => {
  it("detects only changes that clear explicit thresholds", () => {
    const result = detectMaterialFinancialChanges({ facts: [
      fact("revenue", 2022, 100), fact("revenue", 2023, 110), fact("revenue", 2024, 143),
      fact("operating_income", 2023, 22), fact("operating_income", 2024, 21),
      fact("operating_cash_flow", 2023, 30), fact("capital_expenditures", 2023, 10),
      fact("operating_cash_flow", 2024, 18), fact("capital_expenditures", 2024, 10),
      fact("total_debt", 2023, 50, "instant"), fact("total_debt", 2024, 70, "instant"),
      fact("diluted_shares", 2023, 100), fact("diluted_shares", 2024, 107),
    ], detectedAt: "2026-09-16T12:00:00.000Z" });

    expect(result.events.map((event) => event.eventType)).toEqual([
      "revenue_acceleration",
      "operating_margin_change",
      "free_cash_flow_deterioration",
      "debt_increase",
      "share_dilution",
    ]);
    expect(result.events.every((event) => event.sourceFactIds.length > 0 && Boolean(event.eventSha256))).toBe(true);
    expect(result.aiUsed).toBe(false);
  });

  it("does not create noise below configured materiality", () => {
    const result = detectMaterialFinancialChanges({ facts: [
      fact("revenue", 2022, 100), fact("revenue", 2023, 110), fact("revenue", 2024, 121.5),
      fact("total_debt", 2023, 50, "instant"), fact("total_debt", 2024, 52, "instant"),
    ] });
    expect(result.events).toEqual([]);
    expect(result.ignoredAsImmaterial).toBe(true);
  });
});
