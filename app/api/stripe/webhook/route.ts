// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import {
  sendWelcomeEmailByEmail,
  sendSubscriptionReceiptEmailByEmail,
} from "@/lib/email";

type PlanId = "core" | "advanced";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
const ADDON_KEY = "option_flow";
const ADDON_PRICE_ID = process.env.STRIPE_PRICE_OPTIONFLOW_MONTHLY ?? "";

async function upsertEntitlement(params: {
  userId: string;
  status: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
}) {
  const { userId, status, stripeCustomerId, stripeSubscriptionId, stripePriceId } = params;
  if (!userId) return;

  try {
    await supabaseAdmin.from("user_entitlements").upsert(
      {
        user_id: userId,
        entitlement_key: ADDON_KEY,
        status,
        source: "stripe",
        stripe_customer_id: stripeCustomerId ?? null,
        stripe_subscription_id: stripeSubscriptionId ?? null,
        stripe_price_id: stripePriceId ?? null,
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

function isAddonPurchase(params: { addonKey?: string | null; priceId?: string | null }) {
  const addonKey = String(params.addonKey || "");
  const priceId = String(params.priceId || "");
  return addonKey === ADDON_KEY || (!!ADDON_PRICE_ID && priceId === ADDON_PRICE_ID);
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

        const subAddonKey =
          subscription?.metadata?.addonKey as string | undefined;
        const subPriceId = subscription?.items?.data?.[0]?.price?.id ?? null;

        // ✅ Add-on flow (Option Flow)
        if (isAddonPurchase({ addonKey: sessionAddonKey || subAddonKey, priceId: subPriceId })) {
          const resolvedUserId =
            userId || (await resolveUserIdByEmail(email)) || (await resolveUserIdByCustomer(customerId));

          if (resolvedUserId) {
            await upsertEntitlement({
              userId: resolvedUserId,
              status: "active",
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId ?? null,
              stripePriceId: subPriceId ?? ADDON_PRICE_ID ?? null,
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

        console.log(
          "[WEBHOOK] customer.subscription.deleted:",
          customerId,
          status
        );

        if (isAddonPurchase({ addonKey, priceId: subPriceId })) {
          const resolvedUserId =
            (subscription.metadata?.supabaseUserId as string | undefined) ||
            (subscription.metadata?.userId as string | undefined) ||
            (await resolveUserIdByCustomer(customerId));

          if (resolvedUserId) {
            await upsertEntitlement({
              userId: resolvedUserId,
              status: "canceled",
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: subPriceId ?? ADDON_PRICE_ID ?? null,
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
        }

        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status;
        const subPriceId = subscription.items?.data?.[0]?.price?.id ?? null;
        const addonKey = subscription.metadata?.addonKey as string | undefined;

        console.log(
          "[WEBHOOK] customer.subscription.updated:",
          customerId,
          status
        );

        if (isAddonPurchase({ addonKey, priceId: subPriceId })) {
          const resolvedUserId =
            (subscription.metadata?.supabaseUserId as string | undefined) ||
            (subscription.metadata?.userId as string | undefined) ||
            (await resolveUserIdByCustomer(customerId));

          if (resolvedUserId) {
            await upsertEntitlement({
              userId: resolvedUserId,
              status,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscription.id,
              stripePriceId: subPriceId ?? ADDON_PRICE_ID ?? null,
            });
          }

          break;
        }

        if (
          status === "canceled" ||
          status === "unpaid" ||
          status === "past_due"
        ) {
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
