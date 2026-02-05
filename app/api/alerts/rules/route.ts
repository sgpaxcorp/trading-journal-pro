import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ rules: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ rules: [] }, { status: 401 });
    }

    const userId = authData.user.id;
    const { searchParams } = new URL(req.url);
    const includeDisabled = searchParams.get("includeDisabled") === "true";
    const limitRaw = Number(searchParams.get("limit") ?? 200);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    let q = supabaseAdmin
      .from("ntj_alert_rules")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!includeDisabled) q = q.eq("enabled", true);

    const { data, error } = await q;
    if (error) throw error;

    return NextResponse.json({ rules: data ?? [] });
  } catch (err: any) {
    console.error("[alerts/rules] error:", err);
    return NextResponse.json(
      { rules: [], error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
