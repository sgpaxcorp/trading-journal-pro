import { describe, expect, it } from "vitest";

import {
  buildGrowthPlanReviewInstructions,
  DEFAULT_GROWTH_PLAN_AI_MODEL,
  GROWTH_PLAN_REVIEW_TEXT_FORMAT,
  growthPlanModelCandidates,
} from "../../lib/growthPlanAiReview";

describe("growth plan AI review contract", () => {
  it("uses the quality-first growth model while preserving an explicit override", () => {
    expect(growthPlanModelCandidates({})[0]).toBe(
      DEFAULT_GROWTH_PLAN_AI_MODEL
    );
    expect(
      growthPlanModelCandidates({
        OPENAI_GROWTH_PLAN_MODEL: "custom-growth-model",
      })[0]
    ).toBe("custom-growth-model");
  });

  it("centers the selected scenario instead of silently replacing it", () => {
    const instructions = buildGrowthPlanReviewInstructions();
    expect(instructions).toContain("Analyze that scenario");
    expect(instructions).toContain("do not silently select or substitute another mode");
    expect(instructions).toContain("USD equivalents at starting capital");
    expect(instructions).toContain("Never replace a manual scenario with a preset");
  });

  it("requires separate scenario, deadline, risk, and evidence analysis", () => {
    expect(GROWTH_PLAN_REVIEW_TEXT_FORMAT.strict).toBe(true);
    expect(GROWTH_PLAN_REVIEW_TEXT_FORMAT.schema.required).toEqual(
      expect.arrayContaining([
        "scenarioAnalysis",
        "deadlineAnalysis",
        "riskAnalysis",
        "evidenceAnalysis",
        "comparison",
      ])
    );
  });
});
