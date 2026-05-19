import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const userId = access.context.userId;

    const { data: accounts, error: listErr } = await supabaseAdmin
      .from("trading_accounts")
      .select("id, user_id, name, broker, is_default, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (listErr) {
      if ((listErr as any)?.code === "42P01") {
        return NextResponse.json({ accounts: [], activeAccountId: null });
      }
      throw listErr;
    }

    const { data: prefs } = await supabaseAdmin
      .from("user_preferences")
      .select("active_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    return NextResponse.json({
      accounts: accounts ?? [],
      activeAccountId: (prefs as any)?.active_account_id ?? null,
    });
  } catch (err: any) {
    console.error("[trading-accounts/list] error:", err);
    return NextResponse.json(
      { accounts: [], error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
