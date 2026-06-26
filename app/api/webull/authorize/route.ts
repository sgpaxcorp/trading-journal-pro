import { NextResponse } from "next/server";
import crypto from "crypto";
import { buildWebullAuthUrl } from "@/lib/webullClient";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;
    const auth = { userId: access.context.userId };
    const limiter = await rateLimit(`webull-authorize:user:${auth.userId}`, {
      limit: 10,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(limiter),
          },
        }
      );
    }

    const brokerSyncFree =
      process.env.BROKER_SYNC_FREE === "true" || process.env.NEXT_PUBLIC_BROKER_SYNC_FREE === "true";
    if (!brokerSyncFree) {
      const brokerGate = await requireBrokerSyncAddon(auth.userId);
      if (brokerGate) return brokerGate;
    }

    const state = crypto.randomBytes(12).toString("hex");
    const scope = process.env.WEBULL_SCOPE?.trim() || undefined;
    const url = buildWebullAuthUrl({ state, scope });

    const res = NextResponse.json({ url });
    const secureCookie = process.env.NODE_ENV === "production";
    res.cookies.set("webull_oauth_state", state, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    });
    res.cookies.set("webull_oauth_uid", auth.userId, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Webull OAuth error" }, { status: 500 });
  }
}
