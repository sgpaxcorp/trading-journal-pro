// app/start/StartClient.tsx
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supaBaseClient";

type PlanId = "core" | "advanced";
type Step = 1 | 2 | 3 | 4;

type SimpleUser = {
  id: string;
  email: string;
};

type StartClientProps = {
  initialPlan: PlanId;
};

const STEPS: { id: Step; label: string; description: string }[] = [
  { id: 1, label: "Information", description: "Create your account credentials." },
  { id: 2, label: "Plan selection", description: "Choose between Core or Advanced." },
  { id: 3, label: "Checkout", description: "Complete secure payment with Stripe." },
  { id: 4, label: "Confirmed", description: "Access your trading workspace." },
];

const PLAN_COPY: Record<PlanId, { name: string; price: string; description: string }> = {
  core: {
    name: "Core",
    price: "$14.99 / month",
    description:
      "Ideal for active traders who want structure, clear goals and emotional control without overcomplicating things.",
  },
  advanced: {
    name: "Advanced",
    price: "$24.99 / month",
    description:
      "For full-time and funded traders who need deep analytics, advanced alerts and reports ready for prop firms.",
  },
};

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function StartClient({ initialPlan }: StartClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 👇 Leemos los query params que mandamos desde /confirmed
  const stepFromQuery = searchParams.get("step");
  const skipInfo = searchParams.get("skipInfo");
  const cameFromConfirmed = skipInfo === "1";

  const initialStep: Step =
    stepFromQuery === "2" || cameFromConfirmed ? 2 : 1;

  const [currentStep, setCurrentStep] = useState<Step>(initialStep);
  const [user, setUser] = useState<SimpleUser | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);

  const [infoForm, setInfoForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  const [loadingInfo, setLoadingInfo] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detectar si ya hay usuario logueado
  useEffect(() => {
    let isMounted = true;

    async function detectUser() {
      const { data, error } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (!error && data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email ?? "",
        });
        setInfoForm((prev) => ({
          ...prev,
          email: data.user.email ?? prev.email,
        }));

        // Si hay usuario, nos aseguramos que al menos estemos en Step 2
        setCurrentStep((prev) => (prev < 2 ? 2 : prev));
      }
    }

    detectUser();

    return () => {
      isMounted = false;
    };
  }, []);

  // Paso 1: crear cuenta en Supabase
  async function handleInformationSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!infoForm.email || !infoForm.password) {
      setError("Please enter a valid email and password.");
      return;
    }

    try {
      setLoadingInfo(true);

      const { data, error } = await supabase.auth.signUp({
        email: infoForm.email,
        password: infoForm.password,
        options: {
          data: {
            full_name: infoForm.fullName,
            selected_plan_initial: selectedPlan,
            subscription_status: "pending",
          },
        },
      });

      if (error || !data.user) {
        setError(error?.message ?? "Unable to create your account.");
        setLoadingInfo(false);
        return;
      }

      const newUser: SimpleUser = {
        id: data.user.id,
        email: data.user.email ?? infoForm.email,
      };

      setUser(newUser);
      setCurrentStep(2);
    } catch (err: any) {
      console.error("Error on sign up:", err);
      setError(err?.message ?? "Unexpected error while creating account.");
    } finally {
      setLoadingInfo(false);
    }
  }

  // Paso 2 → 3
  function handlePlanContinue() {
    setError(null);
    if (!user) {
      // Si por alguna razón no hay usuario, forzamos volver a step 1 para crearlo
      setError("Please create your account first.");
      setCurrentStep(1);
      return;
    }
    setCurrentStep(3);
  }

  // Paso 3: Stripe Checkout
  async function handleCheckout() {
    setError(null);
    if (!user) {
      setError("Missing user information.");
      setCurrentStep(1);
      return;
    }

    try {
      setLoadingCheckout(true);

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          planId: selectedPlan,
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          body?.error ?? "Error creating checkout session. Please try again.";
        setError(message);
        setLoadingCheckout(false);
        return;
      }

      const url = body?.url as string | undefined;
      if (!url) {
        setError("Missing checkout URL from Stripe.");
        setLoadingCheckout(false);
        return;
      }

      window.location.href = url;
    } catch (err: any) {
      console.error("Error starting Stripe checkout:", err);
      setError(err?.message ?? "Unexpected error starting checkout.");
      setLoadingCheckout(false);
    }
  }

  // ----- Render helpers -----

  function renderStepContent() {
    if (currentStep === 1) {
      return (
        <div>
          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            Create your account
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Step 1 of 4 – Your login details. Next you will choose your plan and
            complete a secure Stripe payment.
          </p>

          <form
            onSubmit={handleInformationSubmit}
            className="space-y-3 text-xs md:text-sm"
          >
            <div>
              <label className="block mb-1 text-slate-300">
                Full name (optional)
              </label>
              <input
                type="text"
                value={infoForm.fullName}
                onChange={(e) =>
                  setInfoForm((prev) => ({
                    ...prev,
                    fullName: e.target.value,
                  }))
                }
                className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-xs md:text-sm outline-none focus:border-emerald-400"
                placeholder="How should we call you?"
              />
            </div>

            <div>
              <label className="block mb-1 text-slate-300">Email</label>
              <input
                type="email"
                value={infoForm.email}
                onChange={(e) =>
                  setInfoForm((prev) => ({ ...prev, email: e.target.value }))
                }
                className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-xs md:text-sm outline-none focus:border-emerald-400"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block mb-1 text-slate-300">Password</label>
              <input
                type="password"
                value={infoForm.password}
                onChange={(e) =>
                  setInfoForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-xs md:text-sm outline-none focus:border-emerald-400"
                placeholder="At least 8 characters"
                required
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[10px] text-slate-500">
                By continuing, you agree to our terms and privacy policy.
              </p>
              <button
                type="submit"
                disabled={loadingInfo}
                className="inline-flex px-5 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingInfo ? "Creating..." : "Continue"}
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (currentStep === 2) {
      const core = PLAN_COPY.core;
      const adv = PLAN_COPY.advanced;

      return (
        <div>
          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            Choose your plan
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Step 2 of 4 – Select the plan that matches how you trade. You can
            upgrade later as your account grows.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Core card */}
            <button
              type="button"
              onClick={() => setSelectedPlan("core")}
              className={classNames(
                "text-left rounded-2xl border px-4 py-3 text-xs md:text-sm bg-slate-900/60 hover:border-emerald-400 hover:bg-slate-900/90 transition",
                selectedPlan === "core"
                  ? "border-emerald-400 shadow-lg shadow-emerald-500/15"
                  : "border-slate-700"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-50">
                  {core.name}
                </span>
                <span className="text-[11px] text-emerald-400">
                  {core.price}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">{core.description}</p>
            </button>

            {/* Advanced card */}
            <button
              type="button"
              onClick={() => setSelectedPlan("advanced")}
              className={classNames(
                "text-left rounded-2xl border px-4 py-3 text-xs md:text-sm bg-slate-900/60 hover:border-emerald-400 hover:bg-slate-900/90 transition",
                selectedPlan === "advanced"
                  ? "border-emerald-400 shadow-lg shadow-emerald-500/15"
                  : "border-slate-700"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-emerald-300">
                  {adv.name}
                </span>
                <span className="text-[11px] text-emerald-400">
                  {adv.price}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">{adv.description}</p>
            </button>
          </div>

          <div className="flex items-center justify-between">
            {/* Si venimos del confirmed, no mostramos el botón para volver a Step 1 */}
            {!cameFromConfirmed && (
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="text-[10px] text-slate-400 hover:text-emerald-300"
              >
                ← Back to information
              </button>
            )}
            <button
              type="button"
              onClick={handlePlanContinue}
              className="inline-flex px-5 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300"
            >
              Continue to checkout
            </button>
          </div>
        </div>
      );
    }

    if (currentStep === 3) {
      const plan = PLAN_COPY[selectedPlan];

      return (
        <div>
          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            Secure checkout
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            Step 3 of 4 – You will be redirected to Stripe to complete your
            payment. You can enter a promotion code directly on the Stripe
            checkout page.
          </p>

          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-xs">
            <p className="text-slate-300 mb-1">Selected plan</p>
            <p className="font-semibold text-slate-50">
              {plan.name}{" "}
              <span className="text-[11px] text-slate-400">
                ({plan.price})
              </span>
            </p>
            <p className="mt-2 text-[11px] text-slate-400">
              Payment processing is handled securely by Stripe. You&apos;ll
              receive a payment receipt via email.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="text-[10px] text-slate-400 hover:text-emerald-300"
            >
              ← Back to plan selection
            </button>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={loadingCheckout}
              className="inline-flex px-5 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingCheckout ? "Redirecting..." : "Continue to Stripe"}
            </button>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-5xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl grid grid-cols-1 md:grid-cols-[220px,1fr] gap-6">
        {/* Sidebar Steps */}
        <aside className="border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 md:pr-6">
          <h1 className="text-lg font-semibold mb-4">Get started</h1>
          <ul className="space-y-3 text-xs">
            {STEPS.map((step) => {
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              return (
                <li key={step.id} className="flex items-start gap-2">
                  <div
                    className={classNames(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[11px] border",
                      isActive
                        ? "bg-emerald-400 text-slate-950 border-emerald-400"
                        : isCompleted
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
            Secure payments powered by Stripe. You&apos;ll receive a payment
            receipt and onboarding emails after your subscription is confirmed.
          </p>
        </aside>

        {/* Main content */}
        <section>
          {error && (
            <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
              {error}
            </div>
          )}
          {renderStepContent()}
        </section>
      </div>
    </main>
  );
}
