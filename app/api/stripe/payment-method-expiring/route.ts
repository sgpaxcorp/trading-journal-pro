import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { sendSubscriptionPaymentMethodExpiringEmail } from "@/lib/email";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});
const EMAIL_KEY = "subscription_payment_method_expiring";

type ProfileRow = {
  id: string;
  email: string | null;
  first_name?: string | null;
  last_name?: string | null;
  plan?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

type CardCandidate = {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

function isAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const vercelCronHeader = req.headers.get("x-vercel-cron");
  const isVercelCron = Boolean(vercelCronHeader) && vercelCronHeader !== "false";
  const hasValidSecret = Boolean(secret) && token === secret;
  return isVercelCron || hasValidSecret;
}

function formatName(profile: ProfileRow) {
  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
  return fullName || null;
}

function clampDays(raw: string | null) {
  const n = Number(raw ?? 35);
  if (!Number.isFinite(n)) return 35;
  return Math.max(1, Math.min(90, Math.round(n)));
}

function cardExpirationDate(card: CardCandidate) {
  if (!card.expMonth || !card.expYear) return null;
  return new Date(Date.UTC(card.expYear, card.expMonth, 0, 23, 59, 59));
}

function daysUntil(date: Date) {
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function paymentMethodToCard(value: Stripe.PaymentMethod | null | undefined): CardCandidate | null {
  if (!value || value.type !== "card" || !value.card) return null;
  return {
    id: value.id,
    brand: value.card.brand ?? null,
    last4: value.card.last4 ?? null,
    expMonth: value.card.exp_month ?? null,
    expYear: value.card.exp_year ?? null,
  };
}

function sourceToCard(value: Stripe.CustomerSource | string | null | undefined): CardCandidate | null {
  if (!value || typeof value === "string") return null;
  if (value.object !== "card") return null;
  const card = value as Stripe.Card;
  return {
    id: card.id,
    brand: card.brand ?? null,
    last4: card.last4 ?? null,
    expMonth: card.exp_month ?? null,
    expYear: card.exp_year ?? null,
  };
}

async function resolveDefaultCard(profile: ProfileRow): Promise<CardCandidate | null> {
  const customerId = profile.stripe_customer_id;
  if (!customerId) return null;

  if (profile.stripe_subscription_id) {
    const subscription = await stripe.subscriptions
      .retrieve(profile.stripe_subscription_id, { expand: ["default_payment_method"] })
      .catch(() => null);
    const subscriptionCard = paymentMethodToCard(
      typeof subscription?.default_payment_method === "object"
        ? subscription.default_payment_method as Stripe.PaymentMethod
        : null
    );
    if (subscriptionCard) return subscriptionCard;
  }

  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method", "default_source"],
  });
  if (customer.deleted) return null;

  const customerCard = paymentMethodToCard(
    typeof customer.invoice_settings?.default_payment_method === "object"
      ? customer.invoice_settings.default_payment_method as Stripe.PaymentMethod
      : null
  );
  if (customerCard) return customerCard;

  const sourceCard = sourceToCard(
    typeof customer.default_source === "object" ? customer.default_source : null
  );
  if (sourceCard) return sourceCard;

  const paymentMethods = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
    limit: 1,
  });
  return paymentMethodToCard(paymentMethods.data[0]);
}

async function shouldSendEmail(args: {
  eventId: string;
  email: string;
  stripeObjectId: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("stripe_email_deliveries")
    .select("id,status")
    .eq("event_id", args.eventId)
    .eq("email_key", EMAIL_KEY)
    .maybeSingle();

  if (error) {
    console.error("[payment-method-expiring] delivery lookup error:", error);
    return true;
  }

  const existing = data as { id?: string; status?: string | null } | null;
  if (!existing) {
    const { error: insertError } = await supabaseAdmin.from("stripe_email_deliveries").insert({
      event_id: args.eventId,
      email_key: EMAIL_KEY,
      email: args.email,
      stripe_object_id: args.stripeObjectId,
      status: "processing",
      updated_at: now,
    });
    if (insertError) {
      console.error("[payment-method-expiring] delivery insert error:", insertError);
      return false;
    }
    return true;
  }

  if (existing.status === "sent" || existing.status === "processing") return false;

  const { error: updateError } = await supabaseAdmin
    .from("stripe_email_deliveries")
    .update({ status: "processing", last_error: null, updated_at: now })
    .eq("id", existing.id);

  if (updateError) {
    console.error("[payment-method-expiring] delivery retry update error:", updateError);
    return false;
  }

  return true;
}

async function markDelivery(args: {
  eventId: string;
  status: "sent" | "failed";
  errorMessage?: string | null;
}) {
  const payload =
    args.status === "sent"
      ? {
          status: "sent",
          last_error: null,
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      : {
          status: "failed",
          last_error: args.errorMessage ?? null,
          updated_at: new Date().toISOString(),
        };

  const { error } = await supabaseAdmin
    .from("stripe_email_deliveries")
    .update(payload)
    .eq("event_id", args.eventId)
    .eq("email_key", EMAIL_KEY);

  if (error) {
    console.error("[payment-method-expiring] delivery mark error:", error);
  }
}

async function handleRequest(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysAhead = clampDays(url.searchParams.get("days"));
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? 100) || 100));

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email,first_name,last_name,plan,stripe_customer_id,stripe_subscription_id,subscription_status")
    .not("stripe_customer_id", "is", null)
    .in("subscription_status", ["active", "past_due"])
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let scanned = 0;
  let expiring = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of (data ?? []) as ProfileRow[]) {
    scanned += 1;
    const email = String(profile.email ?? "").trim().toLowerCase();
    const customerId = String(profile.stripe_customer_id ?? "").trim();
    if (!email || !customerId) {
      skipped += 1;
      continue;
    }

    try {
      const card = await resolveDefaultCard(profile);
      const expiresAt = card ? cardExpirationDate(card) : null;
      const daysLeft = expiresAt ? daysUntil(expiresAt) : null;

      if (!card || daysLeft === null || daysLeft < 0 || daysLeft > daysAhead) {
        skipped += 1;
        continue;
      }

      expiring += 1;
      const eventId = `payment_method_expiring:${customerId}:${card.id}:${card.expYear}-${card.expMonth}`;
      const okToSend = await shouldSendEmail({
        eventId,
        email,
        stripeObjectId: card.id,
      });
      if (!okToSend) {
        skipped += 1;
        continue;
      }

      await sendSubscriptionPaymentMethodExpiringEmail({
        email,
        name: formatName(profile),
        plan: profile.plan ?? "advanced",
        brand: card.brand,
        last4: card.last4,
        expMonth: card.expMonth,
        expYear: card.expYear,
      });
      await markDelivery({ eventId, status: "sent" });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("[payment-method-expiring] profile scan error:", {
        profileId: profile.id,
        customerId,
        error,
      });
    }
  }

  return NextResponse.json({ ok: true, scanned, expiring, sent, skipped, failed, daysAhead });
}

export async function GET(req: NextRequest) {
  return handleRequest(req);
}

export async function POST(req: NextRequest) {
  return handleRequest(req);
}
