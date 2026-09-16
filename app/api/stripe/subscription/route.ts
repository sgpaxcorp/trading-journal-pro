import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { resolveStripeBillingIdentity } from "@/lib/stripeBillingIdentity";

export const runtime = "nodejs";

type PlanId = "core" | "advanced";

type SubscriptionPreview = {
  amount_due: number;
  currency: string;
  payment_date: string | null;
};

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});

const PRICE_TO_PLAN: Record<string, PlanId> = {
  [process.env.STRIPE_PRICE_CORE_MONTHLY ?? ""]: "core",
  [process.env.STRIPE_PRICE_CORE_ANNUAL ?? ""]: "core",
  [process.env.STRIPE_PRICE_ADVANCED_MONTHLY ?? ""]: "advanced",
  [process.env.STRIPE_PRICE_ADVANCED_ANNUAL ?? ""]: "advanced",
};

async function getAuthedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { user: null, error: "Unauthorized" };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: "Unauthorized" };
  return { user: data.user, error: null };
}

function mapSubscription(sub: Stripe.Subscription | any) {
  const item = sub.items?.data?.[0];
  const price = item?.price ?? null;
  const interval = price?.recurring?.interval ?? null;
  const billingCycle =
    interval === "year" ? "annual" : interval === "month" ? "monthly" : null;
  const priceId = price?.id ?? null;
  const metaPlan = String(sub.metadata?.planId ?? sub.metadata?.plan ?? "").toLowerCase();
  const planFromPrice = priceId && PRICE_TO_PLAN[priceId] ? PRICE_TO_PLAN[priceId] : null;
  const plan =
    metaPlan === "core" || metaPlan === "advanced"
      ? (metaPlan as PlanId)
      : planFromPrice;

  return {
    id: sub.id,
    status: sub.status,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    current_period_start: item?.current_period_start ?? (sub as any)?.current_period_start
      ? new Date((item?.current_period_start ?? (sub as any).current_period_start) * 1000).toISOString()
      : null,
    current_period_end: item?.current_period_end ?? (sub as any)?.current_period_end
      ? new Date((item?.current_period_end ?? (sub as any).current_period_end) * 1000).toISOString()
      : null,
    trial_start: (sub as any)?.trial_start
      ? new Date((sub as any).trial_start * 1000).toISOString()
      : null,
    trial_end: (sub as any)?.trial_end
      ? new Date((sub as any).trial_end * 1000).toISOString()
      : null,
    price_id: priceId,
    interval,
    billing_cycle: billingCycle,
    plan,
    amount: typeof price?.unit_amount === "number" ? price.unit_amount : null,
    currency: String(price?.currency ?? sub.currency ?? "usd"),
    quantity: typeof item?.quantity === "number" ? item.quantity : 1,
  };
}

function toIso(ts?: number | null) {
  if (!ts || !Number.isFinite(ts)) return null;
  return new Date(ts * 1000).toISOString();
}

async function getSubscriptionPreview(
  customerId: string,
  subscriptionId: string
): Promise<SubscriptionPreview | null> {
  try {
    const preview = await stripe.invoices.createPreview({
      customer: customerId,
      subscription: subscriptionId,
    });
    return {
      amount_due: Number(preview.amount_due ?? 0),
      currency: String(preview.currency ?? "usd"),
      payment_date: toIso(preview.next_payment_attempt ?? preview.due_date ?? preview.period_end),
    };
  } catch (err) {
    // A preview is not available for every terminal or manually provisioned state.
    console.warn("[stripe/subscription] invoice preview unavailable:", err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await getAuthedUser(req);
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const billingIdentity = await resolveStripeBillingIdentity(
      stripe,
      user,
      { includeSubscription: true }
    );
    const subscriptionId = billingIdentity.subscriptionId ?? "";
    const customerId = billingIdentity.customerId ?? "";
    const access = {
      plan: billingIdentity.plan ?? "",
      status: billingIdentity.entitlementStatus ?? "",
    };

    let creditBalance = 0;
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (!("deleted" in customer && customer.deleted)) {
          // Stripe stores customer credit as a negative balance.
          creditBalance = Math.max(0, -Number(customer.balance ?? 0));
        }
      } catch (err) {
        console.warn("[stripe/subscription] customer balance lookup failed:", err);
      }
    }

    if (!subscriptionId) {
      return NextResponse.json({
        subscription: null,
        access,
        credit_balance: creditBalance,
        next_invoice: null,
      });
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const nextInvoice = customerId
        ? await getSubscriptionPreview(customerId, subscriptionId)
        : null;
      return NextResponse.json({
        subscription: mapSubscription(subscription),
        access,
        credit_balance: creditBalance,
        next_invoice: nextInvoice,
      });
    } catch (err) {
      console.warn("[stripe/subscription] lookup failed:", err);
      return NextResponse.json({
        subscription: null,
        access,
        credit_balance: creditBalance,
        next_invoice: null,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
