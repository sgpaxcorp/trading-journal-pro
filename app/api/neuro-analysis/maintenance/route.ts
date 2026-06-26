import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cronAuth";
import { enqueueNeuroJob } from "@/lib/neuroAnalysisJobs";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return auth.response;

  try {
    const now = Date.now();
    const soon = new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("neuro_analysis_filings")
      .select("id,user_id,ticker,form,expires_at,vector_store_id")
      .is("deleted_at", null)
      .not("expires_at", "is", null)
      .lte("expires_at", soon)
      .limit(250);
    if (error) throw error;

    const rows = data ?? [];
    for (const row of rows as any[]) {
      await supabaseAdmin
        .from("neuro_analysis_filings")
        .update({
          last_verified_at: new Date().toISOString(),
          stale_reason: "vector_store_expiring",
        })
        .eq("id", row.id);
      await enqueueNeuroJob({
        userId: row.user_id,
        jobType: "filing_vector_store_refresh",
        payload: {
          filingId: row.id,
          ticker: row.ticker,
          form: row.form,
          vectorStoreId: row.vector_store_id,
          expiresAt: row.expires_at,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      checked: rows.length,
      queued: rows.length,
    });
  } catch (error: any) {
    console.error("[neuro-analysis/maintenance] error:", error);
    return NextResponse.json({ error: error?.message || "Maintenance failed." }, { status: 500 });
  }
}
