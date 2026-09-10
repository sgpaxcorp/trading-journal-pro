import type { GrowthPlanEvidence, GrowthPlanEvidenceDepth } from "@/lib/growthPlanFeasibility";

export type GrowthPlanContinuationStatus =
  | "qualification"
  | "controlled_growth"
  | "scale_ready";

export type GrowthPlanContinuationRecommendation = {
  status: GrowthPlanContinuationStatus;
  evidenceDepth: GrowthPlanEvidenceDepth;
  targetReached: true;
  nextStartingBalance: number;
  nextTargetBalance: number;
  targetGrowthPct: number;
  nextPlanStartDate: string;
  nextTargetDate: string;
  runwayMonths: number;
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  evidence: {
    sessions: number;
    trades: number;
    profitFactor: number | null;
    expectancyUsd: number | null;
    maxDrawdownPct: number | null;
  };
  reasons: Array<
    | "established_positive_edge"
    | "developing_positive_edge"
    | "qualification_required"
    | "risk_held_constant"
    | "risk_reduced"
  >;
};

type ContinuationInput = {
  currentBalance: number;
  completedTargetBalance: number;
  currentMaxRiskPerTradePct: number;
  currentMaxDailyLossPct: number;
  evidence?: GrowthPlanEvidence | null;
  asOfDate?: string;
};

const roundMoney = (value: number) => Number(value.toFixed(2));
const roundPct = (value: number) => Number(value.toFixed(2));

function validNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function evidenceDepth(sessions: number): GrowthPlanEvidenceDepth {
  if (sessions >= 90) return "established";
  if (sessions >= 40) return "developing";
  if (sessions >= 15) return "limited";
  return "none";
}

function normalizeIsoDate(value?: string) {
  const raw = String(value ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

function addUtcMonths(iso: string, months: number) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, Math.max(0, month - 1) + months, day || 1));
  return date.toISOString().slice(0, 10);
}

export function recommendGrowthPlanContinuation(
  input: ContinuationInput
): GrowthPlanContinuationRecommendation | null {
  const currentBalance = validNumber(input.currentBalance) ?? 0;
  const completedTargetBalance = validNumber(input.completedTargetBalance) ?? 0;
  if (currentBalance <= 0 || completedTargetBalance <= 0 || currentBalance < completedTargetBalance) {
    return null;
  }

  const sessions = Math.max(0, Math.floor(validNumber(input.evidence?.totalSessions) ?? 0));
  const trades = Math.max(0, Math.floor(validNumber(input.evidence?.totalTrades) ?? 0));
  const profitFactor = validNumber(input.evidence?.profitFactor);
  const expectancyUsd = validNumber(input.evidence?.expectancy);
  const maxDrawdownRaw = validNumber(input.evidence?.maxDrawdownPct);
  const maxDrawdownPct = maxDrawdownRaw == null ? null : Math.abs(maxDrawdownRaw);
  const depth = evidenceDepth(sessions);
  const hasPositiveEdge =
    profitFactor != null && profitFactor >= 1.05 && expectancyUsd != null && expectancyUsd > 0;
  const drawdownControlled = maxDrawdownPct != null && maxDrawdownPct <= 15;
  const drawdownStrong = maxDrawdownPct != null && maxDrawdownPct <= 10;

  let status: GrowthPlanContinuationStatus = "qualification";
  let targetGrowthPct = 10;
  let runwayMonths = 6;
  let riskFactor = 0.75;
  const reasons: GrowthPlanContinuationRecommendation["reasons"] = [
    "qualification_required",
    "risk_reduced",
  ];

  if (depth === "established" && hasPositiveEdge && drawdownStrong && trades >= 100) {
    status = "scale_ready";
    targetGrowthPct = 25;
    runwayMonths = 12;
    riskFactor = 1;
    reasons.splice(0, reasons.length, "established_positive_edge", "risk_held_constant");
  } else if (
    (depth === "developing" || depth === "established") &&
    hasPositiveEdge &&
    drawdownControlled
  ) {
    status = "controlled_growth";
    targetGrowthPct = 15;
    runwayMonths = 9;
    riskFactor = 1;
    reasons.splice(0, reasons.length, "developing_positive_edge", "risk_held_constant");
  }

  const currentRisk = Math.max(0.1, validNumber(input.currentMaxRiskPerTradePct) ?? 0.5);
  const currentDailyLoss = Math.max(0.25, validNumber(input.currentMaxDailyLossPct) ?? 1);
  const nextPlanStartDate = normalizeIsoDate(input.asOfDate);

  return {
    status,
    evidenceDepth: depth,
    targetReached: true,
    nextStartingBalance: roundMoney(currentBalance),
    nextTargetBalance: roundMoney(currentBalance * (1 + targetGrowthPct / 100)),
    targetGrowthPct,
    nextPlanStartDate,
    nextTargetDate: addUtcMonths(nextPlanStartDate, runwayMonths),
    runwayMonths,
    maxRiskPerTradePct: roundPct(Math.min(1, currentRisk * riskFactor)),
    maxDailyLossPct: roundPct(Math.min(2, currentDailyLoss * riskFactor)),
    evidence: {
      sessions,
      trades,
      profitFactor,
      expectancyUsd,
      maxDrawdownPct,
    },
    reasons,
  };
}
