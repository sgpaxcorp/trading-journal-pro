import { NextRequest, NextResponse } from "next/server";

import { requireAdminActionSecret, requireAdminUser } from "@/lib/adminAuth";
import { recordAdminAuditEvent } from "@/lib/adminAudit";
import {
  clearRuntimeControlsCache,
  getRuntimeControls,
  type RuntimeControlKey,
  type RuntimeControls,
} from "@/lib/runtimeControls";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

const CONTROL_KEYS: RuntimeControlKey[] = [
  "signup",
  "checkout",
  "ai",
  "pdf_uploads",
  "email_delivery",
  "broker_connections",
];

async function loadQueueMetrics() {
  const staleCutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const [neuroQueued, neuroRunning, neuroFailed, neuroStale, emailQueued, emailRunning, emailFailed, emailStale, webhookFailed] = await Promise.all([
    supabaseAdmin.from("neuro_analysis_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
    supabaseAdmin.from("neuro_analysis_jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
    supabaseAdmin.from("neuro_analysis_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabaseAdmin.from("neuro_analysis_jobs").select("id", { count: "exact", head: true }).eq("status", "queued").lt("created_at", staleCutoff),
    supabaseAdmin.from("email_delivery_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
    supabaseAdmin.from("email_delivery_jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
    supabaseAdmin.from("email_delivery_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    supabaseAdmin.from("email_delivery_jobs").select("id", { count: "exact", head: true }).eq("status", "queued").lt("created_at", staleCutoff),
    supabaseAdmin.from("stripe_webhook_events").select("event_id", { count: "exact", head: true }).eq("status", "failed"),
  ]);

  return {
    neuro: {
      queued: neuroQueued.count ?? 0,
      running: neuroRunning.count ?? 0,
      failed: neuroFailed.count ?? 0,
      stale: neuroStale.count ?? 0,
    },
    email: {
      queued: emailQueued.count ?? 0,
      running: emailRunning.count ?? 0,
      failed: emailFailed.count ?? 0,
      stale: emailStale.count ?? 0,
    },
    stripe: { failed: webhookFailed.count ?? 0 },
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req, { action: "operations:read", permission: "operations.read", limit: 60, windowMs: 60_000 });
  if (!admin.ok) return admin.response;

  const { data: recentEvents } = await supabaseAdmin
    .from("operational_events")
    .select("id, severity, source, event_type, message, route_path, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  return NextResponse.json({
    controls: await getRuntimeControls(),
    queues: await loadQueueMetrics(),
    recentEvents: recentEvents ?? [],
    checkedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, { action: "operations:write", permission: "operations.write", limit: 12, windowMs: 10 * 60_000 });
  if (!admin.ok) return admin.response;

  const body = await req.json().catch(() => ({}));
  const stepUpResponse = requireAdminActionSecret(req, body);
  if (stepUpResponse) return stepUpResponse;

  const current = await getRuntimeControls();
  const next: RuntimeControls = { ...current };
  for (const key of CONTROL_KEYS) {
    if (typeof body?.controls?.[key] === "boolean") next[key] = body.controls[key];
  }

  const { error } = await supabaseAdmin.from("admin_settings").upsert(
    {
      key: "operational_controls",
      value_json: next,
      updated_by: admin.user.id,
    },
    { onConflict: "key" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  clearRuntimeControlsCache();
  await recordAdminAuditEvent({
    req,
    adminUserId: admin.user.id,
    adminEmail: admin.user.email,
    action: "admin_operational_controls_updated",
    metadata: { previous: current, next },
  });

  return NextResponse.json({ ok: true, controls: await getRuntimeControls() });
}
