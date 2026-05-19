import { NextResponse } from "next/server";
import { webullRequest, formatWebullError } from "@/lib/webullClient";
import { requireBrokerSyncAddon } from "@/lib/serverFeatureAccess";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

export async function GET(req: Request) {
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

    const data = await webullRequest(auth.userId, { path: "/account/list", method: "GET" });
    return NextResponse.json({ accounts: data?.data ?? data?.accounts ?? data });
  } catch (err: any) {
    return NextResponse.json(formatWebullError(err), { status: 500 });
  }
}
