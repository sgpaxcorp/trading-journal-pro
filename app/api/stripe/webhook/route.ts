// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import {
  normalizeSubscriptionStatusToEntitlement,
  PLATFORM_ACCESS_ENTITLEMENT,
} from "@/lib/accessControl";
import {
  sendWelcomeEmailByEmail,
  sendSubscriptionConfirmationEmailByEmail,
  sendSubscriptionReceiptEmailByEmail,
  sendSubscriptionRenewalReminderEmail,
  sendSubscriptionPaymentIssueEmail,
} from "@/lib/email";
import { createPartnerCommission, getPartnerProfile } from "@/lib/partnerProgram";

type PlanId = "core" | "advanced";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
const ADDON_CONFIG = {
  option_flow: {
    monthly: process.env.STRIPE_PRICE_OPTIONFLOW_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_OPTIONFLOW_ANNUAL ?? "",
  },
  broker_sync: {
    monthly: process.env.STRIPE_PRICE_BROKER_SYNC_MONTHLY ?? "",
    annual: process.env.STRIPE_PRICE_BROKER_SYNC_ANNUAL ?? "",
  },
} as const;
type AddonKey = keyof typeof ADDON_CONFIG;
type EntitlementKey = AddonKey | typeof PLATFORM_ACCESS_ENTITLEMENT;

const ADDON_PRICE_ID_TO_KEY = new Map<string, AddonKey>();
Object.entries(ADDON_CONFIG).forEach(([key, cfg]) => {
  if (cfg.monthly) ADDON_PRICE_ID_TO_KEY.set(cfg.monthly, key as AddonKey);
  if (cfg.annual) ADDON_PRICE_ID_TO_KEY.set(cfg.annual, key as AddonKey);
});

const PLAN_PRICE_ID_TO_KEY = new Map<string, PlanId>();
[
  [process.env.STRIPE_PRICE_CORE_MONTHLY ?? "", "core"],
  [process.env.STRIPE_PRICE_CORE_ANNUAL ?? "", "core"],
  [process.env.STRIPE_PRICE_ADVANCED_MONTHLY ?? "", "advanced"],
  [process.env.STRIPE_PRICE_ADVANCED_ANNUAL ?? "", "advanced"],
].forEach(([priceId, planId]) => {
  if (priceId) PLAN_PRICE_ID_TO_KEY.set(priceId, planId as PlanId);
});

async function upsertEntitlement(params: {
  userId: string;
  entitlementKey: EntitlementKey;
  status: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  source?: string;
  metadata?: Record<string, unknown> | null;
}) {
  const {
    userId,
    entitlementKey,
    status,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId,
    source,
    metadata,
  } = params;
  if (!userId) return;

  try {
    await supabaseAdmin.from("user_entitlements").upsert(
      {
        user_id: userId,
        entitlement_key: entitlementKey,
        status: normalizeSubscriptionStatusToEntitlement(status),
        source: source ?? "stripe",
        stripe_customer_id: stripeCustomerId ?? null,
        stripe_subscription_id: stripeSubscriptionId ?? null,
        stripe_price_id: stripePriceId ?? null,
        metadata: metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,entitlement_key" }
    );
  } catch (err) {
    console.error("[WEBHOOK] Error upserting user_entitlements:", err);
  }
}

async function resolveUserIdByEmail(email?: string | null): Promise<string | null> {
  if (!email) return null;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .limit(1);
  if (error || !data?.length) return null;
  return String(data[0].id);
}

async function resolveUserIdByCustomer(customerId?: string | null): Promise<string | null> {
  if (!customerId) return null;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .limit(1);
  if (error || !data?.length) return null;
  return String(data[0].id);
}

async function resolvePartnerUserIdByCode(code?: string | null): Promise<string | null> {
  const cleanCode = String(code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
  if (!cleanCode) return null;

  const { data, error } = await supabaseAdmin
    .from("partner_profiles")
    .select("user_id,status")
    .eq("referral_code", cleanCode)
    .maybeSingle();

  if (error || !data) return null;
  if (String((data as any).status ?? "active") !== "active") return null;
  return String((data as any).user_id ?? "") || null;
}

function resolveAddonKeyFromPriceId(priceId?: string | null): AddonKey | null {
  if (!priceId) return null;
  return ADDON_PRICE_ID_TO_KEY.get(String(priceId)) ?? null;
}

function isAddonPurchase(params: { addonKey?: string | null; priceId?: string | null }) {
  const addonKey = String(params.addonKey || "") as AddonKey;
  const priceId = String(params.priceId || "");
  return Boolean(ADDON_CONFIG[addonKey]) || (!!priceId && !!resolveAddonKeyFromPriceId(priceId));
}

function isTruthy(value: unknown) {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function hasAddonLineItem(subscription: Stripe.Subscription | null | undefined, addonKey: AddonKey) {
  if (!subscription) return false;
  const cfg = ADDON_CONFIG[addonKey];
  if (!cfg) return false;
  const ids = new Set([cfg.monthly, cfg.annual].filter(Boolean));
  return subscription.items.data.some((item) => item.price?.id && ids.has(item.price.id));
}

function resolveAddonPriceId(subscription: Stripe.Subscription | null | undefined, addonKey: AddonKey) {
  const cfg = ADDON_CONFIG[addonKey];
  if (!cfg) return null;
  if (!subscription) return cfg.monthly || cfg.annual || null;
  const ids = new Set([cfg.monthly, cfg.annual].filter(Boolean));
  const hit = subscription.items.data.find((item) => item.price?.id && ids.has(item.price.id));
  return hit?.price?.id ?? (cfg.monthly || cfg.annual || null);
}

function normalizeBillingCycle(raw?: string | null): "monthly" | "annual" | null {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "monthly" || v === "month") return "monthly";
  if (v === "annual" || v === "year" || v === "yearly") return "annual";
  return null;
}

function normalizePlanId(raw?: string | null): PlanId | null {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "core" || value === "advanced") return value as PlanId;
  return null;
}

function resolvePlanIdFromPriceId(priceId?: string | null): PlanId | null {
  if (!priceId) return null;
  return PLAN_PRICE_ID_TO_KEY.get(String(priceId)) ?? null;
}

function buildPlatformAccessMetadata(planId?: string | null, billingCycle?: string | null) {
  return {
    plan: String(planId ?? "").trim().toLowerCase() || null,
    billingCycle: normalizeBillingCycle(billingCycle) ?? null,
  };
}

type ResolvedProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  plan: PlanId | null;
};

