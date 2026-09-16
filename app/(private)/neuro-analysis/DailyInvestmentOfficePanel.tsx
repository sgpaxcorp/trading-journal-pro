"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileSearch,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Undo2,
} from "lucide-react";

import type {
  DailyInvestmentAttentionReview,
  DailyInvestmentOfficeAlert,
  DailyInvestmentOfficeBriefingRecord,
} from "@/lib/neuroDailyInvestmentOffice";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type ApiPayload = {
  latest: DailyInvestmentOfficeBriefingRecord | null;
  history: DailyInvestmentOfficeBriefingRecord[];
  attentionReviews: DailyInvestmentAttentionReview[];
  generationJob: {
    id: string;
    status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
    error?: string | null;
  } | null;
  marketDate: string;
};

type Filter = "all" | "attention" | "filings" | "portfolio";

const CATEGORY_LABELS: Record<
  DailyInvestmentOfficeAlert["category"],
  { en: string; es: string }
> = {
  sec_filing: { en: "SEC filing", es: "Filing SEC" },
  earnings_release: { en: "Earnings", es: "Resultados" },
  guidance_change: { en: "Guidance", es: "Guidance" },
  corporate_event: { en: "Corporate event", es: "Evento corporativo" },
  industry_development: { en: "Industry", es: "Industria" },
  fundamental_change: { en: "Fundamentals", es: "Fundamentales" },
  concentration_change: { en: "Concentration", es: "Concentración" },
  upcoming_earnings: { en: "Upcoming earnings", es: "Próximos resultados" },
  coverage_gap: { en: "Coverage gap", es: "Falta de cobertura" },
};

function materialityTone(materiality: DailyInvestmentOfficeAlert["materiality"]) {
  if (materiality === "critical") return "border-rose-400/60 bg-rose-400/10 text-rose-100";
  if (materiality === "high") return "border-amber-400/60 bg-amber-400/10 text-amber-100";
  if (materiality === "medium") return "border-cyan-400/50 bg-cyan-400/10 text-cyan-100";
  return "border-slate-700 bg-slate-950/40 text-slate-300";
}

function reviewTone(review: DailyInvestmentOfficeAlert["humanReview"]) {
  if (review === "REQUIRED") return "text-rose-200";
  if (review === "RECOMMENDED") return "text-amber-200";
  return "text-slate-400";
}

async function authedFetch(path: string, init?: RequestInit) {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Authentication session is unavailable.");
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(path, { ...init, headers, cache: "no-store" });
}

