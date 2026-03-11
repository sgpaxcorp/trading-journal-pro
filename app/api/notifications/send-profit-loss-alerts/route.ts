import { NextRequest, NextResponse } from "next/server";

import { dispatchProfitLossAlerts } from "@/lib/profitLossTrackNotifications";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

async function handleRequest(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const forceParam = url.searchParams.get("force");
    const explicitUserId = url.searchParams.get("userId");
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
        if (explicitUserId && explicitUserId !== authData.user.id) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        forceUserId = authData.user.id;
      }
    }

    if (!isVercelCron && !hasValidSecret && !forceUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await dispatchProfitLossAlerts({
      userId: forceUserId ?? explicitUserId ?? null,
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
