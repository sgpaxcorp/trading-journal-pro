import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { resolveStripeBillingIdentity } from "@/lib/stripeBillingIdentity";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});

async function getAuthedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { user: null, error: "Unauthorized" };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: "Unauthorized" };
  return { user: data.user, error: null };
}

export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthedUser(req);
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const limiter = await rateLimit(`stripe-auto-renew:${user.id}:${getClientIp(req)}`, {
      limit: 10,
      windowMs: 10 * 60_000,
    });
    if (!limiter.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many subscription updates. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(limiter),
          },
        }
      );
    }

    const body = await req.json();
    const enabled = Boolean(body.enabled);

    const billingIdentity = await resolveStripeBillingIdentity(
      stripe,
      user,
      { includeSubscription: true }
    );
    const subscriptionId = billingIdentity.subscriptionId ?? "";

    if (!subscriptionId) {
      return NextResponse.json({ error: "No active subscription" }, { status: 404 });
    }

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: !enabled,
    });

    return NextResponse.json({
      ok: true,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      status: subscription.status,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
