import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { sendSubscriptionCancellationEmail } from "@/lib/email";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
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
    const limiter = await rateLimit(`stripe-cancel:${user.id}:${getClientIp(req)}`, {
      limit: 5,
      windowMs: 60 * 60_000,
    });
    if (!limiter.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many cancellation attempts. Please try again later." },
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
    const reason = String(body.reason ?? "").trim();
    const usageStatus = String(body.usageStatus ?? "").trim();
    const improvementArea = String(body.improvementArea ?? "").trim();
    const returnTrigger = String(body.returnTrigger ?? "").trim();
    const detail = String(body.detail ?? "").trim();

    if (!reason) {
      return NextResponse.json({ error: "Missing cancellation reason" }, { status: 400 });
    }
    if (!usageStatus) {
      return NextResponse.json({ error: "Missing cancellation usage status" }, { status: 400 });
    }

    const billingIdentity = await resolveStripeBillingIdentity(
      stripe,
      user,
      { includeSubscription: true }
    );
    const subscriptionId = billingIdentity.subscriptionId ?? "";
    const customerId = billingIdentity.customerId ?? "";

    if (!subscriptionId) {
      return NextResponse.json({ error: "No active subscription" }, { status: 404 });
    }

    const subscription = (await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })) as Stripe.Subscription;
    const currentPeriodEnd = (subscription as any)?.current_period_end as number | undefined;

    const effectiveAt = currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null;
    const followupAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabaseAdmin.from("subscription_cancellations").insert({
      user_id: user.id,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId || null,
      cancel_at_period_end: true,
      reason,
      usage_status: usageStatus,
      improvement_area: improvementArea || null,
      return_trigger: returnTrigger || null,
      reason_detail: detail || null,
      effective_at: effectiveAt,
      followup_at: followupAt,
      status: "requested",
    });

    const email = user.email ?? "";
    if (email) {
      await sendSubscriptionCancellationEmail({
        email,
        name:
          (user.user_metadata as any)?.full_name ||
          (user.user_metadata as any)?.name ||
          "",
        periodEnd: effectiveAt,
        nextBillingDate: effectiveAt,
      });
    }

    return NextResponse.json({
      ok: true,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
      current_period_end: effectiveAt,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
