"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import TopNav from "@/app/components/TopNav";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  AlertEvent,
  AlertSeverity,
  isEventActive,
  isEventSnoozed,
  listAlertEvents,
  subscribeToAlertEvents,
} from "@/lib/alertsSupabase";

type Tab = "all" | "alarms" | "reminders" | "snoozed" | "history";

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

export default function MessageCenterPage() {
  const { user } = useAuth() as any;
  const userId = (user as any)?.id || (user as any)?.uid || "";
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const kindLabel = (kind: string) =>
    isEs ? (kind === "alarm" ? "alarma" : kind === "reminder" ? "recordatorio" : kind) : kind;

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const MAX_EVENTS = 10;

  const refresh = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const res = await listAlertEvents(userId, {
        includeDismissed: true,
        includeSnoozed: true,
        limit: MAX_EVENTS,
      });
      setEvents(res.ok ? res.data.events : []);
    } finally {
      setBusy(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const sub = subscribeToAlertEvents(userId, () => {
      refresh();
    });
    const t = window.setInterval(() => {
      refresh();
    }, 30_000);
    const onForce = () => refresh();
    window.addEventListener("ntj_alert_force_pull", onForce);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("ntj_alert_force_pull", onForce);
      sub?.unsubscribe?.();
    };
  }, [userId, refresh]);

  const activeEvents = useMemo(() => events.filter((e) => isEventActive(e)), [events]);
  const snoozedEvents = useMemo(
    () => events.filter((e) => !isEventActive(e) && isEventSnoozed(e)),
    [events]
  );
  const historyEvents = useMemo(
    () => events.filter((e) => e.dismissed && !isEventSnoozed(e)),
    [events]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list =
      tab === "alarms"
        ? events.filter((e) => e.kind === "alarm")
        : tab === "reminders"
          ? events.filter((e) => e.kind === "reminder")
          : tab === "snoozed"
            ? snoozedEvents
            : tab === "history"
              ? historyEvents
              : events;

    if (!q) return list.slice(0, MAX_EVENTS);
    return list.filter((e) => {
      return (
        String(e.title ?? "").toLowerCase().includes(q) ||
        String(e.message ?? "").toLowerCase().includes(q) ||
        String(e.category ?? "").toLowerCase().includes(q)
      );
    }).slice(0, MAX_EVENTS);
  }, [events, historyEvents, query, snoozedEvents, tab]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="mx-auto w-full max-w-7xl px-6 pb-24 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-emerald-300/80">
              {L("Message Center", "Centro de mensajes")}
            </div>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              {L("Alerts & Reminders Inbox", "Bandeja de alertas y recordatorios")}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {L(
                "All notifications in one place. Use filters to jump into Alarms or Reminders.",
                "Todas las notificaciones en un solo lugar. Usa filtros para ir a Alarmas o Recordatorios."
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {L(
                "Showing the latest 10 alerts.",
                "Mostrando las ultimas 10 alertas."
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
              onClick={refresh}
              disabled={busy}
            >
              {L("Refresh", "Actualizar")}
            </button>
            <Link
              href="/rules-alarms/alarms"
              className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
            >
              {L("Open Alarms", "Abrir alarmas")}
            </Link>
            <Link
              href="/rules-alarms/reminders"
              className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
            >
              {L("Open Reminders", "Abrir recordatorios")}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{L("Active", "Activas")}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{activeEvents.length}</div>
            <div className="mt-1 text-xs text-slate-400">{L("Requires attention", "Requiere atención")}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{L("Snoozed", "Pospuestas")}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{snoozedEvents.length}</div>
            <div className="mt-1 text-xs text-slate-400">{L("Temporarily hidden", "Ocultas temporalmente")}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{L("History", "Historial")}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-100">{historyEvents.length}</div>
            <div className="mt-1 text-xs text-slate-400">{L("Dismissed & resolved", "Descartadas y resueltas")}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {([
            ["all", `${L("All", "Todas")} (${events.length})`],
            ["alarms", L("Alarms", "Alarmas")],
            ["reminders", L("Reminders", "Recordatorios")],
            ["snoozed", `${L("Snoozed", "Pospuestas")} (${snoozedEvents.length})`],
            ["history", `${L("History", "Historial")} (${historyEvents.length})`],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                tab === key
                  ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                  : "border-slate-700 bg-slate-900/40 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-200"
              }`}
            >
              {label}
            </button>
          ))}

          <div className="ml-auto flex min-w-[220px] items-center gap-2 rounded-full border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
              placeholder={L("Search alerts...", "Buscar alertas...")}
            />
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800">
          {filtered.length === 0 ? (
            <div className="bg-slate-950/40 p-6 text-sm text-slate-400">
              {L("No messages found.", "No se encontraron mensajes.")}
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filtered.map((e) => {
                const status = isEventActive(e)
                  ? L("Active", "Activa")
                  : isEventSnoozed(e)
                    ? L("Snoozed", "Pospuesta")
                    : L("Dismissed", "Descartada");

                const link = e.kind === "alarm" ? "/rules-alarms/alarms" : "/rules-alarms/reminders";

                return (
                  <div key={e.id} className="flex flex-wrap items-start justify-between gap-4 bg-slate-900/40 px-4 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityPill severity={e.severity} />
                        <span className="text-xs text-slate-400">{kindLabel(e.kind)}</span>
                        <span className="text-xs text-slate-500">· {fmtDate(e.triggered_at)}</span>
                      </div>
                      <div className="mt-2 text-sm font-semibold text-slate-100">
                        {e.title || L("Alert", "Alerta")}
                      </div>
                      <div className="mt-1 text-xs text-slate-400 line-clamp-2">{e.message || "—"}</div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300">
                        {status}
                      </span>
                      <Link
                        href={link}
                        className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                      >
                        {L("View", "Ver")} {e.kind === "alarm" ? L("Alarms", "Alarmas") : L("Reminders", "Recordatorios")}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
