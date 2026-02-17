import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getPartnerDashboard, getPartnerProfile } from "@/lib/partnerProgram";

function toMoney(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getPartnerProfile(auth.userId);
    if (!profile) return NextResponse.json({ error: "Partner profile not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const payoutMethod = String(body?.payoutMethod ?? "cash").trim() === "credit" ? "credit" : "cash";
    const amount = toMoney(body?.amount);
    const notes = String(body?.notes ?? "").trim() || null;

    if (amount == null || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount." }, { status: 400 });
    }

    const dashboard = await getPartnerDashboard(auth.userId);
    const availableToRequest = Number(dashboard?.totals?.availableToRequest ?? 0);
    if (amount > availableToRequest + 0.0001) {
      return NextResponse.json(
        {
          error: `Amount exceeds available balance. Available: ${availableToRequest.toFixed(2)}`,
          availableToRequest,
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const eligibleOn = nowIso;

    const status = payoutMethod === "credit" ? "paid" : "requested";
    const processedAt = payoutMethod === "credit" ? nowIso : null;

    const { error: reqErr } = await supabaseAdmin.from("partner_payout_requests").insert({
      partner_user_id: auth.userId,
      amount,
      payout_method: payoutMethod,
      status,
      notes,
      requested_at: nowIso,
      eligible_on: eligibleOn,
      processed_at: processedAt,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (reqErr) throw new Error(reqErr.message);

    if (payoutMethod === "credit") {
      const nextCredit = Number((Number(profile.app_credit_balance || 0) + amount).toFixed(2));
      const { error: updErr } = await supabaseAdmin
        .from("partner_profiles")
        .update({
          app_credit_balance: nextCredit,
          updated_at: nowIso,
        })
        .eq("user_id", auth.userId);
      if (updErr) throw new Error(updErr.message);
    }

    const refreshed = await getPartnerDashboard(auth.userId);
    return NextResponse.json({
      ok: true,
      payoutMethod,
      amount,
      status,
      dashboard: refreshed
        ? {
            totals: refreshed.totals,
            commissions: refreshed.commissions,
            payoutRequests: refreshed.payoutRequests,
          }
        : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not create payout request." }, { status: 500 });
  }
}
