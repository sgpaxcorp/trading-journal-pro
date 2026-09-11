import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

try {
  const source = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
} catch {
  // Deployed and CI environments can provide variables directly.
}

const baseUrl = String(process.env.RELEASE_BASE_URL || "https://www.neurotrader-journal.com").replace(/\/$/, "");
const email = String(process.env.APP_REVIEW_DEMO_EMAIL || "appreview@neurotrader-journal.com").toLowerCase();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase URL, anon key, and service role key are required.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const client = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (linkError || !linkData?.properties?.hashed_token) {
  throw new Error(linkError?.message ?? "Could not create the release smoke-test session.");
}

const { data: authData, error: authError } = await client.auth.verifyOtp({
  type: "magiclink",
  token_hash: linkData.properties.hashed_token,
});
if (authError || !authData.session?.access_token) {
  throw new Error(authError?.message ?? "Could not verify the release smoke-test session.");
}

const authorization = `Bearer ${authData.session.access_token}`;

const healthResponse = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
const health = await healthResponse.json().catch(() => null);
if (!healthResponse.ok || health?.status !== "ready") {
  throw new Error(`Production health check failed (${healthResponse.status}).`);
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${pathname} returned ${response.status}: ${body?.error ?? "unknown error"}`);
  }
  return body;
}

const access = await request("/api/access/status");
if (!access?.hasAppAccess) throw new Error("The review account does not have mobile platform access.");

const legal = await request("/api/legal/acceptance");
if (!legal?.termsVersion || !legal?.privacyVersion) throw new Error("Legal versions are unavailable.");

if (legal.requiresAcceptance) {
  await request("/api/legal/acceptance", {
    method: "POST",
    body: JSON.stringify({
      legalAccepted: true,
      termsVersion: legal.termsVersion,
      privacyVersion: legal.privacyVersion,
      source: "in_app_update",
      disclosureVersion: "release-smoke-v1",
      location: "release_smoke",
    }),
  });
}

const accountPayload = await request("/api/trading-accounts/list");
const accounts = Array.isArray(accountPayload?.accounts) ? accountPayload.accounts : [];
if (accounts.length === 0) throw new Error("The review account has no trading accounts.");

const accountId = accountPayload.activeAccountId || accounts[0].id;
const notebook = await request(`/api/notebook/workspace?scope=account&accountId=${encodeURIComponent(accountId)}`);
if (!notebook?.library || notebook.library.legacy) {
  throw new Error("The extended Business Notebook schema is unavailable.");
}

const { data: journalTrades, error: journalError } = await client
  .from("journal_trades")
  .select("id,kind,symbol")
  .eq("account_id", accountId)
  .eq("journal_date", "2026-09-07");
if (journalError) throw new Error(`Journal RLS check failed: ${journalError.message}`);
if (!Array.isArray(journalTrades) || journalTrades.length === 0) {
  throw new Error("The review date does not expose its simulated trades.");
}

process.stdout.write(
  JSON.stringify(
    {
      baseUrl,
      health: "ready",
      access: "ok",
      legal: "ok",
      accounts: accounts.length,
      notebook: "ok",
      journalTrades: journalTrades.length,
    },
    null,
    2
  ) + "\n"
);
