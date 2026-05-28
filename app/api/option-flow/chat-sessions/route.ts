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

function clampText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function normalizeIsoDate(value: unknown) {
  const text = clampText(value, 80);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export async function GET(req: NextRequest) {
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
  const { searchParams } = new URL(req.url);
  const analysisId = clampText(searchParams.get("analysisId"), 80);
  try {
    let query = supabaseAdmin
      .from("option_flow_chat_sessions")
      .select("id, title, created_at, closed_at, analysis_id")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(8);
    if (analysisId) {
      query = query.eq("analysis_id", analysisId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ sessions: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
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
    const limiter = await rateLimit(`option-flow-chat-session:${auth.userId}:${getClientIp(req)}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many chat session requests. Please wait a moment." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const analysisId = clampText(body?.analysisId, 80) || null;
    const reportCreatedAt = normalizeIsoDate(body?.reportCreatedAt);
    const title = clampText(body?.title, 160) || null;
    const forceNew = Boolean(body?.forceNew);

    if (!forceNew) {
      let query = supabaseAdmin
        .from("option_flow_chat_sessions")
        .select("id, title, created_at, closed_at")
        .eq("user_id", auth.userId)
        .is("closed_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (analysisId) {
        query = query.eq("analysis_id", analysisId);
      }
      const { data } = await query;
      if (Array.isArray(data) && data[0]?.id) {
        return NextResponse.json({ sessionId: data[0].id });
      }
    }

    const { data, error } = await supabaseAdmin
      .from("option_flow_chat_sessions")
      .insert({
        user_id: auth.userId,
        analysis_id: analysisId,
        report_created_at: reportCreatedAt,
        title,
      })
      .select("id")
      .single();
    if (error) throw error;
    return NextResponse.json({ sessionId: data?.id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
