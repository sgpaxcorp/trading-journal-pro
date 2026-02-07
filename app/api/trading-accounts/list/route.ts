import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ accounts: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ accounts: [] }, { status: 401 });
    }

    const userId = authData.user.id;

    const { data: accounts, error: listErr } = await supabaseAdmin
      .from("trading_accounts")
      .select("id, user_id, name, broker, is_default, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (listErr) throw listErr;

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
