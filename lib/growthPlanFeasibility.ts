import {
  addTradingRunway,
  getTradingCalendarProfile,
  listTradingSessionsBetween,
  type TradingInstrument,
} from "@/lib/tradingCalendar";

export type GrowthPlanEvidence = {
  updatedAtIso?: string | null;
  totalSessions?: number | null;
  totalTrades?: number | null;
  winRate?: number | null;
  profitFactor?: number | null;
  expectancy?: number | null;
  avgNetPerSession?: number | null;
  netPnl?: number | null;
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

export type GrowthPlanScenarioId = "conservative" | "moderate" | "aggressive";
export type GrowthPlanSelectedPlanId = GrowthPlanScenarioId | "manual";

export type GrowthPlanOperatingPolicy = {
  id: GrowthPlanScenarioId;
  goalDayReturnPct: number;
  expectedLossDayPct: number;
  maxDailyLossPct: number;
  riskPerTradePct: number;
  lossDaysPerWeek: number;
};

export type AdaptivePlanVerdict =
  | "supported"
  | "stretch"
  | "not_supported"
  | "unvalidated"
  | "no_validated_edge"
  | "incomplete";

export type AdaptivePlanMilestone = {
  cadence: "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";
  periodIndex: number;
  startDate: string;
  targetDate: string;
  startBalance: number;
  targetBalance: number;
  plannedChangeUsd: number;
  plannedReturnPct: number;
  plannedTradingChangeUsd: number;
  plannedDepositsUsd: number;
  plannedWithdrawalsUsd: number;
  sessionCount: number;
};

export type AdaptiveWithdrawalPlan = {
  enabled: boolean;
  frequency: "monthly" | "quarterly" | "semiannual";
  amount: number;
  startPeriodIndex?: number | null;
};

export type AdaptiveDepositPlan = AdaptiveWithdrawalPlan;

export type GrowthPlanRiskBand = "within_policy" | "elevated" | "speculative" | "extreme";

export type GrowthPlanProbabilityRange = {
  simulations: number;
  probabilityTargetPct: number;
  probabilityCapitalHalfPct: number;
  p10Balance: number;
  medianBalance: number;
  p90Balance: number;
  medianMaxDrawdownPct: number;
};

export type GrowthPlanStatisticalValidation = {
  selectedPlanId: GrowthPlanSelectedPlanId;
  assessment: "supported" | "conditional" | "not_supported" | "incomplete";
  deterministicReachesTarget: boolean;
  deterministicProjectedBalance: number;
  probability: GrowthPlanProbabilityRange;
};

export type GrowthPlanPanorama = {
  id: "declared" | "conservative" | "moderate" | "aggressive" | "mathematical";
  goalDayReturnPct: number;
  expectedLossDayPct: number;
  modeledNetReturnPerSessionPct: number;
  modeledAnnualReturnPct: number;
  grossProjectedBalance: number;
  projectedBalance: number;
  costDragUsd: number;
  afterTaxReserveBalance: number;
  coveragePct: number;
  completionDate: string | null;
  reachesRequestedDeadline: boolean;
  riskBand: GrowthPlanRiskBand;
  probability: GrowthPlanProbabilityRange;
};

export type GrowthPlanFinancialCapacity = {
  capitalSource?: "business_income" | null;
  accountStructure?: "cash" | "margin" | "leveraged_derivatives" | null;
  maxLeverageMultiple?: number | null;
};

export type AdaptiveGrowthPlan = {
  selectedPlanId: GrowthPlanSelectedPlanId;
  verdict: AdaptivePlanVerdict;
  confidence: GrowthPlanEvidenceDepth;
  isProvisional: boolean;
  requestedTargetDate: string | null;
  requestedTradingSessions: number;
  requestedRequiredAllSessionPct: number;
  requestedRequiredGoalDayPct: number;
  targetAnnualizedReturnPct: number | null;
  mathematicallyPossible: boolean;
  targetProjectionGoalDayPct: number;
  targetProjectionBalance: number;
  targetProjectionCoveragePct: number;
  targetProjectionTradingGrowthUsd: number;
  targetProjectionEstimatedCostsUsd: number;
  requestedGrossProjectedBalance: number;
  requestedGrossTradingGrowthUsd: number;
  requestedCostDragUsd: number;
  costsConsumePercentageEdge: boolean;
  requestedProjectedBalance: number;
  requestedAfterTaxReserveBalance: number;
  requestedCoveragePct: number;
  requestedShortfallUsd: number;
  requestedDepositsUsd: number;
  requestedWithdrawalsUsd: number;
  requestedTradingGrowthUsd: number;
  requestedNetCashflowUsd: number;
  requestedEstimatedCostsUsd: number;
  requestedEstimatedTaxReserveUsd: number;
  declaredGoalDayPct: number;
  declaredExpectedLossDayPct: number;
  policyGoalDayCapPct: number;
  policyExpectedLossDayFloorPct: number;
  recommendedGoalDayPct: number;
  expectedLossDayPct: number;
  maxDailyLossGuardrailPct: number;
  riskPerTradePct: number;
  lossDaysPerWeek: number;
  operatingDaysPerWeek: number;
  modeledNetReturnPerSessionPct: number;
  modeledWeeklyReturnPct: number;
  modeledAnnualCycles: number;
  modeledAnnualReturnPct: number;
  recommendedCompletionDate: string | null;
  recommendedTradingSessions: number | null;
  recommendedCalendarMonths: number | null;
  recommendedCalendarYears: number | null;
  evidenceNetReturnPerSessionPct: number | null;
  evidenceAdjustmentApplied: boolean;
  qualificationRequired: boolean;
  qualificationMinimumSessions: number;
  nextMilestone: AdaptivePlanMilestone | null;
  weeklyMilestones: AdaptivePlanMilestone[];
  monthlyMilestones: AdaptivePlanMilestone[];
  quarterlyMilestones: AdaptivePlanMilestone[];
  semiannualMilestones: AdaptivePlanMilestone[];
  annualMilestones: AdaptivePlanMilestone[];
  panoramas: GrowthPlanPanorama[];
  statisticalValidation: GrowthPlanStatisticalValidation;
  capacityStatus: "incomplete" | "protected" | "warning" | "blocked";
  capacityFlags: string[];
  flags: string[];
};

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

const BASE_OPERATING_POLICIES: Record<GrowthPlanScenarioId, GrowthPlanOperatingPolicy> = {
  conservative: {
    id: "conservative",
    goalDayReturnPct: 0.12,
    expectedLossDayPct: 0.25,
    maxDailyLossPct: 0.75,
    riskPerTradePct: 0.25,
    lossDaysPerWeek: 1,
  },
  moderate: {
    id: "moderate",
    goalDayReturnPct: 0.2,
    expectedLossDayPct: 0.35,
    maxDailyLossPct: 1,
    riskPerTradePct: 0.5,
    lossDaysPerWeek: 1,
  },
  aggressive: {
    id: "aggressive",
    goalDayReturnPct: 0.3,
    expectedLossDayPct: 0.5,
    maxDailyLossPct: 1.5,
    riskPerTradePct: 0.75,
    lossDaysPerWeek: 1,
  },
};

export function getGrowthPlanOperatingPolicy(
  scenarioId: GrowthPlanScenarioId,
  profile?: {
    experience?: string | null;
    incomeDependency?: string | null;
    drawdownComfort?: string | null;
    riskProfile?: string | null;
  } | null
): GrowthPlanOperatingPolicy {
  const base = BASE_OPERATING_POLICIES[scenarioId] ?? BASE_OPERATING_POLICIES.moderate;
  let paceFactor = 1;
  let riskFactor = 1;

  if (profile?.experience === "new") {
    paceFactor *= 0.75;
    riskFactor *= 0.75;
  } else if (profile?.experience === "developing") {
    paceFactor *= 0.9;
    riskFactor *= 0.9;
  }
  if (profile?.incomeDependency === "high") {
    paceFactor *= 0.8;
    riskFactor *= 0.75;
  }
  if (profile?.drawdownComfort === "low") {
    paceFactor *= 0.82;
    riskFactor *= 0.8;
  }
  if (profile?.riskProfile === "conservative") {
    paceFactor *= 0.9;
    riskFactor *= 0.9;
  }

  const maxDailyLossPct = Number(Math.max(0.5, base.maxDailyLossPct * riskFactor).toFixed(2));
  return {
    ...base,
    goalDayReturnPct: Number(Math.max(0.08, base.goalDayReturnPct * paceFactor).toFixed(3)),
    expectedLossDayPct: Number(
      Math.min(maxDailyLossPct * 0.65, Math.max(0.12, base.expectedLossDayPct * riskFactor)).toFixed(3)
    ),
    maxDailyLossPct,
    riskPerTradePct: Number(Math.max(0.1, base.riskPerTradePct * riskFactor).toFixed(3)),
  };
}

function weekKey(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return dateIso;
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dateOfMonth = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dateOfMonth}`;
}

function committedSessions(sessions: string[], daysPerWeek: number): string[] {
  const countByWeek = new Map<string, number>();
  return sessions.filter((dateIso) => {
    const key = weekKey(dateIso);
    const count = countByWeek.get(key) ?? 0;
    if (count >= daysPerWeek) return false;
    countByWeek.set(key, count + 1);
    return true;
  });
}

function cycleFactor(params: {
  daysPerWeek: number;
  lossDaysPerWeek: number;
  goalDayPct: number;
  lossDayPct: number;
}) {
  const lossDays = Math.max(0, Math.min(params.daysPerWeek - 1, Math.floor(params.lossDaysPerWeek)));
  const goalDays = Math.max(1, params.daysPerWeek - lossDays);
  return (
    Math.pow(1 + Math.max(0, params.goalDayPct) / 100, goalDays) *
    Math.pow(1 - Math.min(99, Math.max(0, params.lossDayPct)) / 100, lossDays)
  );
}

function annualizedReturnPct(factor: number, cyclesPerYear: number) {
  return Number(
    ((Math.pow(Math.max(0, factor), Math.max(0, cyclesPerYear)) - 1) * 100).toFixed(2)
  );
}

function riskBandForAnnualizedReturn(value: number): GrowthPlanRiskBand {
  if (value <= 30) return "within_policy";
  if (value <= 60) return "elevated";
  if (value <= 100) return "speculative";
  return "extreme";
}

function equivalentSessionReturnPct(factor: number, daysPerWeek: number) {
  if (!Number.isFinite(factor) || factor <= 0 || daysPerWeek <= 0) return 0;
  return (Math.pow(factor, 1 / daysPerWeek) - 1) * 100;
}

function goalDayPctForNetSession(params: {
  netSessionPct: number;
  daysPerWeek: number;
  lossDaysPerWeek: number;
  lossDayPct: number;
}) {
  const lossDays = Math.max(0, Math.min(params.daysPerWeek - 1, Math.floor(params.lossDaysPerWeek)));
  const goalDays = Math.max(1, params.daysPerWeek - lossDays);
  const cycleTarget = Math.pow(1 + Math.max(-0.99, params.netSessionPct / 100), params.daysPerWeek);
  const lossFactor = Math.pow(1 - Math.min(99, Math.max(0, params.lossDayPct)) / 100, lossDays);
  if (cycleTarget <= 0 || lossFactor <= 0) return 0;
  return Math.max(0, (Math.pow(cycleTarget / lossFactor, 1 / goalDays) - 1) * 100);
}

function monthsBetweenDates(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return 0;
  return Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 +
      end.getMonth() -
      start.getMonth() +
      (end.getDate() >= start.getDate() ? 0 : -1)
  );
}

type SimulatedSession = {
  date: string;
  startBalance: number;
  endBalance: number;
  depositUsd: number;
  withdrawalUsd: number;
};

function buildRecurringFlowByDate(
  sessions: string[],
  plan: AdaptiveWithdrawalPlan | AdaptiveDepositPlan | null | undefined
) {
  const byDate = new Map<string, number>();
  if (!plan?.enabled || plan.amount <= 0) return byDate;
  const monthEnds = sessions.filter((current, index) => {
    const next = sessions[index + 1];
    return !next || next.slice(0, 7) !== current.slice(0, 7);
  });
  const every = plan.frequency === "quarterly" ? 3 : plan.frequency === "semiannual" ? 6 : 1;
  const startPeriod = Math.max(1, Math.floor(finite(plan.startPeriodIndex, 1)));
  monthEnds.forEach((date, monthIndex) => {
    const periodIndex = Math.floor(monthIndex / every) + 1;
    if ((monthIndex + 1) % every === 0 && periodIndex >= startPeriod) {
      byDate.set(date, Math.max(0, finite(plan.amount)));
    }
  });
  return byDate;
}

function simulateOperatingPath(params: {
  starting: number;
  sessions: string[];
  daysPerWeek: number;
  lossDaysPerWeek: number;
  goalDayPct: number;
  lossDayPct: number;
  target?: number;
  depositPlan?: AdaptiveDepositPlan | null;
  withdrawalPlan?: AdaptiveWithdrawalPlan | null;
  costPerSessionUsd?: number;
}) {
  const lossDays = Math.max(0, Math.min(params.daysPerWeek - 1, Math.floor(params.lossDaysPerWeek)));
  const rows: SimulatedSession[] = [];
  let balance = params.starting;
  let completionDate: string | null = balance >= (params.target ?? Number.POSITIVE_INFINITY) ? params.sessions[0] ?? null : null;
  const depositByDate = buildRecurringFlowByDate(params.sessions, params.depositPlan);
  const withdrawalByDate = buildRecurringFlowByDate(params.sessions, params.withdrawalPlan);
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalCosts = 0;

  for (let index = 0; index < params.sessions.length; index += 1) {
    const startBalance = balance;
    const isLossDay = lossDays > 0 && index % params.daysPerWeek < lossDays;
    const pct = isLossDay ? -params.lossDayPct : params.goalDayPct;
    balance = Math.max(0, balance * (1 + pct / 100));
    const costUsd = Math.min(balance, Math.max(0, finite(params.costPerSessionUsd)));
    balance = Math.max(0, balance - costUsd);
    const depositUsd = depositByDate.get(params.sessions[index]) ?? 0;
    const withdrawalUsd = withdrawalByDate.get(params.sessions[index]) ?? 0;
    balance = Math.max(0, balance + depositUsd - withdrawalUsd);
    totalDeposits += depositUsd;
    totalWithdrawals += withdrawalUsd;
    totalCosts += costUsd;
    rows.push({
      date: params.sessions[index],
      startBalance: Number(startBalance.toFixed(2)),
      endBalance: Number(balance.toFixed(2)),
      depositUsd: Number(depositUsd.toFixed(2)),
      withdrawalUsd: Number(withdrawalUsd.toFixed(2)),
    });
    if (!completionDate && params.target && balance >= params.target) {
      completionDate = params.sessions[index];
      break;
    }
  }

  return {
    rows,
    balance: Number(balance.toFixed(2)),
    completionDate,
    totalDeposits: Number(totalDeposits.toFixed(2)),
    totalWithdrawals: Number(totalWithdrawals.toFixed(2)),
    totalCosts: Number(totalCosts.toFixed(2)),
  };
}

function requiredGoalDayPct(params: {
  starting: number;
  target: number;
  sessions: string[];
  daysPerWeek: number;
  lossDaysPerWeek: number;
  lossDayPct: number;
  depositPlan?: AdaptiveDepositPlan | null;
  withdrawalPlan?: AdaptiveWithdrawalPlan | null;
  costPerSessionUsd?: number;
}) {
  if (params.starting <= 0 || params.target <= params.starting || !params.sessions.length) return 0;
  const project = (goalDayPct: number) =>
    simulateOperatingPath({
      starting: params.starting,
      sessions: params.sessions,
      daysPerWeek: params.daysPerWeek,
      lossDaysPerWeek: params.lossDaysPerWeek,
      lossDayPct: params.lossDayPct,
      goalDayPct,
      depositPlan: params.depositPlan,
      withdrawalPlan: params.withdrawalPlan,
      costPerSessionUsd: params.costPerSessionUsd,
    }).balance;
  if (project(0) >= params.target) return 0;
  let low = 0;
  let high = 0.25;
  while (high < 100 && project(high) < params.target) high *= 2;
  if (project(high) < params.target) return Number.POSITIVE_INFINITY;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const mid = (low + high) / 2;
    if (project(mid) >= params.target) high = mid;
    else low = mid;
  }
  return high;
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4_294_967_296;
  };
}

function percentile(sorted: number[], pct: number) {
  if (!sorted.length) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * pct)));
  return sorted[index];
}

function simulateProbabilityRange(params: {
  starting: number;
  target: number;
  sessions: string[];
  daysPerWeek: number;
  lossDaysPerWeek: number;
  goalDayPct: number;
  lossDayPct: number;
  depositPlan?: AdaptiveDepositPlan | null;
  withdrawalPlan?: AdaptiveWithdrawalPlan | null;
  costPerSessionUsd?: number;
  simulations?: number;
}): GrowthPlanProbabilityRange {
  const simulations = Math.max(200, Math.min(2_000, Math.floor(params.simulations ?? 600)));
  if (params.starting <= 0 || !params.sessions.length) {
    return {
      simulations,
      probabilityTargetPct: 0,
      probabilityCapitalHalfPct: 0,
      p10Balance: params.starting,
      medianBalance: params.starting,
      p90Balance: params.starting,
      medianMaxDrawdownPct: 0,
    };
  }

  const depositByDate = buildRecurringFlowByDate(params.sessions, params.depositPlan);
  const withdrawalByDate = buildRecurringFlowByDate(params.sessions, params.withdrawalPlan);
  const lossProbability = Math.max(0, Math.min(0.95, params.lossDaysPerWeek / params.daysPerWeek));
  const seed = params.sessions.length * 97 + Math.round(params.starting * 13) + Math.round(params.target * 7);
  const random = seededRandom(seed);
  const balances: number[] = [];
  const drawdowns: number[] = [];
  let targetHits = 0;
  let capitalHalfHits = 0;

  for (let simulation = 0; simulation < simulations; simulation += 1) {
    let balance = params.starting;
    let peak = balance;
    let maxDrawdownPct = 0;
    let hitTarget = balance >= params.target;
    let hitCapitalHalf = false;
    for (const dateIso of params.sessions) {
      const isLossDay = random() < lossProbability;
      const returnPct = isLossDay ? -params.lossDayPct : params.goalDayPct;
      balance = Math.max(0, balance * (1 + returnPct / 100));
      balance = Math.max(0, balance - Math.max(0, finite(params.costPerSessionUsd)));
      balance = Math.max(
        0,
        balance + (depositByDate.get(dateIso) ?? 0) - (withdrawalByDate.get(dateIso) ?? 0)
      );
      peak = Math.max(peak, balance);
      if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - balance) / peak) * 100);
      if (balance >= params.target) hitTarget = true;
      if (balance <= params.starting * 0.5) hitCapitalHalf = true;
    }
    if (hitTarget) targetHits += 1;
    if (hitCapitalHalf) capitalHalfHits += 1;
    balances.push(balance);
    drawdowns.push(maxDrawdownPct);
  }

  balances.sort((a, b) => a - b);
  drawdowns.sort((a, b) => a - b);
  return {
    simulations,
    probabilityTargetPct: Number(((targetHits / simulations) * 100).toFixed(1)),
    probabilityCapitalHalfPct: Number(((capitalHalfHits / simulations) * 100).toFixed(1)),
    p10Balance: Number(percentile(balances, 0.1).toFixed(2)),
    medianBalance: Number(percentile(balances, 0.5).toFixed(2)),
    p90Balance: Number(percentile(balances, 0.9).toFixed(2)),
    medianMaxDrawdownPct: Number(percentile(drawdowns, 0.5).toFixed(2)),
  };
}

function requiredUniformSessionPct(params: {
  starting: number;
  target: number;
  sessions: string[];
  depositPlan?: AdaptiveDepositPlan | null;
  withdrawalPlan?: AdaptiveWithdrawalPlan | null;
  costPerSessionUsd?: number;
}) {
  if (params.starting <= 0 || params.target <= params.starting || !params.sessions.length) return 0;
  const project = (goalDayPct: number) =>
    simulateOperatingPath({
      starting: params.starting,
      sessions: params.sessions,
      daysPerWeek: 1,
      lossDaysPerWeek: 0,
      goalDayPct,
      lossDayPct: 0,
      depositPlan: params.depositPlan,
      withdrawalPlan: params.withdrawalPlan,
      costPerSessionUsd: params.costPerSessionUsd,
    }).balance;
  if (project(0) >= params.target) return 0;

  let low = 0;
  let high = 1;
  while (high < 100 && project(high) < params.target) high *= 2;
  if (project(high) < params.target) return high;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (project(midpoint) >= params.target) high = midpoint;
    else low = midpoint;
  }
  return high;
}

function buildMilestones(rows: SimulatedSession[]): {
  weekly: AdaptivePlanMilestone[];
  monthly: AdaptivePlanMilestone[];
  quarterly: AdaptivePlanMilestone[];
  semiannual: AdaptivePlanMilestone[];
  annual: AdaptivePlanMilestone[];
} {
  if (!rows.length) return { weekly: [], monthly: [], quarterly: [], semiannual: [], annual: [] };
  const toMilestone = (
    group: SimulatedSession[],
    cadence: AdaptivePlanMilestone["cadence"],
    periodIndex: number
  ): AdaptivePlanMilestone => {
    const first = group[0];
    const last = group[group.length - 1];
    const change = last.endBalance - first.startBalance;
    const deposits = group.reduce((sum, row) => sum + row.depositUsd, 0);
    const withdrawals = group.reduce((sum, row) => sum + row.withdrawalUsd, 0);
    const tradingChange = change - deposits + withdrawals;
    return {
      cadence,
      periodIndex,
      startDate: first.date,
      targetDate: last.date,
      startBalance: first.startBalance,
      targetBalance: last.endBalance,
      plannedChangeUsd: Number(change.toFixed(2)),
      plannedReturnPct:
        first.startBalance > 0 ? Number(((tradingChange / first.startBalance) * 100).toFixed(3)) : 0,
      plannedTradingChangeUsd: Number(tradingChange.toFixed(2)),
      plannedDepositsUsd: Number(deposits.toFixed(2)),
      plannedWithdrawalsUsd: Number(withdrawals.toFixed(2)),
      sessionCount: group.length,
    };
  };

  const weekGroups = new Map<string, SimulatedSession[]>();
  const monthGroups = new Map<string, SimulatedSession[]>();
  for (const row of rows) {
    const weeklyKey = weekKey(row.date);
    const weeklyGroup = weekGroups.get(weeklyKey) ?? [];
    weeklyGroup.push(row);
    weekGroups.set(weeklyKey, weeklyGroup);

    const monthlyKey = row.date.slice(0, 7);
    const monthlyGroup = monthGroups.get(monthlyKey) ?? [];
    monthlyGroup.push(row);
    monthGroups.set(monthlyKey, monthlyGroup);
  }

  const weekly = Array.from(weekGroups.values()).map((group, index) =>
    toMilestone(group, "weekly", index + 1)
  );
  const monthly = Array.from(monthGroups.values()).map((group, index) =>
    toMilestone(group, "monthly", index + 1)
  );

  const aggregate = (size: number, cadence: "quarterly" | "semiannual" | "annual") => {
    const output: AdaptivePlanMilestone[] = [];
    for (let index = 0; index < monthly.length; index += size) {
      const group = monthly.slice(index, index + size);
      if (!group.length) continue;
      const first = group[0];
      const last = group[group.length - 1];
      const change = last.targetBalance - first.startBalance;
      const deposits = group.reduce((sum, item) => sum + item.plannedDepositsUsd, 0);
      const withdrawals = group.reduce((sum, item) => sum + item.plannedWithdrawalsUsd, 0);
      output.push({
        cadence,
        periodIndex: output.length + 1,
        startDate: first.startDate,
        targetDate: last.targetDate,
        startBalance: first.startBalance,
        targetBalance: last.targetBalance,
        plannedChangeUsd: Number(change.toFixed(2)),
        plannedReturnPct:
          first.startBalance > 0
            ? Number((((change - deposits + withdrawals) / first.startBalance) * 100).toFixed(3))
            : 0,
        plannedTradingChangeUsd: Number((change - deposits + withdrawals).toFixed(2)),
        plannedDepositsUsd: Number(deposits.toFixed(2)),
        plannedWithdrawalsUsd: Number(withdrawals.toFixed(2)),
        sessionCount: group.reduce((sum, item) => sum + item.sessionCount, 0),
      });
    }
    return output;
  };

  return {
    weekly,
    monthly,
    quarterly: aggregate(3, "quarterly"),
    semiannual: aggregate(6, "semiannual"),
    annual: aggregate(12, "annual"),
  };
}

function resolveEvidenceSessionReturnPct(
  evidence: GrowthPlanEvidence | null | undefined,
  starting: number
): number | null {
  if (!evidence || starting <= 0 || finite(evidence.totalSessions) <= 0) return null;
  const direct = evidence.avgNetPerSession;
  if (direct != null && Number.isFinite(Number(direct))) {
    return (Number(direct) / starting) * 100;
  }
  const expectancy = evidence.expectancy;
  if (expectancy != null && Number.isFinite(Number(expectancy))) {
    return (Number(expectancy) / starting) * 100;
  }
  const winRate = finite(evidence.winRate);
  const avgWin = finite(evidence.avgWin);
  const avgLoss = finite(evidence.avgLoss);
  if (winRate > 0 && winRate < 100 && avgWin > 0 && avgLoss !== 0) {
    const winProbability = winRate / 100;
    const expectedUsd = winProbability * avgWin - (1 - winProbability) * Math.abs(avgLoss);
    return (expectedUsd / starting) * 100;
  }
  if (evidence.netPnl != null && finite(evidence.totalSessions) > 0) {
    return (finite(evidence.netPnl) / finite(evidence.totalSessions) / starting) * 100;
  }
  return null;
}

export function buildAdaptiveGrowthPlan(input: {
  starting: number;
  target: number;
  startIso: string;
  requestedTargetIso: string;
  tradingInstrument: TradingInstrument;
  averageTradingDaysPerWeek: number;
  policy: GrowthPlanOperatingPolicy;
  selectedPlanId?: GrowthPlanSelectedPlanId;
  declaredGoalDayPct?: number | null;
  declaredExpectedLossDayPct?: number | null;
  evidence?: GrowthPlanEvidence | null;
  depositPlan?: AdaptiveDepositPlan | null;
  withdrawalPlan?: AdaptiveWithdrawalPlan | null;
  comparisonPolicies?: GrowthPlanOperatingPolicy[];
  estimatedCostPerSessionUsd?: number | null;
  estimatedTaxReservePct?: number | null;
  financialCapacity?: GrowthPlanFinancialCapacity | null;
  maxProjectionYears?: number;
}): AdaptiveGrowthPlan {
  const starting = Math.max(0, finite(input.starting));
  const target = Math.max(0, finite(input.target));
  const profile = getTradingCalendarProfile(input.tradingInstrument);
  const daysPerWeek = Math.max(
    1,
    Math.min(profile.sessionsPerWeek, Math.floor(finite(input.averageTradingDaysPerWeek, profile.sessionsPerWeek)))
  );
  const policy = input.policy;
  const selectedPlanId = input.selectedPlanId ?? policy.id;
  const manualPlanSelected = selectedPlanId === "manual";
  const estimatedCostPerSessionUsd = Math.max(0, finite(input.estimatedCostPerSessionUsd));
  const estimatedTaxReservePct = Math.max(0, Math.min(60, finite(input.estimatedTaxReservePct)));
  const declaredGoalDayPct = Math.max(
    0,
    finite(input.declaredGoalDayPct, policy.goalDayReturnPct)
  );
  const declaredExpectedLossDayPct = Math.max(
    0,
    finite(input.declaredExpectedLossDayPct, policy.expectedLossDayPct)
  );
  // A manual plan is modeled exactly as declared. Preset plans retain their
  // policy caps so changing a display input cannot silently accelerate them.
  const policyGoalDayPct = manualPlanSelected
    ? declaredGoalDayPct
    : Math.min(policy.goalDayReturnPct, declaredGoalDayPct || policy.goalDayReturnPct);
  const modeledExpectedLossDayPct = manualPlanSelected
    ? Math.min(policy.maxDailyLossPct, declaredExpectedLossDayPct)
    : Math.min(policy.maxDailyLossPct, policy.expectedLossDayPct);
  const declaredModeledLossDayPct = Math.min(
    policy.maxDailyLossPct,
    Math.max(0, declaredExpectedLossDayPct || policy.expectedLossDayPct)
  );
  const requestedSessions = committedSessions(
    listTradingSessionsBetween(input.startIso, input.requestedTargetIso, input.tradingInstrument),
    daysPerWeek
  );
  const oneYearSessions = committedSessions(
    listTradingSessionsBetween(
      input.startIso,
      addTradingRunway(input.startIso, 1, "years"),
      input.tradingInstrument
    ),
    daysPerWeek
  );
  const modeledAnnualCycles = oneYearSessions.length / daysPerWeek;
  const valid = starting > 0 && target > starting && requestedSessions.length > 0;
  const evidenceSessions = Math.max(0, Math.floor(finite(input.evidence?.totalSessions)));
  const depth = evidenceDepth(evidenceSessions);
  const profitFactor = input.evidence?.profitFactor == null ? null : finite(input.evidence.profitFactor);
  const evidenceNetReturnPerSessionPct = resolveEvidenceSessionReturnPct(input.evidence, starting);
  const positiveEdge =
    profitFactor == null && evidenceNetReturnPerSessionPct == null
      ? null
      : (profitFactor == null || profitFactor > 1) &&
        (evidenceNetReturnPerSessionPct == null || evidenceNetReturnPerSessionPct > 0);
  const evidenceWeight = depth === "established" ? 0.75 : depth === "developing" ? 0.5 : 0;
  const policyCycleFactor = cycleFactor({
    daysPerWeek,
    lossDaysPerWeek: policy.lossDaysPerWeek,
    goalDayPct: policyGoalDayPct,
    lossDayPct: modeledExpectedLossDayPct,
  });
  const policyNetSessionPct = equivalentSessionReturnPct(policyCycleFactor, daysPerWeek);
  const historicalDrawdownPct = Math.max(0, finite(input.evidence?.maxDrawdownPct));
  const drawdownAdjustment =
    historicalDrawdownPct > 20 ? 0.65 : historicalDrawdownPct > 10 ? 0.82 : 1;
  const drawdownAdjustedPolicyNetPct = policyNetSessionPct * drawdownAdjustment;
  const evidenceAdjustedNetPct =
    evidenceWeight > 0 && evidenceNetReturnPerSessionPct != null && evidenceNetReturnPerSessionPct > 0
      ? Math.min(drawdownAdjustedPolicyNetPct, evidenceNetReturnPerSessionPct * evidenceWeight)
      : drawdownAdjustedPolicyNetPct;
  const evidenceAdjustmentApplied = evidenceAdjustedNetPct + 1e-9 < policyNetSessionPct;
  const recommendedGoalDayPct =
    positiveEdge === false
      ? 0
      : evidenceAdjustmentApplied
        ? Math.min(
            policyGoalDayPct,
            goalDayPctForNetSession({
              netSessionPct: evidenceAdjustedNetPct,
              daysPerWeek,
              lossDaysPerWeek: policy.lossDaysPerWeek,
              lossDayPct: modeledExpectedLossDayPct,
            })
          )
        : policyGoalDayPct;
  const recommendedCycleFactor = cycleFactor({
    daysPerWeek,
    lossDaysPerWeek: policy.lossDaysPerWeek,
    goalDayPct: recommendedGoalDayPct,
    lossDayPct: modeledExpectedLossDayPct,
  });
  const modeledNetReturnPerSessionPct = equivalentSessionReturnPct(recommendedCycleFactor, daysPerWeek);
  const modeledAnnualReturnPct = annualizedReturnPct(recommendedCycleFactor, modeledAnnualCycles);
  const requestedRequiredAllSessionPct = valid
    ? requiredUniformSessionPct({
        starting,
        target,
        sessions: requestedSessions,
        depositPlan: input.depositPlan,
        withdrawalPlan: input.withdrawalPlan,
        costPerSessionUsd: estimatedCostPerSessionUsd,
      })
    : 0;
  const requestedRequiredGoalDayPct = valid
    ? requiredGoalDayPct({
        starting,
        target,
        sessions: requestedSessions,
        daysPerWeek,
        lossDaysPerWeek: policy.lossDaysPerWeek,
        lossDayPct: declaredModeledLossDayPct,
        depositPlan: input.depositPlan,
        withdrawalPlan: input.withdrawalPlan,
        costPerSessionUsd: estimatedCostPerSessionUsd,
      })
    : 0;
  const targetProjectionSimulation = simulateOperatingPath({
    starting,
    sessions: requestedSessions,
    daysPerWeek,
    lossDaysPerWeek: policy.lossDaysPerWeek,
    goalDayPct: Number.isFinite(requestedRequiredGoalDayPct) ? requestedRequiredGoalDayPct : 0,
    lossDayPct: declaredModeledLossDayPct,
    depositPlan: input.depositPlan,
    withdrawalPlan: input.withdrawalPlan,
    costPerSessionUsd: estimatedCostPerSessionUsd,
  });
  const targetProjectionCoveragePct = valid
    ? Math.min(100, (targetProjectionSimulation.balance / target) * 100)
    : 0;
  const targetProjectionTradingGrowthUsd = Number(
    (
      targetProjectionSimulation.balance -
      starting -
      targetProjectionSimulation.totalDeposits +
      targetProjectionSimulation.totalWithdrawals
    ).toFixed(2)
  );
  const requestedSimulation = simulateOperatingPath({
    starting,
    sessions: requestedSessions,
    daysPerWeek,
    lossDaysPerWeek: policy.lossDaysPerWeek,
    goalDayPct: recommendedGoalDayPct,
    lossDayPct: positiveEdge === false ? 0 : modeledExpectedLossDayPct,
    depositPlan: input.depositPlan,
    withdrawalPlan: input.withdrawalPlan,
    costPerSessionUsd: estimatedCostPerSessionUsd,
  });
  const requestedGrossSimulation = simulateOperatingPath({
    starting,
    sessions: requestedSessions,
    daysPerWeek,
    lossDaysPerWeek: policy.lossDaysPerWeek,
    goalDayPct: recommendedGoalDayPct,
    lossDayPct: positiveEdge === false ? 0 : modeledExpectedLossDayPct,
    depositPlan: input.depositPlan,
    withdrawalPlan: input.withdrawalPlan,
    costPerSessionUsd: 0,
  });
  const requestedCoveragePct = valid ? Math.min(100, (requestedSimulation.balance / target) * 100) : 0;
  const requestedGrossTradingGrowthUsd = Number(
    (
      requestedGrossSimulation.balance -
      starting -
      requestedGrossSimulation.totalDeposits +
      requestedGrossSimulation.totalWithdrawals
    ).toFixed(2)
  );
  const requestedTradingGrowthUsd = Number(
    (
      requestedSimulation.balance -
      starting -
      requestedSimulation.totalDeposits +
      requestedSimulation.totalWithdrawals
    ).toFixed(2)
  );
  const requestedEstimatedTaxReserveUsd = Number(
    (Math.max(0, requestedTradingGrowthUsd) * (estimatedTaxReservePct / 100)).toFixed(2)
  );
  const requestedAfterTaxReserveBalance = Number(
    Math.max(0, requestedSimulation.balance - requestedEstimatedTaxReserveUsd).toFixed(2)
  );
  const calendarDays = dateDistanceDays(input.startIso, input.requestedTargetIso);
  const targetAnnualizedReturnPct =
    valid && calendarDays > 0
      ? Number(((Math.pow(target / starting, 365.2425 / calendarDays) - 1) * 100).toFixed(2))
      : null;

  const projectionYears = Math.max(1, Math.min(50, Math.floor(finite(input.maxProjectionYears, 50))));
  const horizonEnd = addTradingRunway(input.startIso, projectionYears, "years");
  const horizonSessions = committedSessions(
    listTradingSessionsBetween(input.startIso, horizonEnd, input.tradingInstrument),
    daysPerWeek
  );
  const horizonSimulation = simulateOperatingPath({
    starting,
    sessions: horizonSessions,
    daysPerWeek,
    lossDaysPerWeek: positiveEdge === false ? 0 : policy.lossDaysPerWeek,
    goalDayPct: positiveEdge === false ? 0 : recommendedGoalDayPct,
    lossDayPct: positiveEdge === false ? 0 : modeledExpectedLossDayPct,
    target,
    depositPlan: input.depositPlan,
    withdrawalPlan: input.withdrawalPlan,
    costPerSessionUsd: estimatedCostPerSessionUsd,
  });
  const completionIndex = horizonSimulation.completionDate
    ? horizonSimulation.rows.findIndex((row) => row.date === horizonSimulation.completionDate)
    : -1;
  const recommendedTradingSessions = completionIndex >= 0 ? completionIndex + 1 : null;
  const recommendedCalendarMonths = horizonSimulation.completionDate
    ? Math.max(1, monthsBetweenDates(input.startIso, horizonSimulation.completionDate))
    : null;
  // Checkpoints represent the user's target compound path. The selected
  // operating scenario remains a separate baseline and may legitimately
  // finish below target or at zero after costs.
  const milestoneRows =
    valid && Number.isFinite(requestedRequiredGoalDayPct)
      ? targetProjectionSimulation.rows
      : completionIndex >= 0
        ? horizonSimulation.rows.slice(0, completionIndex + 1)
        : requestedSimulation.rows;
  const milestones = buildMilestones(milestoneRows);
  const panoramaPolicies = new Map<GrowthPlanScenarioId, GrowthPlanOperatingPolicy>();
  for (const comparisonPolicy of input.comparisonPolicies ?? [policy]) {
    panoramaPolicies.set(comparisonPolicy.id, comparisonPolicy);
  }
  panoramaPolicies.set(policy.id, policy);

  const buildPanorama = (params: {
    id: GrowthPlanPanorama["id"];
    goalDayPct: number;
    lossDayPct: number;
    lossDaysPerWeek: number;
  }): GrowthPlanPanorama => {
    const factor = cycleFactor({
      daysPerWeek,
      lossDaysPerWeek: params.lossDaysPerWeek,
      goalDayPct: params.goalDayPct,
      lossDayPct: params.lossDayPct,
    });
    const requested = simulateOperatingPath({
      starting,
      sessions: requestedSessions,
      daysPerWeek,
      lossDaysPerWeek: params.lossDaysPerWeek,
      goalDayPct: params.goalDayPct,
      lossDayPct: params.lossDayPct,
      depositPlan: input.depositPlan,
      withdrawalPlan: input.withdrawalPlan,
      costPerSessionUsd: estimatedCostPerSessionUsd,
    });
    const grossRequested = simulateOperatingPath({
      starting,
      sessions: requestedSessions,
      daysPerWeek,
      lossDaysPerWeek: params.lossDaysPerWeek,
      goalDayPct: params.goalDayPct,
      lossDayPct: params.lossDayPct,
      depositPlan: input.depositPlan,
      withdrawalPlan: input.withdrawalPlan,
      costPerSessionUsd: 0,
    });
    const tradingGrowth = requested.balance - starting - requested.totalDeposits + requested.totalWithdrawals;
    const taxReserve = Math.max(0, tradingGrowth) * (estimatedTaxReservePct / 100);
    const afterTaxReserveBalance = Math.max(0, requested.balance - taxReserve);
    const horizon = simulateOperatingPath({
      starting,
      sessions: horizonSessions,
      daysPerWeek,
      lossDaysPerWeek: params.lossDaysPerWeek,
      goalDayPct: params.goalDayPct,
      lossDayPct: params.lossDayPct,
      target,
      depositPlan: input.depositPlan,
      withdrawalPlan: input.withdrawalPlan,
      costPerSessionUsd: estimatedCostPerSessionUsd,
    });
    const annualized = annualizedReturnPct(factor, modeledAnnualCycles);
    return {
      id: params.id,
      goalDayReturnPct: Number(params.goalDayPct.toFixed(4)),
      expectedLossDayPct: Number(params.lossDayPct.toFixed(4)),
      modeledNetReturnPerSessionPct: Number(equivalentSessionReturnPct(factor, daysPerWeek).toFixed(4)),
      modeledAnnualReturnPct: annualized,
      grossProjectedBalance: grossRequested.balance,
      projectedBalance: requested.balance,
      costDragUsd: Number(Math.max(0, grossRequested.balance - requested.balance).toFixed(2)),
      afterTaxReserveBalance: Number(afterTaxReserveBalance.toFixed(2)),
      coveragePct: valid ? Number(Math.min(100, (requested.balance / target) * 100).toFixed(2)) : 0,
      completionDate: horizon.completionDate,
      reachesRequestedDeadline: Boolean(
        horizon.completionDate && horizon.completionDate <= input.requestedTargetIso
      ),
      riskBand: riskBandForAnnualizedReturn(annualized),
      probability: simulateProbabilityRange({
        starting,
        target,
        sessions: requestedSessions,
        daysPerWeek,
        lossDaysPerWeek: params.lossDaysPerWeek,
        goalDayPct: params.goalDayPct,
        lossDayPct: params.lossDayPct,
        depositPlan: input.depositPlan,
        withdrawalPlan: input.withdrawalPlan,
        costPerSessionUsd: estimatedCostPerSessionUsd,
        simulations: 400,
      }),
    };
  };

  const panoramas: GrowthPlanPanorama[] = [
    buildPanorama({
      id: "declared",
      goalDayPct: declaredGoalDayPct,
      lossDayPct: declaredModeledLossDayPct,
      lossDaysPerWeek: policy.lossDaysPerWeek,
    }),
    ...Array.from(panoramaPolicies.values()).map((comparisonPolicy) =>
      buildPanorama({
        id: comparisonPolicy.id,
        goalDayPct: comparisonPolicy.goalDayReturnPct,
        lossDayPct: Math.min(comparisonPolicy.maxDailyLossPct, comparisonPolicy.expectedLossDayPct),
        lossDaysPerWeek: Math.min(daysPerWeek - 1, comparisonPolicy.lossDaysPerWeek),
      })
    ),
  ];
  if (Number.isFinite(requestedRequiredGoalDayPct)) {
    panoramas.push(
      buildPanorama({
        id: "mathematical",
        goalDayPct: requestedRequiredGoalDayPct,
        lossDayPct: declaredModeledLossDayPct,
        lossDaysPerWeek: policy.lossDaysPerWeek,
      })
    );
  }
  const selectedPanoramaId: GrowthPlanPanorama["id"] =
    selectedPlanId === "manual" ? "declared" : selectedPlanId;
  const selectedPanorama = panoramas.find((item) => item.id === selectedPanoramaId) ?? panoramas[0];
  const statisticalAssessment: GrowthPlanStatisticalValidation["assessment"] = !valid
    ? "incomplete"
    : !selectedPanorama.reachesRequestedDeadline &&
        selectedPanorama.probability.probabilityTargetPct < 35
      ? "not_supported"
      : depth === "established" &&
          selectedPanorama.reachesRequestedDeadline &&
          selectedPanorama.probability.probabilityTargetPct >= 60
        ? "supported"
        : "conditional";
  const qualificationRequired = depth === "none" || depth === "limited" || positiveEdge !== true;
  const capacity = input.financialCapacity;
  const capacityFlags: string[] = [];
  const capacityComplete = Boolean(
    capacity?.capitalSource === "business_income" &&
      capacity?.accountStructure &&
      capacity?.maxLeverageMultiple != null
  );
  if (!capacityComplete) capacityFlags.push("business_capital_setup_incomplete");
  if (capacity?.accountStructure !== "cash" && finite(capacity?.maxLeverageMultiple, 1) > 2) {
    capacityFlags.push("leverage_above_two_times");
  }
  const capacityStatus: AdaptiveGrowthPlan["capacityStatus"] = !capacityComplete
    ? "incomplete"
    : capacityFlags.length
      ? "warning"
      : "protected";
  const flags: string[] = [];
  if (target / Math.max(1, starting) >= 10) flags.push("large_capital_multiple");
  if (requestedCoveragePct < 80) flags.push("requested_runway_materially_short");
  if (depth === "none" || depth === "limited") flags.push("insufficient_execution_sample");
  if (positiveEdge === false) flags.push("historical_edge_not_positive");
  if (finite(input.evidence?.maxDrawdownPct) > 20) flags.push("historical_drawdown_elevated");
  if (policy.riskPerTradePct > 1) flags.push("risk_per_trade_elevated");
  if (policy.maxDailyLossPct > 2) flags.push("daily_loss_guardrail_elevated");
  if (declaredGoalDayPct > policy.goalDayReturnPct + 1e-9) {
    flags.push("declared_goal_above_operating_policy");
  }
  if (declaredExpectedLossDayPct + 1e-9 < policy.expectedLossDayPct) {
    flags.push("declared_loss_assumption_below_operating_policy");
  }
  if (declaredExpectedLossDayPct > policy.expectedLossDayPct + 1e-9) {
    flags.push("declared_loss_assumption_above_operating_policy");
  }
  if (targetAnnualizedReturnPct != null && targetAnnualizedReturnPct > 100) {
    flags.push("target_requires_extreme_annualized_return");
  } else if (targetAnnualizedReturnPct != null && targetAnnualizedReturnPct > 60) {
    flags.push("target_requires_speculative_annualized_return");
  }
  if (modeledAnnualReturnPct > 100) {
    flags.push("selected_model_requires_extreme_annualized_return");
  } else if (modeledAnnualReturnPct > 60) {
    flags.push("selected_model_requires_speculative_annualized_return");
  }
  if (estimatedCostPerSessionUsd <= 0) flags.push("trading_costs_not_estimated");
  if (estimatedTaxReservePct <= 0) flags.push("tax_reserve_not_estimated");
  const costsConsumePercentageEdge =
    estimatedCostPerSessionUsd > 0 &&
    requestedGrossTradingGrowthUsd > 0 &&
    requestedTradingGrowthUsd <= 0;
  if (costsConsumePercentageEdge) flags.push("fixed_costs_overwhelm_positive_percentage_edge");
  if (!horizonSimulation.completionDate && positiveEdge !== false) flags.push("outside_50_year_model_horizon");
  if (evidenceAdjustmentApplied) flags.push("pace_reduced_to_execution_evidence");
  if (input.withdrawalPlan?.enabled && finite(input.withdrawalPlan.amount) > 0) {
    flags.push("planned_withdrawals_included");
  }
  if (input.depositPlan?.enabled && finite(input.depositPlan.amount) > 0) {
    flags.push("planned_deposits_included");
  }

  let verdict: AdaptivePlanVerdict = "supported";
  if (!valid) verdict = "incomplete";
  else if (positiveEdge === false) verdict = "no_validated_edge";
  else if (!horizonSimulation.completionDate || requestedCoveragePct < 80) verdict = "not_supported";
  else if (requestedCoveragePct < 98) verdict = "stretch";
  else if (depth === "none" || depth === "limited") verdict = "unvalidated";

  return {
    selectedPlanId,
    verdict,
    confidence: depth,
    isProvisional: depth === "none" || depth === "limited",
    requestedTargetDate: input.requestedTargetIso || null,
    requestedTradingSessions: requestedSessions.length,
    requestedRequiredAllSessionPct,
    requestedRequiredGoalDayPct: Number.isFinite(requestedRequiredGoalDayPct)
      ? Number(requestedRequiredGoalDayPct.toFixed(4))
      : 0,
    targetAnnualizedReturnPct,
    mathematicallyPossible: valid && Number.isFinite(requestedRequiredGoalDayPct),
    targetProjectionGoalDayPct: Number.isFinite(requestedRequiredGoalDayPct)
      ? Number(requestedRequiredGoalDayPct.toFixed(4))
      : 0,
    targetProjectionBalance: targetProjectionSimulation.balance,
    targetProjectionCoveragePct,
    targetProjectionTradingGrowthUsd,
    targetProjectionEstimatedCostsUsd: targetProjectionSimulation.totalCosts,
    requestedGrossProjectedBalance: requestedGrossSimulation.balance,
    requestedGrossTradingGrowthUsd,
    requestedCostDragUsd: Number(
      Math.max(0, requestedGrossSimulation.balance - requestedSimulation.balance).toFixed(2)
    ),
    costsConsumePercentageEdge,
    requestedProjectedBalance: requestedSimulation.balance,
    requestedAfterTaxReserveBalance,
    requestedCoveragePct,
    requestedShortfallUsd: valid ? Math.max(0, Number((target - requestedSimulation.balance).toFixed(2))) : 0,
    requestedDepositsUsd: requestedSimulation.totalDeposits,
    requestedWithdrawalsUsd: requestedSimulation.totalWithdrawals,
    requestedTradingGrowthUsd: Number(
      (
        requestedSimulation.balance -
        starting -
        requestedSimulation.totalDeposits +
        requestedSimulation.totalWithdrawals
      ).toFixed(2)
    ),
    requestedNetCashflowUsd: Number(
      (requestedSimulation.totalDeposits - requestedSimulation.totalWithdrawals).toFixed(2)
    ),
    requestedEstimatedCostsUsd: requestedSimulation.totalCosts,
    requestedEstimatedTaxReserveUsd,
    declaredGoalDayPct: Number(declaredGoalDayPct.toFixed(4)),
    declaredExpectedLossDayPct: Number(declaredExpectedLossDayPct.toFixed(4)),
    policyGoalDayCapPct: Number(policy.goalDayReturnPct.toFixed(4)),
    policyExpectedLossDayFloorPct: Number(policy.expectedLossDayPct.toFixed(4)),
    recommendedGoalDayPct: Number(recommendedGoalDayPct.toFixed(4)),
    expectedLossDayPct: Number(modeledExpectedLossDayPct.toFixed(4)),
    maxDailyLossGuardrailPct: Number(policy.maxDailyLossPct.toFixed(4)),
    riskPerTradePct: Number(policy.riskPerTradePct.toFixed(4)),
    lossDaysPerWeek: policy.lossDaysPerWeek,
    operatingDaysPerWeek: daysPerWeek,
    modeledNetReturnPerSessionPct: Number(modeledNetReturnPerSessionPct.toFixed(4)),
    modeledWeeklyReturnPct: Number(((recommendedCycleFactor - 1) * 100).toFixed(4)),
    modeledAnnualCycles: Number(modeledAnnualCycles.toFixed(2)),
    modeledAnnualReturnPct: Number(modeledAnnualReturnPct.toFixed(2)),
    recommendedCompletionDate: horizonSimulation.completionDate,
    recommendedTradingSessions,
    recommendedCalendarMonths,
    recommendedCalendarYears:
      recommendedCalendarMonths == null ? null : Number((recommendedCalendarMonths / 12).toFixed(1)),
    evidenceNetReturnPerSessionPct:
      evidenceNetReturnPerSessionPct == null ? null : Number(evidenceNetReturnPerSessionPct.toFixed(4)),
    evidenceAdjustmentApplied,
    qualificationRequired,
    qualificationMinimumSessions: depth === "established" ? 100 : depth === "developing" ? 100 : 30,
    nextMilestone: milestones.weekly[0] ?? milestones.monthly[0] ?? null,
    weeklyMilestones: milestones.weekly,
    monthlyMilestones: milestones.monthly,
    quarterlyMilestones: milestones.quarterly,
    semiannualMilestones: milestones.semiannual,
    annualMilestones: milestones.annual,
    panoramas,
    statisticalValidation: {
      selectedPlanId,
      assessment: statisticalAssessment,
      deterministicReachesTarget: selectedPanorama.reachesRequestedDeadline,
      deterministicProjectedBalance: selectedPanorama.projectedBalance,
      probability: selectedPanorama.probability,
    },
    capacityStatus,
    capacityFlags,
    flags,
  };
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
  const profitFactor =
    evidenceSessions <= 0 || evidence?.profitFactor == null
      ? null
      : finite(evidence.profitFactor);
  const expectancy =
    evidenceSessions <= 0 || evidence?.expectancy == null
      ? null
      : finite(evidence.expectancy);
  const avgNetPerSession =
    evidenceSessions <= 0 || evidence?.avgNetPerSession == null
      ? null
      : finite(evidence.avgNetPerSession);
  const evidenceSupportsPositiveEdge =
    profitFactor == null && expectancy == null && avgNetPerSession == null
      ? null
      : (profitFactor == null || profitFactor > 1) &&
        (expectancy == null || expectancy > 0) &&
        (avgNetPerSession == null || avgNetPerSession > 0);

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
