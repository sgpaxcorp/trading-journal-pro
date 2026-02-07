"use client";

import React, { useMemo } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export type AlertPopupData = {
  id: string;
  title: string;
  message: string;
  severity: "info" | "success" | "warning" | "critical";
  kind?: "alarm" | "reminder" | "notification";
  channels?: string[];
  triggered_at?: string | null;
  /** Optional categorization (e.g. 'positions') */
  category?: string | null;
  /** Raw payload for richer dialogs */
  payload?: any;
};

type Props = {
  open: boolean;
  busy?: boolean;
  data: AlertPopupData | null;
  onClose: () => void;
  onSnooze?: (minutes: number) => void | Promise<void>;
  onDismiss?: () => void | Promise<void>;
  /** Optional custom resolver (used for positions audit alarms) */
  onResolve?: (resolution: "keep_open" | "close_at_zero" | string) => void | Promise<void>;
};

function severityPill(sev: AlertPopupData["severity"]) {
  switch (sev) {
    case "critical":
      return "bg-rose-500/20 text-rose-200 border-rose-500/40";
    case "warning":
      return "bg-amber-500/20 text-amber-200 border-amber-500/40";
    case "success":
      return "bg-emerald-500/20 text-emerald-200 border-emerald-500/40";
    default:
      return "bg-slate-500/20 text-slate-200 border-slate-500/40";
  }
}

export default function AlertPopupDialog({ open, busy, data, onClose, onSnooze, onDismiss, onResolve }: Props) {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const triggered = useMemo(() => {
    if (!data?.triggered_at) return null;
    const dt = new Date(data.triggered_at);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toLocaleString(isEs ? "es-ES" : "en-US");
  }, [data?.triggered_at]);

  if (!open || !data) return null;

  const isPositions = (data.category || "").toLowerCase() === "positions";
  const kindLabel =
    data.kind === "alarm"
      ? L("alarm", "alarma")
      : data.kind === "reminder"
      ? L("reminder", "recordatorio")
      : data.kind === "notification"
      ? L("notification", "notificación")
      : data.kind || "";

  const severityLabel = (() => {
    const sev = data.severity;
    if (!isEs) return sev.toUpperCase();
    if (sev === "critical") return "CRÍTICA";
    if (sev === "warning") return "ADVERTENCIA";
    if (sev === "success") return "ÉXITO";
    return "INFO";
  })();

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 nt-popup-overlay" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl nt-popup-card">
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${severityPill(data.severity)}`}>
                  {severityLabel}
                </span>
                {kindLabel ? (
                  <span className="text-xs text-slate-400">{kindLabel}</span>
                ) : null}
                {triggered ? <span className="text-xs text-slate-500">· {triggered}</span> : null}
              </div>
              <h3 className="mt-2 text-lg font-semibold text-white truncate">{data.title}</h3>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              aria-label={L("Close", "Cerrar")}
            >
              ✕
            </button>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">{data.message}</p>

          {/* Positions-specific resolver actions */}
          {isPositions && onResolve ? (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <div className="text-xs text-slate-400">
                {L("Open-position intent", "Intención de posición abierta")}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => onResolve("keep_open")}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
                  disabled={busy}
                >
                  {L("Mark as Swing (keep open)", "Marcar como Swing (mantener abierta)")}
                </button>
                <button
                  onClick={() => onResolve("close_at_zero")}
                  className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-100 hover:bg-emerald-950/50"
                  disabled={busy}
                >
                  {L("Close @ $0 / Let expire", "Cerrar en $0 / Dejar expirar")}
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {onSnooze ? (
                <>
                  <button
                    onClick={() => onSnooze(10)}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
                    disabled={busy}
                  >
                    {L("Snooze 10m", "Posponer 10m")}
                  </button>
                  <button
                    onClick={() => onSnooze(60)}
                    className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
                    disabled={busy}
                  >
                    {L("Snooze 1h", "Posponer 1h")}
                  </button>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 sm:justify-end">
              {onDismiss ? (
                <button
                  onClick={onDismiss}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900"
                  disabled={busy}
                >
                  {L("Dismiss", "Descartar")}
                </button>
              ) : null}
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300 hover:bg-slate-900"
              >
                {L("Close", "Cerrar")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
