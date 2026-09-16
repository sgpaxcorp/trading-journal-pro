import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { requireAdminActionSecret, requireAdminUser } from "@/lib/adminAuth";
import { recordAdminAuditEvent } from "@/lib/adminAudit";
import {
  emergencyPortfolioControlDraft,
  getEmergencyPortfolioControls,
  isEmergencyControlRelaxation,
  RE_ENABLE_FINANCIAL_ACTIONS_CONFIRMATION,
  serializeEmergencyPortfolioControlDraft,
  type EmergencyPortfolioControlDraft,
} from "@/lib/emergencyPortfolioControls";
import { getClientIp } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...init?.headers, "Cache-Control": "no-store" },
  });
}

function parseDraft(value: unknown): EmergencyPortfolioControlDraft | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const keys: Array<keyof EmergencyPortfolioControlDraft> = [
    "aiTradeProposalsEnabled",
    "brokerConnectivityEnabled",
    "newOrdersEnabled",
    "readOnly",
    "investorTransactionsEnabled",
    "manualReconciliationRequired",
  ];
  if (keys.some((key) => typeof row[key] !== "boolean")) return null;
  return Object.fromEntries(keys.map((key) => [key, row[key]])) as EmergencyPortfolioControlDraft;
}

function databaseErrorResponse(error: any) {
  const code = String(error?.code ?? "");
  if (code === "40001") {
    return noStoreJson({ error: error.message }, { status: 409 });
  }
  if (code === "42501") {
    return noStoreJson({ error: error.message }, { status: 403 });
  }
  if (code === "P0001" || code === "23514") {
    return noStoreJson({ error: error.message }, { status: 400 });
  }
  if (code === "42883" || code === "42P01" || code === "PGRST202" || code === "PGRST205") {
    return noStoreJson(
      { error: "Emergency Portfolio Control System is not installed. Apply the latest Supabase migration." },
      { status: 503 }
    );
  }
  console.error("[admin/emergency-portfolio] database error:", error);
  return noStoreJson({ error: "Could not update emergency portfolio controls." }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const admin = await requireAdminUser(req, {
    action: "emergency-portfolio:read",
    limit: 60,
    windowMs: 60_000,
  });
  if (!admin.ok) return admin.response;

  const [controls, eventsResult] = await Promise.all([
    getEmergencyPortfolioControls(),
    supabaseAdmin
      .from("portfolio_emergency_control_events")
      .select(
        "id,event_sequence,action,actor_email,reason,changed_controls,human_approval,previous_event_hash,event_hash,created_at"
      )
      .order("event_sequence", { ascending: false })
      .limit(30),
  ]);

  if (eventsResult.error) return databaseErrorResponse(eventsResult.error);
  return noStoreJson({
    controls,
    auditEvents: eventsResult.data ?? [],
    immutableAudit: true,
    checkedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdminUser(req, {
    action: "emergency-portfolio:write",
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!admin.ok) return admin.response;

  const body = await req.json().catch(() => ({}));
  const stepUpResponse = requireAdminActionSecret(req, body);
  if (stepUpResponse) return stepUpResponse;

  const current = await getEmergencyPortfolioControls();
  if (current.failSafe) {
    return noStoreJson(
      { error: "Controls are in fail-safe mode because their database state could not be verified." },
      { status: 503 }
    );
  }

  const next = parseDraft(body?.controls);
  const reason = String(body?.reason ?? "").trim().slice(0, 2_000);
  const expectedVersion = Number(body?.expectedVersion);
  const humanApproval = body?.humanApproval === true;
  const approvalConfirmation = String(body?.approvalConfirmation ?? "").trim();
  if (!next) {
    return noStoreJson({ error: "Every emergency portfolio control must be boolean." }, { status: 400 });
  }
  if (reason.length < 10) {
    return noStoreJson({ error: "Document a reason of at least 10 characters." }, { status: 400 });
  }
  if (!Number.isInteger(expectedVersion) || expectedVersion !== current.version) {
    return noStoreJson(
      { error: "Emergency controls changed after they were loaded. Refresh before applying another change." },
      { status: 409 }
    );
  }

  const relaxing = isEmergencyControlRelaxation(current, next);
  if (
    relaxing &&
    (!humanApproval || approvalConfirmation !== RE_ENABLE_FINANCIAL_ACTIONS_CONFIRMATION)
  ) {
    return noStoreJson(
      { error: "Explicit authorized human approval is required to re-enable financial actions." },
      { status: 403 }
    );
  }

  const requestId = req.headers.get("x-request-id") || randomUUID();
  const { data, error } = await supabaseAdmin.rpc("set_emergency_portfolio_controls", {
    p_next_state: serializeEmergencyPortfolioControlDraft(next),
    p_expected_version: expectedVersion,
    p_actor_user_id: admin.user.id,
    p_actor_email: admin.user.email ?? null,
    p_actor_type: "human_admin",
    p_reason: reason,
    p_human_approval: humanApproval,
    p_approval_confirmation: relaxing ? approvalConfirmation : null,
    p_request_id: requestId,
    p_ip_address: getClientIp(req),
    p_user_agent: req.headers.get("user-agent") || null,
  });
  if (error) return databaseErrorResponse(error);

  await recordAdminAuditEvent({
    req,
    adminUserId: admin.user.id,
    adminEmail: admin.user.email,
    action: relaxing
      ? "admin_emergency_portfolio_controls_reenabled"
      : "admin_emergency_portfolio_controls_restricted",
    metadata: {
      reason,
      previous: emergencyPortfolioControlDraft(current),
      next,
      immutableEventId: data?.eventId ?? null,
      immutableEventHash: data?.eventHash ?? null,
      requestId,
    },
  });

  return noStoreJson({
    ok: true,
    transition: data,
    controls: await getEmergencyPortfolioControls(),
  });
}
