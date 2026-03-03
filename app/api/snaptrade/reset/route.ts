import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { getSnaptradeUser } from "@/lib/snaptradeStorage";
import { formatSnaptradeError, snaptradeRequest } from "@/lib/snaptradeClient";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const row = await getSnaptradeUser(auth.userId);
    if (!row) {
      return NextResponse.json({ ok: true, reset: false, reason: "not_connected" });
    }

    await snaptradeRequest("/snapTrade/deleteUser", "DELETE", {
      query: { userId: row.snaptrade_user_id },
    });

    await supabaseAdmin.from("snaptrade_users").delete().eq("user_id", auth.userId);

    return NextResponse.json({ ok: true, reset: true });
  } catch (err: any) {
    return NextResponse.json(formatSnaptradeError(err), { status: 500 });
  }
}
