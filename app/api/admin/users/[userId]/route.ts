import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY as string, {})
  : null;

function parseAdminEmails(envValue?: string | null) {
  return (envValue || "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

async function isAdmin(userId: string, email?: string | null): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("user_id, active")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1);
  if (!error && (data ?? []).length > 0) return true;

  const allowList = parseAdminEmails(process.env.ADMIN_EMAILS);
  if (email && allowList.includes(email.toLowerCase())) return true;
  return false;
}

async function getAdminAuth(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return null;

  const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !authData?.user) return null;

  const ok = await isAdmin(authData.user.id, authData.user.email);
  if (!ok) return null;
  return authData.user;
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

      if (error) {
        console.warn(`[admin/users/reset] storage list failed for ${bucket}:${currentPrefix}`, error);
        break;
      }

      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) break;

      for (const row of rows) {
        const name = String((row as any)?.name ?? "");
        if (!name) continue;
        const fullPath = currentPrefix ? `${currentPrefix}/${name}` : name;
        const isFolder = (row as any)?.id == null;
        if (isFolder) queue.push(fullPath);
        else found.push(fullPath);
      }

      if (rows.length < 100) break;
      offset += rows.length;
    }
  }

  return Array.from(new Set(found));
}

async function removeStoragePrefix(bucket: string, prefix: string) {
  const paths = await listBucketPaths(bucket, prefix);
  if (!paths.length) return 0;

  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await supabaseAdmin.storage.from(bucket).remove(batch);
    if (error) {
      console.warn(`[admin/users/reset] storage remove failed for ${bucket}:${prefix}`, error);
    }
  }

  return paths.length;
}

async function cancelStripeSubscriptions(params: {
  userId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}) {
  const directSubId = params.stripeSubscriptionId ? String(params.stripeSubscriptionId) : null;
  const customerId = params.stripeCustomerId ? String(params.stripeCustomerId) : null;

  if (!directSubId && !customerId) return 0;
  if (!stripe) {
    throw new Error("Stripe secret key not configured. Cannot safely reset a user with Stripe billing attached.");
  }

  const subIds = new Set<string>();
  if (directSubId) subIds.add(directSubId);

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

  return subIds.size;
}

async function performFullReset(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email,stripe_customer_id,stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();

  const cancelledSubscriptions = await cancelStripeSubscriptions({
    userId,
    stripeCustomerId: (profile as any)?.stripe_customer_id ?? null,
    stripeSubscriptionId: (profile as any)?.stripe_subscription_id ?? null,
  });

  const avatarCount = await removeStoragePrefix("avatars", userId).catch(() => 0);
  const supportAttachmentCount = await removeStoragePrefix("support_attachments", userId).catch(() => 0);
  const optionFlowReportCount = await removeStoragePrefix("option_flow_reports", userId).catch(() => 0);
  const optionFlowOutcomeCount = await removeStoragePrefix("option_flow_reports", `outcomes/${userId}`).catch(() => 0);

  await supabaseAdmin.from("partner_commissions").delete().or(`partner_user_id.eq.${userId},referred_user_id.eq.${userId}`);
  await supabaseAdmin.from("partner_payout_requests").delete().eq("partner_user_id", userId);

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(error.message ?? "Could not delete auth user.");
  }

  return {
    email: ((profile as any)?.email as string | null) ?? null,
    cancelledSubscriptions,
    removedStorageObjects:
      avatarCount + supportAttachmentCount + optionFlowReportCount + optionFlowOutcomeCount,
  };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = String(body?.action ?? "").toLowerCase();

    if (!userId) {
      return NextResponse.json({ error: "Missing user id." }, { status: 400 });
    }

    if (admin.id === userId && action === "reset") {
      return NextResponse.json(
        { error: "You cannot full-reset your own admin account from this panel." },
        { status: 400 }
      );
    }

    if (action === "ban") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "876000h",
      } as any);
      if (error) {
        return NextResponse.json({ error: error.message ?? "Could not ban user." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: "ban" });
    }

    if (action === "unban") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: "none",
      } as any);
      if (error) {
        return NextResponse.json({ error: error.message ?? "Could not unban user." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, action: "unban" });
    }

    if (action === "reset") {
      const result = await performFullReset(userId);
      return NextResponse.json({ ok: true, action: "reset", result });
    }

    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  } catch (err: any) {
    console.error("[admin/users/:id] patch error:", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId } = await params;
    if (!userId) {
      return NextResponse.json({ error: "Missing user id." }, { status: 400 });
    }

    if (admin.id === userId) {
      return NextResponse.json(
        { error: "You cannot delete your own admin account from this panel." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) {
      return NextResponse.json({ error: error.message ?? "Could not delete user." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: true });
  } catch (err: any) {
    console.error("[admin/users/:id] delete error:", err);
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}
