// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type PlanId = "core" | "advanced";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {

});
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

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
    console.error("Stripe webhook signature verification failed:", err);
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
        const userId = session.metadata?.supabaseUserId as string | undefined;
        const planIdMeta = session.metadata?.planId as PlanId | undefined;
        const subscriptionId = session.subscription as string | undefined;
        const customerId = session.customer as string | undefined;

        if (!userId) {
          console.warn("[WEBHOOK] checkout.session.completed without userId");
          break;
        }

        let planId: PlanId = planIdMeta ?? "core";

        // Fallback por priceId si hace falta
        if (!planIdMeta && typeof subscriptionId === "string") {
          const subscription = await stripe.subscriptions.retrieve(
            subscriptionId
          );
          const priceId = subscription.items.data[0]?.price?.id;

          if (priceId === process.env.STRIPE_PRICE_ADVANCED_MONTHLY) {
            planId = "advanced";
          } else if (priceId === process.env.STRIPE_PRICE_CORE_MONTHLY) {
            planId = "core";
          }
        }

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
        }

        // 2) Actualiza también user_metadata para que el guard lo vea
        const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(
          userId,
          {
            user_metadata: {
              plan: planId,
              subscriptionStatus: "active", // 👈 AQUÍ LA CLAVE
            },
          }
        );

        if (metaError) {
          console.error(
            "[WEBHOOK] Error updating user_metadata in auth:",
            metaError
          );
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
