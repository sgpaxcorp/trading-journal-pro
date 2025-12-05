// app/billing/complete/page.tsx
"use client";

import Link from "next/link";

export default function BillingCompletePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h1 className="text-xl font-semibold text-slate-50">
          Finish activating your account
        </h1>

        <p className="text-xs text-slate-400">
          Your Neuro Trader Journal account was created, but you don&apos;t have
          an active subscription yet.
        </p>

        <p className="text-xs text-slate-400">
          To access your dashboard, journal, back-study and AI features, please
          complete your payment for the <span className="text-emerald-300">Core</span> or{" "}
          <span className="text-emerald-300">Advanced</span> plan.
        </p>

        <div className="space-y-2">
          <Link
            href="/pricing"
            className="block w-full text-center px-4 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
          >
            Go to pricing
          </Link>

          <Link
            href="/billing"
            className="block w-full text-center px-4 py-2.5 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-emerald-400 hover:text-emerald-300 transition"
          >
            Retry payment
          </Link>
        </div>

        <p className="text-[9px] text-slate-500 text-center">
          If you already paid and still see this message, please contact{" "}
          <span className="text-emerald-300">
            support@neurotrader-journal.com
          </span>{" "}
          with your Stripe receipt.
        </p>
      </div>
    </main>
  );
}
