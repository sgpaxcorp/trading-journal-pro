import { NextRequest, NextResponse } from "next/server";

import { evaluateAlertRulesForUser, evaluateAlertRulesForUsers, listUsersWithEnabledAlertRules } from "@/lib/alertRuleEngineServer";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

async function handleRequest(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const explicitUserId = url.searchParams.get("userId");
    const maxUsers = Math.max(1, Number(url.searchParams.get("maxUsers") || 100000));
    const concurrency = Math.max(1, Number(url.searchParams.get("concurrency") || 10));

    const secret = process.env.CRON_SECRET || "";
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const vercelCronHeader = req.headers.get("x-vercel-cron");
    const isVercelCron = Boolean(vercelCronHeader) && vercelCronHeader !== "false";
    const hasValidSecret = Boolean(secret) && token === secret;

    let actingUserId: string | null = null;
    if (token && !hasValidSecret) {
      const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (!authErr && authData?.user?.id) {
        actingUserId = authData.user.id;
      }
    }

    if (!isVercelCron && !hasValidSecret && !actingUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (actingUserId && explicitUserId && explicitUserId !== actingUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (explicitUserId || actingUserId) {
      const userId = explicitUserId ?? actingUserId!;
      const result = await evaluateAlertRulesForUser(userId, { lang: "en" });
      return NextResponse.json({ ok: true, mode: "single", ...result });
    }

    const userIds = await listUsersWithEnabledAlertRules({ maxUsers });
    const result = await evaluateAlertRulesForUsers(userIds, { lang: "en", concurrency });
    return NextResponse.json({ ok: true, mode: "batch", scannedUsers: userIds.length, ...result });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
