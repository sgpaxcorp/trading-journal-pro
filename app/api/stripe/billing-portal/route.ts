import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "").trim();

function resolveAppUrl(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  if (process.env.NODE_ENV !== "production" && origin.startsWith("http")) {
    return origin;
  }
  if (APP_URL && APP_URL.startsWith("http")) return APP_URL.replace(/\/$/, "");
  throw new Error("Missing or invalid NEXT_PUBLIC_APP_URL");
}

async function getAuthedUser(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { user: null, error: "Unauthorized" };
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: "Unauthorized" };
  return { user: data.user, error: null };
}

function normalizeFlow(raw: unknown) {
  const flow = String(raw ?? "").trim();
  return flow === "payment_method_update" ? "payment_method_update" : "portal";
}

export async function POST(req: NextRequest) {
  try {
    const { user, error } = await getAuthedUser(req);
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const flow = normalizeFlow(body?.flow);
    const appUrl = resolveAppUrl(req);
    const returnUrl =
      flow === "payment_method_update"
        ? `${appUrl}/billing?payment_method=updated`
        : `${appUrl}/billing`;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

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

    if (!customerId) {
      return NextResponse.json({ error: "No Stripe customer found for this account." }, { status: 404 });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      ...(flow === "payment_method_update"
        ? {
            flow_data: {
              type: "payment_method_update",
              after_completion: {
                type: "redirect",
                redirect: {
                  return_url: returnUrl,
                },
              },
            },
          }
        : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
