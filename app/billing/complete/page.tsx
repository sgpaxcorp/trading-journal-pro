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
          {L("Finish activating your Trader Entrepreneur account", "Termina de activar tu cuenta de Empresario Trader")}
        </h1>

        <p className="text-xs text-slate-400">
          {L(
            "Your NeuroTrader business account was created, but your business access is not active yet.",
            "Tu cuenta empresarial de NeuroTrader fue creada, pero tu acceso empresarial aún no está activo."
          )}
        </p>

        <p className="text-xs text-slate-400">
          {L(
            "To access your Business Center, Execution Record, strategy review, and AI features, complete secure payment for the Core or Advanced business plan.",
            "Para acceder a tu Centro Empresarial, Registro de Ejecución, revisión estratégica y funciones de IA, completa el pago seguro del plan empresarial Core o Advanced."
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
            "If you already paid and still see this message, please contact support@neurotrader-journal.com with your NeuroTrader receipt.",
            "Si ya pagaste y aún ves este mensaje, contacta a support@neurotrader-journal.com con tu recibo de NeuroTrader."
          )}
        </p>
      </div>
    </main>
  );
}
