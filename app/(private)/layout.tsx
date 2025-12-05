"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

type PrivateLayoutProps = {
  children: React.ReactNode;
};

export default function PrivateLayout({ children }: PrivateLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile } = useAuth() as any;

  // 1) Si no hay user → fuera
  useEffect(() => {
    if (!user) {
      router.replace("/signin");
    }
  }, [user, router]);

  // 2) Derivar subscriptionStatus desde profile o metadata
  const subscriptionStatusFromProfile =
    (profile as any)?.subscription_status || (profile as any)?.subscriptionStatus;

  const subscriptionStatusFromMetadata =
    (user as any)?.subscriptionStatus ||
    (user as any)?.user_metadata?.subscriptionStatus;

  const subscriptionStatus =
    subscriptionStatusFromProfile || subscriptionStatusFromMetadata || "pending";

  // 3) Derivar onboardingCompleted desde metadata o profile
  const onboardingCompletedFromMeta =
    (user as any)?.onboardingCompleted ||
    (user as any)?.user_metadata?.onboardingCompleted;

  const onboardingCompletedFromProfile =
    (profile as any)?.onboarding_completed ||
    (profile as any)?.onboardingCompleted;

  const onboardingCompleted =
    onboardingCompletedFromMeta ?? onboardingCompletedFromProfile ?? false;

  useEffect(() => {
    // Hasta que no haya user, no hacemos más nada
    if (!user) return;

    // Rutas que se permiten aunque la subscripción no esté activa
    const allowWithoutActiveSub = [
      "/billing",
      "/billing/complete",
      "/pricing",
      "/confirmed",
    ];

    // 1) Si la suscripción NO está activa → bloquear todo lo privado
    if (
      subscriptionStatus !== "active" &&
      !allowWithoutActiveSub.includes(pathname)
    ) {
      router.replace("/billing/complete");
      return;
    }

    // 2) Si la suscripción está activa pero aún no completó onboarding → forzar quick-tour
    if (
      subscriptionStatus === "active" &&
      !onboardingCompleted &&
      pathname !== "/quick-tour"
    ) {
      router.replace("/quick-tour");
      return;
    }
  }, [user, subscriptionStatus, onboardingCompleted, pathname, router]);

  // Mientras resuelve redirecciones mostramos el contenido; el router se encarga de moverlo
  return <>{children}</>;
}
