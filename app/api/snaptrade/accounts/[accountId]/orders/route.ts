import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { getSnaptradeUser } from "@/lib/snaptradeStorage";
import { snaptradeRequest } from "@/lib/snaptradeClient";
import { hasActiveEntitlement } from "@/lib/entitlementsServer";

export const runtime = "nodejs";

function queryToObject(searchParams: URLSearchParams) {
  const out: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (value !== undefined && value !== null && value !== "") {
      out[key] = value;
    }
  });
  return out;
}

export async function GET(
  req: Request,
  { params }: { params: { accountId: string } }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const entitled = await hasActiveEntitlement(auth.userId, "broker_sync");
    if (!entitled) {
      return NextResponse.json({ error: "Broker sync add-on required" }, { status: 402 });
    }

    const row = await getSnaptradeUser(auth.userId);
    if (!row) {
      return NextResponse.json({ error: "SnapTrade not connected" }, { status: 400 });
    }

    const accountId = String(params?.accountId || "");
    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const extra = queryToObject(searchParams);

    const data = await snaptradeRequest<any>(`/accounts/${accountId}/orders`, "GET", {
      query: {
        userId: row.snaptrade_user_id,
        userSecret: row.snaptrade_user_secret,
        ...extra,
      },
    });

    return NextResponse.json({ orders: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "SnapTrade error" }, { status: 500 });
  }
}
