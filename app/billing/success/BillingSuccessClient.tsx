// app/billing/success/BillingSuccessClient.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type Step = 1 | 2 | 3 | 4;

const buildSteps = (L: (en: string, es: string) => string): { id: Step; label: string; description: string }[] => [
  { id: 1, label: L("Business account", "Cuenta empresarial"), description: L("Create your Trader Entrepreneur access.", "Crea tu acceso de Empresario Trader.") },
  { id: 2, label: L("Business plan", "Plan empresarial"), description: L("Choose Core Business or Advanced Business.", "Elige Core Empresarial o Advanced Empresarial.") },
  { id: 3, label: L("Secure payment", "Pago seguro"), description: L("Complete payment with Stripe.", "Completa el pago con Stripe.") },
  { id: 4, label: L("Activated", "Activado"), description: L("Open your Business Center.", "Abre tu Centro Empresarial.") },
];

function classNames(...classes: (string | boolean | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function BillingSuccessClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const steps = useMemo(() => buildSteps(L), [lang]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-5xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl grid grid-cols-1 md:grid-cols-[220px,1fr] gap-6">
        {/* Sidebar Steps */}
        <aside className="border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 md:pr-6">
          <h1 className="text-lg font-semibold mb-4">{L("Business activation flow", "Flujo de activación empresarial")}</h1>
          <ul className="space-y-3 text-xs">
            {steps.map((step) => {
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
            {L(
              "Secure payments powered by Stripe. NeuroTrader is sending your receipt and business onboarding emails to your inbox.",
              "Pagos seguros con Stripe. NeuroTrader enviará tu recibo y emails de onboarding empresarial a tu correo."
            )}
          </p>
        </aside>

        {/* Main content */}
        <section>
          <div className="mb-4 rounded-xl border border-emerald-500/50 bg-emerald-500/5 px-4 py-3">
            <p className="text-xs text-emerald-300 font-semibold">
              {L("Payment confirmed", "Pago confirmado")}
            </p>
            <p className="text-[11px] text-emerald-100 mt-1">
              {L("Your NeuroTrader business access is now active. We are sending you:", "Tu acceso empresarial a NeuroTrader ya está activo. Te estamos enviando:")}
            </p>
            <ul className="mt-2 text-[11px] text-emerald-50 list-disc list-inside space-y-1">
              <li>{L("A welcome email.", "Un email de bienvenida.")}</li>
              <li>{L("A SG PAX Corp. PDF receipt for your NeuroTrader business access.", "Un recibo PDF de SG PAX Corp. por tu acceso empresarial a NeuroTrader.")}</li>
              <li>{L("An email about your Trading Psychology Learn Book (PDF).", "Un email sobre tu Trading Psychology Learn Book (PDF).")}</li>
            </ul>
          </div>

          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            {L("You're ready to operate your trading business", "Ya puedes operar tu empresa de trading")}
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            {L(
              "Your Trader Entrepreneur account is now connected to active business access. You can go straight to your Business Center and start operating, or review your Trading Business Plan first.",
              "Tu cuenta de Empresario Trader ya está conectada a un acceso empresarial activo. Puedes ir directo al Centro Empresarial y empezar a operar, o revisar tu Plan de Empresa de Trading primero."
            )}
          </p>

          {sessionId && (
            <p className="text-[10px] text-slate-500 mb-4">
              {L("Stripe session ID (for support reference):", "Stripe session ID (para soporte):")}{" "}
              <span className="font-mono">{sessionId}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-3 mt-4 text-xs">
            <Link
              href="/dashboard"
              className="inline-flex px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 font-semibold hover:bg-emerald-300"
            >
              {L("Go to Business Center", "Ir al Centro Empresarial")}
            </Link>
            <Link
              href="/growth-plan"
              className="inline-flex px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:border-emerald-400"
            >
              {L("Review my Trading Business Plan", "Revisar mi Plan de Empresa de Trading")}
            </Link>
            <Link
              href="/"
              className="inline-flex px-4 py-2.5 rounded-xl text-slate-400 hover:text-emerald-300 text-[11px]"
            >
              {L("Back to home", "Volver al inicio")}
            </Link>
          </div>

          <p className="mt-4 text-[10px] text-slate-500">
            {L(
              "If you don't see the emails within a few minutes, please check your spam or promotions folder, or whitelist our address.",
              "Si no ves los emails en unos minutos, revisa spam/promociones o agrega nuestra dirección a tu lista segura."
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
