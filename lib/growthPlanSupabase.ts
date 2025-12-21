import { supabaseBrowser } from "@/lib/supaBaseClient";

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

export type GrowthPlanSteps = {
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
  };
};

export type GrowthPlan = {
  user_id: string;

  startingBalance: number;
  targetBalance: number;

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

  selectedPlan?: "suggested" | "chosen";
  version?: number;

  createdAt?: string;
  updatedAt?: string;
};

const TABLE = "growth_plans";
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

  return {
    user_id: userId,

    startingBalance: num(raw?.starting_balance ?? raw?.startingBalance, 0),
    targetBalance: num(raw?.target_balance ?? raw?.targetBalance, 0),

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
  return {
    user_id: plan.user_id,

    starting_balance: num(plan.startingBalance, 0),
    target_balance: num(plan.targetBalance, 0),

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

    version: plan.version ?? 2,
  };
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
    .maybeSingle();

  if (error) {
    console.error(LOG, "getGrowthPlanSupabase error", error);
    throw error;
  }
  if (!data) return null;

  return normalizePlan(data, userId);
}

/** Crea/actualiza (upsert) el Growth Plan del usuario */
export async function upsertGrowthPlanSupabase(plan: Partial<GrowthPlan>): Promise<GrowthPlan> {
  const userId = await getAuthedUserId();

  // Cargamos actual para merge suave
  const current = await getGrowthPlanSupabase();

  const merged: GrowthPlan = normalizePlan(
    {
      ...(current ? toDb(current) : {}),
      ...(plan ? toDb({ ...(current ?? ({} as any)), ...(plan as any), user_id: userId } as GrowthPlan) : {}),
      // Nota: normalizePlan soporta tanto campos db como app
    },
    userId
  );

  const payload = toDb(merged);

  const { data, error } = await supabaseBrowser
    .from(TABLE)
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    console.error(LOG, "upsertGrowthPlanSupabase error", error);
    throw error;
  }

  return normalizePlan(data, userId);
}

/** Borra el Growth Plan del usuario */
export async function deleteGrowthPlanSupabase(): Promise<void> {
  const userId = await getAuthedUserId();
  const { error } = await supabaseBrowser.from(TABLE).delete().eq("user_id", userId);
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
