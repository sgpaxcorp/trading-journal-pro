export type GrowthPlanEvidence = {
  updatedAtIso?: string | null;
  totalSessions?: number | null;
  totalTrades?: number | null;
  winRate?: number | null;
  profitFactor?: number | null;
  expectancy?: number | null;
  avgWin?: number | null;
  avgLoss?: number | null;
  maxDrawdownPct?: number | null;
};

export type GrowthPlanFeasibilityVerdict =
  | "aligned"
  | "stretch"
  | "high_risk"
  | "unvalidated"
  | "incomplete";

export type GrowthPlanEvidenceDepth = "none" | "limited" | "developing" | "established";

export type GrowthPlanFeasibility = {
  verdict: GrowthPlanFeasibilityVerdict;
  targetMultiple: number;
  targetReturnPct: number;
  annualizedTargetReturnPct: number | null;
  requiredAllSessionPct: number;
  requiredGoalDayPct: number;
  modeledGoalDays: number;
  modeledLossDays: number;
  modeledMaxLossPct: number;
  scenarioDailyGoalPct: number;
  scenarioCoveragePct: number;
  scenarioProjectedBalance: number;
  scenarioGapUsd: number;
  scenarioGapPct: number;
  evidenceDepth: GrowthPlanEvidenceDepth;
  evidenceSessions: number;
  evidenceTrades: number;
  evidenceSupportsPositiveEdge: boolean | null;
  evidenceUpdatedAtIso: string | null;
  flags: string[];
};

type BuildGrowthPlanFeasibilityInput = {
  starting: number;
  target: number;
  startIso: string;
  targetIso: string;
  tradingDays: number;
  averageTradingDaysPerWeek: number;
  lossDaysPerWeek: number;
  modeledMaxLossPct: number;
  requiredGoalDayPct: number;
  scenarioDailyGoalPct: number;
  scenarioProjectedBalance: number;
  evidence?: GrowthPlanEvidence | null;
};

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dateDistanceDays(startIso: string, targetIso: string): number {
  const start = new Date(`${startIso}T00:00:00`);
  const target = new Date(`${targetIso}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(target.getTime())) return 0;
  return Math.max(0, (target.getTime() - start.getTime()) / 86_400_000);
}

function countModeledOutcomes(
  tradingDays: number,
  averageTradingDaysPerWeek: number,
  lossDaysPerWeek: number
) {
  const days = Math.max(0, Math.floor(tradingDays));
  const cycle = Math.max(1, Math.floor(averageTradingDaysPerWeek));
  const lossesPerCycle = Math.max(0, Math.min(cycle, Math.floor(lossDaysPerWeek)));
  const fullCycles = Math.floor(days / cycle);
  const remainder = days % cycle;
  const modeledLossDays = fullCycles * lossesPerCycle + Math.min(remainder, lossesPerCycle);
  return { modeledLossDays, modeledGoalDays: Math.max(0, days - modeledLossDays) };
}

function evidenceDepth(sessions: number): GrowthPlanEvidenceDepth {
  if (sessions <= 0) return "none";
  if (sessions < 30) return "limited";
  if (sessions < 100) return "developing";
  return "established";
}

export function buildGrowthPlanFeasibility(
  input: BuildGrowthPlanFeasibilityInput
): GrowthPlanFeasibility {
  const starting = Math.max(0, finite(input.starting));
  const target = Math.max(0, finite(input.target));
  const tradingDays = Math.max(0, Math.floor(finite(input.tradingDays)));
  const targetMultiple = starting > 0 ? target / starting : 0;
  const valid = starting > 0 && target > starting && tradingDays > 0;
  const targetReturnPct = valid ? (targetMultiple - 1) * 100 : 0;
  const requiredAllSessionPct = valid
    ? (Math.pow(targetMultiple, 1 / tradingDays) - 1) * 100
    : 0;
  const calendarDays = dateDistanceDays(input.startIso, input.targetIso);
  const annualizedTargetReturnPct =
    valid && calendarDays > 0
      ? (Math.pow(targetMultiple, 365.2425 / calendarDays) - 1) * 100
      : null;
  const requiredGoalDayPct = Math.max(0, finite(input.requiredGoalDayPct));
  const scenarioDailyGoalPct = Math.max(0, finite(input.scenarioDailyGoalPct));
  const scenarioProjectedBalance = Math.max(0, finite(input.scenarioProjectedBalance, starting));
  const scenarioGapUsd = valid ? Math.max(0, target - scenarioProjectedBalance) : 0;
  const scenarioGapPct = valid && target > 0 ? (scenarioGapUsd / target) * 100 : 0;
  const scenarioCoveragePct =
    requiredGoalDayPct > 0 ? (scenarioDailyGoalPct / requiredGoalDayPct) * 100 : 0;
  const { modeledGoalDays, modeledLossDays } = countModeledOutcomes(
    tradingDays,
    input.averageTradingDaysPerWeek,
    input.lossDaysPerWeek
  );

  const evidence = input.evidence ?? null;
  const evidenceSessions = Math.max(0, Math.floor(finite(evidence?.totalSessions)));
  const evidenceTrades = Math.max(0, Math.floor(finite(evidence?.totalTrades)));
  const depth = evidenceDepth(evidenceSessions);
  const profitFactor = evidence?.profitFactor == null ? null : finite(evidence.profitFactor);
  const expectancy = evidence?.expectancy == null ? null : finite(evidence.expectancy);
  const evidenceSupportsPositiveEdge =
    profitFactor == null && expectancy == null
      ? null
      : (profitFactor == null || profitFactor > 1) && (expectancy == null || expectancy > 0);

  const flags: string[] = [];
  if (targetReturnPct >= 100) flags.push("large_capital_multiple");
  if (requiredGoalDayPct > requiredAllSessionPct * 1.5) flags.push("loss_budget_materially_increases_pace");
  if (scenarioCoveragePct > 0 && scenarioCoveragePct < 100) flags.push("scenario_does_not_cover_required_pace");
  if (scenarioGapPct >= 25) flags.push("material_deadline_gap");
  if (depth === "none" || depth === "limited") flags.push("insufficient_execution_sample");
  if (evidenceSupportsPositiveEdge === false) flags.push("historical_edge_not_positive");
  if (finite(evidence?.maxDrawdownPct) > 20) flags.push("historical_drawdown_elevated");

  let verdict: GrowthPlanFeasibilityVerdict = "aligned";
  if (!valid || scenarioDailyGoalPct <= 0) {
    verdict = "incomplete";
  } else if (
    scenarioCoveragePct < 67 ||
    scenarioGapPct >= 40 ||
    evidenceSupportsPositiveEdge === false
  ) {
    verdict = "high_risk";
  } else if (scenarioCoveragePct < 100 || scenarioGapPct >= 10) {
    verdict = "stretch";
  } else if (depth === "none" || depth === "limited") {
    verdict = "unvalidated";
  }

  return {
    verdict,
    targetMultiple,
    targetReturnPct,
    annualizedTargetReturnPct,
    requiredAllSessionPct,
    requiredGoalDayPct,
    modeledGoalDays,
    modeledLossDays,
    modeledMaxLossPct: Math.max(0, finite(input.modeledMaxLossPct)),
    scenarioDailyGoalPct,
    scenarioCoveragePct,
    scenarioProjectedBalance,
    scenarioGapUsd,
    scenarioGapPct,
    evidenceDepth: depth,
    evidenceSessions,
    evidenceTrades,
    evidenceSupportsPositiveEdge,
    evidenceUpdatedAtIso: evidence?.updatedAtIso ? String(evidence.updatedAtIso) : null,
    flags,
  };
}
