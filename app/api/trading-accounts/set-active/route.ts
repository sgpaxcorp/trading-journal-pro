import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const userId = access.context.userId;
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
