import { Activity, ExternalLink, Landmark, RefreshCw } from "lucide-react";

import {
  MACRO_CONTEXT_LABELS,
  type MacroContextReport,
  type MacroContextVariable,
} from "@/lib/neuroMacroContext";

type Props = {
  report: MacroContextReport | null;
  isEs: boolean;
  loading: boolean;
  onRun: () => void;
};

function variableLabel(variable: MacroContextVariable, isEs: boolean) {
  return MACRO_CONTEXT_LABELS[variable][isEs ? "es" : "en"];
}

function formatValue(value: number, unit: string, isEs: boolean) {
  const locale = isEs ? "es-PR" : "en-US";
  if (unit === "%" || unit === "% annualized") {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}%`;
  }
  if (unit === "percentage points") {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} pp`;
  }
  if (unit.startsWith("USD")) {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value >= 1_000 ? 0 : 2,
      notation: value >= 1_000_000 ? "compact" : "standard",
    }).format(value);
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function statusTone(status: MacroContextReport["status"]) {
  if (status === "ready") return "border-emerald-400/45 bg-emerald-400/10 text-emerald-100";
  if (status === "partial") return "border-amber-400/45 bg-amber-400/10 text-amber-100";
  return "border-slate-600 bg-slate-950/60 text-slate-200";
}

function directionTone(direction: string) {
  if (direction === "positive") return "border-emerald-400/35 text-emerald-200";
  if (direction === "negative") return "border-rose-400/35 text-rose-200";
  if (direction === "mixed") return "border-amber-400/35 text-amber-200";
  return "border-slate-700 text-slate-400";
}

