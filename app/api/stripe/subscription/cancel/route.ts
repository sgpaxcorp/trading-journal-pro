import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { sendSubscriptionCancellationEmail } from "@/lib/email";

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

    const body = await req.json();
    const reason = String(body.reason ?? "").trim();
    const detail = String(body.detail ?? "").trim();

    if (!reason) {
      return NextResponse.json({ error: "Missing cancellation reason" }, { status: 400 });
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    let subscriptionId = profile?.stripe_subscription_id
      ? String(profile.stripe_subscription_id)
      : "";
    let customerId = profile?.stripe_customer_id ? String(profile.stripe_customer_id) : "";

    if (!customerId && user.email) {
      const existing = await stripe.customers.list({ email: user.email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
        await supabaseAdmin
          .from("profiles")
          .update({ stripe_customer_id: customerId })
          .eq("id", user.id);
      }
    }

    if (!subscriptionId && customerId) {
      const list = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 5,
      });
      const candidates = (list.data ?? []).sort((a, b) => (b.created || 0) - (a.created || 0));
      const active = candidates.find((s) =>
        ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(s.status)
      );
      const picked = active || candidates[0];
      if (picked) {
        subscriptionId = picked.id;
        await supabaseAdmin
          .from("profiles")
          .update({ stripe_subscription_id: subscriptionId })
          .eq("id", user.id);
      }
    }

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
    const followupAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

    await supabaseAdmin.from("subscription_cancellations").insert({
      user_id: user.id,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId || profile?.stripe_customer_id || null,
      cancel_at_period_end: true,
      reason,
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
