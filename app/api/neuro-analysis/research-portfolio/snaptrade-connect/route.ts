import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { formatSnaptradeError, snaptradeLogin } from "@/lib/snaptradeClient";
import { ensureNeuroAnalysisSnaptradeUser } from "@/lib/snaptradeStorage";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const body = await req.json().catch(() => ({} as any));
    const row = await ensureNeuroAnalysisSnaptradeUser(authUser.userId);

    const data = await snaptradeLogin({
      userId: row.snaptrade_user_id,
      userSecret: row.snaptrade_user_secret,
      broker: body?.broker ? String(body.broker) : undefined,
      immediateRedirect: true,
      customRedirect: body?.customRedirect ? String(body.customRedirect) : undefined,
      connectionType: "read",
      darkMode: body?.darkMode === undefined ? true : Boolean(body.darkMode),
    });

    const url = data?.redirectURI || data?.redirectUri || data?.url || "";
    if (!url) {
      return NextResponse.json({ error: "Missing broker connection URL." }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (error: any) {
    return NextResponse.json(formatSnaptradeError(error), { status: 500 });
  }
}
