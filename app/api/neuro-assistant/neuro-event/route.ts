// app/api/neuro-assistant/neuro-event/route.ts
import { NextResponse } from "next/server";

/**
 * Next.js App Router route handlers MUST export named HTTP methods (GET/POST/etc).
 * Do NOT export a default handler. Do NOT export "config" like in the old Pages Router.
 *
 * This file is intentionally minimal: it validates JSON and returns { ok: true }.
 * You can expand it to persist events later.
 */

export const runtime = "nodejs"; // or "edge" if you want edge runtime
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    // Basic shape guard (optional)
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    // TODO: handle event bus payload here if needed
    // e.g., { event: string, ts: number, data: any }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
