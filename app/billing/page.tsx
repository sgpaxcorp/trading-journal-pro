"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

type PlanId = "standard" | "professional";

export default function BillingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [selectedPlan, setSelectedPlan] = useState<PlanId>("professional");
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Proteger ruta
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading billing…</p>
      </main>
    );
  }

  const handleStandardClick = () => {
    setSelectedPlan("standard");
    // Aquí podrías guardar en Firestore / backend el plan elegido.
    setInfoMsg(
      "Standard plan selected. Stripe checkout is disabled in this version, you can keep using the free features."
    );
  };

  const handleProfessionalClick = () => {
    setSelectedPlan("professional");
    // IMPORTANTE: ya NO se llama a Stripe ni /api/checkout.
    // Si quieres, lo mandamos al signup con el plan preseleccionado:
    router.push("/signup?plan=professional");
    // Si no quieres redirigir a ningún lado, comenta la línea de arriba y deja solo el mensaje:
    // setInfoMsg("Professional plan selected. Stripe checkout will be added later.");
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-6 md:px-10 py-10 flex justify-center">
        <div className="w-full max-w-3xl bg-slate-950/90 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <h1 className="text-2xl md:text-3xl font-semibold mb-2">
            Choose your plan
          </h1>
          <p className="text-sm text-slate-400 mb-6 max-w-2xl">
            Select the subscription that best fits your trading process. For now,
            payments via Stripe are disabled while the integration is in progress.
          </p>

          <div className="grid md:grid-cols-2 gap-5 mb-4">
            {/* Standard */}
            <button
              type="button"
              onClick={handleStandardClick}
              className={`text-left rounded-2xl border px-5 py-6 transition ${
                selectedPlan === "standard"
                  ? "border-emerald-400 bg-slate-900"
                  : "border-slate-700 bg-slate-900/60 hover:border-emerald-400"
              }`}
            >
              <p className="text-[10px] tracking-[0.2em] text-slate-500 mb-1">
                STARTER
              </p>
              <p className="text-lg font-semibold mb-1">Standard</p>
              <p className="text-emerald-400 text-sm font-semibold mb-3">
                $14.99 <span className="text-slate-400 text-xs">/ month</span>
              </p>
              <ul className="text-xs text-slate-300 space-y-1">
                <li>• Daily P&amp;L tracking</li>
                <li>• Basic analytics &amp; calendar</li>
                <li>• Growth plan basics</li>
              </ul>
            </button>

            {/* Professional */}
            <button
              type="button"
              onClick={handleProfessionalClick}
              className={`text-left rounded-2xl border px-5 py-6 transition relative overflow-hidden ${
                selectedPlan === "professional"
                  ? "border-emerald-400 bg-slate-900"
                  : "border-emerald-500/60 bg-emerald-500/5 hover:border-emerald-400"
              }`}
            >
              <div className="absolute right-4 top-4 text-[10px] px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-semibold">
                Most popular
              </div>
              <p className="text-[10px] tracking-[0.2em] text-slate-500 mb-1">
                FOR SERIOUS TRADERS
              </p>
              <p className="text-lg font-semibold mb-1">Professional</p>
              <p className="text-emerald-400 text-sm font-semibold mb-3">
                $24.99 <span className="text-slate-400 text-xs">/ month</span>
              </p>
              <ul className="text-xs text-slate-300 space-y-1">
                <li>• Everything in Standard</li>
                <li>• Advanced analytics &amp; breakdowns</li>
                <li>• AI coaching &amp; mindset tools</li>
                <li>• Priority improvements &amp; features</li>
              </ul>
            </button>
          </div>

          {infoMsg && (
            <p className="text-xs text-amber-300 mt-1">{infoMsg}</p>
          )}

          <p className="text-[11px] text-slate-500 mt-4">
            Your subscription can unlock additional features like advanced
            analytics, AI coaching and more. Payments will be enabled later once
            Stripe is fully integrated.
          </p>
        </div>
      </div>
    </main>
  );
}
