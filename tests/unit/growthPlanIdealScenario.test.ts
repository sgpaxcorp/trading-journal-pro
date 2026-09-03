import { describe, expect, it } from "vitest";

import {
  growthPlanDeadlineToleranceUsd,
  meetsGrowthPlanDeadlineApproximately,
  selectIdealDeadlineOption,
} from "../../lib/growthPlanIdealScenario";

const scenarios = [
  { id: "conservative" as const },
  { id: "moderate" as const },
  { id: "aggressive" as const },
];

describe("ideal growth-plan deadline option", () => {
  it("uses a proportional tolerance capped at $500", () => {
    expect(growthPlanDeadlineToleranceUsd(5_000)).toBe(100);
    expect(growthPlanDeadlineToleranceUsd(25_000)).toBe(500);
    expect(growthPlanDeadlineToleranceUsd(250_000)).toBe(500);
  });

  it("accepts a small dollar shortfall as approximate compliance", () => {
    expect(
      meetsGrowthPlanDeadlineApproximately({
        panorama: {
          id: "moderate",
          projectedBalance: 24_650,
          completionDate: "2028-01-10",
          reachesRequestedDeadline: false,
        },
        targetBalance: 25_000,
      })
    ).toBe(true);
  });

  it("does not offer an ideal fourth card when one mode is within tolerance", () => {
    expect(
      selectIdealDeadlineOption({
        scenarios,
        targetBalance: 25_000,
        panoramas: [
          { id: "conservative", projectedBalance: 10_000, completionDate: "2029-01-01", reachesRequestedDeadline: false },
          { id: "moderate", projectedBalance: 24_650, completionDate: "2028-01-10", reachesRequestedDeadline: false },
          { id: "aggressive", projectedBalance: 40_000, completionDate: "2027-10-01", reachesRequestedDeadline: true },
        ],
      })
    ).toBeNull();
  });

  it("offers the balanced standard mode with its attainable date when all three miss", () => {
    expect(
      selectIdealDeadlineOption({
        scenarios,
        targetBalance: 25_000,
        panoramas: [
          { id: "conservative", projectedBalance: 8_000, completionDate: "2029-01-01", reachesRequestedDeadline: false },
          { id: "moderate", projectedBalance: 14_000, completionDate: "2028-01-10", reachesRequestedDeadline: false },
          { id: "aggressive", projectedBalance: 20_000, completionDate: "2027-10-01", reachesRequestedDeadline: false },
        ],
      })
    ).toEqual({
      scenarioId: "moderate",
      completionDate: "2028-01-10",
    });
  });
});
