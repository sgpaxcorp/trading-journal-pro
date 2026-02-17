"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatSeconds(sec: number | null, isEs: boolean) {
  if (sec == null) return isEs ? "—" : "—";
  if (sec < 60) return `${sec}s`;
  const min = Math.round((sec / 60) * 10) / 10;
  return isEs ? `${min} min` : `${min} min`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-400/20 bg-slate-950/70 p-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/70">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-emerald-100">{value}</p>
    </div>
  );
}

type PanelProps = {
  wrapperClassName?: string;
  innerClassName?: string;
};

export default function OrderHistoryAuditPanel({
  wrapperClassName = "w-full px-6 py-6",
  innerClassName = "max-w-6xl mx-auto space-y-6",
}: PanelProps) {
  const { user, loading } = useAuth();
  const { activeAccountId } = useTradingAccounts();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [date, setDate] = useState(todayYMD());
  const [symbol, setSymbol] = useState("");
  const [instrumentKey, setInstrumentKey] = useState("");

  const [loadingAudit, setLoadingAudit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  useEffect(() => {
    setError(null);
  }, [date, symbol, instrumentKey]);

  async function runAudit() {
    if (!user || !activeAccountId) return;
    setLoadingAudit(true);
    setError(null);
    setResult(null);

    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError(L("Not authenticated.", "No autenticado."));
        return;
      }

      const params = new URLSearchParams();
      params.set("date", date);
      params.set("accountId", activeAccountId);
      if (instrumentKey.trim()) params.set("instrument_key", instrumentKey.trim());
      if (!instrumentKey.trim() && symbol.trim()) params.set("symbol", symbol.trim());

      const res = await fetch(`/api/broker-import/order-history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? L("Audit failed.", "Falló la auditoría."));
        return;
      }
      setResult(data);
    } catch (err: any) {
      setError(err?.message ?? L("Audit failed.", "Falló la auditoría."));
    } finally {
      setLoadingAudit(false);
    }
  }

  const metrics = result?.audit;
  const evidence = result?.audit?.evidence;
  const insights = result?.audit?.insights as string[] | undefined;
  const summary = result?.audit?.summary as string | undefined;
  const compliance = result?.plan_compliance as
    | {
        score: number | null;
        checklist: {
          total: number;
          completed: number;
          completion_pct: number | null;
          missing_items: string[];
        };
        rules: Array<{ label: string; status: "pass" | "fail" | "unknown"; reason: string }>;
        respected_plan: boolean | null;
        plan_present: boolean;
      }
    | undefined;
  const trades = result?.audit?.trades as Array<{
    index: number;
    entry_ts: string | null;
    exit_ts: string | null;
    entry_count: number;
    exit_count: number;
    entry_qty: number;
    exit_qty: number;
    stop_mod_count: number;
    time_to_first_stop_sec: number | null;
    oco_used: boolean;
    manual_market_exit: boolean;
    stop_market_filled: boolean;
    summary: string;
  }> | undefined;

  return (
    <div className={wrapperClassName}>
      <div className={innerClassName}>
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">
            {L("Order History Audit", "Auditoría de órdenes")}
          </p>
          <h1 className="text-2xl font-semibold text-slate-100">
            {L("Deterministic audit (no AI)", "Auditoría determinística (sin AI)")}
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl">
            {L(
              "Runs a rule-based audit on your broker order history events for a specific date and instrument.",
              "Ejecuta una auditoría basada en reglas sobre tu historial de órdenes para una fecha e instrumento."
            )}
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs text-slate-400">
                {L("Date", "Fecha")}
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                />
              </label>

              <label className="text-xs text-slate-400">
                {L("Symbol (optional)", "Símbolo (opcional)")}
                <input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder={L("e.g. SPX", "ej. SPX")}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                />
              </label>

              <label className="text-xs text-slate-400">
                {L("Instrument key (optional)", "Clave de instrumento (opcional)")}
                <input
                  value={instrumentKey}
                  onChange={(e) => setInstrumentKey(e.target.value)}
                  placeholder={L("SPX|2026-02-13|C|7000", "SPX|2026-02-13|C|7000")}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                />
              </label>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={runAudit}
                disabled={loading || !user || !activeAccountId || loadingAudit}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {loadingAudit ? L("Running…", "Analizando…") : L("Run audit", "Ejecutar auditoría")}
              </button>

              {!activeAccountId && (
                <span className="text-xs text-amber-300">
                  {L("Select an active account first.", "Selecciona una cuenta activa primero.")}
                </span>
              )}
            </div>

            {error && (
              <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                {error}
              </div>
            )}

            {result && (
              <div className="text-xs text-slate-400">
                {L("Events found:", "Eventos encontrados:")} {result?.events?.length ?? 0}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
              {L("Audit metrics", "Métricas de auditoría")}
            </p>
            {!metrics ? (
              <p className="mt-4 text-sm text-slate-400">
                {L("Run the audit to see metrics.", "Ejecuta la auditoría para ver métricas.")}
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                <MetricCard label={L("OCO used", "OCO usado")} value={metrics.oco_used ? "Yes" : "No"} />
                <MetricCard label={L("Stop present", "Stop presente")} value={metrics.stop_present ? "Yes" : "No"} />
                <MetricCard label={L("Stop changes", "Cambios de stop")} value={String(metrics.stop_mod_count ?? 0)} />
                <MetricCard label={L("Cancel count", "Cancelaciones")} value={String(metrics.cancel_count ?? 0)} />
                <MetricCard label={L("Replace count", "Reemplazos")} value={String(metrics.replace_count ?? 0)} />
                <MetricCard
                  label={L("Manual market exit", "Salida a mercado manual")}
                  value={metrics.manual_market_exit ? "Yes" : "No"}
                />
                <MetricCard
                  label={L("Stop market filled", "Stop ejecutado")}
                  value={metrics.stop_market_filled ? "Yes" : "No"}
                />
                <MetricCard
                  label={L("Time to first stop", "Tiempo al primer stop")}
                  value={formatSeconds(metrics.time_to_first_stop_sec ?? null, isEs)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
            {L("Trade sequence", "Secuencia de trades")}
          </p>
          {!metrics ? (
            <p className="mt-3 text-sm text-slate-400">
              {L("Run the audit to see trade sequencing.", "Ejecuta la auditoría para ver la secuencia.")}
            </p>
          ) : trades && trades.length ? (
            <div className="mt-3 grid gap-3">
              {trades.map((t) => (
                <div key={t.index} className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-100">
                      {L("Trade", "Trade")} {t.index}
                    </p>
                    <div className="text-[11px] text-slate-400">
                      {t.entry_ts ?? "—"} → {t.exit_ts ?? "—"}
                    </div>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-3 text-xs text-slate-200">
                    <div>{L("Entries", "Entradas")}: {t.entry_count} ({t.entry_qty})</div>
                    <div>{L("Exits", "Salidas")}: {t.exit_count} ({t.exit_qty})</div>
                    <div>{L("Stop mods", "Stops mod.")}: {t.stop_mod_count}</div>
                    <div>{L("Time to stop", "Tiempo al stop")}: {formatSeconds(t.time_to_first_stop_sec ?? null, isEs)}</div>
                    <div>{L("OCO", "OCO")}: {t.oco_used ? "Yes" : "No"}</div>
                    <div>{L("Manual MKT exit", "Salida MKT manual")}: {t.manual_market_exit ? "Yes" : "No"}</div>
                    <div>{L("Stop MKT filled", "Stop ejecutado")}: {t.stop_market_filled ? "Yes" : "No"}</div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">{t.summary}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-400">
              {L("No trades detected in this audit.", "No se detectaron trades en esta auditoría.")}
            </p>
          )}
        </div>

        <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
            {L("Process compliance", "Cumplimiento de proceso")}
          </p>
          {!compliance ? (
            <p className="mt-3 text-sm text-slate-400">
              {L("Run the audit to see compliance.", "Ejecuta la auditoría para ver cumplimiento.")}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <MetricCard
                  label={L("Compliance score", "Score de cumplimiento")}
                  value={compliance.score != null ? `${compliance.score}%` : "—"}
                />
                <MetricCard
                  label={L("Checklist completion", "Checklist completado")}
                  value={
                    compliance.checklist.total > 0
                      ? `${compliance.checklist.completed}/${compliance.checklist.total} (${compliance.checklist.completion_pct ?? 0}%)`
                      : "—"
                  }
                />
                <MetricCard
                  label={L("Plan confirmed", "Plan confirmado")}
                  value={
                    compliance.respected_plan == null
                      ? L("Unknown", "Desconocido")
                      : compliance.respected_plan
                      ? L("Yes", "Sí")
                      : L("No", "No")
                  }
                />
              </div>

              {compliance.checklist.missing_items?.length ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
                    {L("Missing checklist items", "Checklist pendiente")}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-200">
                    {compliance.checklist.missing_items.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-300">
                  {L("Non‑negotiable rules", "Reglas no negociables")}
                </p>
                {compliance.rules?.length ? (
                  <ul className="mt-2 space-y-2 text-sm">
                    {compliance.rules.map((rule, idx) => {
                      const color =
                        rule.status === "pass"
                          ? "text-emerald-300"
                          : rule.status === "fail"
                          ? "text-rose-300"
                          : "text-slate-300";
                      return (
                        <li key={idx} className="flex flex-col gap-1">
                          <span className={color}>
                            {rule.status === "pass"
                              ? L("PASS", "CUMPLE")
                              : rule.status === "fail"
                              ? L("FAIL", "FALLA")
                              : L("UNKNOWN", "DESCONOCIDO")}{" "}
                            · {rule.label}
                          </span>
                          <span className="text-xs text-slate-400">{rule.reason}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">
                    {L("No active rules found in Growth Plan.", "No hay reglas activas en el Growth Plan.")}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
              {L("Summary", "Resumen")}
            </p>
            {!metrics ? (
              <p className="mt-3 text-sm text-slate-400">
                {L("Run the audit to see a summary.", "Ejecuta la auditoría para ver el resumen.")}
              </p>
            ) : (
              <p className="mt-3 text-sm text-slate-200">
                {summary || L("No summary available.", "Resumen no disponible.")}
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
              {L("Insights (deterministic)", "Insights (determinísticos)")}
            </p>
            {!metrics ? (
              <p className="mt-3 text-sm text-slate-400">
                {L("Run the audit to see insights.", "Ejecuta la auditoría para ver insights.")}
              </p>
            ) : insights && insights.length ? (
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                {insights.map((item, idx) => (
                  <li key={idx} className="rounded-xl border border-slate-800/70 bg-slate-950/60 px-3 py-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                {L("No insights available.", "Sin insights disponibles.")}
              </p>
            )}
          </div>
        </div>

        {evidence && (
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                {L("Stop events", "Eventos de stop")}
              </p>
              <div className="mt-3 space-y-2 text-xs text-slate-200 max-h-64 overflow-y-auto">
                {evidence.stop_events?.length ? (
                  evidence.stop_events.map((s: any, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-800/80 bg-slate-950/80 px-2 py-2"
                    >
                      <div>{s.ts_utc}</div>
                      <div>
                        {L("Stop", "Stop")}: {s.stop_price ?? "—"}
                      </div>
                      <div>
                        {L("OCO", "OCO")}: {s.oco_id ?? "—"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500">{L("None", "Ninguno")}</div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                {L("Cancel events", "Cancelaciones")}
              </p>
              <div className="mt-3 space-y-2 text-xs text-slate-200 max-h-64 overflow-y-auto">
                {evidence.cancel_events?.length ? (
                  evidence.cancel_events.map((c: any, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-800/80 bg-slate-950/80 px-2 py-2"
                    >
                      <div>{c.ts_utc}</div>
                      <div>
                        {L("Status", "Estado")}: {c.status ?? "—"}
                      </div>
                      <div>
                        {L("Replace", "Reemplazo")}: {c.replace_id ?? "—"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500">{L("None", "Ninguno")}</div>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                {L("Fill events", "Ejecuciones")}
              </p>
              <div className="mt-3 space-y-2 text-xs text-slate-200 max-h-64 overflow-y-auto">
                {evidence.fills?.length ? (
                  evidence.fills.map((f: any, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-800/80 bg-slate-950/80 px-2 py-2"
                    >
                      <div>{f.ts_utc}</div>
                      <div>
                        {L("Side", "Lado")}: {f.side ?? "—"} / {f.pos_effect ?? "—"}
                      </div>
                      <div>
                        {L("Order", "Orden")}: {f.order_type ?? "—"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500">{L("None", "Ninguno")}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
