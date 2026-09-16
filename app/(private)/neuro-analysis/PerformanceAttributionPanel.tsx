"use client";

import { BarChart3, CheckCircle2, CircleDollarSign, Loader2, Play, TriangleAlert } from "lucide-react";

import type {
  PerformanceAttributionReport,
  PerformanceCalculationStatus,
  PerformanceEffect,
  PerformanceMoneyComponent,
} from "@/lib/neuroPerformanceAttribution";

type Props = {
  report: PerformanceAttributionReport | null;
  isEs: boolean;
  loading: boolean;
  error?: string;
  onRun: () => void;
};

function money(value: number | null, currency: string, isEs: boolean) {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(isEs ? "es-ES" : "en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function pct(value: number | null, isEs: boolean) {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(isEs ? "es-ES" : "en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function statusLabel(status: PerformanceCalculationStatus, isEs: boolean) {
  const labels: Record<PerformanceCalculationStatus, [string, string]> = {
    calculated: ["Calculated", "Calculado"],
    partial: ["Partial", "Parcial"],
    unavailable: ["Unavailable", "No disponible"],
    not_applicable: ["Not applicable", "No aplica"],
  };
  return labels[status][isEs ? 1 : 0];
}

function statusTone(status: PerformanceCalculationStatus) {
  if (status === "calculated") return "border-emerald-400/35 bg-emerald-400/10 text-emerald-200";
  if (status === "partial") return "border-amber-400/35 bg-amber-400/10 text-amber-200";
  return "border-slate-700 bg-slate-950/60 text-slate-400";
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="min-w-0 border-l-2 border-emerald-400/45 px-3 py-1">
      <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-50">{value}</p>
      <p className="mt-1 truncate text-[11px] text-slate-500" title={hint}>{hint}</p>
    </div>
  );
}

function MoneyRow({
  label,
  component,
  currency,
  isEs,
}: {
  label: string;
  component: PerformanceMoneyComponent;
  currency: string;
  isEs: boolean;
}) {
  return (
    <tr className="border-b border-slate-800/80 last:border-b-0">
      <td className="py-2.5 pr-3 text-sm text-slate-300">{label}</td>
      <td className="py-2.5 pr-3 text-right text-sm font-semibold text-slate-100">
        {money(component.amount, currency, isEs)}
      </td>
      <td className="py-2.5 text-right">
        <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold uppercase ${statusTone(component.status)}`}>
          {statusLabel(component.status, isEs)}
        </span>
      </td>
    </tr>
  );
}

function EffectRow({ label, effect, isEs }: { label: string; effect: PerformanceEffect; isEs: boolean }) {
  return (
    <tr className="border-b border-slate-800/80 last:border-b-0">
      <td className="py-2.5 pr-3 text-sm text-slate-300">{label}</td>
      <td className="py-2.5 pr-3 text-right text-sm font-semibold text-slate-100">
        {pct(effect.effectPct, isEs)}
      </td>
      <td className="py-2.5 text-right">
        <span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-bold uppercase ${statusTone(effect.status)}`}>
          {statusLabel(effect.status, isEs)}
        </span>
      </td>
    </tr>
  );
}

