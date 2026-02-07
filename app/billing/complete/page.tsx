// app/billing/complete/page.tsx
"use client";

import Link from "next/link";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function BillingCompletePage() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <h1 className="text-xl font-semibold text-slate-50">
          {L("Finish activating your account", "Termina de activar tu cuenta")}
        </h1>

        <p className="text-xs text-slate-400">
          {L(
            "Your Neuro Trader Journal account was created, but you don't have an active subscription yet.",
            "Tu cuenta de Neuro Trader Journal fue creada, pero aún no tienes una suscripción activa."
          )}
        </p>

        <p className="text-xs text-slate-400">
          {L(
            "To access your dashboard, journal, back-study and AI features, please complete your payment for the Core or Advanced plan.",
            "Para acceder a tu dashboard, journal, back-study y funciones de IA, completa el pago del plan Core o Advanced."
          )}
        </p>

        <div className="space-y-2">
          <Link
            href="/pricing"
            className="block w-full text-center px-4 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
          >
            {L("Go to pricing", "Ir a precios")}
          </Link>

          <Link
            href="/billing"
            className="block w-full text-center px-4 py-2.5 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-emerald-400 hover:text-emerald-300 transition"
          >
            {L("Retry payment", "Reintentar pago")}
          </Link>
        </div>

        <p className="text-[9px] text-slate-500 text-center">
          {L(
            "If you already paid and still see this message, please contact support@neurotrader-journal.com with your Stripe receipt.",
            "Si ya pagaste y aún ves este mensaje, contacta a support@neurotrader-journal.com con tu recibo de Stripe."
          )}
        </p>
      </div>
    </main>
  );
}
