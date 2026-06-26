import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

const MAX_TRACKED_PATH_LENGTH = 2048;

function normalizeTrackedPath(value: unknown) {
  const path = String(value ?? "").trim().slice(0, MAX_TRACKED_PATH_LENGTH);
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "";
  return path;
}

function normalizeSessionId(value: unknown) {
  const sessionId = String(value ?? "").trim();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(sessionId)) return "";
  return sessionId;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ ok: false }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const limiter = await rateLimit(`usage-track:user:${authData.user.id}:${getClientIp(req)}`, {
      limit: 240,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(limiter),
          },
        }
      );
    }

    const body = await req.json();
    const path = normalizeTrackedPath(body?.path);
    const sessionId = normalizeSessionId(body?.sessionId);
    if (!path || !sessionId) return NextResponse.json({ ok: false }, { status: 400 });

    const now = new Date().toISOString();
    const userAgent = req.headers.get("user-agent") || null;

    // Keep/update a session record in Supabase
    try {
      const { data: updated } = await supabaseAdmin
        .from("usage_sessions")
        .update({
          user_id: authData.user.id,
          last_seen_at: now,
          user_agent: userAgent,
        })
        .eq("id", sessionId)
        .eq("user_id", authData.user.id)
        .select("id");

      if (!updated || updated.length === 0) {
        await supabaseAdmin.from("usage_sessions").insert({
          id: sessionId,
          user_id: authData.user.id,
          started_at: now,
          last_seen_at: now,
          user_agent: userAgent,
        });
      }
    } catch (err) {
      console.warn("[admin/track] session upsert warning:", err);
    }

    await supabaseAdmin.from("usage_events").insert({
      user_id: authData.user.id,
      path,
      session_id: sessionId,
      user_agent: userAgent,
      created_at: now,
    });

    return NextResponse.json({ ok: true, sessionId });
  } catch (err: any) {
    console.error("[admin/track] error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
