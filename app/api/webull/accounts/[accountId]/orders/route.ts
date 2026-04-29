import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { webullRequest, formatWebullError } from "@/lib/webullClient";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ accountId: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    const days = daysParam ? Number(daysParam) : 30;
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
