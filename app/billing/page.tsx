// app/billing/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import type { PlanId } from "@/lib/types";

type UiPlanId = "standard" | "professional";

export default function BillingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<UiPlanId>("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubscribe() {
    setError(null);

    if (!user) {
      router.push("/signin?next=/billing");
      return;
    }

    setLoading(true);
    try {
      const planForStripe: PlanId = selectedPlan;

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          planId: planForStripe,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }
      if (!data.url) {
        throw new Error("Missing checkout URL");
      }

      window.location.href = data.url;
    } catch (err: any) {
      console.error(err);
      setError(err.message || "There was a problem starting checkout.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-5xl rounded-3xl border border-slate-800 bg-slate-950/95 shadow-2xl p-6 md:p-10">
        {/* Header */}
        <header className="mb-6 md:mb-8">
          <p className="text-xs uppercase tracking-[0.25em] text-emerald-400 mb-2">
            Subscription
          </p>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-50">
            Choose your plan
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-2 max-w-2xl">
            Select the subscription that best fits your trading process. When you
            continue, we&apos;ll send you to a secure Stripe checkout page where
            you can enter your card details and an optional promotion code.
          </p>
        </header>

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-5 md:gap-8 mb-6">
          {/* Standard */}
          <button
            type="button"
            onClick={() => setSelectedPlan("standard")}
            className={`text-left rounded-2xl border p-5 md:p-6 transition ${
              selectedPlan === "standard"
                ? "border-emerald-400 bg-emerald-500/5 shadow-lg shadow-emerald-500/20"
                : "border-slate-800 bg-slate-900/80 hover:border-emerald-400/60"
            }`}
          >
            <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase mb-2">
              Starter
            </p>
            <h2 className="text-lg font-semibold text-slate-50 mb-1">
              Standard
            </h2>
            <p className="text-sm">
              <span className="text-emerald-400 font-semibold">$14.99</span>{" "}
              <span className="text-slate-400">/ month</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-2 mb-3">
              Core trading journal and essential performance stats.
            </p>
            <ul className="text-[11px] text-slate-200 space-y-1">
              <li>• Daily P&amp;L tracking</li>
              <li>• Basic analytics &amp; calendar</li>
              <li>• Growth plan basics</li>
            </ul>
            <div className="mt-4">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] border ${
                  selectedPlan === "standard"
                    ? "border-emerald-400 text-emerald-300 bg-emerald-500/5"
                    : "border-slate-600 text-slate-300"
                }`}
              >
                {selectedPlan === "standard" ? "Selected" : "Select Standard"}
              </span>
            </div>
          </button>

          {/* Professional */}
          <button
            type="button"
            onClick={() => setSelectedPlan("professional")}
            className={`relative text-left rounded-2xl border p-5 md:p-6 transition ${
              selectedPlan === "professional"
                ? "border-emerald-400 bg-emerald-500/5 shadow-lg shadow-emerald-500/20"
                : "border-slate-800 bg-slate-900/80 hover:border-emerald-400/60"
            }`}
          >
            <div className="absolute right-4 top-4">
              <span className="rounded-full bg-emerald-500/15 border border-emerald-400/70 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                Most popular
              </span>
            </div>
            <p className="text-[10px] font-semibold tracking-[0.18em] text-slate-400 uppercase mb-2">
              For serious traders
            </p>
            <h2 className="text-lg font-semibold text-slate-50 mb-1">
              Professional
            </h2>
            <p className="text-sm">
              <span className="text-emerald-400 font-semibold">$24.99</span>{" "}
              <span className="text-slate-400">/ month</span>
            </p>
            <p className="text-[11px] text-slate-400 mt-2 mb-3">
              Advanced analytics, psychology tools and AI coaching for serious
              traders.
            </p>
            <ul className="text-[11px] text-slate-200 space-y-1">
              <li>• Everything in Standard</li>
              <li>• Advanced analytics &amp; breakdowns</li>
              <li>• AI coaching &amp; mindset tools</li>
              <li>• Priority improvements &amp; features</li>
            </ul>
            <div className="mt-4">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] border ${
                  selectedPlan === "professional"
                    ? "border-emerald-400 text-emerald-300 bg-emerald-500/5"
                    : "border-slate-600 text-slate-300"
                }`}
              >
                {selectedPlan === "professional"
                  ? "Selected"
                  : "Select Professional"}
              </span>
            </div>
          </button>
        </div>

        {error && (
          <p className="mb-3 text-[11px] text-red-400">
            {error}
          </p>
        )}

        {/* Footer / actions */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-[11px] text-slate-500 max-w-md">
            Your subscription can unlock additional features like advanced
            analytics, AI coaching and more. You can manage your plan later in
            Settings.
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs md:text-sm font-semibold hover:bg-emerald-300 transition disabled:opacity-60"
            >
              {loading
                ? "Redirecting to Stripe..."
                : `Continue with ${
                    selectedPlan === "standard" ? "Standard" : "Professional"
                  }`}
            </button>
            <Link
              href="/start"
              className="text-[11px] md:text-xs text-slate-400 hover:text-emerald-300"
            >
              Skip for now &mdash; go to start page
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
