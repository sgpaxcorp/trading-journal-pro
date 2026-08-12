import { describe, expect, it } from "vitest";

import { buildGrowthPlanFeasibility } from "@/lib/growthPlanFeasibility";

describe("buildGrowthPlanFeasibility", () => {
  it("separates the perfect compound pace from the modeled goal-day pace", () => {
    const result = buildGrowthPlanFeasibility({
      starting: 1_000,
      target: 10_000,
      startIso: "2026-08-12",
      targetIso: "2027-08-12",
      tradingDays: 233,
      averageTradingDaysPerWeek: 5,
      lossDaysPerWeek: 1,
      modeledMaxLossPct: 2,
      requiredGoalDayPct: 1.76,
      scenarioDailyGoalPct: 0.65,
      scenarioProjectedBalance: 1_230.69,
    });

    expect(result.requiredAllSessionPct).toBeCloseTo(0.993, 3);
    expect(result.requiredGoalDayPct).toBe(1.76);
    expect(result.modeledLossDays).toBe(47);
    expect(result.modeledGoalDays).toBe(186);
    expect(result.targetReturnPct).toBe(900);
    expect(result.verdict).toBe("high_risk");
  });

  it("marks a covered plan as unvalidated when there is no execution sample", () => {
    const result = buildGrowthPlanFeasibility({
      starting: 10_000,
      target: 11_000,
      startIso: "2026-01-02",
      targetIso: "2026-12-31",
      tradingDays: 240,
      averageTradingDaysPerWeek: 5,
      lossDaysPerWeek: 1,
      modeledMaxLossPct: 0.5,
      requiredGoalDayPct: 0.12,
      scenarioDailyGoalPct: 0.2,
      scenarioProjectedBalance: 11_250,
    });

    expect(result.verdict).toBe("unvalidated");
    expect(result.flags).toContain("insufficient_execution_sample");
  });

  it("uses execution evidence without allowing it to override a deficient scenario", () => {
    const result = buildGrowthPlanFeasibility({
      starting: 10_000,
      target: 15_000,
      startIso: "2026-01-02",
      targetIso: "2026-12-31",
      tradingDays: 240,
      averageTradingDaysPerWeek: 5,
      lossDaysPerWeek: 1,
      modeledMaxLossPct: 1,
      requiredGoalDayPct: 0.5,
      scenarioDailyGoalPct: 0.2,
      scenarioProjectedBalance: 11_500,
      evidence: {
        totalSessions: 150,
        totalTrades: 300,
        profitFactor: 1.4,
        expectancy: 20,
        maxDrawdownPct: 8,
      },
    });

    expect(result.evidenceDepth).toBe("established");
    expect(result.evidenceSupportsPositiveEdge).toBe(true);
    expect(result.verdict).toBe("high_risk");
  });
});
