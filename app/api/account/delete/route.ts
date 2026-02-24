import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authData.user.id;

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: "Stripe secret key not configured." }, { status: 500 });
    }

    // Cancel any active Stripe subscriptions immediately before deleting the user
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    const subIds = new Set<string>();
    const directSubId = profile?.stripe_subscription_id
      ? String(profile.stripe_subscription_id)
      : null;
    if (directSubId) subIds.add(directSubId);

    const customerId = profile?.stripe_customer_id
      ? String(profile.stripe_customer_id)
      : null;

    if (customerId) {
      const list = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      for (const sub of list.data) {
        if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
        subIds.add(sub.id);
      }
    }

    for (const subId of subIds) {
      await stripe.subscriptions.cancel(subId);
    }

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) {
      throw delErr;
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[account/delete] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
