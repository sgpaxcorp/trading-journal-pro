import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/authServer";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import {
  PARTNER_AGREEMENT_VERSION,
  generateUniqueReferralCode,
  getPartnerDashboard,
  getPartnerProfile,
} from "@/lib/partnerProgram";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

function resolveAppUrl(req: NextRequest) {
  const envUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim();
  if (envUrl.startsWith("http://") || envUrl.startsWith("https://")) return envUrl;
  return req.nextUrl.origin;
}

function clampText(value: unknown, maxLength: number) {
  const text = String(value ?? "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

    const limiter = await rateLimit(`partner-profile:${auth.userId}:${getClientIp(req)}`, {
      limit: 6,
      windowMs: 10 * 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many partner profile updates. Please wait a moment." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = await req.json().catch(() => ({}));
    const legalName = clampText(body?.legalName, 120);
    const agreementName = clampText(body?.agreementName, 120);
    const agreementAccepted = Boolean(body?.agreementAccepted);
    const payoutPreference = String(body?.payoutPreference ?? "credit").trim() === "cash" ? "cash" : "credit";
    const payoutEmailRaw = clampText(body?.payoutEmail, 254).toLowerCase();
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
    if (payoutPreference === "cash" && payoutEmail && !isEmail(payoutEmail)) {
      return NextResponse.json({ error: "Enter a valid payout email." }, { status: 400 });
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
