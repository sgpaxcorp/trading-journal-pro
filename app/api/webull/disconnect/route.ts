import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { deleteBrokerOAuthConnection } from "@/lib/brokerOAuthStorage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await deleteBrokerOAuthConnection(auth.userId, "webull");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Webull disconnect failed" }, { status: 500 });
  }
}
