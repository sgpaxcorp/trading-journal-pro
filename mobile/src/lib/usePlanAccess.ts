import { useCallback, useEffect, useMemo, useState } from "react";

import { apiGet } from "./api";

type MobilePlan = "core" | "advanced" | "none";

type EntitlementRow = {
  entitlement_key?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

type EntitlementsResponse = {
  entitlements?: EntitlementRow[];
  plan?: string | null;
};

function normalizePlan(raw: unknown): MobilePlan {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "advanced" || value === "pro") return "advanced";
  if (value === "core") return "core";
  return "none";
}

function isActiveStatus(raw: unknown) {
  const status = String(raw ?? "").trim().toLowerCase();
  return status === "active" || status === "trialing";
}

function derivePlan(entitlements: EntitlementRow[]): MobilePlan {
  const platform = entitlements.find(
    (row) => row.entitlement_key === "platform_access" && isActiveStatus(row.status)
  );
  return normalizePlan(platform?.metadata?.plan);
}

function hasEntitlement(entitlements: EntitlementRow[], key: string) {
  return entitlements.some(
    (row) => row.entitlement_key === key && isActiveStatus(row.status)
  );
}

export function usePlanAccess() {
  const [loading, setLoading] = useState(true);
  const [entitlements, setEntitlements] = useState<EntitlementRow[]>([]);
  const [serverPlan, setServerPlan] = useState<MobilePlan>("none");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<EntitlementsResponse>("/api/entitlements/list");
      setEntitlements(Array.isArray(res?.entitlements) ? res.entitlements : []);
      setServerPlan(normalizePlan(res?.plan));
    } catch {
      setEntitlements([]);
      setServerPlan("none");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => {
    const entitlementPlan = derivePlan(entitlements);
    const plan = entitlementPlan !== "none" ? entitlementPlan : serverPlan;
    const brokerSyncFree =
      process.env.EXPO_PUBLIC_BROKER_SYNC_FREE === "true";

    return {
      loading,
      plan,
      isAdvanced: plan === "advanced",
      hasBrokerSync: brokerSyncFree || hasEntitlement(entitlements, "broker_sync"),
      refresh,
    };
  }, [entitlements, loading, refresh, serverPlan]);
}