async function resolveProfileByCustomer(customerId?: string | null): Promise<ResolvedProfile | null> {
  if (!customerId) return null;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email,first_name,plan")
    .eq("stripe_customer_id", customerId)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: String((data as any).id),
    email: ((data as any).email as string | null) ?? null,
    firstName: ((data as any).first_name as string | null) ?? null,
    plan: normalizePlanId((data as any).plan),
  };
}

function resolveInvoiceLinePriceIds(invoice: Stripe.Invoice) {
  return (invoice.lines?.data ?? [])
    .map((line) => ((line as any)?.price?.id as string | null) ?? null)
    .filter((value): value is string => Boolean(value));
}

function resolveInvoicePrimaryPriceId(invoice: Stripe.Invoice) {
  return resolveInvoiceLinePriceIds(invoice)[0] ?? null;
}

function isAddonOnlyInvoice(invoice: Stripe.Invoice, subscription?: Stripe.Subscription | null) {
  const subscriptionAddonKey = subscription?.metadata?.addonKey as string | undefined;
  const primaryPriceId = resolveInvoicePrimaryPriceId(invoice);
  if (subscriptionAddonKey && isAddonPurchase({ addonKey: subscriptionAddonKey, priceId: primaryPriceId })) {
    return true;
  }
  const linePriceIds = resolveInvoiceLinePriceIds(invoice);
  return linePriceIds.length > 0 && linePriceIds.every((priceId) => Boolean(resolveAddonKeyFromPriceId(priceId)));
}

function resolveInvoicePlanId(
  invoice: Stripe.Invoice,
  subscription?: Stripe.Subscription | null,
  fallbackPlan?: string | null
): PlanId {
  const metaPlan =
    normalizePlanId(subscription?.metadata?.planId) ||
    normalizePlanId(subscription?.metadata?.plan) ||
    normalizePlanId((invoice.parent as any)?.subscription_details?.metadata?.planId) ||
    normalizePlanId((invoice.parent as any)?.subscription_details?.metadata?.plan) ||
    normalizePlanId(fallbackPlan);
  if (metaPlan) return metaPlan;

  const linePlan = resolveInvoiceLinePriceIds(invoice)
    .map((priceId) => resolvePlanIdFromPriceId(priceId))
    .find(Boolean);
  return linePlan ?? "core";
}

function resolveInvoiceBillingCycle(invoice: Stripe.Invoice, subscription?: Stripe.Subscription | null) {
  return (
    normalizeBillingCycle(subscription?.items?.data?.[0]?.price?.recurring?.interval) ||
    normalizeBillingCycle((invoice.parent as any)?.subscription_details?.metadata?.billingCycle) ||
    normalizeBillingCycle(
      (((invoice.lines?.data ?? []).find((line) => Boolean((line as any)?.price?.recurring?.interval)) as any)?.price
        ?.recurring?.interval as string | null) ?? null
    ) ||
    null
  );
}

function resolveInvoiceRenewalDate(invoice: Stripe.Invoice) {
  const periodEnd = invoice.lines?.data?.find((line) => line.period?.end)?.period?.end;
  if (typeof periodEnd === "number" && periodEnd > 0) {
    return new Date(periodEnd * 1000).toISOString();
  }
  const nextAttempt = (invoice as any)?.next_payment_attempt;
  if (typeof nextAttempt === "number" && nextAttempt > 0) {
    return new Date(nextAttempt * 1000).toISOString();
  }
  return null;
}

