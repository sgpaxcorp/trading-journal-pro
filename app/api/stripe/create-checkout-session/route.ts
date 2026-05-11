// app/api/stripe/create-checkout-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type PlanId = "core" | "advanced";
type BillingCycle = "monthly" | "annual";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

function resolveAppUrl(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  if (process.env.NODE_ENV !== "production" && origin.startsWith("http")) {
    return origin;
  }
  if (APP_URL && APP_URL.startsWith("http")) return APP_URL;
  throw new Error("Missing or invalid NEXT_PUBLIC_APP_URL");
}

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
const BROKER_SYNC_PRICES = {
  monthly: process.env.STRIPE_PRICE_BROKER_SYNC_MONTHLY ?? "",
  annual: process.env.STRIPE_PRICE_BROKER_SYNC_ANNUAL ?? "",
};
const TESTER_PROMO_CODES = new Set(
  String(process.env.STRIPE_TESTER_PROMO_CODES ?? "")
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean)
);

function normalizePartnerCode(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
}

function normalizePromoCode(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .slice(0, 64);
}

function isTruthy(value: unknown) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function isFreeCoupon(coupon: Stripe.Coupon) {
  return Number(coupon.percent_off ?? 0) >= 100;
}

type ResolvedDiscount = {
  discounts: Stripe.Checkout.SessionCreateParams.Discount[];
  couponId: string | null;
  promotionCodeId: string | null;
  normalizedCode: string;
  isTesterAllAccess: boolean;
  isFree: boolean;
};

