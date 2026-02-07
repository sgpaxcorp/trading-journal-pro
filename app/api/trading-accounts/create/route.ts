import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

function maxAccountsForPlan(planRaw: string | null | undefined): number {
  const plan = String(planRaw || "").toLowerCase();
  if (plan === "advanced" || plan === "pro") return 2;
  return 1;
}

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
    const name = String(body?.name || "").trim();
    const broker = String(body?.broker || "").trim() || null;

    if (!name) {
      return NextResponse.json({ error: "Missing account name" }, { status: 400 });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    const maxAccounts = maxAccountsForPlan((profile as any)?.plan);

    const { data: existing, error: countErr } = await supabaseAdmin
      .from("trading_accounts")
      .select("id, is_default")
      .eq("user_id", userId);

    if (countErr) throw countErr;

    const currentCount = (existing ?? []).length;
    if (currentCount >= maxAccounts) {
      return NextResponse.json(
        { error: "Account limit reached for your plan." },
        { status: 403 }
      );
    }

    const isDefault = currentCount === 0;

    const { data: created, error: createErr } = await supabaseAdmin
      .from("trading_accounts")
      .insert({
        user_id: userId,
        name,
        broker,
        is_default: isDefault,
      })
      .select("id, user_id, name, broker, is_default, created_at, updated_at")
      .single();

    if (createErr) throw createErr;

    if (isDefault && created?.id) {
      await supabaseAdmin
        .from("user_preferences")
        .upsert(
          { user_id: userId, active_account_id: created.id, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        );
    }

    return NextResponse.json({ account: created });
  } catch (err: any) {
    console.error("[trading-accounts/create] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
