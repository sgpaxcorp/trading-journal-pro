export type PlanRecoverySnapshot = {
  active: boolean;
  currentBalance: number;
  checkpointStart: number;
  checkpointTarget: number;
  recoveryGap: number;
  plannedGrowthAfterRecovery: number;
  totalRemaining: number;
  baselineCoveragePct: number;
};

function money(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

/**
 * Preserves the original checkpoint and separates the amount needed to return
 * to its starting baseline from the growth originally planned after it.
 */
export function calculatePlanRecovery(params: {
  currentBalance: number;
  checkpointStart: number;
  checkpointTarget: number;
}): PlanRecoverySnapshot {
  const currentBalance = Math.max(0, money(params.currentBalance));
  const checkpointStart = Math.max(0, money(params.checkpointStart));
  const checkpointTarget = Math.max(0, money(params.checkpointTarget));
  const recoveryGap = Math.max(0, money(checkpointStart - currentBalance));
  const plannedGrowthAfterRecovery = Math.max(
    0,
    money(checkpointTarget - checkpointStart)
  );
  const totalRemaining = Math.max(0, money(checkpointTarget - currentBalance));
  const baselineCoveragePct =
    checkpointStart > 0
      ? Math.max(0, Math.min(100, (currentBalance / checkpointStart) * 100))
      : 100;

  return {
    active: recoveryGap >= 0.01,
    currentBalance,
    checkpointStart,
    checkpointTarget,
    recoveryGap,
    plannedGrowthAfterRecovery,
    totalRemaining,
    baselineCoveragePct,
  };
}
