"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { supabaseBrowser } from "@/lib/supaBaseClient";

export default function QuickTourPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const supabase = supabaseBrowser;

  async function handleFinish() {
    try {
      setSaving(true);

      const { error } = await supabase.auth.updateUser({
        data: {
          onboardingCompleted: true,
        },
      });

      if (error) {
        console.error("Error updating onboardingCompleted:", error);
      }

      // Luego de marcar el onboarding, vamos al dashboard
      router.replace("/dashboard");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      {/* contenido del quick tour aquí... */}
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* ...explicaciones... */}
        <button
          type="button"
          onClick={handleFinish}
          disabled={saving}
          className="mt-6 px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60"
        >
          {saving ? "Finishing..." : "Finish & go to dashboard"}
        </button>
      </div>
    </main>
  );
}
