import { NextRequest, NextResponse } from "next/server";

import { evaluateAlertRulesForUser, evaluateAlertRulesForUsers, listUsersWithEnabledAlertRules } from "@/lib/alertRuleEngineServer";
import { requireCronSecret } from "@/lib/cronAuth";

export const runtime = "nodejs";

async function handleRequest(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const explicitUserId = url.searchParams.get("userId");
    const maxUsers = Math.max(1, Number(url.searchParams.get("maxUsers") || 100000));
    const concurrency = Math.max(1, Number(url.searchParams.get("concurrency") || 10));

    const cronAuth = requireCronSecret(req);
    if (!cronAuth.ok) return cronAuth.response;

    if (explicitUserId) {
      const userId = explicitUserId;
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
