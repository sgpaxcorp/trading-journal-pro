import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { buildPlanProjection } from "@/lib/growthPlanProjection";
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

function isoToday() {
  return new Date().toISOString().slice(0, 10);
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

  return {
    accountId: row.account_id ?? null,
    startingBalance: num(row.starting_balance, 0),
    targetBalance: num(row.target_balance, 0),
    targetDate: cleanDate(row.target_date),
    planStartDate: cleanDate(row.plan_start_date),
    dailyTargetPct: num(row.daily_target_pct ?? row.daily_goal_percent, 0),
    maxDailyLossPercent: num(row.max_daily_loss_percent, 0),
    maxRiskPerTradePercent: num(row.max_risk_per_trade_percent, 1),
    maxRiskPerTradeUsd: row.max_risk_per_trade_usd == null ? null : num(row.max_risk_per_trade_usd, 0),
    averageTradingDaysPerWeek: clampInt(averageTradingDaysRaw, 1, 5, 5),
    lossDaysPerWeek: clampInt(row.loss_days_per_week, 0, 5, 0),
    tradingDays: clampInt(row.trading_days, 0, 5000, 0),
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
        { error: "Too many Business Plan saves. Please try again shortly." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const accountId = await resolveActiveAccountId(userId, cleanText(body?.accountId, 80) || null);
    const current = await getPlanRow(userId, accountId);

    const startingBalance = clampNumber(body?.startingBalance, 1, 100_000_000, 0);
    const targetBalance = clampNumber(body?.targetBalance, 1, 1_000_000_000, 0);
    const planStartDate = cleanDate(body?.planStartDate) || isoToday();
    const targetDate = cleanDate(body?.targetDate);
    const averageTradingDaysPerWeek = clampInt(body?.averageTradingDaysPerWeek, 1, 5, 5);
    const lossDaysPerWeek = clampInt(body?.lossDaysPerWeek, 0, averageTradingDaysPerWeek, 0);
    const maxDailyLossPercent = clampNumber(body?.maxDailyLossPercent, 0, 25, 2);
    const maxRiskPerTradePercent = clampNumber(body?.maxRiskPerTradePercent, 0, 25, 1);

    if (startingBalance <= 0) return NextResponse.json({ error: "Starting balance is required." }, { status: 400 });
    if (targetBalance <= startingBalance) {
      return NextResponse.json({ error: "Target balance must be greater than starting balance." }, { status: 400 });
    }
    if (!targetDate) return NextResponse.json({ error: "Target date is required." }, { status: 400 });
    if (new Date(`${targetDate}T00:00:00`) <= new Date(`${planStartDate}T00:00:00`)) {
      return NextResponse.json({ error: "Target date must be after start date." }, { status: 400 });
    }

    const projection = buildPlanProjection({
      starting: startingBalance,
      target: targetBalance,
      startIso: planStartDate,
      targetIso: targetDate,
      averageTradingDaysPerWeek,
      lossDaysPerWeek,
      maxDailyLossPercent,
      withdrawalSettings: current?.planned_withdrawal_settings ?? null,
      existingWithdrawals: Array.isArray(current?.planned_withdrawals) ? current?.planned_withdrawals : [],
    });

    if (!projection.tradingDays.length) {
      return NextResponse.json({ error: "No operating trading days found for this plan window." }, { status: 400 });
    }

    const strategyName = cleanText(body?.strategyName, 120);
    const strategyNotes = cleanText(body?.strategyNotes, 1200);
    const doRules = splitRuleLines(body?.doRules, DEFAULT_DO_RULES);
    const dontRules = splitRuleLines(body?.dontRules, DEFAULT_DONT_RULES);
    const orderRules = splitRuleLines(body?.orderRules, DEFAULT_ORDER_RULES);
    const currentSteps = current?.steps && typeof current.steps === "object" ? current.steps : defaultSteps();
    const requiredGoalPct = Number(projection.requiredGoalPct.toFixed(4));
    const targetMultiple = targetBalance / startingBalance;
    const nowIso = new Date().toISOString();
    const planPhases = projection.milestones.map((phase, idx) => ({
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
      monthWithdrawal: phase.monthWithdrawal,
      cumulativeWithdrawals: phase.cumulativeWithdrawals,
    }));

    const steps = {
      ...currentSteps,
      _ui: {
        ...(currentSteps as any)?._ui,
        autoPhaseCadence: "weekly",
        averageTradingDaysPerWeek,
        source: "mobile",
      },
      business_analysis: {
        ...((currentSteps as any)?.business_analysis ?? {}),
        profile: {
          source: "mobile",
          goal: `${startingBalance} to ${targetBalance}`,
          strategy: strategyName,
        },
        selectedScenarioId: "mobile-operating-plan",
        averageTradingDaysPerWeek,
        operatingModel: {
          planStartDate,
          targetDate,
          committedTradingDays: projection.tradingDays.length,
          averageTradingDaysPerWeek,
          lossDaysPerWeek,
          maxDailyLossPercent,
          riskPerTradePct: maxRiskPerTradePercent,
        },
        selectedScenario: {
          id: "mobile-operating-plan",
          title: "Mobile operating plan",
          dailyGoalPct: requiredGoalPct,
          maxDailyLossPct: maxDailyLossPercent,
          riskPerTradePct: maxRiskPerTradePercent,
          lossDaysPerWeek,
          recommended: true,
        },
        scenarios: [
          {
            id: "mobile-operating-plan",
            title: "Mobile operating plan",
            dailyGoalPct: requiredGoalPct,
            maxDailyLossPct: maxDailyLossPercent,
            riskPerTradePct: maxRiskPerTradePercent,
            lossDaysPerWeek,
            projectedEndBalance: projection.completionBalance,
            recommended: true,
          },
        ],
        realismReview: {
          verdict: requiredGoalPct > 3 ? "aggressive" : requiredGoalPct > 1 ? "ambitious" : "measured",
          requiredGoalPct,
          targetMultiple,
          tradingDays: projection.tradingDays.length,
          estimatedCompletionDate: projection.completionDate,
          targetReached: projection.targetReached,
          reviewedAt: nowIso,
          surfacedToUser: true,
        },
        aiPlanAdvisor: {
          headline:
            requiredGoalPct > 3
              ? "This plan needs aggressive execution."
              : requiredGoalPct > 1
                ? "This plan is ambitious and measurable."
                : "This plan is measured and operational.",
          body:
            "Mobile created the operating structure. The coach can now compare execution against the target, cadence, risk rails, and active checkpoints.",
          recommendedCompletionDate: projection.completionDate,
          phases: planPhases.slice(0, 12),
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
      target_date: targetDate,
      plan_style: "balanced",
      plan_mode: "auto",
      target_multiple: Number(targetMultiple.toFixed(6)),
      plan_start_date: planStartDate,
      planned_withdrawal_settings: current?.planned_withdrawal_settings ?? null,
      planned_withdrawals: Array.isArray(current?.planned_withdrawals) ? current.planned_withdrawals : [],
      plan_phases: planPhases,
      daily_target_pct: requiredGoalPct,
      daily_goal_percent: requiredGoalPct,
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

    return NextResponse.json({
      ok: true,
      accountId,
      plan: normalizePlan(data as GrowthPlanRow),
      projection: {
        requiredGoalPct,
        tradingDays: projection.tradingDays.length,
        completionDate: projection.completionDate,
        targetReached: projection.targetReached,
      },
    });
  } catch (err: any) {
    console.error("[growth-plan/mobile] POST error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
