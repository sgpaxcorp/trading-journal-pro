// app/billing/BillingClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import type { PlanId } from "@/lib/types";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type BillingClientProps = {
  initialPlan: PlanId; // "core" | "advanced"
};

export default function BillingClient({ initialPlan }: BillingClientProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [couponCode, setCouponCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout() {
    if (authLoading) return;

    if (!user) {
      setError(L("You need to sign in before starting checkout.", "Debes iniciar sesión antes de iniciar el checkout."));
      // Si quisieras redirect: router.push(`/signin?redirect=/billing?plan=${selectedPlan}`);
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
          userId: user.id,
          email: user.email,
          couponCode: couponCode.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || L("Failed to start checkout", "No se pudo iniciar el checkout"));
      }
      if (!data.url) {
        throw new Error(L("Missing checkout URL", "Falta la URL de checkout"));
      }

      window.location.href = data.url as string;
    } catch (err: any) {
      setError(err.message ?? L("Something went wrong starting checkout.", "Algo salió mal iniciando el checkout."));
    } finally {
      setLoading(false);
    }
  }

  const isButtonDisabled = loading || authLoading;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-4 py-10">
      <div className="w-full max-w-5xl relative rounded-2xl border border-slate-800 bg-slate-950 p-6 md:p-10 shadow-[0_0_90px_rgba(16,185,129,0.45)] overflow-hidden">
        {/* Glow animado tipo “candela” con verde + violeta */}
        <div className="pointer-events-none absolute inset-0 mix-blend-screen">
          <motion.div
            className="absolute -inset-48 bg-[radial-gradient(circle_at_0%_0%,rgba(16,185,129,0.45),transparent_55%),radial-gradient(circle_at_100%_10%,rgba(129,140,248,0.3),transparent_60%),radial-gradient(circle_at_50%_100%,rgba(168,85,247,0.4),transparent_60%)]"
            initial={{ opacity: 0.4, scale: 1, rotate: 0 }}
            animate={{
              opacity: [0.35, 0.95, 0.35],
              scale: [1, 1.08, 1],
              rotate: [0, 3, -2, 0],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </div>

        {/* Contenido */}
        <div className="relative">
          {/* Steps / wizard header */}
          <div className="mb-8">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-emerald-400 uppercase">
              {L("Subscription", "Suscripción")}
            </p>
            <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-slate-50">
              {L("Choose your plan", "Elige tu plan")}
            </h1>
            <p className="mt-2 text-xs md:text-sm text-slate-300">
              {L(
                "Step 2 of 4 – Select the plan that matches how you trade. You can upgrade later as your account grows.",
                "Paso 2 de 4 – Selecciona el plan que se adapte a cómo operas. Puedes hacer upgrade más adelante a medida que crezca tu cuenta."
              )}
            </p>

            <ol className="mt-4 flex flex-wrap gap-4 text-[10px] md:text-[11px] text-slate-400">
              <li className="flex items-center gap-1">
                <span className="h-5 w-5 rounded-full bg-emerald-500 text-slate-950 text-[10px] flex items-center justify-center">
                  1
                </span>
                {L("Information", "Información")}
              </li>
              <li className="flex items-center gap-1">
                <span className="h-5 w-5 rounded-full border border-emerald-400 text-emerald-300 text-[10px] flex items-center justify-center">
                  2
                </span>
                {L("Plan selection", "Selección de plan")}
              </li>
              <li className="flex items-center gap-1">
                <span className="h-5 w-5 rounded-full border border-slate-600 text-slate-400 text-[10px] flex items-center justify-center">
                  3
                </span>
                {L("Checkout", "Checkout")}
              </li>
              <li className="flex items-center gap-1">
                <span className="h-5 w-5 rounded-full border border-slate-600 text-slate-400 text-[10px] flex items-center justify-center">
                  4
                </span>
                {L("Confirmed", "Confirmado")}
              </li>
            </ol>
          </div>

          {/* Plans */}
          <div className="grid grid-cols-1 md:grid-cols-[1.02fr,0.98fr] gap-4 md:gap-6">
            {/* Core */}
            <motion.button
              type="button"
              onClick={() => setSelectedPlan("core")}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`relative text-left rounded-2xl border px-4 py-4 text-xs md:text-sm transition
                ${
                  selectedPlan === "core"
                    ? "border-emerald-400/70 bg-slate-900/85 shadow-[0_0_40px_rgba(16,185,129,0.35)]"
                    : "border-slate-700/80 bg-slate-950/90 hover:border-emerald-400/60 hover:bg-slate-900/70"
                }`}
            >
              <div className="absolute inset-x-0 -top-px h-px bg-linear-to-r from-transparent via-emerald-400/50 to-transparent" />
              <p className="text-xs font-semibold text-slate-100 mb-1">{L("Core", "Core")}</p>
              <p className="text-lg md:text-xl font-bold text-emerald-300 mb-1">
                $14.99
              </p>
              <p className="text-[11px] text-slate-400 mb-2">{L("per month", "por mes")}</p>
              <ul className="space-y-1 text-[11px] text-slate-300">
                <li>• {L("Full daily journal & calendar", "Diario diario completo y calendario")}</li>
                <li>• {L("Back-study module", "Módulo de back-study")}</li>
                <li>• {L("Basic analytics", "Analítica básica")}</li>
              </ul>
            </motion.button>

            {/* Advanced – protagonista, con glow verde + violeta */}
            <motion.button
              type="button"
              onClick={() => setSelectedPlan("advanced")}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.98 }}
              className={`relative overflow-hidden text-left rounded-2xl border px-4 py-4 text-xs md:text-sm transition
                ${
                  selectedPlan === "advanced"
                    ? "border-emerald-400/90 bg-linear-to-br from-emerald-500/20 via-slate-900 to-slate-950 shadow-[0_0_65px_rgba(52,211,153,0.7)]"
                    : "border-slate-700/80 bg-slate-950/95 hover:border-emerald-400/80 hover:bg-linear-to-br hover:from-emerald-500/15 hover:via-slate-900 hover:to-slate-950"
                }`}
            >
              {/* Glow animado interno */}
              <motion.div
                className="pointer-events-none absolute inset-0"
                initial={{ opacity: 0.5, scale: 1 }}
                animate={{
                  opacity: [0.45, 1, 0.45],
                  scale: [1, 1.08, 1],
                  x: [0, -8, 0, 6, 0],
                  y: [0, 4, 0, -4, 0],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <div className="absolute -inset-24 bg-[radial-gradient(circle_at_10%_0%,rgba(52,211,153,0.55),transparent_55%),radial-gradient(circle_at_90%_10%,rgba(129,140,248,0.5),transparent_55%),radial-gradient(circle_at_50%_100%,rgba(168,85,247,0.55),transparent_60%)]" />
              </motion.div>

              <div className="relative flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-50">{L("Advanced", "Advanced")}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/80 px-2.5 py-0.5 text-[9px] text-emerald-100 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {L("Most popular", "Más popular")}
                </span>
              </div>

              <p className="relative text-lg md:text-xl font-bold text-emerald-100 mb-1">
                $24.99
                <span className="ml-2 text-[10px] font-normal text-emerald-100/80">
                  {L("/ month", "/ mes")}
                </span>
              </p>

              <p className="relative text-[11px] text-slate-100/90 mb-2">
                {L(
                  "Designed for traders who want deep analytics, mindset feedback and AI coaching.",
                  "Diseñado para traders que quieren analítica profunda, feedback de mindset y AI coaching."
                )}
              </p>

              <ul className="relative space-y-1 text-[11px] text-slate-50">
                <li>• {L("Everything in Core", "Todo lo de Core")}</li>
                <li>• {L("Advanced analytics & breakdowns", "Analítica avanzada y breakdowns")}</li>
                <li>• {L("AI coaching & mindset tools", "AI coaching y herramientas de mindset")}</li>
                <li>• {L("Priority improvements & new features", "Mejoras prioritarias y nuevas features")}</li>
              </ul>
            </motion.button>
          </div>

          {/* Coupon + CTA */}
          <div className="mt-6 border-t border-slate-800/80 pt-5 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1">
                <label className="block text-[10px] text-slate-400 mb-1">
                  {L("Coupon code (optional)", "Código de cupón (opcional)")}
                </label>
                <input
                  value={couponCode}
                  onChange={(e) =>
                    setCouponCode(e.target.value.toUpperCase())
                  }
                  placeholder="SOTERO"
                  className="w-full rounded-md bg-slate-950/90 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                />
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={isButtonDisabled}
                className="w-full md:w-auto px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs md:text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {loading || authLoading
                  ? L("Checking your account…", "Verificando tu cuenta…")
                  : `${L("Continue with", "Continuar con")} ${selectedPlan === "core" ? L("Core", "Core") : L("Advanced", "Advanced")}`}
              </button>
            </div>

            {error && (
              <p className="text-[11px] text-red-400">
                {error}
              </p>
            )}

            <p className="text-[10px] text-slate-400">
              {L(
                "Your subscription unlocks features like advanced analytics, AI coaching and more. You can manage or cancel your plan any time in Settings.",
                "Tu suscripción desbloquea features como analítica avanzada, AI coaching y más. Puedes gestionar o cancelar tu plan en cualquier momento desde Settings."
              )}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
