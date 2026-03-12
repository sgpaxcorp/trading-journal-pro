"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { syncMyTrophies } from "@/lib/trophiesSupabase";
import { isActiveProfileStatus, shouldAllowLocalProfileAccessFallback } from "@/lib/accessControl";
import { fetchAccessStatus } from "@/lib/accessStatusClient";
import CandleAssistant from "@/app/components/NeuroAssistant";
import AppTour from "@/app/components/AppTour";
import PageIntro from "@/app/components/PageIntro";
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

  const [hasAppAccess, setHasAppAccess] = useState<boolean>(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const allowLocalProfileFallback = shouldAllowLocalProfileAccessFallback();

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
    setRefreshAttempts(0);
    setProfileChecked(false);
    setHasAppAccess(false);
    setOnboardingCompleted(false);
  }, [user?.id]);

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

  const refreshAccessState = useCallback(async () => {
    if (!user) return null;
    try {
      const access = await fetchAccessStatus();
      if (access) {
        const status = String(access.profile?.subscriptionStatus ?? "").toLowerCase() || "pending";
        const onboarding = Boolean(access.profile?.onboardingCompleted ?? false);
        const canAccess = Boolean(access.hasAppAccess);

        setHasAppAccess(canAccess);
        setOnboardingCompleted(onboarding);
        setProfileChecked(true);
        return { status, onboarding, hasAccess: canAccess };
      }

      const metaStatus = String((user as any)?.user_metadata?.subscriptionStatus ?? "").toLowerCase();
      const canAccess = allowLocalProfileFallback && isActiveProfileStatus(metaStatus);
      setHasAppAccess(canAccess);
      setOnboardingCompleted(false);
      setProfileChecked(true);
      return {
        status: metaStatus || "pending",
        onboarding: false,
        hasAccess: canAccess,
      };
    } catch {
      const metaStatus = String((user as any)?.user_metadata?.subscriptionStatus ?? "").toLowerCase();
      const canAccess = allowLocalProfileFallback && isActiveProfileStatus(metaStatus);
      setHasAppAccess(canAccess);
      setOnboardingCompleted(false);
      setProfileChecked(true);
      return {
        status: metaStatus || "pending",
        onboarding: false,
        hasAccess: canAccess,
      };
    }
  }, [allowLocalProfileFallback, user]);

  /* 2) Leer acceso + perfil más reciente */
  useEffect(() => {
    if (loading || !user) return;
    refreshAccessState();
  }, [loading, refreshAccessState, user]);

  /* 3) Access checker + gating */
  useEffect(() => {
    if (loading || !user || !profileChecked) return;

    const isOnAllowedRoute = ALLOW_WITHOUT_ACTIVE_SUB.some((p) =>
      pathname.startsWith(p)
    );

    // Si la suscripción está activa → continuar
    if (hasAppAccess) return;

    // Si NO está activa pero estamos en una ruta que se permite sin sub activa,
    // no hacemos nada (ej. /billing, /billing/success, etc.)
    if (!hasAppAccess && isOnAllowedRoute) {
      return;
    }

    // Aquí: no está activa, estamos en ruta privada real.
    // Damos chance al webhook: re-check del perfil con pequeños delays.
    if (refreshAttempts < MAX_REFRESH_ATTEMPTS) {
      const timer = setTimeout(async () => {
        await refreshAccessState();
        setRefreshAttempts((prev) => prev + 1);
      }, 2000); // 2s entre intentos

      return () => clearTimeout(timer);
    }

    // Si ya intentamos varias veces y sigue sin estar activa → mandar a /billing/complete
    if (!hasAppAccess && refreshAttempts >= MAX_REFRESH_ATTEMPTS) {
      router.replace("/billing/complete");
    }
  }, [
    hasAppAccess,
    loading,
    profileChecked,
    pathname,
    refreshAccessState,
    router,
    refreshAttempts,
    user,
  ]);

  const userId: string | null = user?.id ?? null;
  const isActive = hasAppAccess;
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
              Verifying your access…
            </p>
            <p className="text-[11px] text-slate-300">
              We’re syncing your access status. This usually takes just a few seconds.
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
      {userId && isActive && profileChecked ? (
        <>
          <AppTour onboardingCompleted={onboardingCompleted} />
          <PageIntro />
        </>
      ) : null}

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
