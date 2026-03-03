import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { ensureSnaptradeUser, getSnaptradeUser } from "@/lib/snaptradeStorage";
import { hasActiveEntitlement } from "@/lib/entitlementsServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const entitled = await hasActiveEntitlement(auth.userId, "broker_sync");
    if (!entitled) {
      return NextResponse.json({ error: "Broker sync add-on required" }, { status: 402 });
    }

    const existing = await getSnaptradeUser(auth.userId);
    if (existing?.snaptrade_user_secret) {
      return NextResponse.json({ ok: true, registered: true, userId: existing.snaptrade_user_id });
    }

    const row = await ensureSnaptradeUser(auth.userId);
    return NextResponse.json({ ok: true, registered: false, userId: row.snaptrade_user_id });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "SnapTrade error" }, { status: 500 });
  }
}
