import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getPartnerDashboard, getPartnerProfile } from "@/lib/partnerProgram";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

function toMoney(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Number(n.toFixed(2));
}

function clampText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const limiter = await rateLimit(`partner-payout:${auth.userId}:${getClientIp(req)}`, {
      limit: 4,
      windowMs: 60 * 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many payout requests. Please wait before trying again." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const profile = await getPartnerProfile(auth.userId);
    if (!profile) return NextResponse.json({ error: "Partner profile not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const payoutMethod = String(body?.payoutMethod ?? "cash").trim() === "credit" ? "credit" : "cash";
    const amount = toMoney(body?.amount);
    const notes = clampText(body?.notes, 500) || null;

    if (amount == null || amount <= 0 || amount > 100_000) {
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

    const { data: openRequests, error: openRequestError } = await supabaseAdmin
      .from("partner_payout_requests")
      .select("id")
      .eq("partner_user_id", auth.userId)
      .in("status", ["requested", "processing"])
      .limit(1);
    if (openRequestError) throw new Error(openRequestError.message);
    if (Array.isArray(openRequests) && openRequests.length > 0) {
      return NextResponse.json(
        { error: "You already have a payout request under review." },
        { status: 409 }
      );
    }

    const status = "requested";
    const processedAt = null;

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
