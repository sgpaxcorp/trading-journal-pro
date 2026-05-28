import { NextRequest, NextResponse } from "next/server";

import { dispatchProfitLossAlerts } from "@/lib/profitLossTrackNotifications";
import { requireCronSecret } from "@/lib/cronAuth";

export const runtime = "nodejs";

async function handleRequest(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const forceParam = url.searchParams.get("force");
    const explicitUserId = url.searchParams.get("userId");
    const force = forceParam === "1" || forceParam === "true";

    const cronAuth = requireCronSecret(req);
    if (!cronAuth.ok) return cronAuth.response;

    const result = await dispatchProfitLossAlerts({
      userId: force ? explicitUserId ?? null : null,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
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
