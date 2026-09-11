import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envFile = process.argv[2] || ".env.local";
const source = readFileSync(resolve(process.cwd(), envFile), "utf8");
const env = {};
for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) continue;
  let value = match[2].trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[match[1]] = value;
}

const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_CORE_MONTHLY",
  "STRIPE_PRICE_CORE_ANNUAL",
  "STRIPE_PRICE_ADVANCED_MONTHLY",
  "STRIPE_PRICE_ADVANCED_ANNUAL",
  "OPENAI_API_KEY",
  "NEURO_ANALYSIS_CFA_VECTOR_STORE_ID",
  "RESEND_API_KEY",
  "HCAPTCHA_SECRET_KEY",
  "NEXT_PUBLIC_HCAPTCHA_SITE_KEY",
  "CRON_SECRET",
  "ADMIN_ACTION_SECRET",
  "BROKER_SECRET_ENCRYPTION_KEY",
  "WAITLIST_ANNUAL_PROMO_CODE",
  "WAITLIST_ANNUAL_PROMO_URL",
];

const missing = required.filter((key) => !String(env[key] || "").trim());
const invalid = [];
for (const key of ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL"]) {
  if (env[key] && !env[key].startsWith("https://")) invalid.push(key);
}
if (String(env.BROKER_CONNECTIONS_ENABLED || "false").toLowerCase() !== "false") {
  invalid.push("BROKER_CONNECTIONS_ENABLED");
}
if (String(env.NEXT_PUBLIC_BROKER_CONNECTIONS_ENABLED || "false").toLowerCase() !== "false") {
  invalid.push("NEXT_PUBLIC_BROKER_CONNECTIONS_ENABLED");
}
if (String(env.AI_BUDGETS_ENABLED || "true").toLowerCase() !== "true") {
  invalid.push("AI_BUDGETS_ENABLED");
}

if (missing.length || invalid.length) {
  console.error(JSON.stringify({ ready: false, missing, invalid }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ready: true, requiredVariables: required.length }, null, 2));
