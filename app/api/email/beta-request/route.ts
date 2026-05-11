import { NextRequest, NextResponse } from "next/server";

import { sendBetaRequestEmail } from "@/lib/email";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  const name = String(body?.name ?? "")
    .trim()
    .slice(0, 120);
  const feature = String(body?.feature ?? "option_flow").trim().toLowerCase();

  if (feature !== "option_flow") {
    return NextResponse.json({ error: "Unsupported beta request." }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }

  const ip = getClientIp(req);
  const limiter = await rateLimit(`beta-request:${email}:${ip}`, {
    limit: 3,
    windowMs: 60 * 60 * 1000,
  });

  if (!limiter.allowed) {
    return NextResponse.json(
      { error: "Too many beta requests. Please try again later." },
      { status: 429, headers: rateLimitHeaders(limiter) }
    );
  }

  try {
    await sendBetaRequestEmail({
      email,
      name: name || email,
    });

    return NextResponse.json(
      {
        ok: true,
        message: "Beta access request sent.",
      },
      { headers: rateLimitHeaders(limiter) }
    );
  } catch (error) {
    console.error("[beta-request] failed", error);
    return NextResponse.json(
      { error: "Could not send beta request right now." },
      { status: 500, headers: rateLimitHeaders(limiter) }
    );
  }
}
