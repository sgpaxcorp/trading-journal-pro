import { describe, expect, it } from "vitest";

import {
  BUSINESS_MILESTONE_DEFINITIONS,
  getMissingBusinessAnalysisProfileFields,
  hasCompleteBusinessAnalysisProfile,
} from "../../lib/businessMilestones";

describe("business milestone guidance", () => {
  it("requires all five business-analysis answers", () => {
    const partial = {
      riskProfile: "moderate",
      experience: "developing",
    };

    expect(hasCompleteBusinessAnalysisProfile(partial)).toBe(false);
    expect(getMissingBusinessAnalysisProfileFields(partial)).toEqual([
      "incomeDependency",
      "drawdownComfort",
      "tradingStyle",
    ]);
  });

  it("accepts a profile only when every required answer is present", () => {
    expect(
      hasCompleteBusinessAnalysisProfile({
        riskProfile: "moderate",
        experience: "developing",
        incomeDependency: "low",
        drawdownComfort: "medium",
        tradingStyle: "day",
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
