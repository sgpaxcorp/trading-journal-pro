"use client";

import Link from "next/link";
import FloatingAskButton from "../components/FloatingAskButton";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type PlanRow = {
  section?: string;               // Header principal
  subheader?: string;             // Subheader (ej. Notebook)
  label?: string;                 // Ítem (sub-subheader o feature)
  core?: string | boolean;
  advanced?: string | boolean;
  indent?: number;                // Nivel de sangría (0,1,2...)
  sectionStyle?: CSSProperties;   // Estilo personalizado para headers
  subheaderStyle?: CSSProperties; // Estilo personalizado para subheaders
  labelStyle?: CSSProperties;     // Estilo personalizado para labels
};

const rows: PlanRow[] = [
  {
    section: "GENERAL",
    sectionStyle: {
      fontSize: "15px",
      color: "#e5e7eb",
    },
  },
  { label: "Trading accounts", core: "5", advanced: "Unlimited" },
  { label: "Data storage", core: "1GB", advanced: "5GB" },
  { label: "Support", core: "Email support", advanced: "Priority email & chat" },

  {
    section: "PLANNING & RULES",
    sectionStyle: { fontSize: "15px", color: "#e5e7eb" },
  },
  { label: "Growth plan & daily targets", core: true, advanced: true },
  { label: "Setup rules & triggers", core: true, advanced: true },
  { label: "Alerts & reminders", core: "Basic", advanced: "Advanced" },
  { label: "Daily checklist", core: true, advanced: true },

  {
    subheader: "Notebook",
    subheaderStyle: {
      paddingLeft: "24px",
      fontSize: "15px",
      color: "#22c55e",
      fontWeight: 600,
    },
  },
  { label: "Premarket plan", indent: 1, core: true, advanced: true },
  { label: "Entries & exits", indent: 1, core: true, advanced: true },
  { label: "Emotions & tags", indent: 1, core: true, advanced: true },
  { label: "Lessons learned", indent: 1, core: true, advanced: true },
  { label: "Templates", indent: 1, core: true, advanced: true },
  { label: "Images & screenshots", indent: 1, core: true, advanced: true },

  {
    section: "REPORTING",
    sectionStyle: { fontSize: "15px", color: "#e5e7eb" },
  },
  { label: "Calendar results", core: true, advanced: true },
  { label: "Equity curve & balance chart", core: true, advanced: true },
  { label: "Cashflow tracking", core: true, advanced: true },
  { label: "PDF reports", core: false, advanced: true },
  { label: "AI summary report", core: false, advanced: true },

  {
    section: "ANALYTICS",
    sectionStyle: { fontSize: "15px", color: "#e5e7eb" },
  },
  { label: "Core KPIs", core: true, advanced: true },
  { label: "Time-of-day breakdown", core: false, advanced: true },
  { label: "Instrument & strategy breakdowns", core: false, advanced: true },
  { label: "Risk metrics", core: false, advanced: true },
  { label: "Streaks", core: true, advanced: true },

  {
    section: "OTHER TOOLS",
    sectionStyle: { fontSize: "15px", color: "#e5e7eb" },
  },
  { label: "Back-study module", core: true, advanced: true },
  { label: "Challenges", core: true, advanced: true },
  { label: "Global ranking (opt-in)", core: true, advanced: true },
  { label: "Option Flow Intelligence (add-on)", core: "Add-on", advanced: "Add-on" },

  {
    section: "COACHING PROGRAM & AI",
    sectionStyle: { fontSize: "15px", color: "#e5e7eb" },
  },
  { label: "AI coaching & action plans", core: false, advanced: true },
  { label: "Mindset prompts & trade review", core: false, advanced: true },

  {
    section: "ADD-ON: OPTION FLOW INTELLIGENCE",
    sectionStyle: { fontSize: "15px", color: "#34d399" },
  },
  { label: "Flow analysis summary", core: "Add-on", advanced: "Add-on" },
  { label: "Premarket attack plan (PDF)", core: "Add-on", advanced: "Add-on" },
  { label: "Downloadable PDF report", core: "Add-on", advanced: "Add-on" },
  { label: "Key levels & risk notes", core: "Add-on", advanced: "Add-on" },
  { label: "Screenshot or CSV ingest", core: "Add-on", advanced: "Add-on" },
];

function renderCell(
  value: string | boolean | undefined,
  translate: (text: string) => string
) {
  if (value === true) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-400/70 text-emerald-300 text-xs">
        ✓
      </span>
    );
  }
  if (value === false || value === undefined) {

    return <span className="text-slate-600 text-xs">—</span>;
  }
  return <span className="text-[11px] text-slate-100">{translate(value)}</span>;
}

