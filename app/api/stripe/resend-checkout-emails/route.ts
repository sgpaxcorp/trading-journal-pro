import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import {
  sendSubscriptionConfirmationEmailByEmail,
  sendSubscriptionReceiptEmailByEmail,
  sendWelcomeEmailByEmail,
} from "@/lib/email";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

type PlanId = "core" | "advanced";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});

function normalizeSessionId(raw: unknown) {
  return String(raw ?? "").trim().slice(0, 120);
}

function normalizePlan(raw: unknown): PlanId {
  return String(raw ?? "").trim().toLowerCase() === "advanced" ? "advanced" : "core";
}

function normalizeBillingCycle(raw: unknown) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "year" || value === "yearly" || value === "annual") return "annual";
  if (value === "month" || value === "monthly") return "monthly";
  return value || null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const sessionId = normalizeSessionId(body?.sessionId);
    if (!sessionId || !sessionId.startsWith("cs_")) {
      return NextResponse.json({ error: "Missing checkout session." }, { status: 400 });
    }

    const limiter = await rateLimit(`stripe-resend-checkout-emails:${sessionId}:${getClientIp(req)}`, {
      limit: 3,
      windowMs: 10 * 60_000,
    });
    if (!limiter.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many resend attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            ...rateLimitHeaders(limiter),
          },
        }
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    if (session.status !== "complete" || session.payment_status !== "paid") {
      return NextResponse.json(
        { error: "Checkout is not paid yet." },
        { status: 400 }
      );
    }

    const email = session.customer_details?.email ?? session.customer_email ?? null;
    if (!email) {
      return NextResponse.json(
        { error: "Stripe checkout did not include an email address." },
        { status: 400 }
      );
    }

    const subscription =
      typeof session.subscription === "object" && session.subscription
        ? session.subscription
        : null;
    const subscriptionId =
      typeof session.subscription === "string" ? session.subscription : subscription?.id;
    const plan = normalizePlan(session.metadata?.planId ?? session.metadata?.plan);
    const billingCycle = normalizeBillingCycle(
      session.metadata?.billingCycle ?? subscription?.items?.data?.[0]?.price?.recurring?.interval
    );
    const name = session.customer_details?.name ?? null;
    const invoice = subscriptionId
      ? (await stripe.invoices.list({ subscription: subscriptionId, limit: 1 })).data[0] ?? null
      : null;

    await sendWelcomeEmailByEmail(email, name);
    await sendSubscriptionConfirmationEmailByEmail({
      email,
      name,
      plan,
      billingCycle,
      subscriptionId: subscriptionId ?? undefined,
    });

    const sent = ["welcome", "subscription_confirmation"];
    if (invoice) {
      await sendSubscriptionReceiptEmailByEmail({
        email,
        name,
        plan,
        amount: Number(invoice.amount_paid || invoice.total || 0) / 100,
        billingCycle,
        subscriptionId: subscriptionId ?? undefined,
        invoiceNumber: invoice.number ?? null,
        invoiceUrl: invoice.hosted_invoice_url ?? null,
        chargeDate:
          typeof invoice.status_transitions?.paid_at === "number" &&
          invoice.status_transitions.paid_at > 0
            ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
            : new Date().toISOString(),
      });
      sent.push("subscription_receipt");
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err: any) {
    console.error("[stripe/resend-checkout-emails] error:", err);
    return NextResponse.json(
      {
        error:
          "We could not resend the billing emails right now. Please contact support if they still do not arrive.",
        detail: err?.message ?? null,
      },
      { status: 500 }
    );
  }
}
