// hooks/useUserPlan.ts
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";

export type UserPlan = "core" | "advanced" | "none";

function normalizePlan(raw: unknown): UserPlan {
  const v = String(raw ?? "").toLowerCase();
  if (v === "advanced" || v === "pro") return "advanced";
  if (v === "core") return "core";
  return "none";
}

export function useUserPlan() {
  const { user, loading: authLoading } = useAuth() as any;
  const [plan, setPlan] = useState<UserPlan>("none");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        const { data } = await supabaseBrowser
          .from("profiles")
          .select("plan, subscription_status")
          .eq("id", user.id)
          .maybeSingle();

        const dbPlan = normalizePlan((data as any)?.plan);
        const metaPlan = normalizePlan(
          (user as any)?.plan ||
            (user as any)?.subscriptionPlan ||
            (user as any)?.user_metadata?.plan
        );
        const finalPlan = dbPlan !== "none" ? dbPlan : metaPlan;

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
  }, [authLoading, user?.id]);

  return { plan, status, loading };
}
