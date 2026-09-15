import { NextRequest, NextResponse } from "next/server";

import {
  buildDashboardCoachSource,
  dashboardCoachInstructions,
  dashboardCoachSourceSignature,
  DASHBOARD_COACH_RESPONSE_FORMAT,
  normalizeDashboardCoachPlan,
  type DashboardCoachPlan,
} from "@/lib/dashboardCoachPlan";
import { recordAiUsage, requireAiBudget } from "@/lib/aiUsageServer";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireAdvancedPlan } from "@/lib/serverFeatureAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function marketDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function parseJson(value: unknown) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function storedPlanFrom(metadata: any, storageKey: string): DashboardCoachPlan | null {
  const plan = metadata?.dashboardPlans?.[storageKey];
  if (!plan || typeof plan !== "object" || !plan.actionPlan) return null;
  return plan as DashboardCoachPlan;
}

async function requestCoachPlan(params: {
  language: "en" | "es";
  source: ReturnType<typeof buildDashboardCoachSource>;
}) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_COACH_OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI Coach is not configured.");

  const baseUrl = String(
    process.env.OPENAI_BASE_URL || process.env.AI_COACH_OPENAI_BASE_URL || "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const candidates = Array.from(
    new Set([process.env.AI_COACH_MODEL, "gpt-4o-mini", "gpt-4o"].map((item) => String(item ?? "").trim()).filter(Boolean))
  );
  let lastError: Error | null = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const model = candidates[index]!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 1_000,
          response_format: DASHBOARD_COACH_RESPONSE_FORMAT,
          messages: [
            { role: "system", content: dashboardCoachInstructions(params.language) },
            {
              role: "user",
              content: JSON.stringify(
                {
                  task:
                    params.language === "es"
                      ? "Actualiza el plan operativo del dashboard con toda la evidencia, dando prioridad a la jornada más reciente."
                      : "Update the dashboard operating plan from all evidence, prioritizing the newest session.",
                  source: params.source,
                },
                null,
                2
              ),
            },
          ],
        }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const raw = parseJson(data?.choices?.[0]?.message?.content);
        if (!raw) throw new Error("AI Coach returned an invalid dashboard plan.");
        return { raw, model: String(data?.model ?? model), usage: data?.usage ?? null };
      }

      const message = String(data?.error?.message ?? `OpenAI request failed (${response.status})`);
      const retryableModelIssue =
        response.status >= 400 &&
        response.status < 500 &&
        /model|unsupported|not found|does not exist|invalid/i.test(message);
      lastError = new Error(message);
      if (!retryableModelIssue || index === candidates.length - 1) throw lastError;
    } catch (error: any) {
      if (error?.name === "AbortError") throw new Error("AI Coach dashboard refresh timed out.");
      lastError = error instanceof Error ? error : new Error(String(error));
      if (index === candidates.length - 1) throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("AI Coach dashboard refresh failed.");
}

