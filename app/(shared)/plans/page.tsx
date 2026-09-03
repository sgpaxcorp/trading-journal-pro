"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import type { PlanId } from "@/lib/types";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  FREE_TRIAL_DAYS,
} from "@/lib/legalConsent";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { catalogText, PLAN_CATALOG, planPriceLabel } from "@/lib/planCatalog";

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
  const [checkoutLegalAccepted, setCheckoutLegalAccepted] = useState(false);

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
      if (!user) {
        router.replace("/signin?redirect=/plans");
        return;
      }
      if (!checkoutLegalAccepted) {
        throw new Error(
          L(
            "Please confirm the trial, automatic renewal, no-refund, and educational-use terms before continuing to secure payment.",
            "Confirma los términos de trial, renovación automática, no reembolso y uso educativo antes de continuar al pago seguro."
          )
        );
      }

      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error(
          L("Session not available. Please sign in again.", "Sesion no disponible. Inicia sesion nuevamente.")
        );
      }

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId: selectedPlan,
          billingCycle: "monthly",
          legalAccepted: true,
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || L("Secure payment error.", "Error de pago seguro."));
      }

      const data = await res.json();
      if (data.url) {
        // Redirigir a Stripe secure payment.
        window.location.href = data.url;
      } else {
        throw new Error(L("No secure payment URL returned.", "No se recibió la URL de pago seguro."));
      }
    } catch (err: any) {
      setError(err.message || L("Something went wrong starting secure payment.", "Algo salió mal iniciando el pago seguro."));
      setLoading(false);
    }
  }

  const core = PLAN_CATALOG.core;
  const advanced = PLAN_CATALOG.advanced;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-3xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-2xl font-semibold text-slate-50 mb-1">
          {L("Choose your business access", "Elige tu acceso empresarial")}
        </h1>
        <p className="text-xs text-slate-400 mb-4">
          {L(
            `Select the business plan that fits how you want to operate your trading business. Eligible new accounts start with a ${FREE_TRIAL_DAYS}-day free trial, then renew automatically unless canceled before the trial ends.`,
            `Selecciona el plan empresarial que encaja con cómo quieres operar tu empresa de trading. Cuentas nuevas elegibles comienzan con ${FREE_TRIAL_DAYS} días gratis y luego renuevan automáticamente salvo que se cancele antes de terminar el trial.`
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
              {L("Business foundation", "Base empresarial")}
            </p>
            <h2 className="text-lg font-semibold text-slate-50 mt-1">
              {catalogText(core.name, lang)}
            </h2>
            <p className="text-sm text-emerald-300 mt-1">
              {planPriceLabel("core", lang)}
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              {catalogText(core.description, lang)}
            </p>
            <ul className="mt-3 space-y-1 text-[11px] text-slate-200">
              {core.billingHighlights.map((f) => (
                <li key={f.en}>• {catalogText(f, lang)}</li>
              ))}
            </ul>
          </button>

          {/* Advanced card */}
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
              {L("Full business intelligence", "Inteligencia empresarial completa")}
            </p>
            <h2 className="text-lg font-semibold text-slate-50 mt-1">
              {catalogText(advanced.name, lang)}
            </h2>
            <p className="text-sm text-emerald-300 mt-1">
              {planPriceLabel("advanced", lang)}
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              {catalogText(advanced.description, lang)}
            </p>
            <ul className="mt-3 space-y-1 text-[11px] text-slate-200">
              {advanced.billingHighlights.map((f) => (
                <li key={f.en}>• {catalogText(f, lang)}</li>
              ))}
            </ul>
          </button>
        </div>

        {error && (
          <p className="text-[10px] text-red-400 mb-2">{error}</p>
        )}

        <label className="mb-4 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-3 text-[10px] leading-relaxed text-amber-100/90">
          <input
            type="checkbox"
            checked={checkoutLegalAccepted}
            onChange={(event) => setCheckoutLegalAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-amber-300 bg-slate-950 text-emerald-400 accent-emerald-400"
            required
          />
          <span>
            {L(
              `I accept the current Terms & Conditions and Privacy Policy. I understand the ${FREE_TRIAL_DAYS}-day trial, automatic renewal, prepaid no-refund policy, educational-only use, and no-guaranteed-results disclosure.`,
              `Acepto los Términos y Condiciones y la Política de Privacidad vigentes. Entiendo el trial de ${FREE_TRIAL_DAYS} días, la renovación automática, la política prepago sin reembolso, el uso educativo y la divulgación de resultados no garantizados.`
            )}{" "}
            <a href="/terms" target="_blank" rel="noreferrer" className="font-semibold text-emerald-300 underline underline-offset-2">
              {L("Terms", "Términos")}
            </a>
            {" / "}
            <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-emerald-300 underline underline-offset-2">
              {L("Privacy", "Privacidad")}
            </a>
          </span>
        </label>

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 mt-2">
          <p className="text-[10px] text-slate-500">
            {L(
              "Your business access unlocks the operating tools, analytics, AI coaching, and records your trading company needs. You can manage your plan from Business Billing later.",
              "Tu acceso empresarial desbloquea herramientas operativas, analítica, AI coaching y registros que necesita tu empresa de trading. Luego podrás gestionar tu plan desde Facturación Empresarial."
            )}
          </p>
          <button
            type="button"
            disabled={loading || !checkoutLegalAccepted}
            onClick={handleCheckout}
            className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition shadow-lg shadow-emerald-500/20 disabled:opacity-60"
          >
            {loading
              ? L("Redirecting to Stripe…", "Redirigiendo a Stripe…")
              : `${L("Secure payment with Stripe", "Pago seguro con Stripe")} (${catalogText(PLAN_CATALOG[selectedPlan].name, lang)})`}
          </button>
        </div>
      </div>
    </main>
  );
}
