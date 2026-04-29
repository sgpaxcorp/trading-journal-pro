import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { ensureSnaptradeUser, getSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError } from "@/lib/snaptradeClient";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
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
