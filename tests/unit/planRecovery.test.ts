import { describe, expect, it } from "vitest";
import { calculatePlanRecovery } from "@/lib/planRecovery";

describe("plan recovery", () => {
  it("separates recovery from the checkpoint growth that was originally planned", () => {
    expect(
      calculatePlanRecovery({
        currentBalance: 1022.43,
        checkpointStart: 1134.5,
        checkpointTarget: 1203.46,
      })
    ).toMatchObject({
      active: true,
      recoveryGap: 112.07,
      plannedGrowthAfterRecovery: 68.96,
      totalRemaining: 181.03,
    });
  });

  it("does not create a recovery phase when the account remains above the checkpoint start", () => {
    expect(
      calculatePlanRecovery({
        currentBalance: 1150,
        checkpointStart: 1134.5,
        checkpointTarget: 1203.46,
      })
    ).toMatchObject({
      active: false,
      recoveryGap: 0,
      plannedGrowthAfterRecovery: 68.96,
      totalRemaining: 53.46,
    });
  });
});
