"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { useUserPlan } from "@/hooks/useUserPlan";
import {
  AlertEvent,
  AlertChannel,
  AlertRule,
  AlertSeverity,
  channelsLabel,
  createAlertRule,
  dismissAlertEvent,
  fireTestEventFromRule,
  isCoreRuleLike,
  isEventActive,
  isEventSnoozed,
  listAlertEvents,
  listAlertRules,
  snoozeAlertEvent,
  updateAlertRule,
} from "@/lib/alertsSupabase";
import TopNav from "@/app/components/TopNav";

type Tab = "active" | "rules" | "history";

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return "—";
  const locale =
    typeof document !== "undefined"
      ? document.documentElement.lang || undefined
      : undefined;
  return new Date(t).toLocaleString(locale);
}

function SeverityPill({ severity }: { severity: AlertSeverity }) {
  const label = severity.toUpperCase();
  const cls =
    severity === "critical"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
      : severity === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : severity === "success"
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-sky-500/40 bg-sky-500/10 text-sky-200";
  return (
    <span className={["inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.2em]", cls].join(" ")}>
      {label}
    </span>
  );
}

function isCoreRule(rule: AlertRule) {
  return isCoreRuleLike({
    key: rule.key ?? null,
    trigger_type: rule.trigger_type ?? null,
    config: (rule.config ?? rule.meta) as Record<string, unknown>,
  });
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

export default function RemindersConsolePage() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id || "";
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const { plan } = useUserPlan();
  const planKey = plan === "advanced" ? "advanced" : "core";
  const customLimit = planKey === "advanced" ? 10 : 2;

  const [tab, setTab] = useState<Tab>("active");
  const [busy, setBusy] = useState(false);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [flash, setFlash] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | AlertSeverity>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newTrigger, setNewTrigger] = useState("DAILY_GOAL");
  const [newSeverity, setNewSeverity] = useState<AlertSeverity>("info");
  const [newThreshold, setNewThreshold] = useState("");
  const [newChannels, setNewChannels] = useState({ popup: true, inapp: true, voice: true });

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const activeEvents = useMemo(() => events.filter((e) => e.kind === "reminder" && isEventActive(e)), [events]);
  const snoozedEvents = useMemo(
    () => events.filter((e) => e.kind === "reminder" && !isEventActive(e) && isEventSnoozed(e)),
    [events]
  );
  const historyEvents = useMemo(
    () => events.filter((e) => e.kind === "reminder" && e.dismissed && !isEventSnoozed(e)),
    [events]
  );

  const customRulesCount = useMemo(() => rules.filter((r) => !isCoreRule(r)).length, [rules]);
  const remainingCustom = Math.max(0, customLimit - customRulesCount);

  const reminderTriggerOptions = [
    {
      value: "DAILY_GOAL",
      label: L("Daily goal achieved", "Meta diaria alcanzada"),
      thresholdLabel: L("Daily goal ($)", "Meta diaria ($)"),
      thresholdKey: "daily_goal",
    },
    {
      value: "MAX_GAIN",
      label: L("Max daily gain", "Ganancia diaria máxima"),
      thresholdLabel: L("Profit cap ($)", "Límite de ganancia ($)"),
      thresholdKey: "max_gain",
    },
  ];

  const selectedTrigger = reminderTriggerOptions.find((t) => t.value === newTrigger) ?? reminderTriggerOptions[0];

  const filteredActiveEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeEvents.filter((e) => {
      if (severityFilter !== "all" && e.severity !== severityFilter) return false;
      if (!q) return true;
      return (
        String(e.title ?? "").toLowerCase().includes(q) ||
        String(e.message ?? "").toLowerCase().includes(q) ||
        String(e.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [activeEvents, query, severityFilter]);

  async function refreshAll() {
    if (!userId) return;
    setBusy(true);
    try {
      const [rulesRes, eventsRes] = await Promise.all([
        listAlertRules(userId, { kind: "reminder", includeDisabled: true, limit: 200 }),
        listAlertEvents(userId, { kind: "reminder", includeDismissed: true, limit: 500 }),
      ]);

      if (!rulesRes.ok) {
        setFlash({ type: "error", msg: rulesRes.error || L("Failed to load rules", "No se pudieron cargar las reglas") });
      }
      if (!eventsRes.ok) {
        setFlash({ type: "error", msg: eventsRes.error || L("Failed to load events", "No se pudieron cargar los eventos") });
      }

      setRules(rulesRes.ok ? rulesRes.data.rules : []);
      setEvents(eventsRes.ok ? eventsRes.data.events : []);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function onTestRule(ruleId: string) {
    if (!userId) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await fireTestEventFromRule(userId, ruleId);
      if (!res.ok) {
        setFlash({ type: "error", msg: res.error || L("Test failed", "La prueba falló") });
        return;
      }
      setFlash({
        type: "success",
        msg: L(
          "Test reminder fired. You should see a popup within a few seconds.",
          "Recordatorio de prueba enviado. Deberías ver un pop‑up en unos segundos."
        ),
      });
      await refreshAll();
      if (res.data.eventId) {
        setSelectedEventId(res.data.eventId);
        setTab("active");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSnooze(eventId: string, minutes: number) {
    if (!userId) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await snoozeAlertEvent(userId, eventId, minutes);
      if (!res.ok) setFlash({ type: "error", msg: res.error || L("Snooze failed", "No se pudo posponer") });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function onDismiss(eventId: string) {
    if (!userId) return;
    setBusy(true);
    setFlash(null);
    try {
      const res = await dismissAlertEvent(userId, eventId);
      if (!res.ok) setFlash({ type: "error", msg: res.error || L("Dismiss failed", "No se pudo descartar") });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function onTogglePopup(rule: AlertRule) {
    if (!userId) return;
    setBusy(true);
    setFlash(null);
    try {
      const current: AlertChannel[] = Array.isArray(rule.channels) && rule.channels.length > 0 ? rule.channels : ["inapp"];
      const hasPopup = current.includes("popup");
      let next: AlertChannel[] = hasPopup
        ? current.filter((c) => c !== "popup")
        : Array.from(new Set<AlertChannel>([...current, "popup"]));
      if (next.length === 0) next = ["inapp"];

      const res = await updateAlertRule(userId, rule.id, { channels: next });
      if (!res.ok) {
        setFlash({ type: "error", msg: res.error || L("Failed to update channels", "No se pudieron actualizar los canales") });
      }
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function onCreateRule(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (!newTitle.trim()) {
      setFlash({ type: "error", msg: L("Title is required.", "El título es obligatorio.") });
      return;
    }
    if (remainingCustom <= 0) {
      setFlash({
        type: "error",
        msg: L(
          `Limit reached. Your ${planKey === "advanced" ? "Advanced" : "Core"} plan allows up to ${customLimit} custom reminders.`,
          `Límite alcanzado. Tu plan ${planKey === "advanced" ? "Advanced" : "Core"} permite hasta ${customLimit} recordatorios personalizados.`
        ),
      });
      return;
    }

    const channels: AlertChannel[] = [];
    if (newChannels.popup) channels.push("popup");
    if (newChannels.inapp) channels.push("inapp");
    if (newChannels.voice) channels.push("voice");
    if (channels.length === 0) {
      setFlash({ type: "error", msg: L("Select at least one channel.", "Selecciona al menos un canal.") });
      return;
    }

    const config: Record<string, unknown> = { source: "user" };
    const thresholdRaw = Number(newThreshold);
    const threshold = Number.isFinite(thresholdRaw) ? Math.abs(thresholdRaw) : null;

    if (newTrigger === "DAILY_GOAL" && threshold != null) config.daily_goal = threshold;
    if (newTrigger === "MAX_GAIN" && threshold != null) config.max_gain = threshold;

    setBusy(true);
    setFlash(null);
    try {
      const res = await createAlertRule(userId, {
        title: newTitle.trim(),
        message: newMessage.trim(),
        trigger_type: newTrigger,
        severity: newSeverity,
        enabled: true,
        channels,
        kind: "reminder",
        config,
      });

      if (!res.ok) {
        setFlash({ type: "error", msg: res.error || L("Failed to create rule.", "No se pudo crear la regla.") });
        return;
      }

      setFlash({ type: "success", msg: L("Custom reminder created.", "Recordatorio personalizado creado.") });
      setNewTitle("");
      setNewMessage("");
      setNewThreshold("");
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.32em] text-emerald-400">
            {L("Rules & Alarms • Reminders", "Reglas y alarmas • Recordatorios")}
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-100">
            {L("Reminders & pop-ups", "Recordatorios y pop‑ups")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            {L(
              "Behavioral reminders that trigger pop-ups and in-app alerts. Designed to enforce stop rules and protect decision quality.",
              "Recordatorios conductuales que disparan pop‑ups y alertas in‑app. Diseñados para reforzar reglas y proteger la calidad de decisión."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-200"
          >
            <ArrowLeft className="h-4 w-4" />
            {L("Back to dashboard", "Volver al dashboard")}
          </button>
          <button
            className="rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-500/60 hover:bg-emerald-500/10"
            onClick={() => window.dispatchEvent(new Event("ntj_alert_engine_run_now"))}
            disabled={!userId || busy}
            title={L("Force the alert engine to evaluate rules now", "Forzar el motor para evaluar reglas ahora")}
          >
            {L("Run checks now", "Ejecutar checks ahora")}
          </button>
          <button
            className="rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-500/60 hover:bg-emerald-500/10"
            onClick={refreshAll}
            disabled={!userId || busy}
          >
            {L("Refresh", "Actualizar")}
          </button>
        </div>
      </div>

        {flash && (
          <div
          className={[
            "mt-5 rounded-xl border px-3 py-2 text-sm",
            flash.type === "success"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-200"
              : flash.type === "error"
                ? "border-rose-800 bg-rose-950/40 text-rose-200"
                : "border-slate-700 bg-slate-900/40 text-slate-200",
          ].join(" ")}
        >
          {flash.msg}
        </div>
      )}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
        <KpiCard label={L("Active reminders", "Recordatorios activos")} value={String(activeEvents.length)} sub={L("Currently firing", "Disparándose ahora")} />
        <KpiCard label={L("Snoozed", "Pospuestos")} value={String(snoozedEvents.length)} sub={L("Hidden temporarily", "Ocultos temporalmente")} />
        <KpiCard label={L("Rules enabled", "Reglas activas")} value={String(rules.filter((r) => r.enabled).length)} sub={L("Reminder rules", "Reglas de recordatorio")} />
      </div>

        <div className="mt-6 flex flex-wrap gap-2">
        {[
          ["active", L(`Active (${activeEvents.length})`, `Activos (${activeEvents.length})`)],
          ["rules", L(`Rules (${rules.length})`, `Reglas (${rules.length})`)],
          ["history", L(`History (${historyEvents.length})`, `Historial (${historyEvents.length})`)],
        ].map(([k, label]) => (
          <button
            key={k}
            className={[
              "rounded-full border px-4 py-1 text-xs font-semibold",
              tab === (k as Tab)
                ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200"
                : "border-slate-700 bg-slate-900/30 text-slate-300 hover:border-emerald-400/60",
            ].join(" ")}
            onClick={() => setTab(k as Tab)}
          >
            {label}
          </button>
        ))}
      </div>

        {tab === "active" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Active reminders", "Recordatorios activos")}</div>
                <p className="mt-2 text-sm text-slate-400">{L("Click a reminder to see details and actions.", "Haz clic en un recordatorio para ver detalles y acciones.")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={L("Search reminders...", "Buscar recordatorios...")}
                    className="w-48 rounded-xl border border-slate-700 bg-slate-950/40 pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-400"
                  />
                </div>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as any)}
                  className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 focus:border-emerald-400"
                >
                  <option value="all">{L("All severities", "Todas las severidades")}</option>
                  <option value="info">{L("Info", "Info")}</option>
                  <option value="success">{L("Success", "Éxito")}</option>
                  <option value="warning">{L("Warning", "Advertencia")}</option>
                  <option value="critical">{L("Critical", "Crítica")}</option>
                </select>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {filteredActiveEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
                  {L("No reminders match your filters.", "No hay recordatorios que coincidan con tus filtros.")}
                </div>
              ) : (
                filteredActiveEvents.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setSelectedEventId(e.id)}
                    className={[
                      "w-full rounded-xl border p-4 text-left transition",
                      selectedEventId === e.id
                        ? "border-emerald-400/50 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-950/30 hover:border-slate-600",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <SeverityPill severity={e.severity} />
                        <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("reminder", "recordatorio")}</span>
                      </div>
                      <div className="text-xs text-slate-400">{fmtDate(e.triggered_at)}</div>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-100">{e.title || L("Reminder", "Recordatorio")}</div>
                    <div className="mt-1 text-xs text-slate-400 line-clamp-2">{e.message || "—"}</div>
                  </button>
                ))
              )}
            </div>
          </section>

          <div className="grid gap-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Reminder detail", "Detalle del recordatorio")}</div>
                  <p className="mt-2 text-sm text-slate-400">{L("Review the reminder and take action.", "Revisa el recordatorio y toma acción.")}</p>
                </div>
                {selectedEvent ? <SeverityPill severity={selectedEvent.severity} /> : null}
              </div>

              {!selectedEvent ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
                  {L("Select a reminder from the left to inspect details and actions.", "Selecciona un recordatorio a la izquierda para ver detalles y acciones.")}
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="text-xl font-semibold text-slate-100">{selectedEvent.title}</div>
                    <div className="mt-2 text-sm text-slate-300">{selectedEvent.message}</div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Created", "Creado")}</div>
                      <div className="mt-1 text-sm text-slate-200">{fmtDate(selectedEvent.triggered_at)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Category", "Categoría")}</div>
                      <div className="mt-1 text-sm text-slate-200">{selectedEvent.category || L("reminder", "recordatorio")}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                      onClick={() => onSnooze(selectedEvent.id, 60)}
                      disabled={busy}
                    >
                      {L("Snooze 1h", "Posponer 1h")}
                    </button>
                    <button
                      className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-rose-400/60 hover:bg-rose-500/10"
                      onClick={() => onDismiss(selectedEvent.id)}
                      disabled={busy}
                    >
                      {L("Dismiss", "Descartar")}
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Quick controls", "Controles rápidos")}</div>
              <p className="mt-2 text-sm text-slate-400">{L("Snoozing hides the reminder until the chosen time.", "Posponer oculta el recordatorio hasta el momento elegido.")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                  onClick={() => selectedEvent && onSnooze(selectedEvent.id, 10)}
                  disabled={!selectedEvent || busy}
                >
                  {L("Snooze 10m", "Posponer 10m")}
                </button>
                <button
                  className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                  onClick={() => selectedEvent && onSnooze(selectedEvent.id, 1440)}
                  disabled={!selectedEvent || busy}
                >
                  {L("Snooze 24h", "Posponer 24h")}
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

        {tab === "rules" && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Reminder rules", "Reglas de recordatorios")}</div>
              <p className="mt-2 text-sm text-slate-400">{L("Toggle rules on/off and trigger tests.", "Activa o desactiva reglas y dispara pruebas.")}</p>
            </div>
            <div className="text-xs text-slate-400">{busy ? L("Working…", "Trabajando…") : ""}</div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  {L("Create custom reminder", "Crear recordatorio personalizado")}
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {L(
                    "Pick a trigger and optional thresholds. Custom reminders are in addition to core rules.",
                    "Elige un disparador y umbrales opcionales. Los recordatorios personalizados son adicionales a las reglas core."
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span>
                  {L("Custom reminders:", "Recordatorios personalizados:")}{" "}
                  <span className="text-slate-200 font-semibold">{customRulesCount}/{customLimit}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowCreate((v) => !v)}
                  className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                >
                  {showCreate ? L("Hide form", "Ocultar formulario") : L("Add reminder", "Agregar recordatorio")}
                </button>
              </div>
            </div>

            {remainingCustom === 0 ? (
              <div className="mt-3 rounded-lg border border-amber-800 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                {L(
                  `Limit reached. Your ${planKey === "advanced" ? "Advanced" : "Core"} plan allows up to ${customLimit} custom reminders.`,
                  `Límite alcanzado. Tu plan ${planKey === "advanced" ? "Advanced" : "Core"} permite hasta ${customLimit} recordatorios personalizados.`
                )}
              </div>
            ) : null}

            {showCreate ? (
              <form onSubmit={onCreateRule} className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Title", "Título")}</label>
                  <input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder={L("Example: Goal reached", "Ejemplo: Meta alcanzada")}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Trigger", "Disparador")}</label>
                  <select
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 focus:border-emerald-400"
                  >
                    {reminderTriggerOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTrigger?.thresholdLabel ? (
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{selectedTrigger.thresholdLabel}</label>
                    <input
                      value={newThreshold}
                      onChange={(e) => setNewThreshold(e.target.value)}
                      type="number"
                      step="0.01"
                      placeholder="0"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-400"
                    />
                  </div>
                ) : null}

                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Severity", "Severidad")}</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as AlertSeverity)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 focus:border-emerald-400"
                  >
                    <option value="info">{L("Info", "Info")}</option>
                    <option value="success">{L("Success", "Éxito")}</option>
                    <option value="warning">{L("Warning", "Advertencia")}</option>
                    <option value="critical">{L("Critical", "Crítica")}</option>
                  </select>
                </div>

                <div className="md:col-span-2 space-y-1">
                  <label className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Message (optional)", "Mensaje (opcional)")}</label>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    rows={3}
                    placeholder={L("Explain what to do when this reminder triggers.", "Explica qué hacer cuando se dispare este recordatorio.")}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-400"
                  />
                </div>

                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newChannels.popup}
                        onChange={(e) => setNewChannels((s) => ({ ...s, popup: e.target.checked }))}
                      />
                      {L("Popup", "Pop‑up")}
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newChannels.inapp}
                        onChange={(e) => setNewChannels((s) => ({ ...s, inapp: e.target.checked }))}
                      />
                      {L("In-app", "In‑app")}
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={newChannels.voice}
                        onChange={(e) => setNewChannels((s) => ({ ...s, voice: e.target.checked }))}
                      />
                      {L("Voice", "Voz")}
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !userId || remainingCustom <= 0}
                    className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    {L("Create reminder", "Crear recordatorio")}
                  </button>
                </div>
              </form>
            ) : null}
          </div>

          {rules.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
              {L("No rules found.", "No se encontraron reglas.")}
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {rules.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <SeverityPill severity={r.severity} />
                        <span className="text-xs text-slate-400">{r.category}</span>
                      </div>
                      <div className="text-base font-semibold text-slate-100">{r.title}</div>
                      <div className="text-sm text-slate-400">{r.message || "—"}</div>
                      <div className="text-[11px] text-slate-500">
                        {L("Channels:", "Canales:")} <span className="text-slate-300 font-medium">{channelsLabel(r.channels ?? [])}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                        onClick={() => onTestRule(r.id)}
                        disabled={busy || !userId}
                      >
                        {L("Test", "Probar")}
                      </button>

                      <button
                        className={[
                          "rounded-lg border px-3 py-2 text-xs font-semibold transition",
                          (r.channels ?? []).includes("popup")
                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                            : "border-slate-700 bg-slate-900/40 text-slate-200 hover:border-emerald-400/60 hover:bg-emerald-500/10",
                        ].join(" ")}
                        onClick={() => onTogglePopup(r)}
                        disabled={busy || !userId}
                        title={L("Toggle popup delivery", "Alternar entrega por pop‑up")}
                      >
                        {L("Popup", "Pop‑up")} {((r.channels ?? []).includes("popup")) ? L("On", "Activado") : L("Off", "Desactivado")}
                      </button>

                      <button
                        className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                        onClick={async () => {
                          if (!userId) return;
                          setBusy(true);
                          setFlash(null);
                          try {
                            const res = await updateAlertRule(userId, r.id, { enabled: !r.enabled });
                            if (!res.ok) {
                              setFlash({ type: "error", msg: res.error || L("Failed to update rule", "No se pudo actualizar la regla") });
                            }
                            await refreshAll();
                          } finally {
                            setBusy(false);
                          }
                        }}
                        disabled={busy || !userId}
                      >
                        {r.enabled ? L("Disable", "Desactivar") : L("Enable", "Activar")}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

        {tab === "history" && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Reminder history", "Historial de recordatorios")}</div>
              <p className="mt-2 text-sm text-slate-400">{L("A record of reminders and your actions.", "Registro de recordatorios y tus acciones.")}</p>
            </div>
            <button
              className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
              onClick={refreshAll}
              disabled={busy}
            >
              {L("Refresh history", "Actualizar historial")}
            </button>
          </div>

          {historyEvents.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
              {L("No reminder history yet.", "Aún no hay historial de recordatorios.")}
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-950/50 text-xs uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{L("Time", "Hora")}</th>
                    <th className="px-4 py-3">{L("Severity", "Severidad")}</th>
                    <th className="px-4 py-3">{L("Title", "Título")}</th>
                    <th className="px-4 py-3">{L("Status", "Estado")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historyEvents.map((e) => (
                    <tr key={e.id} className="bg-slate-900/40">
                      <td className="px-4 py-3 text-slate-300">{fmtDate(e.triggered_at)}</td>
                      <td className="px-4 py-3">
                        <SeverityPill severity={e.severity} />
                      </td>
                      <td className="px-4 py-3 text-slate-100">{e.title || L("Reminder", "Recordatorio")}</td>
                      <td className="px-4 py-3 text-slate-300">{e.dismissed ? L("Dismissed", "Descartado") : e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}
      </div>
    </main>
  );
}