export async function GET(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;
    const userId = access.context.userId;

    const advancedGate = await requireAdvancedPlan(userId);
    if (advancedGate) return advancedGate;

    const accountId = String(req.nextUrl.searchParams.get("accountId") ?? "").trim();
    const language = req.nextUrl.searchParams.get("language") === "es" ? "es" : "en";
    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId." }, { status: 400 });
    }

    const requestLimit = await rateLimit(
      `dashboard-coach-plan:${userId}:${getClientIp(req)}`,
      { limit: 30, windowMs: 60_000 }
    );
    if (!requestLimit.allowed) {
      return NextResponse.json(
        { error: "Dashboard coach refresh is temporarily limited." },
        { status: 429, headers: rateLimitHeaders(requestLimit) }
      );
    }

    const asOfDate = marketDateKey();
    const storageKey = `${accountId}:${language}`;
    const [accountResult, entriesResult, planResult, threadsResult] = await Promise.all([
      supabaseAdmin
        .from("trading_accounts")
        .select("id,name,account_type")
        .eq("id", accountId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("journal_entries")
        .select("date,pnl,instrument,direction,emotion,tags,respected_plan,notes,updated_at")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .lte("date", asOfDate)
        .order("date", { ascending: false })
        .limit(20),
      supabaseAdmin
        .from("growth_plans")
        .select("starting_balance,target_balance,target_date,daily_target_pct,daily_goal_percent,max_daily_loss_percent,max_risk_per_trade_percent,max_risk_per_trade_usd,steps,rules,updated_at")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .maybeSingle(),
      supabaseAdmin
        .from("ai_coach_threads")
        .select("id,summary,metadata,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(25),
    ]);

    if (accountResult.error || !accountResult.data) {
      return NextResponse.json({ error: "Trading account not found." }, { status: 404 });
    }
    if (entriesResult.error) throw entriesResult.error;
    if (planResult.error && (planResult.error as any)?.code !== "PGRST116") throw planResult.error;
    if (threadsResult.error && (threadsResult.error as any)?.code !== "42P01") throw threadsResult.error;

    const dates = (entriesResult.data ?? []).map((entry: any) => String(entry?.date ?? "").slice(0, 10)).filter(Boolean);
    const tradesResult = dates.length
      ? await supabaseAdmin
          .from("journal_trades")
          .select("journal_date,symbol,kind,side,strategy")
          .eq("user_id", userId)
          .eq("account_id", accountId)
          .in("journal_date", dates)
      : { data: [], error: null };
    if (tradesResult.error && (tradesResult.error as any)?.code !== "42P01") throw tradesResult.error;

    const source = buildDashboardCoachSource({
      account: accountResult.data,
      entries: entriesResult.data ?? [],
      trades: tradesResult.data ?? [],
      plan: planResult.data ?? null,
      asOfDate,
    });
    const sourceSignature = `${dashboardCoachSourceSignature(source)}:${language}`;
    const threads = Array.isArray(threadsResult.data) ? threadsResult.data : [];
    const stored = threads
      .map((thread: any) => storedPlanFrom(thread?.metadata, storageKey))
      .find(Boolean) ?? null;

    if (stored?.sourceSignature === sourceSignature) {
      return NextResponse.json({ plan: stored, cached: true, stale: false });
    }

    const legacy = stored ?? null;
    if (!source.sessions.length) {
      return NextResponse.json({ plan: legacy, cached: true, stale: Boolean(legacy) });
    }

    const budgetGate = await requireAiBudget({ userId, category: "advanced" });
    if (budgetGate) {
      return legacy
        ? NextResponse.json({ plan: legacy, cached: true, stale: true })
        : budgetGate;
    }

    let generated: Awaited<ReturnType<typeof requestCoachPlan>>;
    try {
      generated = await requestCoachPlan({ language, source });
    } catch (error) {
      if (legacy) {
        console.warn("[dashboard-coach-plan] refresh failed; serving prior account plan:", error);
        return NextResponse.json({ plan: legacy, cached: true, stale: true });
      }
      throw error;
    }
    const plan = normalizeDashboardCoachPlan({
      raw: generated.raw,
      source,
      sourceSignature,
      language,
    });

    await recordAiUsage({
      userId,
      requestId: req.headers.get("x-request-id"),
      feature: "ai_coach",
      category: "advanced",
      operation: "dashboard_plan_refresh",
      model: generated.model,
      usage: generated.usage,
      metadata: {
        accountId,
        sourceDate: plan.sourceDate,
        sourceSignature,
      },
    });

    const targetThread = threads[0] ?? null;
    const existingMetadata = targetThread?.metadata && typeof targetThread.metadata === "object"
      ? targetThread.metadata
      : {};
    const metadata = {
      ...existingMetadata,
      dashboardPlans: {
        ...(existingMetadata?.dashboardPlans ?? {}),
        [storageKey]: plan,
      },
      latestActionPlan: plan.actionPlan,
      dashboardPlanSource: {
        accountId,
        sourceDate: plan.sourceDate,
        sourceSignature,
        generatedAt: plan.generatedAt,
      },
    };

    if (targetThread?.id) {
      const { error } = await supabaseAdmin
        .from("ai_coach_threads")
        .update({ metadata })
        .eq("id", targetThread.id)
        .eq("user_id", userId);
      if (error) console.warn("[dashboard-coach-plan] persistence update failed:", error.message);
    } else {
      const { error } = await supabaseAdmin.from("ai_coach_threads").insert({
        user_id: userId,
        title: "Business AI Coaching",
        summary: plan.summary,
        metadata,
      });
      if (error) console.warn("[dashboard-coach-plan] persistence insert failed:", error.message);
    }

    return NextResponse.json({ plan, cached: false, stale: false });
  } catch (error: any) {
    console.error("[dashboard-coach-plan] GET error:", error);
    return NextResponse.json(
      { error: error?.message ?? "Dashboard coach refresh failed." },
      { status: 500 }
    );
  }
}
