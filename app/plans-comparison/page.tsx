"use client";

import Link from "next/link";
import FloatingAskButton from "../components/FloatingAskButton";
import { useState } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { PlanComparisonTable } from "../components/PlanComparisonTable";
import { BrokerSupportTable } from "../components/BrokerSupportTable";
import { advancedUpgradePriceLabel, planMonthlyPrice } from "@/lib/planCatalog";

export default function PlansComparison() {
  const year = new Date().getFullYear();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const priceFor = (planId: "core" | "advanced") =>
    planMonthlyPrice(planId, billingCycle);

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
              {L("Compare Business Plans", "Comparar Planes Empresariales")}
            </h1>
            <p className="text-[10px] md:text-xs text-emerald-400 mt-1 max-w-xl">
              {L(
                "NeuroTrader: the Trading Business Operating System for Trader Entrepreneurs, connecting planning, execution, risk control, performance, financial management, audits, and AI coaching in one platform.",
                "NeuroTrader: el Sistema Operativo de Empresa de Trading para Empresarios Traders, conectando planificación, ejecución, control de riesgo, rendimiento, gestión financiera, auditorías y AI coaching en una sola plataforma."
              )}
            </p>
            <p className="text-[10px] md:text-xs text-slate-400 mt-1 max-w-xl">
              {L(
                "Core gives you the business foundation. Advanced adds the intelligence layer: AI plan follow-up, deeper statistics, audit tools, and priority support.",
                "Core te da la base empresarial. Advanced añade la capa de inteligencia: seguimiento AI del plan, estadística profunda, auditoría y soporte prioritario."
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

        <div className="mx-auto mb-8 grid max-w-6xl gap-3 md:grid-cols-3">
          {[
            {
              eyebrow: L("Advanced value", "Valor de Advanced"),
              title: advancedUpgradePriceLabel(lang, billingCycle),
              body: L(
                "The upgrade is built around business-grade clarity: AI coaching, deep stats, P&L, cashflow, and audit workflows.",
                "El upgrade está diseñado para claridad empresarial: AI coaching, estadísticas profundas, P&L, cashflow y auditoría."
              ),
            },
            {
              eyebrow: L("AI follow-up", "Seguimiento AI"),
              title: L("Your plan gets monitored", "Tu plan recibe seguimiento"),
              body: L(
                "Advanced connects the Trading Business Plan, execution behavior, emotions, and rule obedience into coaching that tells the Trader Entrepreneur what to fix next.",
                "Advanced conecta el Plan de Empresa de Trading, ejecución, emociones y obediencia a reglas para decirle al Empresario Trader qué corregir después."
              ),
            },
            {
              eyebrow: L("Data quality", "Calidad de data"),
              title: L("Broker statements matter", "Los statements importan"),
              body: L(
                "The more complete your broker data is, the sharper the audit, reports, and AI coaching become.",
                "Mientras más completa sea la data del bróker, más precisa se vuelve la auditoría, los reportes y el AI coaching."
              ),
            },
          ].map((item) => (
            <div key={item.eyebrow} className="rounded-lg border border-slate-800 bg-slate-950/80 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-300">{item.eyebrow}</p>
              <h2 className="mt-2 text-base font-semibold text-slate-50">{item.title}</h2>
              <p className="mt-2 text-xs leading-5 text-slate-400">{item.body}</p>
            </div>
          ))}
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
            title={L("Choose the best broker data path", "Escoge la mejor ruta para tu data del bróker")}
            subtitle={L(
              "Secure sync, broker statements, order history, and CSV/XLSX imports help turn raw broker activity into audit-ready records.",
              "Sync seguro, statements del bróker, order history e imports CSV/XLSX ayudan a convertir actividad cruda del bróker en récords listos para auditar."
            )}
          />
        </div>
      </div>

     

      <FloatingAskButton />
    </main>
  );
}
