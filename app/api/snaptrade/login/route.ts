import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { ensureSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError, snaptradeLogin } from "@/lib/snaptradeClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({} as any));
    const row = await ensureSnaptradeUser(auth.userId);

    const payload: Record<string, unknown> = {};
    if (body?.broker) payload.broker = body.broker;
    if (body?.immediateRedirect !== undefined) payload.immediateRedirect = body.immediateRedirect;
    if (body?.customRedirect) payload.customRedirect = body.customRedirect;
    if (body?.connectionType) payload.connectionType = body.connectionType;
    if (body?.darkMode !== undefined) payload.darkMode = body.darkMode;

    const data = await snaptradeLogin({
      userId: row.snaptrade_user_id,
      userSecret: row.snaptrade_user_secret,
      broker: payload.broker as string | undefined,
      immediateRedirect: payload.immediateRedirect as boolean | undefined,
      customRedirect: payload.customRedirect as string | undefined,
      connectionType: payload.connectionType as "read" | "trade" | undefined,
      darkMode: payload.darkMode as boolean | undefined,
    });

    const url = data?.redirectURI || data?.redirectUri || data?.url || "";
    if (!url) {
      return NextResponse.json({ error: "Missing redirect URI" }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (err: any) {
    return NextResponse.json(formatSnaptradeError(err), { status: 500 });
  }
}