export default function PlansComparison() {
  const year = new Date().getFullYear();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const PRICES = {
    core: { monthly: 14.99, annual: 149.99 },
    advanced: { monthly: 24.99, annual: 249.99 },
  } as const;

  const priceFor = (planId: "core" | "advanced") =>
    billingCycle === "monthly" ? PRICES[planId].monthly : PRICES[planId].annual / 12;

  const ES_MAP: Record<string, string> = {
    GENERAL: "GENERAL",
    "PLANNING & RULES": "PLANIFICACIÓN Y REGLAS",
    NOTEBOOK: "NOTEBOOK",
    REPORTING: "REPORTES",
    ANALYTICS: "ANALÍTICA",
    "OTHER TOOLS": "OTRAS HERRAMIENTAS",
    "COACHING PROGRAM & AI": "PROGRAMA DE COACHING E IA",
    "ADD-ON: OPTION FLOW INTELLIGENCE": "ADD-ON: OPTION FLOW INTELLIGENCE",
    "Trading accounts": "Cuentas de trading",
    "Unlimited": "Ilimitadas",
    "Data storage": "Almacenamiento",
    Support: "Soporte",
    "Growth plan & daily targets": "Plan de crecimiento y metas diarias",
    "Setup rules & triggers": "Reglas y disparadores de setup",
    "Alerts & reminders": "Alertas y recordatorios",
    "Daily checklist": "Checklist diario",
    Notebook: "Notebook",
    "Premarket plan": "Plan premarket",
    "Entries & exits": "Entradas y salidas",
    "Emotions & tags": "Emociones y etiquetas",
    "Lessons learned": "Lecciones aprendidas",
    Templates: "Plantillas",
    "Images & screenshots": "Imágenes y screenshots",
    "Calendar results": "Calendario de resultados",
    "Equity curve & balance chart": "Curva de equity y balance",
    "Cashflow tracking": "Seguimiento de cashflows",
    "PDF reports": "Reportes PDF",
    "AI summary report": "Reporte resumen con IA",
    "Core KPIs": "KPIs clave",
    "Time-of-day breakdown": "Desglose por hora",
    "Instrument & strategy breakdowns": "Desglose por instrumento y estrategia",
    "Risk metrics": "Métricas de riesgo",
    Streaks: "Rachas",
    "Back-study module": "Módulo de back-study",
    Challenges: "Retos",
    "Global ranking (opt-in)": "Ranking global (opcional)",
    "Option Flow Intelligence (add-on)": "Option Flow Intelligence (add-on)",
    "AI coaching & action plans": "AI coaching y planes de acción",
    "Mindset prompts & trade review": "Prompts de mindset y revisión de trades",
    "Flow analysis summary": "Resumen de análisis de flujo",
    "Premarket attack plan (PDF)": "Plan de ataque premarket (PDF)",
    "Downloadable PDF report": "Reporte PDF descargable",
    "Key levels & risk notes": "Niveles clave y notas de riesgo",
    "Screenshot or CSV ingest": "Ingesta por screenshot o CSV",
    "Email support": "Soporte por email",
    "Priority email & chat": "Email y chat prioritario",
    "Best value": "Mejor valor",
    Features: "Características",
    "Compare Plans": "Comparar planes",
    "Add-on": "Add-on",
    Core: "Core",
    Advanced: "Avanzado",
  };

  const translate = (text?: string) => {
    if (!text) return "";
    return isEs ? ES_MAP[text] || text : text;
  };

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

        {/* Tabla comparativa */}
        <div className="max-w-6xl mx-auto rounded-2xl overflow-hidden bg-slate-950/96 border border-slate-800 shadow-2xl shadow-emerald-500/5">
          <table className="w-full border-collapse text-left">
            {/* ENCABEZADOS PLANES */}
            <thead>
              <tr className="bg-slate-900/95 border-b border-slate-800">
                <th
                  className="px-4 py-4 font-semibold text-slate-300 uppercase tracking-wide align-top"
                  style={{ fontSize: "22px" }}
                >
                  {L("Features", "Características")}
                </th>

                {/* CORE */}
                <th className="px-4 py-4 align-top text-center">
                  <div className="flex flex-col items-center gap-3">
                    <span
                      className="uppercase tracking-wide text-slate-400 font-semibold"
                      style={{ fontSize: "16px" }}
                    >
                      {L("Core", "Core")}
                    </span>
                    <span
                      className="text-emerald-400 font-bold leading-none"
                      style={{ fontSize: "25px" }}
                    >
                      ${priceFor("core").toFixed(2)}
                      <span
                        className="text-slate-400 font-normal"
                        style={{ fontSize: "16px" }}
                      >
                        {" "}
                        {billingCycle === "monthly"
                          ? L("/month", "/mes")
                          : L("/month (billed yearly)", "/mes (facturado anual)")}
                      </span>
                    </span>
                    {billingCycle === "annual" && (
                      <span
                        className="mt-2 inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200"
                      >
                        {L("Save 2 months", "Ahorra 2 meses")}
                      </span>
                    )}
                    <span
                      className="text-slate-500 max-w-[180px]"
                      style={{ fontSize: "12px", lineHeight: "1.4" }}
                    >
                      {L(
                        "Ideal for independent traders who want structure and clarity.",
                        "Ideal para traders independientes que buscan estructura y claridad."
                      )}
                    </span>
                    <Link
                      href={`/signup?plan=core&cycle=${billingCycle}`}
                      className="mt-2 inline-flex justify-center items-center px-6 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-semibold shadow-lg shadow-emerald-500/25 hover:bg-emerald-300 hover:shadow-emerald-400/30 transition"
                      style={{ fontSize: "14px" }}
                    >
                      {L("Get Started Core", "Empezar Core")}
                    </Link>
                  </div>
                </th>

                {/* Advanced */}
                <th className="px-4 py-4 align-top text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="uppercase tracking-wide text-emerald-300 font-semibold"
                        style={{ fontSize: "16px" }}
                      >
                        {L("Advanced", "Advanced")}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300 border border-emerald-500/40"
                        style={{ fontSize: "10px" }}
                      >
                        {L("Best value", "Mejor valor")}
                      </span>
                    </div>
                    <span
                      className="text-emerald-400 font-bold leading-none"
                      style={{ fontSize: "25px" }}
                    >
                      ${priceFor("advanced").toFixed(2)}
                      <span
                        className="text-slate-400 font-normal"
                        style={{ fontSize: "16px" }}
                      >
                        {" "}
                        {billingCycle === "monthly"
                          ? L("/month", "/mes")
                          : L("/month (billed yearly)", "/mes (facturado anual)")}
                      </span>
                    </span>
                    {billingCycle === "annual" && (
                      <span
                        className="mt-2 inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200"
                      >
                        {L("Save 2 months", "Ahorra 2 meses")}
                      </span>
                    )}
                    <span
                      className="text-slate-500 max-w-[200px] text-center"
                      style={{ fontSize: "12px", lineHeight: "1.4" }}
                    >
                      {L(
                        "For serious traders, coaches, prop-firm style tracking, and business-level reporting.",
                        "Para traders serios, coaches, tracking estilo prop-firm y reportes a nivel negocio."
                      )}
                    </span>
                    <Link
                      href={`/signup?plan=advanced&cycle=${billingCycle}`}
                      className="mt-2 inline-flex justify-center items-center px-6 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-semibold shadow-lg shadow-emerald-500/25 hover:bg-emerald-300 hover:shadow-emerald-400/30 transition"
                      style={{ fontSize: "14px" }}
                    >
                      {L("Get Started Advanced", "Empezar Advanced")}
                    </Link>
                  </div>
                </th>
              </tr>
            </thead>

            {/* BODY: HEADERS, SUBHEADERS, SUBSUBHEADERS */}
            <tbody>
              {rows.map((row, i) => {
                // HEADER PRINCIPAL
                if (row.section) {
                  return (
                    <tr key={`section-${i}`} className="bg-slate-900/95">
                      <td
                        colSpan={3}
                        className="px-4 py-3 font-bold uppercase tracking-wide"
                        style={{
                          fontSize: "15px",
                          color: "#e5e7eb",
                          ...(row.sectionStyle || {}),
                        }}
                      >
                        {translate(row.section)}
                      </td>
                    </tr>
                  );
                }

                // SUBHEADER
                if (row.subheader) {
                  return (
                    <tr
                      key={`subheader-${i}`}
                      className="bg-emerald-900/10 border-y border-emerald-700/40"
                    >
                      <td
                        colSpan={3}
                        className="py-2 font-semibold tracking-wide"
                        style={{
                          paddingLeft: "16px",
                          fontSize: "13px",
                          color: "#22c55e",
                          textTransform: "none",
                          ...(row.subheaderStyle || {}),
                        }}
                      >
                        {translate(row.subheader)}
                      </td>
                    </tr>
                  );
                }

                // SUB-SUBHEADERS / ITEMS
                const paddingClass =
                  row.indent === 1
                    ? "pl-10"
                    : row.indent === 2
                    ? "pl-12"
                    : "pl-4";

                return (
                  <tr
                    key={i}
                    className={
                      i % 2 === 0
                        ? "bg-slate-950/95"
                        : "bg-slate-950/90"
                    }
                  >
                    <td
                      className={`px-4 py-3 text-slate-100 border-t border-slate-900 ${paddingClass}`}
                      style={{
                        fontSize: "12px",
                        lineHeight: "1.5",
                        ...(row.labelStyle || {}),
                      }}
                    >
                      {translate(row.label)}
                    </td>
                    <td
                      className="px-4 py-3 text-center border-t border-slate-900"
                      style={{ fontSize: "12px" }}
                    >
                      {renderCell(row.core, translate)}
                    </td>
                    <td
                      className="px-4 py-3 text-center border-t border-slate-900"
                      style={{ fontSize: "12px" }}
                    >
                      {renderCell(row.advanced, translate)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

     

      <FloatingAskButton />
    </main>
  );
}
