import { NextRequest, NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cronAuth";
import { processEmailDeliveryBatch } from "@/lib/emailDeliveryWorker";
import { requireRuntimeControl } from "@/lib/runtimeControls";

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return auth.response;
  const runtimeGate = await requireRuntimeControl("email_delivery");
  if (runtimeGate) return runtimeGate;

  try {
    return NextResponse.json({ ok: true, ...(await processEmailDeliveryBatch(25)) });
  } catch (error) {
    console.error("[email-jobs/process] error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Email worker failed." },
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

