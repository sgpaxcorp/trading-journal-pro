"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { QUICK_TOUR_FORCE_KEY } from "@/lib/quickTour";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function QuickTourRedirectPage() {
  const router = useRouter();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(QUICK_TOUR_FORCE_KEY, "dashboard");
    router.replace("/dashboard");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <p className="text-sm text-slate-400">
        {lang === "es" ? "Cargando recorrido operativo..." : "Loading operating tour..."}
      </p>
    </main>
  );
}
