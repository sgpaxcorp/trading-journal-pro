"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import CandleAssistant from "@/app/components/CandleAssistant";

type PrivateLayoutProps = {
  children: React.ReactNode;
};

const ALLOW_WITHOUT_ACTIVE_SUB = [
  "/billing",
  "/billing/complete",
  "/billing/success",
  "/pricing",
  "/confirmed",
];

export default function PrivateLayout({ children }: PrivateLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth() as any;

  const [subscriptionStatus, setSubscriptionStatus] =
    useState<string>("pending");
  const [onboardingCompleted, setOnboardingCompleted] =
    useState<boolean>(false);
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

  /* 2) Leer perfil más reciente desde Supabase (tabla profiles) */
  useEffect(() => {
    if (loading || !user) return;

    const fetchProfile = async () => {
      console.log("[PrivateLayout] Fetching profile for user:", user.id);

      const { data, error } = await supabaseBrowser
        .from("profiles")
        .select("subscription_status, onboarding_completed, plan")
        .eq("id", user.id)
        .single();

      if (error || !data) {
        console.error("[PrivateLayout] Error loading profile:", error);
        setProfileChecked(true);
        return;
      }

      const status =
        (data.subscription_status as string | undefined) ?? "pending";
      const onboarding =
        (data.onboarding_completed as boolean | undefined) ?? false;
      const plan = (data.plan as string | undefined) ?? null;

      console.log("[PrivateLayout] subscription_status:", status);
      console.log("[PrivateLayout] onboarding_completed:", onboarding);
      console.log("[PrivateLayout] plan:", plan);

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

    console.log(
      "[PrivateLayout] Gating with status:",
      subscriptionStatus,
      "onboardingCompleted:",
      onboardingCompleted,
      "pathname:",
      pathname,
      "refreshAttempts:",
      refreshAttempts
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
        console.log(
          "[PrivateLayout] Re-checking profile (attempt",
          refreshAttempts + 1,
          ")"
        );

        const { data, error } = await supabaseBrowser
          .from("profiles")
          .select("subscription_status, onboarding_completed")
          .eq("id", user.id)
          .single();

        if (!error && data) {
          const status =
            (data.subscription_status as string | undefined) ?? "pending";
          const onboarding =
            (data.onboarding_completed as boolean | undefined) ?? false;

          console.log(
            "[PrivateLayout] Re-check result:",
            status,
            "onboarding:",
            onboarding
          );

          setSubscriptionStatus(status);
          setOnboardingCompleted(onboarding);
        } else {
          console.error("[PrivateLayout] Error on re-check:", error);
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

  const isOnAllowedRoute = ALLOW_WITHOUT_ACTIVE_SUB.some((p) =>
    pathname.startsWith(p)
  );
  const isActive = subscriptionStatus === "active";

  const isVerifyingSubscription =
    !!user &&
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
        <CandleAssistant />
      </>
    );
  }

  return (
    <>
      {children}
      <CandleAssistant />
    </>
  );
}
