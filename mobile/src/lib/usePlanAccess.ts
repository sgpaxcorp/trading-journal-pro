import { useCallback, useEffect, useMemo, useState } from "react";

import { apiGet } from "./api";

export type MobilePlan = "core" | "advanced" | "none";

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

export type MobilePlanAccess = {
  loading: boolean;
  plan: MobilePlan;
  isAdvanced: boolean;
  hasPlatformAccess: boolean;
  hasDashboard: boolean;
  hasGrowthPlan: boolean;
  hasJournal: boolean;
  hasImports: boolean;
  hasAnalytics: boolean;
  hasAdvancedAnalytics: boolean;
  hasAICoaching: boolean;
  hasProfitLossTrack: boolean;
  hasCashflowTracking: boolean;
  hasOptionFlow: boolean;
  hasNeuroAnalysis: boolean;
  hasNotebook: boolean;
  hasBackStudy: boolean;
  hasRulesAlarms: boolean;
  hasForum: boolean;
  hasOrderAudit: boolean;
  hasBrokerSync: boolean;
  refresh: () => Promise<void>;
};

export function usePlanAccess(): MobilePlanAccess {
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
    const hasGrant = (key: string) => hasEntitlement(entitlements, key);
    const hasPlatformAccess = hasGrant("platform_access") || plan !== "none";
    const hasCorePlan = plan === "core" || plan === "advanced";
    const hasAdvancedPlan = plan === "advanced";

    return {
      loading,
      plan,
      isAdvanced: hasAdvancedPlan,
      hasPlatformAccess,
      hasDashboard: hasGrant("page_dashboard") || hasPlatformAccess,
      hasGrowthPlan: hasGrant("page_growth_plan") || hasCorePlan,
      hasJournal: hasGrant("page_journal") || hasCorePlan,
      hasImports: hasGrant("page_import") || hasCorePlan,
      hasAnalytics: hasGrant("page_analytics") || hasCorePlan,
      hasAdvancedAnalytics: hasAdvancedPlan,
      hasAICoaching: hasGrant("page_ai_coaching") || hasAdvancedPlan,
      hasProfitLossTrack: hasGrant("page_profit_loss_track") || hasAdvancedPlan,
      hasCashflowTracking: hasAdvancedPlan,
      hasOptionFlow: hasGrant("option_flow"),
      hasNeuroAnalysis: hasGrant("neuro_analysis"),
      hasNotebook: hasGrant("page_notebook") || hasAdvancedPlan,
      hasBackStudy: hasGrant("page_back_study") || hasCorePlan,
      hasRulesAlarms: hasGrant("page_rules_alarms") || hasCorePlan,
      hasForum: hasGrant("page_forum"),
      hasOrderAudit: hasGrant("page_order_audit") || hasAdvancedPlan,
      hasBrokerSync: brokerSyncFree || hasGrant("broker_sync"),
      refresh,
    };
  }, [entitlements, loading, refresh, serverPlan]);
}
