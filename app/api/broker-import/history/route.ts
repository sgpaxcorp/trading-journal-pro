// app/api/broker-import/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

/**
 * Import History (Option A consistency)
 * Reads: imported_rows, updated_rows, duplicates
 */
export async function GET(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const userId = access.context.userId;

    const { data, error } = await supabaseAdmin
      .from("trade_import_batches")
      .select(
        "id, broker, filename, comment, status, imported_rows, updated_rows, duplicates, order_history_events, order_history_duplicates, order_history_import_id, started_at, finished_at, duration_ms, error"
      )
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(10);

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