type StripeLifecycleEmailKey =
  | "welcome"
  | "subscription_confirmation"
  | "subscription_receipt"
  | "subscription_renewal_reminder"
  | "subscription_payment_issue";

async function beginStripeEmailDelivery(args: {
  eventId: string;
  emailKey: StripeLifecycleEmailKey;
  email: string;
  stripeObjectId?: string | null;
}) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("stripe_email_deliveries")
    .select("id,status")
    .eq("event_id", args.eventId)
    .eq("email_key", args.emailKey)
    .maybeSingle();

  if (error) {
    console.error("[WEBHOOK] Could not inspect stripe email delivery:", error);
    return true;
  }

  const existing = data as any;
  if (!existing) {
    const { error: insertError } = await supabaseAdmin.from("stripe_email_deliveries").insert({
      event_id: args.eventId,
      email_key: args.emailKey,
      email: args.email,
      stripe_object_id: args.stripeObjectId ?? null,
      status: "processing",
      updated_at: now,
    });
    if (insertError) {
      console.error("[WEBHOOK] Could not create stripe email delivery:", insertError);
      return true;
    }
    return true;
  }

  if (String(existing.status ?? "") === "sent" || String(existing.status ?? "") === "processing") {
    return false;
  }

  const { error: updateError } = await supabaseAdmin
    .from("stripe_email_deliveries")
    .update({
      status: "processing",
      last_error: null,
      updated_at: now,
    })
    .eq("id", existing.id);
  if (updateError) {
    console.error("[WEBHOOK] Could not reset failed stripe email delivery:", updateError);
    return false;
  }
  return true;
}

