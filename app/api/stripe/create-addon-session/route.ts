// app/api/stripe/create-addon-session/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});

const ADDON_PRICE_ID = process.env.STRIPE_PRICE_OPTIONFLOW_MONTHLY ?? "";
const ADDON_KEY = "option_flow";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const userId = body.userId as string | undefined;
    const email = body.email as string | undefined;
    const addonKey = (body.addonKey as string | undefined) || ADDON_KEY;

    if (!userId || !email) {
      return NextResponse.json(
        { error: "Missing userId or email" },
        { status: 400 }
      );
    }

    if (!ADDON_PRICE_ID) {
      return NextResponse.json(
        { error: "Price ID not configured for add-on" },
        { status: 500 }
      );
    }

    const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
    if (!origin || !origin.startsWith("http")) {
      throw new Error("Missing or invalid origin / NEXT_PUBLIC_APP_URL");
    }

    // Ensure customer exists
    let customerId: string | undefined;
    const existing = await stripe.customers.list({
      email,
      limit: 1,
    });
    if (existing.data.length > 0) {
      customerId = existing.data[0].id;
    } else {
      const created = await stripe.customers.create({
        email,
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
