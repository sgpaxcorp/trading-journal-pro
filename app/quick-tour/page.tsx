"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { QUICK_TOUR_FORCE_KEY } from "@/lib/quickTour";

export default function QuickTourRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(QUICK_TOUR_FORCE_KEY, "dashboard");
    router.replace("/dashboard");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <p className="text-sm text-slate-400">Loading quick tour...</p>
    </main>
  );
}
