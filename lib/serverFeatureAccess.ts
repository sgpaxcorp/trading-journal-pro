import { NextResponse } from "next/server";

import { isActiveEntitlementStatus, PLATFORM_ACCESS_ENTITLEMENT } from "@/lib/accessControl";
import { planFromEntitlements, planFromProfile, type AppPlan } from "@/lib/planAccess";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

type ServerEntitlement = {
  entitlement_key?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

export const BROKER_SYNC_ENTITLEMENT = "broker_sync";

export function featureAccessDeniedResponse(params: {
  code: string;
  message: string;
  required?: "advanced" | "broker_sync";
}) {
  return NextResponse.json(
    {
      error: params.message,
      code: params.code,
      required: params.required,
    },
    { status: 403 }
  );
}

export async function listActiveUserEntitlements(userId: string): Promise<ServerEntitlement[]> {
  if (!userId) return [];

  const { data, error } = await supabaseAdmin
    .from("user_entitlements")
    .select("entitlement_key, status, metadata")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"]);

  if (error || !Array.isArray(data)) return [];
  return data as ServerEntitlement[];
}

export async function getServerPlanForUser(userId: string): Promise<AppPlan> {
  if (!userId) return "none";

  const [entitlements, profileResult] = await Promise.all([
    listActiveUserEntitlements(userId),
    supabaseAdmin.from("profiles").select("plan, subscription_status").eq("id", userId).maybeSingle(),
  ]);

  const entitlementPlan = planFromEntitlements(entitlements);
  if (entitlementPlan !== "none") return entitlementPlan;

  return planFromProfile(profileResult.data as any);
}

export async function hasServerEntitlement(userId: string, entitlementKey: string): Promise<boolean> {
  if (!userId || !entitlementKey) return false;

  const entitlements = await listActiveUserEntitlements(userId);
  return entitlements.some(
    (row) =>
      String(row?.entitlement_key ?? "") === entitlementKey &&
      isActiveEntitlementStatus(row?.status)
  );
}

export async function requireAdvancedPlan(userId: string) {
  const plan = await getServerPlanForUser(userId);
  if (plan === "advanced") return null;

  return featureAccessDeniedResponse({
    code: "advanced_required",
    required: "advanced",
    message: "This feature is included in the Advanced plan.",
  });
}

export async function requireBrokerSyncAddon(userId: string) {
  const hasBrokerSync = await hasServerEntitlement(userId, BROKER_SYNC_ENTITLEMENT);
  if (hasBrokerSync) return null;

  return featureAccessDeniedResponse({
    code: "broker_sync_required",
    required: "broker_sync",
    message: "Broker Sync add-on is required for this feature.",
  });
}

export async function requirePlatformAccess(userId: string) {
  const hasPlatformAccess = await hasServerEntitlement(userId, PLATFORM_ACCESS_ENTITLEMENT);
  if (hasPlatformAccess) return null;

  return featureAccessDeniedResponse({
    code: "platform_access_required",
    message: "Platform access is required for this feature.",
  });
}
