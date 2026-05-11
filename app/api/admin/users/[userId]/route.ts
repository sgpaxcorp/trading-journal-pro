import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { ACCESS_GRANTS, isAccessGrantKey, type AccessGrantKey } from "@/lib/accessGrants";

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

function toISO(daysAgo: number) {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

async function syncAdminEntitlements(userId: string, keys: AccessGrantKey[]) {
  const now = new Date().toISOString();
  const selected = new Set<AccessGrantKey>(keys);
  const allKeys = ACCESS_GRANTS.map((grant) => grant.key);
  const toDisable = allKeys.filter((key) => !selected.has(key));

  if (keys.length > 0) {
    const rows = keys.map((key) => ({
      user_id: userId,
      entitlement_key: key,
      status: "active",
      source: "admin",
      started_at: now,
      ends_at: null,
      metadata: {
        granted_via: "admin_panel",
        manual: true,
      },
    }));

    const { error } = await supabaseAdmin.from("user_entitlements").upsert(rows, {
      onConflict: "user_id,entitlement_key",
    });
    if (error) throw error;
  }

  if (toDisable.length > 0) {
    const { error } = await supabaseAdmin
      .from("user_entitlements")
      .update({
        status: "inactive",
        ends_at: now,
        updated_at: now,
      })
      .eq("user_id", userId)
      .in("entitlement_key", toDisable)
      .in("source", ["admin", "manual", "demo"]);

    if (error) throw error;
  }
}

async function buildUserDetail(userId: string) {
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (authError || !authData?.user) {
    throw new Error(authError?.message ?? "User not found.");
  }

  const since30 = toISO(30);
  const since120 = toISO(120);

  const [{ data: profile }, { data: entitlements }, { data: sessions30 }, { data: sessions120 }, { data: events30 }] =
    await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id,email,first_name,last_name,plan,subscription_status,show_in_ranking,created_at")
        .eq("id", userId)
        .maybeSingle(),
      supabaseAdmin
        .from("user_entitlements")
        .select("entitlement_key,status,source")
        .eq("user_id", userId),
      supabaseAdmin
        .from("usage_sessions")
        .select("user_id")
        .eq("user_id", userId)
        .gte("started_at", since30),
      supabaseAdmin
        .from("usage_sessions")
        .select("user_id,last_seen_at,started_at")
        .eq("user_id", userId)
        .gte("started_at", since120),
      supabaseAdmin
        .from("usage_events")
        .select("user_id")
        .eq("user_id", userId)
        .gte("created_at", since30),
    ]);

  const activeEntitlements = (entitlements ?? [])
    .filter((row: any) => {
      const status = String(row?.status ?? "").toLowerCase();
      return status === "active" || status === "trialing" || status === "paid";
    })
    .map((row: any) => String(row?.entitlement_key ?? ""))
    .filter(Boolean)
    .sort();

  const accessSource =
    (entitlements ?? []).find((row: any) => row?.source)?.source ??
    ((authData.user.user_metadata?.accessSource as string | undefined) ?? null);

  let lastActiveAt: string | null = null;
  for (const row of sessions120 ?? []) {
    const candidate = String((row as any)?.last_seen_at ?? (row as any)?.started_at ?? "");
    if (!candidate) continue;
    if (!lastActiveAt || candidate > lastActiveAt) lastActiveAt = candidate;
  }

  const firstName = String((profile as any)?.first_name ?? authData.user.user_metadata?.first_name ?? "");
  const lastName = String((profile as any)?.last_name ?? authData.user.user_metadata?.last_name ?? "");
  const fullName = `${firstName} ${lastName}`.trim() || String(authData.user.email ?? "User");

  return {
    id: String(authData.user.id),
    email: String(authData.user.email ?? ""),
    fullName,
    firstName,
    lastName,
    createdAt: ((profile as any)?.created_at ?? authData.user.created_at ?? null) as string | null,
    lastSignInAt: (authData.user.last_sign_in_at ?? null) as string | null,
    lastActiveAt,
    bannedUntil: (authData.user.banned_until ?? null) as string | null,
    plan: ((profile as any)?.plan ?? authData.user.user_metadata?.plan ?? null) as string | null,
    subscriptionStatus: ((profile as any)?.subscription_status ?? authData.user.user_metadata?.subscriptionStatus ?? null) as string | null,
    showInRanking: Boolean((profile as any)?.show_in_ranking ?? false),
    sessions30d: (sessions30 ?? []).length,
    events30d: (events30 ?? []).length,
    activeEntitlements,
    accessSource,
  };
}

export async function GET(
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

    const user = await buildUserDetail(userId);
    return NextResponse.json({ ok: true, user });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const admin = await getAdminAuth(req);
    if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { userId } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: string; accessKeys?: string[] };
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

    if (action === "update_access") {
      const rawKeys = Array.isArray(body?.accessKeys) ? body.accessKeys : [];
      const accessKeys = Array.from(
        new Set(
          rawKeys
            .map((value) => String(value))
            .filter((value): value is AccessGrantKey => isAccessGrantKey(value))
        )
      );

      await syncAdminEntitlements(userId, accessKeys);
      const user = await buildUserDetail(userId);
      return NextResponse.json({ ok: true, action: "update_access", user, accessKeys });
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
