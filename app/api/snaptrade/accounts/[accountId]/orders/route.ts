import { NextRequest, NextResponse } from "next/server";
import { getSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError, snaptradeGetOrders } from "@/lib/snaptradeClient";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";
const MAX_ORDER_LOOKBACK_DAYS = 180;

function queryToObject(searchParams: URLSearchParams) {
  const out: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (value !== undefined && value !== null && value !== "") {
      out[key] = value;
    }
  });
  return out;
}

function parseDays(value?: string) {
  if (!value) return undefined;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_ORDER_LOOKBACK_DAYS) {
    return null;
  }
  return days;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ accountId: string }> }
) {
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
    const extra = queryToObject(searchParams);

    const days = parseDays(extra?.days);
    if (days === null) {
      return NextResponse.json(
        { error: `days must be an integer between 1 and ${MAX_ORDER_LOOKBACK_DAYS}.` },
        { status: 400 }
      );
    }
    const data = await snaptradeGetOrders(row.snaptrade_user_id, row.snaptrade_user_secret, accountId, days);
    return NextResponse.json({ orders: data?.orders ?? data });
  } catch (err: any) {
    return NextResponse.json(formatSnaptradeError(err), { status: 500 });
  }
}
