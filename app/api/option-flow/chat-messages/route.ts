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
const CHAT_ROLES = new Set(["user", "assistant", "system"]);

function isUuid(value: unknown) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function clampText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function sanitizeMeta(value: unknown) {
  if (value == null) return null;
  const json = JSON.stringify(value);
  if (json.length > 12_000) {
    throw new Error("Metadata is too large.");
  }
  return JSON.parse(json);
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
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }
  try {
    const { data, error } = await supabaseAdmin
      .from("option_flow_chat_messages")
      .select("id, role, content, meta, created_at")
      .eq("user_id", auth.userId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw error;
    const messages = (data ?? [])
      .map((row) => {
        const meta = (row.meta as any) || {};
        return {
          id: row.id,
          role: row.role,
          title: meta.title,
          body: meta.body || row.content,
          html: meta.html,
          keyTrades: meta.keyTrades,
          meta: meta.meta,
        };
      })
      .reverse();
    return NextResponse.json({ messages });
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
    const limiter = await rateLimit(`option-flow-chat-message:${auth.userId}:${getClientIp(req)}`, {
      limit: 45,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many chat messages. Please wait a moment." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = body?.sessionId;
    const role = String(body?.role ?? "").trim();
    const content = clampText(body?.content, 6_000);
    let meta: unknown = null;
    try {
      meta = sanitizeMeta(body?.meta ?? null);
    } catch (metaErr: any) {
      return NextResponse.json({ error: metaErr?.message || "Invalid metadata." }, { status: 400 });
    }

    if (!isUuid(sessionId) || !CHAT_ROLES.has(role) || !content) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("option_flow_chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session?.id) {
      return NextResponse.json({ error: "Chat session not found." }, { status: 404 });
    }

    const { error } = await supabaseAdmin.from("option_flow_chat_messages").insert({
      session_id: sessionId,
      user_id: auth.userId,
      role,
      content,
      meta,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unknown error" }, { status: 500 });
  }
}
