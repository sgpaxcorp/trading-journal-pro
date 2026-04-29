import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  const abs = path.resolve(filePath);
  const text = fs.readFileSync(abs, "utf8");
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvFile(".env.local");
const env = { ...fileEnv, ...process.env };

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const stripeSecretKey = env.STRIPE_SECRET_KEY || "";
const targetEmail = String(env.TARGET_EMAIL || "").trim().toLowerCase();
const targetPassword = String(env.TARGET_PASSWORD || "");
const targetFirstName = String(env.TARGET_FIRST_NAME || "Steven").trim();
const targetLastName = String(env.TARGET_LAST_NAME || "Otero").trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing Supabase service-role configuration in .env.local.");
}

if (!targetEmail || !targetPassword) {
  throw new Error("TARGET_EMAIL and TARGET_PASSWORD are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, {}) : null;

async function listAllUsers() {
  const users = [];
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw new Error(`Could not list auth users: ${error.message}`);
    const batch = data?.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }
  return users;
}

async function listBucketPaths(bucket, prefix = "") {
  const found = [];
  const queue = [prefix];

  while (queue.length) {
    const currentPrefix = queue.shift();
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`[storage:${bucket}] ${error.message}`);
      }

      const rows = Array.isArray(data) ? data : [];
      if (!rows.length) break;

      for (const row of rows) {
        const name = String(row?.name ?? "");
        if (!name) continue;
        const fullPath = currentPrefix ? `${currentPrefix}/${name}` : name;
        const isFolder = row?.id == null;
        if (isFolder) queue.push(fullPath);
        else found.push(fullPath);
      }

      if (rows.length < 100) break;
      offset += rows.length;
    }
  }

  return Array.from(new Set(found));
}

async function removeAllFromBucket(bucket) {
  try {
    const paths = await listBucketPaths(bucket, "");
    if (!paths.length) return 0;

    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      const { error } = await supabase.storage.from(bucket).remove(batch);
      if (error) throw new Error(`[storage:${bucket}] ${error.message}`);
    }

    return paths.length;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Bucket not found") ||
      message.includes("The resource was not found")
    ) {
      return 0;
    }
    throw error;
  }
}

async function selectProfilesByIds(userIds) {
  const rows = [];
  for (let i = 0; i < userIds.length; i += 200) {
    const chunk = userIds.slice(i, i + 200);
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,stripe_customer_id,stripe_subscription_id")
      .in("id", chunk);
    if (error) throw new Error(`Could not load profiles: ${error.message}`);
    rows.push(...(data ?? []));
  }
  return rows;
}

async function cancelStripeSubscriptions(profiles) {
  const candidates = [];
  for (const profile of profiles) {
    const stripeCustomerId = String(profile?.stripe_customer_id ?? "").trim();
    const stripeSubscriptionId = String(profile?.stripe_subscription_id ?? "").trim();
    if (stripeCustomerId || stripeSubscriptionId) {
      candidates.push({
        userId: String(profile?.id ?? ""),
        stripeCustomerId,
        stripeSubscriptionId,
      });
    }
  }

  if (!candidates.length) return 0;
  if (!stripe) {
    throw new Error("Stripe secret key is missing, but users with Stripe billing were found.");
  }

  const cancelled = new Set();

  for (const profile of candidates) {
    const subIds = new Set();
    if (profile.stripeSubscriptionId) subIds.add(profile.stripeSubscriptionId);

    if (profile.stripeCustomerId) {
      const list = await stripe.subscriptions.list({
        customer: profile.stripeCustomerId,
        status: "all",
        limit: 100,
      });

      for (const sub of list.data) {
        if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
        subIds.add(sub.id);
      }
    }

    for (const subId of subIds) {
      if (cancelled.has(subId)) continue;
      try {
        await stripe.subscriptions.cancel(subId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("No such subscription")) {
          continue;
        }
        throw error;
      }
      cancelled.add(subId);
    }
  }

  return cancelled.size;
}

