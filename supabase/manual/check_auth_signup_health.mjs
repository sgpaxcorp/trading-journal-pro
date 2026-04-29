import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
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

const cwd = process.cwd();
const env = {
  ...loadEnvFile(path.join(cwd, ".env.local")),
  ...process.env,
};

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const emailPrefix = String(env.AUTH_HEALTHCHECK_EMAIL_PREFIX || "auth-check").trim();
const emailDomain = String(env.AUTH_HEALTHCHECK_EMAIL_DOMAIN || "example.com").trim();
const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
const email = `${emailPrefix}+${timestamp}@${emailDomain}`.toLowerCase();
const password = String(env.AUTH_HEALTHCHECK_PASSWORD || "NtjHealthcheck1!");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let createdUserId = null;

try {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: {
      data: {
        full_name: "Auth Healthcheck",
        first_name: "Auth",
        last_name: "Healthcheck",
        plan: "core",
        subscription_status: "pending",
      },
    },
  });

  if (error || !data?.user?.id) {
    throw new Error(error?.message || "Auth signup healthcheck failed to create a user.");
  }

  createdUserId = data.user.id;

  const profilePayload = {
    id: createdUserId,
    email,
    first_name: "Auth",
    last_name: "Healthcheck",
    plan: "core",
    subscription_status: "pending",
    onboarding_completed: false,
  };

  const { data: initialProfile, error: initialProfileError } = await supabase
    .from("profiles")
    .select("id,email,plan,subscription_status")
    .eq("id", createdUserId)
    .maybeSingle();

  if (initialProfileError) {
    throw new Error(`Initial profile lookup failed: ${initialProfileError.message}`);
  }

  const usedFallbackTrigger = Boolean(initialProfile?.id);

  if (!usedFallbackTrigger) {
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    if (upsertError) {
      throw new Error(`Profile upsert failed: ${upsertError.message}`);
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,plan,subscription_status")
    .eq("id", createdUserId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Final profile lookup failed: ${profileError.message}`);
  }

  if (!profile?.id) {
    throw new Error("Auth signup succeeded, but no profiles row exists after explicit bootstrap.");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        usedFallbackTrigger,
        email,
        userId: createdUserId,
        profile: {
          id: profile.id,
          email: profile.email,
          plan: profile.plan,
          subscriptionStatus: profile.subscription_status,
        },
      },
      null,
      2
    )
  );
} finally {
  if (createdUserId) {
    const { error } = await supabase.auth.admin.deleteUser(createdUserId);
    if (error) {
      console.error(`Cleanup warning: failed to delete healthcheck user ${createdUserId}: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
