"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import TopNav from "@/app/components/TopNav";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import {
  AlertEvent,
  AlertSeverity,
  isEventActive,
  isEventSnoozed,
  listAlertEvents,
  subscribeToAlertEvents,
} from "@/lib/alertsSupabase";
import {
  addSupportMessage,
  createSupportTicket,
  getSignedAttachmentUrl,
  isAdminUser,
  listSupportMessages,
  listSupportTickets,
  updateSupportTicketStatus,
  updateSupportTicket,
  uploadSupportAttachments,
  type SupportMessage,
  type SupportTicket,
  type SupportTicketStatus,
} from "@/lib/supportTicketsSupabase";

type Tab = "all" | "alarms" | "reminders" | "snoozed" | "history";
type Section = "alerts" | "support";

type OpenPosition = {
  journal_date?: string | null;
  opened_at?: string | null;
  raw?: any;
};

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

function ticketStatusLabel(status: SupportTicketStatus, isEs: boolean) {
  if (status === "waiting_user") return isEs ? "Esperando tu respuesta" : "Waiting on you";
  if (status === "waiting_support") return isEs ? "En soporte" : "Waiting on support";
  if (status === "closed") return isEs ? "Cerrado" : "Closed";
  return isEs ? "Abierto" : "Open";
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

function extractOpenPositionsFromEvent(e: AlertEvent | null): OpenPosition[] {
  const payload: any = e?.payload ?? {};
  const meta = payload?.meta ?? payload?.stats ?? {};
  const list =
    payload?.open_positions_list ??
    payload?.open_positions ??
    meta?.open_positions_list ??
    meta?.open_positions ??
    payload?.meta?.open_positions ??
    [];
  return Array.isArray(list) ? list : [];
}

function pickJournalDateFromPositions(positions: OpenPosition[]): string | null {
  for (const p of positions) {
    const jd = p?.journal_date;
    if (jd) return jd;
    const opened = p?.opened_at || p?.raw?.opened_at || p?.raw?.open_time;
    if (opened) {
      const d = new Date(opened);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  return null;
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
  const [section, setSection] = useState<Section>("alerts");
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const MAX_EVENTS = 10;

  const [isAdmin, setIsAdmin] = useState(false);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [supportStatus, setSupportStatus] = useState<SupportTicketStatus | "all">("open");
  const [supportAssigneeFilter, setSupportAssigneeFilter] = useState<"all" | "mine" | "unassigned">("all");
  const [supportLoading, setSupportLoading] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [supportNotice, setSupportNotice] = useState<string | null>(null);
  const [newTicketAlert, setNewTicketAlert] = useState(false);
  const prevSupportCount = useRef(0);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [replyBody, setReplyBody] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [sendingSupport, setSendingSupport] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});

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

  const refreshSupport = useCallback(async () => {
    if (!userId) return;
    setSupportLoading(true);
    try {
      const admin = await isAdminUser(userId);
      setIsAdmin(admin);
      const res = await listSupportTickets({
        userId,
        status: supportStatus,
        includeAll: admin,
      });
      setSupportTickets(res.ok ? res.tickets : []);
      if (admin && res.ok) {
        const count = res.tickets.length;
        if (prevSupportCount.current && count > prevSupportCount.current) {
          setNewTicketAlert(true);
        }
        prevSupportCount.current = count;
      }
      if (!selectedTicketId && res.ok && res.tickets.length) {
        setSelectedTicketId(res.tickets[0].id);
      }
    } finally {
      setSupportLoading(false);
    }
  }, [supportStatus, userId, selectedTicketId]);

  useEffect(() => {
    refreshSupport();
  }, [refreshSupport]);

  useEffect(() => {
    if (!userId || !isAdmin) return;
    const channel = supabaseBrowser
      .channel(`support-tickets-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_tickets" },
        () => {
          setNewTicketAlert(true);
          refreshSupport();
        }
      )
      .subscribe();
    return () => {
      try {
        supabaseBrowser.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [isAdmin, refreshSupport, userId]);

  useEffect(() => {
    if (!selectedTicketId) {
      setSupportMessages([]);
      return;
    }
    (async () => {
      const res = await listSupportMessages(selectedTicketId);
      setSupportMessages(res.ok ? res.messages : []);
    })();
  }, [selectedTicketId]);

  useEffect(() => {
    const loadUrls = async () => {
      const next: Record<string, string> = {};
      for (const msg of supportMessages) {
        const attachments = (msg.attachments ?? []) as any[];
        for (const att of attachments) {
          const path = String(att?.path ?? "");
          if (!path || attachmentUrls[path]) continue;
          const url = await getSignedAttachmentUrl(path);
          if (url) next[path] = url;
        }
      }
      if (Object.keys(next).length) {
        setAttachmentUrls((prev) => ({ ...prev, ...next }));
      }
    };
    loadUrls();
  }, [supportMessages, attachmentUrls]);

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

  const supportFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = supportTickets;
    if (supportStatus !== "all") {
      list = list.filter((t) => t.status === supportStatus);
    }
    if (isAdmin && supportAssigneeFilter !== "all") {
      list =
        supportAssigneeFilter === "mine"
          ? list.filter((t) => t.assigned_to === userId)
          : list.filter((t) => !t.assigned_to);
    }
    if (!q) return list;
    return list.filter((t) => {
      return (
        String(t.subject ?? "").toLowerCase().includes(q) ||
        String(t.email ?? "").toLowerCase().includes(q) ||
        String(t.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [supportTickets, supportStatus, supportAssigneeFilter, query, isAdmin, userId]);

  const supportStats = useMemo(() => {
    const open = supportTickets.filter((t) => t.status === "open").length;
    const waitingSupport = supportTickets.filter((t) => t.status === "waiting_support").length;
    const waitingUser = supportTickets.filter((t) => t.status === "waiting_user").length;
    const closed = supportTickets.filter((t) => t.status === "closed").length;
    return { open, waitingSupport, waitingUser, closed };
  }, [supportTickets]);

  const selectedTicket = supportTickets.find((t) => t.id === selectedTicketId) ?? null;

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
              {section === "support"
                ? L("Support Message Center", "Centro de soporte")
                : L("Alerts & Reminders Inbox", "Bandeja de alertas y recordatorios")}
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {section === "support"
                ? L(
                    "Track support requests, screenshots, and replies in one place.",
                    "Gestiona solicitudes de soporte, screenshots y respuestas en un solo lugar."
                  )
                : L(
                    "All notifications in one place. Use filters to jump into Alarms or Reminders.",
                    "Todas las notificaciones en un solo lugar. Usa filtros para ir a Alarmas o Recordatorios."
                  )}
            </p>
            {section === "alerts" && (
              <p className="mt-1 text-xs text-slate-500">
                {L("Showing the latest 10 alerts.", "Mostrando las ultimas 10 alertas.")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/50 p-1 text-xs">
              <button
                onClick={() => setSection("alerts")}
                className={`rounded-full px-3 py-1 font-semibold ${
                  section === "alerts" ? "bg-emerald-500/20 text-emerald-100" : "text-slate-300 hover:text-emerald-200"
                }`}
              >
                {L("Alerts", "Alertas")}
              </button>
              <button
                onClick={() => setSection("support")}
                className={`rounded-full px-3 py-1 font-semibold ${
                  section === "support" ? "bg-emerald-500/20 text-emerald-100" : "text-slate-300 hover:text-emerald-200"
                }`}
              >
                {L("Support", "Soporte")}
              </button>
            </div>
            <button
              className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
              onClick={section === "support" ? refreshSupport : refresh}
              disabled={busy || supportLoading}
            >
              {L("Refresh", "Actualizar")}
            </button>
            {section === "alerts" && (
              <>
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
              </>
            )}
          </div>
        </div>

        {section === "alerts" && (
          <>
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
                const openJournalDate = pickJournalDateFromPositions(extractOpenPositionsFromEvent(e));

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
                      {openJournalDate ? (
                        <Link
                          href={`/journal/${openJournalDate}`}
                          className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-950/50"
                        >
                          {L("Open journal", "Abrir journal")}
                        </Link>
                      ) : null}
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
          </>
        )}

        {section === "support" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/80">
                    {L("Support tickets", "Tickets de soporte")}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {L("Conversations with support.", "Conversaciones con soporte.")}
                  </p>
                </div>
                {!isAdmin && (
                  <button
                    onClick={() => setComposeOpen((v) => !v)}
                    className="rounded-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
                  >
                    {composeOpen ? L("Hide", "Ocultar") : L("New ticket", "Nuevo ticket")}
                  </button>
                )}
              </div>

              {newTicketAlert && isAdmin && (
                <div className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200 flex items-center justify-between gap-2">
                  <span>{L("New support ticket received.", "Nuevo ticket recibido.")}</span>
                  <button
                    className="rounded-full border border-emerald-300/60 px-3 py-1 text-[11px] font-semibold"
                    onClick={() => setNewTicketAlert(false)}
                  >
                    {L("Dismiss", "Cerrar")}
                  </button>
                </div>
              )}

              {supportNotice && (
                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-xs text-slate-300">
                  {supportNotice}
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Open", "Abiertos")}</div>
                  <div className="mt-2 text-lg font-semibold text-slate-100">{supportStats.open}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Waiting support", "En soporte")}</div>
                  <div className="mt-2 text-lg font-semibold text-slate-100">{supportStats.waitingSupport}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Waiting user", "Esperando usuario")}</div>
                  <div className="mt-2 text-lg font-semibold text-slate-100">{supportStats.waitingUser}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Closed", "Cerrados")}</div>
                  <div className="mt-2 text-lg font-semibold text-slate-100">{supportStats.closed}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {(["all", "open", "waiting_support", "waiting_user", "closed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSupportStatus(s)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      supportStatus === s
                        ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                        : "border-slate-700 bg-slate-900/40 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-200"
                    }`}
                  >
                    {s === "all" ? L("All", "Todos") : ticketStatusLabel(s, isEs)}
                  </button>
                ))}
                {isAdmin && (
                  <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="uppercase tracking-[0.2em]">{L("Assigned", "Asignado")}</span>
                    {(["all", "mine", "unassigned"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setSupportAssigneeFilter(v)}
                        className={`rounded-full border px-3 py-1 ${
                          supportAssigneeFilter === v
                            ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                            : "border-slate-700 bg-slate-900/40 text-slate-300 hover:border-emerald-400/40 hover:text-emerald-200"
                        }`}
                      >
                        {v === "all" ? L("All", "Todos") : v === "mine" ? L("Mine", "Míos") : L("Unassigned", "Sin asignar")}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {composeOpen && !isAdmin && (
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                    {L("New support request", "Nueva solicitud")}
                  </div>
                  <div className="mt-3 space-y-3">
                    <input
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                      placeholder={L("Subject", "Asunto")}
                    />
                    <textarea
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      rows={4}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                      placeholder={L("Describe the issue…", "Describe el problema…")}
                    />
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => setComposeFiles(Array.from(e.target.files ?? []).slice(0, 3))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-300"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        {composeFiles.length
                          ? `${composeFiles.length} ${L("files selected", "archivos seleccionados")}`
                          : L("Optional screenshots", "Screenshots opcionales")}
                      </span>
                      <button
                        onClick={async () => {
                          if (!userId || !composeBody.trim()) return;
                          setSendingSupport(true);
                          setSupportNotice(null);
                          try {
                            const ticketRes = await createSupportTicket({
                              userId,
                              name: user?.user_metadata?.full_name || user?.email,
                              email: user?.email,
                              subject: composeSubject || L("Support request", "Solicitud de soporte"),
                              message: undefined,
                              source: "inapp",
                            });
                            if (!ticketRes.ok || !ticketRes.ticket) throw new Error(ticketRes.error || "Ticket failed");
                            const ticketId = ticketRes.ticket.id;
                            let attachments: any[] = [];
                            if (composeFiles.length) {
                              const uploaded = await uploadSupportAttachments({
                                userId,
                                ticketId,
                                files: composeFiles,
                              });
                              if (!uploaded.ok) throw new Error(uploaded.error || "Upload failed");
                              attachments = uploaded.attachments;
                            }
                            const msgRes = await addSupportMessage({
                              ticketId,
                              userId,
                              message: composeBody,
                              attachments,
                              authorRole: "user",
                            });
                            if (!msgRes.ok) throw new Error(msgRes.error || "Message failed");
                            setComposeBody("");
                            setComposeSubject("");
                            setComposeFiles([]);
                            setComposeOpen(false);
                            await refreshSupport();
                            setSelectedTicketId(ticketId);
                            setSupportNotice(L("Ticket created. We'll reply soon.", "Ticket creado. Te responderemos pronto."));
                          } catch (err) {
                            console.error("[support] create failed", err);
                            setSupportNotice(L("We couldn't create the ticket.", "No pudimos crear el ticket."));
                          } finally {
                            setSendingSupport(false);
                          }
                        }}
                        className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                        disabled={sendingSupport}
                      >
                        {sendingSupport ? L("Sending…", "Enviando…") : L("Send", "Enviar")}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-2">
                {supportLoading && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                    {L("Loading tickets…", "Cargando tickets…")}
                  </div>
                )}
                {!supportLoading && supportFiltered.length === 0 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-400">
                    {L("No tickets yet.", "Aún no hay tickets.")}
                  </div>
                )}
                {supportFiltered.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTicketId(t.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left text-xs transition ${
                      selectedTicketId === t.id
                        ? "border-emerald-400/60 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-950/40 hover:border-emerald-400/30"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold text-slate-100">{t.subject || L("Support request", "Solicitud")}</div>
                      <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                        {ticketStatusLabel(t.status, isEs)}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">
                      {t.email ? t.email : L("In-app request", "Solicitud dentro del app")}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                      <span>
                        {L("Priority", "Prioridad")}:{" "}
                        <span className="text-slate-300">{t.priority ?? "normal"}</span>
                      </span>
                      {isAdmin && (
                        <span>
                          {t.assigned_to ? (t.assigned_to === userId ? L("Assigned to you", "Asignado a ti") : L("Assigned", "Asignado")) : L("Unassigned", "Sin asignar")}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-slate-500">
                      {L("Updated", "Actualizado")}: {fmtDate(t.last_message_at)}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              {!selectedTicket && (
                <div className="text-sm text-slate-400">
                  {L("Select a ticket to view the conversation.", "Selecciona un ticket para ver la conversación.")}
                </div>
              )}
              {selectedTicket && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                        {L("Ticket", "Ticket")}
                      </div>
                      <h3 className="mt-1 text-lg font-semibold text-slate-100">
                        {selectedTicket.subject || L("Support request", "Solicitud")}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {ticketStatusLabel(selectedTicket.status, isEs)} · {fmtDate(selectedTicket.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <>
                          <select
                            value={selectedTicket.priority ?? "normal"}
                            onChange={async (e) => {
                              const next = e.target.value as any;
                              await updateSupportTicket(selectedTicket.id, { priority: next });
                              await refreshSupport();
                            }}
                            className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1 text-[11px] text-slate-200"
                          >
                            <option value="low">{L("Low", "Baja")}</option>
                            <option value="normal">{L("Normal", "Normal")}</option>
                            <option value="high">{L("High", "Alta")}</option>
                            <option value="urgent">{L("Urgent", "Urgente")}</option>
                          </select>
                          <button
                            onClick={async () => {
                              if (!userId) return;
                              const assignTo = selectedTicket.assigned_to === userId ? null : userId;
                              await updateSupportTicket(selectedTicket.id, {
                                assigned_to: assignTo,
                                assigned_at: assignTo ? new Date().toISOString() : null,
                              });
                              await refreshSupport();
                            }}
                            className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:border-emerald-400/50"
                          >
                            {selectedTicket.assigned_to === userId ? L("Unassign", "Desasignar") : L("Assign to me", "Asignarme")}
                          </button>
                        </>
                      )}
                      {selectedTicket.status !== "closed" && (
                        <button
                          onClick={async () => {
                            await updateSupportTicketStatus(selectedTicket.id, "closed");
                            await refreshSupport();
                          }}
                          className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-300 hover:border-emerald-400/50"
                        >
                          {L("Close ticket", "Cerrar ticket")}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-2">
                    {supportMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`rounded-xl border px-4 py-3 text-xs ${
                          msg.author_role === "admin"
                            ? "border-emerald-400/30 bg-emerald-500/10"
                            : "border-slate-800 bg-slate-950/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold text-slate-200">
                            {msg.author_role === "admin" ? L("Support", "Soporte") : L("You", "Tú")}
                          </div>
                          <div className="text-[10px] text-slate-500">{fmtDate(msg.created_at)}</div>
                        </div>
                        <div className="mt-2 whitespace-pre-wrap text-slate-100">{msg.message}</div>
                        {(msg.attachments ?? []).length > 0 && (
                          <div className="mt-3 space-y-1">
                            {(msg.attachments ?? []).map((att: any, idx: number) => {
                              const path = String(att?.path ?? "");
                              const url = path ? attachmentUrls[path] : null;
                              return (
                                <div key={`${msg.id}-${idx}`} className="text-[11px] text-emerald-200">
                                  {url ? (
                                    <a className="hover:underline" href={url} target="_blank" rel="noreferrer">
                                      {att?.name || L("Attachment", "Adjunto")}
                                    </a>
                                  ) : (
                                    <span>{att?.name || L("Attachment", "Adjunto")}</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <textarea
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                      placeholder={L("Write a reply…", "Escribe una respuesta…")}
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => setReplyFiles(Array.from(e.target.files ?? []).slice(0, 3))}
                        className="text-[11px] text-slate-300"
                      />
                      <button
                        onClick={async () => {
                          if (!selectedTicket || !userId || !replyBody.trim()) return;
                          setSendingSupport(true);
                          setSupportNotice(null);
                          try {
                            let attachments: any[] = [];
                            if (replyFiles.length) {
                              const uploaded = await uploadSupportAttachments({
                                userId,
                                ticketId: selectedTicket.id,
                                files: replyFiles,
                              });
                              if (!uploaded.ok) throw new Error(uploaded.error || "Upload failed");
                              attachments = uploaded.attachments;
                            }
                            const res = await addSupportMessage({
                              ticketId: selectedTicket.id,
                              userId,
                              message: replyBody,
                              attachments,
                              authorRole: isAdmin ? "admin" : "user",
                            });
                            if (!res.ok) throw new Error(res.error || "Reply failed");
                            setReplyBody("");
                            setReplyFiles([]);
                            await refreshSupport();
                            const msgRes = await listSupportMessages(selectedTicket.id);
                            setSupportMessages(msgRes.ok ? msgRes.messages : []);
                            setSupportNotice(L("Reply sent.", "Respuesta enviada."));
                          } catch (err) {
                            console.error("[support] reply failed", err);
                            setSupportNotice(L("We couldn't send the reply.", "No pudimos enviar la respuesta."));
                          } finally {
                            setSendingSupport(false);
                          }
                        }}
                        disabled={sendingSupport}
                        className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
                      >
                        {sendingSupport ? L("Sending…", "Enviando…") : L("Send reply", "Enviar respuesta")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
