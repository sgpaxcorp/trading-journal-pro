import { describe, expect, it } from "vitest";

import {
  BUSINESS_MILESTONE_DEFINITIONS,
  hasCompleteBusinessOperatingAnalysis,
} from "../../lib/businessMilestones";

describe("business milestone guidance", () => {
  it("requires a selected model and complete operating assumptions", () => {
    expect(hasCompleteBusinessOperatingAnalysis({ selectedScenarioId: "moderate" })).toBe(false);
    expect(
      hasCompleteBusinessOperatingAnalysis({
        selectedScenarioId: "moderate",
        operatingModel: {
          selectedPlanId: "moderate",
          averageTradingDaysPerWeek: 5,
          lossDaysPerWeek: 1,
          goalDayReturnPct: 0.2,
          expectedLossDayPct: 0.35,
          maxDailyLossPercent: 1,
          riskPerTradePct: 0.5,
        },
      })
    ).toBe(true);
  });

  it("gives every milestone an explanation and a destination", () => {
    expect(BUSINESS_MILESTONE_DEFINITIONS).toHaveLength(7);
    for (const milestone of BUSINESS_MILESTONE_DEFINITIONS) {
      expect(milestone.completionHint.en.length).toBeGreaterThan(0);
      expect(milestone.completionHint.es.length).toBeGreaterThan(0);
      expect(milestone.action.href).toMatch(/^\//);
      expect(milestone.action.label.en.length).toBeGreaterThan(0);
      expect(milestone.action.label.es.length).toBeGreaterThan(0);
    }
  });
});
