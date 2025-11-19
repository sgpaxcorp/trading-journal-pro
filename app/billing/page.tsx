// app/billing/page.tsx
"use client";

import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

export default function BillingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  if (!loading && !user) {
    router.replace("/signin");
  }

  const plan =
    (user as any)?.plan || (user as any)?.subscriptionPlan || "standard";

  function handleManageInStripe() {
    // Aquí luego conectas el portal de facturación de Stripe:
    // router.push("/api/stripe/customer-portal")
    console.log("TODO: open Stripe customer portal");
  }

  function goToPricing() {
    router.push("/pricing");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 space-y-8">
        <header>
          <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
            Billing
          </p>
          <h1 className="text-3xl font-semibold mt-1">
            Billing &amp; subscription
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Manage your Trading Journal Pro plan, payments and renewal.
          </p>
        </header>

        {/* Current plan */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex flex-col md:flex-row justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400 mb-1">Current plan</p>
            <p className="text-lg font-semibold text-slate-100 capitalize">
              {plan}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              In producción, estos datos se leerían directamente de Stripe
              (subscription object).
            </p>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <button
              type="button"
              onClick={goToPricing}
              className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
            >
              Change / upgrade plan
            </button>
            <button
              type="button"
              onClick={handleManageInStripe}
              className="px-4 py-2 rounded-xl border border-slate-700 text-xs text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              Manage in Stripe portal
            </button>
          </div>
        </section>

        {/* Plan cards (resumen rápido) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-xs text-slate-400 mb-1">Standard</p>
            <p className="text-lg font-semibold mb-1">$14.99 / month</p>
            <ul className="text-[11px] text-slate-300 space-y-1">
              <li>• Core journal & daily stats</li>
              <li>• P&amp;L calendar and weekly summary</li>
              <li>• Limited AI coaching</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5">
            <p className="text-xs text-emerald-300 mb-1">Professional</p>
            <p className="text-lg font-semibold mb-1">$24.99 / month</p>
            <ul className="text-[11px] text-slate-300 space-y-1">
              <li>• Everything in Standard</li>
              <li>• Advanced analytics & tags</li>
              <li>• Full AI coaching & experiments</li>
              <li>• Priority support</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
