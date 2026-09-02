"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { isActiveProfileStatus, shouldAllowLocalProfileAccessFallback } from "@/lib/accessControl";
import { fetchAccessStatus } from "@/lib/accessStatusClient";
import { canAccessPrivatePath, firstAccessiblePrivatePath } from "@/lib/accessGrants";
import RouteQuickTour from "@/app/components/RouteQuickTour";
import PageIntro from "@/app/components/PageIntro";
import GlobalAlertPopups from "@/app/components/GlobalAlertPopups";
import GlobalAlertRuleEngine from "@/app/components/GlobalAlertRuleEngine";

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
const ALLOW_WITHOUT_SESSION = ["/confirmed"];
const ACCESS_STATUS_TIMEOUT_MS = 8000;

function pathMatches(pathname: string | null, paths: string[]) {
  if (!pathname) return false;
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function FullscreenStatus({
  title,
  message,
  actionHref,
  actionLabel,
}: {
  title: string;
  message?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center justify-center">
      <div className="px-6 py-4 rounded-xl border border-emerald-400/60 bg-slate-900/80 shadow-lg max-w-sm text-center">
        <p className="text-sm font-semibold text-emerald-300">{title}</p>
        {message ? <p className="mt-1 text-[11px] text-slate-300">{message}</p> : null}
        {actionHref && actionLabel ? (
          <a
            href={actionHref}
            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-lg border border-emerald-400/70 px-4 py-2 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            {actionLabel}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function PrivateLayout({ children }: PrivateLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth() as any;
  const sessionIdRef = useRef<string | null>(null);

  const [hasAppAccess, setHasAppAccess] = useState<boolean>(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [entitlements, setEntitlements] = useState<
    Array<{ entitlement_key: string; status: string; metadata?: Record<string, unknown> | null }>
  >([]);
  const allowLocalProfileFallback = shouldAllowLocalProfileAccessFallback();
  const isSessionlessAllowedRoute = pathMatches(pathname, ALLOW_WITHOUT_SESSION);

  // Intentos de re-check para darle tiempo al webhook
  const [refreshAttempts, setRefreshAttempts] = useState(0);
  const MAX_REFRESH_ATTEMPTS = 3;

  /* 1) Si no hay usuario y ya terminó de cargar → mandar a /signin */
  useEffect(() => {
    if (!loading && !user && !isSessionlessAllowedRoute) {
      router.replace("/signin");
    }
  }, [isSessionlessAllowedRoute, loading, user, router]);

  useEffect(() => {
    setRefreshAttempts(0);
    setProfileChecked(false);
    setHasAppAccess(false);
    setEntitlements([]);
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
      const access = await fetchAccessStatus({ timeoutMs: ACCESS_STATUS_TIMEOUT_MS });
      if (access) {
        const status = String(access.profile?.subscriptionStatus ?? "").toLowerCase() || "pending";
        const canAccess = Boolean(access.hasAppAccess);
        const nextEntitlements = Array.isArray(access.entitlements) ? access.entitlements : [];

        setHasAppAccess(canAccess);
        setProfileChecked(true);
        setEntitlements(nextEntitlements);
        return { status, hasAccess: canAccess, entitlements: nextEntitlements };
      }

      const metaStatus = String((user as any)?.user_metadata?.subscriptionStatus ?? "").toLowerCase();
      const canAccess = allowLocalProfileFallback && isActiveProfileStatus(metaStatus);
      setHasAppAccess(canAccess);
      setProfileChecked(true);
      setEntitlements([]);
      return {
        status: metaStatus || "pending",
        hasAccess: canAccess,
        entitlements: [],
      };
    } catch {
      const metaStatus = String((user as any)?.user_metadata?.subscriptionStatus ?? "").toLowerCase();
      const canAccess = allowLocalProfileFallback && isActiveProfileStatus(metaStatus);
      setHasAppAccess(canAccess);
      setProfileChecked(true);
      setEntitlements([]);
      return {
        status: metaStatus || "pending",
        hasAccess: canAccess,
        entitlements: [],
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

    const isOnAllowedRoute = pathMatches(pathname, ALLOW_WITHOUT_ACTIVE_SUB);

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

  useEffect(() => {
    if (loading || !user || !profileChecked || !hasAppAccess) return;

    const isOnAllowedRoute = pathMatches(pathname, ALLOW_WITHOUT_ACTIVE_SUB);
    if (isOnAllowedRoute) return;

    const fallbackAllowAll =
      allowLocalProfileFallback &&
      entitlements.length === 0;

    if (canAccessPrivatePath(pathname, entitlements, { fallbackAllowAll })) return;

    router.replace(firstAccessiblePrivatePath(entitlements));
  }, [
    allowLocalProfileFallback,
    entitlements,
    hasAppAccess,
    loading,
    pathname,
    profileChecked,
    router,
    user,
  ]);

  const userId: string | null = user?.id ?? null;
  const isActive = hasAppAccess;
  const isOnAllowedRoute = pathMatches(pathname, ALLOW_WITHOUT_ACTIVE_SUB);

  const isVerifyingSubscription =
    !!userId &&
    profileChecked &&
    !isActive &&
    !isOnAllowedRoute &&
    refreshAttempts < MAX_REFRESH_ATTEMPTS;

  if (isSessionlessAllowedRoute) {
    return <div className="ntj-fullwidth">{children}</div>;
  }

  if (loading) {
    return (
      <FullscreenStatus
        title="Loading your workspace…"
        message="If loading takes longer than expected, reload the workspace securely."
        actionHref={pathname || "/dashboard"}
        actionLabel="Reload workspace"
      />
    );
  }

  if (!user) {
    return (
      <FullscreenStatus
        title="Redirecting to sign in…"
        message="Private pages require an active account session."
      />
    );
  }

  // Pantalla de "verificando tu pago" mientras damos tiempo al webhook
  if (isVerifyingSubscription) {
    return (
      <FullscreenStatus
        title="Verifying your access…"
        message="We’re syncing your access status. This usually takes just a few seconds."
      />
    );
  }

  return (
    <>
      <div className="ntj-fullwidth">{children}</div>
      {userId && isActive && profileChecked ? (
        <>
          <PageIntro />
          <RouteQuickTour enabled />
        </>
      ) : null}

      {/* GLOBAL Trading Protection System engine + delivery */}
      {userId && isActive && profileChecked ? (
        <>
          <GlobalAlertRuleEngine />
          <GlobalAlertPopups />
        </>
      ) : null}
    </>
  );
}
