// app/billing/success/BillingSuccessClient.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Step = 1 | 2 | 3 | 4;

const STEPS: { id: Step; label: string; description: string }[] = [
  { id: 1, label: "Information", description: "Create your account credentials." },
  { id: 2, label: "Plan selection", description: "Choose between Core or Advanced." },
  { id: 3, label: "Checkout", description: "Complete secure payment with Stripe." },
  { id: 4, label: "Confirmed", description: "Access your trading workspace." },
];

function classNames(...classes: (string | boolean | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function BillingSuccessClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-5xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl grid grid-cols-1 md:grid-cols-[220px,1fr] gap-6">
        {/* Sidebar Steps */}
        <aside className="border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 md:pr-6">
          <h1 className="text-lg font-semibold mb-4">Subscription flow</h1>
          <ul className="space-y-3 text-xs">
            {STEPS.map((step) => {
              const isActive = step.id === 4;
              const isCompleted = step.id < 4;
              return (
                <li key={step.id} className="flex items-start gap-2">
                  <div
                    className={classNames(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[11px] border",
                      step.id === 4
                        ? "bg-emerald-400 text-slate-950 border-emerald-400"
                        : step.id < 4
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/50"
                        : "bg-slate-900 text-slate-500 border-slate-700"
                    )}
                  >
                    {step.id}
                  </div>
                  <div>
                    <p
                      className={classNames(
                        "font-semibold",
                        isActive
                          ? "text-slate-50"
                          : isCompleted
                          ? "text-slate-200"
                          : "text-slate-500"
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {step.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-[10px] text-slate-500 border-t border-slate-800 pt-3">
            Secure payments powered by Stripe. A payment receipt and onboarding
            emails are being sent to your inbox.
          </p>
        </aside>

        {/* Main content */}
        <section>
          <div className="mb-4 rounded-xl border border-emerald-500/50 bg-emerald-500/5 px-4 py-3">
            <p className="text-xs text-emerald-300 font-semibold">
              Payment confirmed 🎉
            </p>
            <p className="text-[11px] text-emerald-100 mt-1">
              Your subscription is now active. We are sending you:
            </p>
            <ul className="mt-2 text-[11px] text-emerald-50 list-disc list-inside space-y-1">
              <li>A welcome email.</li>
              <li>A thank-you note with details about your Stripe receipt.</li>
              <li>An email about your Trading Psychology Learn Book (PDF).</li>
            </ul>
          </div>

          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            You&apos;re ready to journal like a pro
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Your account is now connected to an active subscription. You can go
            straight to your dashboard and start using your journal, or review
            your growth plan first.
          </p>

          {sessionId && (
            <p className="text-[10px] text-slate-500 mb-4">
              Stripe session ID (for support reference):{" "}
              <span className="font-mono">{sessionId}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-3 mt-4 text-xs">
            <Link
              href="/dashboard"
              className="inline-flex px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 font-semibold hover:bg-emerald-300"
            >
              Go to dashboard
            </Link>
            <Link
              href="/growth-plan"
              className="inline-flex px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:border-emerald-400"
            >
              Review my growth plan
            </Link>
            <Link
              href="/"
              className="inline-flex px-4 py-2.5 rounded-xl text-slate-400 hover:text-emerald-300 text-[11px]"
            >
              Back to home
            </Link>
          </div>

          <p className="mt-4 text-[10px] text-slate-500">
            If you don&apos;t see the emails within a few minutes, please check
            your spam or promotions folder, or whitelist our address.
          </p>
        </section>
      </div>
    </main>
  );
}
