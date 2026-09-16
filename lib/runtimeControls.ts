import "server-only";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export type RuntimeControlKey =
  | "signup"
  | "checkout"
  | "ai"
  | "pdf_uploads"
  | "email_delivery"
  | "broker_connections";

export type RuntimeControls = Record<RuntimeControlKey, boolean>;

const DEFAULT_CONTROLS: RuntimeControls = {
  signup: true,
  checkout: true,
  ai: true,
  pdf_uploads: true,
  email_delivery: true,
  broker_connections: true,
};

const ENV_DISABLE_KEYS: Record<RuntimeControlKey, string> = {
  signup: "DISABLE_SIGNUP",
  checkout: "DISABLE_CHECKOUT",
  ai: "DISABLE_AI",
  pdf_uploads: "DISABLE_PDF_UPLOADS",
  email_delivery: "DISABLE_EMAIL_DELIVERY",
  broker_connections: "DISABLE_BROKER_CONNECTIONS",
};

let cached: { value: RuntimeControls; expiresAt: number } | null = null;

function envDisabled(key: RuntimeControlKey) {
  return ["1", "true", "yes", "on"].includes(
    String(process.env[ENV_DISABLE_KEYS[key]] ?? "").trim().toLowerCase()
  );
}

export function clearRuntimeControlsCache() {
  cached = null;
}

export async function getRuntimeControls(): Promise<RuntimeControls> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data, error } = await supabaseAdmin
    .from("admin_settings")
    .select("value_json")
    .eq("key", "operational_controls")
    .maybeSingle();

  if (error) {
    console.warn("[runtime-controls] Could not load database controls:", error.message);
  }

  const stored = (data?.value_json ?? {}) as Partial<RuntimeControls>;
  const value = { ...DEFAULT_CONTROLS };
  for (const key of Object.keys(value) as RuntimeControlKey[]) {
    if (typeof stored[key] === "boolean") value[key] = stored[key] as boolean;
    if (envDisabled(key)) value[key] = false;
  }

  cached = { value, expiresAt: Date.now() + 5_000 };
  return value;
}

export async function requireRuntimeControl(key: RuntimeControlKey) {
  const controls = await getRuntimeControls();
  if (controls[key]) return null;

  return NextResponse.json(
    {
      error: "This operation is temporarily paused for maintenance.",
      code: `operation_paused_${key}`,
    },
    { status: 503, headers: { "Retry-After": "300" } }
  );
}
