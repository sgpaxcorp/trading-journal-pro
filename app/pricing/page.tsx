"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supaBaseClient";

type PlanId = "core" | "advanced";

type SimpleUser = {
  id: string;
  email: string;
};

export default function PricingPage() {
  const router = useRouter();

  const [user, setUser] = useState<SimpleUser | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load current user from Supabase on mount
  useEffect(() => {
    let isMounted = true;

    async function fetchUser() {
      const { data, error } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (error || !data.user) {
        setUser(null);
      } else {
        setUser({
          id: data.user.id,
          email: data.user.email ?? "",
        });
      }
    }

    fetchUser();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleStart(planId: PlanId) {
    setError(null);

    // If user is not logged in, send to signup and keep plan in query
    if (!user) {
      router.push(`/signup?plan=${planId}`);
      return;
    }

    try {
      setLoadingPlan(planId);

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          planId,
        }),
      });

      if (!res.ok) {
        let message = "Unable to start checkout.";
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          // ignore parse error
        }
        throw new Error(message);
      }

      const data = await res.json();

      if (!data.url) {
        throw new Error("Missing checkout URL from Stripe.");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err: any) {
      console.error("Error starting checkout:", err);
      setError(err?.message ?? "Something went wrong starting checkout.");
      setLoadingPlan(null);
    }
  }

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-50 overflow-hidden flex flex-col">
      {/* BACKGROUND */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#22c55e30_0,transparent_55%),radial-gradient(circle_at_bottom,#0f172a_0,#020817_70%)]" />
        <div className="absolute -right-32 top-10 w-72 h-72 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute -left-24 bottom-10 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(to_right,#38bdf855_1px,transparent_1px),linear-gradient(to_bottom,#38bdf833_1px,transparent_1px)] bg-size-[80px_80px]" />
      </div>

      {/* CONTENT */}
      <div className="relative z-10 px-6 md:px-12 pt-10 pb-8 flex-1 flex flex-col items-center">
        {/* Header */}
        <header className="w-full max-w-5xl flex items-center justify-between mb-10">
          <div>
            <p className="text-emerald-400 text-[10px] uppercase tracking-[0.2em]">
              Choose your edge
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Pricing for serious &amp; funded traders
            </h1>
            <p className="text-[11px] md:text-xs text-slate-300 mt-1">
              Clear, simple plans designed to keep you disciplined, consistent,
              and ready for prop firms &amp; challenges.
            </p>
          </div>
          <Link
            href="/"
            className="text-[10px] md:text-xs text-slate-400 hover:text-emerald-400"
          >
            ← Back to home
          </Link>
        </header>

        {/* Copy */}
        <div className="w-full max-w-5xl mb-4 text-[10px] md:text-xs text-slate-400">
          No contracts. No hidden fees. Just a trading journal built to protect
          your psychology, enforce your rules, and show real progress.
        </div>

        {/* Error message (if any) */}
        {error && (
          <div className="w-full max-w-5xl mb-4 text-[10px] md:text-xs text-red-400">
            {error}
          </div>
        )}

        {/* PLANS */}
        <section className="w-full flex flex-col items-center">
          <div className="w-full max-w-5xl flex flex-col md:flex-row items-stretch justify-center gap-6">
            {/* CORE (planId = "core") */}
            <div className="flex-1 max-w-sm mx-auto bg-slate-950/96 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-xl backdrop-blur-sm">
              <h2 className="text-sm font-semibold text-slate-50 mb-1">
                Core
              </h2>
              <p className="text-emerald-400 text-3xl font-semibold leading-none">
                $14.99
                <span className="text-[9px] text-slate-400 font-normal">
                  {" "}
                  / month
                </span>
              </p>
              <p className="text-[10px] text-slate-300 mt-2">
                Ideal for active traders who want structure, clear goals and
                emotional control without overcomplicating things.
              </p>
              <div className="mt-3 h-px bg-slate-800" />
              <ul className="mt-3 space-y-1.5 text-[16px] text-slate-200">
                <li>✓ One (1) account</li>
                <li>✓ Multi-asset journal (stocks, futures, forex, crypto)</li>
                <li>✓ Organized notebook for pre-market prep and journal</li>
                <li>✓ P&amp;L calendar (green gains, blue losses)</li>
                <li>✓ Custom Trading Plan</li>
                <li>✓ Daily, Weekly &amp; Monthly goals</li>
                <li>✓ Track goals and account balance</li>
                <li>✓ Set alerts: daily goal &amp; max loss</li>
                <li>✓ AI performance summary (daily, weekly, monthly)</li>
                <li>✓ Basic analytics – win rate ratio</li>
                <li>✓ 1GB data storage</li>
              </ul>
              <button
                onClick={() => handleStart("core")}
                disabled={loadingPlan !== null}
                className="mt-5 w-full py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingPlan === "core" ? "Redirecting..." : "Start Core"}
              </button>

              <Link
                href="/plans-comparison"
                className="mt-3 w-full text-center py-2 rounded-xl border border-emerald-400/50 text-emerald-300 text-xs font-semibold hover:bg-emerald-400/10 transition"
              >
                See more →
              </Link>

              <p className="mt-2 text-[9px] text-slate-500">
                Perfect for personal accounts and first evaluations.
              </p>
            </div>

            {/* ADVANCED (planId = "advanced") */}
            <div className="flex-1 max-w-sm mx-auto relative">
              <div className="absolute -inset-0.5 rounded-3xl bg-gradient-to-br from-emerald-400/40 via-sky-400/25 to-transparent opacity-80 blur-xl" />
              <div className="relative bg-slate-950/98 border border-emerald-500/60 rounded-2xl p-5 flex flex-col shadow-[0_15px_60px_rgba(15,23,42,0.9)] backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-emerald-400">
                    Advanced
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300 text-[8px] border border-emerald-500/40">
                    Most popular
                  </span>
                </div>
                <p className="text-emerald-400 text-3xl font-semibold leading-none">
                  $24.99
                  <span className="text-[9px] text-slate-400 font-normal">
                    {" "}
                    / month
                  </span>
                </p>
                <p className="text-[10px] text-slate-300 mt-2">
                  For full-time and funded traders who need deep analytics,
                  advanced alerts and reports ready for prop firms.
                </p>
                <div className="mt-3 h-px bg-slate-800" />
                <ul className="mt-3 space-y-1.5 text-[16px] text-slate-200">
                  <li>✓ Five (5) accounts</li>
                  <li>✓ Everything in Core</li>
                  <li>✓ Advanced analytics report</li>
                  <li>✓ Custom alerts (drawdown, revenge, schedule)</li>
                  <li>✓ Custom coaching plan</li>
                  <li>✓ Track your trading business expenses</li>
                </ul>
                <button
                  onClick={() => handleStart("advanced")}
                  disabled={loadingPlan !== null}
                  className="mt-5 w-full py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loadingPlan === "advanced"
                    ? "Redirecting..."
                    : "Start Advanced"}
                </button>

                <Link
                  href="/plans-comparison"
                  className="mt-3 w-full text-center py-2 rounded-xl border border-emerald-400/50 text-emerald-300 text-xs font-semibold hover:bg-emerald-400/10 transition"
                >
                  See more →
                </Link>

                <p className="mt-2 text-[9px] text-emerald-300">
                  If you treat trading like a business, this is your plan.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
