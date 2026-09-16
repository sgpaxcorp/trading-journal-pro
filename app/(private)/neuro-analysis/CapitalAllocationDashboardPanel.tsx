"use client";

import { Banknote, Landmark, Loader2, Play, Scale } from "lucide-react";

import type {
  CapitalAllocationAlternative,
  CapitalAllocationDashboard,
} from "@/lib/neuroCapitalAllocation";
import { DATA_NOT_AVAILABLE } from "@/lib/neuroFinancialDataIntegrity";

type Props = {
  dashboard: CapitalAllocationDashboard | null;
  availableCapital: number | null;
  isEs: boolean;
  loading: boolean;
  onAvailableCapitalChange: (value: number | null) => void;
  onRun: () => void;
};

function formatMoney(value: number | null | undefined, isEs: boolean) {
  if (value == null || !Number.isFinite(value)) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(isEs ? "es-ES" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1_000 ? 0 : 2,
  }).format(value);
}

function formatPct(value: number | null, isEs: boolean, digits = 1) {
  if (value == null || !Number.isFinite(value)) return DATA_NOT_AVAILABLE;
  return new Intl.NumberFormat(isEs ? "es-ES" : "en-US", {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(value / 100);
}

function alternativeLabel(kind: CapitalAllocationAlternative["kind"], isEs: boolean) {
  const labels: Record<CapitalAllocationAlternative["kind"], [string, string]> = {
    existing_position: ["Existing position", "Posición existente"],
    new_candidate: ["New candidate", "Candidato nuevo"],
    cash: ["Cash", "Efectivo"],
    treasury_cash_management: ["Treasury / cash management", "Treasury / manejo de efectivo"],
  };
  return labels[kind][isEs ? 1 : 0];
}

function evidenceTone(status: CapitalAllocationAlternative["evidenceStatus"]) {
  if (status === "ready") return "border-emerald-400/40 bg-emerald-400/10 text-emerald-200";
  if (status === "partial") return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  return "border-slate-600 bg-slate-950/70 text-slate-300";
}

function liquidityTone(level: CapitalAllocationAlternative["liquidity"]["level"]) {
  if (level === "high") return "text-emerald-300";
  if (level === "medium") return "text-sky-300";
  if (level === "low") return "text-amber-300";
  return "text-slate-400";
}

function ListBlock({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase text-slate-500">{title}</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-5 text-slate-300">
        {rows.slice(0, 4).map((row, index) => (
          <li key={`${title}-${index}`} className="break-words">
            {row}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlternativeRow({ alternative, isEs }: { alternative: CapitalAllocationAlternative; isEs: boolean }) {
  const valuation = alternative.currentValuation;
  const valuationPrimary =
    valuation.marketPrice != null
      ? formatMoney(valuation.marketPrice, isEs)
      : valuation.referenceYieldPct != null
        ? `${formatPct(valuation.referenceYieldPct, isEs)} ${isEs ? "contexto" : "context"}`
        : valuation.valuationStatus.replaceAll("_", " ");
  return (
    <article className="border-b border-slate-800 py-5 last:border-b-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-50">{alternative.label}</p>
            {alternative.ticker ? (
              <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-300">
                {alternative.ticker}
              </span>
            ) : null}
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold text-cyan-200">
              {alternativeLabel(alternative.kind, isEs)}
            </span>
            <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${evidenceTone(alternative.evidenceStatus)}`}>
              {alternative.evidenceStatus.toUpperCase()}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {isEs ? "Asignación actual" : "Current allocation"}: {formatMoney(alternative.currentAllocation.amount, isEs)} · {formatPct(alternative.currentAllocation.weightPct, isEs)}
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-4 border-l-2 border-emerald-400/40 pl-3 text-xs lg:w-[360px]">
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Valoración" : "Valuation"}</p>
            <p className="mt-1 font-semibold text-slate-100">{valuationPrimary}</p>
            <p className="mt-1 leading-4 text-slate-500">{valuation.basis}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Concentración hipotética" : "Hypothetical concentration"}</p>
            <p className="mt-1 font-semibold text-slate-100">
              {formatPct(alternative.existingConcentration.hypotheticalWeightIfAllAvailableCapitalAllocatedPct, isEs)}
            </p>
            <p className="mt-1 leading-4 text-slate-500">{isEs ? "Si todo el capital disponible fuera aquí" : "If all available capital went here"}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <ListBlock title={isEs ? "Motores fundamentales" : "Fundamental drivers"} rows={alternative.expectedFundamentalDrivers} />
        <ListBlock title={isEs ? "Escenarios bajistas" : "Downside scenarios"} rows={alternative.downsideScenarios} />
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Liquidez y exposición" : "Liquidity and exposure"}</p>
          <p className={`mt-2 text-xs font-semibold uppercase ${liquidityTone(alternative.liquidity.level)}`}>
            {alternative.liquidity.level}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{alternative.liquidity.basis}</p>
          <p className="mt-2 text-xs leading-5 text-slate-300">{alternative.portfolioExposure.summary}</p>
          {alternative.portfolioExposure.dependencies.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {alternative.portfolioExposure.dependencies.slice(0, 4).map((dependency) => (
                <span
                  key={`${alternative.id}-${dependency.driver}-${dependency.dependencyName}`}
                  className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-300"
                >
                  {dependency.dependencyName}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <ListBlock title={isEs ? "Incertidumbres mayores" : "Major uncertainties"} rows={alternative.majorUncertainties} />
      </div>
    </article>
  );
}

export default function CapitalAllocationDashboardPanel({
  dashboard,
  availableCapital,
  isEs,
  loading,
  onAvailableCapitalChange,
  onRun,
}: Props) {
  return (
    <section className="border-y border-emerald-400/20 bg-slate-950/30 px-1 py-6 sm:px-2">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-emerald-300" />
            <p className="text-[11px] font-bold uppercase text-emerald-300">
              {isEs ? "Dashboard de Asignación de Capital" : "Capital Allocation Dashboard"}
            </p>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-slate-50">
            {isEs ? "El mismo dólar, alternativas diferentes" : "The same dollar, different alternatives"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {dashboard?.summary ??
              (isEs
                ? "Compara posiciones, candidatos y efectivo sin asumir que el capital tiene que invertirse."
                : "Compare positions, candidates, and cash without assuming capital must be invested.")}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
          <label className="min-w-0 sm:w-64">
            <span className="text-[10px] font-bold uppercase text-slate-500">
              {isEs ? "Capital disponible" : "Available capital"}
            </span>
            <div className="mt-1 flex h-10 items-center rounded-lg border border-slate-700 bg-slate-950/70 px-3 focus-within:border-emerald-400">
              <span className="mr-2 text-sm text-slate-500">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={availableCapital ?? ""}
                placeholder={DATA_NOT_AVAILABLE}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  const parsed = raw ? Number(raw) : null;
                  onAvailableCapitalChange(parsed == null || !Number.isFinite(parsed) ? null : Math.max(0, parsed));
                }}
                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-100 outline-none"
              />
            </div>
          </label>
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="mt-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {dashboard ? (isEs ? "Actualizar" : "Refresh") : (isEs ? "Crear dashboard" : "Build dashboard")}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="border-l-2 border-emerald-400/50 px-3 py-1">
          <p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Invertido" : "Invested"}</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">
            {formatMoney(dashboard?.investedPortfolioValue, isEs)}
          </p>
        </div>
        <div className="border-l-2 border-sky-400/50 px-3 py-1">
          <p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Efectivo disponible" : "Available cash"}</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">
            {formatMoney(dashboard?.availableCapital ?? availableCapital, isEs)}
          </p>
        </div>
        <div className="border-l-2 border-amber-400/50 px-3 py-1">
          <p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Capital bajo revisión" : "Capital under review"}</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">
            {formatMoney(dashboard?.totalCapitalUnderReview ?? availableCapital, isEs)}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-y border-slate-800 py-4 text-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 text-emerald-200">
          <Banknote className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {isEs
              ? "CASH es una posición válida. El sistema no trata el efectivo como error ni exige desplegarlo."
              : "CASH is a valid portfolio state. The system does not treat cash as an error or require deployment."}
          </p>
        </div>
        <div className="flex items-start gap-2 text-slate-400">
          <Landmark className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {dashboard?.treasuryCashManagement.reason ??
              (isEs
                ? "Treasury aparece solo cuando la política lo permite explícitamente."
                : "Treasury appears only when explicitly permitted by policy.")}
          </p>
        </div>
      </div>

      {dashboard?.alternatives.length ? (
        <div className="mt-1">
          {dashboard.alternatives.map((alternative) => (
            <AlternativeRow key={alternative.id} alternative={alternative} isEs={isEs} />
          ))}
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-slate-500">
          {isEs
            ? "Ingresa el efectivo disponible y corre Neuro para comparar las alternativas con la evidencia actual."
            : "Enter available cash and run Neuro to compare alternatives using current evidence."}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-5 text-slate-500">
        {isEs
          ? "Este dashboard no clasifica alternativas, no crea un target allocation y no ejecuta transacciones. Cada escenario de concentración es matemático y requiere revisión humana."
          : "This dashboard does not rank alternatives, create a target allocation, or execute transactions. Every concentration scenario is mathematical and requires human review."}
      </p>
    </section>
  );
}
