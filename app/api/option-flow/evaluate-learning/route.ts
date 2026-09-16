import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cronAuth";
import { evaluateOptionFlowLearningRuns } from "@/lib/optionFlowLearningServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleRequest(req: Request) {
  const cronAuth = requireCronSecret(req);
  if (!cronAuth.ok) return cronAuth.response;

  try {
    const result = await evaluateOptionFlowLearningRuns({ limit: 20 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("[option-flow/evaluate-learning] error:", error);
    return NextResponse.json(
      { error: error?.message || "Option Flow learning evaluation failed." },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handleRequest(req);
}

export async function POST(req: Request) {
  return handleRequest(req);
}
