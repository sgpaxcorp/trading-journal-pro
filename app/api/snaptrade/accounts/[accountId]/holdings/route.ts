import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { getSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError, snaptradeGetHoldings } from "@/lib/snaptradeClient";

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

    const data = await snaptradeGetHoldings(row.snaptrade_user_id, row.snaptrade_user_secret, accountId);
    return NextResponse.json({ holdings: data?.holdings ?? data });
  } catch (err: any) {
    return NextResponse.json(formatSnaptradeError(err), { status: 500 });
  }
}
