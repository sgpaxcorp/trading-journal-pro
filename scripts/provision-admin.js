/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

function loadEnvFile(filename) {
  const envPath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (!value) return;
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvFile(".env.local");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  "NeuroTrader Journal <support@neurotrader-journal.com>";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NAME = process.env.ADMIN_NAME || "NeuroTrader Admin";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.");
  process.exit(1);
}
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("Missing ADMIN_EMAIL or ADMIN_PASSWORD. Provide both before running.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserIdByEmail(email) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.error("Error listing users:", error);
    return null;
  }
  const user = data?.users?.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  return user?.id || null;
}

async function ensureAdminUser() {
  let userId = null;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: ADMIN_NAME, role: "staff" },
  });

  if (createErr) {
    console.warn("Admin user creation warning:", createErr.message || createErr);
    userId = await findUserIdByEmail(ADMIN_EMAIL);
  } else {
    userId = created?.user?.id || null;
  }

  if (!userId) {
    console.error("Could not resolve admin user id. Aborting.");
    process.exit(1);
  }

  await supabase.from("profiles").upsert({
    id: userId,
    email: ADMIN_EMAIL.toLowerCase(),
    first_name: "Support",
    last_name: "Admin",
    subscription_status: "active",
    plan: "advanced",
    onboarding_completed: true,
  });

  await supabase.from("admin_users").upsert(
    {
      user_id: userId,
      role: "owner",
      active: true,
    },
    { onConflict: "user_id" }
  );

  return userId;
}

async function sendAdminWelcomeEmail() {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set; skipping email.");
    return;
  }

  const resend = new Resend(RESEND_API_KEY);

  const subject = "Bienvenido Admin — NeuroTrader Journal";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#0f172a;">
      <h2 style="margin:0 0 12px 0;">Bienvenido, Admin</h2>
      <p>Tu acceso de staff ya está listo.</p>
      <p><strong>Usuario:</strong> ${ADMIN_EMAIL}</p>
      <p>Ya puedes entrar al panel de administración para ver métricas de uso y crecimiento.</p>
      <p style="color:#64748b;font-size:12px;">NeuroTrader Journal</p>
    </div>
  `;

  await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject,
    html,
  });
}

(async () => {
  console.log("Provisioning admin user...");
  const userId = await ensureAdminUser();
  console.log("Admin user ready:", userId);
  await sendAdminWelcomeEmail();
  console.log("Done.");
  process.exit(0);
})();
