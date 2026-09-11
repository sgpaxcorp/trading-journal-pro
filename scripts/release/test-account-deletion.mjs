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
  // CI can provide variables directly.
}

const baseUrl = String(process.env.RELEASE_BASE_URL || "https://www.neurotrader-journal.com").replace(/\/$/, "");
const email = String(process.env.APP_REVIEW_DELETE_EMAIL || "appreview-delete@neurotrader-journal.com").toLowerCase();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase configuration is required.");

const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (linkError || !linkData?.properties?.hashed_token) throw linkError || new Error("Could not create deletion session.");
const { data: authData, error: authError } = await client.auth.verifyOtp({
  type: "magiclink",
  token_hash: linkData.properties.hashed_token,
});
if (authError || !authData.session?.access_token) throw authError || new Error("Could not authenticate deletion account.");

const response = await fetch(`${baseUrl}/api/account/delete`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${authData.session.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ confirmation: "DELETE", email }),
});
const body = await response.json().catch(() => null);
if (!response.ok || !body?.deleted) {
  throw new Error(`Deletion API failed (${response.status}): ${body?.error || "unknown error"}`);
}

const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
if (users.users.some((user) => String(user.email || "").toLowerCase() === email)) {
  throw new Error("Deletion account still exists after the API returned success.");
}

console.log(JSON.stringify({ ok: true, deleted: true, email }));
