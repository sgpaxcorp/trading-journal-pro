import "server-only";

import type Stripe from "stripe";

import { PLATFORM_ACCESS_ENTITLEMENT } from "@/lib/accessControl";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type StripeUser = {
  id: string;
  email?: string | null;
};

type ResolveOptions = {
  includeSubscription?: boolean;
  allowEmailLookup?: boolean;
};

export type StripeBillingIdentity = {
  customerId: string | null;
  subscriptionId: string | null;
  entitlementStatus: string | null;
  plan: string | null;
};

function normalizedEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function customerOwnerId(customer: Stripe.Customer) {
  return String(
    customer.metadata?.supabaseUserId ??
      customer.metadata?.supabase_user_id ??
      customer.metadata?.userId ??
      ""
  ).trim();
}

function customerBelongsToUser(customer: Stripe.Customer, user: StripeUser) {
  const ownerId = customerOwnerId(customer);
  if (ownerId) return ownerId === user.id;

  const customerEmail = normalizedEmail(customer.email);
  const userEmail = normalizedEmail(user.email);
  return Boolean(customerEmail && userEmail && customerEmail === userEmail);
}

async function loadPlatformEntitlement(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_entitlements")
    .select("stripe_customer_id,stripe_subscription_id,status,metadata,updated_at")
    .eq("user_id", userId)
    .eq("entitlement_key", PLATFORM_ACCESS_ENTITLEMENT)
    .maybeSingle();

  if (error) throw new Error("Unable to resolve the billing identity.");
  return data;
}

async function persistKnownIdentity(userId: string, identity: StripeBillingIdentity) {
  const patch: Record<string, string> = {};
  if (identity.customerId) patch.stripe_customer_id = identity.customerId;
  if (identity.subscriptionId) patch.stripe_subscription_id = identity.subscriptionId;
  if (!Object.keys(patch).length) return;

  await supabaseAdmin
    .from("user_entitlements")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("entitlement_key", PLATFORM_ACCESS_ENTITLEMENT);
}

export async function resolveStripeBillingIdentity(
  stripe: Stripe,
  user: StripeUser,
  options: ResolveOptions = {}
): Promise<StripeBillingIdentity> {
  const entitlement = await loadPlatformEntitlement(user.id);
  let customerId = String(entitlement?.stripe_customer_id ?? "").trim();
  let subscriptionId = String(entitlement?.stripe_subscription_id ?? "").trim();
  let customer: Stripe.Customer | null = null;

  if (customerId) {
    const found = await stripe.customers.retrieve(customerId);
    if ("deleted" in found && found.deleted) {
      customerId = "";
    } else if (!customerBelongsToUser(found, user)) {
      throw new Error("Billing identity ownership validation failed.");
    } else {
      customer = found;
    }
  }

  if (!customerId && options.allowEmailLookup !== false && user.email) {
    const candidates = await stripe.customers.list({ email: user.email, limit: 10 });
    customer =
      candidates.data.find((item) => customerOwnerId(item) === user.id) ??
      candidates.data.find((item) => customerBelongsToUser(item, user)) ??
      null;
    customerId = customer?.id ?? "";
  }

  if (customer && !customerOwnerId(customer)) {
    await stripe.customers.update(customer.id, {
      metadata: { ...customer.metadata, supabaseUserId: user.id },
    });
  }

  if (options.includeSubscription && subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const subscriptionCustomerId =
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    if (!customerId || subscriptionCustomerId !== customerId) {
      throw new Error("Subscription ownership validation failed.");
    }
  }

  if (options.includeSubscription && !subscriptionId && customerId) {
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 25 });
    const platformSubscriptions = subscriptions.data
      .filter((item) => !item.metadata?.addonKey)
      .sort((a, b) => Number(b.created ?? 0) - Number(a.created ?? 0));
    const active = platformSubscriptions.find((item) =>
      ["active", "trialing", "past_due", "unpaid", "incomplete"].includes(item.status)
    );
    subscriptionId = (active ?? platformSubscriptions[0])?.id ?? "";
  }

  const identity = {
    customerId: customerId || null,
    subscriptionId: subscriptionId || null,
    entitlementStatus: String(entitlement?.status ?? "").trim().toLowerCase() || null,
    plan: String((entitlement?.metadata as Record<string, unknown> | null)?.plan ?? "").trim().toLowerCase() || null,
  };
  await persistKnownIdentity(user.id, identity);
  return identity;
}
