import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { webullRequest, formatWebullError } from "@/lib/webullClient";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ accountId: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
