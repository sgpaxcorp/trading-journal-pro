import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { requirePlatformAccess } from "@/lib/serverPlatformAccess";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  try {
    const access = await requirePlatformAccess(req);
    if (!access.ok) return access.response;

    const userId = access.context.userId;
    const limiter = await rateLimit(`trading-account-set-active:${userId}:${getClientIp(req)}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many account switch attempts. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const accountId = String(body?.accountId || "").trim();

    if (!accountId) {
      return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
    }
    if (!UUID_RE.test(accountId)) {
      return NextResponse.json({ error: "Invalid accountId" }, { status: 400 });
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
