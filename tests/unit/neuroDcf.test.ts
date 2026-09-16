import { describe, expect, it } from "vitest";

import { buildDeterministicDcf, type DcfScenarioAssumptions } from "@/lib/neuroDcf";

const scenarios: DcfScenarioAssumptions[] = [
  { name: "downside", revenueGrowthPct: 2, targetOperatingMarginPct: 16, taxRatePct: 25, reinvestmentRatePct: 45, discountRatePct: 11, terminalGrowthPct: 2 },
  { name: "base", revenueGrowthPct: 6, targetOperatingMarginPct: 20, taxRatePct: 25, reinvestmentRatePct: 40, discountRatePct: 10, terminalGrowthPct: 2.5 },
  { name: "upside", revenueGrowthPct: 10, targetOperatingMarginPct: 24, taxRatePct: 24, reinvestmentRatePct: 38, discountRatePct: 9, terminalGrowthPct: 3 },
];

describe("deterministic DCF", () => {
  it("builds downside, base, upside and four-way sensitivity without a recommendation", () => {
    const result = buildDeterministicDcf({
      ticker: "ACME",
      startingRevenue: 1_000,
      startingOperatingMarginPct: 18,
      netDebt: 100,
      dilutedShares: 50,
      scenarios,
      calculatedAt: "2026-09-16T12:00:00.000Z",
    });

    expect(result.status).toBe("complete");
    expect(result.scenarios).toHaveLength(3);
    expect(result.sensitivityTables).toHaveLength(6);
    expect(result.sensitivityTables.every((table) => table.cells.length === 25)).toBe(true);
    expect(result.notARecommendation).toBe(true);
    expect(result.scenariosAreNotPredictions).toBe(true);
    expect(result).not.toHaveProperty("verdict");
  });

  it("does not silently replace missing net debt with zero", () => {
    const result = buildDeterministicDcf({
      ticker: "ACME",
      startingRevenue: 1_000,
      startingOperatingMarginPct: 18,
      netDebt: null,
      dilutedShares: 50,
      scenarios,
    });
    expect(result.status).toBe("insufficient_information");
    expect(result.missingInputs).toContain("net debt");
    expect(result.displayValue).toBe("DATA NOT AVAILABLE");
  });
});
