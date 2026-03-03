import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { getSnaptradeUser } from "@/lib/snaptradeStorage";
import { snaptradeRequest } from "@/lib/snaptradeClient";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  context: { params: { accountId: string } | Promise<{ accountId: string }> }
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

    const { accountId: accountIdParam } = await Promise.resolve(context.params);
    const accountId = String(accountIdParam || "");
    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const data = await snaptradeRequest<any>(`/accounts/${accountId}/activities`, "GET", {
      query: {
        userId: row.snaptrade_user_id,
        userSecret: row.snaptrade_user_secret,
        startDate,
        endDate,
      },
    });

    return NextResponse.json({ activities: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "SnapTrade error" }, { status: 500 });
  }
}
