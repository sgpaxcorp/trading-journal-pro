"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type PrivateLayoutProps = {
  children: React.ReactNode;
};

export default function PrivateLayout({ children }: PrivateLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth() as any;

  // Estado local para status de suscripción,
  // leído directamente desde la tabla profiles.
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<string>("pending");

  // Para asegurarnos de que ya intentamos leer el perfil
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
        .select("subscription_status")
        .eq("id", user.id)
        .single();

      if (error || !data) {
        console.error("[PrivateLayout] Error loading profile:", error);
        setProfileChecked(true);
        return;
      }

      const status =
        (data.subscription_status as string | undefined) ?? "pending";

      console.log("[PrivateLayout] subscription_status from DB:", status);

      setSubscriptionStatus(status);
      setProfileChecked(true);
    };

    fetchProfile();
  }, [loading, user]);

  /* 3) Lógica de gating: suscripción */
  useEffect(() => {
    // Mientras está cargando, no hay user o todavía no leímos el perfil → no hacemos nada
    if (loading || !user || !profileChecked) return;

    console.log(
      "[PrivateLayout] Gating with status:",
      subscriptionStatus,
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

    // Si la suscripción NO está activa → mandar a pantalla de completar billing
    if (
      subscriptionStatus !== "active" &&
      !allowWithoutActiveSub.includes(pathname)
    ) {
      router.replace("/billing/complete");
      return;
    }
  }, [loading, user, profileChecked, subscriptionStatus, pathname, router]);

  // Mostramos children; el router se encargará de redirigir cuando toque
  return <>{children}</>;
}
