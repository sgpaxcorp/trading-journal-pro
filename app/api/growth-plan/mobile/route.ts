import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  buildPlanProjection,
  normalizeDepositSettings,
  normalizeWithdrawalSettings,
  type PlannedDepositSettings,
  type PlannedWithdrawalSettings,
  type WithdrawalFrequency,
} from "@/lib/growthPlanProjection";
import {
  buildAdaptiveGrowthPlan,
  getGrowthPlanOperatingPolicy,
  type GrowthPlanScenarioId,
} from "@/lib/growthPlanFeasibility";
import {
  addTradingRunway,
  computeTradingSessionsBetween,
  getTradingCalendarProfile,
  inferTradingRunway,
  normalizeTradingInstrument,
  normalizeTradingRunwayUnit,
} from "@/lib/tradingCalendar";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DO_RULES = [
  "Confirm plan permission before the first trade.",
  "Define risk before entry.",
  "Journal the trade before the next session.",
];
const DEFAULT_DONT_RULES = [
  "Do not trade after max daily loss.",
  "Do not increase size to recover a loss.",
  "Do not enter without a defined exit.",
];
const DEFAULT_ORDER_RULES = [
  "Premarket levels marked.",
  "Risk and invalidation defined.",
  "Entry, management, and exit recorded.",
];
const IGNORABLE_DB_CODES = new Set(["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"]);

type GrowthPlanRow = Record<string, any>;

function num(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = num(value, fallback);
  return Math.min(max, Math.max(min, n));
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  return Math.floor(clampNumber(value, min, max, fallback));
}

function cleanText(value: unknown, max = 280) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanDate(value: unknown) {
  const raw = String(value ?? "").slice(0, 10);
  return DATE_RE.test(raw) ? raw : "";
}

function normalizeFlowFrequency(value: unknown, fallback: WithdrawalFrequency = "monthly") {
  const raw = String(value ?? "").toLowerCase();
  return raw === "quarterly" || raw === "semiannual" || raw === "monthly"
    ? (raw as WithdrawalFrequency)
    : fallback;
}

function resolveCapitalFlowSettings(params: {
  mode: unknown;
  frequency: unknown;
  amount: unknown;
  startPeriodIndex: unknown;
  existing: PlannedDepositSettings | PlannedWithdrawalSettings | null;
}) {
  const mode = String(params.mode ?? "").toLowerCase();
  if (mode !== "none" && mode !== "scheduled") return params.existing;
  const frequency = normalizeFlowFrequency(params.frequency, params.existing?.frequency ?? "monthly");
  const startPeriodIndex = clampInt(params.startPeriodIndex, 1, 600, params.existing?.startPeriodIndex ?? 1);
  if (mode === "none") {
    return { enabled: false, frequency, amount: 0, startPeriodIndex };
  }
  return {
    enabled: true,
    frequency,
    amount: clampNumber(params.amount, 0, 1_000_000_000, params.existing?.amount ?? 0),
    startPeriodIndex,
  };
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function isIgnorableDbError(error: any) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return (
    IGNORABLE_DB_CODES.has(code) ||
    message.includes("could not find the table") ||
    (message.includes("column") && message.includes("does not exist"))
  );
}

async function safeDeleteByUser(table: string, userId: string, accountId?: string | null) {
  let query = supabaseAdmin.from(table).delete().eq("user_id", userId);
  if (accountId) query = query.eq("account_id", accountId);
  const { error } = await query;
  if (error && !isIgnorableDbError(error)) throw error;
}

function splitRuleLines(value: unknown, fallback: string[]) {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
  return lines.length ? lines : fallback;
}

function checklistItems(lines: string[], prefix: string) {
  return lines.map((text, idx) => ({
    id: `${prefix}-${idx + 1}`,
    text,
    isSuggested: idx < 3,
    isActive: true,
  }));
}

function defaultSteps() {
  return {
    prepare: {
      title: "Prepare Before Trading",
      checklist: checklistItems(
        [
          "Review economic calendar and market context.",
          "Mark key levels before entry.",
          "Check emotional state before taking risk.",
        ],
        "mobile-prep"
      ),
      notes: "",
    },
    analysis: {
      title: "Analysis model",
      styles: [],
      otherStyleText: "",
      notes: "",
    },
    strategy: {
      title: "Strategy, entry, exit, and management",
      strategies: [],
      notes: "",
    },
    execution_and_journal: {
      title: "Execution and journal system",
      requiredFields: ["import_trades", "emotions", "journal_notes"],
      notes: "",
      system: {
        title: "Mobile business operating system",
        doList: checklistItems(DEFAULT_DO_RULES, "mobile-do"),
        dontList: checklistItems(DEFAULT_DONT_RULES, "mobile-dont"),
        orderList: checklistItems(DEFAULT_ORDER_RULES, "mobile-order"),
        notes: "",
      },
    },
  };
}

