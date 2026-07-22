import { supabaseBrowser } from "@/lib/supaBaseClient";
import {
  getTotalPlannedWithdrawalAmount,
  normalizePlannedWithdrawals,
  normalizeWithdrawalSettings,
  type PlannedWithdrawalEvent,
  type PlannedWithdrawalSettings,
} from "@/lib/growthPlanProjection";

export type GrowthPlanStepKey =
  | "prepare"
  | "analysis"
  | "strategy"
  | "execution_and_journal";

export type GrowthPlanRule = {
  id: string;
  label: string;
  description?: string;
  isSuggested?: boolean;
  isActive?: boolean;
};

export type GrowthPlanAnalysisStyle =
  | "technical"
  | "fundamental"
  | "options_flow"
  | "harmonic_patterns"
  | "price_action"
  | "market_profile"
  | "order_flow"
  | "other";

export type GrowthPlanStrategy = {
  name: string;
  setup?: string;
  entryRules?: string;
  exitRules?: string;
  managementRules?: string;
  invalidation?: string;
  instruments?: string[];
  timeframe?: string;
};

export type GrowthPlanChecklistItem = {
  id: string;
  text: string;
  isSuggested?: boolean;
  isActive?: boolean;
};

export type GrowthPlanExecutionSystem = {
  title?: string;
  doList?: GrowthPlanChecklistItem[];
  dontList?: GrowthPlanChecklistItem[];
  orderList?: GrowthPlanChecklistItem[];
  notes?: string;
};

export type GrowthPlanSteps = {
  business_analysis?: {
    profile?: Record<string, string>;
    selectedScenarioId?: string | null;
    selectedScenario?: Record<string, unknown> | null;
    scenarios?: Array<Record<string, unknown>>;
    realismReview?: Record<string, unknown>;
    averageTradingDaysPerWeek?: number;
    operatingModel?: Record<string, unknown>;
    aiPlanAdvisor?: Record<string, unknown>;
    updatedAt?: string;
  };
  prepare?: {
    title?: string;
    checklist?: GrowthPlanChecklistItem[];
    notes?: string;
  };
  analysis?: {
    title?: string;
    styles?: GrowthPlanAnalysisStyle[];
    otherStyleText?: string;
    notes?: string;
  };
  strategy?: {
    title?: string;
    strategies?: GrowthPlanStrategy[];
    notes?: string;
  };
  execution_and_journal?: {
    title?: string;
    requiredFields?: string[];
    notes?: string;
    system?: GrowthPlanExecutionSystem;
  };
};

export type GrowthPlan = {
  user_id: string;
  accountId?: string | null;

  startingBalance: number;
  targetBalance: number;
  targetDate?: string | null; // YYYY-MM-DD
  planStyle?: "conservative" | "balanced" | "aggressive" | null;
  planMode?: "auto" | "manual" | null;
  targetMultiple?: number | null;
  planStartDate?: string | null; // YYYY-MM-DD

  dailyTargetPct?: number;
  dailyGoalPercent?: number;

  maxDailyLossPercent: number;
  tradingDays: number;
  maxOnePercentLossDays?: number;
  lossDaysPerWeek?: number;

  maxRiskPerTradePercent?: number; // default 2
  maxRiskPerTradeUSD?: number | null;

  steps?: GrowthPlanSteps;
  rules?: GrowthPlanRule[];

  plannedWithdrawalSettings?: PlannedWithdrawalSettings | null;
  plannedWithdrawals?: PlannedWithdrawalEvent[];
  planPhases?: Array<{
    id: string;
    title?: string | null;
    targetEquity: number;
    targetDate?: string | null; // YYYY-MM-DD
    status?: "pending" | "completed";
    completedAt?: string | null;
    monthIndex?: number;
    weekIndex?: number;
    weeksInMonth?: number;
    monthGoal?: number;
    monthLabel?: string | null;
    monthStartBalance?: number;
    monthEndBalance?: number;
    monthWithdrawal?: number;
    cumulativeWithdrawals?: number;
  }>;

  resetCount?: number;
  lastResetAt?: string | null;

  selectedPlan?: "suggested" | "chosen";
  version?: number;

  createdAt?: string;
  updatedAt?: string;
};