async function resolveStripeDiscount(inputCode: string) {
  const normalizedCode = normalizePromoCode(inputCode);
  if (!normalizedCode) return null;

  const promoList = await stripe.promotionCodes.list({
    code: normalizedCode,
    active: true,
    limit: 10,
  });

  const promo = promoList.data.find(
    (p) =>
      String(p.code ?? "")
        .trim()
        .toUpperCase() === normalizedCode
  );

  if (promo) {
    const promoCouponRef = promo.promotion?.coupon;
    const promoCoupon =
      typeof promoCouponRef === "string"
        ? await stripe.coupons.retrieve(promoCouponRef)
        : promoCouponRef;

    if (!promoCoupon?.valid) {
      throw new Error("This coupon is no longer valid.");
    }

    const promoTesterFlag =
      isTruthy((promo.metadata as any)?.grant_all_access) ||
      isTruthy((promo.metadata as any)?.tester_all_access) ||
      isTruthy((promoCoupon.metadata as any)?.grant_all_access) ||
      isTruthy((promoCoupon.metadata as any)?.tester_all_access);

    return {
      discounts: [{ promotion_code: promo.id }] as Stripe.Checkout.SessionCreateParams.Discount[],
      couponId: promoCoupon.id,
      promotionCodeId: promo.id,
      normalizedCode,
      isTesterAllAccess: TESTER_PROMO_CODES.has(normalizedCode) || promoTesterFlag,
      isFree: isFreeCoupon(promoCoupon),
    } as ResolvedDiscount;
  }

  // Backward-compatible fallback: allow raw coupon IDs.
  const coupon = await stripe.coupons.retrieve(normalizedCode);
  if (!coupon.valid) {
    throw new Error("This coupon is no longer valid.");
  }

  const couponTesterFlag =
    isTruthy((coupon.metadata as any)?.grant_all_access) ||
    isTruthy((coupon.metadata as any)?.tester_all_access);

  return {
    discounts: [{ coupon: coupon.id }] as Stripe.Checkout.SessionCreateParams.Discount[],
    couponId: coupon.id,
    promotionCodeId: null,
    normalizedCode,
    isTesterAllAccess: TESTER_PROMO_CODES.has(normalizedCode) || couponTesterFlag,
    isFree: isFreeCoupon(coupon),
  } as ResolvedDiscount;
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;
    const email = authData.user.email ?? "";

    const body = await req.json();
    const planId = body.planId as PlanId | undefined;
    const billingCycle = body.billingCycle as BillingCycle | undefined;
    const couponCodeRaw = body.couponCode as string | undefined; // opcional
    const addonBrokerSync = Boolean(body.addonBrokerSync);
    const partnerCode = normalizePartnerCode(body.partnerCode);

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }

    if (planId !== "core" && planId !== "advanced") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    if (billingCycle && billingCycle !== "monthly" && billingCycle !== "annual") {
      return NextResponse.json({ error: "Invalid billing cycle" }, { status: 400 });
    }
    const finalBillingCycle = billingCycle ?? "monthly";

    const origin = resolveAppUrl(req);

    let partnerUserId: string | null = null;
    if (partnerCode) {
      const { data: partnerRow, error: partnerErr } = await supabaseAdmin
        .from("partner_profiles")
        .select("user_id,status")
        .eq("referral_code", partnerCode)
        .maybeSingle();
      if (partnerErr) {
        return NextResponse.json({ error: "Could not validate partner code." }, { status: 500 });
      }
      if (!partnerRow || String((partnerRow as any).status ?? "active") !== "active") {
        return NextResponse.json({ error: "Invalid partner code." }, { status: 400 });
      }
      const partnerId = String((partnerRow as any).user_id ?? "");
      if (!partnerId || partnerId === userId) {
        return NextResponse.json({ error: "Invalid partner referral." }, { status: 400 });
      }
      partnerUserId = partnerId;
    }

    // =====================================================
    // Ensure we have an existing Customer in Stripe
    // =====================================================
    let customerId: string | undefined;

    // 1) Try profile stripe_customer_id
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.stripe_customer_id) {
      customerId = String(profile.stripe_customer_id);
    } else if (email) {
      // 2) Try to find an existing Customer by email
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      }
    }

    if (!customerId) {
      // 3) Create a new Customer if none exists yet
      const created = await stripe.customers.create({
        email: email || undefined,
        metadata: {
          supabaseUserId: userId,
        },
      });
      customerId = created.id;
    }

    // =====================================================
    // Optional: coupon / promotion code logic
    // =====================================================
    let discounts:
      | Stripe.Checkout.SessionCreateParams.Discount[]
      | undefined;

    let effectivePlanId: PlanId = planId;
    let effectiveAddonBrokerSync = addonBrokerSync;
    let promoDiscountInfo: ResolvedDiscount | null = null;

    const couponCode = normalizePromoCode(couponCodeRaw);
    if (couponCode) {
      try {
        promoDiscountInfo = await resolveStripeDiscount(couponCode);
        discounts = promoDiscountInfo?.discounts;

        if (promoDiscountInfo?.isTesterAllAccess) {
          if (!promoDiscountInfo.isFree) {
            return NextResponse.json(
              {
                error:
                  "Tester promo code is configured but it is not 100% off. Please update the Stripe promo code.",
              },
              { status: 400 }
            );
          }
          effectivePlanId = "advanced";
          effectiveAddonBrokerSync = true;
        }
      } catch (err) {
        console.error("[CHECKOUT] Invalid coupon code", couponCode, err);
        return NextResponse.json(
          { error: "Invalid coupon code." },
          { status: 400 }
        );
      }
    }

    const priceId = PRICE_IDS[effectivePlanId][finalBillingCycle];
    if (!priceId) {
      console.error(
        "[CHECKOUT] Missing priceId for plan",
        effectivePlanId,
        "cycle=",
        finalBillingCycle
      );
      return NextResponse.json(
        { error: "Price ID not configured for this plan" },
        { status: 500 }
      );
    }
    if (effectiveAddonBrokerSync && !BROKER_SYNC_PRICES[finalBillingCycle]) {
      return NextResponse.json(
        { error: "Broker sync price ID not configured" },
        { status: 500 }
      );
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
    if (effectiveAddonBrokerSync) {
      lineItems.push({
        price: BROKER_SYNC_PRICES[finalBillingCycle],
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId, // ✅ usamos solo customer
      line_items: lineItems,
      discounts,
      allow_promotion_codes: true,
      success_url: `${origin}/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      metadata: {
        supabaseUserId: userId,
        planId: effectivePlanId,
        requestedPlanId: planId,
        billingCycle: finalBillingCycle,
        couponCode,
        couponId: promoDiscountInfo?.couponId ?? "",
        promotionCodeId: promoDiscountInfo?.promotionCodeId ?? "",
        addonOptionFlow: "false",
        addonBrokerSync: effectiveAddonBrokerSync ? "true" : "false",
        testerAllAccess:
          promoDiscountInfo?.isTesterAllAccess ? "true" : "false",
        partnerCode: partnerCode || "",
        partnerUserId: partnerUserId ?? "",
      },
      subscription_data: {
        metadata: {
          supabaseUserId: userId,
          planId: effectivePlanId,
          requestedPlanId: planId,
          billingCycle: finalBillingCycle,
          couponCode,
          couponId: promoDiscountInfo?.couponId ?? "",
          promotionCodeId: promoDiscountInfo?.promotionCodeId ?? "",
          addonOptionFlow: "false",
          addonBrokerSync: effectiveAddonBrokerSync ? "true" : "false",
          testerAllAccess:
            promoDiscountInfo?.isTesterAllAccess ? "true" : "false",
          partnerCode: partnerCode || "",
          partnerUserId: partnerUserId ?? "",
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
