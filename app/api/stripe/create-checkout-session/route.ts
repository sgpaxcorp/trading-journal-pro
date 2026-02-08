// app/api/stripe/create-checkout-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

type PlanId = "core" | "advanced";
type BillingCycle = "monthly" | "annual";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  });

// Price IDs from your Stripe Dashboard (env vars)
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
const OPTION_FLOW_PRICE = process.env.STRIPE_PRICE_OPTIONFLOW_MONTHLY ?? "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const userId = body.userId as string | undefined;
    const email = body.email as string | undefined;
    const planId = body.planId as PlanId | undefined;
    const billingCycle = (body.billingCycle as BillingCycle | undefined) ?? "monthly";
    const couponCodeRaw = body.couponCode as string | undefined; // opcional
    const addonOptionFlow = Boolean(body.addonOptionFlow);

    if (!userId || !email || !planId) {
      return NextResponse.json(
        { error: "Missing userId, email or planId" },
        { status: 400 }
      );
    }

    if (planId !== "core" && planId !== "advanced") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const priceId = PRICE_IDS[planId][billingCycle];
    if (!priceId) {
      console.error(
        "[CHECKOUT] Missing priceId for plan",
        planId,
        "cycle=",
        billingCycle
      );
      return NextResponse.json(
        { error: "Price ID not configured for this plan" },
        { status: 500 }
      );
    }
    if (addonOptionFlow && !OPTION_FLOW_PRICE) {
      return NextResponse.json(
        { error: "Option Flow price ID not configured" },
        { status: 500 }
      );
    }

    const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
    if (!origin || !origin.startsWith("http")) {
      throw new Error("Missing or invalid origin / NEXT_PUBLIC_APP_URL");
    }

    // =====================================================
    // Ensure we have an existing Customer in Stripe
    // =====================================================
    let customerId: string | undefined;

    // 1) Try to find an existing Customer by email
    const existing = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else {
      // 2) Create a new Customer if none exists yet
      const created = await stripe.customers.create({
        email,
        metadata: {
          supabaseUserId: userId,
        },
      });
      customerId = created.id;
    }

    // =====================================================
    // Optional: coupon logic (using Stripe "coupon" objects)
    // =====================================================
    let discounts:
      | Stripe.Checkout.SessionCreateParams.Discount[]
      | undefined;

    const couponCode = couponCodeRaw?.trim();
    if (couponCode) {
      try {
        // Aquí asumimos que couponCode == ID del cupón en Stripe (ej: "SOTERO")
        const coupon = await stripe.coupons.retrieve(couponCode);

        if (!coupon.valid) {
          return NextResponse.json(
            { error: "This coupon is no longer valid." },
            { status: 400 }
          );
        }

        discounts = [{ coupon: coupon.id }];
      } catch (err) {
        console.error("[CHECKOUT] Invalid coupon code", couponCode, err);
        return NextResponse.json(
          { error: "Invalid coupon code." },
          { status: 400 }
        );
      }
    }

    // =====================================================
    // Create Checkout Session
    // =====================================================
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price: priceId,
        quantity: 1,
      },
    ];
    if (addonOptionFlow) {
      lineItems.push({
        price: OPTION_FLOW_PRICE,
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId, // ✅ usamos solo customer
      line_items: lineItems,
      discounts,
      allow_promotion_codes: false,
      success_url: `${origin}/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      metadata: {
        supabaseUserId: userId,
        planId,
        couponCode: couponCode ?? "",
        addonOptionFlow: addonOptionFlow ? "true" : "false",
      },
      subscription_data: {
        metadata: {
          supabaseUserId: userId,
          planId,
          couponCode: couponCode ?? "",
          addonOptionFlow: addonOptionFlow ? "true" : "false",
        },
      },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Error creating Stripe Checkout session:", err);

    const message =
      err?.raw?.message ||
      err?.message ||
      "Error creating checkout session";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