export type GrowthPlanHistoryEntry = {
  id: string;
  userId: string;
  accountId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  resetReason?: string | null;
  snapshot: Record<string, unknown>;
  createdAt?: string | null;
};

type GrowthPlanHistoryOptions = {
  recordHistory?: boolean;
  historyReason?: string;
};

const TABLE = "growth_plans";
const HISTORY_TABLE = "growth_plan_history";
const LOG = "[growthPlanSupabase]";

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampText(s: any, max = 220) {
  const t = (s ?? "").toString();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

/** Defaults sugeridos por Neuro Tarder */
export function getDefaultSuggestedRules(): GrowthPlanRule[] {
  return [
    {
      id: "suggested-risk-2pct",
      label: "Máximo 2% de riesgo por trade",
      description:
        "Si tu riesgo por trade es 2% de tu balance, considera opciones/contratos más económicos o reduce size para mantener el plan.",
      isSuggested: true,
      isActive: true,
    },
    {
      id: "suggested-max-daily-loss",
      label: "Respeta tu Max Daily Loss",
      description: "Si alcanzas tu pérdida diaria máxima, termina el día.",
      isSuggested: true,
      isActive: true,
    },
    {
      id: "suggested-process",
      label: "Proceso > Resultado",
      description: "Evalúa disciplina y ejecución del plan, no solo P&L.",
      isSuggested: true,
      isActive: true,
    },
  ];
}

export function getDefaultPrepareChecklist(): GrowthPlanChecklistItem[] {
  return [
    { id: "prep-news", text: "Revisar calendario económico / noticias", isSuggested: true, isActive: true },
    { id: "prep-levels", text: "Marcar niveles clave (HTF/prev day)", isSuggested: true, isActive: true },
    { id: "prep-risk", text: "Definir riesgo por trade y size antes de entrar", isSuggested: true, isActive: true },
    { id: "prep-state", text: "Check-in emocional (ansiedad/impulsividad)", isSuggested: true, isActive: true },
  ];
}

export function getDefaultExecutionSystem(): GrowthPlanExecutionSystem {
  return {
    title: "",
    doList: [],
    dontList: [],
    orderList: [],
    notes: "",
  };
}

export function getDefaultSteps(): GrowthPlanSteps {
  return {
    prepare: {
      title: "Prepare Antes de Comenzar a Tradiar",
      checklist: getDefaultPrepareChecklist(),
      notes: "",
    },
    analysis: {
      title: "¿En qué se basa su análisis?",
      styles: [],
      otherStyleText: "",
      notes: "",
    },
    strategy: {
      title: "Estrategia: entrada, salida y manejo",
      strategies: [],
      notes: "",
    },
    execution_and_journal: {
      title: "Registrar transacciones y emociones",
      requiredFields: ["import_trades", "emotions", "journal_notes"],
      notes: "",
      system: getDefaultExecutionSystem(),
    },
  };
}

function normalizePlan(raw: any, userId: string): GrowthPlan {
  const dailyPct = num(raw?.daily_target_pct ?? raw?.daily_goal_percent ?? raw?.dailyTargetPct ?? raw?.dailyGoalPercent, 0);

  const steps: GrowthPlanSteps =
    (raw?.steps && typeof raw.steps === "object" ? raw.steps : null) ?? getDefaultSteps();

  const rules: GrowthPlanRule[] =
    Array.isArray(raw?.rules) && raw.rules.length > 0 ? raw.rules : getDefaultSuggestedRules();

  // Asegurar títulos si vienen vacíos
  steps.prepare = steps.prepare ?? {};
  steps.analysis = steps.analysis ?? {};
  steps.strategy = steps.strategy ?? {};
  steps.execution_and_journal = steps.execution_and_journal ?? {};

  steps.prepare.title = steps.prepare.title || "Prepare Antes de Comenzar a Tradiar";
  steps.analysis.title = steps.analysis.title || "¿En qué se basa su análisis?";
  steps.strategy.title = steps.strategy.title || "Estrategia: entrada, salida y manejo";
  steps.execution_and_journal.title = steps.execution_and_journal.title || "Registrar transacciones y emociones";

  if (!Array.isArray(steps.prepare.checklist)) steps.prepare.checklist = getDefaultPrepareChecklist();
  if (!Array.isArray(steps.analysis.styles)) steps.analysis.styles = [];
  if (!Array.isArray(steps.strategy.strategies)) steps.strategy.strategies = [];
  if (!Array.isArray(steps.execution_and_journal.requiredFields)) {
    steps.execution_and_journal.requiredFields = ["import_trades", "emotions", "journal_notes"];
  }
  if (!steps.execution_and_journal.system || typeof steps.execution_and_journal.system !== "object") {
    steps.execution_and_journal.system = getDefaultExecutionSystem();
  }
  if (!Array.isArray(steps.execution_and_journal.system.doList)) steps.execution_and_journal.system.doList = [];
  if (!Array.isArray(steps.execution_and_journal.system.dontList)) steps.execution_and_journal.system.dontList = [];
  if (!Array.isArray(steps.execution_and_journal.system.orderList)) steps.execution_and_journal.system.orderList = [];

  return {
    user_id: userId,
    accountId: raw?.account_id ?? null,

    startingBalance: num(raw?.starting_balance ?? raw?.startingBalance, 0),
    targetBalance: num(raw?.target_balance ?? raw?.targetBalance, 0),
    targetDate: raw?.target_date ?? raw?.targetDate ?? null,
    planStyle: raw?.plan_style ?? raw?.planStyle ?? null,
    planMode:
      raw?.plan_mode === "auto" || raw?.plan_mode === "manual"
        ? raw.plan_mode
        : raw?.planMode === "auto" || raw?.planMode === "manual"
          ? raw.planMode
          : null,
    targetMultiple:
      raw?.target_multiple != null
        ? num(raw?.target_multiple, 0)
        : null,
    planStartDate: raw?.plan_start_date ?? raw?.planStartDate ?? null,

    dailyTargetPct: dailyPct,
    dailyGoalPercent: dailyPct, // alias

    maxDailyLossPercent: num(raw?.max_daily_loss_percent ?? raw?.maxDailyLossPercent, 0),
    tradingDays: Math.max(0, Math.floor(num(raw?.trading_days ?? raw?.tradingDays, 0))),
    maxOnePercentLossDays: raw?.max_one_percent_loss_days ?? raw?.maxOnePercentLossDays ?? 0,
    lossDaysPerWeek: raw?.loss_days_per_week ?? raw?.lossDaysPerWeek ?? 0,

    maxRiskPerTradePercent: num(raw?.max_risk_per_trade_percent ?? raw?.maxRiskPerTradePercent, 2),
    maxRiskPerTradeUSD:
      raw?.max_risk_per_trade_usd ?? raw?.maxRiskPerTradeUSD ?? null,

    steps,
    rules,

    plannedWithdrawals: Array.isArray(raw?.planned_withdrawals)
      ? normalizePlannedWithdrawals(raw.planned_withdrawals)
      : Array.isArray(raw?.plannedWithdrawals)
        ? normalizePlannedWithdrawals(raw.plannedWithdrawals)
        : [],
    plannedWithdrawalSettings:
      normalizeWithdrawalSettings(raw?.planned_withdrawal_settings ?? raw?.plannedWithdrawalSettings) ?? null,
    planPhases: Array.isArray(raw?.plan_phases)
      ? raw.plan_phases
      : Array.isArray(raw?.planPhases)
        ? raw.planPhases
        : [],

    resetCount: num(raw?.reset_count ?? raw?.resetCount ?? 0, 0),
    lastResetAt: raw?.last_reset_at ?? raw?.lastResetAt ?? null,

    selectedPlan:
      raw?.selected_plan === "suggested" || raw?.selected_plan === "chosen"
        ? raw.selected_plan
        : raw?.selectedPlan,

    version: num(raw?.version, 2),
    createdAt: raw?.created_at ?? raw?.createdAt,
    updatedAt: raw?.updated_at ?? raw?.updatedAt,
  };
}

function toDb(plan: GrowthPlan) {
  const targetMultiple =
    plan.targetMultiple != null
      ? plan.targetMultiple
      : plan.startingBalance > 0 && plan.targetBalance > 0
        ? plan.targetBalance / plan.startingBalance
        : null;
  return {
    user_id: plan.user_id,
    account_id: plan.accountId ?? null,

    starting_balance: num(plan.startingBalance, 0),
    target_balance: num(plan.targetBalance, 0),
    target_date: plan.targetDate ?? null,
    plan_style: plan.planStyle ?? null,
    plan_mode:
      plan.planMode === "auto" || plan.planMode === "manual"
        ? plan.planMode
        : null,
    target_multiple: targetMultiple,
    plan_start_date: plan.planStartDate ?? null,
    planned_withdrawal_settings: plan.plannedWithdrawalSettings ?? null,
    planned_withdrawals: plan.plannedWithdrawals ?? [],
    plan_phases: plan.planPhases ?? [],

    daily_target_pct: plan.dailyTargetPct ?? plan.dailyGoalPercent ?? null,
    daily_goal_percent: plan.dailyGoalPercent ?? plan.dailyTargetPct ?? null,

    max_daily_loss_percent: num(plan.maxDailyLossPercent, 0),
    trading_days: Math.max(0, Math.floor(num(plan.tradingDays, 0))),
    max_one_percent_loss_days:
      plan.maxOnePercentLossDays == null ? null : Math.max(0, Math.floor(num(plan.maxOnePercentLossDays, 0))),
    loss_days_per_week:
      plan.lossDaysPerWeek == null ? null : Math.max(0, Math.floor(num(plan.lossDaysPerWeek, 0))),

    max_risk_per_trade_percent:
      plan.maxRiskPerTradePercent == null ? null : num(plan.maxRiskPerTradePercent, 2),
    max_risk_per_trade_usd:
      plan.maxRiskPerTradeUSD == null ? null : num(plan.maxRiskPerTradeUSD, 0),

    steps: plan.steps ?? getDefaultSteps(),
    rules: plan.rules ?? getDefaultSuggestedRules(),
    selected_plan: plan.selectedPlan ?? null,

    reset_count: plan.resetCount ?? 0,
    last_reset_at: plan.lastResetAt ?? null,

    version: plan.version ?? 2,
  };
}

function selectedScenarioId(plan: GrowthPlan | null | undefined) {
  return String((plan?.steps as any)?.business_analysis?.selectedScenarioId ?? "");
}

function averageTradingDaysPerWeek(plan: GrowthPlan | null | undefined) {
  const raw =
    (plan?.steps as any)?.business_analysis?.averageTradingDaysPerWeek ??
    (plan?.steps as any)?.business_analysis?.operatingModel?.averageTradingDaysPerWeek;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(1, Math.min(5, Math.floor(n))) : 5;
}

function plannedWithdrawalSummary(plan: GrowthPlan | null | undefined) {
  const withdrawals = normalizePlannedWithdrawals(plan?.plannedWithdrawals ?? []);
  return {
    count: withdrawals.length,
    total: withdrawals.reduce((sum, item) => sum + Math.max(0, Number(item.amount ?? 0)), 0),
  };
}

function historySnapshot(plan: GrowthPlan) {
  return {
    startingBalance: plan.startingBalance,
    targetBalance: plan.targetBalance,
    planStartDate: plan.planStartDate ?? null,
    targetDate: plan.targetDate ?? null,
    tradingDays: plan.tradingDays,
    averageTradingDaysPerWeek: averageTradingDaysPerWeek(plan),
    lossDaysPerWeek: plan.lossDaysPerWeek ?? 0,
    maxDailyLossPercent: plan.maxDailyLossPercent,
    maxRiskPerTradePercent: plan.maxRiskPerTradePercent ?? null,
    dailyGoalPercent: plan.dailyGoalPercent ?? plan.dailyTargetPct ?? null,
    selectedScenarioId: selectedScenarioId(plan) || null,
    plannedWithdrawals: plannedWithdrawalSummary(plan),
    updatedAt: plan.updatedAt ?? null,
  };
}

function valuesDiffer(a: unknown, b: unknown) {
  if (typeof a === "number" || typeof b === "number") {
    const an = Number(a);
    const bn = Number(b);
    if (!Number.isFinite(an) || !Number.isFinite(bn)) return String(a ?? "") !== String(b ?? "");
    return Math.abs(an - bn) > 0.0001;
  }
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

function summarizePlanChanges(before: GrowthPlan | null, after: GrowthPlan) {
  if (!before) {
    return [
      {
        field: "plan_created",
        label: "Plan created",
        before: null,
        after: historySnapshot(after),
      },
    ];
  }

  const beforeSnapshot = historySnapshot(before);
  const afterSnapshot = historySnapshot(after);
  const labels: Record<string, string> = {
    startingBalance: "Starting balance",
    targetBalance: "Target balance",
    planStartDate: "Start date",
    targetDate: "Target date",
    tradingDays: "Committed trading days",
    averageTradingDaysPerWeek: "Average trading days/week",
    lossDaysPerWeek: "Loss days/week",
    maxDailyLossPercent: "Max daily loss",
    maxRiskPerTradePercent: "Risk per trade",
    dailyGoalPercent: "Required goal-day %",
    selectedScenarioId: "Operating scenario",
    plannedWithdrawals: "Planned withdrawals",
  };

  return Object.keys(labels)
    .filter((field) => valuesDiffer((beforeSnapshot as any)[field], (afterSnapshot as any)[field]))
    .map((field) => ({
      field,
      label: labels[field],
      before: (beforeSnapshot as any)[field] ?? null,
      after: (afterSnapshot as any)[field] ?? null,
    }));
}

function normalizeHistoryRow(row: any): GrowthPlanHistoryEntry {
  return {
    id: String(row?.id ?? ""),
    userId: String(row?.user_id ?? row?.userId ?? ""),
    accountId: row?.account_id ?? row?.accountId ?? null,
    startedAt: row?.started_at ?? row?.startedAt ?? null,
    endedAt: row?.ended_at ?? row?.endedAt ?? null,
    resetReason: row?.reset_reason ?? row?.resetReason ?? null,
    snapshot:
      row?.snapshot && typeof row.snapshot === "object"
        ? (row.snapshot as Record<string, unknown>)
        : {},
    createdAt: row?.created_at ?? row?.createdAt ?? null,
  };
}

async function recordGrowthPlanHistory(params: {
  userId: string;
  accountId?: string | null;
  before: GrowthPlan | null;
  after: GrowthPlan;
  reason?: string;
}) {
  const changes = summarizePlanChanges(params.before, params.after);
  if (!changes.length) return;

  const snapshot = {
    reason: params.reason ?? (params.before ? "plan_updated" : "plan_created"),
    changedFields: changes.map((change) => change.label),
    changes,
    before: params.before ? historySnapshot(params.before) : null,
    after: historySnapshot(params.after),
  };

  const { error } = await supabaseBrowser.from(HISTORY_TABLE).insert({
    user_id: params.userId,
    account_id: params.accountId ?? null,
    started_at: params.after.planStartDate ?? params.before?.planStartDate ?? null,
    ended_at: params.after.targetDate ?? params.before?.targetDate ?? null,
    reset_reason: String(params.reason ?? (params.before ? "plan_updated" : "plan_created")),
    snapshot,
  });

  if (error) {
    console.warn(LOG, "recordGrowthPlanHistory warning", error);
  }
}

export function computeAdjustedTarget(plan: GrowthPlan | null, cashflowNet: number) {
  if (!plan) return 0;
  const baseTarget = num(plan.targetBalance, 0);
  const plannedWithdrawals = getTotalPlannedWithdrawalAmount(plan.plannedWithdrawals ?? []);
  return Math.max(0, Number((baseTarget + plannedWithdrawals).toFixed(2)));
}

/** Obtiene user id actual (requiere sesión activa) */
export async function getAuthedUserId(): Promise<string> {
  const { data, error } = await supabaseBrowser.auth.getUser();
  if (error || !data?.user?.id) {
    console.error(LOG, "auth.getUser error", error);
    throw new Error("Not authenticated");
  }
  return data.user.id;
}

/** Lee el Growth Plan del usuario */
export async function getGrowthPlanSupabase(): Promise<GrowthPlan | null> {
  const userId = await getAuthedUserId();

  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(LOG, "getGrowthPlanSupabase error", error);
    throw error;
  }
  if (!data) return null;

  return normalizePlan(data, userId);
}

/** Lee el Growth Plan del usuario por cuenta */
export async function getGrowthPlanSupabaseByAccount(accountId?: string | null): Promise<GrowthPlan | null> {
  const userId = await getAuthedUserId();
  if (!accountId) return getGrowthPlanSupabase();

  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    console.error(LOG, "getGrowthPlanSupabaseByAccount error", error);
    throw error;
  }
  if (!data) return null;

  return normalizePlan(data, userId);
}

