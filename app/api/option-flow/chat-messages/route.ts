import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getAuthUser } from "@/lib/authServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  try {
    const body = await req.json();
    const sessionId = body?.sessionId;
    const role = body?.role;
    const content = String(body?.content || "");
    const meta = body?.meta ?? null;
    if (!sessionId || !role || !content) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
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
