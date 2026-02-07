"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import type { PlanId } from "@/lib/types";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

const PLAN_COPY: Record<
  PlanId,
  {
    name: string;
    priceLabel: string;
    description: { en: string; es: string };
    features: { en: string; es: string }[];
  }
> = {
  core: {
    name: "Core",
    priceLabel: "$14.99 / month",
    description: {
      en: "Core trading journal and essential performance stats.",
      es: "Diario de trading base y estadísticas esenciales de performance.",
    },
    features: [
      { en: "Daily P&L tracking", es: "Seguimiento diario de P&L" },
      { en: "Basic analytics & calendar", es: "Analítica básica y calendario" },
      { en: "Growth plan basics", es: "Fundamentos del Growth Plan" },
    ],
  },
  advanced: {
    name: "Professional",
    priceLabel: "$24.99 / month",
    description: {
      en: "Advanced analytics, psychology tools and AI coaching for serious traders.",
      es: "Analítica avanzada, psicología y AI coaching para traders serios.",
    },
    features: [
      { en: "Everything in Core", es: "Todo lo de Core" },
      { en: "Advanced analytics & breakdowns", es: "Analítica avanzada y breakdowns" },
      { en: "AI coaching & mindset tools", es: "AI coaching y herramientas de mindset" },
      { en: "Priority improvements & features", es: "Mejoras y features prioritarios" },
    ],
  },
};

export default function PlansPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [selectedPlan, setSelectedPlan] = useState<PlanId>("advanced");
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
        throw new Error(data.error || L("Checkout error.", "Error de checkout."));
      }

      const data = await res.json();
      if (data.url) {
        // Redirigir a Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error(L("No checkout URL returned.", "No se recibió la URL de checkout."));
      }
    } catch (err: any) {
      setError(err.message || L("Something went wrong starting checkout.", "Algo salió mal iniciando el checkout."));
      setLoading(false);
    }
  }

  const core = PLAN_COPY.core;
  const professional = PLAN_COPY.advanced;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-3xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-slate-50 mb-1">
          {L("Choose your plan", "Elige tu plan")}
        </h1>
        <p className="text-xs text-slate-400 mb-4">
          {L(
            "Select the subscription that best fits your trading process. You'll be redirected to a secure Stripe checkout to complete payment.",
            "Selecciona la suscripción que mejor se adapte a tu proceso. Serás redirigido a un checkout seguro de Stripe para completar el pago."
          )}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Core card */}
          <button
            type="button"
            onClick={() => setSelectedPlan("core")}
            className={`text-left rounded-2xl border p-4 transition ${
              selectedPlan === "core"
                ? "border-emerald-400 bg-emerald-400/10 shadow-lg shadow-emerald-500/15"
                : "border-slate-700 bg-slate-950/40 hover:border-emerald-400/80"
            }`}
          >
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              {L("Starter", "Starter")}
            </p>
            <h2 className="text-lg font-semibold text-slate-50 mt-1">
              {core.name}
            </h2>
            <p className="text-sm text-emerald-300 mt-1">
              {core.priceLabel}
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              {isEs ? core.description.es : core.description.en}
            </p>
            <ul className="mt-3 space-y-1 text-[11px] text-slate-200">
              {core.features.map((f) => (
                <li key={f.en}>• {isEs ? f.es : f.en}</li>
              ))}
            </ul>
          </button>

          {/* Professional card */}
          <button
            type="button"
            onClick={() => setSelectedPlan("advanced")}
            className={`text-left rounded-2xl border p-4 transition relative overflow-hidden ${
              selectedPlan === "advanced"
                ? "border-emerald-400 bg-emerald-400/10 shadow-lg shadow-emerald-500/20"
                : "border-slate-700 bg-slate-950/40 hover:border-emerald-400/80"
            }`}
          >
            <span className="absolute right-3 top-3 text-[10px] px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 font-semibold">
              {L("Most popular", "Más popular")}
            </span>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
              {L("For serious traders", "Para traders serios")}
            </p>
            <h2 className="text-lg font-semibold text-slate-50 mt-1">
              {professional.name}
            </h2>
            <p className="text-sm text-emerald-300 mt-1">
              {professional.priceLabel}
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              {isEs ? professional.description.es : professional.description.en}
            </p>
            <ul className="mt-3 space-y-1 text-[11px] text-slate-200">
              {professional.features.map((f) => (
                <li key={f.en}>• {isEs ? f.es : f.en}</li>
              ))}
            </ul>
          </button>
        </div>

        {error && (
          <p className="text-[10px] text-red-400 mb-2">{error}</p>
        )}

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 mt-2">
          <p className="text-[10px] text-slate-500">
            {L(
              "Your subscription can unlock additional features like advanced analytics, AI coaching and more. You can manage your plan in Settings later.",
              "Tu suscripción puede desbloquear features adicionales como analítica avanzada, AI coaching y más. Luego podrás gestionar tu plan en Settings."
            )}
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={handleCheckout}
            className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition shadow-lg shadow-emerald-500/20 disabled:opacity-60"
          >
            {loading
              ? L("Redirecting to Stripe…", "Redirigiendo a Stripe…")
              : `${L("Continue with Stripe", "Continuar con Stripe")} (${PLAN_COPY[selectedPlan].name})`}
          </button>
        </div>
      </div>
    </main>
  );
}
