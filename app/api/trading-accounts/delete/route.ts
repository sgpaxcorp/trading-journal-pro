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
    if (!accountId) return NextResponse.json({ error: "Missing accountId" }, { status: 400 });

    const { data: existing, error: listErr } = await supabaseAdmin
      .from("trading_accounts")
      .select("id, is_default")
      .eq("user_id", userId);

    if (listErr) throw listErr;
    const accounts = existing ?? [];
    if (accounts.length <= 1) {
      return NextResponse.json({ error: "At least one account is required." }, { status: 400 });
    }

    const { data: prefs } = await supabaseAdmin
      .from("user_preferences")
      .select("active_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    const activeAccountId = (prefs as any)?.active_account_id ?? null;
    if (activeAccountId === accountId) {
      return NextResponse.json({ error: "Switch to another account before deleting this one." }, { status: 400 });
    }

    // Remove account-scoped data first
    await supabaseAdmin.from("journal_entries").delete().eq("user_id", userId).eq("account_id", accountId);
    await supabaseAdmin.from("journal_trades").delete().eq("user_id", userId).eq("account_id", accountId);
    await supabaseAdmin.from("daily_snapshots").delete().eq("user_id", userId).eq("account_id", accountId);
    await supabaseAdmin.from("cashflows").delete().eq("user_id", userId).eq("account_id", accountId);
    await supabaseAdmin.from("growth_plans").delete().eq("user_id", userId).eq("account_id", accountId);

    const { error: delErr } = await supabaseAdmin
      .from("trading_accounts")
      .delete()
      .eq("user_id", userId)
      .eq("id", accountId);

    if (delErr) throw delErr;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[trading-accounts/delete] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
