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
  const analysisId = searchParams.get("analysisId");
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

  try {
    const body = await req.json();
    const analysisId = body?.analysisId ?? null;
    const reportCreatedAt = body?.reportCreatedAt ?? null;
    const title = body?.title ?? null;
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
