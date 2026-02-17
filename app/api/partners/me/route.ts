import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import {
  PARTNER_AGREEMENT_VERSION,
  generateUniqueReferralCode,
  getPartnerDashboard,
  getPartnerProfile,
} from "@/lib/partnerProgram";

function resolveAppUrl(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const envUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (origin.startsWith("http://") || origin.startsWith("https://")) return origin;
  if (envUrl.startsWith("http://") || envUrl.startsWith("https://")) return envUrl;
  return "http://localhost:3000";
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dashboard = await getPartnerDashboard(auth.userId);
    if (!dashboard) {
      return NextResponse.json({
        partner: null,
        dashboard: null,
        commissionPolicy: {
          annual: "30% of first-year total (annual subscription)",
          monthly: "20% recurring per paid monthly invoice",
          cashSettlement: "Cash requests are processed after user payment windows (15 days).",
        },
      });
    }

    const appUrl = resolveAppUrl(req);
    const referralLink = `${appUrl.replace(/\/$/, "")}/signup?plan=core&partner=${encodeURIComponent(
      dashboard.profile.referral_code
    )}`;

    return NextResponse.json({
      partner: dashboard.profile,
      dashboard: {
        totals: dashboard.totals,
        commissions: dashboard.commissions,
        payoutRequests: dashboard.payoutRequests,
      },
      referralLink,
      commissionPolicy: {
        annual: "30% of first-year total (annual subscription)",
        monthly: "20% recurring per paid monthly invoice",
        cashSettlement: "Cash requests are processed after user payment windows (15 days).",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not load partner dashboard." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const legalName = String(body?.legalName ?? "").trim();
    const agreementName = String(body?.agreementName ?? "").trim();
    const agreementAccepted = Boolean(body?.agreementAccepted);
    const payoutPreference = String(body?.payoutPreference ?? "credit").trim() === "cash" ? "cash" : "credit";
    const payoutEmailRaw = String(body?.payoutEmail ?? "").trim().toLowerCase();
    const payoutEmail = payoutEmailRaw || auth.email || null;

    if (!legalName || legalName.length < 3) {
      return NextResponse.json({ error: "Legal name is required." }, { status: 400 });
    }
    if (!agreementAccepted) {
      return NextResponse.json({ error: "You must accept the partner agreement." }, { status: 400 });
    }
    if (!agreementName || agreementName.length < 3) {
      return NextResponse.json({ error: "You must type your name to sign the agreement." }, { status: 400 });
    }
    if (payoutPreference === "cash" && !payoutEmail) {
      return NextResponse.json({ error: "Payout email is required for cash payouts." }, { status: 400 });
    }

    const existing = await getPartnerProfile(auth.userId);
    const referralCode =
      existing?.referral_code || (await generateUniqueReferralCode(`${agreementName}-${auth.userId}`));

    const nowIso = new Date().toISOString();
    const payload = {
      user_id: auth.userId,
      referral_code: referralCode,
      legal_name: legalName,
      payout_preference: payoutPreference,
      payout_email: payoutPreference === "cash" ? payoutEmail : null,
      agreement_version: PARTNER_AGREEMENT_VERSION,
      agreement_accepted: true,
      agreement_accepted_at: nowIso,
      status: "active",
      updated_at: nowIso,
      created_at: existing?.created_at ?? nowIso,
    };

    const { error } = await supabaseAdmin.from("partner_profiles").upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    const dashboard = await getPartnerDashboard(auth.userId);
    const appUrl = resolveAppUrl(req);
    const referralLink = `${appUrl.replace(/\/$/, "")}/signup?plan=core&partner=${encodeURIComponent(referralCode)}`;

    return NextResponse.json({
      ok: true,
      partner: dashboard?.profile ?? null,
      dashboard: dashboard
        ? {
            totals: dashboard.totals,
            commissions: dashboard.commissions,
            payoutRequests: dashboard.payoutRequests,
          }
        : null,
      referralLink,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not save partner profile." }, { status: 500 });
  }
}
