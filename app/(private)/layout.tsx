"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import CandleAssistant from "@/app/components/CandleAssistant";

type PrivateLayoutProps = {
  children: React.ReactNode;
};

export default function PrivateLayout({ children }: PrivateLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth() as any;

  const [subscriptionStatus, setSubscriptionStatus] =
    useState<string>("pending");
  const [onboardingCompleted, setOnboardingCompleted] =
    useState<boolean>(false);
  const [profileChecked, setProfileChecked] = useState(false);

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
        .select("subscription_status, onboarding_completed")
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

      console.log("[PrivateLayout] subscription_status:", status);
      console.log("[PrivateLayout] onboarding_completed:", onboarding);

      setSubscriptionStatus(status);
      setOnboardingCompleted(onboarding);
      setProfileChecked(true);
    };

    fetchProfile();
  }, [loading, user]);

  /* 3) Lógica de gating: suscripción + quick tour */
  useEffect(() => {
    if (loading || !user || !profileChecked) return;

    console.log(
      "[PrivateLayout] Gating with status:",
      subscriptionStatus,
      "onboardingCompleted:",
      onboardingCompleted,
      "pathname:",
      pathname
    );

    // Rutas permitidas aunque la suscripción no esté activa
    const allowWithoutActiveSub = [
      "/billing",
      "/billing/complete",
      "/pricing",
      "/confirmed",
    ];

    // 3.1) Si la suscripción NO está activa → mandar a /billing/complete
    if (
      subscriptionStatus !== "active" &&
      !allowWithoutActiveSub.includes(pathname)
    ) {
      router.replace("/billing/complete");
      return;
    }

    // 3.2) Si la suscripción está activa pero no ha hecho quick tour → /quick-tour
    if (
      subscriptionStatus === "active" &&
      !onboardingCompleted &&
      pathname !== "/quick-tour"
    ) {
      router.replace("/quick-tour");
      return;
    }
  }, [
    loading,
    user,
    profileChecked,
    subscriptionStatus,
    onboardingCompleted,
    pathname,
    router,
  ]);

  return (<>{children}
  <CandleAssistant /> 
  </>
  );
}
