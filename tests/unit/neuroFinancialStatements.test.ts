import { describe, expect, it } from "vitest";

import {
  buildFinancialPeriodFacts,
  normalizeSecCompanyFacts,
  selectFinancialFactsAsOf,
  type NormalizedFinancialFact,
} from "@/lib/neuroFinancialStatements";

function fact(input: Partial<NormalizedFinancialFact> & Pick<NormalizedFinancialFact, "id" | "value" | "periodType" | "periodEndDate" | "fiscalPeriod">): NormalizedFinancialFact {
  return {
    id: input.id,
    rawFactId: input.id,
    cik: "0000000001",
    canonicalConcept: input.canonicalConcept ?? "revenue",
    originalTaxonomy: "us-gaap",
    originalConcept: "Revenues",
    mappingPriority: input.mappingPriority ?? 100,
    value: input.value,
    units: input.units ?? "USD",
    periodType: input.periodType,
    periodStartDate: input.periodStartDate ?? "2025-01-01",
    periodEndDate: input.periodEndDate,
    fiscalYear: input.fiscalYear ?? 2025,
    fiscalPeriod: input.fiscalPeriod,
    reportedOrDerived: input.reportedOrDerived ?? "REPORTED",
    formula: input.formula ?? null,
    inputFactIds: [input.id],
    accessionNumber: input.accessionNumber ?? `0000000001-25-${input.id.padStart(6, "0").slice(-6)}`,
    filingDate: input.filingDate ?? input.periodEndDate,
    acceptedAt: input.acceptedAt ?? `${input.periodEndDate}T20:00:00.000Z`,
    publicAt: input.publicAt ?? `${input.periodEndDate}T20:00:00.000Z`,
    mappingVersion: "test-v1",
    calculationVersion: input.calculationVersion ?? null,
    normalizedAt: input.normalizedAt ?? "2026-01-10T00:00:00.000Z",
    lineageSha256: input.lineageSha256 ?? input.id.padEnd(64, "a").slice(0, 64),
    unavailableReason: null,
  };
}

describe("financial statement normalization", () => {
  it("does not treat six- or nine-month YTD values as standalone quarters", () => {
    const normalized = normalizeSecCompanyFacts({
      payload: {
        cik: 1,
        entityName: "Acme",
        facts: {
          "us-gaap": {
            Revenues: {
              units: {
                USD: [
                  { val: 25, start: "2025-01-01", end: "2025-03-31", fy: 2025, fp: "Q1", form: "10-Q", filed: "2025-04-20", accn: "0000000001-25-000001" },
                  { val: 60, start: "2025-01-01", end: "2025-06-30", fy: 2025, fp: "Q2", form: "10-Q", filed: "2025-07-20", accn: "0000000001-25-000002" },
                  { val: 105, start: "2025-01-01", end: "2025-09-30", fy: 2025, fp: "Q3", form: "10-Q", filed: "2025-10-20", accn: "0000000001-25-000003" },
                ],
              },
            },
          },
        },
      },
    });

    expect(normalized.normalizedFacts.map((row) => row.periodType)).toEqual(["quarter", "ytd", "ytd"]);
  });

  it("derives discrete Q2, Q3, Q4 and TTM with explicit lineage", () => {
    const periods = buildFinancialPeriodFacts([
      fact({ id: "q1", value: 25, periodType: "quarter", periodEndDate: "2025-03-31", fiscalPeriod: "Q1" }),
      fact({ id: "q2ytd", value: 60, periodType: "ytd", periodEndDate: "2025-06-30", fiscalPeriod: "Q2" }),
      fact({ id: "q3ytd", value: 105, periodType: "ytd", periodEndDate: "2025-09-30", fiscalPeriod: "Q3" }),
      fact({ id: "fy", value: 160, periodType: "annual", periodEndDate: "2025-12-31", fiscalPeriod: "FY" }),
    ], "2026-02-01T00:00:00.000Z");

    expect(periods.derivedQuarters.map((row) => [row.fiscalPeriod, row.value])).toEqual([
      ["Q2", 35],
      ["Q3", 45],
      ["Q4", 55],
    ]);
    expect(periods.derivedQuarters.every((row) => row.reportedOrDerived === "DERIVED")).toBe(true);
    expect(periods.derivedQuarters.find((row) => row.fiscalPeriod === "Q4")?.formula).toBe("Q4 discrete = FY - Q1 - Q2 - Q3");
    expect(periods.trailingTwelveMonths.at(-1)?.value).toBe(160);
    expect(periods.trailingTwelveMonths.at(-1)?.inputFactIds).toHaveLength(4);
  });

  it("preserves original and amended values while preventing look-ahead", () => {
    const original = fact({ id: "original", value: 100, periodType: "annual", periodEndDate: "2024-12-31", fiscalPeriod: "FY", publicAt: "2025-02-10T20:00:00.000Z" });
    const amended = fact({ id: "amended", value: 92, periodType: "annual", periodEndDate: "2024-12-31", fiscalPeriod: "FY", publicAt: "2025-04-01T20:00:00.000Z", normalizedAt: "2026-09-16T00:00:00.000Z" });

    expect(selectFinancialFactsAsOf([original, amended], "2025-03-01T00:00:00.000Z", "latest")[0].value).toBe(100);
    expect(selectFinancialFactsAsOf([original, amended], "2025-05-01T00:00:00.000Z", "latest")[0].value).toBe(92);
    expect(selectFinancialFactsAsOf([original, amended], "2025-05-01T00:00:00.000Z", "original")[0].value).toBe(100);
  });

  it("uses explicit XBRL mapping priority when equivalent tags are available together", () => {
    const preferred = fact({
      id: "preferred",
      value: 100,
      periodType: "annual",
      periodEndDate: "2024-12-31",
      fiscalPeriod: "FY",
      mappingPriority: 10,
      publicAt: "2025-02-10T20:00:00.000Z",
    });
    const fallback = fact({
      id: "fallback",
      value: 99,
      periodType: "annual",
      periodEndDate: "2024-12-31",
      fiscalPeriod: "FY",
      mappingPriority: 200,
      publicAt: "2025-02-10T20:00:00.000Z",
    });

    expect(selectFinancialFactsAsOf([fallback, preferred], "2025-03-01T00:00:00.000Z")[0].id).toBe("preferred");
  });
});
