import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { webullRequest, formatWebullError } from "@/lib/webullClient";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  context: { params: Promise<{ accountId: string }> | { accountId: string } }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const params = await Promise.resolve((context as any).params);
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
