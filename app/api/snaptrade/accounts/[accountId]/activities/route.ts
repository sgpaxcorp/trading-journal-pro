import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { getSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError, snaptradeGetActivities } from "@/lib/snaptradeClient";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ accountId: string }> }
) {
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
    if (!row) {
      return NextResponse.json({ error: "SnapTrade not connected" }, { status: 400 });
    }

    const { accountId: accountIdParam } = await context.params;
    const accountId = String(accountIdParam || "");
    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Missing startDate/endDate" }, { status: 400 });
    }

    const data = await snaptradeGetActivities(
      row.snaptrade_user_id,
      row.snaptrade_user_secret,
      accountId,
      startDate,
      endDate
    );

    return NextResponse.json({ activities: data?.activities ?? data });
  } catch (err: any) {
    return NextResponse.json(formatSnaptradeError(err), { status: 500 });
  }
}