/** Crea/actualiza (upsert) el Growth Plan del usuario */
export async function upsertGrowthPlanSupabase(
  plan: Partial<GrowthPlan>,
  accountId?: string | null,
  options?: GrowthPlanHistoryOptions
): Promise<GrowthPlan> {
  const userId = await getAuthedUserId();
  const resolvedAccountId = accountId ?? plan.accountId ?? null;
  if (!resolvedAccountId) throw new Error("Missing accountId for growth plan");

  // Cargamos actual para merge suave
  const current = await getGrowthPlanSupabaseByAccount(resolvedAccountId);

  const merged: GrowthPlan = normalizePlan(
    {
      ...(current ? toDb(current) : {}),
      ...(plan
        ? toDb({
            ...(current ?? ({} as any)),
            ...(plan as any),
            user_id: userId,
            accountId: resolvedAccountId,
          } as GrowthPlan)
        : {}),
      // Nota: normalizePlan soporta tanto campos db como app
    },
    userId
  );

  const payload = toDb(merged);

  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .upsert(payload, { onConflict: "user_id,account_id" })
    .select("*")
    .single();

  if (error) {
    console.error(LOG, "upsertGrowthPlanSupabase error", {
      message: (error as any)?.message,
      details: (error as any)?.details,
      hint: (error as any)?.hint,
      code: (error as any)?.code,
    });
    const msg = [
      (error as any)?.message,
      (error as any)?.details,
      (error as any)?.hint,
      (error as any)?.code,
    ]
      .filter(Boolean)
      .join(" | ");
    throw new Error(msg || "Growth plan upsert failed");
  }

  const saved = normalizePlan(data, userId);

  if (options?.recordHistory) {
    await recordGrowthPlanHistory({
      userId,
      accountId: resolvedAccountId,
      before: current,
      after: saved,
      reason: options.historyReason,
    });
  }

  return saved;
}

