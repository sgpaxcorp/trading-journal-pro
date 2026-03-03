import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { getSnaptradeUser } from "@/lib/snaptradeStorage";
import { snaptradeRequest } from "@/lib/snaptradeClient";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const row = await getSnaptradeUser(auth.userId);
    if (!row) {
      return NextResponse.json({ error: "SnapTrade not connected" }, { status: 400 });
    }

    const data = await snaptradeRequest<any>("/accounts", "GET", {
      query: {
        userId: row.snaptrade_user_id,
        userSecret: row.snaptrade_user_secret,
      },
    });

    return NextResponse.json({ accounts: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "SnapTrade error" }, { status: 500 });
  }
}
