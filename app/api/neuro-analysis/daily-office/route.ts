import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requirePortfolioWriteAccess } from "@/lib/emergencyPortfolioControls";
import { currentMarketDateIso } from "@/lib/neuroDailyInvestmentOffice";
import { generateDailyInvestmentOfficeBriefing } from "@/lib/neuroDailyInvestmentOfficeServer";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { isTradingSessionDate } from "@/lib/tradingCalendar";

export const runtime = "nodejs";
export const maxDuration = 300;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...init?.headers, "Cache-Control": "no-store" },
  });
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim()
  );
}

async function authorizedUser(req: Request) {
  const authUser = await getAuthUser(req);
  if (!authUser) return { response: noStoreJson({ error: "Unauthorized" }, { status: 401 }) } as const;
  const accessGate = await requireSmartToolsOwner(authUser);
  if (accessGate) return { response: accessGate } as const;
  return { authUser } as const;
}

function databaseError(error: any) {
  const code = String(error?.code ?? "");
  if (code === "42P01" || code === "PGRST205") {
    return noStoreJson(
      { error: "Daily Investment Office is not installed. Apply the latest Supabase migration." },
      { status: 503 }
    );
  }
  console.error("[neuro-analysis/daily-office] database error:", error);
  return noStoreJson({ error: "Daily Investment Office is temporarily unavailable." }, { status: 500 });
}

export async function GET(req: Request) {
  const auth = await authorizedUser(req);
  if ("response" in auth) return auth.response;

  const limiter = await rateLimit(`neuro-daily-office:read:${auth.authUser.userId}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limiter.allowed) {
    return noStoreJson(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(limiter) }
    );
  }

  const { data: briefings, error } = await supabaseAdmin
    .from("neuro_daily_investment_briefings")
    .select("*")
    .eq("user_id", auth.authUser.userId)
    .order("briefing_date", { ascending: false })
    .order("version", { ascending: false })
    .limit(10);
  if (error) return databaseError(error);
  const latest = briefings?.[0] ?? null;

  const [reviewsResult, jobsResult] = await Promise.all([
    latest
      ? supabaseAdmin
          .from("neuro_daily_investment_attention_reviews")
          .select("*")
          .eq("user_id", auth.authUser.userId)
          .eq("briefing_id", latest.id)
      : Promise.resolve({ data: [], error: null }),
    supabaseAdmin
      .from("neuro_analysis_jobs")
      .select("id,status,error,run_after,started_at,completed_at,created_at")
      .eq("user_id", auth.authUser.userId)
      .eq("job_type", "daily_investment_office")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (reviewsResult.error) return databaseError(reviewsResult.error);
  if (jobsResult.error) return databaseError(jobsResult.error);

  return noStoreJson({
    latest,
    history: briefings ?? [],
    attentionReviews: reviewsResult.data ?? [],
    generationJob: jobsResult.data ?? null,
    marketDate: currentMarketDateIso(),
  });
}

export async function POST(req: Request) {
  const auth = await authorizedUser(req);
  if ("response" in auth) return auth.response;
  const writeGate = await requirePortfolioWriteAccess();
  if (writeGate) return writeGate;

  const limiter = await rateLimit(`neuro-daily-office:write:${auth.authUser.userId}`, {
    limit: 6,
    windowMs: 60 * 60_000,
  });
  if (!limiter.allowed) {
    return noStoreJson(
      { error: "Rate limit exceeded" },
      { status: 429, headers: rateLimitHeaders(limiter) }
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "").trim();
  if (action === "generate") {
    const briefingDate = currentMarketDateIso();
    if (!isTradingSessionDate(briefingDate, "stocks")) {
      return noStoreJson(
        { error: "A Daily Investment Office briefing is generated only on market days.", code: "non_market_day" },
        { status: 409 }
      );
    }
    try {
      const result = await generateDailyInvestmentOfficeBriefing({
        userId: auth.authUser.userId,
        briefingDate,
      });
      return noStoreJson({ ok: true, generated: true, result });
    } catch (error: any) {
      console.error("[neuro-analysis/daily-office] manual generation failed:", error);
      if (String(error?.message ?? "").includes("READ ONLY")) {
        return noStoreJson({ error: error.message }, { status: 423 });
      }
      if (String(error?.message ?? "").includes("not installed")) return databaseError(error);
      return databaseError(error);
    }
  }

  if (action === "triage") {
    const briefingId = String(body?.briefingId ?? "").trim();
    const alertId = String(body?.alertId ?? "").trim().slice(0, 160);
    const status = String(body?.status ?? "").trim();
    const note = String(body?.note ?? "").trim().slice(0, 2_000) || null;
    if (!isUuid(briefingId) || !alertId || !["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(status)) {
      return noStoreJson({ error: "A valid briefing, alert, and triage status are required." }, { status: 400 });
    }

    const { data: briefing, error: briefingError } = await supabaseAdmin
      .from("neuro_daily_investment_briefings")
      .select("id,briefing")
      .eq("id", briefingId)
      .eq("user_id", auth.authUser.userId)
      .maybeSingle();
    if (briefingError) return databaseError(briefingError);
    const alerts = Array.isArray((briefing?.briefing as any)?.alerts)
      ? (briefing?.briefing as any).alerts
      : [];
    if (!briefing || !alerts.some((alert: any) => String(alert?.id) === alertId)) {
      return noStoreJson({ error: "The selected briefing alert was not found." }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from("neuro_daily_investment_attention_reviews")
      .upsert(
        {
          user_id: auth.authUser.userId,
          briefing_id: briefingId,
          alert_id: alertId,
          status,
          note,
          reviewed_at: status === "OPEN" ? null : new Date().toISOString(),
        },
        { onConflict: "user_id,briefing_id,alert_id" }
      )
      .select("*")
      .single();
    if (error) return databaseError(error);
    return noStoreJson({ ok: true, review: data });
  }

  return noStoreJson({ error: "Unsupported Daily Investment Office action." }, { status: 400 });
}
