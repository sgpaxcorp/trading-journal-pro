// app/api/analytics/snapshot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ snapshot: null, topEdges: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ snapshot: null, topEdges: [] }, { status: 401 });
    }

    const userId = authData.user.id;

    const { data: snap, error: snapErr } = await supabaseAdmin
      .from("analytics_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("as_of_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapErr) throw snapErr;

    if (!snap) {
      return NextResponse.json({ snapshot: null, topEdges: [] });
    }

    const asOf = snap.as_of_date;

    const { data: edges, error: edgesErr } = await supabaseAdmin
      .from("analytics_edges")
      .select(
        "symbol, time_bucket, dow, dte_bucket, edge_score, confidence, n_sessions, win_rate_shrunk, expectancy"
      )
      .eq("user_id", userId)
      .eq("as_of_date", asOf)
      .order("edge_score", { ascending: false })
      .limit(200);

    if (edgesErr) throw edgesErr;

    return NextResponse.json({
      snapshot: snap,
      topEdges: edges ?? [],
    });
  } catch (err: any) {
    console.error("[analytics/snapshot] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
