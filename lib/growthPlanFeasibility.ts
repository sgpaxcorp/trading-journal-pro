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
  cadence: "monthly" | "quarterly" | "annual";
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

export type AdaptiveGrowthPlan = {
  verdict: AdaptivePlanVerdict;
  confidence: GrowthPlanEvidenceDepth;
  isProvisional: boolean;
  requestedTargetDate: string | null;
  requestedTradingSessions: number;
  requestedRequiredAllSessionPct: number;
  requestedProjectedBalance: number;
  requestedCoveragePct: number;
  requestedShortfallUsd: number;
  requestedDepositsUsd: number;
  requestedWithdrawalsUsd: number;
  requestedTradingGrowthUsd: number;
  requestedNetCashflowUsd: number;
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
  monthlyMilestones: AdaptivePlanMilestone[];
  quarterlyMilestones: AdaptivePlanMilestone[];
  annualMilestones: AdaptivePlanMilestone[];
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
}) {
  const lossDays = Math.max(0, Math.min(params.daysPerWeek - 1, Math.floor(params.lossDaysPerWeek)));
  const rows: SimulatedSession[] = [];
  let balance = params.starting;
  let completionDate: string | null = balance >= (params.target ?? Number.POSITIVE_INFINITY) ? params.sessions[0] ?? null : null;
  const depositByDate = buildRecurringFlowByDate(params.sessions, params.depositPlan);
  const withdrawalByDate = buildRecurringFlowByDate(params.sessions, params.withdrawalPlan);
  let totalDeposits = 0;
  let totalWithdrawals = 0;

  for (let index = 0; index < params.sessions.length; index += 1) {
    const startBalance = balance;
    const isLossDay = lossDays > 0 && index % params.daysPerWeek < lossDays;
    const pct = isLossDay ? -params.lossDayPct : params.goalDayPct;
    balance = Math.max(0, balance * (1 + pct / 100));
    const depositUsd = depositByDate.get(params.sessions[index]) ?? 0;
    const withdrawalUsd = withdrawalByDate.get(params.sessions[index]) ?? 0;
    balance = Math.max(0, balance + depositUsd - withdrawalUsd);
    totalDeposits += depositUsd;
    totalWithdrawals += withdrawalUsd;
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
  };
}

function requiredUniformSessionPct(params: {
  starting: number;
  target: number;
  sessions: string[];
  depositPlan?: AdaptiveDepositPlan | null;
  withdrawalPlan?: AdaptiveWithdrawalPlan | null;
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
  monthly: AdaptivePlanMilestone[];
  quarterly: AdaptivePlanMilestone[];
  annual: AdaptivePlanMilestone[];
} {
  if (!rows.length) return { monthly: [], quarterly: [], annual: [] };
  const monthGroups = new Map<string, SimulatedSession[]>();
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    const group = monthGroups.get(key) ?? [];
    group.push(row);
    monthGroups.set(key, group);
  }

  const monthly = Array.from(monthGroups.values()).map((group, index) => {
    const first = group[0];
    const last = group[group.length - 1];
    const change = last.endBalance - first.startBalance;
    const deposits = group.reduce((sum, row) => sum + row.depositUsd, 0);
    const withdrawals = group.reduce((sum, row) => sum + row.withdrawalUsd, 0);
    const tradingChange = change - deposits + withdrawals;
    return {
      cadence: "monthly" as const,
      periodIndex: index + 1,
      startDate: first.date,
      targetDate: last.date,
      startBalance: first.startBalance,
      targetBalance: last.endBalance,
      plannedChangeUsd: Number(change.toFixed(2)),
      plannedReturnPct: first.startBalance > 0 ? Number(((tradingChange / first.startBalance) * 100).toFixed(3)) : 0,
      plannedTradingChangeUsd: Number(tradingChange.toFixed(2)),
      plannedDepositsUsd: Number(deposits.toFixed(2)),
      plannedWithdrawalsUsd: Number(withdrawals.toFixed(2)),
      sessionCount: group.length,
    };
  });

  const aggregate = (size: number, cadence: "quarterly" | "annual") => {
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

  return { monthly, quarterly: aggregate(3, "quarterly"), annual: aggregate(12, "annual") };
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
  declaredGoalDayPct?: number | null;
  declaredExpectedLossDayPct?: number | null;
  evidence?: GrowthPlanEvidence | null;
  depositPlan?: AdaptiveDepositPlan | null;
  withdrawalPlan?: AdaptiveWithdrawalPlan | null;
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
  const declaredGoalDayPct = Math.max(
    0,
    finite(input.declaredGoalDayPct, policy.goalDayReturnPct)
  );
  const declaredExpectedLossDayPct = Math.max(
    0,
    finite(input.declaredExpectedLossDayPct, policy.expectedLossDayPct)
  );
  // User inputs are evaluated, but they cannot raise the model above the
  // profile-based operating policy or improve the loss assumption without evidence.
  const policyGoalDayPct = Math.min(policy.goalDayReturnPct, declaredGoalDayPct || policy.goalDayReturnPct);
  const modeledExpectedLossDayPct = Math.min(
    policy.maxDailyLossPct,
    Math.max(policy.expectedLossDayPct, declaredExpectedLossDayPct || policy.expectedLossDayPct)
  );
  const requestedSessions = committedSessions(
    listTradingSessionsBetween(input.startIso, input.requestedTargetIso, input.tradingInstrument),
    daysPerWeek
  );
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
  const modeledAnnualReturnPct = (Math.pow(recommendedCycleFactor, 52) - 1) * 100;
  const requestedRequiredAllSessionPct = valid
    ? requiredUniformSessionPct({
        starting,
        target,
        sessions: requestedSessions,
        depositPlan: input.depositPlan,
        withdrawalPlan: input.withdrawalPlan,
      })
    : 0;
  const requestedSimulation = simulateOperatingPath({
    starting,
    sessions: requestedSessions,
    daysPerWeek,
    lossDaysPerWeek: policy.lossDaysPerWeek,
    goalDayPct: recommendedGoalDayPct,
    lossDayPct: positiveEdge === false ? 0 : modeledExpectedLossDayPct,
    depositPlan: input.depositPlan,
    withdrawalPlan: input.withdrawalPlan,
  });
  const requestedCoveragePct = valid ? Math.min(100, (requestedSimulation.balance / target) * 100) : 0;

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
  });
  const completionIndex = horizonSimulation.completionDate
    ? horizonSimulation.rows.findIndex((row) => row.date === horizonSimulation.completionDate)
    : -1;
  const recommendedTradingSessions = completionIndex >= 0 ? completionIndex + 1 : null;
  const recommendedCalendarMonths = horizonSimulation.completionDate
    ? Math.max(1, monthsBetweenDates(input.startIso, horizonSimulation.completionDate))
    : null;
  const milestones = buildMilestones(horizonSimulation.rows);
  const qualificationRequired = depth === "none" || depth === "limited" || positiveEdge !== true;
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
    verdict,
    confidence: depth,
    isProvisional: depth === "none" || depth === "limited",
    requestedTargetDate: input.requestedTargetIso || null,
    requestedTradingSessions: requestedSessions.length,
    requestedRequiredAllSessionPct,
    requestedProjectedBalance: requestedSimulation.balance,
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
    nextMilestone: milestones.monthly[0] ?? null,
    monthlyMilestones: milestones.monthly,
    quarterlyMilestones: milestones.quarterly,
    annualMilestones: milestones.annual,
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
