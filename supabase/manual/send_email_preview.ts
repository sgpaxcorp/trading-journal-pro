import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { pathToFileURL } from "url";
import { resolve } from "path";

function loadEnvFile(path: string) {
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));

  const [key, to, arg3, arg4, arg5, arg6] = process.argv.slice(2);
  if (!key || !to) {
    throw new Error(
      "Usage: node --experimental-transform-types supabase/manual/send_email_preview.ts <key> <email> [args...]"
    );
  }

  const sourcePath = resolve(process.cwd(), "lib", "email.ts");
  const tempPath = resolve(process.cwd(), "lib", "__email_preview__.ts");
  const source = readFileSync(sourcePath, "utf8")
    .replace('import { AppUser, PlanId } from "./types";', 'import type { AppUser, PlanId } from "./types.ts";')
    .replace('@/lib/supaBaseAdmin', "./supaBaseAdmin.ts");

  writeFileSync(tempPath, source, "utf8");

  try {
    const mod = await import(`${pathToFileURL(tempPath).href}?t=${Date.now()}`);
    if (key === "welcome_live") {
      await mod.sendWelcomeEmailByEmail(to, arg3 || null);
    } else if (key === "subscription_confirmation_live") {
      await mod.sendSubscriptionConfirmationEmailByEmail({
        email: to,
        name: arg3 || null,
        plan: arg4 || "advanced",
        billingCycle: arg5 || "annual",
        subscriptionId: arg6 || null,
      });
    } else {
      await mod.sendAutomatedEmailTest({ key: key as any, to });
    }
    console.log(JSON.stringify({ ok: true, key, to }, null, 2));
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
