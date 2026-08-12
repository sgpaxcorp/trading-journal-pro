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
});