function hasBusinessAnalysisProfile(value: unknown) {
  const profile = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  return Boolean(
    profile &&
      cleanText(profile.riskProfile, 40) &&
      cleanText(profile.experience, 40) &&
      cleanText(profile.incomeDependency, 40) &&
      cleanText(profile.drawdownComfort, 40) &&
      cleanText(profile.tradingStyle, 40)
  );
}

async function syncPlanProtectionRules(params: {
  userId: string;
  accountId: string;
  startingBalance: number;
  targetBalance: number;
  planStartDate: string;
  targetDate: string;
  dailyGoalPercent: number;
  maxLossPercent: number;
}) {
  const positive = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("ntj_alert_rules")
    .select("id,key")
    .eq("user_id", params.userId)
    .in("key", ["growth_plan_max_loss", "growth_plan_daily_goal"]);
  if (existingError) throw existingError;

  const commonConfig = {
    source: "system",
    origin: "growth_plan",
    category: "growth_plan",
    account_id: params.accountId,
    starting_balance: positive(params.startingBalance),
    target_balance: positive(params.targetBalance),
    plan_start_date: params.planStartDate,
    target_date: params.targetDate,
    synced_at: new Date().toISOString(),
  };
  const maxLossPercent = positive(params.maxLossPercent);
  const dailyGoalPercent = positive(params.dailyGoalPercent);
  const desired = [
    maxLossPercent > 0
      ? {
          key: "growth_plan_max_loss",
          trigger_type: "MAX_LOSS",
          title: "Trading Business Plan max loss guardrail",
          message:
            "Your Trading Business Plan max daily loss has been hit. Stop trading, protect capital, and record the decision before another entry.",
          severity: "critical",
          channels: ["popup", "inapp", "voice"],
          config: {
            ...commonConfig,
            kind: "alarm",
            protection_key: "growth_plan_max_loss",
            max_loss: Number(((params.startingBalance * maxLossPercent) / 100).toFixed(2)),
            max_loss_percent: maxLossPercent,
          },
        }
      : null,
    dailyGoalPercent > 0
      ? {
          key: "growth_plan_daily_goal",
          trigger_type: "DAILY_GOAL",
          title: "Trading Business Plan daily goal reached",
          message:
            "Your planned daily goal is reached. Protect the win, stop forcing trades, and record what worked.",
          severity: "success",
          channels: ["popup", "inapp"],
          config: {
            ...commonConfig,
            kind: "alarm",
            protection_key: "growth_plan_daily_goal",
            daily_goal: Number(((params.startingBalance * dailyGoalPercent) / 100).toFixed(2)),
            daily_goal_percent: dailyGoalPercent,
          },
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    trigger_type: string;
    title: string;
    message: string;
    severity: string;
    channels: string[];
    config: Record<string, unknown>;
  }>;

  let created = 0;
  let updated = 0;
  let disabled = 0;
  for (const rule of desired) {
    const existing = (existingRows ?? []).find((row: any) => row?.key === rule.key);
    const row = {
      user_id: params.userId,
      key: rule.key,
      trigger_type: rule.trigger_type,
      title: rule.title,
      message: rule.message,
      severity: rule.severity,
      enabled: true,
      channels: rule.channels,
      config: rule.config,
    };
    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("ntj_alert_rules")
        .update(row)
        .eq("id", existing.id)
        .eq("user_id", params.userId);
      if (error) throw error;
      updated += 1;
    } else {
      const { error } = await supabaseAdmin.from("ntj_alert_rules").insert(row);
      if (error) throw error;
      created += 1;
    }
  }

  const desiredKeys = new Set(desired.map((rule) => rule.key));
  const rulesToDisable = (existingRows ?? []).filter((row: any) => !desiredKeys.has(String(row?.key ?? "")));
  for (const rule of rulesToDisable) {
    const { error } = await supabaseAdmin
      .from("ntj_alert_rules")
      .update({ enabled: false })
      .eq("id", rule.id)
      .eq("user_id", params.userId);
    if (error) throw error;
    disabled += 1;
  }

  return { created, updated, disabled };
}

