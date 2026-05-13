"use client";

import Link from "next/link";
import {
  catalogText,
  PLAN_CATALOG,
  PLAN_COMPARISON_ROWS,
  type CatalogLocale,
  type PlanCell,
} from "@/lib/planCatalog";
import type { PlanId } from "@/lib/types";

function renderCell(value: PlanCell | undefined, lang: CatalogLocale) {
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
  return <span className="text-[11px] text-slate-100">{catalogText(value, lang)}</span>;
}

type PlanComparisonTableProps = {
  billingCycle: "monthly" | "annual";
  priceFor: (planId: PlanId) => number;
  L: (en: string, es: string) => string;
  lang: "en" | "es";
  showCtas?: boolean;
};

export function PlanComparisonTable({
  billingCycle,
  priceFor,
  L,
  lang,
  showCtas = true,
}: PlanComparisonTableProps) {
  return (
    <div className="max-w-6xl mx-auto rounded-2xl overflow-hidden bg-slate-950/96 border border-slate-800 shadow-2xl shadow-emerald-500/5">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-slate-900/95 border-b border-slate-800">
            <th
              className="px-4 py-4 font-semibold text-slate-300 uppercase tracking-wide align-top"
              style={{ fontSize: "22px" }}
            >
              {L("Features", "Características")}
            </th>
            <th className="px-4 py-4 align-top text-center">
              <div className="flex flex-col items-center gap-3">
                <span
                  className="uppercase tracking-wide text-slate-400 font-semibold"
                  style={{ fontSize: "16px" }}
                >
                  {catalogText(PLAN_CATALOG.core.name, lang)}
                </span>
                <span className="text-emerald-400 font-bold leading-none" style={{ fontSize: "25px" }}>
                  ${priceFor("core").toFixed(2)}
                  <span className="text-slate-400 font-normal" style={{ fontSize: "16px" }}>
                    {" "}
                    {billingCycle === "monthly"
                      ? L("/month", "/mes")
                      : L("/month (billed yearly)", "/mes (facturado anual)")}
                  </span>
                </span>
                {billingCycle === "annual" && (
                  <span className="mt-2 inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                    {L("Save 2 months", "Ahorra 2 meses")}
                  </span>
                )}
                <span className="text-slate-500 max-w-[180px]" style={{ fontSize: "12px", lineHeight: "1.4" }}>
                  {L(
                    PLAN_CATALOG.core.comparisonDescription.en,
                    PLAN_CATALOG.core.comparisonDescription.es
                  )}
                </span>
                {showCtas && (
                  <Link
                    href={`/signup?plan=core&cycle=${billingCycle}`}
                    className="mt-2 inline-flex justify-center items-center px-6 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-semibold shadow-lg shadow-emerald-500/25 hover:bg-emerald-300 hover:shadow-emerald-400/30 transition"
                    style={{ fontSize: "14px" }}
                  >
                    {L("Get Started Core", "Empezar Core")}
                  </Link>
                )}
              </div>
            </th>
            <th className="px-4 py-4 align-top text-center">
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="uppercase tracking-wide text-emerald-300 font-semibold" style={{ fontSize: "16px" }}>
                    {catalogText(PLAN_CATALOG.advanced.name, lang)}
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300 border border-emerald-500/40"
                    style={{ fontSize: "10px" }}
                  >
                    {L("Best value", "Mejor valor")}
                  </span>
                </div>
                <span className="text-emerald-400 font-bold leading-none" style={{ fontSize: "25px" }}>
                  ${priceFor("advanced").toFixed(2)}
                  <span className="text-slate-400 font-normal" style={{ fontSize: "16px" }}>
                    {" "}
                    {billingCycle === "monthly"
                      ? L("/month", "/mes")
                      : L("/month (billed yearly)", "/mes (facturado anual)")}
                  </span>
                </span>
                {billingCycle === "annual" && (
                  <span className="mt-2 inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                    {L("Save 2 months", "Ahorra 2 meses")}
                  </span>
                )}
                <span className="text-slate-500 max-w-[200px] text-center" style={{ fontSize: "12px", lineHeight: "1.4" }}>
                  {L(
                    PLAN_CATALOG.advanced.comparisonDescription.en,
                    PLAN_CATALOG.advanced.comparisonDescription.es
                  )}
                </span>
                {showCtas && (
                  <Link
                    href={`/signup?plan=advanced&cycle=${billingCycle}`}
                    className="mt-2 inline-flex justify-center items-center px-6 py-3 rounded-2xl bg-emerald-400 text-slate-950 font-semibold shadow-lg shadow-emerald-500/25 hover:bg-emerald-300 hover:shadow-emerald-400/30 transition"
                    style={{ fontSize: "14px" }}
                  >
                    {L("Get Started Advanced", "Empezar Advanced")}
                  </Link>
                )}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {PLAN_COMPARISON_ROWS.map((row, i) => {
            if (row.kind === "section") {
              return (
                <tr key={`section-${i}`} className="bg-slate-900/95">
                  <td
                    colSpan={3}
                    className="px-4 py-3 font-bold uppercase tracking-wide"
                    style={{ fontSize: "15px", color: row.tone === "addon" ? "#34d399" : "#e5e7eb" }}
                  >
                    {catalogText(row.label, lang)}
                  </td>
                </tr>
              );
            }

            if (row.kind === "subheader") {
              return (
                <tr key={`subheader-${i}`} className="bg-emerald-900/10 border-y border-emerald-700/40">
                  <td
                    colSpan={3}
                    className="py-2 font-semibold tracking-wide"
                    style={{
                      paddingLeft: "16px",
                      fontSize: "13px",
                      color: "#22c55e",
                      textTransform: "none",
                    }}
                  >
                    {catalogText(row.label, lang)}
                  </td>
                </tr>
              );
            }

            const paddingClass = row.indent === 1 ? "pl-10" : row.indent === 2 ? "pl-12" : "pl-4";
            return (
              <tr key={i} className={i % 2 === 0 ? "bg-slate-950/95" : "bg-slate-950/90"}>
                <td
                  className={`px-4 py-3 text-slate-100 border-t border-slate-900 ${paddingClass}`}
                  style={{ fontSize: "12px", lineHeight: "1.5" }}
                >
                  {catalogText(row.label, lang)}
                </td>
                <td className="px-4 py-3 text-center border-t border-slate-900" style={{ fontSize: "12px" }}>
                  {renderCell(row.core, lang)}
                </td>
                <td className="px-4 py-3 text-center border-t border-slate-900" style={{ fontSize: "12px" }}>
                  {renderCell(row.advanced, lang)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
