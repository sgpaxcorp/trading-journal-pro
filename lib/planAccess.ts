import { isActiveEntitlementStatus, PLATFORM_ACCESS_ENTITLEMENT } from "@/lib/accessControl";

export type AppPlan = "core" | "advanced" | "none";

export function normalizePlanTier(raw: unknown): AppPlan {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "advanced" || value === "pro") return "advanced";
  if (value === "core") return "core";
  return "none";
}

export function planFromEntitlements(
  entitlements: Array<{
    entitlement_key?: string | null;
    status?: string | null;
    metadata?: Record<string, unknown> | null;
  }>
): AppPlan {
  const hit = entitlements.find(
    (row) =>
      String(row?.entitlement_key ?? "") === PLATFORM_ACCESS_ENTITLEMENT &&
      isActiveEntitlementStatus(row?.status)
  );

  return normalizePlanTier(hit?.metadata?.plan);
}