function normalizePlan(row: GrowthPlanRow | null) {
  if (!row) return null;
  const steps = row.steps && typeof row.steps === "object" ? row.steps : defaultSteps();
  const businessAnalysis =
    steps?.business_analysis && typeof steps.business_analysis === "object" ? steps.business_analysis : null;
  const averageTradingDaysRaw =
    businessAnalysis?.averageTradingDaysPerWeek ??
    businessAnalysis?.operatingModel?.averageTradingDaysPerWeek ??
    steps?._ui?.averageTradingDaysPerWeek ??
    row.average_trading_days_per_week ??
    5;
  const tradingInstrument = normalizeTradingInstrument(
    businessAnalysis?.operatingModel?.tradingInstrument ??
      businessAnalysis?.operatingModel?.runway?.instrument ??
      steps?._ui?.tradingInstrument ??
      "stocks"
  );
  const tradingCalendarProfile = getTradingCalendarProfile(tradingInstrument);
  const planStartDate = cleanDate(row.plan_start_date);
  const targetDate = cleanDate(row.target_date);
  const inferredRunway = inferTradingRunway(planStartDate, targetDate);
  const runway = businessAnalysis?.operatingModel?.runway ?? {};
  const depositSettings = normalizeDepositSettings(
    businessAnalysis?.operatingModel?.plannedDepositSettings
  );
  const withdrawalSettings =
    normalizeWithdrawalSettings(businessAnalysis?.operatingModel?.plannedWithdrawalSettings) ??
    normalizeWithdrawalSettings(row.planned_withdrawal_settings);
  const storedReturnMode = cleanText(
    businessAnalysis?.operatingModel?.returnModelMode ?? businessAnalysis?.selectedScenarioId,
    40
  );

  return {
    accountId: row.account_id ?? null,
    startingBalance: num(row.starting_balance, 0),
    targetBalance: num(row.target_balance, 0),
    targetDate,
    planStartDate,
    dailyTargetPct: num(row.daily_target_pct ?? row.daily_goal_percent, 0),
    maxDailyLossPercent: num(row.max_daily_loss_percent, 0),
    maxRiskPerTradePercent: num(row.max_risk_per_trade_percent, 1),
    maxRiskPerTradeUsd: row.max_risk_per_trade_usd == null ? null : num(row.max_risk_per_trade_usd, 0),
    averageTradingDaysPerWeek: clampInt(
      averageTradingDaysRaw,
      1,
      tradingCalendarProfile.sessionsPerWeek,
      5
    ),
    lossDaysPerWeek: clampInt(
      row.loss_days_per_week,
      0,
      tradingCalendarProfile.sessionsPerWeek,
      0
    ),
    tradingDays: clampInt(row.trading_days, 0, 5000, 0),
    returnModelMode: ["conservative", "moderate", "aggressive", "manual"].includes(storedReturnMode)
      ? storedReturnMode
      : "moderate",
    plannedDepositSettings: depositSettings,
    plannedWithdrawalSettings: withdrawalSettings,
    tradingInstrument,
    runway: {
      amount: clampInt(runway?.amount ?? inferredRunway.amount, 1, 1200, 1),
      unit: normalizeTradingRunwayUnit(runway?.unit ?? inferredRunway.unit),
      calendarKey: tradingCalendarProfile.key,
      calendarIsEstimate: tradingCalendarProfile.isEstimate,
    },
    adaptivePlan:
      businessAnalysis?.adaptivePlan && typeof businessAnalysis.adaptivePlan === "object"
        ? businessAnalysis.adaptivePlan
        : null,
    planPhases: Array.isArray(row.plan_phases) ? row.plan_phases : [],
    steps,
    updatedAt: row.updated_at ?? null,
  };
}

