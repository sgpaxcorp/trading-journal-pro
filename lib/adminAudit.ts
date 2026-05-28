import "server-only";

import { supabaseAdmin } from "@/lib/supaBaseAdmin";
import { getClientIp } from "@/lib/rateLimit";

export type AdminAuditParams = {
  req: Request;
  adminUserId: string;
  adminEmail?: string | null;
  action: string;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordAdminAuditEvent(params: AdminAuditParams) {
  try {
    await supabaseAdmin.from("admin_audit_events").insert({
      admin_user_id: params.adminUserId,
      admin_email: params.adminEmail ?? null,
      action: params.action,
      target_user_id: params.targetUserId ?? null,
      metadata: params.metadata ?? {},
      ip_address: getClientIp(params.req),
      user_agent: params.req.headers.get("user-agent") || null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[admin-audit] failed to record event:", error);
  }
}

export function requireActionConfirmation(body: any, expected: string) {
  const actual = String(body?.confirmation ?? "").trim().toLowerCase();
  if (actual !== expected.toLowerCase()) {
    throw new Error(`Type "${expected}" to confirm this admin action.`);
  }
}

export function requireTargetEmailConfirmation(body: any, targetEmail?: string | null) {
  const expected = String(targetEmail ?? "").trim().toLowerCase();
  const actual = String(body?.targetEmailConfirmation ?? "").trim().toLowerCase();
  if (!expected || actual !== expected) {
    throw new Error("Type the target user's exact email to confirm this admin action.");
  }
}
