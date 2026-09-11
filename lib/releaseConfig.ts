const REQUIRED_PRODUCTION_ENV = [
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
] as const;

function isConfigured(value: string | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(
    normalized &&
      !normalized.includes("your_") &&
      !normalized.includes("example") &&
      !normalized.endsWith("_xxx")
  );
}

export function getProductionConfigStatus(env: NodeJS.ProcessEnv = process.env) {
  const missing = REQUIRED_PRODUCTION_ENV.filter((name) => !isConfigured(env[name]));
  const invalid: string[] = [];
  const appUrl = String(env.NEXT_PUBLIC_APP_URL || "").trim();
  const siteUrl = String(env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (appUrl && !appUrl.startsWith("https://")) invalid.push("NEXT_PUBLIC_APP_URL");
  if (siteUrl && !siteUrl.startsWith("https://")) invalid.push("NEXT_PUBLIC_SITE_URL");
  if (String(env.BROKER_CONNECTIONS_ENABLED || "false").toLowerCase() !== "false") {
    invalid.push("BROKER_CONNECTIONS_ENABLED");
  }
  if (String(env.NEXT_PUBLIC_BROKER_CONNECTIONS_ENABLED || "false").toLowerCase() !== "false") {
    invalid.push("NEXT_PUBLIC_BROKER_CONNECTIONS_ENABLED");
  }
  if (String(env.AI_BUDGETS_ENABLED || "true").toLowerCase() !== "true") {
    invalid.push("AI_BUDGETS_ENABLED");
  }

  return {
    ready: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

export { REQUIRED_PRODUCTION_ENV };