export async function getGrowthPlanHistorySupabase(
  accountId?: string | null,
  limit = 12
): Promise<GrowthPlanHistoryEntry[]> {
  const userId = await getAuthedUserId();
  let query = supabaseBrowser
    .from(HISTORY_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;
  if (error) {
    console.warn(LOG, "getGrowthPlanHistorySupabase warning", error);
    return [];
  }

  return (data ?? []).map(normalizeHistoryRow);
}

/** Borra el Growth Plan del usuario */
export async function deleteGrowthPlanSupabase(accountId?: string | null): Promise<void> {
  const userId = await getAuthedUserId();
  if (!accountId) throw new Error("Missing accountId for growth plan");
  const { error } = await supabaseBrowser.from(TABLE).delete().eq("user_id", userId).eq("account_id", accountId);
  if (error) {
    console.error(LOG, "deleteGrowthPlanSupabase error", error);
    throw error;
  }
}

/** Helper: riesgo sugerido en $ basado en balance y % */
export function calcRiskUsd(balance: number, riskPct: number) {
  const b = num(balance, 0);
  const p = num(riskPct, 0);
  if (b <= 0 || p <= 0) return 0;
  return (b * p) / 100;
}

/** Helper: sugerencia textual para Neuro (no llama OpenAI; solo prepara insight) */
export function buildRiskSuggestion(balance: number, riskPct: number) {
  const usd = calcRiskUsd(balance, riskPct);
  return clampText(
    `Con balance $${balance.toFixed(2)} y riesgo ${riskPct.toFixed(2)}%, tu riesgo máximo sugerido por trade es ~$${usd.toFixed(2)}.`
  );
}
