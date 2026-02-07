"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
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
  patchAlertEventPayload,
  snoozeAlertEvent,
  subscribeToAlertEvents,
  updateAlertRule,
} from "@/lib/alertsSupabase";
import TopNav from "@/app/components/TopNav";

type Tab = "active" | "rules" | "audit" | "history";

type OpenPosition = {
  id?: string | number | null;
  symbol?: string | null;
  qty?: number | null;
  asset_type?: string | null;
  expiration?: string | null;
  strike?: number | null;
  option_type?: string | null;
  side?: string | null;
  premium?: string | null;
  strategy?: string | null;
  dte?: number | null;
  journal_date?: string | null;
  source?: "trades" | "journal" | "notes" | string | null;
};

function safeArr<T = any>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
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

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeKind(raw: any): string {
  const k = String(raw ?? "").toLowerCase();
  if (["stock", "option", "future", "crypto", "forex", "other"].includes(k)) return k;
  return "other";
}

function normalizeSide(raw: any): "long" | "short" {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("short")) return "short";
  return "long";
}

function normalizePremium(raw: any): "none" | "debit" | "credit" {
  const p = String(raw ?? "").toLowerCase();
  if (p.includes("credit")) return "credit";
  if (p.includes("debit")) return "debit";
  return "none";
}

const FUTURES_MULTIPLIERS: Record<string, number> = {
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  YM: 5,
  MYM: 0.5,
  RTY: 50,
  M2K: 5,
  CL: 1000,
  MCL: 100,
  GC: 100,
  MGC: 10,
  SI: 5000,
  HG: 25000,
};

const FUT_MONTH_CODES = "FGHJKMNQUVXZ";