export default function PerformanceAttributionPanel({ report, isEs, loading, error, onRun }: Props) {
  const currency = report?.period.baseCurrency || "USD";
  const fullPeriod = report?.mode === "full_period";
  const investorMetric = report?.investorReturn.annualizedValuePct ?? report?.investorReturn.valuePct ?? null;

  return (
    <section className="border-y border-cyan-400/20 bg-slate-950/30 px-1 py-6 sm:px-2">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <BarChart3 className="h-4 w-4 text-cyan-300" />
            <p className="text-[11px] font-bold uppercase text-cyan-300">
              {isEs ? "Motor de Atribución de Performance" : "Performance Attribution Engine"}
            </p>
            {report ? (
              <span className={`rounded-full border px-2 py-1 text-[9px] font-bold uppercase ${fullPeriod ? statusTone("calculated") : statusTone("partial")}`}>
                {fullPeriod
                  ? (isEs ? "Periodo completo" : "Full period")
                  : (isEs ? "Snapshot de costo" : "Cost-basis snapshot")}
              </span>
            ) : null}
          </div>
          <h2 className="mt-2 text-lg font-semibold text-slate-50">
            {isEs ? "Qué produjo el retorno y qué no cuenta como ganancia" : "What produced the return and what is not performance"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {isEs
              ? "Cálculo financiero reproducible. Los depósitos y retiros se excluyen del P&L; la IA solo puede explicar el resultado, nunca calcularlo ni sustituir data faltante."
              : "Reproducible financial calculation. Contributions and withdrawals are excluded from P&L; AI may explain the result but never calculate it or replace missing data."}
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {report ? (isEs ? "Actualizar" : "Refresh") : (isEs ? "Calcular" : "Calculate")}
        </button>
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 border-l-2 border-rose-400/60 bg-rose-400/5 px-3 py-2 text-xs leading-5 text-rose-200">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      {report ? (
        <>
          {fullPeriod ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                label={isEs ? "Retorno portfolio" : "Portfolio return"}
                value={pct(report.portfolioReturn.valuePct, isEs)}
                hint={report.portfolioReturn.method.replaceAll("_", " ")}
              />
              <Metric
                label={isEs ? "Retorno inversionista" : "Investor return"}
                value={pct(investorMetric, isEs)}
                hint={report.investorReturn.annualizedValuePct != null ? "XIRR annualized" : report.investorReturn.method}
              />
              <Metric
                label={`${report.benchmark.ticker} ${isEs ? "benchmark" : "benchmark"}`}
                value={pct(report.benchmark.returnPct, isEs)}
                hint={report.benchmark.method}
              />
              <Metric
                label={isEs ? "Retorno activo" : "Active return"}
                value={pct(report.activeReturnPct, isEs)}
                hint={isEs ? "Portfolio menos benchmark" : "Portfolio minus benchmark"}
              />
            </div>
          ) : report.snapshot ? (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label={isEs ? "Costo registrado" : "Recorded cost"} value={money(report.snapshot.costBasis, currency, isEs)} hint={isEs ? "Posiciones abiertas" : "Open positions"} />
              <Metric label={isEs ? "Valor actual" : "Current value"} value={money(report.snapshot.currentValue, currency, isEs)} hint={isEs ? "Snapshot actual" : "Current snapshot"} />
              <Metric label={isEs ? "Ganancia no realizada" : "Unrealized gain"} value={money(report.snapshot.unrealizedGain, currency, isEs)} hint={isEs ? "Valor menos costo" : "Value minus cost"} />
              <Metric label={isEs ? "Retorno sobre costo" : "Return on cost"} value={pct(report.snapshot.costBasisReturnPct, isEs)} hint={isEs ? "No es TWR ni XIRR" : "Not TWR or XIRR"} />
            </div>
          ) : null}

          <div className="mt-6 flex items-start gap-3 border-y border-slate-800 py-4">
            {report.externalCashFlows.excludedFromInvestmentPnl ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            ) : (
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            )}
            <div className="min-w-0 text-sm leading-6 text-slate-300">
              <p className="font-semibold text-slate-100">
                {isEs ? "Capital externo excluido del performance" : "External capital excluded from performance"}
              </p>
              <p className="text-slate-400">
                {isEs ? "Aportes" : "Contributions"}: {money(report.externalCashFlows.contributions, currency, isEs)} · {isEs ? "Retiros" : "Withdrawals"}: {money(report.externalCashFlows.withdrawals, currency, isEs)} · {isEs ? "Neto al portfolio" : "Net into portfolio"}: {money(report.externalCashFlows.netIntoPortfolio, currency, isEs)}
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-7 xl:grid-cols-2">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Puente de P&L" : "P&L bridge"}</p>
                  <p className="mt-1 text-sm text-slate-400">{isEs ? "Fuentes económicas, sin doble conteo" : "Economic sources, without double counting"}</p>
                </div>
                <p className="text-right text-sm font-semibold text-slate-100">
                  {money(report.pnlAttribution.investmentPnl, currency, isEs)}
                </p>
              </div>
              <table className="mt-3 w-full table-fixed">
                <tbody>
                  <MoneyRow label={isEs ? "Ganancias realizadas" : "Realized gains"} component={report.pnlAttribution.realizedGains} currency={currency} isEs={isEs} />
                  <MoneyRow label={isEs ? "Ganancias no realizadas" : "Unrealized gains"} component={report.pnlAttribution.unrealizedGains} currency={currency} isEs={isEs} />
                  <MoneyRow label={isEs ? "Dividendos" : "Dividends"} component={report.pnlAttribution.dividends} currency={currency} isEs={isEs} />
                  <MoneyRow label={isEs ? "Retorno de efectivo" : "Cash income"} component={report.pnlAttribution.cashIncome} currency={currency} isEs={isEs} />
                  <MoneyRow label={isEs ? "Comisiones y gastos" : "Fees and expenses"} component={report.pnlAttribution.feesAndExpenses} currency={currency} isEs={isEs} />
                  <MoneyRow label={isEs ? "Moneda" : "Currency"} component={report.pnlAttribution.currencyGainLoss} currency={currency} isEs={isEs} />
                  <MoneyRow label={isEs ? "Residual no explicado" : "Unexplained residual"} component={report.pnlAttribution.unexplainedResidual} currency={currency} isEs={isEs} />
                </tbody>
              </table>
            </div>

            <div className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-500">{isEs ? "Atribución vs benchmark" : "Attribution vs benchmark"}</p>
                  <p className="mt-1 text-sm text-slate-400">{isEs ? "Efectos aditivos del retorno activo" : "Additive active-return effects"}</p>
                </div>
                <p className="text-right text-sm font-semibold text-slate-100">{pct(report.activeReturnPct, isEs)}</p>
              </div>
              <table className="mt-3 w-full table-fixed">
                <tbody>
                  <EffectRow label={isEs ? "Selección de valores" : "Security selection"} effect={report.activeAttribution.securitySelection} isEs={isEs} />
                  <EffectRow label={isEs ? "Exposición sectorial" : "Sector exposure"} effect={report.activeAttribution.sectorExposure} isEs={isEs} />
                  <EffectRow label={isEs ? "Efectivo" : "Cash"} effect={report.activeAttribution.cash} isEs={isEs} />
                  <EffectRow label={isEs ? "Moneda" : "Currency"} effect={report.activeAttribution.currency} isEs={isEs} />
                  <EffectRow label={isEs ? "Comisiones y gastos" : "Fees and expenses"} effect={report.activeAttribution.feesAndExpenses} isEs={isEs} />
                  <EffectRow label={isEs ? "Residual" : "Residual"} effect={report.activeAttribution.residual} isEs={isEs} />
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 grid gap-5 border-t border-slate-800 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex items-start gap-3">
              <CircleDollarSign className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {isEs ? "Concentración: diagnóstico no aditivo" : "Concentration: non-additive diagnostic"}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {isEs ? "Peso sobre el límite" : "Weight above limit"}: {pct(report.concentration.totalExcessWeightPct, isEs)} · {isEs ? "Efecto contrafactual" : "Counterfactual effect"}: {pct(report.concentration.effectPct, isEs)}
                </p>
                {report.concentration.positionsAboveCap.length ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {report.concentration.positionsAboveCap.map((row) => `${row.ticker} ${pct(row.beginningWeightPct, isEs)}`).join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">{isEs ? "Evidencia pendiente" : "Evidence still needed"}</p>
              {report.dataQuality.missing.length ? (
                <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
                  {report.dataQuality.missing.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-emerald-300">{isEs ? "Ledger completo y reconciliado." : "Complete, reconciled ledger."}</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="py-8 text-center text-sm text-slate-500">
          {isEs
            ? "Corre Neuro para crear el snapshot determinista. El retorno completo aparecerá cuando exista un ledger fechado."
            : "Run Neuro to create the deterministic snapshot. Full-period return appears when a dated ledger is available."}
        </div>
      )}
    </section>
  );
}
