"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";

export default function QuickTourRedirectPage() {
  const router = useRouter();
  const { user, loading } = useAuth() as any;

  useEffect(() => {
    if (loading) return;

    const run = async () => {
      if (!user?.id) {
        router.replace("/signin");
        return;
      }

      try {
        const key = `ntj_app_tour_${user.id}`;
        localStorage.removeItem(key);
        Object.keys(localStorage)
          .filter((k) => k.startsWith(`ntj_intro_${user.id}`))
          .forEach((k) => localStorage.removeItem(k));

        await supabaseBrowser.auth.updateUser({
          data: { onboardingCompleted: false },
        });

        await supabaseBrowser
          .from("profiles")
          .update({ onboarding_completed: false })
          .eq("id", user.id);
      } catch (err) {
        console.warn("[QuickTourRedirect] Failed to reset tour", err);
      } finally {
        router.replace("/dashboard");
        setTimeout(() => window.location.reload(), 60);
      }
    };

    void run();
  }, [loading, router, user?.id]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
      <p className="text-sm text-slate-400">Loading tour…</p>
    </main>
  );
}
