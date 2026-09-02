import { describe, expect, it } from "vitest";

import { buildPlanProjection } from "@/lib/growthPlanProjection";
import { listTradingSessionsFrom } from "@/lib/tradingCalendar";

describe("buildPlanProjection", () => {
  it("keeps perfect-path and loss-adjusted goal-day requirements mathematically consistent", () => {
    const sessions = listTradingSessionsFrom("2026-08-12", 233, "stocks");
    const targetIso = sessions[sessions.length - 1];
    const perfectPath = buildPlanProjection({
      starting: 1_000,
      target: 10_000,
      startIso: "2026-08-12",
      targetIso,
      averageTradingDaysPerWeek: 5,
      lossDaysPerWeek: 0,
      maxDailyLossPercent: 0,
      tradingInstrument: "stocks",
    });
    const lossAdjusted = buildPlanProjection({
      starting: 1_000,
      target: 10_000,
      startIso: "2026-08-12",
      targetIso,
      averageTradingDaysPerWeek: 5,
      lossDaysPerWeek: 1,
      maxDailyLossPercent: 2,
      tradingInstrument: "stocks",
    });

    expect(perfectPath.tradingDays).toHaveLength(233);
    expect(perfectPath.requiredGoalPct).toBeCloseTo(0.993, 3);
    expect(lossAdjusted.requiredGoalPct).toBeGreaterThan(perfectPath.requiredGoalPct);
    expect(lossAdjusted.requiredGoalPct).toBeCloseTo(1.762, 2);
    expect(lossAdjusted.completionBalance).toBeCloseTo(10_000, 2);
  });

  it("uses the selected instrument calendar", () => {
    const common = {
      starting: 1_000,
      target: 2_000,
      startIso: "2026-07-02",
      targetIso: "2026-07-06",
      averageTradingDaysPerWeek: 7,
      lossDaysPerWeek: 0,
      maxDailyLossPercent: 0,
    };
    const stocks = buildPlanProjection({ ...common, tradingInstrument: "stocks" });
    const crypto = buildPlanProjection({ ...common, tradingInstrument: "crypto" });

    expect(stocks.tradingDays).toHaveLength(2);
    expect(crypto.tradingDays).toHaveLength(5);
    expect(crypto.requiredGoalPct).toBeLessThan(stocks.requiredGoalPct);
  });

  it("separates scheduled contributions from the trading return requirement", () => {
    const common = {
      starting: 5_000,
      target: 10_000,
      startIso: "2026-01-02",
      targetIso: "2026-12-31",
      averageTradingDaysPerWeek: 5,
      lossDaysPerWeek: 1,
      maxDailyLossPercent: 1,
      modeledLossDayPercent: 0.35,
      tradingInstrument: "stocks" as const,
    };
    const withoutContributions = buildPlanProjection(common);
    const withContributions = buildPlanProjection({
      ...common,
      depositSettings: {
        enabled: true,
        frequency: "monthly",
        amount: 250,
        startPeriodIndex: 1,
      },
    });

    expect(withContributions.requiredGoalPct).toBeLessThan(withoutContributions.requiredGoalPct);
    expect(withContributions.deposits.length).toBeGreaterThan(0);
    expect(withContributions.deposits.reduce((sum, item) => sum + item.amount, 0)).toBeGreaterThan(0);
    expect(withContributions.milestones.some((item) => Number(item.monthDeposit) > 0)).toBe(true);
    expect(withContributions.rows.at(-1)?.cumulativeDeposits).toBeGreaterThan(0);
  });

  it("uses a manually selected percentage and exposes its exact dollar value per session", () => {
    const projection = buildPlanProjection({
      starting: 10_000,
      target: 12_000,
      startIso: "2026-09-01",
      targetIso: "2026-09-30",
      averageTradingDaysPerWeek: 5,
      lossDaysPerWeek: 1,
      maxDailyLossPercent: 1.5,
      modeledLossDayPercent: 1.5,
      goalDayReturnPercent: 1.25,
      stopAtTarget: false,
      tradingInstrument: "stocks",
    });

    const firstLoss = projection.rows.find((row) => row.type === "loss");
    const firstGoal = projection.rows.find((row) => row.type === "goal");

    expect(projection.modeledGoalPct).toBe(1.25);
    expect(firstLoss?.pct).toBe(-1.5);
    expect(firstLoss?.expectedUSD).toBeCloseTo(-150, 2);
    expect(firstGoal?.pct).toBe(1.25);
    expect(firstGoal?.expectedUSD).toBeCloseTo((firstGoal?.startBalance ?? 0) * 0.0125, 2);
    expect(projection.rows).toHaveLength(projection.tradingDays.length);
  });

  it("solves a balanced mathematical percentage from the chosen win/loss day counts", () => {
    const projection = buildPlanProjection({
      starting: 10_000,
      target: 15_000,
      startIso: "2026-09-01",
      targetIso: "2027-09-01",
      averageTradingDaysPerWeek: 5,
      lossDaysPerWeek: 2,
      maxDailyLossPercent: 0,
      solveSymmetricReturnPercent: true,
      tradingInstrument: "stocks",
    });

    expect(projection.requiredGoalPct).toBeGreaterThan(0);
    expect(projection.rows.some((row) => row.type === "loss")).toBe(true);
    expect(
      projection.rows
        .filter((row) => row.type === "loss")
        .every((row) => Math.abs(row.pct) === projection.requiredGoalPct)
    ).toBe(true);
    expect(projection.targetReached).toBe(true);
    expect(projection.completionBalance).toBeGreaterThanOrEqual(15_000);
    expect(projection.completionBalance).toBeLessThan(15_150);
  });
});