async function resolveActiveAccountId(userId: string, requestedAccountId?: string | null) {
  if (requestedAccountId) {
    const { data } = await supabaseAdmin
      .from("trading_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("id", requestedAccountId)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  const { data: prefs } = await supabaseAdmin
    .from("user_preferences")
    .select("active_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  const activeAccountId = String((prefs as any)?.active_account_id ?? "");
  if (activeAccountId) {
    const { data } = await supabaseAdmin
      .from("trading_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("id", activeAccountId)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("trading_accounts")
    .select("id")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingErr && (existingErr as any)?.code !== "42P01") throw existingErr;
  if (existing?.id) {
    await supabaseAdmin
      .from("user_preferences")
      .upsert({ user_id: userId, active_account_id: existing.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return String(existing.id);
  }

  const { data: created, error: createErr } = await supabaseAdmin
    .from("trading_accounts")
    .insert({
      user_id: userId,
      name: "Main trading account",
      broker: null,
      is_default: true,
    })
    .select("id")
    .single();
  if (createErr) throw createErr;

  await supabaseAdmin
    .from("user_preferences")
    .upsert({ user_id: userId, active_account_id: created.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  return String(created.id);
}

async function getPlanRow(userId: string, accountId: string) {
  const { data, error } = await supabaseAdmin
    .from("growth_plans")
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as GrowthPlanRow;

  const fallback = await supabaseAdmin
    .from("growth_plans")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return (fallback.data as GrowthPlanRow | null) ?? null;
}

function summarize(row: GrowthPlanRow | null) {
  if (!row) return null;
  return {
    startingBalance: num(row.starting_balance, 0),
    targetBalance: num(row.target_balance, 0),
    planStartDate: cleanDate(row.plan_start_date),
    targetDate: cleanDate(row.target_date),
    tradingDays: clampInt(row.trading_days, 0, 5000, 0),
    dailyTargetPct: num(row.daily_target_pct ?? row.daily_goal_percent, 0),
    maxDailyLossPercent: num(row.max_daily_loss_percent, 0),
    lossDaysPerWeek: clampInt(row.loss_days_per_week, 0, 5, 0),
    maxRiskPerTradePercent: num(row.max_risk_per_trade_percent, 0),
  };
}

async function recordHistory(params: {
  userId: string;
  accountId: string;
  before: GrowthPlanRow | null;
  after: GrowthPlanRow;
  reason: string;
}) {
  const before = summarize(params.before);
  const after = summarize(params.after);
  const changedFields = Object.keys(after ?? {}).filter(
    (field) => JSON.stringify((before as any)?.[field] ?? null) !== JSON.stringify((after as any)?.[field] ?? null)
  );
  if (!changedFields.length && params.before) return;

  const { error } = await supabaseAdmin.from("growth_plan_history").insert({
    user_id: params.userId,
    account_id: params.accountId,
    started_at: cleanDate(params.after.plan_start_date) || null,
    ended_at: cleanDate(params.after.target_date) || null,
    reset_reason: params.reason,
    snapshot: {
      source: "mobile",
      reason: params.reason,
      changedFields,
      before,
      after,
    },
  });
  if (error) console.warn("[growth-plan/mobile] history warning:", error.message);
}

async function resetPlanData(userId: string, accountId: string, before: GrowthPlanRow | null) {
  const { data: rules, error: rulesErr } = await supabaseAdmin
    .from("ntj_alert_rules")
    .select("id")
    .eq("user_id", userId)
    .in("key", ["growth_plan_max_loss", "growth_plan_daily_goal"]);
  if (rulesErr && !isIgnorableDbError(rulesErr)) throw rulesErr;
  if (!rulesErr) {
    const ruleIds = (rules ?? []).map((row: any) => String(row?.id ?? "")).filter(Boolean);
    if (ruleIds.length) {
      const { error } = await supabaseAdmin.from("ntj_alert_events").delete().eq("user_id", userId).in("rule_id", ruleIds);
      if (error && !isIgnorableDbError(error)) throw error;
    }
    const { error } = await supabaseAdmin
      .from("ntj_alert_rules")
      .delete()
      .eq("user_id", userId)
      .in("key", ["growth_plan_max_loss", "growth_plan_daily_goal"]);
    if (error && !isIgnorableDbError(error)) throw error;
  }
  await safeDeleteByUser("business_milestones", userId, accountId);
  await safeDeleteByUser("growth_plan_history", userId, accountId);
  await safeDeleteByUser("growth_plans", userId, accountId);

  if (before) {
    const { error } = await supabaseAdmin.from("growth_plan_history").insert({
      user_id: userId,
      account_id: accountId,
      started_at: cleanDate(before.plan_start_date) || null,
      ended_at: cleanDate(before.target_date) || null,
      reset_reason: "mobile_plan_reset",
      snapshot: {
        source: "mobile",
        reason: "mobile_plan_reset",
        before: summarize(before),
        after: null,
      },
    });
    if (error) console.warn("[growth-plan/mobile] reset history warning:", error.message);
  }
}

export async function GET(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const { searchParams } = new URL(req.url);
    const userId = access.context.userId;
    const accountId = await resolveActiveAccountId(userId, searchParams.get("accountId"));
    const row = await getPlanRow(userId, accountId);

    return NextResponse.json({ accountId, plan: normalizePlan(row) });
  } catch (err: any) {
    console.error("[growth-plan/mobile] GET error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const userId = access.context.userId;
    const limiter = await rateLimit(`growth-plan-mobile:${userId}:${getClientIp(req)}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many Business Plan requests. Please try again shortly." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const accountId = await resolveActiveAccountId(userId, cleanText(body?.accountId, 80) || null);
    const current = await getPlanRow(userId, accountId);
    const action = cleanText(body?.action, 40).toLowerCase();

    if (action === "reset") {
      const confirmation = cleanText(body?.confirmation, 40).toUpperCase();
      if (confirmation !== "RESET PLAN") {
        return NextResponse.json({ error: "Reset confirmation phrase is required." }, { status: 400 });
      }
      await resetPlanData(userId, accountId, current);
      return NextResponse.json({ ok: true, accountId, plan: null });
    }

    const startingBalance = clampNumber(body?.startingBalance, 1, 100_000_000, 0);
    const targetBalance = clampNumber(body?.targetBalance, 1, 1_000_000_000, 0);
    const planStartDate = cleanDate(body?.planStartDate) || isoToday();
    const currentBusinessAnalysis =
      current?.steps?.business_analysis && typeof current.steps.business_analysis === "object"
        ? current.steps.business_analysis
        : {};
    const currentOperatingModel = currentBusinessAnalysis?.operatingModel ?? {};
    const tradingInstrument = normalizeTradingInstrument(
      body?.tradingInstrument ??
        currentOperatingModel?.tradingInstrument ??
        currentOperatingModel?.runway?.instrument ??
        "stocks"
    );
    const tradingCalendarProfile = getTradingCalendarProfile(tradingInstrument);
    const requestedTargetDate = cleanDate(body?.targetDate);
    const inferredRunway = inferTradingRunway(planStartDate, requestedTargetDate);
    const runwayAmount = clampInt(
      body?.runwayAmount ??
        (requestedTargetDate ? inferredRunway.amount : currentOperatingModel?.runway?.amount) ??
        inferredRunway.amount,
      1,
      1200,
      1
    );
    const runwayUnit = normalizeTradingRunwayUnit(
      body?.runwayUnit ??
        (requestedTargetDate ? inferredRunway.unit : currentOperatingModel?.runway?.unit) ??
        inferredRunway.unit
    );
    const targetDate = requestedTargetDate || addTradingRunway(planStartDate, runwayAmount, runwayUnit);
    const averageTradingDaysPerWeek = clampInt(
      body?.averageTradingDaysPerWeek,
      1,
      tradingCalendarProfile.sessionsPerWeek,
      5
    );
    const lossDaysPerWeek = clampInt(body?.lossDaysPerWeek, 0, averageTradingDaysPerWeek, 0);
    const maxDailyLossPercent = clampNumber(body?.maxDailyLossPercent, 0, 25, 2);
    const maxRiskPerTradePercent = clampNumber(body?.maxRiskPerTradePercent, 0, 25, 1);
    const requestedReturnMode = cleanText(
      body?.returnModelMode ?? currentOperatingModel?.returnModelMode ?? currentBusinessAnalysis?.selectedScenarioId,
      40
    );
    if (!["conservative", "moderate", "aggressive", "manual"].includes(requestedReturnMode)) {
      return NextResponse.json(
        { error: "Choose a conservative, moderate, aggressive, or manual return model." },
        { status: 400 }
      );
    }
    const returnModelMode = ["conservative", "moderate", "aggressive", "manual"].includes(
      requestedReturnMode
    )
      ? requestedReturnMode
      : "moderate";
    const existingScenarioId = cleanText(
      body?.policyScenarioId ?? currentBusinessAnalysis?.selectedScenarioId,
      40
    );
    const policyId: GrowthPlanScenarioId = ["conservative", "moderate", "aggressive"].includes(
      returnModelMode === "manual" ? existingScenarioId : returnModelMode
    )
      ? ((returnModelMode === "manual" ? existingScenarioId : returnModelMode) as GrowthPlanScenarioId)
      : "moderate";
    const currentProfile =
      currentBusinessAnalysis?.profile && typeof currentBusinessAnalysis.profile === "object"
        ? currentBusinessAnalysis.profile
        : null;
    const basePolicy = getGrowthPlanOperatingPolicy(policyId, currentProfile);
    const existingSelectedScenario = currentBusinessAnalysis?.selectedScenario ?? {};
    const declaredGoalDayPct =
      returnModelMode === "manual"
        ? clampNumber(
            body?.operatingDailyGoalPct ?? existingSelectedScenario?.dailyGoalPct,
            0.01,
            5,
            basePolicy.goalDayReturnPct
          )
        : basePolicy.goalDayReturnPct;
    const declaredExpectedLossDayPct =
      returnModelMode === "manual"
        ? clampNumber(
            body?.expectedLossDayPct ?? existingSelectedScenario?.expectedLossDayPct,
            0.01,
            Math.max(0.01, maxDailyLossPercent),
            Math.min(basePolicy.expectedLossDayPct, Math.max(0.01, maxDailyLossPercent))
          )
        : Math.min(basePolicy.expectedLossDayPct, Math.max(0.01, maxDailyLossPercent));
    const existingDepositSettings = normalizeDepositSettings(
      currentOperatingModel?.plannedDepositSettings
    );
    const existingWithdrawalSettings =
      normalizeWithdrawalSettings(currentOperatingModel?.plannedWithdrawalSettings) ??
      normalizeWithdrawalSettings(current?.planned_withdrawal_settings);
    const plannedDepositSettings = resolveCapitalFlowSettings({
      mode: body?.plannedDepositMode,
      frequency: body?.plannedDepositFrequency,
      amount: body?.plannedDepositAmount,
      startPeriodIndex: body?.plannedDepositStartPeriod,
      existing: existingDepositSettings,
    });
    const plannedWithdrawalSettings = resolveCapitalFlowSettings({
      mode: body?.plannedWithdrawalMode,
      frequency: body?.plannedWithdrawalFrequency,
      amount: body?.plannedWithdrawalAmount,
      startPeriodIndex: body?.plannedWithdrawalStartPeriod,
      existing: existingWithdrawalSettings,
    });
    const operatingPolicy = {
      id: policyId,
      goalDayReturnPct: basePolicy.goalDayReturnPct,
      expectedLossDayPct: Math.min(basePolicy.expectedLossDayPct, Math.max(0.01, maxDailyLossPercent)),
      maxDailyLossPct: maxDailyLossPercent,
      riskPerTradePct: maxRiskPerTradePercent,
      lossDaysPerWeek,
    };

    if (startingBalance <= 0) return NextResponse.json({ error: "Starting balance is required." }, { status: 400 });
    if (targetBalance <= startingBalance) {
      return NextResponse.json({ error: "Target balance must be greater than starting balance." }, { status: 400 });
    }
    if (!targetDate) return NextResponse.json({ error: "Target date is required." }, { status: 400 });
    if (new Date(`${targetDate}T00:00:00`) <= new Date(`${planStartDate}T00:00:00`)) {
      return NextResponse.json({ error: "Target date must be after start date." }, { status: 400 });
    }
    if (lossDaysPerWeek >= averageTradingDaysPerWeek) {
      return NextResponse.json(
        { error: "Planned losing days must be lower than trading days per week." },
        { status: 400 }
      );
    }
    if (!plannedDepositSettings) {
      return NextResponse.json(
        { error: "Confirm whether future contributions are none or scheduled." },
        { status: 400 }
      );
    }
    if (!plannedWithdrawalSettings) {
      return NextResponse.json(
        { error: "Confirm whether future withdrawals are none or scheduled." },
        { status: 400 }
      );
    }
    if (plannedDepositSettings?.enabled && plannedDepositSettings.amount <= 0) {
      return NextResponse.json({ error: "A scheduled contribution requires an amount." }, { status: 400 });
    }
    if (plannedWithdrawalSettings?.enabled && plannedWithdrawalSettings.amount <= 0) {
      return NextResponse.json({ error: "A scheduled withdrawal requires an amount." }, { status: 400 });
    }

    const adaptivePlan = buildAdaptiveGrowthPlan({
      starting: startingBalance,
      target: targetBalance,
      startIso: planStartDate,
      requestedTargetIso: targetDate,
      tradingInstrument,
      averageTradingDaysPerWeek,
      policy: operatingPolicy,
      declaredGoalDayPct,
      declaredExpectedLossDayPct,
      evidence: currentBusinessAnalysis?.executionEvidence ?? null,
      depositPlan: plannedDepositSettings,
      withdrawalPlan: plannedWithdrawalSettings,
    });
    if (
      action !== "preview" &&
      adaptivePlan.verdict === "not_supported" &&
      !adaptivePlan.recommendedCompletionDate
    ) {
      return NextResponse.json(
        {
          error:
            "This target is outside the disciplined 50-year planning horizon. Reduce the target, add capital, or validate stronger execution evidence.",
          adaptivePlan,
        },
        { status: 422 }
      );
    }
    const effectiveTargetDate =
      adaptivePlan.verdict === "not_supported" &&
      adaptivePlan.recommendedCompletionDate &&
      adaptivePlan.recommendedCompletionDate > targetDate
        ? adaptivePlan.recommendedCompletionDate
        : targetDate;
    const effectiveRunway = inferTradingRunway(planStartDate, effectiveTargetDate);
    const marketSessions = computeTradingSessionsBetween(
      planStartDate,
      effectiveTargetDate,
      tradingInstrument
    );
    const projection = buildPlanProjection({
      starting: startingBalance,
      target: targetBalance,
      startIso: planStartDate,
      targetIso: effectiveTargetDate,
      averageTradingDaysPerWeek,
      lossDaysPerWeek,
      maxDailyLossPercent,
      modeledLossDayPercent: adaptivePlan.expectedLossDayPct,
      depositSettings: plannedDepositSettings,
      withdrawalSettings: plannedWithdrawalSettings,
      existingWithdrawals: Array.isArray(current?.planned_withdrawals) ? current?.planned_withdrawals : [],
      tradingInstrument,
    });

    if (!projection.tradingDays.length) {
      return NextResponse.json({ error: "No operating trading days found for this plan window." }, { status: 400 });
    }
    if (action === "preview") {
      return NextResponse.json({
        ok: true,
        accountId,
        projection: {
          requiredGoalPct: Number(projection.requiredGoalPct.toFixed(4)),
          tradingDays: projection.tradingDays.length,
          completionDate: projection.completionDate,
          targetReached: projection.targetReached,
          adaptivePlan,
        },
      });
    }

    const strategyName = cleanText(body?.strategyName, 120);
    const strategyNotes = cleanText(body?.strategyNotes, 1200);
    const doRules = splitRuleLines(body?.doRules, DEFAULT_DO_RULES);
    const dontRules = splitRuleLines(body?.dontRules, DEFAULT_DONT_RULES);
    const orderRules = splitRuleLines(body?.orderRules, DEFAULT_ORDER_RULES);
    const currentSteps = current?.steps && typeof current.steps === "object" ? current.steps : defaultSteps();
    const synchronizedBusinessAnalysis =
      (currentSteps as any)?.business_analysis && typeof (currentSteps as any).business_analysis === "object"
        ? (currentSteps as any).business_analysis
        : currentBusinessAnalysis;
    const existingProfile = synchronizedBusinessAnalysis?.profile;
    const preserveProfile = hasBusinessAnalysisProfile(existingProfile);
    const synchronizedExistingScenarioId = cleanText(synchronizedBusinessAnalysis?.selectedScenarioId, 40);
    const preserveScenarioId = ["conservative", "moderate", "aggressive"].includes(
      synchronizedExistingScenarioId
    );
    const requiredGoalPct = Number(projection.requiredGoalPct.toFixed(4));
    const targetMultiple = targetBalance / startingBalance;
    const nowIso = new Date().toISOString();
    const qualificationOnly = adaptivePlan.verdict === "no_validated_edge";
    const planPhases = qualificationOnly ? [] : projection.milestones.map((phase, idx) => ({
      id: randomUUID(),
      title:
        phase.weekIndex && phase.monthIndex
          ? `Week ${phase.weekIndex} (Month ${phase.monthIndex})`
          : `Week ${idx + 1}`,
      targetEquity: phase.targetEquity,
      targetDate: phase.targetDate ?? null,
      status: "pending",
      monthIndex: phase.monthIndex,
      weekIndex: phase.weekIndex,
      weeksInMonth: phase.weeksInMonth,
      monthGoal: phase.monthGoal,
      monthLabel: phase.monthLabel,
      monthStartBalance: phase.monthStartBalance,
      monthEndBalance: phase.monthEndBalance,
      monthDeposit: phase.monthDeposit,
      monthWithdrawal: phase.monthWithdrawal,
      cumulativeDeposits: phase.cumulativeDeposits,
      cumulativeWithdrawals: phase.cumulativeWithdrawals,
    }));
    const synchronizedScenarioId = policyId;
    const operatingDailyGoalPct = adaptivePlan.recommendedGoalDayPct;
    const synchronizedScenario = {
      id: synchronizedScenarioId,
      title:
        (synchronizedExistingScenarioId === synchronizedScenarioId
          ? cleanText(synchronizedBusinessAnalysis?.selectedScenario?.title, 120)
          : "") || policyId,
      dailyGoalPct: operatingDailyGoalPct,
      expectedLossDayPct: adaptivePlan.expectedLossDayPct,
      maxDailyLossPct: maxDailyLossPercent,
      riskPerTradePct: maxRiskPerTradePercent,
      lossDaysPerWeek,
      projectedEndBalance: projection.completionBalance,
      recommended: true,
    };
    const existingScenarios = Array.isArray(synchronizedBusinessAnalysis?.scenarios)
      ? synchronizedBusinessAnalysis.scenarios
      : [];
    const hasSynchronizedScenario = existingScenarios.some(
      (scenario: any) => cleanText(scenario?.id, 40) === synchronizedScenarioId
    );
    const synchronizedScenarios = preserveScenarioId && existingScenarios.length
      ? [
          ...existingScenarios.map((scenario: any) =>
            cleanText(scenario?.id, 40) === synchronizedScenarioId
              ? { ...scenario, ...synchronizedScenario }
              : scenario
          ),
          ...(hasSynchronizedScenario ? [] : [synchronizedScenario]),
        ]
      : [synchronizedScenario];

    const steps = {
      ...currentSteps,
      _ui: {
        ...(currentSteps as any)?._ui,
        autoPhaseCadence: "weekly",
        averageTradingDaysPerWeek,
        tradingInstrument,
        source: "mobile",
      },
      business_analysis: {
        ...synchronizedBusinessAnalysis,
        profile: preserveProfile
          ? existingProfile
          : {
              source: "mobile",
              goal: `${startingBalance} to ${targetBalance}`,
              strategy: strategyName,
            },
        selectedScenarioId: synchronizedScenarioId,
        averageTradingDaysPerWeek,
        mobileContext: {
          goal: `${startingBalance} to ${targetBalance}`,
          strategy: strategyName,
          savedAt: nowIso,
        },
        operatingModel: {
          planStartDate,
          targetDate: effectiveTargetDate,
          committedTradingDays: projection.tradingDays.length,
          averageTradingDaysPerWeek,
          lossDaysPerWeek,
          maxDailyLossPercent,
          riskPerTradePct: maxRiskPerTradePercent,
          expectedLossDayPct: adaptivePlan.expectedLossDayPct,
          returnModelMode,
          plannedDepositMode: plannedDepositSettings?.enabled ? "scheduled" : "none",
          plannedDepositSettings,
          plannedWithdrawalMode: plannedWithdrawalSettings?.enabled ? "scheduled" : "none",
          plannedWithdrawalSettings,
          tradingInstrument,
          runway: {
            amount: effectiveRunway.amount,
            unit: effectiveRunway.unit,
            instrument: tradingInstrument,
            calendarKey: tradingCalendarProfile.key,
            calculatedTargetDate: effectiveTargetDate,
            marketSessions,
            committedTradingDays: projection.tradingDays.length,
            calendarIsEstimate: tradingCalendarProfile.isEstimate,
          },
        },
        selectedScenario: synchronizedScenario,
        scenarios: synchronizedScenarios,
        adaptivePlan,
        realismReview: {
          verdict: adaptivePlan.verdict,
          requiredGoalPct,
          targetMultiple,
          tradingDays: projection.tradingDays.length,
          requestedProjectedBalance: adaptivePlan.requestedProjectedBalance,
          requestedCoveragePct: adaptivePlan.requestedCoveragePct,
          requestedDepositsUsd: adaptivePlan.requestedDepositsUsd,
          requestedWithdrawalsUsd: adaptivePlan.requestedWithdrawalsUsd,
          requestedTradingGrowthUsd: adaptivePlan.requestedTradingGrowthUsd,
          estimatedCompletionDate: adaptivePlan.recommendedCompletionDate,
          targetReached: adaptivePlan.requestedCoveragePct >= 100,
          reviewedAt: nowIso,
          surfacedToUser: true,
        },
        aiPlanAdvisor: {
          headline:
            adaptivePlan.verdict === "not_supported"
              ? "The requested deadline is not supported by the disciplined operating model."
              : adaptivePlan.verdict === "no_validated_edge"
                ? adaptivePlan.recommendedCompletionDate && adaptivePlan.flags.includes("planned_deposits_included")
                  ? "Trading growth is not validated. The displayed horizon is funded by scheduled contributions while trading remains in qualification."
                  : "Validate a positive execution edge before assigning a completion date."
                : "The adaptive roadmap is ready for checkpoint-based execution.",
          body:
            "Mobile created the operating structure. The coach can now compare execution against the target, cadence, risk rails, and active checkpoints.",
          recommendedCompletionDate: adaptivePlan.recommendedCompletionDate,
          monthlyMilestones: adaptivePlan.monthlyMilestones,
          quarterlyMilestones: adaptivePlan.quarterlyMilestones,
          annualMilestones: adaptivePlan.annualMilestones,
          reviewedAt: nowIso,
        },
        updatedAt: nowIso,
      },
      strategy: {
        ...((currentSteps as any)?.strategy ?? {}),
        title: "Strategy, entry, exit, and management",
        strategies: strategyName
          ? [
              {
                id: "mobile-primary-strategy",
                name: strategyName,
                setup: strategyNotes,
                entryRules: "",
                exitRules: "",
                managementRules: "",
                invalidation: "",
                instruments: [],
                timeframe: "",
              },
            ]
          : Array.isArray((currentSteps as any)?.strategy?.strategies)
            ? (currentSteps as any).strategy.strategies
            : [],
        notes: strategyNotes || (currentSteps as any)?.strategy?.notes || "",
      },
      execution_and_journal: {
        ...((currentSteps as any)?.execution_and_journal ?? {}),
        title: "Execution and journal system",
        requiredFields: ["import_trades", "emotions", "journal_notes"],
        system: {
          ...((currentSteps as any)?.execution_and_journal?.system ?? {}),
          title: "Mobile business operating system",
          doList: checklistItems(doRules, "mobile-do"),
          dontList: checklistItems(dontRules, "mobile-dont"),
          orderList: checklistItems(orderRules, "mobile-order"),
        },
      },
    };

    const payload = {
      user_id: userId,
      account_id: accountId,
      starting_balance: Number(startingBalance.toFixed(2)),
      target_balance: Number(targetBalance.toFixed(2)),
      target_date: effectiveTargetDate,
      plan_style: "balanced",
      plan_mode: qualificationOnly ? "manual" : "auto",
      target_multiple: Number(targetMultiple.toFixed(6)),
      plan_start_date: planStartDate,
      planned_withdrawal_settings: plannedWithdrawalSettings,
      planned_withdrawals: Array.isArray(current?.planned_withdrawals) ? current.planned_withdrawals : [],
      plan_phases: planPhases,
      daily_target_pct: Number(adaptivePlan.recommendedGoalDayPct.toFixed(4)),
      daily_goal_percent: Number(adaptivePlan.recommendedGoalDayPct.toFixed(4)),
      max_daily_loss_percent: Number(maxDailyLossPercent.toFixed(4)),
      trading_days: projection.tradingDays.length,
      loss_days_per_week: lossDaysPerWeek,
      max_risk_per_trade_percent: Number(maxRiskPerTradePercent.toFixed(4)),
      max_risk_per_trade_usd: Number(((startingBalance * maxRiskPerTradePercent) / 100).toFixed(2)),
      steps,
      rules: Array.isArray(current?.rules) && current.rules.length ? current.rules : [],
      selected_plan: "suggested",
      version: 2,
      updated_at: nowIso,
    };

    const { data, error } = await supabaseAdmin
      .from("growth_plans")
      .upsert(payload, { onConflict: "user_id,account_id" })
      .select("*")
      .single();
    if (error) throw error;

    await recordHistory({
      userId,
      accountId,
      before: current,
      after: data as GrowthPlanRow,
      reason: current ? "mobile_plan_updated" : "mobile_plan_created",
    });

    let protectionSync: { created: number; updated: number; disabled: number } | null = null;
    try {
      protectionSync = await syncPlanProtectionRules({
        userId,
        accountId,
        startingBalance,
        targetBalance,
        planStartDate,
        targetDate: effectiveTargetDate,
        dailyGoalPercent: adaptivePlan.recommendedGoalDayPct,
        maxLossPercent: maxDailyLossPercent,
      });
    } catch (protectionError) {
      console.warn("[growth-plan/mobile] protection sync warning:", protectionError);
    }

    return NextResponse.json({
      ok: true,
      accountId,
      plan: normalizePlan(data as GrowthPlanRow),
      protectionSync,
      projection: {
        requiredGoalPct,
        tradingDays: projection.tradingDays.length,
        completionDate: projection.completionDate,
        targetReached: projection.targetReached,
        adaptivePlan,
      },
    });
  } catch (err: any) {
    console.error("[growth-plan/mobile] POST error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
