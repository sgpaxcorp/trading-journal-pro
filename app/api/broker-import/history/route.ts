import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ items: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) return NextResponse.json({ items: [] }, { status: 401 });

    const userId = authData.user.id;

    const { data, error } = await supabaseAdmin
      .from("trade_import_batches")
      .select(
        "id, broker, filename, comment, status, imported_rows, duplicates, started_at, finished_at, duration_ms"
      )
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(10); // ✅ últimos 10

    if (error) {
      return NextResponse.json(
        { items: [], error: error.message ?? "Failed to load import history" },
        { status: 500 }
      );
    }

    return NextResponse.json({ items: data ?? [] }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { items: [], error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
