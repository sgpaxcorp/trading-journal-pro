import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cronAuth";
import { processOptionFlowOpenInterestReconciliation } from "@/lib/optionFlowOpenInterestServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function newYorkClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

async function handle(req: Request) {
  const cronAuth = requireCronSecret(req);
  if (!cronAuth.ok) return cronAuth.response;
  const url = new URL(req.url);
  const clock = newYorkClock();
  const force = url.searchParams.get("force") === "1";
  if (!force && clock.hour !== 8) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "OI reconciliation runs only at 8 AM America/New_York.",
      newYorkClock: clock,
    });
  }
  try {
    const result = await processOptionFlowOpenInterestReconciliation({
      marketDate: String(url.searchParams.get("marketDate") ?? clock.date),
      symbol: url.searchParams.get("symbol"),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[option-flow/oi-reconciliation] error", error);
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : "Option Flow OI reconciliation failed.",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
