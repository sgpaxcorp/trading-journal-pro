"use client";

import Link from "next/link";
import {
  FaTwitter,
  FaInstagram,
  FaLinkedinIn,
  FaDiscord,
  FaFacebookF,
} from "react-icons/fa";
import FloatingAskButton from "../components/FloatingAskButton";
import type { CSSProperties } from "react";

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
  // GENERAL
  {
    section: "GENERAL",
    sectionStyle: {
      fontSize: "15px",
      color: "#e5e7eb",
    },
  },
  { label: "Accounts", core: "1", advanced: "Up to 5" },
  { label: "Data storage", core: "1GB", advanced: "5GB" },
  { label: "Trade imports", core: "Coming soon", advanced: "Coming Soon" },
  { label: "Support", core: "Email support", advanced: "Priority email & chat" },

  // PLANNING & RULES
  {
    section: "PLANNING & RULES",
    sectionStyle: { fontSize: "15px", color: "#e5e7eb" },
  },
  { label: "Planning your goal (customizable)", core: true, advanced: true },
  { label: "Set-up rules (customizable)", core: true, advanced: true },
  {
    label: "Set-up messages and alarms (customizable)",
   core: "Basic",
    advanced: "Advanced",
  },

  // NOTEBOOK (SUBHEADER CUSTOMIZABLE)
  {
    subheader: "Notebook",
    subheaderStyle: {
      paddingLeft: "24px",
      fontSize: "15px",
      color: "#22c55e",
      fontWeight: 600,
    },
  },
  {
    label: "Pre-market planning",
    indent: 1,
   core: true,
    advanced: true,
  },
  {
    label: "Trade management (entry/exit chart)",
    indent: 1,
    core: true,
    advanced: true,
  },
  {
    label: "Emotions register (drop-down tags)",
    indent: 1,
    core: true,
    advanced: true,
  },
  {
    label: "Well executed and lesson learned sections",
    indent: 1,
    core: true,
    advanced: true,
  },
  {
    label: "Templates",
    indent: 1,
    core: "Core",
    advanced: "Advance",
  },
  {
    label: "Add images and screenshots",
    indent: 1,
    core: true,
    advanced: true,
  },
  {
    label: "Stylus-friendly interface for Tablet",
    indent: 1,
    core: "Coming soon",
    advanced: "Coming soon",
  },

  // REPORTING
  {
    section: "REPORTING",
    sectionStyle: { fontSize: "15px", color: "#e5e7eb" },
  },
  {
    label: "Calendar with results (daily, monthly, yearly)",
    core: true,
    advanced: true,
  },
  {
    label: "Account performance graph",
    core: true,
    advanced: true,
  },
  {
    label: "AI summary report (selectable period)",
    core: false,
    advanced: true,
  },
  {
    label: "AI suggestions",
    core: false,
   advanced: true,
  },
  {
    label: "Emotionless graph",
    core: true,
    advanced: true,
  },

  // ANALYTICS
  {
    section: "ANALYTICS",
    sectionStyle: { fontSize: "15px", color: "#e5e7eb" },
  },
  {
    label: "Progress ratio",
    core: true,
    advanced: true,
  },
  {
    label: "Average return ratio (weekly)",
    core: false,
    advanced: true,
  },
  {
    label: "Average trades per day, week, month",
    core: false,
    advanced: true,
  },

  // PROGRESS ANALYSIS (SUBHEADER CUSTOMIZABLE)
  {
    subheader: "Progress analysis",
    subheaderStyle: {
      paddingLeft: "24px",
      fontSize: "14px",
      color: "#22c55e",
      fontWeight: 600,
    },
  },
  {
    label: "Days with well executed trades and lessons learned",
    indent: 1,
    core: false,
    advanced: true,
  },
  {
    label: "How many days are well executed and lessons learned",
    indent: 1,
    core: false,
    advanced: true,
  },
  {
    label: "Risk management ratio",
    core: true,
    advanced: true,
  },

  // OTHER TOOLS
  {
    section: "OTHER TOOLS",
    sectionStyle: { fontSize: "15px", color: "#e5e7eb" },
  },
  {
    label: "Economic calendar",
    core: true,
    advanced: true,
  },
  {
    label: "Manage trading business",
    core: false,
    advanced: true,
  },
  {
    label: "Track profits and losses",
    core: false,
   advanced: true,
  },
  {
    label: "Track business expenses",
    core: false,
    advanced: true,
  },
  {
    label: "PDF reporting",
    core: false,
    advanced: true,
  },

  // COACHING PROGRAM & AI
  {
    section: "COACHING PROGRAM & AI",
    sectionStyle: { fontSize: "15px", color: "#e5e7eb" },
  },
  {
    label: "AI coaching",
    core: false,
   advanced: true,
  },
  {
    subheader: "Custom rules and actions",
    subheaderStyle: {
      paddingLeft: "24px",
      fontSize: "14px",
      color: "#22c55e",
      fontWeight: 600,
    },
  },
  {
    label: "After your goal is reached",
    indent: 1,
    core: "Basic",
    advanced: "Advanced",
  },
  {
    label: "After your risk is reached",
    indent: 1,
    core: "Basic",
    advanced: "Advanced",
  },
  {
    label: "Coaching templates",
    core: false,
    advanced: true,
  },
];