function futureRoot(symbol: string) {
  const s0 = (symbol || "").trim().toUpperCase().replace(/^\//, "");
  const s = s0.replace(/\s+/g, "");
  const re1 = new RegExp(`^([A-Z0-9]{1,8})([${FUT_MONTH_CODES}])(\\d{1,4})$`);
  const m1 = s.match(re1);
  if (m1) return m1[1];
  const m2 = s.match(/^([A-Z0-9]{1,8})/);
  return m2?.[1] ?? s0;
}

function getContractMultiplier(kind: string, symbol: string) {
  if (kind === "option") return 100;
  if (kind === "future") {
    const root = futureRoot(symbol);
    return FUTURES_MULTIPLIERS[root] ?? 1;
  }
  return 1;
}

function parseSPXOptionSymbol(raw: string) {
  const s = (raw || "").trim().toUpperCase().replace(/^[\.\-]/, "");
  const m = s.match(/^([A-Z]+W?)(\d{6})([CP])(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return { underlying: m[1] };
}

function looksLikeOptionContract(symbol: string) {
  return !!parseSPXOptionSymbol(symbol);
}

function effectiveKind(kind: string, symbol: string): string {
  if (kind === "option" && !looksLikeOptionContract(symbol)) return "stock";
  return kind || "other";
}

function pnlSign(kind: string, side: "long" | "short", premiumSide: "none" | "debit" | "credit") {
  if (kind === "option") {
    if (premiumSide === "credit") return -1;
    return 1;
  }
  return side === "short" ? -1 : 1;
}

function computeAutoPnL(
  entries: { symbol: string; kind: string; side: "long" | "short"; premiumSide: "none" | "debit" | "credit"; price: number; quantity: number }[],
  exits: { symbol: string; kind: string; side: "long" | "short"; premiumSide: "none" | "debit" | "credit"; price: number; quantity: number }[]
) {
  const key = (s: string, k: string, side: string, prem: string) => `${s}|${k}|${side}|${prem}`;
  type Lot = { price: number; qtyLeft: number; symbol: string; kind: string; side: "long" | "short"; premiumSide: "none" | "debit" | "credit" };
  const entryLots: Record<string, Lot[]> = {};

  for (const e of entries) {
    const sym = (e.symbol || "").trim().toUpperCase();
    if (!sym) continue;
    const kEff = effectiveKind(e.kind, sym);
    const premEff = e.premiumSide;
    const k = key(sym, kEff, e.side, premEff);
    if (!Number.isFinite(e.price) || !Number.isFinite(e.quantity) || e.quantity <= 0) continue;
    entryLots[k] ||= [];
    entryLots[k].push({ price: e.price, qtyLeft: e.quantity, symbol: sym, kind: kEff, side: e.side, premiumSide: premEff });
  }

  let total = 0;

  for (const x of exits) {
    const sym = (x.symbol || "").trim().toUpperCase();
    if (!sym) continue;
    const kEff = effectiveKind(x.kind, sym);
    const premEff = x.premiumSide;
    const k = key(sym, kEff, x.side, premEff);
    if (!Number.isFinite(x.price) || !Number.isFinite(x.quantity) || x.quantity <= 0) continue;
    const lots = entryLots[k];
    if (!lots || lots.length === 0) continue;

    const sign = pnlSign(kEff, x.side, premEff);
    const mult = getContractMultiplier(kEff, sym);
    let exitQty = x.quantity;

    while (exitQty > 0 && lots.length > 0) {
      const lot = lots[0];
      const closeQty = Math.min(lot.qtyLeft, exitQty);
      total += (x.price - lot.price) * closeQty * sign * mult;
      lot.qtyLeft -= closeQty;
      exitQty -= closeQty;
      if (lot.qtyLeft <= 0) lots.shift();
    }
  }

  return { total };
}

async function recomputeJournalPnlForDate(userId: string, date: string) {
  const res = await supabaseBrowser
    .from("journal_trades")
    .select("symbol,kind,side,premium,price,quantity,leg")
    .eq("user_id", userId)
    .eq("journal_date", date);

  if (res.error || !Array.isArray(res.data)) return;

  const entries = [];
  const exits = [];
  for (const r of res.data as any[]) {
    const symbol = String(r?.symbol ?? "").trim();
    if (!symbol) continue;
    const kind = normalizeKind(r?.kind);
    const side = normalizeSide(r?.side);
    const premiumSide = normalizePremium(r?.premium);
    const price = Number(r?.price ?? 0);
    const quantity = Number(r?.quantity ?? 0);
    const leg = String(r?.leg ?? "entry").toLowerCase();
    const isExit = leg.includes("exit") || leg.includes("close");

    const row = { symbol, kind, side, premiumSide, price, quantity };
    if (isExit) exits.push(row);
    else entries.push(row);
  }

  const total = computeAutoPnL(entries, exits).total;
  const pnl = Number.isFinite(total) ? Number(total.toFixed(2)) : 0;

  await supabaseBrowser
    .from("journal_entries")
    .update({ pnl })
    .eq("user_id", userId)
    .eq("date", date);
}

function parsePrice(v: string): number | null {
  if (!v || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
  return safeArr(list);
}

function extractExpiringOptionsFromEvent(e: AlertEvent | null): OpenPosition[] {
  const payload: any = e?.payload ?? {};
  const meta = payload?.meta ?? payload?.stats ?? {};
  const list =
    payload?.options_expiring_today ??
    payload?.options_expiring ??
    meta?.options_expiring_today ??
    meta?.options_expiring ??
    [];
  return safeArr(list);
}

async function closeTradeAtPrice(userId: string, tradeId: string, closeAtISO: string, closePrice?: number | null) {
  const price = typeof closePrice === "number" && Number.isFinite(closePrice) ? closePrice : null;

  const pricePatches: Record<string, any>[] = price === null
    ? [{}]
    : [
        { exit_price: price },
        { close_price: price },
        { exit_price: price, close_price: price },
      ];

  const basePatches: Record<string, any>[] = [
    { closed_at: closeAtISO, status: "closed" },
    { close_time: closeAtISO, status: "closed" },
    { exited_at: closeAtISO, status: "closed" },
    { exit_time: closeAtISO, status: "closed" },

    { closed_at: closeAtISO },
    { close_time: closeAtISO },
    { exited_at: closeAtISO },
    { exit_time: closeAtISO },
  ];

  const attempts: Record<string, any>[] = [];
  for (const base of basePatches) {
    for (const patch of pricePatches) {
      attempts.push({ ...base, ...patch });
    }
  }

  if (price !== null) {
    attempts.push({ exit_price: price, status: "closed" });
    attempts.push({ close_price: price, status: "closed" });
    attempts.push({ exit_price: price });
    attempts.push({ close_price: price });
  }

  let lastErr: any = null;

  for (const patch of attempts) {
    const { error } = await supabaseBrowser
      .from("trades")
      .update(patch)
      .eq("id", tradeId)
      .eq("user_id", userId);

    if (!error) return { ok: true as const };

    lastErr = error;
    const msg = String(error.message ?? "");
    const isMissingColumn =
      msg.includes("does not exist") ||
      msg.includes("Could not find") ||
      (msg.includes("column") && msg.includes("of relation"));

    // If it's a column mismatch, try the next patch; otherwise stop.
    if (!isMissingColumn) break;
  }

  return { ok: false as const, error: String(lastErr?.message ?? "Failed to close trade") };
}

async function closeJournalPositionAtPrice(
  userId: string,
  pos: OpenPosition,
  closeAtISO: string,
  closePrice?: number | null
) {
  const symbol = String(pos.symbol ?? "").trim();
  if (!symbol) return { ok: false as const, error: "Missing symbol" };
  const price = typeof closePrice === "number" && Number.isFinite(closePrice) ? closePrice : null;
  const qtyRaw = typeof pos.qty === "number" ? pos.qty : Number(pos.qty ?? 0);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;

  const now = new Date(closeAtISO);
  const journalDate = pos.journal_date || isoDate(now);
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const row: Record<string, any> = {
    user_id: userId,
    journal_date: journalDate,
    leg: "exit",
    symbol,
    kind: pos.asset_type ?? null,
    side: pos.side ?? null,
    premium: pos.premium ?? null,
    strategy: pos.strategy ?? null,
    price,
    quantity: qty,
    time: timeStr,
    dte: typeof pos.dte === "number" ? pos.dte : null,
  };

  const { error } = await supabaseBrowser.from("journal_trades").insert(row);
  if (error) return { ok: false as const, error: String(error.message ?? "Failed to close journal trade") };
  try {
    await recomputeJournalPnlForDate(userId, journalDate);
  } catch {
    // ignore
  }
  return { ok: true as const };
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

export default function AlarmsConsolePage() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id || "";
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [tab, setTab] = useState<Tab>("active");
  const [busy, setBusy] = useState(false);

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [flash, setFlash] = useState<{ type: "success" | "error" | "info"; msg: string } | null>(null);
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<"all" | AlertSeverity>("all");
  const [closePriceByTrade, setClosePriceByTrade] = useState<Record<string, string>>({});

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  const activeEvents = useMemo(() => events.filter((e) => e.kind === "alarm" && isEventActive(e)), [events]);
  const snoozedEvents = useMemo(
    () => events.filter((e) => e.kind === "alarm" && !isEventActive(e) && isEventSnoozed(e)),
    [events]
  );
  const historyEvents = useMemo(
    () => events.filter((e) => e.kind === "alarm" && e.dismissed && !isEventSnoozed(e)),
    [events]
  );

  const openPositionsRule = useMemo(() => {
    const matchByTrigger = rules.find((r) => String((r as any).trigger_type ?? (r as any).triggerType ?? "").toLowerCase() === "open_positions");
    if (matchByTrigger) return matchByTrigger;
    return rules.find((r) => /open\s*positions/i.test(r.title)) ?? null;
  }, [rules]);

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

  const refreshAll = useCallback(async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const [rulesRes, eventsRes] = await Promise.all([
        listAlertRules(userId, { kind: "alarm", includeDisabled: true, limit: 200 }),
        listAlertEvents(userId, { kind: "alarm", includeDismissed: true, includeSnoozed: true, limit: 500 }),
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
  }, [userId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!userId) return;
    const sub = subscribeToAlertEvents(userId, () => {
      refreshAll();
    });
    const t = window.setInterval(() => {
      refreshAll();
    }, 30_000);
    const onForce = () => refreshAll();
    window.addEventListener("ntj_alert_force_pull", onForce);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("ntj_alert_force_pull", onForce);
      sub?.unsubscribe?.();
    };
  }, [userId, refreshAll]);

  useEffect(() => {
    setClosePriceByTrade({});
  }, [selectedEventId]);

  // Audit Trail: pick the newest open-positions related event by default
  useEffect(() => {
    if (tab !== "audit") return;
    if (selectedEventId) return;

    const candidate =
      events.find((e) => extractOpenPositionsFromEvent(e).length > 0 || extractExpiringOptionsFromEvent(e).length > 0) ??
      null;

    if (candidate) setSelectedEventId(candidate.id);
  }, [tab, selectedEventId, events]);

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
          "Test event fired. You should see a popup within a few seconds.",
          "Evento de prueba enviado. Deberías ver un pop‑up en unos segundos."
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

  async function onMarkSwing(tradeId: string) {
    if (!userId || !openPositionsRule) return;
    setBusy(true);
    setFlash(null);
    try {
      const meta: any = (openPositionsRule as any).meta ?? {};
      const ignore = new Set<string>(safeArr(meta.ignore_trade_ids).map((v) => String(v)));
      ignore.add(String(tradeId));

      const nextMeta = { ...meta, ignore_trade_ids: Array.from(ignore) };
      const res = await updateAlertRule(userId, openPositionsRule.id, { meta: nextMeta });
      if (!res.ok) {
        setFlash({ type: "error", msg: res.error || L("Failed to mark swing", "No se pudo marcar como swing") });
        return;
      }

      // Re-run engine so the audit trail refreshes and potentially auto-resolves.
      window.dispatchEvent(new Event("ntj_alert_engine_run_now"));
      setFlash({
        type: "success",
        msg: L(
          "Marked as swing (ignored for open-positions alarm).",
          "Marcado como swing (se ignorará en la alarma de posiciones abiertas)."
        ),
      });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  async function onClosePositionsAtPrice(positions: OpenPosition[], price: number, sourceEvent: AlertEvent) {
    if (!userId || positions.length === 0) return;
    if (!Number.isFinite(price)) return;

    setBusy(true);
    setFlash(null);

    try {
      const closeAtISO = new Date().toISOString();
      const results = await Promise.all(
        positions.map(async (pos) => {
          const tradeId = pos?.id != null ? String(pos.id) : "";
          const looksLikeJournal = tradeId.includes("|") || !!pos.premium || !!pos.strategy;
          if (pos.source === "journal" || pos.source === "notes" || looksLikeJournal) {
            return closeJournalPositionAtPrice(userId, pos, closeAtISO, price);
          }
          if (!tradeId) return { ok: false as const, error: L("Missing trade id", "Falta el id de trade") };
          return closeTradeAtPrice(userId, tradeId, closeAtISO, price);
        })
      );

      const failed = results.find((r) => !r.ok) as any;
      if (failed) {
        setFlash({ type: "error", msg: failed.error || L("Failed closing position(s)", "No se pudieron cerrar posiciones") });
        return;
      }

      const actionType = price === 0 ? "close_at_zero" : "close_at_price";
      await patchAlertEventPayload(userId, sourceEvent.id, {
        last_action: { type: actionType, at: closeAtISO, trade_ids: positions.map((p) => p?.id).filter(Boolean), price },
      });

      // Re-run engine so the alarm updates/auto-resolves.
      window.dispatchEvent(new Event("ntj_alert_engine_run_now"));

      setFlash({
        type: "success",
        msg: L(
          `Closed ${positions.length} position(s) at $${price}.`,
          `Se cerraron ${positions.length} posiciones en $${price}.`
        ),
      });
      setClosePriceByTrade((prev) => {
        const next = { ...prev };
        positions.forEach((p) => {
          const tradeId = p?.id != null ? String(p.id) : "";
          if (tradeId) delete next[tradeId];
        });
        return next;
      });
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  const auditOpenPositions = extractOpenPositionsFromEvent(selectedEvent);
  const auditExpiring = extractExpiringOptionsFromEvent(selectedEvent);
  const auditOpenCount = useMemo(() => {
    const payload: any = selectedEvent?.payload ?? {};
    const stats = payload?.stats ?? payload?.meta ?? {};
    const n = typeof stats?.open_positions === "number" ? stats.open_positions : Number(stats?.open_positions ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [selectedEvent]);

  const expiringPositions = useMemo(() => {
    const list = auditExpiring.filter((p) => p && p.id !== null && p.id !== undefined);
    return list;
  }, [auditExpiring]);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
          <div className="text-[11px] uppercase tracking-[0.32em] text-emerald-400">
            {L("Rules & Alarms • Alarms", "Reglas y alarmas • Alarmas")}
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-100">
            {L("Active alarms & audit trail", "Alarmas activas y auditoría")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            {L(
              "Monitor open positions, expiring options, and key risk rules. When an alarm fires, resolve it with a snooze, dismissal, or a close-at-price action.",
              "Monitorea posiciones abiertas, opciones por expirar y reglas clave de riesgo. Cuando se dispare una alarma, resuélvela con posponer, descartar o cerrar a precio."
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
        <KpiCard label={L("Active alarms", "Alarmas activas")} value={String(activeEvents.length)} sub={L("Currently firing", "Disparándose ahora")} />
        <KpiCard label={L("Snoozed", "Pospuestas")} value={String(snoozedEvents.length)} sub={L("Hidden temporarily", "Ocultas temporalmente")} />
        <KpiCard
          label={L("Rules enabled", "Reglas activas")}
          value={String(rules.filter((r) => r.enabled).length)}
          sub={L("Alarms configured", "Alarmas configuradas")}
        />
      </div>

        <div className="mt-6 flex flex-wrap gap-2">
        {[
          ["active", L(`Active (${activeEvents.length})`, `Activas (${activeEvents.length})`)],
          ["rules", L(`Rules (${rules.length})`, `Reglas (${rules.length})`)],
          ["audit", L("Audit trail", "Auditoría")],
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
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Active alarms", "Alarmas activas")}</div>
                <p className="mt-2 text-sm text-slate-400">
                  {L(
                    "Click an alarm to see evidence, context, and recommended actions.",
                    "Haz clic en una alarma para ver evidencia, contexto y acciones recomendadas."
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={L("Search alarms...", "Buscar alarmas...")}
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
                  {L("No alarms match your filters.", "No hay alarmas que coincidan con tus filtros.")}
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
                        <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("alarm", "alarma")}</span>
                      </div>
                      <div className="text-xs text-slate-400">{fmtDate(e.triggered_at)}</div>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-100">{e.title || L("Alarm", "Alarma")}</div>
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
                  <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Alarm detail", "Detalle de alarma")}</div>
                  <p className="mt-2 text-sm text-slate-400">{L("Evidence, action plan, and controls.", "Evidencia, plan de acción y controles.")}</p>
                </div>
                {selectedEvent ? <SeverityPill severity={selectedEvent.severity} /> : null}
              </div>

              {!selectedEvent ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
                  {L("Select an alarm from the left to inspect details and actions.", "Selecciona una alarma a la izquierda para ver detalles y acciones.")}
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div>
                    <div className="text-xl font-semibold text-slate-100">{selectedEvent.title}</div>
                    <div className="mt-2 text-sm text-slate-300">{selectedEvent.message}</div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Created", "Creada")}</div>
                      <div className="mt-1 text-sm text-slate-200">{fmtDate(selectedEvent.triggered_at)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{L("Category", "Categoría")}</div>
                      <div className="mt-1 text-sm text-slate-200">{selectedEvent.category || L("alarm", "alarma")}</div>
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

                  <details className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-300">{L("View raw metadata", "Ver metadatos crudos")}</summary>
                    <pre className="mt-3 max-h-56 overflow-auto text-xs text-slate-300">
                      {JSON.stringify(selectedEvent.payload ?? {}, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Quick controls", "Controles rápidos")}</div>
              <p className="mt-2 text-sm text-slate-400">{L("Snoozing hides the alarm until the chosen time.", "Posponer oculta la alarma hasta el momento elegido.")}</p>
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
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Alarm rules", "Reglas de alarmas")}</div>
              <p className="mt-2 text-sm text-slate-400">{L("Toggle rules on/off and trigger test alarms.", "Activa o desactiva reglas y dispara pruebas.")}</p>
            </div>
            <div className="text-xs text-slate-400">{busy ? L("Working…", "Trabajando…") : ""}</div>
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
                        {L("Channels:", "Canales:")}{" "}
                        <span className="text-slate-300 font-medium">{channelsLabel(r.channels ?? [])}</span>
                      </div>
                      {(r as any).meta?.ignore_trade_ids?.length ? (
                        <div className="text-xs text-slate-500">
                          {L("Ignoring", "Ignorando")} {(r as any).meta.ignore_trade_ids.length}{" "}
                          {L("position(s)", "posición(es)")}
                        </div>
                      ) : null}
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
                        {L("Popup", "Pop‑up")}{" "}
                        {((r.channels ?? []).includes("popup")) ? L("On", "Activado") : L("Off", "Desactivado")}
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

                      {openPositionsRule?.id === r.id && (r as any).meta?.ignore_trade_ids?.length ? (
                        <button
                          className="rounded-lg border border-amber-800 bg-amber-950/30 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-950/60"
                          onClick={async () => {
                            if (!userId) return;
                            setBusy(true);
                            setFlash(null);
                            try {
                              const meta: any = (r as any).meta ?? {};
                              const res = await updateAlertRule(userId, r.id, { meta: { ...meta, ignore_trade_ids: [] } });
                              if (!res.ok) {
                                setFlash({ type: "error", msg: res.error || L("Failed to clear ignores", "No se pudieron limpiar los ignorados") });
                              }
                              window.dispatchEvent(new Event("ntj_alert_engine_run_now"));
                              await refreshAll();
                            } finally {
                              setBusy(false);
                            }
                          }}
                          disabled={busy}
                        >
                          {L("Clear ignored", "Limpiar ignorados")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

        {tab === "audit" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Audit trail", "Auditoría")}</div>
                <p className="mt-2 text-sm text-slate-400">
                  {L(
                    "Open positions detected by the engine. Mark swings to ignore in future checks.",
                    "Posiciones abiertas detectadas por el motor. Marca swings para ignorarlas en futuros checks."
                  )}
                </p>
              </div>
              <div className="text-xs text-slate-500">
                {selectedEvent ? L(`From ${fmtDate(selectedEvent.triggered_at)}`, `Desde ${fmtDate(selectedEvent.triggered_at)}`) : ""}
              </div>
            </div>

            {!selectedEvent ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
                  {L("No audit event selected. Pick an active alarm first.", "No hay evento de auditoría seleccionado. Elige una alarma activa primero.")}
                </div>
            ) : (
              <div className="mt-4 space-y-3">
                {auditOpenPositions.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4 text-sm text-slate-400">
                    {auditOpenCount > 0
                      ? L(
                          `Open positions detected (${auditOpenCount}), but details are missing. Save your journal trades or sync trades to enable audit actions.`,
                          `Se detectaron posiciones abiertas (${auditOpenCount}), pero faltan detalles. Guarda tus trades del journal o sincroniza trades para habilitar acciones de auditoría.`
                        )
                      : L("No open positions detected.", "No se detectaron posiciones abiertas.")}
                  </div>
                ) : (
                  auditOpenPositions.map((p, idx) => {
                    const id = p?.id;
                    const tradeId = id !== null && id !== undefined ? String(id) : "";
                    const symbol = p?.symbol ?? "—";
                    const qty = p?.qty ?? null;
                    const assetType = p?.asset_type ?? null;
                    const exp = p?.expiration ?? null;
                    const journalDate = p?.journal_date ?? null;

                    return (
                      <div
                        key={`${tradeId}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-100">{symbol}</div>
                          <div className="text-xs text-slate-400">
                            {assetType ? `${assetType}` : L("position", "posición")}
                            {qty !== null ? L(` • qty ${qty}`, ` • qty ${qty}`) : ""}
                            {exp ? L(` • exp ${exp}`, ` • exp ${exp}`) : ""}
                          </div>
                          <div className="text-[11px] text-slate-500">{L("trade id:", "trade id:")} {tradeId || "—"}</div>
                          {journalDate ? (
                            <div className="text-[11px] text-slate-500">{L("journal date:", "fecha de journal:")} {journalDate}</div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 gap-2">
                          {journalDate ? (
                            <Link
                              href={`/journal/${journalDate}`}
                              className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                            >
                              {L("Open journal", "Abrir journal")}
                            </Link>
                          ) : null}
                          <button
                            className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                            onClick={() => onMarkSwing(tradeId)}
                            disabled={!tradeId || busy || !openPositionsRule}
                          >
                            {L("Mark swing", "Marcar swing")}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Expiring options", "Opciones por expirar")}</div>
                <p className="mt-2 text-sm text-slate-400">
                  {L(
                    "Close expiring premium strategies at $0, or specify a custom close price.",
                    "Cierra estrategias de prima por expirar en $0 o especifica un precio de cierre."
                  )}
                </p>
              </div>
              <div className="text-xs text-slate-500">
                {selectedEvent ? L(`From ${fmtDate(selectedEvent.triggered_at)}`, `Desde ${fmtDate(selectedEvent.triggered_at)}`) : ""}
              </div>
            </div>

            {!selectedEvent ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-sm text-slate-400">
                  {L("No audit event selected. Pick an active alarm first.", "No hay evento de auditoría seleccionado. Elige una alarma activa primero.")}
                </div>
            ) : (
              <div className="mt-4 space-y-3">
                {auditExpiring.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/30 p-4 text-sm text-slate-400">
                    {L("No expiring options found.", "No se encontraron opciones por expirar.")}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
                        onClick={() => selectedEvent && onClosePositionsAtPrice(expiringPositions, 0, selectedEvent)}
                        disabled={busy || !selectedEvent || expiringPositions.length === 0}
                      >
                        {L("Close all at $0", "Cerrar todo a $0")}
                      </button>
                    </div>

                    {auditExpiring.map((p, idx) => {
                      const id = p?.id;
                      const tradeId = id !== null && id !== undefined ? String(id) : "";
                      const symbol = p?.symbol ?? "—";
                      const qty = p?.qty ?? null;
                      const assetType = p?.asset_type ?? null;
                      const exp = p?.expiration ?? null;
                      const strike = p?.strike ?? null;
                      const optionType = p?.option_type ?? null;
                      const side = p?.side ?? null;
                      const journalDate = p?.journal_date ?? null;

                      const priceStr = closePriceByTrade[tradeId] ?? "";
                      const priceNum = parsePrice(priceStr);

                      return (
                        <div
                          key={`${tradeId}-${idx}`}
                          className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-100">{symbol}</div>
                              <div className="text-xs text-slate-400">
                                {assetType ? `${assetType}` : L("option", "opción")}
                                {qty !== null ? L(` • qty ${qty}`, ` • qty ${qty}`) : ""}
                                {strike !== null ? ` • ${strike}` : ""}
                                {optionType ? ` • ${optionType}` : ""}
                                {side ? ` • ${side}` : ""}
                                {exp ? L(` • exp ${exp}`, ` • exp ${exp}`) : ""}
                              </div>
                              <div className="text-[11px] text-slate-500">{L("trade id:", "trade id:")} {tradeId || "—"}</div>
                              {journalDate ? (
                                <div className="text-[11px] text-slate-500">{L("journal date:", "fecha de journal:")} {journalDate}</div>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {journalDate ? (
                                <Link
                                  href={`/journal/${journalDate}`}
                                  className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                                >
                                  {L("Open journal", "Abrir journal")}
                                </Link>
                              ) : null}
                              <button
                                className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                                onClick={() => selectedEvent && onClosePositionsAtPrice([p], 0, selectedEvent)}
                                disabled={!tradeId || busy || !selectedEvent}
                              >
                                {L("Close @ $0", "Cerrar @ $0")}
                              </button>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={priceStr}
                              onChange={(e) => setClosePriceByTrade((prev) => ({ ...prev, [tradeId]: e.target.value }))}
                              placeholder={L("Close price", "Precio de cierre")}
                              className="w-32 rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-400"
                            />
                            <button
                              className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400/60 hover:bg-emerald-500/10"
                              onClick={() => selectedEvent && priceNum !== null && onClosePositionsAtPrice([p], priceNum, selectedEvent)}
                              disabled={!tradeId || busy || !selectedEvent || priceNum === null}
                            >
                              {L("Close @ price", "Cerrar @ precio")}
                            </button>
                            {priceNum === null ? (
                              <span className="text-[11px] text-slate-500">{L("Enter a valid price.", "Ingresa un precio válido.")}</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}

        {tab === "history" && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{L("Alarm history", "Historial de alarmas")}</div>
              <p className="mt-2 text-sm text-slate-400">{L("A record of alarms and your actions.", "Registro de alarmas y tus acciones.")}</p>
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
              {L("No alarm history yet.", "Aún no hay historial de alarmas.")}
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
                      <td className="px-4 py-3 text-slate-100">{e.title || L("Alarm", "Alarma")}</td>
                      <td className="px-4 py-3 text-slate-300">{e.dismissed ? L("Dismissed", "Descartada") : e.status}</td>
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
