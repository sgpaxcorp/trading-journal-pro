import { NextRequest, NextResponse } from "next/server";

import { requireCronSecret } from "@/lib/cronAuth";
import { deliverOperationalAlert, operationalFingerprint, recordOperationalEvent } from "@/lib/operationalTelemetry";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

async function count(table: string, filters: (query: any) => any) {
  const result = await filters(supabaseAdmin.from(table).select("*", { count: "exact", head: true }));
  if (result.error) throw new Error(`${table}: ${result.error.message}`);
  return result.count ?? 0;
}

async function handle(req: NextRequest) {
  const auth = requireCronSecret(req);
  if (!auth.ok) return auth.response;

  try {
    const staleCutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    const [neuroFailed, neuroStale, emailFailed, emailStale, stripeFailed] = await Promise.all([
      count("neuro_analysis_jobs", (query) => query.eq("status", "failed")),
      count("neuro_analysis_jobs", (query) => query.eq("status", "queued").lt("created_at", staleCutoff)),
      count("email_delivery_jobs", (query) => query.eq("status", "failed")),
      count("email_delivery_jobs", (query) => query.eq("status", "queued").lt("created_at", staleCutoff)),
      count("stripe_webhook_events", (query) => query.eq("status", "failed")),
    ]);
    const metrics = { neuroFailed, neuroStale, emailFailed, emailStale, stripeFailed };
    const issueCount = Object.values(metrics).reduce((sum, value) => sum + value, 0);

    if (issueCount > 0) {
      const message = `Operational watchdog found ${issueCount} queue or webhook issue(s).`;
      await deliverOperationalAlert({
        severity: stripeFailed > 0 || neuroFailed > 0 || emailFailed > 0 ? "critical" : "warning",
        source: "operations-watchdog",
        eventType: "background_processing_degraded",
        message,
        fingerprint: operationalFingerprint(["background_processing_degraded", JSON.stringify(metrics)]),
        metadata: metrics,
      });
    } else {
      await recordOperationalEvent({
        severity: "info",
        source: "operations-watchdog",
        eventType: "health_check_passed",
        message: "Background queues and Stripe webhook processing are healthy.",
        metadata: metrics,
      });
    }

    return NextResponse.json({ ok: issueCount === 0, metrics, checkedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Watchdog failed.";
    await deliverOperationalAlert({
      severity: "critical",
      source: "operations-watchdog",
      eventType: "watchdog_failed",
      message,
    });
    return NextResponse.json({ error: "Operational watchdog failed." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
