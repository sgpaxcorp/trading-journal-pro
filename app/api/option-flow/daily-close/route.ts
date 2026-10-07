import { NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cronAuth";
import { processOptionFlowDailyClose } from "@/lib/optionFlowProfileServer";

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
  if (!force && clock.hour !== 18) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "The collector runs only at 6 PM America/New_York.",
      newYorkClock: clock,
    });
  }
  try {
    const result = await processOptionFlowDailyClose({
      sessionDate: String(url.searchParams.get("sessionDate") ?? clock.date),
      symbol: url.searchParams.get("symbol"),
      runMaterialAgents:
        String(process.env.OPTIONFLOW_DAILY_AGENTS ?? "true").toLowerCase() !== "false",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("[option-flow/daily-close] error", error);
    return NextResponse.json(
      { error: error?.message || "Option Flow daily close processing failed." },
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
