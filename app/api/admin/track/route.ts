import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ ok: false }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const body = await req.json();
    const path = String(body?.path || "");
    let sessionId = String(body?.sessionId || "");
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
