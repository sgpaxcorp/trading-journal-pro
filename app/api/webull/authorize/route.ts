import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthUser } from "@/lib/authServer";
import { buildWebullAuthUrl } from "@/lib/webullClient";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({} as any));

    const state = crypto.randomBytes(12).toString("hex");
    const scope =
      typeof body?.scope === "string"
        ? body.scope
        : process.env.WEBULL_SCOPE?.trim() || undefined;
    const url = buildWebullAuthUrl({ state, scope });

    const res = NextResponse.json({ url });
    res.cookies.set("webull_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    });
    res.cookies.set("webull_oauth_uid", auth.userId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Webull OAuth error" }, { status: 500 });
  }
}
