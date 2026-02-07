import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {});

function toIso(ts?: number | null) {
  if (!ts || !Number.isFinite(ts)) return "";
  return new Date(ts * 1000).toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ invoices: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ invoices: [] }, { status: 401 });
    }

    const userId = authData.user.id;
    const email = authData.user.email ?? "";

    let customerId: string | null = null;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.stripe_customer_id) {
      customerId = String(profile.stripe_customer_id);
    } else if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });
      if (existing.data.length > 0) {
        customerId = existing.data[0].id;
      }
    }

    if (!customerId) {
      return NextResponse.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 24,
      expand: ["data.lines"],
    });

    const rows = (invoices.data || []).map((inv) => ({
      id: inv.id,
      number: inv.number || inv.id.slice(-6),
      date: toIso(inv.created) || new Date().toISOString(),
      amount_due: inv.amount_due ?? 0,
      amount_paid: inv.amount_paid ?? 0,
      currency: inv.currency ?? "usd",
      status: (inv.status ?? "open") as "paid" | "open" | "void",
      hosted_invoice_url: inv.hosted_invoice_url ?? null,
      invoice_pdf: inv.invoice_pdf ?? null,
      billing_reason: inv.billing_reason ?? null,
      subscription: (inv as any).subscription ? String((inv as any).subscription) : null,
      period_start: toIso(inv.period_start),
      period_end: toIso(inv.period_end),
      lines: (inv.lines?.data || []).map((line) => {
        const price = (line as any).price ?? (line as any).plan ?? null;
        return {
          description:
            line.description ??
            (price?.nickname as string | undefined) ??
            "Subscription",
          amount: (line as any).amount ?? 0,
          quantity: (line as any).quantity ?? null,
          price: price?.unit_amount ?? null,
        };
      }),
    }));

    return NextResponse.json({ invoices: rows });
  } catch (err: any) {
    console.error("[stripe/invoices] error:", err);
    return NextResponse.json(
      { invoices: [], error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
