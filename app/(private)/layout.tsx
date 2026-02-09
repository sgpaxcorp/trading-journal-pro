"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { syncMyTrophies } from "@/lib/trophiesSupabase";
import CandleAssistant from "@/app/components/NeuroAssistant";
import GlobalAlertPopups from "@/app/components/GlobalAlertPopups";
import GlobalAlertRuleEngine from "@/app/components/GlobalAlertRuleEngine";
import GlobalRealtimeNotifications from "@/app/components/GlobalRealtimeNotifications";

type PrivateLayoutProps = {
  children: React.ReactNode;
};

const ALLOW_WITHOUT_ACTIVE_SUB = [
  "/billing",
  "/billing/complete",
  "/billing/success",
  "/pricing",
  "/confirmed",
  "/admin",
];

export default function PrivateLayout({ children }: PrivateLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth() as any;
  const sessionIdRef = useRef<string | null>(null);

  const [subscriptionStatus, setSubscriptionStatus] = useState<string>("pending");
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(false);
  const [profileChecked, setProfileChecked] = useState(false);

  // Intentos de re-check para darle tiempo al webhook
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const MAX_REFRESH_ATTEMPTS = 3;

  /* 1) Si no hay usuario y ya terminó de cargar → mandar a /signin */
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    if (!sessionIdRef.current) {
      const sessionId =
        (crypto as any)?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionIdRef.current = sessionId;
    }
  }, [user]);

  useEffect(() => {
    if (!user || !pathname) return;
    const track = async () => {
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;
        const sessionId = sessionIdRef.current;
        if (!sessionId) return;
        await fetch("/api/admin/track", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ path: pathname, sessionId }),
        });
      } catch {
        // silent
      }
    };
    track();
  }, [user, pathname]);

  /* 2) Leer perfil más reciente desde Supabase (tabla profiles) */
  useEffect(() => {
    if (loading || !user) return;

    const fetchProfile = async () => {
      const { data, error } = await supabaseBrowser
        .from("profiles")
        .select("subscription_status, onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();

      const missingProfile = !data;
      const hasError = !!error && (error as any)?.code !== "PGRST116";

      if ((missingProfile || hasError) && typeof window !== "undefined") {
        try {
          const session = await supabaseBrowser.auth.getSession();
          const token = session?.data?.session?.access_token;
          if (token) {
            await fetch("/api/profile/ensure", {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
            });
          }
        } catch {
          // silent
        }
      }

      if (missingProfile || hasError) {
        setSubscriptionStatus("pending");
        setOnboardingCompleted(false);
        setProfileChecked(true);
        return;
      }

      const status =
        (data.subscription_status as string | undefined) ?? "pending";
      const onboarding =
        (data.onboarding_completed as boolean | undefined) ?? false;

      setSubscriptionStatus(status);
      setOnboardingCompleted(onboarding);
      setProfileChecked(true);
    };

    fetchProfile();
  }, [loading, user]);

  /* 3) Profile checker + gating: suscripción + quick tour */
  useEffect(() => {
    if (loading || !user || !profileChecked) return;

    const isActive = subscriptionStatus === "active";
    const isOnAllowedRoute = ALLOW_WITHOUT_ACTIVE_SUB.some((p) =>
      pathname.startsWith(p)
    );

    // Si la suscripción está activa → manejar quick-tour y salir
    if (isActive) {
      if (!onboardingCompleted && pathname !== "/quick-tour") {
        router.replace("/quick-tour");
      }
      return;
    }

    // Si NO está activa pero estamos en una ruta que se permite sin sub activa,
    // no hacemos nada (ej. /billing, /billing/success, etc.)
    if (!isActive && isOnAllowedRoute) {
      return;
    }

    // Aquí: no está activa, estamos en ruta privada real.
    // Damos chance al webhook: re-check del perfil con pequeños delays.
    if (refreshAttempts < MAX_REFRESH_ATTEMPTS) {
      const timer = setTimeout(async () => {
        const { data, error } = await supabaseBrowser
          .from("profiles")
          .select("subscription_status, onboarding_completed")
          .eq("id", user.id)
          .maybeSingle();

        if (!error && data) {
          const status =
            (data.subscription_status as string | undefined) ?? "pending";
          const onboarding =
            (data.onboarding_completed as boolean | undefined) ?? false;

          setSubscriptionStatus(status);
          setOnboardingCompleted(onboarding);
        }

        setRefreshAttempts((prev) => prev + 1);
      }, 2000); // 2s entre intentos

      return () => clearTimeout(timer);
    }

    // Si ya intentamos varias veces y sigue sin estar activa → mandar a /billing/complete
    if (!isActive && refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
      router.replace("/billing/complete");
    }
  }, [
    loading,
    user,
    profileChecked,
    subscriptionStatus,
    onboardingCompleted,
    pathname,
    router,
    refreshAttempts,
  ]);

  const userId: string | null = user?.id ?? null;
  const isActive = subscriptionStatus === "active";
  const isOnAllowedRoute = ALLOW_WITHOUT_ACTIVE_SUB.some((p) =>
    pathname.startsWith(p)
  );

  // Background trophy sync for legacy users (runs once per session window)
  useEffect(() => {
    if (!userId) return;

    const key = `ntj_trophy_sync_${userId}`;
    const now = Date.now();
    const windowMs = 6 * 60 * 60 * 1000; // 6 hours

    try {
      const last = Number(localStorage.getItem(key) || 0);
      if (Number.isFinite(last) && now - last < windowMs) return;
      localStorage.setItem(key, String(now));
    } catch {
      // If localStorage fails, just proceed without caching
    }

    syncMyTrophies(userId).catch((err) => {
      console.warn("[PrivateLayout] trophy sync failed:", err);
    });
  }, [userId]);

  const isVerifyingSubscription =
    !!userId &&
    profileChecked &&
    !isActive &&
    !isOnAllowedRoute &&
    refreshAttempts < MAX_REFRESH_ATTEMPTS;

  // Pantalla de "verificando tu pago" mientras damos tiempo al webhook
  if (isVerifyingSubscription) {
    return (
      <>
        <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center">
          <div className="px-6 py-4 rounded-xl border border-emerald-400/60 bg-slate-900/80 shadow-lg max-w-sm text-center">
            <p className="text-sm font-semibold text-emerald-300 mb-1">
              Verifying your subscription…
            </p>
            <p className="text-[11px] text-slate-300">
              We’re confirming your payment with Stripe. This usually takes just
              a few seconds.
            </p>
          </div>
        </div>

        {/* Keep assistant available */}
        <CandleAssistant />
      </>
    );
  }

  return (
    <>
      <div className="ntj-fullwidth">{children}</div>

      {/* ✅ GLOBAL Rules & Alarms engine + delivery */}
      {userId && isActive && profileChecked ? (
        <>
          <GlobalAlertRuleEngine />
          <GlobalAlertPopups />
          <GlobalRealtimeNotifications />
        </>
      ) : null}

      <CandleAssistant />
    </>
  );
}
