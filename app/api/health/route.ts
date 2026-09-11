import { NextResponse } from "next/server";

import { getProductionConfigStatus } from "@/lib/releaseConfig";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const startedAt = Date.now();
  const config = getProductionConfigStatus();
  const { error } = await supabaseAdmin.from("profiles").select("id").limit(1);
  const databaseReady = !error;
  const ready = config.ready && databaseReady;

  return NextResponse.json(
    {
      status: ready ? "ready" : "degraded",
      checks: {
        configuration: config.ready,
        database: databaseReady,
      },
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "local",
      responseMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
