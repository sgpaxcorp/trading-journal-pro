import { describe, expect, it } from "vitest";

import {
  buildAdaptiveGrowthPlan,
  buildGrowthPlanFeasibility,
  getGrowthPlanOperatingPolicy,
} from "@/lib/growthPlanFeasibility";
import { listTradingSessionsBetween } from "@/lib/tradingCalendar";

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
  it("separates mathematical possibility from an internally losing declared scenario", () => {
    const comparisonPolicies = (["conservative", "moderate", "aggressive"] as const).map((id) =>
      getGrowthPlanOperatingPolicy(id)
    );
    const result = buildAdaptiveGrowthPlan({
      starting: 1_000,
      target: 50_000,
      startIso: "2026-06-01",
      requestedTargetIso: "2031-06-01",
      tradingInstrument: "stocks",
      averageTradingDaysPerWeek: 5,
      policy: getGrowthPlanOperatingPolicy("moderate"),
      comparisonPolicies,
      declaredGoalDayPct: 0.2,
      declaredExpectedLossDayPct: 1,
    });

    const declared = result.panoramas.find((item) => item.id === "declared");
    const mathematical = result.panoramas.find((item) => item.id === "mathematical");

    expect(result.mathematicallyPossible).toBe(true);
    expect(result.targetAnnualizedReturnPct).toBeGreaterThan(100);
    expect(result.requestedRequiredGoalDayPct).toBeGreaterThan(0.3);
    expect(result.requestedRequiredGoalDayPct).toBeLessThan(1);
    expect(result.expectedLossDayPct).toBe(0.35);
    expect(result.recommendedCompletionDate).toBeTruthy();
    expect(result.recommendedCompletionDate! > "2031-06-01").toBe(true);
    expect(declared?.modeledAnnualReturnPct).toBeLessThan(0);
    expect(declared?.projectedBalance).toBeLessThan(1_000);
    expect(mathematical?.reachesRequestedDeadline).toBe(true);
    expect(mathematical?.projectedBalance).toBeGreaterThanOrEqual(50_000);
    expect(mathematical?.riskBand).toBe("extreme");
    expect(mathematical?.probability.probabilityTargetPct).toBeGreaterThan(20);
    expect(mathematical?.probability.probabilityCapitalHalfPct).toBeGreaterThanOrEqual(0);
    expect(result.flags).toContain("declared_loss_assumption_above_operating_policy");
    expect(result.flags).toContain("target_requires_extreme_annualized_return");
  });

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

  it("keeps a forced 100x target roadmap separate from the longer operating horizon", () => {
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
    expect(result.monthlyMilestones.length).toBeGreaterThanOrEqual(12);
    expect(result.quarterlyMilestones.length).toBeGreaterThanOrEqual(4);
    expect(result.annualMilestones.length).toBeGreaterThanOrEqual(1);
    expect(result.weeklyMilestones.length).toBeGreaterThanOrEqual(52);
    expect(result.semiannualMilestones.length).toBeGreaterThanOrEqual(2);
    expect(result.targetProjectionBalance).toBeCloseTo(1_000_000, 2);
    expect(result.annualMilestones.at(-1)?.targetBalance).toBeCloseTo(1_000_000, 2);
    expect(result.nextMilestone).toEqual(result.weeklyMilestones[0]);
    expect(result.isProvisional).toBe(true);
  });

  it("labels fixed-cost exhaustion without erasing positive percentage compounding", () => {
    const result = buildAdaptiveGrowthPlan({
      starting: 1_000,
      target: 50_000,
      startIso: "2026-06-01",
      requestedTargetIso: "2031-06-01",
      tradingInstrument: "stocks",
      averageTradingDaysPerWeek: 5,
      policy: getGrowthPlanOperatingPolicy("aggressive"),
      estimatedCostPerSessionUsd: 5,
    });

    expect(result.requestedProjectedBalance).toBe(0);
    expect(result.requestedGrossProjectedBalance).toBeGreaterThan(1_000);
    expect(result.requestedGrossTradingGrowthUsd).toBeGreaterThan(0);
    expect(result.requestedCostDragUsd).toBeGreaterThan(0);
    expect(result.costsConsumePercentageEdge).toBe(true);
    expect(result.flags).toContain("fixed_costs_overwhelm_positive_percentage_edge");
    expect(result.targetProjectionGoalDayPct).toBeGreaterThan(result.recommendedGoalDayPct);
    expect(result.targetProjectionBalance).toBeCloseTo(50_000, 2);
    expect(result.targetProjectionCoveragePct).toBeCloseTo(100, 4);
    expect(result.annualMilestones.length).toBeGreaterThanOrEqual(5);
    expect(result.annualMilestones.every((milestone) => milestone.targetBalance > 0)).toBe(true);
    expect(result.annualMilestones.at(-1)?.targetBalance).toBeCloseTo(50_000, 2);
  });

  it("compounds four 2.5% goal days and one 2% loss day as a positive week", () => {
    const result = buildAdaptiveGrowthPlan({
      starting: 1_000,
      target: 50_000,
      startIso: "2026-08-24",
      requestedTargetIso: "2031-08-24",
      tradingInstrument: "stocks",
      averageTradingDaysPerWeek: 5,
      selectedPlanId: "manual",
      declaredGoalDayPct: 2.5,
      declaredExpectedLossDayPct: 2,
      estimatedCostPerSessionUsd: 1,
      policy: {
        id: "aggressive",
        goalDayReturnPct: 2.5,
        expectedLossDayPct: 2,
        maxDailyLossPct: 3,
        riskPerTradePct: 1,
        lossDaysPerWeek: 1,
      },
    });

    const expectedWeeklyReturnPct = (Math.pow(1.025, 4) * 0.98 - 1) * 100;
    const annualCycles = listTradingSessionsBetween("2026-08-24", "2027-08-24", "stocks").length / 5;
    const expectedAnnualReturnPct =
      (Math.pow(1 + expectedWeeklyReturnPct / 100, annualCycles) - 1) * 100;
    expect(result.modeledWeeklyReturnPct).toBeCloseTo(expectedWeeklyReturnPct, 4);
    expect(result.modeledWeeklyReturnPct).toBeGreaterThan(8);
    expect(result.modeledAnnualCycles).toBeCloseTo(annualCycles, 2);
    expect(result.modeledAnnualReturnPct).toBeCloseTo(expectedAnnualReturnPct, 1);
    expect(result.modeledAnnualReturnPct).toBeLessThan(5847.31);
    expect(result.requestedGrossProjectedBalance).toBeGreaterThan(result.requestedProjectedBalance);
    expect(result.requestedProjectedBalance).toBeGreaterThan(50_000);
    expect(result.costsConsumePercentageEdge).toBe(false);
    expect(result.statisticalValidation.assessment).toBe("conditional");
    expect(result.flags).toContain("selected_model_requires_extreme_annualized_return");
    expect(result.recommendedCompletionDate).toBeTruthy();
    expect(result.recommendedCompletionDate! < "2031-08-24").toBe(true);
    expect(result.annualMilestones.every((milestone) => milestone.targetBalance > 0)).toBe(true);
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

  it("models a manually selected plan exactly and validates it statistically", () => {
    const result = buildAdaptiveGrowthPlan({
      starting: 10_000,
      target: 15_000,
      startIso: "2026-01-02",
      requestedTargetIso: "2028-01-02",
      tradingInstrument: "stocks",
      averageTradingDaysPerWeek: 5,
      policy: {
        ...getGrowthPlanOperatingPolicy("moderate"),
        maxDailyLossPct: 1,
        riskPerTradePct: 0.5,
        lossDaysPerWeek: 1,
      },
      selectedPlanId: "manual",
      declaredGoalDayPct: 0.3,
      declaredExpectedLossDayPct: 0.35,
      financialCapacity: {
        capitalSource: "business_income",
        accountStructure: "cash",
        maxLeverageMultiple: 1,
      },
    });

    expect(result.selectedPlanId).toBe("manual");
    expect(result.recommendedGoalDayPct).toBe(0.3);
    expect(result.expectedLossDayPct).toBe(0.35);
    expect(result.statisticalValidation.selectedPlanId).toBe("manual");
    expect(result.statisticalValidation.assessment).toBe("conditional");
    expect(result.statisticalValidation.probability.simulations).toBeGreaterThanOrEqual(200);
    expect(result.statisticalValidation.probability.p10Balance).toBeLessThanOrEqual(
      result.statisticalValidation.probability.medianBalance
    );
    expect(result.statisticalValidation.probability.medianBalance).toBeLessThanOrEqual(
      result.statisticalValidation.probability.p90Balance
    );
    expect(result.weeklyMilestones.length).toBeGreaterThan(0);
    expect(result.monthlyMilestones.length).toBeGreaterThan(0);
    expect(result.quarterlyMilestones.length).toBeGreaterThan(0);
    expect(result.semiannualMilestones.length).toBeGreaterThan(0);
    expect(result.annualMilestones.length).toBeGreaterThan(0);
  });

  it("requires established execution evidence before calling a conditional model supported", () => {
    const common = {
      starting: 10_000,
      target: 11_000,
      startIso: "2026-01-02",
      requestedTargetIso: "2028-01-02",
      tradingInstrument: "stocks" as const,
      averageTradingDaysPerWeek: 5,
      policy: getGrowthPlanOperatingPolicy("moderate"),
    };
    const unvalidated = buildAdaptiveGrowthPlan(common);
    const established = buildAdaptiveGrowthPlan({
      ...common,
      evidence: {
        totalSessions: 150,
        totalTrades: 300,
        avgNetPerSession: 20,
        profitFactor: 1.4,
        maxDrawdownPct: 8,
      },
    });

    expect(unvalidated.statisticalValidation.assessment).toBe("conditional");
    expect(established.statisticalValidation.assessment).toBe("supported");
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

  it("includes trading friction, tax reserve, and protected financial capacity", () => {
    const common = {
      starting: 10_000,
      target: 20_000,
      startIso: "2026-01-02",
      requestedTargetIso: "2028-01-02",
      tradingInstrument: "stocks" as const,
      averageTradingDaysPerWeek: 5,
      policy: getGrowthPlanOperatingPolicy("moderate"),
    };
    const withoutFriction = buildAdaptiveGrowthPlan(common);
    const withFriction = buildAdaptiveGrowthPlan({
      ...common,
      estimatedCostPerSessionUsd: 2,
      estimatedTaxReservePct: 25,
      financialCapacity: {
        capitalSource: "business_income",
        accountStructure: "cash",
        maxLeverageMultiple: 1,
      },
    });

    expect(withFriction.requestedEstimatedCostsUsd).toBeGreaterThan(0);
    expect(withFriction.requestedProjectedBalance).toBeLessThan(withoutFriction.requestedProjectedBalance);
    expect(withFriction.requestedEstimatedTaxReserveUsd).toBeGreaterThan(0);
    expect(withFriction.requestedAfterTaxReserveBalance).toBeLessThan(withFriction.requestedProjectedBalance);
    expect(withFriction.capacityStatus).toBe("protected");
  });

  it("warns on elevated business leverage and derives negative edge from win/loss evidence", () => {
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
        winRate: 40,
        avgWin: 100,
        avgLoss: 100,
      },
      financialCapacity: {
        capitalSource: "business_income",
        accountStructure: "margin",
        maxLeverageMultiple: 3,
      },
    });

    expect(result.verdict).toBe("no_validated_edge");
    expect(result.capacityStatus).toBe("warning");
    expect(result.capacityFlags).toContain("leverage_above_two_times");
  });
});
