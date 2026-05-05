import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv(path) {
  const content = readFileSync(path, "utf8");
  const vars = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let [, key, value] = match;
    value = value.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

async function main() {
  const target = String(process.argv[2] || "").trim().toLowerCase();
  if (!target) {
    throw new Error("Usage: node supabase/manual/check_resend_email_activity.mjs <email>");
  }

  const env = loadEnv(resolve(process.cwd(), ".env.local"));
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Missing RESEND_API_KEY in .env.local");

  const response = await fetch("https://api.resend.com/emails?limit=100", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": "codex/1.0",
    },
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    console.log(JSON.stringify({ status: response.status, ok: response.ok, body }, null, 2));
    process.exit(1);
  }

  const rows = (body.data || [])
    .filter((item) => Array.isArray(item.to) && item.to.some((v) => String(v).toLowerCase().includes(target)))
    .map((item) => ({
      id: item.id,
      created_at: item.created_at,
      subject: item.subject,
      from: item.from,
      to: item.to,
      last_event: item.last_event,
    }));

  console.log(JSON.stringify({ status: response.status, ok: response.ok, count: rows.length, rows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
