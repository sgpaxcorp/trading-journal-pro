import { NextResponse } from "next/server";
import { getSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError, snaptradeDeleteUser } from "@/lib/snaptradeClient";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;
    const auth = { userId: access.context.userId };
    const limiter = await rateLimit(`snaptrade-reset:user:${auth.userId}`, {
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

    const brokerSyncFree =
      process.env.BROKER_SYNC_FREE === "true" || process.env.NEXT_PUBLIC_BROKER_SYNC_FREE === "true";
    if (!brokerSyncFree) {
      const brokerGate = await requireBrokerSyncAddon(auth.userId);
      if (brokerGate) return brokerGate;
    }

    const row = await getSnaptradeUser(auth.userId);
    const targetUserId = row?.snaptrade_user_id || auth.userId;

    try {
      await snaptradeDeleteUser(targetUserId);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      const notFound =
        msg.toLowerCase().includes("not found") ||
        msg.toLowerCase().includes("does not exist") ||
        msg.includes("(1011)");
      if (!notFound) throw err;
    }

    await supabaseAdmin.from("snaptrade_users").delete().eq("user_id", auth.userId);

    return NextResponse.json({ ok: true, reset: true });
  } catch (err: any) {
    return NextResponse.json(formatSnaptradeError(err), { status: 500 });
  }
}
