import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { sendSubscriptionWinbackEmail } from "@/lib/email";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});

function buildPromoCode(prefix = "RETURN50") {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `${prefix}-${random}`;
}

async function handleRequest(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET || "";
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const vercelCronHeader = req.headers.get("x-vercel-cron");
    const isVercelCron = Boolean(vercelCronHeader) && vercelCronHeader !== "false";
    const hasValidSecret = Boolean(secret) && token === secret;
    if (!isVercelCron && !hasValidSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const nowIso = new Date().toISOString();

    const { data: rows, error } = await supabaseAdmin
      .from("subscription_cancellations")
      .select(
        "id,user_id,reason,reason_detail,followup_at,followup_sent_at,coupon_id,promotion_code_id"
      )
      .is("followup_sent_at", null)
      .lte("followup_at", nowIso)
      .limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const pending = rows ?? [];
    if (pending.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    let sent = 0;

    for (const row of pending) {
      const userId = String(row.user_id ?? "");
      if (!userId) continue;

      const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userErr || !userData?.user?.email) continue;

      const email = userData.user.email;

      const coupon = await stripe.coupons.create({
        percent_off: 50,
        duration: "once",
        metadata: {
          source: "winback",
          userId,
        },
      });

      const code = buildPromoCode();
      const promo = await stripe.promotionCodes.create({
        coupon: coupon.id,
        code,
        max_redemptions: 1,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        metadata: {
          source: "winback",
          userId,
        },
      } as any);

      await sendSubscriptionWinbackEmail({
        email,
        name:
          (userData.user.user_metadata as any)?.full_name ||
          (userData.user.user_metadata as any)?.name ||
          "",
        promotionCode: promo.code ?? code,
      });

      await supabaseAdmin
        .from("subscription_cancellations")
        .update({
          followup_sent_at: new Date().toISOString(),
          coupon_id: coupon.id,
          promotion_code_id: promo.id,
          promotion_code: promo.code ?? code,
          status: "followup_sent",
        })
        .eq("id", row.id);

      sent += 1;
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
