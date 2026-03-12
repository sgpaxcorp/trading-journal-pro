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
  sendSubscriptionReceiptEmailByEmail,
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

function buildPlatformAccessMetadata(planId?: string | null, billingCycle?: string | null) {
  return {
    plan: String(planId ?? "").trim().toLowerCase() || null,
    billingCycle: normalizeBillingCycle(billingCycle) ?? null,
  };
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
        const amountTotal = session.amount_total
          ? session.amount_total / 100
          : undefined;

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
                await sendWelcomeEmailByEmail(email, customerName);
                await sendSubscriptionReceiptEmailByEmail({
                  email,
                  plan: planId,
                  amount: amountTotal,
                  subscriptionId: subscriptionId ?? undefined,
                });
                console.log(
                  "[WEBHOOK] Welcome + receipt emails sent (by email branch) to",
                  email
                );
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
            await sendWelcomeEmailByEmail(email, customerName);
            await sendSubscriptionReceiptEmailByEmail({
              email,
              plan: planId,
              amount: amountTotal,
              subscriptionId: subscriptionId ?? undefined,
            });
            console.log(
              "[WEBHOOK] Welcome + receipt emails sent (userId branch) to",
              email
            );
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
        try {
          await maybeCreatePartnerCommissionFromInvoice(invoice);
        } catch (err) {
          console.error("[WEBHOOK] Could not create partner commission from invoice.paid:", err);
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
