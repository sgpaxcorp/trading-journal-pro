import { NextResponse } from "next/server";
import { ensureSnaptradeUser, getSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError } from "@/lib/snaptradeClient";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;
    const auth = { userId: access.context.userId };
    const brokerSyncFree =
      process.env.BROKER_SYNC_FREE === "true" || process.env.NEXT_PUBLIC_BROKER_SYNC_FREE === "true";
    if (!brokerSyncFree) {
      const brokerGate = await requireBrokerSyncAddon(auth.userId);
      if (brokerGate) return brokerGate;
    }

    const existing = await getSnaptradeUser(auth.userId);
    if (existing?.snaptrade_user_secret) {
      return NextResponse.json({ ok: true, registered: true, userId: existing.snaptrade_user_id });
    }

    const row = await ensureSnaptradeUser(auth.userId);
    return NextResponse.json({ ok: true, registered: false, userId: row.snaptrade_user_id });
  } catch (err: any) {
    return NextResponse.json(formatSnaptradeError(err), { status: 500 });
  }
}
