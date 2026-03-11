import { NextRequest, NextResponse } from "next/server";

import { notifyGoalAchievement } from "@/lib/goalAchievementNotifications";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const NY_TZ = "America/New_York";

function getNyDateString() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

async function handleRequest(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const forceParam = url.searchParams.get("force");
    const force = forceParam === "1" || forceParam === "true";

    const secret = process.env.CRON_SECRET || "";
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const vercelCronHeader = req.headers.get("x-vercel-cron");
    const isVercelCron = Boolean(vercelCronHeader) && vercelCronHeader !== "false";
    const hasValidSecret = Boolean(secret) && token === secret;
    let forceUserId: string | null = null;

    if (force && token && !hasValidSecret) {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (!authErr && authData?.user?.id) {
        forceUserId = authData.user.id;
      }
    }

    if (!isVercelCron && !hasValidSecret && !forceUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nyDate = getNyDateString();

    let snapshotsQuery = supabaseAdmin
      .from("daily_snapshots")
      .select("user_id")
      .eq("date", nyDate)
      .eq("goal_met", true);

    if (forceUserId) {
      snapshotsQuery = snapshotsQuery.eq("user_id", forceUserId);
    }

    const { data: snapshots, error: snapError } = await snapshotsQuery;
    if (snapError) {
      return NextResponse.json({ error: snapError.message }, { status: 500 });
    }

    const userIds = Array.from(new Set((snapshots ?? []).map((row: any) => String(row?.user_id ?? "")).filter(Boolean)));
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, inAppInserted: 0, detail: "No goal-met users today." });
    }

    let sent = 0;
    let inAppInserted = 0;
    const results: Array<Record<string, unknown>> = [];

    for (const userId of userIds) {
      const result = await notifyGoalAchievement({
        userId,
        goalScope: "day",
        periodKey: nyDate,
        metadata: {
          source: "daily_goal_cron",
          snapshot_date: nyDate,
        },
      });

      sent += Number(result.pushSent ?? 0);
      inAppInserted += result.inAppInserted ? 1 : 0;
      results.push({
        userId,
        pushSent: result.pushSent,
        inAppInserted: result.inAppInserted,
      });
    }

    return NextResponse.json({ ok: true, sent, inAppInserted, results });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}
