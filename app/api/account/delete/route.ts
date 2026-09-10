import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";

type DeleteAccountBody = {
  confirmation?: string;
  email?: string;
};

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey, {});
}

async function listBucketPaths(bucket: string, prefix: string) {
  const found: string[] = [];
  const queue = [prefix];
  while (queue.length) {
    const currentPrefix = queue.shift() as string;
    let offset = 0;
    while (true) {
      const { data, error } = await (supabaseAdmin.storage.from(bucket) as any).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) break;
      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) break;
      for (const row of rows) {
        const name = String((row as any)?.name ?? "");
        if (!name) continue;
        const path = currentPrefix ? `${currentPrefix}/${name}` : name;
        if ((row as any)?.id == null) queue.push(path);
        else found.push(path);
      }
      if (rows.length < 100) break;
      offset += rows.length;
    }
  }
  return found;
}

async function removeStoragePrefix(bucket: string, prefix: string) {
  const paths = await listBucketPaths(bucket, prefix);
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) console.warn(`[account/delete] storage cleanup warning for ${bucket}:`, error.message);
  }
  return paths.length;
}

async function deleteSupportData(userId: string) {
  const { data: tickets, error: ticketListError } = await supabaseAdmin
    .from("support_tickets")
    .select("id")
    .eq("user_id", userId);
  if (ticketListError && ticketListError.code !== "42P01") throw ticketListError;
  const ticketIds = (tickets ?? []).map((ticket: any) => String(ticket?.id ?? "")).filter(Boolean);
  if (ticketIds.length) {
    const { error } = await supabaseAdmin.from("support_messages").delete().in("ticket_id", ticketIds);
    if (error && error.code !== "42P01") throw error;
  }
  const { error: ownMessagesError } = await supabaseAdmin
    .from("support_messages")
    .delete()
    .eq("user_id", userId);
  if (ownMessagesError && ownMessagesError.code !== "42P01") throw ownMessagesError;
  const { error: ticketDeleteError } = await supabaseAdmin
    .from("support_tickets")
    .delete()
    .eq("user_id", userId);
  if (ticketDeleteError && ticketDeleteError.code !== "42P01") throw ticketDeleteError;
}

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
    const limiter = await rateLimit(`account-delete:${userId}:${getClientIp(req)}`, {
      limit: 3,
      windowMs: 60 * 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Too many account deletion attempts. Please try again later." },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const body = (await req.json().catch(() => ({}))) as DeleteAccountBody;
    const confirmation = String(body?.confirmation ?? "").trim().toUpperCase();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const authEmail = String(authData.user.email ?? "").trim().toLowerCase();

    if (confirmation !== "DELETE") {
      return NextResponse.json({ error: "Confirmation phrase is required." }, { status: 400 });
    }

    if (authEmail && email !== authEmail) {
      return NextResponse.json({ error: "Account email confirmation does not match." }, { status: 400 });
    }

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

    const stripe = getStripeClient();
    if ((directSubId || customerId) && !stripe) {
      return NextResponse.json(
        { error: "Billing cancellation is temporarily unavailable. The account was not deleted." },
        { status: 503 }
      );
    }

    if (stripe && customerId) {
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
      if (!stripe) break;
      await stripe.subscriptions.cancel(subId);
    }

    await Promise.all([
      removeStoragePrefix("avatars", userId).catch(() => 0),
      removeStoragePrefix("support_attachments", userId).catch(() => 0),
      removeStoragePrefix("notebook-assets", userId).catch(() => 0),
      removeStoragePrefix("option_flow_reports", userId).catch(() => 0),
      removeStoragePrefix("option_flow_reports", `outcomes/${userId}`).catch(() => 0),
    ]);
    await deleteSupportData(userId);
    await supabaseAdmin.from("launch_waitlist").delete().eq("linked_user_id", userId);

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) {
      throw delErr;
    }

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err: any) {
    console.error("[account/delete] error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
