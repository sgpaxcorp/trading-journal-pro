import { NextRequest, NextResponse } from "next/server";

import { evaluateAlertRulesForUser } from "@/lib/alertRuleEngineServer";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

async function handleRequest(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const langHeader = (req.headers.get("x-ntj-lang") || "en").toLowerCase();
    const lang = langHeader.startsWith("es") ? "es" : "en";
    const result = await evaluateAlertRulesForUser(access.context.userId, { lang });

    return NextResponse.json({ ok: true, ...result });
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
