import "server-only";

import { createHash } from "crypto";
import { Resend } from "resend";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type Severity = "info" | "warning" | "error" | "critical";

type OperationalEvent = {
  severity: Severity;
  source: string;
  eventType: string;
  message: string;
  routePath?: string | null;
  fingerprint?: string | null;
  metadata?: Record<string, unknown>;
};

function compact(value: unknown, max = 1_000) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);
}

function safeMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => !/(token|secret|password|authorization|cookie|email)/i.test(key))
      .slice(0, 30)
      .map(([key, value]) => [compact(key, 80), compact(value, 500)])
  );
}

export function operationalFingerprint(parts: unknown[]) {
  return createHash("sha256").update(parts.map((part) => compact(part, 300)).join("|")).digest("hex").slice(0, 32);
}

export async function recordOperationalEvent(event: OperationalEvent) {
  try {
    const { error } = await supabaseAdmin.from("operational_events").insert({
      severity: event.severity,
      source: compact(event.source, 100),
      event_type: compact(event.eventType, 100),
      message: compact(event.message),
      route_path: event.routePath ? compact(event.routePath.split("?")[0], 300) : null,
      fingerprint: event.fingerprint ? compact(event.fingerprint, 100) : null,
      metadata: safeMetadata(event.metadata),
    });
    if (error) console.warn("[operations] Could not persist event:", error.message);
  } catch (error) {
    console.warn("[operations] Unexpected telemetry error:", error);
  }
}

export async function deliverOperationalAlert(event: OperationalEvent) {
  const fingerprint = event.fingerprint || operationalFingerprint([
    event.source,
    event.eventType,
    event.message,
  ]);
  await recordOperationalEvent({ ...event, fingerprint });

  const windowMinutes = 15;
  const windowId = Math.floor(Date.now() / (windowMinutes * 60_000));
  const dedupeKey = `${fingerprint}:${windowId}`;
  const { error: claimError } = await supabaseAdmin.from("operational_alert_deliveries").insert({
    dedupe_key: dedupeKey,
    fingerprint,
  });
  if (claimError?.code === "23505") return { delivered: false, duplicate: true };
  if (claimError) return { delivered: false, error: claimError.message };

  const recipients = String(process.env.OPERATIONAL_ALERT_EMAILS || process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || recipients.length === 0) {
    await supabaseAdmin
      .from("operational_alert_deliveries")
      .update({ delivery_error: "Operational alert email is not configured." })
      .eq("dedupe_key", dedupeKey);
    return { delivered: false, configured: false };
  }

  try {
    const resend = new Resend(apiKey);
    const from = process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || "NeuroTrader <support@neurotrader-journal.com>";
    const result = await resend.emails.send({
      from,
      to: recipients,
      subject: `[NeuroTrader ${event.severity.toUpperCase()}] ${compact(event.eventType, 80)}`,
      text: [
        compact(event.message),
        `Source: ${compact(event.source, 100)}`,
        event.routePath ? `Route: ${compact(event.routePath.split("?")[0], 300)}` : null,
        `Time: ${new Date().toISOString()}`,
      ].filter(Boolean).join("\n"),
    });
    if (result.error) throw new Error(result.error.message);
    await supabaseAdmin
      .from("operational_alert_deliveries")
      .update({ delivered_at: new Date().toISOString(), delivery_error: null })
      .eq("dedupe_key", dedupeKey);
    return { delivered: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Alert delivery failed.";
    await supabaseAdmin
      .from("operational_alert_deliveries")
      .update({ delivery_error: compact(message, 500) })
      .eq("dedupe_key", dedupeKey);
    return { delivered: false, error: message };
  }
}
