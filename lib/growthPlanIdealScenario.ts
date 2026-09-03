export const STANDARD_GROWTH_PLAN_SCENARIOS = [
  "conservative",
  "moderate",
  "aggressive",
] as const;

export type StandardGrowthPlanScenarioId =
  (typeof STANDARD_GROWTH_PLAN_SCENARIOS)[number];

type StandardScenario = {
  id: StandardGrowthPlanScenarioId;
};

type DeadlinePanorama = {
  id: string;
  projectedBalance: number;
  completionDate: string | null;
  reachesRequestedDeadline: boolean;
};

export type IdealDeadlineOption = {
  scenarioId: StandardGrowthPlanScenarioId;
  completionDate: string;
};

/**
 * Planning classification only. The target itself remains exact.
 * Small plans use a proportional tolerance; large plans never receive more
 * than $500 of deadline variance.
 */
export function growthPlanDeadlineToleranceUsd(targetBalance: number) {
  if (!Number.isFinite(targetBalance) || targetBalance <= 0) return 0;
  return Number(Math.min(500, Math.max(25, targetBalance * 0.02)).toFixed(2));
}

export function growthPlanDeadlineShortfallUsd(
  projectedBalance: number,
  targetBalance: number
) {
  if (!Number.isFinite(projectedBalance) || !Number.isFinite(targetBalance)) {
    return Number.POSITIVE_INFINITY;
  }
  return Number(Math.max(0, targetBalance - projectedBalance).toFixed(2));
}

export function meetsGrowthPlanDeadlineApproximately(params: {
  panorama: DeadlinePanorama | null | undefined;
  targetBalance: number;
  toleranceUsd?: number;
}) {
  const { panorama, targetBalance } = params;
  if (!panorama || targetBalance <= 0) return false;
  if (panorama.reachesRequestedDeadline) return true;
  const toleranceUsd =
    params.toleranceUsd ?? growthPlanDeadlineToleranceUsd(targetBalance);
  return (
    growthPlanDeadlineShortfallUsd(panorama.projectedBalance, targetBalance) <=
    toleranceUsd
  );
}

export function selectIdealDeadlineOption(params: {
  scenarios: StandardScenario[];
  panoramas: DeadlinePanorama[];
  targetBalance: number;
  toleranceUsd?: number;
}): IdealDeadlineOption | null {
  const panoramaById = new Map(
    params.panoramas.map((panorama) => [panorama.id, panorama])
  );
  const standardPanoramas = STANDARD_GROWTH_PLAN_SCENARIOS.map((id) =>
    panoramaById.get(id)
  ).filter((panorama): panorama is DeadlinePanorama => Boolean(panorama));

  // Wait until all three standard modes have been evaluated.
  if (standardPanoramas.length !== STANDARD_GROWTH_PLAN_SCENARIOS.length) {
    return null;
  }

  if (
    standardPanoramas.some((panorama) =>
      meetsGrowthPlanDeadlineApproximately({
        panorama,
        targetBalance: params.targetBalance,
        toleranceUsd: params.toleranceUsd,
      })
    )
  ) {
    return null;
  }

  const balancedOrder = new Map<StandardGrowthPlanScenarioId, number>([
    ["moderate", 0],
    ["conservative", 1],
    ["aggressive", 2],
  ]);

  const candidates = params.scenarios
    .map((scenario) => ({
      scenario,
      panorama: panoramaById.get(scenario.id),
    }))
    .filter(
      (
        candidate
      ): candidate is {
        scenario: StandardScenario;
        panorama: DeadlinePanorama & { completionDate: string };
      } => Boolean(candidate.panorama?.completionDate)
    )
    .sort((a, b) => {
      const modelPreference =
        (balancedOrder.get(a.scenario.id) ?? 99) -
        (balancedOrder.get(b.scenario.id) ?? 99);
      if (modelPreference !== 0) {
        return modelPreference;
      }
      if (a.panorama.completionDate !== b.panorama.completionDate) {
        return a.panorama.completionDate.localeCompare(b.panorama.completionDate);
      }
      return 0;
    });

  const best = candidates[0];
  return best
    ? {
        scenarioId: best.scenario.id,
        completionDate: best.panorama.completionDate,
      }
    : null;
}
