"use client";

import Link from "next/link";
import FloatingAskButton from "../components/FloatingAskButton";
import { useState } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { PlanComparisonTable } from "../components/PlanComparisonTable";
import { BrokerSupportTable } from "../components/BrokerSupportTable";

export default function PlansComparison() {
  const year = new Date().getFullYear();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const PRICES = {
    core: { monthly: 15.99, annual: 159.90 },
    advanced: { monthly: 26.99, annual: 269.90 },
  } as const;

  const priceFor = (planId: "core" | "advanced") =>
    billingCycle === "monthly" ? PRICES[planId].monthly : PRICES[planId].annual / 12;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
      {/* Fondo */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#22c55e22_0,transparent_55%),radial-gradient(circle_at_bottom,#0f172a_0,#020817_70%)]" />
        <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#38bdf855_1px,transparent_1px),linear-gradient(to_bottom,#38bdf833_1px,transparent_1px)] bg-size-[80px_80px]" />
      </div>

      {/* Contenido */}
      <div className="relative z-10 px-6 md:px-12 pt-10 pb-10 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between max-w-6xl mx-auto mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              {L("Compare Plans", "Comparar planes")}
            </h1>
            <p className="text-[10px] md:text-xs text-emerald-400 mt-1 max-w-xl">
              {L(
                "Trade Journal Pro: structure, data, and trading psychology — all in one place.",
                "Trade Journal Pro: estructura, datos y psicología de trading — todo en un solo lugar."
              )}
            </p>
            <p className="text-[10px] md:text-xs text-slate-400 mt-1 max-w-xl">
              {L(
                "Choose between a solid foundation for your journal or the complete ecosystem with logging, advanced analytics, and AI coaching.",
                "Elige entre una base sólida para tu journal o el ecosistema completo con logging, analítica avanzada y AI coaching."
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 text-[9px] md:text-[10px]">
            <div className="inline-flex rounded-full border border-slate-800 bg-slate-950/80 p-1">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={[
                  "px-3 py-1 rounded-full transition",
                  billingCycle === "monthly"
                    ? "bg-emerald-400 text-slate-950 font-semibold"
                    : "text-slate-300 hover:text-slate-50",
                ].join(" ")}
              >
                {L("Monthly", "Mensual")}
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("annual")}
                className={[
                  "px-3 py-1 rounded-full transition",
                  billingCycle === "annual"
                    ? "bg-emerald-400 text-slate-950 font-semibold"
                    : "text-slate-300 hover:text-slate-50",
                ].join(" ")}
              >
                {L("Annual", "Anual")}
              </button>
            </div>
            <div className="flex flex-col items-end gap-3 text-[9px] md:text-[10px]">
              <Link
                href="/pricing"
                className="text-slate-400 hover:text-emerald-400"
              >
                ← {L("Back to pricing", "Volver a precios")}
              </Link>
              <Link
                href="/"
                className="text-slate-500 hover:text-emerald-300"
              >
                {L("Go to home", "Ir al inicio")}
              </Link>
            </div>
          </div>
        </div>

        <PlanComparisonTable
          billingCycle={billingCycle}
          priceFor={priceFor}
          L={L}
          lang={lang}
          showCtas
        />

        <div className="mt-10">
          <BrokerSupportTable
            L={L}
            title={L("Check broker support before you add Broker Sync", "Verifica brokers antes de activar Broker Sync")}
            subtitle={L(
              "SnapTrade coverage plus CSV-only brokers listed below.",
              "Cobertura SnapTrade y brokers solo CSV listados abajo."
            )}
          />
        </div>
      </div>

     

      <FloatingAskButton />
    </main>
  );
}