async function markStripeEmailDelivery(args: {
  eventId: string;
  emailKey: StripeLifecycleEmailKey;
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
    .eq("email_key", args.emailKey);
  if (error) {
    console.error("[WEBHOOK] Could not update stripe email delivery state:", error);
  }
}

async function sendStripeLifecycleEmailOnce(args: {
  eventId: string;
  emailKey: StripeLifecycleEmailKey;
  email: string | null;
  stripeObjectId?: string | null;
  send: () => Promise<void>;
}) {
  if (!args.email) return false;
  const shouldSend = await beginStripeEmailDelivery({
    eventId: args.eventId,
    emailKey: args.emailKey,
    email: args.email,
    stripeObjectId: args.stripeObjectId ?? null,
  });
  if (!shouldSend) return false;

  try {
    await args.send();
    await markStripeEmailDelivery({
      eventId: args.eventId,
      emailKey: args.emailKey,
      status: "sent",
    });
    return true;
  } catch (err: any) {
    await markStripeEmailDelivery({
      eventId: args.eventId,
      emailKey: args.emailKey,
      status: "failed",
      errorMessage: err?.message ?? "Unknown email error",
    });
    throw err;
  }
}

async function maybeCreatePartnerCommissionFromInvoice(invoice: Stripe.Invoice) {
  const rawSubscription = (invoice as any)?.subscription;
  const subscriptionId =
    typeof rawSubscription === "string"
      ? rawSubscription
      : typeof rawSubscription?.id === "string"
      ? rawSubscription.id
      : null;
  if (!subscriptionId) return;

  const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
  const paidAmount = Number(invoice.amount_paid || 0) / 100;
  if (!Number.isFinite(paidAmount) || paidAmount <= 0) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const subMeta = subscription.metadata ?? {};
  const subPriceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const addonKey = subMeta?.addonKey as string | undefined;
  if (isAddonPurchase({ addonKey, priceId: subPriceId })) return;

  const billingCycle =
    normalizeBillingCycle(subMeta.billingCycle) ||
    normalizeBillingCycle(subscription.items?.data?.[0]?.price?.recurring?.interval) ||
    null;
  if (!billingCycle) return;

  let partnerUserId = String(subMeta.partnerUserId ?? "").trim();
  if (!partnerUserId) {
    partnerUserId = (await resolvePartnerUserIdByCode(subMeta.partnerCode)) ?? "";
  }
  if (!partnerUserId) return;

  const partnerProfile = await getPartnerProfile(partnerUserId);
  if (!partnerProfile || partnerProfile.status !== "active") return;

  const referredUserId = await resolveUserIdByCustomer(customerId);
  if (referredUserId && referredUserId === partnerUserId) return;

  const paidAtMs = Number(invoice.status_transitions?.paid_at || 0) * 1000;
  const paidAt = paidAtMs > 0 ? new Date(paidAtMs) : new Date();
  const availableOn = new Date(paidAt.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();
  const commissionRate = billingCycle === "annual" ? 30 : 20;

  await createPartnerCommission({
    partnerUserId,
    referredUserId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeInvoiceId: invoice.id,
    stripeCheckoutSessionId: null,
    planId: String(subMeta.planId ?? "").trim() || null,
    billingCycle,
    grossAmount: paidAmount,
    commissionRate,
    payoutMethod: partnerProfile.payout_preference,
    description:
      billingCycle === "annual"
        ? "Annual referred subscription (first-year commission)."
        : "Monthly referred subscription payment.",
    availableOn,
    meta: {
      invoiceNumber: invoice.number ?? null,
      currency: invoice.currency ?? "usd",
    },
  });
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 }
    );
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error(
      "[WEBHOOK] Stripe webhook signature verification failed:",
      err?.message
    );
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  console.log("[WEBHOOK] Received event:", event.type);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        // 🔹 Tomar userId de varias posibles keys
        let userId =
          (session.metadata?.supabaseUserId as string | undefined) ||
          (session.metadata?.userId as string | undefined);

        const sessionAddonKey = session.metadata?.addonKey as string | undefined;
        const sessionAddonOptionFlow = isTruthy(session.metadata?.addonOptionFlow);
        const sessionAddonBrokerSync = isTruthy(session.metadata?.addonBrokerSync);

        // 🔹 Tomar plan de varias posibles keys
        let planIdMeta =
          (session.metadata?.planId as PlanId | undefined) ||
          (session.metadata?.plan as PlanId | undefined);

        const subscriptionId = session.subscription as string | undefined;
        const customerId = session.customer as string | undefined;
        const email =
          session.customer_email ??
          session.customer_details?.email ??
          null;

        const customerName = session.customer_details?.name ?? null;
        console.log("[WEBHOOK] checkout.session.completed raw metadata:", {
          sessionMetadata: session.metadata,
          subscriptionId,
          customerId,
          email,
        });

        // Fallback: buscar metadata en la suscripción si el userId / planId vienen vacíos
        let subscription: Stripe.Subscription | null = null;
        if ((!userId || !planIdMeta) && typeof subscriptionId === "string") {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);

          userId =
            userId ||
            (subscription.metadata?.supabaseUserId as string | undefined) ||
            (subscription.metadata?.userId as string | undefined);

          planIdMeta =
            planIdMeta ||
            (subscription.metadata?.planId as PlanId | undefined) ||
            (subscription.metadata?.plan as PlanId | undefined);

          console.log("[WEBHOOK] subscription metadata fallback:", {
            subscriptionMetadata: subscription.metadata,
          });
        }

        if (!subscription && typeof subscriptionId === "string") {
          subscription = await stripe.subscriptions.retrieve(subscriptionId);
        }

        const subAddonKey =
          subscription?.metadata?.addonKey as string | undefined;
        const subPriceId = subscription?.items?.data?.[0]?.price?.id ?? null;
        const subAddonOptionFlow = isTruthy(subscription?.metadata?.addonOptionFlow);
        const subAddonBrokerSync = isTruthy(subscription?.metadata?.addonBrokerSync);
        const includesOptionFlowAddon =
          sessionAddonOptionFlow || subAddonOptionFlow || hasAddonLineItem(subscription, "option_flow");
        const includesBrokerSyncAddon =
          sessionAddonBrokerSync || subAddonBrokerSync || hasAddonLineItem(subscription, "broker_sync");

        // ✅ Add-on flow (standalone add-on checkout)
        if (isAddonPurchase({ addonKey: sessionAddonKey || subAddonKey, priceId: subPriceId })) {
          const keyFromSession =
            sessionAddonKey && ADDON_CONFIG[sessionAddonKey as AddonKey]
              ? (sessionAddonKey as AddonKey)
              : undefined;
          const keyFromSub =
            subAddonKey && ADDON_CONFIG[subAddonKey as AddonKey]
              ? (subAddonKey as AddonKey)
              : undefined;
          const resolvedKey = keyFromSession || keyFromSub || resolveAddonKeyFromPriceId(subPriceId);
          const resolvedUserId =
            userId || (await resolveUserIdByEmail(email)) || (await resolveUserIdByCustomer(customerId));

          if (resolvedUserId && resolvedKey) {
            await upsertEntitlement({
              userId: resolvedUserId,
              entitlementKey: resolvedKey,
              status: "active",
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId ?? null,
              stripePriceId: subPriceId ?? resolveAddonPriceId(subscription, resolvedKey),
            });
          } else {
            console.warn("[WEBHOOK] Add-on purchase without userId/email", {
              customerId,
              subscriptionId,
            });
          }

          break;
        }

        // Si no logramos userId, intentamos actualizar por email
        if (!userId) {
          if (email) {
            console.warn(
              "[WEBHOOK] No userId in metadata, attempting update by email:",
              email
            );

            let planId: PlanId = planIdMeta ?? "core";

            // Fallback por priceId si aún no tenemos planId
            if (!planIdMeta && subscriptionId) {
              const subToInspect =
                subscription ||
                (await stripe.subscriptions.retrieve(subscriptionId));

              const priceId = subToInspect.items.data[0]?.price?.id;
              console.log("[WEBHOOK] priceId fallback (no userId):", priceId);

              if (priceId === process.env.STRIPE_PRICE_ADVANCED_MONTHLY) {
                planId = "advanced";
              } else if (
                priceId === process.env.STRIPE_PRICE_CORE_MONTHLY
              ) {
                planId = "core";
              }
            }

            const { error: profileError } = await supabaseAdmin
              .from("profiles")
              .update({
                plan: planId,
                stripe_customer_id: customerId ?? null,
                stripe_subscription_id: subscriptionId ?? null,
                subscription_status: "active",
              })
              .eq("email", email.toLowerCase());

            if (profileError) {
              console.error(
                "[WEBHOOK] Error updating profiles by email for checkout.session.completed:",
                profileError
              );
            } else {
              console.log(
                "[WEBHOOK] profiles updated successfully by email",
                email
              );

              const resolvedUserId =
                (await resolveUserIdByEmail(email)) || (await resolveUserIdByCustomer(customerId));
              if (resolvedUserId) {
                await upsertEntitlement({
                  userId: resolvedUserId,
                  entitlementKey: PLATFORM_ACCESS_ENTITLEMENT,
                  status: "active",
                  stripeCustomerId: customerId,
                  stripeSubscriptionId: subscriptionId ?? null,
                  stripePriceId: subPriceId,
                  metadata: buildPlatformAccessMetadata(
                    planId,
                    subscription?.items?.data?.[0]?.price?.recurring?.interval ?? session.metadata?.billingCycle
                  ),
                });
              }

              if (includesOptionFlowAddon || includesBrokerSyncAddon) {
                if (resolvedUserId && subscription) {
                  if (includesOptionFlowAddon) {
                    await upsertEntitlement({
                      userId: resolvedUserId,
                      entitlementKey: "option_flow",
                      status: "active",
                      stripeCustomerId: customerId,
                      stripeSubscriptionId: subscriptionId ?? null,
                      stripePriceId: resolveAddonPriceId(subscription, "option_flow"),
                    });
                  }
                  if (includesBrokerSyncAddon) {
                    await upsertEntitlement({
                      userId: resolvedUserId,
                      entitlementKey: "broker_sync",
                      status: "active",
                      stripeCustomerId: customerId,
                      stripeSubscriptionId: subscriptionId ?? null,
                      stripePriceId: resolveAddonPriceId(subscription, "broker_sync"),
                    });
                  }
                }
              }

              // 🔔 Enviar emails DESPUÉS de marcar la suscripción como activa
              try {
                const billingCycle =
                  subscription?.items?.data?.[0]?.price?.recurring?.interval ??
                  session.metadata?.billingCycle ??
                  null;
                await sendStripeLifecycleEmailOnce({
                  eventId: event.id,
                  emailKey: "welcome",
                  email,
                  stripeObjectId: session.id,
                  send: () => sendWelcomeEmailByEmail(email, customerName),
                });
                await sendStripeLifecycleEmailOnce({
                  eventId: event.id,
                  emailKey: "subscription_confirmation",
                  email,
                  stripeObjectId: subscriptionId ?? session.id,
                  send: () =>
                    sendSubscriptionConfirmationEmailByEmail({
                      email,
                      name: customerName,
                      plan: planId,
                      billingCycle,
                      subscriptionId: subscriptionId ?? undefined,
                    }),
                });
                console.log("[WEBHOOK] Welcome + confirmation emails sent (by email branch) to", email);
              } catch (mailErr) {
                console.error(
                  "[WEBHOOK] Error sending emails (by email branch):",
                  mailErr
                );
              }
            }
          } else {
            console.warn(
              "[WEBHOOK] checkout.session.completed without userId or email (session + subscription metadata were empty)"
            );
          }
          break;
        }

        // 🔹 Si sí tenemos userId (flujo normal)
        let planId: PlanId = planIdMeta ?? "core";

        // Fallback por priceId si aún no tenemos planId
        if (!planIdMeta) {
          const subToInspect =
            subscription ||
            (subscriptionId
              ? await stripe.subscriptions.retrieve(subscriptionId)
              : null);

          const priceId = subToInspect?.items.data[0]?.price?.id;
          console.log("[WEBHOOK] priceId fallback:", priceId);

          if (priceId === process.env.STRIPE_PRICE_ADVANCED_MONTHLY) {
            planId = "advanced";
          } else if (
            priceId === process.env.STRIPE_PRICE_CORE_MONTHLY
          ) {
            planId = "core";
          }
        }

        console.log("[WEBHOOK] Resolving user + plan:", {
          userId,
          planId,
          customerId,
          subscriptionId,
        });

        // 1) Actualiza la tabla profiles
        const { error: profileError } = await supabaseAdmin
          .from("profiles")
          .update({
            plan: planId,
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id: subscriptionId ?? null,
            subscription_status: "active",
          })
          .eq("id", userId);

        if (profileError) {
          console.error(
            "[WEBHOOK] Error updating profiles for checkout.session.completed:",
            profileError
          );
        } else {
          console.log(
            "[WEBHOOK] profiles updated successfully for",
            userId
          );
        }

        // 2) Actualiza también user_metadata para que el guard lo vea
        const { error: metaError } =
          await supabaseAdmin.auth.admin.updateUserById(userId, {
            user_metadata: {
              plan: planId,
              subscriptionStatus: "active",
            },
          });

        if (metaError) {
          console.error(
            "[WEBHOOK] Error updating user_metadata in auth:",
            metaError
          );
        } else {
          console.log(
            "[WEBHOOK] user_metadata updated successfully for",
            userId
          );
        }

        await upsertEntitlement({
          userId,
          entitlementKey: PLATFORM_ACCESS_ENTITLEMENT,
          status: "active",
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId ?? null,
          stripePriceId: subPriceId,
          metadata: buildPlatformAccessMetadata(
            planId,
            subscription?.items?.data?.[0]?.price?.recurring?.interval ?? session.metadata?.billingCycle
          ),
        });

        // Entitlements for add-ons handled below (includes option flow + broker sync)

        // 3) Enviar emails si tenemos email
        if (email) {
          try {
            const billingCycle =
              subscription?.items?.data?.[0]?.price?.recurring?.interval ??
              session.metadata?.billingCycle ??
              null;
            await sendStripeLifecycleEmailOnce({
              eventId: event.id,
              emailKey: "welcome",
              email,
              stripeObjectId: session.id,
              send: () => sendWelcomeEmailByEmail(email, customerName),
            });
            await sendStripeLifecycleEmailOnce({
              eventId: event.id,
              emailKey: "subscription_confirmation",
              email,
              stripeObjectId: subscriptionId ?? session.id,
              send: () =>
                sendSubscriptionConfirmationEmailByEmail({
                  email,
                  name: customerName,
                  plan: planId,
                  billingCycle,
                  subscriptionId: subscriptionId ?? undefined,
                }),
            });
            console.log("[WEBHOOK] Welcome + confirmation emails sent (userId branch) to", email);
          } catch (mailErr) {
            console.error(
              "[WEBHOOK] Error sending emails (userId branch):",
              mailErr
            );
          }
        }

        if (includesOptionFlowAddon || includesBrokerSyncAddon) {
          const resolvedUserId =
            userId || (await resolveUserIdByEmail(email)) || (await resolveUserIdByCustomer(customerId));
          if (resolvedUserId && subscription) {
            if (includesOptionFlowAddon) {
              await upsertEntitlement({
                userId: resolvedUserId,
                entitlementKey: "option_flow",
                status: "active",
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscription.id,
                stripePriceId: resolveAddonPriceId(subscription, "option_flow"),
              });
            }
            if (includesBrokerSyncAddon) {
              await upsertEntitlement({
                userId: resolvedUserId,
                entitlementKey: "broker_sync",
                status: "active",
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscription.id,
                stripePriceId: resolveAddonPriceId(subscription, "broker_sync"),
              });
            }
          }
        }

        console.log(
          `[WEBHOOK] Subscription active for user ${userId} with plan ${planId}.`
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;
        const subPriceId = subscription.items?.data?.[0]?.price?.id ?? null;
        const addonKey = subscription.metadata?.addonKey as string | undefined;
        const standaloneAddon = isAddonPurchase({ addonKey, priceId: subPriceId });
        const includesOptionFlowAddon =
          standaloneAddon ||
          isTruthy(subscription.metadata?.addonOptionFlow) ||
          hasAddonLineItem(subscription, "option_flow");
        const includesBrokerSyncAddon =
          standaloneAddon ||
          isTruthy(subscription.metadata?.addonBrokerSync) ||
          hasAddonLineItem(subscription, "broker_sync");

        console.log(
          "[WEBHOOK] customer.subscription.deleted:",
          customerId,
          status
        );

        if (standaloneAddon) {
          const keyFromMeta =
            addonKey && ADDON_CONFIG[addonKey as AddonKey]
              ? (addonKey as AddonKey)
              : undefined;
          const resolvedKey = keyFromMeta || resolveAddonKeyFromPriceId(subPriceId);
          const resolvedUserId =
            (subscription.metadata?.supabaseUserId as string | undefined) ||
            (subscription.metadata?.userId as string | undefined) ||
            (await resolveUserIdByCustomer(customerId));

          if (resolvedUserId && resolvedKey) {
            await upsertEntitlement({
              userId: resolvedUserId,
              entitlementKey: resolvedKey,
              status: "canceled",
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: subPriceId ?? resolveAddonPriceId(subscription, resolvedKey),
            });
          }

          break;
        }

        const { data: rows, error } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        if (!error && rows && rows.length > 0) {
          const userId = rows[0].id as string;

          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .update({
              subscription_status: status,
            })
            .eq("id", userId);

          if (profileError) {
            console.error(
              "[WEBHOOK] Error updating profiles on subscription.deleted:",
              profileError
            );
          }

          const { error: metaError } =
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              user_metadata: {
                subscriptionStatus: status,
              },
            });

          if (metaError) {
            console.error(
              "[WEBHOOK] Error updating user_metadata on subscription.deleted:",
              metaError
            );
          }

          await upsertEntitlement({
            userId,
            entitlementKey: PLATFORM_ACCESS_ENTITLEMENT,
            status,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subPriceId,
          });
        }

        if (includesOptionFlowAddon || includesBrokerSyncAddon) {
          const resolvedUserId =
            (subscription.metadata?.supabaseUserId as string | undefined) ||
            (subscription.metadata?.userId as string | undefined) ||
            (await resolveUserIdByCustomer(customerId));
          if (resolvedUserId) {
            if (includesOptionFlowAddon) {
              await upsertEntitlement({
                userId: resolvedUserId,
                entitlementKey: "option_flow",
                status: "canceled",
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscription.id,
                stripePriceId: resolveAddonPriceId(subscription, "option_flow"),
              });
            }
            if (includesBrokerSyncAddon) {
              await upsertEntitlement({
                userId: resolvedUserId,
                entitlementKey: "broker_sync",
                status: "canceled",
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscription.id,
                stripePriceId: resolveAddonPriceId(subscription, "broker_sync"),
              });
            }
          }
        }

        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;
        const subPriceId = subscription.items?.data?.[0]?.price?.id ?? null;
        const addonKey = subscription.metadata?.addonKey as string | undefined;
        const standaloneAddon = isAddonPurchase({ addonKey, priceId: subPriceId });
        const includesOptionFlowAddon =
          standaloneAddon ||
          isTruthy(subscription.metadata?.addonOptionFlow) ||
          hasAddonLineItem(subscription, "option_flow");
        const includesBrokerSyncAddon =
          standaloneAddon ||
          isTruthy(subscription.metadata?.addonBrokerSync) ||
          hasAddonLineItem(subscription, "broker_sync");

        console.log(
          "[WEBHOOK] customer.subscription.updated:",
          customerId,
          status
        );

        if (standaloneAddon) {
          const keyFromMeta =
            addonKey && ADDON_CONFIG[addonKey as AddonKey]
              ? (addonKey as AddonKey)
              : undefined;
          const resolvedKey = keyFromMeta || resolveAddonKeyFromPriceId(subPriceId);
          const resolvedUserId =
            (subscription.metadata?.supabaseUserId as string | undefined) ||
            (subscription.metadata?.userId as string | undefined) ||
            (await resolveUserIdByCustomer(customerId));

          if (resolvedUserId && resolvedKey) {
            await upsertEntitlement({
              userId: resolvedUserId,
              entitlementKey: resolvedKey,
              status,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: subPriceId ?? resolveAddonPriceId(subscription, resolvedKey),
            });
          }

          break;
        }

        const { data: rows, error } = await supabaseAdmin
          .from("profiles")
          .select("id, plan")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        if (!error && rows && rows.length > 0) {
          const userId = rows[0].id as string;
          const profilePlan = String((rows[0] as any).plan ?? "").trim().toLowerCase() || null;

          const { error: profileError } = await supabaseAdmin
            .from("profiles")
            .update({
              subscription_status: status,
            })
            .eq("id", userId);

          if (profileError) {
            console.error(
              "[WEBHOOK] Error updating profiles on subscription.updated:",
              profileError
            );
          }

          const { error: metaError } =
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              user_metadata: {
                subscriptionStatus: status,
              },
            });

          if (metaError) {
            console.error(
              "[WEBHOOK] Error updating user_metadata on subscription.updated:",
              metaError
            );
          }

          await upsertEntitlement({
            userId,
            entitlementKey: PLATFORM_ACCESS_ENTITLEMENT,
            status,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subPriceId,
            metadata: buildPlatformAccessMetadata(
              profilePlan,
              subscription.items?.data?.[0]?.price?.recurring?.interval ?? null
            ),
          });
        }

        if (includesOptionFlowAddon || includesBrokerSyncAddon) {
          const resolvedUserId =
            (subscription.metadata?.supabaseUserId as string | undefined) ||
            (subscription.metadata?.userId as string | undefined) ||
            (await resolveUserIdByCustomer(customerId));
          if (resolvedUserId) {
            if (includesOptionFlowAddon) {
              await upsertEntitlement({
                userId: resolvedUserId,
                entitlementKey: "option_flow",
                status,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscription.id,
                stripePriceId: resolveAddonPriceId(subscription, "option_flow"),
              });
            }
            if (includesBrokerSyncAddon) {
              await upsertEntitlement({
                userId: resolvedUserId,
                entitlementKey: "broker_sync",
                status,
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscription.id,
                stripePriceId: resolveAddonPriceId(subscription, "broker_sync"),
              });
            }
          }
        }

        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        const rawSubscription = (invoice as any)?.subscription;
        const subscriptionId =
          typeof rawSubscription === "string"
            ? rawSubscription
            : typeof rawSubscription?.id === "string"
            ? rawSubscription.id
            : null;
        const subscription = subscriptionId
          ? await stripe.subscriptions.retrieve(subscriptionId).catch(() => null)
          : null;

        try {
          await maybeCreatePartnerCommissionFromInvoice(invoice);
        } catch (err) {
          console.error("[WEBHOOK] Could not create partner commission from invoice.paid:", err);
        }

        if (!isAddonOnlyInvoice(invoice, subscription)) {
          const profile = await resolveProfileByCustomer(customerId);
          const email =
            invoice.customer_email ??
            (profile?.email ? profile.email.toLowerCase() : null);
          const name =
            ((invoice as any)?.customer_name as string | null) ??
            profile?.firstName ??
            null;
          const planId = resolveInvoicePlanId(invoice, subscription, profile?.plan ?? null);
          const billingCycle = resolveInvoiceBillingCycle(invoice, subscription);

          if (email) {
            try {
              await sendStripeLifecycleEmailOnce({
                eventId: event.id,
                emailKey: "subscription_receipt",
                email,
                stripeObjectId: invoice.id,
                send: () =>
                  sendSubscriptionReceiptEmailByEmail({
                    email,
                    name,
                    plan: planId,
                    amount: Number(invoice.amount_paid || invoice.total || 0) / 100,
                    billingCycle,
                    subscriptionId: subscriptionId ?? undefined,
                    invoiceNumber: invoice.number ?? null,
                    invoiceUrl: invoice.hosted_invoice_url ?? null,
                    chargeDate:
                      typeof invoice.status_transitions?.paid_at === "number" && invoice.status_transitions.paid_at > 0
                        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
                        : new Date().toISOString(),
                  }),
              });
            } catch (mailErr) {
              console.error("[WEBHOOK] Could not send invoice.paid receipt email:", mailErr);
            }
          }
        }
        break;
      }

      case "invoice.upcoming": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        const rawSubscription = (invoice as any)?.subscription;
        const subscriptionId =
          typeof rawSubscription === "string"
            ? rawSubscription
            : typeof rawSubscription?.id === "string"
            ? rawSubscription.id
            : null;
        const subscription = subscriptionId
          ? await stripe.subscriptions.retrieve(subscriptionId).catch(() => null)
          : null;

        if (!isAddonOnlyInvoice(invoice, subscription)) {
          const profile = await resolveProfileByCustomer(customerId);
          const email =
            invoice.customer_email ??
            (profile?.email ? profile.email.toLowerCase() : null);
          const name =
            ((invoice as any)?.customer_name as string | null) ??
            profile?.firstName ??
            null;
          const planId = resolveInvoicePlanId(invoice, subscription, profile?.plan ?? null);
          const billingCycle = resolveInvoiceBillingCycle(invoice, subscription);

          if (email) {
            try {
              await sendStripeLifecycleEmailOnce({
                eventId: event.id,
                emailKey: "subscription_renewal_reminder",
                email,
                stripeObjectId: invoice.id,
                send: () =>
                  sendSubscriptionRenewalReminderEmail({
                    email,
                    name,
                    plan: planId,
                    amount: Number(invoice.amount_due || invoice.total || 0) / 100,
                    billingCycle,
                    renewalDate: resolveInvoiceRenewalDate(invoice),
                  }),
              });
            } catch (mailErr) {
              console.error("[WEBHOOK] Could not send invoice.upcoming reminder email:", mailErr);
            }
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : null;
        const rawSubscription = (invoice as any)?.subscription;
        const subscriptionId =
          typeof rawSubscription === "string"
            ? rawSubscription
            : typeof rawSubscription?.id === "string"
            ? rawSubscription.id
            : null;
        const subscription = subscriptionId
          ? await stripe.subscriptions.retrieve(subscriptionId).catch(() => null)
          : null;

        if (!isAddonOnlyInvoice(invoice, subscription)) {
          const profile = await resolveProfileByCustomer(customerId);
          const email =
            invoice.customer_email ??
            (profile?.email ? profile.email.toLowerCase() : null);
          const name =
            ((invoice as any)?.customer_name as string | null) ??
            profile?.firstName ??
            null;
          const planId = resolveInvoicePlanId(invoice, subscription, profile?.plan ?? null);
          const billingCycle = resolveInvoiceBillingCycle(invoice, subscription);

          if (email) {
            try {
              await sendStripeLifecycleEmailOnce({
                eventId: event.id,
                emailKey: "subscription_payment_issue",
                email,
                stripeObjectId: invoice.id,
                send: () =>
                  sendSubscriptionPaymentIssueEmail({
                    email,
                    name,
                    plan: planId,
                    amount: Number(invoice.amount_due || invoice.total || 0) / 100,
                    billingCycle,
                    invoiceNumber: invoice.number ?? null,
                    invoiceUrl: invoice.hosted_invoice_url ?? null,
                    nextAttemptAt:
                      typeof (invoice as any)?.next_payment_attempt === "number" &&
                      (invoice as any).next_payment_attempt > 0
                        ? new Date((invoice as any).next_payment_attempt * 1000).toISOString()
                        : null,
                  }),
              });
            } catch (mailErr) {
              console.error("[WEBHOOK] Could not send invoice.payment_failed email:", mailErr);
            }
          }
        }
        break;
      }

      default:
        // Otros eventos los ignoramos
        console.log("[WEBHOOK] Ignoring event type:", event.type);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Error handling Stripe webhook:", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
