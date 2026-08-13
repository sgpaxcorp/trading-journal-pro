import { describe, expect, it } from "vitest";

import {
  buildAdaptiveGrowthPlan,
  buildGrowthPlanFeasibility,
  getGrowthPlanOperatingPolicy,
} from "@/lib/growthPlanFeasibility";

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

describe("buildAdaptiveGrowthPlan", () => {
  it("treats 1,000 to 10,000 in one year as a request, not an approved pace", () => {
    const result = buildAdaptiveGrowthPlan({
      starting: 1_000,
      target: 10_000,
      startIso: "2026-08-12",
      requestedTargetIso: "2027-08-12",
      tradingInstrument: "stocks",
      averageTradingDaysPerWeek: 5,
      policy: getGrowthPlanOperatingPolicy("moderate"),
    });

    expect(result.verdict).toBe("not_supported");
    expect(result.requestedProjectedBalance).toBeGreaterThan(1_000);
    expect(result.requestedProjectedBalance).toBeLessThan(10_000);
    expect(result.recommendedCompletionDate! > "2027-08-12").toBe(true);
    expect(result.nextMilestone?.targetBalance).toBeLessThan(10_000);
  });

  it("rejects a forced 100x deadline and builds a longer checkpoint roadmap", () => {
    const result = buildAdaptiveGrowthPlan({
      starting: 10_000,
      target: 1_000_000,
      startIso: "2026-01-02",
      requestedTargetIso: "2027-01-02",
      tradingInstrument: "stocks",
      averageTradingDaysPerWeek: 5,
      policy: getGrowthPlanOperatingPolicy("moderate"),
    });

    expect(result.verdict).toBe("not_supported");
    expect(result.requestedProjectedBalance).toBeGreaterThan(10_000);
    expect(result.requestedProjectedBalance).toBeLessThan(1_000_000);
    expect(result.requestedCoveragePct).toBeLessThan(80);
    expect(result.recommendedCompletionDate).toBeTruthy();
    expect(result.recommendedCompletionDate! > "2027-01-02").toBe(true);
    expect(result.monthlyMilestones.length).toBeGreaterThan(12);
    expect(result.quarterlyMilestones.length).toBeGreaterThan(4);
    expect(result.annualMilestones.length).toBeGreaterThan(1);
    expect(result.nextMilestone).toEqual(result.monthlyMilestones[0]);
    expect(result.isProvisional).toBe(true);
  });

  it("uses documented execution to reduce a policy pace instead of increasing risk", () => {
    const common = {
      starting: 10_000,
      target: 25_000,
      startIso: "2026-01-02",
      requestedTargetIso: "2030-01-02",
      tradingInstrument: "stocks" as const,
      averageTradingDaysPerWeek: 5,
      policy: getGrowthPlanOperatingPolicy("moderate"),
    };
    const modelOnly = buildAdaptiveGrowthPlan(common);
    const evidenceAdjusted = buildAdaptiveGrowthPlan({
      ...common,
      evidence: {
        totalSessions: 150,
        totalTrades: 280,
        avgNetPerSession: 8,
        profitFactor: 1.15,
        maxDrawdownPct: 9,
      },
    });

    expect(evidenceAdjusted.evidenceAdjustmentApplied).toBe(true);
    expect(evidenceAdjusted.recommendedGoalDayPct).toBeLessThan(modelOnly.recommendedGoalDayPct);
    expect(evidenceAdjusted.recommendedCompletionDate! >= modelOnly.recommendedCompletionDate!).toBe(true);
    expect(evidenceAdjusted.confidence).toBe("established");
  });

  it("withholds a completion date when documented execution has no positive edge", () => {
    const result = buildAdaptiveGrowthPlan({
      starting: 10_000,
      target: 20_000,
      startIso: "2026-01-02",
      requestedTargetIso: "2028-01-02",
      tradingInstrument: "stocks",
      averageTradingDaysPerWeek: 5,
      policy: getGrowthPlanOperatingPolicy("moderate"),
      evidence: {
        totalSessions: 120,
        totalTrades: 240,
        avgNetPerSession: -12,
        profitFactor: 0.88,
      },
    });

    expect(result.verdict).toBe("no_validated_edge");
    expect(result.recommendedCompletionDate).toBeNull();
    expect(result.recommendedGoalDayPct).toBe(0);
    expect(result.qualificationRequired).toBe(true);
    expect(result.flags).toContain("historical_edge_not_positive");
  });

  it("evaluates aggressive user assumptions without letting them override policy", () => {
    const policy = getGrowthPlanOperatingPolicy("moderate", {
      experience: "new",
      incomeDependency: "high",
      drawdownComfort: "low",
      riskProfile: "conservative",
    });
    const result = buildAdaptiveGrowthPlan({
      starting: 5_000,
      target: 100_000,
      startIso: "2026-01-02",
      requestedTargetIso: "2027-01-02",
      tradingInstrument: "stocks",
      averageTradingDaysPerWeek: 5,
      policy,
      declaredGoalDayPct: 5,
      declaredExpectedLossDayPct: 0.01,
    });

    expect(result.declaredGoalDayPct).toBe(5);
    expect(result.recommendedGoalDayPct).toBeLessThanOrEqual(policy.goalDayReturnPct);
    expect(result.expectedLossDayPct).toBeGreaterThanOrEqual(policy.expectedLossDayPct);
    expect(result.flags).toContain("declared_goal_above_operating_policy");
    expect(result.flags).toContain("declared_loss_assumption_below_operating_policy");
    expect(result.verdict).toBe("not_supported");
  });

  it("reports deposits, withdrawals, and trading growth as separate plan components", () => {
    const result = buildAdaptiveGrowthPlan({
      starting: 10_000,
      target: 20_000,
      startIso: "2026-01-02",
      requestedTargetIso: "2027-01-02",
      tradingInstrument: "stocks",
      averageTradingDaysPerWeek: 5,
      policy: getGrowthPlanOperatingPolicy("moderate"),
      depositPlan: {
        enabled: true,
        frequency: "monthly",
        amount: 250,
        startPeriodIndex: 1,
      },
      withdrawalPlan: {
        enabled: true,
        frequency: "quarterly",
        amount: 100,
        startPeriodIndex: 1,
      },
    });

    expect(result.requestedDepositsUsd).toBeGreaterThan(0);
    expect(result.requestedWithdrawalsUsd).toBeGreaterThan(0);
    expect(result.requestedTradingGrowthUsd).toBeCloseTo(
      result.requestedProjectedBalance -
        10_000 -
        result.requestedDepositsUsd +
        result.requestedWithdrawalsUsd,
      2
    );
    expect(result.monthlyMilestones.some((item) => item.plannedDepositsUsd > 0)).toBe(true);
    expect(result.quarterlyMilestones.some((item) => item.plannedWithdrawalsUsd > 0)).toBe(true);
    const firstFundedMonth = result.monthlyMilestones.find((item) => item.plannedDepositsUsd > 0);
    expect(firstFundedMonth?.plannedReturnPct).toBeCloseTo(
      ((firstFundedMonth?.plannedTradingChangeUsd ?? 0) /
        (firstFundedMonth?.startBalance ?? 1)) *
        100,
      3
    );
  });

  it("reduces the roadmap pace when the user plans more losing days", () => {
    const common = {
      starting: 10_000,
      target: 30_000,
      startIso: "2026-01-02",
      requestedTargetIso: "2028-01-02",
      tradingInstrument: "stocks" as const,
      averageTradingDaysPerWeek: 5,
    };
    const oneLossDay = buildAdaptiveGrowthPlan({
      ...common,
      policy: { ...getGrowthPlanOperatingPolicy("moderate"), lossDaysPerWeek: 1 },
    });
    const twoLossDays = buildAdaptiveGrowthPlan({
      ...common,
      policy: { ...getGrowthPlanOperatingPolicy("moderate"), lossDaysPerWeek: 2 },
    });

    expect(twoLossDays.modeledAnnualReturnPct).toBeLessThan(oneLossDay.modeledAnnualReturnPct);
    expect(twoLossDays.requestedProjectedBalance).toBeLessThan(oneLossDay.requestedProjectedBalance);
    expect(oneLossDay.recommendedCompletionDate).toBeTruthy();
    expect(twoLossDays.recommendedCompletionDate).toBeNull();
    expect(twoLossDays.verdict).toBe("not_supported");
  });

  it("allows contributions to build capital while a losing trader is in qualification", () => {
    const result = buildAdaptiveGrowthPlan({
      starting: 5_000,
      target: 10_000,
      startIso: "2026-01-02",
      requestedTargetIso: "2027-01-02",
      tradingInstrument: "stocks",
      averageTradingDaysPerWeek: 5,
      policy: getGrowthPlanOperatingPolicy("moderate"),
      evidence: {
        totalSessions: 120,
        avgNetPerSession: -15,
        profitFactor: 0.8,
      },
      depositPlan: {
        enabled: true,
        frequency: "monthly",
        amount: 500,
        startPeriodIndex: 1,
      },
    });

    expect(result.verdict).toBe("no_validated_edge");
    expect(result.recommendedGoalDayPct).toBe(0);
    expect(result.requestedTradingGrowthUsd).toBe(0);
    expect(result.requestedDepositsUsd).toBeGreaterThan(0);
    expect(result.recommendedCompletionDate).toBeTruthy();
    expect(result.monthlyMilestones.some((item) => item.plannedDepositsUsd > 0)).toBe(true);
  });
});
