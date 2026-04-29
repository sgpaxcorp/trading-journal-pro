// hooks/useUserPlan.ts
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { shouldAllowLocalProfileAccessFallback } from "@/lib/accessControl";
import { listMyEntitlements } from "@/lib/entitlementsSupabase";
import { normalizePlanTier, planFromEntitlements, planFromProfile, type AppPlan } from "@/lib/planAccess";

export type UserPlan = AppPlan;

export function useUserPlan() {
  const { user, loading: authLoading } = useAuth() as any;
  const [plan, setPlan] = useState<UserPlan>("none");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const allowLocalProfileFallback = shouldAllowLocalProfileAccessFallback();

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setPlan("none");
      setStatus(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadPlan() {
      setLoading(true);
      try {
        const [{ data }, entitlements] = await Promise.all([
          supabaseBrowser
          .from("profiles")
          .select("plan, subscription_status")
          .eq("id", user.id)
          .maybeSingle(),
          listMyEntitlements(user.id),
        ]);

        const entitlementPlan = planFromEntitlements(entitlements);
        const activeProfilePlan = planFromProfile(data as any);
        const dbPlan = normalizePlanTier((data as any)?.plan);
        const metaPlan = normalizePlanTier(
          (user as any)?.plan ||
            (user as any)?.subscriptionPlan ||
            (user as any)?.user_metadata?.plan
        );
        const finalPlan =
          entitlementPlan !== "none"
            ? entitlementPlan
            : activeProfilePlan !== "none"
            ? activeProfilePlan
            : allowLocalProfileFallback && dbPlan !== "none"
            ? dbPlan
            : allowLocalProfileFallback
            ? metaPlan
            : "none";

        if (!cancelled) {
          setPlan(finalPlan);
          setStatus(String((data as any)?.subscription_status ?? ""));
        }
      } catch {
        if (!cancelled) {
          setPlan("none");
          setStatus(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPlan();

    return () => {
      cancelled = true;
    };
  }, [allowLocalProfileFallback, authLoading, user?.id]);

  return { plan, status, loading };
}
