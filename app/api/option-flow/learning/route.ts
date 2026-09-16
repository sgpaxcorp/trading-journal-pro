import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const accessDenied = await requireSmartToolsOwner(auth);
    if (accessDenied) return accessDenied;

    const limiter = await rateLimit(`option-flow-learning:${auth.userId}:${getClientIp(req)}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const url = new URL(req.url);
    const memoryId = String(url.searchParams.get("memoryId") ?? "").trim().slice(0, 80);
    let query = supabaseAdmin
      .from("option_flow_learning_runs")
      .select(
        "id,memory_id,underlying,provider,trade_intent,source_session_date,target_session_date,evaluation_due_at,status,tracked_flows,market_validation,evaluated_at,last_error,created_at,updated_at"
      )
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(memoryId ? 1 : 12);
    if (memoryId) query = query.eq("memory_id", memoryId);
    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(
      { runs: data ?? [] },
      { headers: { ...rateLimitHeaders(limiter), "Cache-Control": "private, no-store" } }
    );
  } catch (error: any) {
    console.error("[option-flow/learning] error:", error);
    return NextResponse.json(
      { error: error?.message || "Could not load Option Flow learning history." },
      { status: 500 }
    );
  }
}
