import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type PlanId = "core" | "advanced";
type BillingCycle = "monthly" | "annual";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2026-01-28.clover",
});

const PRICE_IDS: Record<PlanId, Record<BillingCycle, string>> = {
  core: {
    monthly: process.env.STRIPE_PRICE_CORE_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_CORE_ANNUAL ?? "",
  },
  advanced: {
    monthly: process.env.STRIPE_PRICE_ADVANCED_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_ADVANCED_ANNUAL ?? "",
  },
};

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
    const email = authData.user.email ?? "";

    const body = await req.json();
    const planId = body.planId as PlanId | undefined;
    const billingCycle = body.billingCycle as BillingCycle | undefined;

    if (!planId || !PRICE_IDS[planId]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    if (!billingCycle || !PRICE_IDS[planId][billingCycle]) {
      return NextResponse.json({ error: "Invalid billing cycle" }, { status: 400 });
    }

    let customerId: string | undefined;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.stripe_customer_id) {
      customerId = String(profile.stripe_customer_id);
    } else if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      }
    }

    if (!customerId) {
      const created = await stripe.customers.create({
        email: email || undefined,
        metadata: { supabaseUserId: userId },
      });
      customerId = created.id;
      await supabaseAdmin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
    }

    const lineItems: Stripe.SubscriptionCreateParams.Item[] = [
      { price: PRICE_IDS[planId][billingCycle], quantity: 1 },
    ];

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: lineItems,
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        supabaseUserId: userId,
        planId,
        billingCycle,
        addonOptionFlow: "false",
      },
    });

    const rawLatestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
    const paymentIntentField = (rawLatestInvoice as any)?.payment_intent;
    let paymentIntent: Stripe.PaymentIntent | null = null;

    if (paymentIntentField && typeof paymentIntentField === "object") {
      paymentIntent = paymentIntentField as Stripe.PaymentIntent;
    } else if (typeof paymentIntentField === "string") {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentField);
    }

    if (!paymentIntent?.client_secret) {
      return NextResponse.json({ error: "Missing payment intent" }, { status: 500 });
    }

    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2026-01-28.clover" }
    );

    return NextResponse.json({
      customerId,
      ephemeralKey: ephemeralKey.secret,
      paymentIntentClientSecret: paymentIntent.client_secret,
      subscriptionId: subscription.id,
    });
  } catch (err: any) {
    console.error("[stripe/mobile/subscribe] error:", err);
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
