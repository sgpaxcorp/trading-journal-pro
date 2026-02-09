import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ ok: false }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const user = authData.user;
    const userId = user.id;
    const meta = (user.user_metadata || {}) as Record<string, any>;

    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ ok: true, existed: true });
    }

    const payload: Record<string, any> = {
      id: userId,
      subscription_status: meta.subscriptionStatus ?? "pending",
      plan: meta.plan ?? "core",
      onboarding_completed: false,
    };

    if (user.email) payload.email = user.email;
    if (meta.first_name || meta.firstName) payload.first_name = meta.first_name ?? meta.firstName;
    if (meta.last_name || meta.lastName) payload.last_name = meta.last_name ?? meta.lastName;
    if (meta.phone) payload.phone = meta.phone;
    if (meta.postal_address || meta.address) payload.postal_address = meta.postal_address ?? meta.address;

    const { error: insertErr } = await supabaseAdmin.from("profiles").insert(payload);
    if (insertErr) {
      return NextResponse.json(
        { ok: false, error: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, created: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
