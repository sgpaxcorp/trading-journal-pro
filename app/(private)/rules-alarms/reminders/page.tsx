"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  AlertEvent,
  AlertChannel,
  AlertRule,
  AlertSeverity,
  channelsLabel,
  dismissAlertEvent,
  fireTestEventFromRule,
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
  return new Date(t).toLocaleString();
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

  const [tab, setTab] = useState<Tab>("active");
  const [busy, setBusy] = useState(false);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [flash, setFlash] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | AlertSeverity>("all");

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

      if (!rulesRes.ok) setFlash({ type: "error", msg: rulesRes.error || "Failed to load rules" });
      if (!eventsRes.ok) setFlash({ type: "error", msg: eventsRes.error || "Failed to load events" });

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
        setFlash({ type: "error", msg: res.error || "Test failed" });
        return;
      }
      setFlash({ type: "success", msg: "Test reminder fired. You should see a popup within a few seconds." });
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
      if (!res.ok) setFlash({ type: "error", msg: res.error || "Snooze failed" });
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
      if (!res.ok) setFlash({ type: "error", msg: res.error || "Dismiss failed" });
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
      if (!res.ok) setFlash({ type: "error", msg: res.error || "Failed to update channels" });
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
          <div className="text-[11px] uppercase tracking-[0.32em] text-emerald-400">Rules &amp; Alarms • Reminders</div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-100">Reminders &amp; pop-ups</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Behavioral reminders that trigger pop-ups and in-app alerts. Designed to enforce stop rules and protect
            decision quality.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </button>
          <button
            className="rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-500/60 hover:bg-emerald-500/10"
            onClick={() => window.dispatchEvent(new Event("ntj_alert_engine_run_now"))}
            disabled={!userId || busy}
            title="Force the alert engine to evaluate rules now"
          >
            Run checks now
          </button>
          <button
            className="rounded-xl border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-500/60 hover:bg-emerald-500/10"
            onClick={refreshAll}
            disabled={!userId || busy}
          >
            Refresh
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
        <KpiCard label="Active reminders" value={String(activeEvents.length)} sub="Currently firing" />
        <KpiCard label="Snoozed" value={String(snoozedEvents.length)} sub="Hidden temporarily" />
        <KpiCard label="Rules enabled" value={String(rules.filter((r) => r.enabled).length)} sub="Reminder rules" />
      </div>

        <div className="mt-6 flex flex-wrap gap-2">
        {[
          ["active", `Active (${activeEvents.length})`],
          ["rules", `Rules (${rules.length})`],
          ["history", `History (${historyEvents.length})`],
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
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Active reminders</div>
                <p className="mt-2 text-sm text-slate-400">Click a reminder to see details and actions.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search reminders..."
                    className="w-48 rounded-xl border border-slate-700 bg-slate-950/40 pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-400"
                  />
                </div>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value as any)}
                  className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 focus:border-emerald-400"
                >
                  <option value="all">All severities</option>
                  <option value="info">Info</option>
                  <option value="success">Success</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {filteredActiveEvents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
                  No reminders match your filters.
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
                        <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">reminder</span>
                      </div>
                      <div className="text-xs text-slate-400">{fmtDate(e.triggered_at)}</div>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-100">{e.title || "Reminder"}</div>
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
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Reminder detail</div>
                  <p className="mt-2 text-sm text-slate-400">Review the reminder and take action.</p>
                </div>
                {selectedEvent ? <SeverityPill severity={selectedEvent.severity} /> : null}
              </div>

              {!selectedEvent ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
                  Select a reminder from the left to inspect details and actions.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="text-xl font-semibold text-slate-100">{selectedEvent.title}</div>
                    <div className="mt-2 text-sm text-slate-300">{selectedEvent.message}</div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Created</div>
                      <div className="mt-1 text-sm text-slate-200">{fmtDate(selectedEvent.triggered_at)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Category</div>
                      <div className="mt-1 text-sm text-slate-200">{selectedEvent.category || "reminder"}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                      onClick={() => onSnooze(selectedEvent.id, 60)}
                      disabled={busy}
                    >
                      Snooze 1h
                    </button>
                    <button
                      className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-rose-400/60 hover:bg-rose-500/10"
                      onClick={() => onDismiss(selectedEvent.id)}
                      disabled={busy}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Quick controls</div>
              <p className="mt-2 text-sm text-slate-400">Snoozing hides the reminder until the chosen time.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                  onClick={() => selectedEvent && onSnooze(selectedEvent.id, 10)}
                  disabled={!selectedEvent || busy}
                >
                  Snooze 10m
                </button>
                <button
                  className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                  onClick={() => selectedEvent && onSnooze(selectedEvent.id, 1440)}
                  disabled={!selectedEvent || busy}
                >
                  Snooze 24h
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
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Reminder rules</div>
              <p className="mt-2 text-sm text-slate-400">Toggle rules on/off and trigger tests.</p>
            </div>
            <div className="text-xs text-slate-400">{busy ? "Working…" : ""}</div>
          </div>

          {rules.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
              No rules found.
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
                        Channels: <span className="text-slate-300 font-medium">{channelsLabel(r.channels ?? [])}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                        onClick={() => onTestRule(r.id)}
                        disabled={busy || !userId}
                      >
                        Test
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
                        title="Toggle popup delivery"
                      >
                        Popup {((r.channels ?? []).includes("popup")) ? "On" : "Off"}
                      </button>

                      <button
                        className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                        onClick={async () => {
                          if (!userId) return;
                          setBusy(true);
                          setFlash(null);
                          try {
                            const res = await updateAlertRule(userId, r.id, { enabled: !r.enabled });
                            if (!res.ok) setFlash({ type: "error", msg: res.error || "Failed to update rule" });
                            await refreshAll();
                          } finally {
                            setBusy(false);
                          }
                        }}
                        disabled={busy || !userId}
                      >
                        {r.enabled ? "Disable" : "Enable"}
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
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Reminder history</div>
              <p className="mt-2 text-sm text-slate-400">A record of reminders and your actions.</p>
            </div>
            <button
              className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
              onClick={refreshAll}
              disabled={busy}
            >
              Refresh history
            </button>
          </div>

          {historyEvents.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
              No reminder history yet.
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-xl border border-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-950/50 text-xs uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {historyEvents.map((e) => (
                    <tr key={e.id} className="bg-slate-900/40">
                      <td className="px-4 py-3 text-slate-300">{fmtDate(e.triggered_at)}</td>
                      <td className="px-4 py-3">
                        <SeverityPill severity={e.severity} />
                      </td>
                      <td className="px-4 py-3 text-slate-100">{e.title || "Reminder"}</td>
                      <td className="px-4 py-3 text-slate-300">{e.dismissed ? "Dismissed" : e.status}</td>
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