async function clearTableByNotNull(table, column) {
  const { error } = await supabase.from(table).delete().not(column, "is", "null");
  if (!error) return;

  const message = String(error.message || "");
  if (
    message.includes("Could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  ) {
    return;
  }

  throw new Error(`Could not clear ${table}: ${error.message}`);
}

async function verifySingleUserState(userId) {
  const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (authError) throw new Error(`Could not verify auth users: ${authError.message}`);

  const authUsers = authData?.users ?? [];
  if (authUsers.length !== 1) {
    throw new Error(`Expected exactly 1 auth user after wipe, found ${authUsers.length}.`);
  }

  const [{ count: profileCount, error: profileError }, { count: adminCount, error: adminError }] =
    await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("admin_users").select("user_id", { count: "exact", head: true }),
    ]);

  if (profileError) throw new Error(`Could not verify profiles: ${profileError.message}`);
  if (adminError) throw new Error(`Could not verify admin_users: ${adminError.message}`);

  const { data: entitlementRows, error: entError } = await supabase
    .from("user_entitlements")
    .select("entitlement_key,status,source")
    .eq("user_id", userId);
  if (entError) throw new Error(`Could not verify user_entitlements: ${entError.message}`);

  return {
    authUsers: authUsers.length,
    profiles: profileCount ?? 0,
    adminUsers: adminCount ?? 0,
    entitlements: entitlementRows ?? [],
  };
}

async function main() {
  console.log(`Starting full Supabase user-data wipe for target admin ${targetEmail}`);

  const existingUsers = await listAllUsers();
  console.log(`Found ${existingUsers.length} auth user(s) to remove.`);

  const userIds = existingUsers.map((user) => String(user.id)).filter(Boolean);
  const profiles = userIds.length ? await selectProfilesByIds(userIds) : [];
  const cancelledSubscriptions = await cancelStripeSubscriptions(profiles);

  const removedAvatarObjects = await removeAllFromBucket("avatars");
  const removedSupportObjects = await removeAllFromBucket("support_attachments");
  const removedOptionFlowObjects = await removeAllFromBucket("option_flow_reports");

  await clearTableByNotNull("partner_commissions", "id");
  await clearTableByNotNull("partner_payout_requests", "id");
  await clearTableByNotNull("stripe_email_deliveries", "id");
  await clearTableByNotNull("lifecycle_email_deliveries", "id");
  await clearTableByNotNull("admin_settings", "key");

  for (const user of existingUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`Could not delete auth user ${user.id}: ${error.message}`);
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: targetEmail,
    password: targetPassword,
    email_confirm: true,
    user_metadata: {
      first_name: targetFirstName || null,
      last_name: targetLastName || null,
      plan: "core",
      subscriptionStatus: "active",
      accessSource: "admin",
    },
  });

  if (createError || !created?.user) {
    throw new Error(createError?.message ?? "Could not create target auth user.");
  }

  const userId = created.user.id;
  const now = new Date().toISOString();

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email: targetEmail,
      first_name: targetFirstName || null,
      last_name: targetLastName || null,
      subscription_status: "active",
      plan: "core",
      onboarding_completed: false,
    },
    { onConflict: "id" }
  );
  if (profileError) throw new Error(`Could not recreate profile: ${profileError.message}`);

  const { error: entError } = await supabase.from("user_entitlements").upsert(
    {
      user_id: userId,
      entitlement_key: "platform_access",
      status: "active",
      source: "admin",
      started_at: now,
      ends_at: null,
      metadata: {
        granted_via: "wipe_recreate_admin_script",
        manual: true,
      },
    },
    { onConflict: "user_id,entitlement_key" }
  );
  if (entError) throw new Error(`Could not recreate platform entitlement: ${entError.message}`);

  let adminRowError = null;
  {
    const { error } = await supabase.from("admin_users").upsert(
      {
        user_id: userId,
        active: true,
        role: "admin",
      },
      { onConflict: "user_id" }
    );
    adminRowError = error;
  }

  if (adminRowError) {
    const { error } = await supabase.from("admin_users").upsert(
      {
        user_id: userId,
        active: true,
      },
      { onConflict: "user_id" }
    );
    if (error) {
      throw new Error(`Could not recreate admin_users row: ${error.message}`);
    }
  }

  const verification = await verifySingleUserState(userId);

  console.log(JSON.stringify(
    {
      ok: true,
      targetEmail,
      recreatedUserId: userId,
      deletedAuthUsers: existingUsers.length,
      cancelledSubscriptions,
      removedStorageObjects: {
        avatars: removedAvatarObjects,
        support_attachments: removedSupportObjects,
        option_flow_reports: removedOptionFlowObjects,
      },
      verification,
    },
    null,
    2
  ));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
