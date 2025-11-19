"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import type { PlanId } from "@/lib/types";

const PLAN_COPY: Record<
  PlanId,
  {
    name: string;
    priceLabel: string;
    description: string;
    features: string[];
  }
> = {
  standard: {
    name: "Standard",
    priceLabel: "$14.99 / month",
    description: "Core trading journal and essential performance stats.",
    features: [
      "Daily P&L tracking",
      "Basic analytics & calendar",
      "Growth plan basics",
    ],
  },
  professional: {
    name: "Professional",
    priceLabel: "$24.99 / month",
    description:
      "Advanced analytics, psychology tools and AI coaching for serious traders.",
    features: [
      "Everything in Standard",
      "Advanced analytics & breakdowns",
      "AI coaching & mindset tools",
      "Priority improvements & features",
    ],
  },
};

export default function PlansPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [selectedPlan, setSelectedPlan] = useState<PlanId>("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Si no está logueado, mandarlo a login
  useEffect(() => {
    if (!user) {
      router.replace("/signin?redirect=/plans");
    }
  }, [user, router]);

  async function handleCheckout() {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          planId: selectedPlan,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Checkout error.");
      }

      const data = await res.json();
      if (data.url) {
        // Redirigir a Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned.");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong starting checkout.");
      setLoading(false);
    }
  }

  const standard = PLAN_COPY.standard;
  const professional = PLAN_COPY.professional;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-3xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-slate-50 mb-1">
          Choose your plan
        </h1>
        <p className="text-xs text-slate-400 mb-4">
          Select the subscription that best fits your trading process. You&apos;ll
          be redirected to a secure Stripe checkout to complete payment.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Standard card */}
          <button
            type="button"
            onClick={() => setSelectedPlan("standard")}
            className={`text-left rounded-2xl border p-4 transition ${
              selectedPlan === "standard"
                ? "border-emerald-400 bg-emerald-400/10 shadow-lg shadow-emerald-500/15"
                : "border-slate-700 bg-slate-950/40 hover:border-emerald-400/80"
            }`}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              Starter
            </p>
            <h2 className="text-lg font-semibold text-slate-50 mt-1">
              {standard.name}
            </h2>
            <p className="text-sm text-emerald-300 mt-1">
              {standard.priceLabel}
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              {standard.description}
            </p>
            <ul className="mt-3 space-y-1 text-[11px] text-slate-200">
              {standard.features.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          </button>

          {/* Professional card */}
          <button
            type="button"
            onClick={() => setSelectedPlan("professional")}
            className={`text-left rounded-2xl border p-4 transition relative overflow-hidden ${
              selectedPlan === "professional"
                ? "border-emerald-400 bg-emerald-400/10 shadow-lg shadow-emerald-500/20"
                : "border-slate-700 bg-slate-950/40 hover:border-emerald-400/80"
            }`}
          >
            <span className="absolute right-3 top-3 text-[10px] px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-semibold">
              Most popular
            </span>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              For serious traders
            </p>
            <h2 className="text-lg font-semibold text-slate-50 mt-1">
              {professional.name}
            </h2>
            <p className="text-sm text-emerald-300 mt-1">
              {professional.priceLabel}
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              {professional.description}
            </p>
            <ul className="mt-3 space-y-1 text-[11px] text-slate-200">
              {professional.features.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
          </button>
        </div>

        {error && (
          <p className="text-[10px] text-red-400 mb-2">{error}</p>
        )}

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 mt-2">
          <p className="text-[10px] text-slate-500">
            Your subscription can unlock additional features like advanced
            analytics, AI coaching and more. You can manage your plan in
            Settings later.
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={handleCheckout}
            className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition shadow-lg shadow-emerald-500/20 disabled:opacity-60"
          >
            {loading
              ? "Redirecting to Stripe…"
              : `Continue with Stripe (${PLAN_COPY[selectedPlan].name})`}
          </button>
        </div>
      </div>
    </main>
  );
}
