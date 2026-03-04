import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { webullRequest, formatWebullError } from "@/lib/webullClient";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const data = await webullRequest(auth.userId, { path: "/account/list", method: "GET" });
    return NextResponse.json({ accounts: data?.data ?? data?.accounts ?? data });
  } catch (err: any) {
    return NextResponse.json(formatWebullError(err), { status: 500 });
  }
}
