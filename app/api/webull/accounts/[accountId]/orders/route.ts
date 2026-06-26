import { NextResponse } from "next/server";
import { webullRequest, formatWebullError } from "@/lib/webullClient";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";
const MAX_ORDER_LOOKBACK_DAYS = 180;

function parseDays(value: string | null) {
  if (!value) return 30;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_ORDER_LOOKBACK_DAYS) {
    return null;
  }
  return days;
}

export async function GET(
  req: Request,
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

    const params = await context.params;
    const accountId = params.accountId;
    const url = new URL(req.url);
    const daysParam = url.searchParams.get("days");
    const days = parseDays(daysParam);
    if (days === null) {
      return NextResponse.json(
        { error: `days must be an integer between 1 and ${MAX_ORDER_LOOKBACK_DAYS}.` },
        { status: 400 }
      );
    }
    const path = process.env.WEBULL_PATH_ORDERS || "/order/list";
    const query: Record<string, string | number> = { account_id: accountId };
    if (Number.isFinite(days) && days > 0) {
      const end = Date.now();
      const start = end - Math.floor(days) * 24 * 60 * 60 * 1000;
      query.start_time = start;
      query.end_time = end;
    }
    const data = await webullRequest(auth.userId, { path, method: "GET", query });
    return NextResponse.json({ orders: data?.data ?? data });
  } catch (err: any) {
    return NextResponse.json(formatWebullError(err), { status: 500 });
  }
}
