import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { getSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError, snaptradeDeleteUser } from "@/lib/snaptradeClient";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
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
