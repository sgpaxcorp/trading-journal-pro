import { NextResponse } from "next/server";
import { webullRequest, formatWebullError } from "@/lib/webullClient";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

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
    const path = process.env.WEBULL_PATH_BALANCES || "/asset/balance";
    const data = await webullRequest(auth.userId, {
      path,
      method: "GET",
      query: { account_id: accountId },
    });
    return NextResponse.json({ balances: data?.data ?? data });
  } catch (err: any) {
    return NextResponse.json(formatWebullError(err), { status: 500 });
  }
}