function EvidenceLink({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export default function MacroContextPanel({ report, isEs, loading, onRun }: Props) {
  if (!report) {
    return (
      <section className="rounded-xl border border-sky-400/25 bg-slate-900/80 p-5 shadow-lg shadow-slate-950/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-sky-300" />
              <h2 className="text-base font-semibold">{isEs ? "Contexto Macro" : "Macro Context"}</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {isEs
                ? "Datos, expectativas, forecasts y sensibilidad económica por compañía."
                : "Data, expectations, forecasts, and company-level economic sensitivity."}
            </p>
          </div>
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-sky-400/50 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-400/20 disabled:opacity-50"
          >
            <Activity className="h-4 w-4" />
            {loading ? (isEs ? "Analizando..." : "Analyzing...") : (isEs ? "Crear contexto" : "Build context")}
          </button>
        </div>
      </section>
    );
  }

  const verifiedSensitivityCount = report.companyContexts.reduce(
    (sum, company) => sum + company.sensitivities.length,
    0
  );

  return (
    <section className="rounded-xl border border-sky-400/25 bg-slate-900/80 p-4 shadow-lg shadow-slate-950/20 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <Landmark className="h-4 w-4 text-sky-300" />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300">
              {isEs ? "Agente de Contexto Macro" : "Macro Context Agent"}
            </p>
            <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-400">
              {isEs ? "CONTEXTO, NO TIMING" : "CONTEXT, NOT TIMING"}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-slate-50">
            {isEs ? "De la economía a los estados financieros" : "From the economy to company financials"}
          </h2>
          <p className="mt-2 text-xs text-slate-500">
            {isEs ? "Corte de evidencia" : "Evidence as of"}: {report.asOfDate.slice(0, 10)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex min-h-9 items-center rounded-full border px-3 py-2 text-xs font-bold ${statusTone(report.status)}`}>
            {report.status.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={onRun}
            disabled={loading}
            title={isEs ? "Actualizar contexto macro" : "Refresh macro context"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:border-sky-400/50 hover:text-sky-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [isEs ? "Datos observados" : "Observed data", report.observedData.length],
          [isEs ? "Expectativas de mercado" : "Market expectations", report.marketExpectations.length],
          [isEs ? "Forecasts externos" : "External forecasts", report.thirdPartyForecasts.length],
          [isEs ? "Sensibilidades verificadas" : "Verified sensitivities", verifiedSensitivityCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="border-l-2 border-sky-400/40 bg-slate-950/35 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-bold text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase text-slate-300">
          {isEs ? "Datos macroeconómicos observados" : "Observed macroeconomic data"}
        </p>
        <div className="mt-2 grid grid-cols-1 border-y border-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          {report.observedData.map((row) => (
            <div key={row.id} className="border-b border-slate-800 px-3 py-3 sm:border-r xl:last:border-r-0">
              <p className="text-[10px] font-semibold uppercase text-sky-300">
                {variableLabel(row.variable, isEs)}
              </p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="text-base font-bold text-slate-100">{formatValue(row.value, row.unit, isEs)}</p>
                <span className="text-[10px] text-slate-600">{row.period.slice(0, 10)}</span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{row.label}</p>
              {row.valueKind === "calculation" ? (
                <p className="mt-1 text-[10px] font-semibold uppercase text-violet-300">
                  {isEs ? "Cálculo desde datos observados" : "Calculated from observed data"}
                </p>
              ) : null}
            </div>
          ))}
          {!report.observedData.length ? (
            <p className="px-3 py-5 text-sm text-slate-500">
              {isEs ? "No hay series oficiales disponibles en esta corrida." : "No official series are available in this run."}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden border-y border-slate-800 bg-slate-800 lg:grid-cols-3">
        <div className="bg-slate-950/55 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-300">
            {isEs ? "Expectativas del mercado" : "Market expectations"}
          </p>
          <div className="mt-3 space-y-4">
            {report.marketExpectations.map((row) => (
              <div key={row.id}>
                <p className="text-sm leading-5 text-slate-200">{row.statement}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase text-slate-500">
                    {variableLabel(row.variable, isEs)} · {row.asOfDate.slice(0, 10)}
                  </span>
                  <EvidenceLink url={row.sourceUrl} label={row.sourceLabel} />
                </div>
              </div>
            ))}
            {!report.marketExpectations.length ? (
              <p className="text-xs leading-5 text-slate-500">
                {isEs ? "No se verificó una expectativa implícita del mercado." : "No market-implied expectation was verified."}
              </p>
            ) : null}
          </div>
        </div>

        <div className="bg-slate-950/55 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-300">
            {isEs ? "Forecasts de terceros" : "Third-party forecasts"}
          </p>
          <div className="mt-3 space-y-4">
            {report.thirdPartyForecasts.map((row) => (
              <div key={row.id}>
                <p className="text-sm leading-5 text-slate-200">{row.statement}</p>
                <p className="mt-1 text-[11px] text-slate-500">{row.forecastHorizon}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase text-slate-500">
                    {variableLabel(row.variable, isEs)} · {row.asOfDate.slice(0, 10)}
                  </span>
                  <EvidenceLink url={row.sourceUrl} label={row.sourceLabel} />
                </div>
              </div>
            ))}
            {!report.thirdPartyForecasts.length ? (
              <p className="text-xs leading-5 text-slate-500">
                {isEs ? "No se verificó un forecast externo fechado." : "No dated external forecast was verified."}
              </p>
            ) : null}
          </div>
        </div>

        <div className="bg-slate-950/55 p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-300">
            {isEs ? "Interpretación de IA" : "AI interpretation"}
          </p>
          <div className="mt-3 space-y-4">
            {report.aiInterpretations.map((row) => (
              <div key={row.id}>
                <p className="text-sm leading-5 text-slate-200">{row.interpretation}</p>
                <p className="mt-2 text-[11px] leading-4 text-slate-500">
                  {isEs ? "Incertidumbre" : "Uncertainty"}: {row.uncertainty}
                </p>
              </div>
            ))}
            {!report.aiInterpretations.length ? (
              <p className="text-xs leading-5 text-slate-500">
                {isEs ? "No hay interpretación respaldada en esta corrida." : "No grounded interpretation is available in this run."}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs font-semibold uppercase text-slate-300">
          {isEs ? "Transmisión por compañía" : "Company transmission map"}
        </p>
        <div className="mt-2 divide-y divide-slate-800 border-y border-slate-800">
          {report.companyContexts.map((company) => (
            <article key={company.ticker} className="py-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-base font-bold text-slate-50">{company.ticker}</p>
                <span className="text-xs text-slate-500">{company.companyName}</span>
                <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase text-slate-400">
                  {company.portfolioStatus === "existing_position"
                    ? (isEs ? "Posición" : "Holding")
                    : (isEs ? "Candidato" : "Candidate")}
                </span>
              </div>
              <div className="mt-3 divide-y divide-slate-800/80">
                {company.sensitivities.map((sensitivity) => (
                  <div key={`${company.ticker}-${sensitivity.variable}-${sensitivity.specificDriver}`} className="grid gap-3 py-3 lg:grid-cols-[220px_minmax(0,1fr)_260px]">
                    <div>
                      <p className="text-xs font-semibold text-sky-200">{sensitivity.specificDriver}</p>
                      <p className="mt-1 text-[10px] uppercase text-slate-500">
                        {variableLabel(sensitivity.variable, isEs)}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${directionTone(sensitivity.direction)}`}>
                          {sensitivity.direction}
                        </span>
                        <span className="rounded-full border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase text-slate-400">
                          {sensitivity.materiality}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm leading-6 text-slate-200">{sensitivity.transmissionMechanism}</p>
                      {sensitivity.financialLineItems.length ? (
                        <p className="mt-2 text-[11px] text-slate-500">
                          {isEs ? "Líneas afectadas" : "Affected lines"}: {sensitivity.financialLineItems.join(" / ")}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-slate-500">
                        {isEs ? "Qué monitorear" : "What to monitor"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        {sensitivity.indicatorsToMonitor.join(" · ") || (isEs ? "Indicadores pendientes" : "Indicators pending")}
                      </p>
                      <p className="mt-2 text-[11px] leading-4 text-slate-500">{sensitivity.uncertainty}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {sensitivity.evidence
                          .filter((evidence) => evidence.status === "identified" && evidence.sourceUrl)
                          .slice(0, 2)
                          .map((evidence) => (
                            <EvidenceLink
                              key={`${evidence.sourceUrl}-${evidence.statement}`}
                              url={evidence.sourceUrl as string}
                              label={evidence.sourceLabel}
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                ))}
                {!company.sensitivities.length ? (
                  <p className="py-3 text-xs leading-5 text-slate-500">
                    {company.missingEvidence.join(" ") || (isEs ? "Evidencia insuficiente." : "Insufficient evidence.")}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>

      {report.missingData.length ? (
        <div className="mt-5 border-l-2 border-amber-400/50 bg-amber-400/5 px-4 py-3">
          <p className="text-[10px] font-bold uppercase text-amber-200">
            {isEs ? "Brechas de evidencia" : "Evidence gaps"}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">{report.missingData.join(" · ")}</p>
        </div>
      ) : null}
    </section>
  );
}
