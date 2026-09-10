import { describe, expect, it } from "vitest";

import { recommendGrowthPlanContinuation } from "@/lib/growthPlanContinuation";

describe("recommendGrowthPlanContinuation", () => {
  it("does not create a continuation until the completed target is reached", () => {
    expect(
      recommendGrowthPlanContinuation({
        currentBalance: 14_900,
        completedTargetBalance: 15_000,
        currentMaxRiskPerTradePct: 0.5,
        currentMaxDailyLossPct: 1,
      })
    ).toBeNull();
  });

  it("scales an established positive record without increasing risk", () => {
    const result = recommendGrowthPlanContinuation({
      currentBalance: 250_000,
      completedTargetBalance: 250_000,
      currentMaxRiskPerTradePct: 0.75,
      currentMaxDailyLossPct: 1.5,
      asOfDate: "2028-09-10",
      evidence: {
        totalSessions: 220,
        totalTrades: 340,
        profitFactor: 1.42,
        expectancy: 310,
        maxDrawdownPct: -7.4,
      },
    });

    expect(result).toMatchObject({
      status: "scale_ready",
      nextStartingBalance: 250_000,
      nextTargetBalance: 312_500,
      targetGrowthPct: 25,
      nextPlanStartDate: "2028-09-10",
      nextTargetDate: "2029-09-10",
      maxRiskPerTradePct: 0.75,
      maxDailyLossPct: 1.5,
    });
  });

  it("reduces risk when the record is too small or not validated", () => {
    const result = recommendGrowthPlanContinuation({
      currentBalance: 15_400,
      completedTargetBalance: 15_000,
      currentMaxRiskPerTradePct: 1,
      currentMaxDailyLossPct: 2,
      asOfDate: "2026-09-10",
      evidence: {
        totalSessions: 12,
        totalTrades: 18,
        profitFactor: 0.96,
        expectancy: -2,
        maxDrawdownPct: -18,
      },
    });

    expect(result).toMatchObject({
      status: "qualification",
      nextTargetBalance: 16_940,
      targetGrowthPct: 10,
      runwayMonths: 6,
      maxRiskPerTradePct: 0.75,
      maxDailyLossPct: 1.5,
    });
  });
});
