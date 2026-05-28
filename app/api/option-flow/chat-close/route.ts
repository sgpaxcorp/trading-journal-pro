import { NextRequest, NextResponse } from "next/server";
import { getOptionFlowBetaApiPayload, hasOptionFlowBetaAccess, resolveOptionFlowLang } from "@/lib/optionFlowBeta";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getAuthUser } from "@/lib/authServer";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BYPASS_BETA_GATE =
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "").toLowerCase() === "true" ||
  String(process.env.OPTIONFLOW_BYPASS_ENTITLEMENT ?? "") === "1";

function isUuid(value: unknown) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!BYPASS_BETA_GATE && !(await hasOptionFlowBetaAccess(auth.userId))) {
    return NextResponse.json(
      getOptionFlowBetaApiPayload(resolveOptionFlowLang(req.headers.get("accept-language"))),
      { status: 403 }
    );
  }
  try {
    const limiter = await rateLimit(`option-flow-chat-close:${auth.userId}:${getClientIp(req)}`, {
      limit: 30,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many close requests. Please wait a moment." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = body?.sessionId;
    if (!isUuid(sessionId)) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }
    const { error } = await supabaseAdmin
      .from("option_flow_chat_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("user_id", auth.userId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
