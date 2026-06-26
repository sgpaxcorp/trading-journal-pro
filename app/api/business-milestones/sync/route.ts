import { NextResponse } from "next/server";

import {
  BUSINESS_MILESTONE_DEFINITIONS,
  buildBusinessMilestoneMessage,
  type BusinessMilestoneKey,
  type BusinessMilestoneProgress,
} from "@/lib/businessMilestones";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

const SYSTEM_RULE_KEY = "business_milestones";

function asLang(value: unknown): "en" | "es" {
  return String(value ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function activeItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item: any) => item && item.isActive !== false && text(item.text ?? item.label));
}

function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function readBody(req: Request) {
  if (req.method !== "POST") return {};
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

async function loadLatestPlan(userId: string, accountId?: string | null) {
  async function run(scoped: boolean) {
    let q = supabaseAdmin
      .from("growth_plans")
      .select(
        "id,account_id,starting_balance,target_balance,target_date,plan_start_date,daily_goal_percent,daily_target_pct,max_daily_loss_percent,max_risk_per_trade_percent,steps,rules,updated_at,created_at"
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    if (scoped && accountId) q = q.eq("account_id", accountId);
    return q.maybeSingle();
  }

  if (accountId) {
    const scoped = await run(true);
    if (!scoped.error && scoped.data) return scoped.data as any;
  }

  const fallback = await run(false);
  if (fallback.error) return null;
  return (fallback.data as any) ?? null;
}

async function countRows(params: {
  table: string;
  userId: string;
  accountId?: string | null;
  applyAccount?: boolean;
  filter?: (query: any) => any;
}) {
  try {
    let q = supabaseAdmin
      .from(params.table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", params.userId);
    if (params.applyAccount && params.accountId) q = q.eq("account_id", params.accountId);
    if (params.filter) q = params.filter(q);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function ensureInboxRule(userId: string) {
  const { data: existing } = await supabaseAdmin
    .from("ntj_alert_rules")
    .select("id")
    .eq("user_id", userId)
    .eq("key", SYSTEM_RULE_KEY)
    .maybeSingle();

  const id = text((existing as any)?.id);
  if (id) return id;

  const { data: created, error } = await supabaseAdmin
    .from("ntj_alert_rules")
    .insert({
      user_id: userId,
      key: SYSTEM_RULE_KEY,
      trigger_type: "system_notice",
      title: "Business milestone reached",
      message: "A trading business milestone was completed.",
      severity: "info",
      enabled: true,
      channels: ["inapp"],
      config: { source: "system", core: true, kind: "reminder", category: "business_milestone" },
    })
    .select("id")
    .single();

  if (error) throw error;
  return text((created as any)?.id);
}

async function notifyMilestone(params: {
  userId: string;
  key: string;
  lang: "en" | "es";
  name?: string | null;
}) {
  try {
    const def = BUSINESS_MILESTONE_DEFINITIONS.find((item) => item.key === params.key);
    const ruleId = await ensureInboxRule(params.userId);
    const message = buildBusinessMilestoneMessage(params);
    const now = new Date();
    await supabaseAdmin.from("ntj_alert_events").insert({
      user_id: params.userId,
      rule_id: ruleId,
      date: isoDate(now),
      status: "active",
      triggered_at: now.toISOString(),
      dismissed_until: null,
      acknowledged_at: null,
      payload: {
        title: params.lang === "es" ? "Hito empresarial completado" : "Business milestone reached",
        message,
        severity: "info",
        channels: ["inapp"],
        kind: "reminder",
        category: "business_milestone",
        milestoneKey: params.key,
        milestoneTitle: def?.title[params.lang] ?? params.key,
      },
    });
  } catch (err) {
    console.warn("[business-milestones/sync] notification failed:", err);
  }
}

function deriveMilestones(plan: any, journalCount: number, protectionCount: number) {
  const completed = new Map<BusinessMilestoneKey, Record<string, unknown>>();
  if (!plan) return completed;

  completed.set("business_plan_created", {
    planId: plan.id,
    accountId: plan.account_id ?? null,
  });

  const steps = plan.steps && typeof plan.steps === "object" ? plan.steps : {};
  const businessAnalysis = steps.business_analysis && typeof steps.business_analysis === "object" ? steps.business_analysis : null;
  const profile = businessAnalysis?.profile && typeof businessAnalysis.profile === "object" ? businessAnalysis.profile : null;
  const selectedScenarioId = text(businessAnalysis?.selectedScenarioId ?? businessAnalysis?.selectedScenario?.id);

  if (profile && Object.values(profile).some((value) => text(value))) {
    completed.set("business_analysis_completed", {
      planId: plan.id,
      profile,
    });
  }

  if (selectedScenarioId) {
    completed.set("scenario_selected", {
      planId: plan.id,
      selectedScenarioId,
    });
  }

  const rules = activeItems(plan.rules);
  const doList = activeItems(steps?.execution_and_journal?.system?.doList);
  const dontList = activeItems(steps?.execution_and_journal?.system?.dontList);
  if (rules.length > 0 || doList.length > 0 || dontList.length > 0) {
    completed.set("business_rules_defined", {
      planId: plan.id,
      rules: rules.length,
      do: doList.length,
      dont: dontList.length,
    });
  }

  const maxDailyLoss = num(plan.max_daily_loss_percent);
  const maxRisk = num(plan.max_risk_per_trade_percent);
  const dailyGoal = num(plan.daily_goal_percent ?? plan.daily_target_pct);
  if (maxDailyLoss > 0 && maxRisk > 0 && dailyGoal > 0) {
    completed.set("risk_rails_defined", {
      planId: plan.id,
      maxDailyLoss,
      maxRisk,
      dailyGoal,
    });
  }

  if (protectionCount > 0) {
    completed.set("business_protection_enabled", {
      planId: plan.id,
      protectionRules: protectionCount,
    });
  }

  if (journalCount > 0) {
    completed.set("first_execution_record", {
      accountId: plan.account_id ?? null,
      journalEntries: journalCount,
    });
  }

  return completed;
}

async function handler(req: Request) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const body = await readBody(req);
    const url = new URL(req.url);
    const userId = access.context.userId;
    const accountId = text(body.accountId ?? url.searchParams.get("accountId")) || null;
    const lang = asLang(body.lang ?? url.searchParams.get("lang"));

    const [{ data: profile }, plan] = await Promise.all([
      supabaseAdmin.from("profiles").select("first_name,last_name,email").eq("id", userId).maybeSingle(),
      loadLatestPlan(userId, accountId),
    ]);

    const [journalCount, protectionCount] = await Promise.all([
      countRows({ table: "journal_entries", userId, accountId, applyAccount: true }),
      countRows({
        table: "ntj_alert_rules",
        userId,
        accountId,
        applyAccount: true,
        filter: (q) => q.in("key", ["growth_plan_max_loss", "growth_plan_daily_goal"]),
      }),
    ]);

    const completedMap = deriveMilestones(plan, journalCount, protectionCount);
    let storedRows: any[] = [];
    let storageAvailable = true;

    const existing = await supabaseAdmin
      .from("business_milestones")
      .select("milestone_key,completed_at,metadata")
      .eq("user_id", userId);

    if (existing.error) {
      storageAvailable = false;
    } else {
      storedRows = Array.isArray(existing.data) ? existing.data : [];
    }

    const existingKeys = new Set(storedRows.map((row) => text(row?.milestone_key)));
    const rowsToInsert = BUSINESS_MILESTONE_DEFINITIONS.filter(
      (def) => completedMap.has(def.key) && !existingKeys.has(def.key)
    ).map((def) => ({
      user_id: userId,
      account_id: accountId,
      milestone_key: def.key,
      title: def.title.en,
      description: def.description.en,
      completed_at: new Date().toISOString(),
      metadata: completedMap.get(def.key) ?? {},
      updated_at: new Date().toISOString(),
    }));

    if (storageAvailable && rowsToInsert.length) {
      const inserted = await supabaseAdmin
        .from("business_milestones")
        .upsert(rowsToInsert, { onConflict: "user_id,milestone_key" })
        .select("milestone_key,completed_at,metadata");
      if (!inserted.error) {
        storedRows = [...storedRows, ...((inserted.data as any[]) ?? [])];
        const name = text((profile as any)?.first_name) || text((profile as any)?.email).split("@")[0] || null;
        await Promise.all(rowsToInsert.map((row) => notifyMilestone({ userId, key: row.milestone_key, lang, name })));
      }
    }

    const storedByKey = new Map(storedRows.map((row) => [text(row?.milestone_key), row]));
    const milestones: BusinessMilestoneProgress[] = BUSINESS_MILESTONE_DEFINITIONS.map((def) => {
      const stored = storedByKey.get(def.key);
      const computed = completedMap.get(def.key);
      return {
        ...def,
        completed: Boolean(stored || computed),
        completedAt: text(stored?.completed_at) || null,
        metadata: (stored?.metadata && typeof stored.metadata === "object" ? stored.metadata : computed) ?? {},
      };
    });

    const completedCount = milestones.filter((item) => item.completed).length;

    return NextResponse.json({
      ok: true,
      storageAvailable,
      milestones,
      completedCount,
      totalCount: milestones.length,
      newMilestones: rowsToInsert.map((row) => row.milestone_key),
    });
  } catch (err: any) {
    console.error("[business-milestones/sync] error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handler(req);
}

export async function POST(req: Request) {
  return handler(req);
}
