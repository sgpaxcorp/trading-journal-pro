import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const ALL_ACCESS_KEYS = [
  "platform_access",
  "page_dashboard",
  "page_growth_plan",
  "page_journal",
  "page_import",
  "page_order_audit",
  "page_analytics",
  "page_ai_coaching",
  "page_profit_loss_track",
  "option_flow",
  "broker_sync",
  "page_notebook",
  "page_back_study",
  "page_rules_alarms",
  "page_challenges",
  "page_forum",
  "page_global_ranking",
];

function loadEnvFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return {};
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

function parseBool(value, fallback = false) {
  if (value == null || value === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePlan(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "advanced" || normalized === "pro") return "advanced";
  return "core";
}

function projectRefFromUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.split(".")[0] || parsed.hostname;
  } catch {
    return "unknown";
  }
}

async function findAuthUserByEmail(supabase, email) {
  const normalized = String(email || "").trim().toLowerCase();

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });

    if (error) throw new Error(`Could not list auth users: ${error.message}`);

    const users = data?.users ?? [];
    const hit = users.find((user) => String(user.email ?? "").toLowerCase() === normalized);
    if (hit) return hit;
    if (users.length < 200) break;
  }

  return null;
}

async function upsertProfile(supabase, params) {
  const { userId, email, firstName, lastName, plan, subscriptionStatus } = params;

  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("onboarding_completed, show_in_ranking")
    .eq("id", userId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Could not load profile: ${existingError.message}`);
  }

  const payload = {
    id: userId,
    email,
    first_name: firstName || null,
    last_name: lastName || null,
    plan,
    subscription_status: subscriptionStatus,
    onboarding_completed: Boolean(existing?.onboarding_completed ?? false),
    show_in_ranking: Boolean(existing?.show_in_ranking ?? true),
  };

  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) throw new Error(`Could not upsert profile: ${error.message}`);
}

async function upsertEntitlements(supabase, userId, accessKeys, plan) {
  const now = new Date().toISOString();
  const rows = accessKeys.map((key) => ({
    user_id: userId,
    entitlement_key: key,
    status: "active",
    source: "admin",
    started_at: now,
    ends_at: null,
    metadata: {
      granted_via: "bootstrap_admin_user_script",
      manual: true,
      plan,
    },
  }));

  if (!rows.length) return;

  const { error } = await supabase.from("user_entitlements").upsert(rows, {
    onConflict: "user_id,entitlement_key",
  });

  if (error) throw new Error(`Could not upsert entitlements: ${error.message}`);
}

async function upsertAdminUser(supabase, userId) {
  const withRole = await supabase.from("admin_users").upsert(
    {
      user_id: userId,
      active: true,
      role: "admin",
    },
    { onConflict: "user_id" }
  );

  if (!withRole.error) return;

  const fallback = await supabase.from("admin_users").upsert(
    {
      user_id: userId,
      active: true,
    },
    { onConflict: "user_id" }
  );

  if (fallback.error) {
    throw new Error(`Could not upsert admin_users row: ${fallback.error.message}`);
  }
}

async function main() {
  const envFile = process.env.ENV_FILE || ".env.local";
  const fileEnv = loadEnvFile(envFile);
  const env = { ...fileEnv, ...process.env };

  const supabaseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const targetEmail = String(env.TARGET_EMAIL || "").trim().toLowerCase();
  const targetPassword = String(env.TARGET_PASSWORD || "");
  const targetFirstName = String(env.TARGET_FIRST_NAME || "").trim();
  const targetLastName = String(env.TARGET_LAST_NAME || "").trim();
  const targetPlan = normalizePlan(env.TARGET_PLAN || "advanced");
  const subscriptionStatus = String(env.TARGET_SUBSCRIPTION_STATUS || "active").trim() || "active";
  const grantAllAccess = parseBool(env.GRANT_ALL_ACCESS, true);
  const makeAdmin = parseBool(env.MAKE_ADMIN, true);
  const targetAccessKeys = grantAllAccess ? ALL_ACCESS_KEYS : parseCsv(env.TARGET_ACCESS_KEYS || "platform_access");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}.`);
  }

  if (!targetEmail || !targetEmail.includes("@")) {
    throw new Error("TARGET_EMAIL is required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let authUser = await findAuthUserByEmail(supabase, targetEmail);
  const existed = Boolean(authUser);

  if (!authUser) {
    if (targetPassword.length < 8) {
      throw new Error("TARGET_PASSWORD must be at least 8 characters when creating a new user.");
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email: targetEmail,
      password: targetPassword,
      email_confirm: true,
      user_metadata: {
        first_name: targetFirstName || null,
        last_name: targetLastName || null,
        full_name: [targetFirstName, targetLastName].filter(Boolean).join(" ") || null,
        plan: targetPlan,
        subscriptionStatus,
        accessSource: "admin",
      },
    });

    if (error || !data?.user) {
      throw new Error(error?.message ?? "Could not create auth user.");
    }

    authUser = data.user;
  } else {
    const nextMetadata = {
      ...(authUser.user_metadata ?? {}),
      first_name: targetFirstName || authUser.user_metadata?.first_name || null,
      last_name: targetLastName || authUser.user_metadata?.last_name || null,
      full_name:
        [targetFirstName || authUser.user_metadata?.first_name, targetLastName || authUser.user_metadata?.last_name]
          .filter(Boolean)
          .join(" ") || authUser.user_metadata?.full_name || null,
      plan: targetPlan,
      subscriptionStatus,
      accessSource: "admin",
    };

    const updatePayload = {
      user_metadata: nextMetadata,
      ...(targetPassword.length >= 8 ? { password: targetPassword } : {}),
    };

    const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, updatePayload);
    if (error || !data?.user) {
      throw new Error(error?.message ?? "Could not update auth user.");
    }

    authUser = data.user;
  }

  await upsertProfile(supabase, {
    userId: authUser.id,
    email: targetEmail,
    firstName: targetFirstName,
    lastName: targetLastName,
    plan: targetPlan,
    subscriptionStatus,
  });

  await upsertEntitlements(supabase, authUser.id, targetAccessKeys, targetPlan);
  if (makeAdmin) {
    await upsertAdminUser(supabase, authUser.id);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        envFile,
        projectRef: projectRefFromUrl(supabaseUrl),
        targetEmail,
        userId: authUser.id,
        existed,
        plan: targetPlan,
        subscriptionStatus,
        grants: targetAccessKeys,
        admin: makeAdmin,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
