import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;
    const body = await req.json().catch(() => ({}));
    const accountId = String(body?.accountId || "").trim();

    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    }

    const { data: account, error: accErr } = await supabaseAdmin
      .from("trading_accounts")
      .select("id")
      .eq("id", accountId)
      .eq("user_id", userId)
      .maybeSingle();

    if (accErr || !account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const { error: upsertErr } = await supabaseAdmin
      .from("user_preferences")
      .upsert(
        { user_id: userId, active_account_id: accountId, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (upsertErr) throw upsertErr;

    return NextResponse.json({ ok: true, activeAccountId: accountId });
  } catch (err: any) {
    console.error("[trading-accounts/set-active] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
