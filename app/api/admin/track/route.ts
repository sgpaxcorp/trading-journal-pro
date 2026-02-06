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
    const sessionId = String(body?.sessionId || "");
    if (!path || !sessionId) return NextResponse.json({ ok: false }, { status: 400 });

    await supabaseAdmin.from("usage_events").insert({
      user_id: authData.user.id,
      path,
      session_id: sessionId,
      user_agent: req.headers.get("user-agent") || null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[admin/track] error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
