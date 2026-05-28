import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

function bearerToken(req: Request | NextRequest): string {
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.replace(/^Bearer\s+/i, "").trim();
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function requireCronSecret(req: Request | NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Cron secret is not configured." },
        { status: 500 }
      ),
    };
  }

  const token = bearerToken(req);
  if (!token || !safeEqual(token, secret)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true as const };
}