function renderCell(value: string | boolean | undefined) {
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
  return <span className="text-[11px] text-slate-100">{value}</span>;
}

export default function PlansComparison() {
  const year = new Date().getFullYear();

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
        <div className="flex items-start justify-between max-w-6xl mx-auto mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Compare Plans
            </h1>
            <p className="text-[10px] md:text-xs text-emerald-400 mt-1 max-w-xl">
              Trade Journal Pro: structure, data, and trading psychology — all in one place.
            </p>
            <p className="text-[10px] md:text-xs text-slate-400 mt-1 max-w-xl">
              Choose between a solid foundation for your journal or the complete ecosystem with logging, advanced analytics, and AI coaching.
            </p>
          </div>

          <div className="hidden md:flex flex-col items-end gap-3 text-[9px] md:text-[10px]">
            <Link
              href="/pricing"
              className="text-slate-400 hover:text-emerald-400"
            >
              ← Back to pricing
            </Link>
            <Link
              href="/"
              className="text-slate-500 hover:text-emerald-300"
            >
              Go to home
            </Link>
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
                  Features
                </th>

                {/* CORE */}
                <th className="px-4 py-4 align-top text-center">
                  <div className="flex flex-col items-center gap-3">
                    <span
                      className="uppercase tracking-wide text-slate-400 font-semibold"
                      style={{ fontSize: "16px" }}
                    >
                      Core
                    </span>
                    <span
                      className="text-emerald-400 font-bold leading-none"
                      style={{ fontSize: "25px" }}
                    >
                      $14.99
                      <span
                        className="text-slate-400 font-normal"
                        style={{ fontSize: "16px" }}
                      >
                        {" "}
                        /month
                      </span>
                    </span>
                    <span
                      className="text-slate-500 max-w-[180px]"
                      style={{ fontSize: "12px", lineHeight: "1.4" }}
                    >
                      Ideal for independent traders who want structure and clarity.
                    </span>
                    <Link
                      href="/signup?plan=core"
                      className="mt-2 inline-flex justify-center items-center px-6 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-semibold shadow-lg shadow-emerald-500/25 hover:bg-emerald-300 hover:shadow-emerald-400/30 transition"
                      style={{ fontSize: "14px" }}
                    >
                      Get Started Core
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
                        Advanced
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300 border border-emerald-500/40"
                        style={{ fontSize: "10px" }}
                      >
                        Best value
                      </span>
                    </div>
                    <span
                      className="text-emerald-400 font-bold leading-none"
                      style={{ fontSize: "25px" }}
                    >
                      $24.99
                      <span
                        className="text-slate-400 font-normal"
                        style={{ fontSize: "16px" }}
                      >
                        {" "}
                        /month
                      </span>
                    </span>
                    <span
                      className="text-slate-500 max-w-[200px] text-center"
                      style={{ fontSize: "12px", lineHeight: "1.4" }}
                    >
                      For serious traders, coaches, prop-firm style tracking, and business-level reporting.
                    </span>
                    <Link
                      href="/signup?plan=advanced"
                      className="mt-2 inline-flex justify-center items-center px-6 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-semibold shadow-lg shadow-emerald-500/25 hover:bg-emerald-300 hover:shadow-emerald-400/30 transition"
                      style={{ fontSize: "14px" }}
                    >
                      Get Started Advanced
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
                        {row.section}
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
                        {row.subheader}
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
                      {row.label}
                    </td>
                    <td
                      className="px-4 py-3 text-center border-t border-slate-900"
                      style={{ fontSize: "12px" }}
                    >
                      {renderCell(row.core)}
                    </td>
                    <td
                      className="px-4 py-3 text-center border-t border-slate-900"
                      style={{ fontSize: "12px" }}
                    >
                      {renderCell(row.advanced)}
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