export default function DailyInvestmentOfficePanel({ isEs }: { isEs: boolean }) {
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingAlertId, setSavingAlertId] = useState("");
  const [error, setError] = useState("");

  const L = useCallback((en: string, es: string) => (isEs ? es : en), [isEs]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await authedFetch("/api/neuro-analysis/daily-office");
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Could not load the Daily Investment Office.");
      setPayload(json as ApiPayload);
      const jobActive = ["queued", "running"].includes(String(json?.generationJob?.status ?? ""));
      setSelectedId((current) => (!current || !jobActive ? String(json?.latest?.id ?? current) : current));
      setGenerating(jobActive);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Daily Investment Office is unavailable.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!generating) return;
    const timer = window.setInterval(() => void load(true), 3_000);
    return () => window.clearInterval(timer);
  }, [generating, load]);

  const selected = useMemo(
    () => payload?.history.find((briefing) => briefing.id === selectedId) ?? payload?.latest ?? null,
    [payload, selectedId]
  );
  const reviews = useMemo(
    () => new Map((payload?.attentionReviews ?? []).map((review) => [review.alert_id, review])),
    [payload?.attentionReviews]
  );
  const generationError =
    payload?.generationJob?.status === "failed"
      ? payload.generationJob.error || L("The latest briefing job failed.", "Falló el último job del briefing.")
      : "";
  const alerts = useMemo(() => {
    const rows = selected?.briefing?.alerts ?? [];
    if (filter === "attention") return rows.filter((alert) => alert.humanReview !== "NOT_NOW");
    if (filter === "filings") {
      return rows.filter((alert) =>
        ["sec_filing", "earnings_release", "guidance_change", "corporate_event", "upcoming_earnings"].includes(
          alert.category
        )
      );
    }
    if (filter === "portfolio") {
      return rows.filter((alert) => ["concentration_change", "fundamental_change", "coverage_gap"].includes(alert.category));
    }
    return rows;
  }, [filter, selected]);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const response = await authedFetch("/api/neuro-analysis/daily-office", {
        method: "POST",
        body: JSON.stringify({ action: "generate" }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Could not queue the briefing.");
      await load(true);
    } catch (generateError) {
      setGenerating(false);
      setError(generateError instanceof Error ? generateError.message : "Could not queue the briefing.");
    }
  }

  async function updateTriage(alertId: string, status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED") {
    if (!selected) return;
    setSavingAlertId(alertId);
    setError("");
    try {
      const response = await authedFetch("/api/neuro-analysis/daily-office", {
        method: "POST",
        body: JSON.stringify({
          action: "triage",
          briefingId: selected.id,
          alertId,
          status,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Could not update human review status.");
      setPayload((current) => {
        if (!current) return current;
        const remaining = current.attentionReviews.filter((review) => review.alert_id !== alertId);
        return { ...current, attentionReviews: [...remaining, json.review] };
      });
    } catch (triageError) {
      setError(triageError instanceof Error ? triageError.message : "Could not update review status.");
    } finally {
      setSavingAlertId("");
    }
  }

  if (loading) {
    return (
      <section className="min-h-[320px] border-y border-slate-800 bg-slate-900/55 px-4 py-12 sm:px-6">
        <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {L("Loading the investment office...", "Cargando la oficina de inversiones...")}
        </div>
      </section>
    );
  }

  const briefing = selected?.briefing;
  const selectedIsLatest = Boolean(selected && selected.id === payload?.latest?.id);
  const requiredCount = briefing?.alerts.filter((alert) => alert.humanReview === "REQUIRED").length ?? 0;
  const filingCount = briefing?.alerts.filter((alert) => alert.source.sourceType === "sec_filing").length ?? 0;
  const unresolvedCount = briefing?.alerts.filter((alert) => {
    if (alert.humanReview === "NOT_NOW") return false;
    return reviews.get(alert.id)?.status !== "RESOLVED";
  }).length ?? 0;
  const summaryMetrics: Array<{
    label: string;
    value: string | number;
    Icon: typeof CalendarClock;
  }> = [
    { label: L("Briefing date", "Fecha"), value: briefing?.briefingDate ?? "-", Icon: CalendarClock },
    { label: L("Tracked", "Monitoreados"), value: briefing?.trackedTickers.length ?? 0, Icon: FileSearch },
    { label: L("Human review", "Revisión humana"), value: requiredCount, Icon: AlertTriangle },
    { label: L("Open attention", "Atención abierta"), value: unresolvedCount, Icon: Clock3 },
    { label: L("New SEC filings", "Filings SEC nuevos"), value: filingCount, Icon: ShieldCheck },
  ];

  return (
    <section className="border-y border-slate-800 bg-slate-900/55">
      <header className="border-b border-slate-800 px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-4 w-4 text-emerald-300" />
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                {L("Daily Investment Office", "Oficina Diaria de Inversiones")}
              </p>
              <span className="border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-400">
                {L("THESIS-RELATIVE", "RELATIVO A TESIS")}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-semibold text-slate-50">
              {briefing
                ? isEs
                  ? briefing.title.es
                  : briefing.title.en
                : L("No market-day briefing yet", "Aún no hay briefing del día de mercado")}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
              {briefing
                ? isEs
                  ? briefing.executiveSummary.es
                  : briefing.executiveSummary.en
                : L(
                    "The office will monitor existing holdings against their original frozen theses.",
                    "La oficina monitoreará las posiciones existentes contra sus tesis originales congeladas."
                  )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {payload?.history?.length ? (
              <select
                value={selected?.id ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
                aria-label={L("Briefing history", "Historial de briefings")}
                className="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs font-semibold text-slate-200 outline-none focus:border-emerald-400"
              >
                {payload.history.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.briefing_date} · v{record.version}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => void generate()}
              disabled={generating}
              title={L("Generate today's briefing", "Generar el briefing de hoy")}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-50"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {generating ? L("Generating", "Generando") : L("Refresh briefing", "Actualizar briefing")}
            </button>
          </div>
        </div>
        {error || generationError ? <p className="mt-3 text-sm text-rose-300">{error || generationError}</p> : null}
      </header>

      <div className="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
          <div>
            <p className="text-[10px] font-bold uppercase text-cyan-300">
              {L("Decision standard", "Estándar de decisión")}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {L(
                "Evidence before action. This briefing prioritizes human review and never predicts price or authorizes a trade.",
                "Evidencia antes que acción. Este briefing prioriza revisión humana y nunca predice precio ni autoriza un trade."
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[9px] font-bold uppercase text-slate-400">
          <span className="border border-slate-700 px-2 py-1">{L("Do nothing", "No hacer nada")}</span>
          <span className="border border-cyan-500/30 px-2 py-1 text-cyan-200">{L("Keep cash", "Mantener efectivo")}</span>
          <span className="border border-amber-500/30 px-2 py-1 text-amber-200">{L("Need more information", "Necesita más información")}</span>
          <span className="border border-violet-500/30 px-2 py-1 text-violet-200">{L("Thesis uncertain", "Tesis incierta")}</span>
        </div>
      </div>

      {briefing ? (
        <>
          <div className="grid grid-cols-2 border-b border-slate-800 lg:grid-cols-5">
            {summaryMetrics.map(({ label, value, Icon }, index) => {
              return (
                <div
                  key={String(label)}
                  className={`min-w-0 px-4 py-3 ${index < 4 ? "border-r border-slate-800" : ""} ${index >= 2 ? "border-t border-slate-800 lg:border-t-0" : ""}`}
                >
                  <div className="flex items-center gap-2 text-slate-500">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <p className="truncate text-[10px] font-semibold uppercase">{label}</p>
                  </div>
                  <p className="mt-1 text-lg font-bold text-slate-100">{value}</p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-800 px-4 py-3 sm:px-6">
            {([
              ["all", L("All", "Todo")],
              ["attention", L("Needs attention", "Requiere atención")],
              ["filings", L("Filings & events", "Filings y eventos")],
              ["portfolio", L("Portfolio & fundamentals", "Cartera y fundamentales")],
            ] as Array<[Filter, string]>).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold ${
                  filter === id
                    ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-100"
                    : "border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="divide-y divide-slate-800">
            {alerts.map((alert) => {
              const review = reviews.get(alert.id);
              const reviewStatus = review?.status ?? "OPEN";
              const busy = savingAlertId === alert.id;
              return (
                <article key={alert.id} className="grid gap-4 px-4 py-5 sm:px-6 xl:grid-cols-[190px_minmax(0,1fr)_190px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-slate-50">{alert.ticker}</span>
                      <span className={`border px-2 py-1 text-[10px] font-bold uppercase ${materialityTone(alert.materiality)}`}>
                        {L(alert.materiality, alert.materiality === "monitor" ? "monitorear" : alert.materiality)}
                      </span>
                    </div>
                    <p className="mt-2 text-[10px] font-semibold uppercase text-cyan-300">
                      {isEs ? CATEGORY_LABELS[alert.category].es : CATEGORY_LABELS[alert.category].en}
                    </p>
                    <p className={`mt-3 text-[11px] font-bold uppercase ${reviewTone(alert.humanReview)}`}>
                      {L(
                        "Does human review appear necessary?",
                        "¿Parece necesaria la revisión humana?"
                      )}: {alert.humanReview}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {selectedIsLatest
                        ? `${L("Workflow", "Flujo")}: ${reviewStatus}`
                        : L("Historical snapshot", "Snapshot histórico")}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-100">
                      {isEs ? alert.headline.es : alert.headline.en}
                    </h3>
                    <dl className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                          {L("What changed?", "¿Qué cambió?")}
                        </dt>
                        <dd className="mt-1 text-sm leading-6 text-slate-200">
                          {isEs ? alert.whatChanged.es : alert.whatChanged.en}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                          {L("Why could it matter?", "¿Por qué podría importar?")}
                        </dt>
                        <dd className="mt-1 text-sm leading-6 text-slate-300">
                          {isEs ? alert.whyItMatters.es : alert.whyItMatters.en}
                        </dd>
                      </div>
                      <div className="lg:col-span-2 border-l-2 border-violet-400/40 pl-3">
                        <dt className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-300">
                          {L("Original thesis assumption affected", "Premisa afectada de la tesis original")}
                        </dt>
                        <dd className="mt-1 text-sm leading-6 text-slate-300">
                          {alert.affectedThesisAssumption}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex flex-col gap-3 xl:border-l xl:border-slate-800 xl:pl-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-500">
                        {L("Confirming source", "Fuente confirmatoria")}
                      </p>
                      {alert.source.url ? (
                        <a
                          href={alert.source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-start gap-1 text-xs font-semibold leading-5 text-cyan-300 hover:text-cyan-200"
                        >
                          <span>{alert.source.title}</span>
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                        </a>
                      ) : (
                        <p className="mt-1 text-xs leading-5 text-slate-300">{alert.source.title}</p>
                      )}
                      <p className="mt-1 text-[10px] text-slate-500">{alert.source.publicationDate}</p>
                    </div>
                    {selectedIsLatest ? <div className="mt-auto flex flex-wrap gap-2">
                      {reviewStatus === "OPEN" ? (
                        <button
                          type="button"
                          onClick={() => void updateTriage(alert.id, "ACKNOWLEDGED")}
                          disabled={busy}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-400/40 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          {L("Acknowledge", "Reconocer")}
                        </button>
                      ) : null}
                      {reviewStatus !== "RESOLVED" ? (
                        <button
                          type="button"
                          onClick={() => void updateTriage(alert.id, "RESOLVED")}
                          disabled={busy}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {L("Resolve", "Resolver")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void updateTriage(alert.id, "OPEN")}
                          disabled={busy}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 disabled:opacity-50"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                          {L("Reopen", "Reabrir")}
                        </button>
                      )}
                    </div> : null}
                  </div>
                </article>
              );
            })}
            {!alerts.length ? (
              <div className="px-4 py-12 text-center sm:px-6">
                <ShieldCheck className="mx-auto h-6 w-6 text-emerald-300" />
                <p className="mt-3 text-sm font-semibold text-slate-200">
                  {L("No material items in this view", "No hay asuntos materiales en esta vista")}
                </p>
              </div>
            ) : null}
          </div>

          {briefing.dataGaps.length ? (
            <div className="border-t border-amber-400/25 bg-amber-400/5 px-4 py-4 sm:px-6">
              <div className="flex items-center gap-2 text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                <p className="text-xs font-bold uppercase">{L("Evidence gaps", "Faltas de evidencia")}</p>
              </div>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100/80">
                {briefing.dataGaps.map((gap, index) => (
                  <li key={`${gap.en}-${index}`}>• {isEs ? gap.es : gap.en}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <div className="px-4 py-14 text-center sm:px-6">
          <CalendarClock className="mx-auto h-7 w-7 text-emerald-300" />
          <p className="mt-3 text-sm font-semibold text-slate-200">
            {L("The next briefing will preserve only thesis-relevant developments.", "El próximo briefing conservará solo desarrollos relevantes a la tesis.")}
          </p>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={generating}
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {L("Generate today's briefing", "Generar briefing de hoy")}
          </button>
        </div>
      )}
    </section>
  );
}
