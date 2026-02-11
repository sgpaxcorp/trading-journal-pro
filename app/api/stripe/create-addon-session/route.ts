// app/api/stripe/create-addon-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

const ADDON_PRICE_ID = process.env.STRIPE_PRICE_OPTIONFLOW_MONTHLY ?? "";
const ADDON_KEY = "option_flow";

function resolveAppUrl(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  if (process.env.NODE_ENV !== "production" && origin.startsWith("http")) {
    return origin;
  }
  if (APP_URL && APP_URL.startsWith("http")) return APP_URL;
  throw new Error("Missing or invalid NEXT_PUBLIC_APP_URL");
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
    const addonKey = (body.addonKey as string | undefined) || ADDON_KEY;
    if (addonKey !== ADDON_KEY) {
      return NextResponse.json({ error: "Invalid add-on" }, { status: 400 });
    }

    if (!ADDON_PRICE_ID) {
      return NextResponse.json(
        { error: "Price ID not configured for add-on" },
        { status: 500 }
      );
    }

    const origin = resolveAppUrl(req);

    // Ensure customer exists
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
        metadata: {
          supabaseUserId: userId,
        },
      });
      customerId = created.id;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: ADDON_PRICE_ID,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: `${origin}/option-flow?checkout=success`,
      cancel_url: `${origin}/option-flow?checkout=cancel`,
      metadata: {
        supabaseUserId: userId,
        addonKey,
      },
      subscription_data: {
        metadata: {
          supabaseUserId: userId,
          addonKey,
        },
      },
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("Error creating add-on Checkout session:", err);
    const message = err?.raw?.message || err?.message || "Error creating checkout session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
