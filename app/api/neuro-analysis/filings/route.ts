import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

function sanitizeTicker(value: string | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

export async function GET(req: Request) {
  const authUser = await getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const smartToolsGate = await requireSmartToolsOwner(authUser);
  if (smartToolsGate) return smartToolsGate;

  const url = new URL(req.url);
  const ticker = sanitizeTicker(url.searchParams.get("ticker"));

  let query = supabaseAdmin
    .from("neuro_analysis_filings")
    .select(
      "id,ticker,form,fiscal_year,period,period_end,file_name,openai_file_id,vector_store_id,bytes,usage_bytes,status,expires_at,created_at"
    )
    .eq("user_id", authUser.userId)
    .order("ticker", { ascending: true })
    .order("fiscal_year", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (ticker) query = query.eq("ticker", ticker);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    filings: (data ?? []).map((row: any) => ({
      id: row.id,
      ticker: row.ticker,
      form: row.form,
      fiscalYear: row.fiscal_year,
      period: row.period,
      periodEnd: row.period_end,
      fileName: row.file_name,
      fileId: row.openai_file_id,
      vectorStoreId: row.vector_store_id,
      bytes: row.bytes,
      usageBytes: row.usage_bytes,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    })),
  });
}
