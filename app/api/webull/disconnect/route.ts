import { NextResponse } from "next/server";
import { deleteBrokerOAuthConnection } from "@/lib/brokerOAuthStorage";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireBrokerSyncAccess } from "@/lib/serverFeatureAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;
    const auth = { userId: access.context.userId };
    const limiter = await rateLimit(`webull-disconnect:user:${auth.userId}`, {
      limit: 5,
      windowMs: 10 * 60_000,
    });
    if (!limiter.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(retryAfter), ...rateLimitHeaders(limiter) } }
      );
    }
    const brokerGate = await requireBrokerSyncAccess(auth.userId);
    if (brokerGate) return brokerGate;

    await deleteBrokerOAuthConnection(auth.userId, "webull");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Webull disconnect failed" }, { status: 500 });
  }
}
