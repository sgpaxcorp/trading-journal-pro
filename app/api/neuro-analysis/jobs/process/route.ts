import { NextRequest, NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cronAuth";
import { processNeuroJobBatch } from "@/lib/neuroAnalysisJobWorker";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return auth.response;

  try {
    return NextResponse.json({ ok: true, ...(await processNeuroJobBatch(3)) });
  } catch (error) {
    console.error("[neuro-analysis/jobs/process] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Job worker failed." },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
