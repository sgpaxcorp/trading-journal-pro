// app/billing/BillingClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { PlanId } from "@/lib/types";

type BillingClientProps = {
  initialPlan: PlanId; // "core" | "advanced"
};

export default function BillingClient({ initialPlan }: BillingClientProps) {
  const router = useRouter();
  const { user } = useAuth();

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [couponCode, setCouponCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (!user) {
      // Por si llega aquí sin estar logeado
      router.push("/signin");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan,
          userId: (user as any).id,
          email: (user as any).email,
          couponCode: couponCode.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }
      if (!data.url) {
        throw new Error("Missing checkout URL");
      }

      window.location.href = data.url as string;
    } catch (err: any) {
      setError(err.message ?? "Something went wrong starting checkout.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-4 py-10">
      <div className="w-full max-w-5xl bg-slate-900/80 border border-slate-800 rounded-2xl p-6 md:p-10 shadow-2xl">
        {/* Steps / wizard header */}
        <div className="mb-8">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-emerald-400 uppercase">
            Subscription
          </p>
          <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-slate-50">
            Choose your plan
          </h1>
          <p className="mt-2 text-xs md:text-sm text-slate-400">
            Step 2 of 4 – Select the plan that matches how you trade. You can
            upgrade later as your account grows.
          </p>

          <ol className="mt-4 flex flex-wrap gap-4 text-[10px] md:text-[11px] text-slate-400">
            <li className="flex items-center gap-1">
              <span className="h-5 w-5 rounded-full bg-emerald-500 text-slate-950 text-[10px] flex items-center justify-center">
                1
              </span>
              Information
            </li>
            <li className="flex items-center gap-1">
              <span className="h-5 w-5 rounded-full border border-emerald-400 text-emerald-300 text-[10px] flex items-center justify-center">
                2
              </span>
              Plan selection
            </li>
            <li className="flex items-center gap-1">
              <span className="h-5 w-5 rounded-full border border-slate-600 text-slate-400 text-[10px] flex items-center justify-center">
                3
              </span>
              Checkout
            </li>
            <li className="flex items-center gap-1">
              <span className="h-5 w-5 rounded-full border border-slate-600 text-slate-400 text-[10px] flex items-center justify-center">
                4
              </span>
              Confirmed
            </li>
          </ol>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {/* Core */}
          <button
            type="button"
            onClick={() => setSelectedPlan("core")}
            className={`text-left rounded-2xl border px-4 py-4 text-xs md:text-sm transition ${
              selectedPlan === "core"
                ? "border-emerald-400 bg-slate-900"
                : "border-slate-700 bg-slate-950 hover:border-emerald-400/60"
            }`}
          >
            <p className="text-xs font-semibold text-slate-100 mb-1">Core</p>
            <p className="text-lg font-bold text-emerald-300 mb-1">$14.99</p>
            <p className="text-[11px] text-slate-400 mb-2">per month</p>
            <ul className="space-y-1 text-[11px] text-slate-300">
              <li>• Full daily journal & calendar</li>
              <li>• Back-study module</li>
              <li>• Basic analytics</li>
            </ul>
          </button>

          {/* Advanced */}
          <button
            type="button"
            onClick={() => setSelectedPlan("advanced")}
            className={`text-left rounded-2xl border px-4 py-4 text-xs md:text-sm transition ${
              selectedPlan === "advanced"
                ? "border-emerald-400 bg-slate-900"
                : "border-slate-700 bg-slate-950 hover:border-emerald-400/60"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-100">Advanced</p>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-400/60 px-2 py-0.5 text-[9px] text-emerald-300 font-semibold">
                Most popular
              </span>
            </div>
            <p className="text-lg font-bold text-emerald-300 mb-1">$24.99</p>
            <p className="text-[11px] text-slate-400 mb-2">per month</p>
            <ul className="space-y-1 text-[11px] text-slate-300">
              <li>• Everything in Core</li>
              <li>• Advanced analytics & breakdowns</li>
              <li>• AI coaching & mindset tools</li>
              <li>• Priority improvements & features</li>
            </ul>
          </button>
        </div>

        {/* Coupon + CTA */}
        <div className="mt-6 border-t border-slate-800 pt-5 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <label className="block text-[10px] text-slate-400 mb-1">
                Coupon code (optional)
              </label>
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                placeholder="SOTERO"
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={loading}
              className="w-full md:w-auto px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs md:text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60"
            >
              {loading
                ? "Redirecting to checkout…"
                : `Continue with ${selectedPlan === "core" ? "Core" : "Advanced"}`}
            </button>
          </div>

          {error && (
            <p className="text-[11px] text-red-400">
              {error}
            </p>
          )}

          <p className="text-[10px] text-slate-500">
            Your subscription unlocks features like advanced analytics, AI
            coaching and more. You can manage or cancel your plan any time in
            Settings.
          </p>
        </div>
      </div>
    </main>
  );
}
