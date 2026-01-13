// app/rules-alarms/alarms/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

import { supabaseBrowser } from "@/lib/supaBaseClient";
import {
  getAllJournalEntries,
  getJournalEntryByDate,
  saveJournalEntry,
} from "@/lib/journalSupabase";
import { saveJournalTradesForDay } from "@/lib/journalTradesSupabase";

import type { InstrumentType, StoredTradeRow } from "@/lib/journalNotes";

/* =====================================================================================
  Neuro Trader Journal — Rules & Alarms
  - Detects unresolved open positions across the journal (cross-day FIFO ledger).
  - Creates ONE alarm per unresolved open position (per contract/strategy bucket).
  - Expired options (DTE-derived) require user confirmation before resolving to $0.00.
  - Clicking an alarm routes to the Journal Date page where the position originated.
  - Includes starter “rules catalog” toggles + local audit trail history.

  Notes:
  - UI strings are in English (platform requirement). Assistant guidance is Spanish.
  - Expiry is derived from (openDate + dte) if explicit expiry is not stored.
  - Resolution writes BOTH journal_entries.notes (JSON) AND journal_trades rows (via saveJournalTradesForDay),
    so the Journal page and Analytics both converge.
===================================================================================== */

/* =========================
   Types
========================= */

type SideType = "long" | "short";
type PremiumSide = "none" | "debit" | "credit";

type JournalEntryLike = {
  date: string; // YYYY-MM-DD
  notes?: unknown;
  pnl?: number;
  tags?: string[] | null;
  respectedPlan?: boolean | null;

  // allow extra fields from DB
  [k: string]: any;
};

type ParsedNotesPayload = {
  premarket?: string;
  live?: string;
  post?: string;
  entries?: any[];
  exits?: any[];
};

type NormalizedTrade = {
  id: string;
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  premiumSide: PremiumSide;
  optionStrategy: string;
  price: number;
  quantity: number;
  time: string; // HH:MM (best-effort)
  dte: number | null;
  expiry: string | null; // YYYY-MM-DD optional
};

type Fill = {
  date: string; // YYYY-MM-DD
  timeMins: number; // sortable within day
  isEntry: boolean;
  t: NormalizedTrade;
};

type OpenLot = {
  key: string;
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  premiumSide: PremiumSide;
  optionStrategy: string;

  openDate: string;
  openTimeMins: number;

  entryPrice: number;
  qtyLeft: number;
  dte: number | null;
  expiry: string | null; // explicit if available

  lastTouchedDate: string; // last date seen for this symbol (entry/exit) for context
};

type AlarmSeverity = "critical" | "warning" | "info";

type Alarm = {
  id: string;
  type:
    | "EXPIRED_OPTION_UNRESOLVED"
    | "OPEN_POSITION_UNRESOLVED"
    | "MISSING_EMOTIONS"
    | "MISSING_STRATEGY_CHECKLIST"
    | "MISSING_PREMARKET"
    | "CUSTOM";
  severity: AlarmSeverity;

  title: string;
  message: string;

  date: string; // main “anchor” date for routing (usually openDate)
  createdAtIso: string;

  href?: string;

  // payload for actions
  meta?: Record<string, any>;
};

type AlarmRuleId =
  | "expired_options"
  | "open_positions"
  | "missing_emotions"
  | "missing_strategy_checklist"
  | "missing_premarket";

/* =========================
   Constants
========================= */

const EMOTION_TAGS = [
  "Calm",
  "Greedy",
  "Desperate",
  "FOMO",
  "Revenge trade",
  "Focus",
  "Patience",
  "Discipline",
  "Anxiety",
  "Overconfident",
];

const STRATEGY_CHECKLIST_TAGS = [
  "Respect Strategy",
  "Not follow my plan",
  "No respect my plan",
  "Planned stop was in place",
  "Used planned position sizing",
  "Risk-to-reward ≥ 2R (planned)",
  "Risk-to-reward < 1.5R (tight)",
  "Is Vix high?",
  "Is Vix low?",
  "Earnings play",
  "News-driven trade",
  "Momentum trade",
  "Trend Follow Trade",
  "Reversal trade",
  "Scalping trade",
  "swing trade",
  "Options trade",
  "Stock trade",
  "Futures Trade",
  "Forex Trade",
  "Crypto Trade",
];

const DEFAULT_RULES: { id: AlarmRuleId; label: string; description: string; defaultOn: boolean }[] = [
  {
    id: "expired_options",
    label: "Expired options need resolution",
    description:
      "Detects unresolved option positions where (openDate + DTE) is in the past. Requires user confirmation before resolving to $0.00.",
    defaultOn: true,
  },
  {
    id: "open_positions",
    label: "Open positions detected",
    description:
      "Detects unresolved positions across your journal (cross-day FIFO). Useful for swing positions and reconciliation.",
    defaultOn: true,
  },
  {
    id: "missing_emotions",
    label: "Missing emotions (journal hygiene)",
    description:
      "Triggers when a journal day has no emotions selected. High correlation with impulsive loops and hindsight bias.",
    defaultOn: true,
  },
  {
    id: "missing_strategy_checklist",
    label: "Missing strategy checklist (process drift)",
    description:
      "Triggers when a day has no strategy checklist tags. Process drift is a silent P&L leak.",
    defaultOn: true,
  },
  {
    id: "missing_premarket",
    label: "Missing premarket prep",
    description:
      "Triggers when premarket section is empty. Prep is your first risk-control.",
    defaultOn: false,
  },
];

const LS_RULES_KEY = "ntj_alarm_rules_v1";
const LS_SNOOZE_KEY = "ntj_alarm_snoozed_v1";
const LS_HISTORY_KEY = "ntj_alarm_history_v1";

/* =========================
   UI helpers
========================= */

const THEME = {
  grid: "rgba(148,163,184,0.12)",
  axis: "rgba(148,163,184,0.55)",
  text: "rgba(226,232,240,0.92)",
  card: "bg-slate-900/70 border border-slate-800",
};

function wrapCard() {
  return "rounded-2xl border border-slate-800 bg-slate-900/70 shadow-[0_0_30px_rgba(15,23,42,0.55)]";
}

function chartTitle() {
  return "text-[11px] uppercase tracking-[0.22em] text-slate-300";
}
function chartSub() {
  return "text-[11px] text-slate-500 mt-1";
}

function safeUpper(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDateFriendly(dateStr: string) {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function fmtMoney(x: number) {
  const sign = x >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(x).toFixed(2)}`;
}

function toNumberMaybe(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function uuid(): string {
  try {
    // @ts-ignore
    return crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  } catch {
    return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }
}

function parseTimeMins(raw: any): number {
  const s = String(raw ?? "").trim();
  if (!s) return 12 * 60; // neutral midday
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    const hh = clamp(Number(m[1]) || 0, 0, 23);
    const mm = clamp(Number(m[2]) || 0, 0, 59);
    return hh * 60 + mm;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  return 12 * 60;
}

function addDaysIso(baseIso: string, days: number): string | null {
  try {
    const [y, m, d] = baseIso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return isoDate(dt);
  } catch {
    return null;
  }
}

function isBlankHtml(s: string | undefined | null) {
  const x = String(s ?? "").trim();
  if (!x) return true;
  const stripped = x
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<\/?p>/gi, "")
    .replace(/&nbsp;/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length === 0;
}

/* =========================
   Notes parsing (robust)
========================= */

function parseNotesPayload(notesRaw: unknown): ParsedNotesPayload {
  if (!notesRaw) return {};
  if (typeof notesRaw === "object") {
    const o = notesRaw as any;
    return {
      premarket: typeof o?.premarket === "string" ? o.premarket : undefined,
      live: typeof o?.live === "string" ? o.live : undefined,
      post: typeof o?.post === "string" ? o.post : undefined,
      entries: Array.isArray(o?.entries) ? o.entries : [],
      exits: Array.isArray(o?.exits) ? o.exits : [],
    };
  }
  if (typeof notesRaw === "string") {
    try {
      const parsed = JSON.parse(notesRaw);
      if (parsed && typeof parsed === "object") return parseNotesPayload(parsed);
      // raw html fallback
      return { premarket: notesRaw };
    } catch {
      // raw html fallback
      return { premarket: notesRaw };
    }
  }
  return {};
}

function normalizeKind(k: any): InstrumentType {
  return (k || "other") as InstrumentType;
}
function normalizeSide(s: any): SideType {
  return s === "short" ? "short" : "long";
}
function normalizePremiumSide(kind: InstrumentType, raw: any): PremiumSide {
  const k = String(kind || "").toLowerCase();
  const s = String(raw ?? "").toLowerCase().trim();
  if (k.includes("option")) {
    if (s.includes("credit")) return "credit";
    if (s.includes("debit")) return "debit";
    return "debit"; // options default
  }
  return "none";
}
function normalizeOptionStrategy(raw: any): string {
  const s = String(raw ?? "").trim();
  return s ? s : "single";
}

function normalizeTradeRow(raw: any): NormalizedTrade | null {
  if (!raw || typeof raw !== "object") return null;
  const symbol = safeUpper(raw.symbol);
  if (!symbol) return null;

  const kind = normalizeKind(raw.kind);
  const side = normalizeSide(raw.side);
  const premiumSide = normalizePremiumSide(kind, raw.premiumSide ?? raw.premium);
  const optionStrategy = normalizeOptionStrategy(raw.optionStrategy ?? raw.strategy);

  const price = toNumberMaybe(raw.price);
  const quantity = toNumberMaybe(raw.quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  const time = String(raw.time ?? "").trim();
  const dteRaw = raw.dte;
  const dte =
    typeof dteRaw === "number" && Number.isFinite(dteRaw)
      ? dteRaw
      : typeof dteRaw === "string" && dteRaw.trim()
      ? Number(dteRaw)
      : null;
  const expiry = typeof raw.expiry === "string" && raw.expiry.includes("-") ? raw.expiry : null;

  return {
    id: String(raw.id ?? uuid()),
    symbol,
    kind,
    side,
    premiumSide,
    optionStrategy,
    price: Number.isFinite(price) ? price : 0,
    quantity,
    time,
    dte: Number.isFinite(dte as any) ? (dte as number) : null,
    expiry,
  };
}

/* =========================
   Cross-day FIFO ledger
========================= */

function buildFills(entries: JournalEntryLike[]): { fills: Fill[]; sessionMeta: Record<string, ParsedNotesPayload> } {
  const fills: Fill[] = [];
  const sessionMeta: Record<string, ParsedNotesPayload> = {};

  for (const e of entries) {
    const date = String(e.date || "").slice(0, 10);
    if (!date) continue;

    const payload = parseNotesPayload(e.notes);
    sessionMeta[date] = payload;

    const ent = Array.isArray(payload.entries) ? payload.entries : [];
    const ex = Array.isArray(payload.exits) ? payload.exits : [];

    for (const r of ent) {
      const t = normalizeTradeRow(r);
      if (!t) continue;
      fills.push({ date, timeMins: parseTimeMins(t.time), isEntry: true, t });
    }
    for (const r of ex) {
      const t = normalizeTradeRow(r);
      if (!t) continue;
      fills.push({ date, timeMins: parseTimeMins(t.time), isEntry: false, t });
    }
  }

  fills.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.timeMins - b.timeMins));

  return { fills, sessionMeta };
}

function keyExact(t: NormalizedTrade) {
  return `${t.symbol}|${t.kind}|${t.side}|${t.premiumSide}|${t.optionStrategy}`;
}
function keyLooseNoStrat(t: NormalizedTrade) {
  return `${t.symbol}|${t.kind}|${t.side}|${t.premiumSide}|*`;
}
function keyLooseSymbolKindSide(t: NormalizedTrade) {
  return `${t.symbol}|${t.kind}|${t.side}|*|*`;
}

function processFifo(fills: Fill[]): OpenLot[] {
  const openByExact = new Map<string, OpenLot[]>();
  const lastTouchedBySymbol: Record<string, string> = {};

  const pushLot = (k: string, lot: OpenLot) => {
    const arr = openByExact.get(k) ?? [];
    arr.push(lot);
    openByExact.set(k, arr);
  };

  const getCandidates = (t: NormalizedTrade): { key: string; lots: OpenLot[] }[] => {
    const out: { key: string; lots: OpenLot[] }[] = [];

    const k1 = keyExact(t);
    const a1 = openByExact.get(k1);
    if (a1 && a1.length) out.push({ key: k1, lots: a1 });

    // if strategy mismatched, try any strategy bucket for the same premiumSide
    const k2 = keyLooseNoStrat(t);
    for (const [k, lots] of openByExact.entries()) {
      if (!lots.length) continue;
      if (k.startsWith(k2.replace("|*", ""))) {
        out.push({ key: k, lots });
      }
    }

    // last-resort: symbol-kind-side ignoring premium + strat
    const k3 = keyLooseSymbolKindSide(t);
    for (const [k, lots] of openByExact.entries()) {
      if (!lots.length) continue;
      if (k.startsWith(k3.replace("|*|*", ""))) {
        out.push({ key: k, lots });
      }
    }

    // de-dupe keys keeping insertion order
    const seen = new Set<string>();
    return out.filter((x) => {
      if (seen.has(x.key)) return false;
      seen.add(x.key);
      return true;
    });
  };

  for (const f of fills) {
    const t = f.t;
    lastTouchedBySymbol[t.symbol] = f.date;

    if (f.isEntry) {
      const k = keyExact(t);
      pushLot(k, {
        key: k,
        symbol: t.symbol,
        kind: t.kind,
        side: t.side,
        premiumSide: t.premiumSide,
        optionStrategy: t.optionStrategy,
        openDate: f.date,
        openTimeMins: f.timeMins,
        entryPrice: t.price,
        qtyLeft: t.quantity,
        dte: t.dte,
        expiry: t.expiry,
        lastTouchedDate: f.date,
      });
      continue;
    }

    // EXIT — close FIFO
    let qtyToClose = t.quantity;
    const candidates = getCandidates(t);

    for (const c of candidates) {
      if (qtyToClose <= 0) break;
      const lots = c.lots;

      while (qtyToClose > 0 && lots.length > 0) {
        const lot = lots[0];

        // refresh "last touched" for context
        lot.lastTouchedDate = f.date;

        const take = Math.min(lot.qtyLeft, qtyToClose);
        lot.qtyLeft -= take;
        qtyToClose -= take;

        if (lot.qtyLeft <= 0.0000001) lots.shift();
      }

      if (!lots.length) openByExact.set(c.key, []);
    }

    // If qtyToClose remains > 0, it's an orphan exit; we do nothing (keeps system conservative).
  }

  const out: OpenLot[] = [];
  for (const lots of openByExact.values()) {
    for (const lot of lots) {
      if (lot.qtyLeft > 0.0000001) {
        lot.lastTouchedDate = lastTouchedBySymbol[lot.symbol] ?? lot.lastTouchedDate;
        out.push(lot);
      }
    }
  }

  // stable ordering: older first (most urgent)
  out.sort((a, b) => (a.openDate < b.openDate ? -1 : a.openDate > b.openDate ? 1 : a.openTimeMins - b.openTimeMins));
  return out;
}

/* =========================
   Resolution PnL (FIFO, same-day only)
   - Used only to update journal_entries.pnl when we append a synthetic exit in that same journal day.
========================= */

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

function futureRoot(symbol: string) {
  const s = safeUpper(symbol).replace(/^\//, "");
  const m = s.match(/^([A-Z]{1,4})/);
  return m?.[1] ?? s;
}

function contractMultiplier(kind: InstrumentType, symbol: string) {
  if (kind === "option") return 100;
  if (kind === "future") return FUTURES_MULTIPLIERS[futureRoot(symbol)] ?? 1;
  return 1;
}

function pnlSign(kind: InstrumentType, side: SideType, premiumSide: PremiumSide) {
  if (kind === "option") {
    return premiumSide === "credit" ? -1 : 1;
  }
  return side === "short" ? -1 : 1;
}

function computeAutoPnLForDay(entriesRaw: any[], exitsRaw: any[]): number {
  const entries: NormalizedTrade[] = [];
  const exits: NormalizedTrade[] = [];

  for (const r of entriesRaw || []) {
    const t = normalizeTradeRow(r);
    if (t) entries.push(t);
  }
  for (const r of exitsRaw || []) {
    const t = normalizeTradeRow(r);
    if (t) exits.push(t);
  }

  type Lot = {
    price: number;
    qtyLeft: number;
    symbol: string;
    kind: InstrumentType;
    side: SideType;
    premiumSide: PremiumSide;
    optionStrategy: string;
  };

  const lotsByKey: Record<string, Lot[]> = {};
  const k = (t: NormalizedTrade) => `${t.symbol}|${t.kind}|${t.side}|${t.premiumSide}|${t.optionStrategy}`;

  for (const e of entries) {
    const key = k(e);
    lotsByKey[key] ||= [];
    lotsByKey[key].push({
      price: e.price,
      qtyLeft: e.quantity,
      symbol: e.symbol,
      kind: e.kind,
      side: e.side,
      premiumSide: e.premiumSide,
      optionStrategy: e.optionStrategy,
    });
  }

  let total = 0;

  for (const x of exits) {
    const key = k(x);
    const lots = lotsByKey[key];
    if (!lots || !lots.length) continue;

    let exitQty = x.quantity;
    const sign = pnlSign(x.kind, x.side, x.premiumSide);
    const mult = contractMultiplier(x.kind, x.symbol);
    const exitPx = x.price;

    while (exitQty > 0 && lots.length > 0) {
      const lot = lots[0];
      const closeQty = Math.min(lot.qtyLeft, exitQty);

      total += (exitPx - lot.price) * closeQty * sign * mult;

      lot.qtyLeft -= closeQty;
      exitQty -= closeQty;

      if (lot.qtyLeft <= 0.0000001) lots.shift();
    }
  }

  return Number(total.toFixed(2));
}

/* =========================
   Rules storage (local)
========================= */

function loadRuleState(): Record<AlarmRuleId, boolean> {
  const base = Object.fromEntries(DEFAULT_RULES.map((r) => [r.id, r.defaultOn])) as Record<
    AlarmRuleId,
    boolean
  >;

  if (typeof window === "undefined") return base;

  try {
    const raw = localStorage.getItem(LS_RULES_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Record<AlarmRuleId, boolean>>;
    return { ...base, ...(parsed || {}) };
  } catch {
    return base;
  }
}

function saveRuleState(state: Record<AlarmRuleId, boolean>) {
  try {
    localStorage.setItem(LS_RULES_KEY, JSON.stringify(state));
  } catch {}
}

type SnoozeMap = Record<string, string>; // alarmId -> untilIso
function loadSnoozed(): SnoozeMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SnoozeMap;
    return parsed || {};
  } catch {
    return {};
  }
}
function saveSnoozed(m: SnoozeMap) {
  try {
    localStorage.setItem(LS_SNOOZE_KEY, JSON.stringify(m));
  } catch {}
}

type HistoryItem = {
  id: string;
  createdAtIso: string;
  action: "RESOLVE_TO_ZERO";
  openDate: string;
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  premiumSide: PremiumSide;
  optionStrategy: string;
  qty: number;
  expiryDerived?: string | null;
};

function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function saveHistory(items: HistoryItem[]) {
  try {
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(items.slice(0, 400)));
  } catch {}
}

/* =========================
   Tooltip that renders ABOVE (fixed + portalless)
========================= */

function useAnchoredTooltip() {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const r = el.getBoundingClientRect();
      setPos({
        top: Math.max(8, r.top - 10),
        left: Math.min(window.innerWidth - 12, Math.max(12, r.left + r.width / 2)),
      });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  return { ref, open, setOpen, pos };
}

function InfoTip({ text }: { text: string }) {
  const { ref, open, setOpen, pos } = useAnchoredTooltip();

  return (
    <>
      <span
        ref={ref}
        className="relative inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 text-[11px] text-slate-300 hover:text-emerald-200 cursor-help"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
        aria-label="Info"
      >
        i
      </span>

      {open && pos && (
        <div
          className="fixed z-200 w-[320px] -translate-x-1/2 -translate-y-full rounded-2xl border border-slate-700 bg-slate-950/95 p-3 text-[11px] leading-relaxed text-slate-100 shadow-[0_0_30px_rgba(0,0,0,0.65)]"
          style={{ top: pos.top, left: pos.left }}
          role="tooltip"
        >
          {text}
        </div>
      )}
    </>
  );
}

/* =========================
   Modal
========================= */

function ConfirmModal({
  open,
  title,
  body,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-500 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onCancel} />
      <div className="relative w-[92vw] max-w-[640px] rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-[0_0_40px_rgba(0,0,0,0.75)]">
        <p className="text-slate-100 text-lg font-semibold">{title}</p>
        <div className="mt-3 text-sm text-slate-300 leading-relaxed">{body}</div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:border-slate-500 transition disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
              danger
                ? "bg-rose-500 text-white hover:bg-rose-400"
                : "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
            }`}
          >
            {busy ? "Working…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Page
========================= */

export default function RulesAlarmsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const userId = (user as any)?.id as string | undefined;

  const [loadingData, setLoadingData] = useState(true);
  const [entries, setEntries] = useState<JournalEntryLike[]>([]);

  const [tab, setTab] = useState<"alarms" | "rules" | "history">("alarms");

  const [ruleState, setRuleState] = useState<Record<AlarmRuleId, boolean>>(() => loadRuleState());
  const [snoozed, setSnoozed] = useState<SnoozeMap>(() => loadSnoozed());
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<AlarmSeverity | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<Alarm["type"] | "ALL">("ALL");

  const [selectedAlarmId, setSelectedAlarmId] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAlarm, setConfirmAlarm] = useState<Alarm | null>(null);
  const [busyResolve, setBusyResolve] = useState(false);

  // auth gate
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  // Load all journal entries (user scope). Alarms are computed client-side.
  useEffect(() => {
    if (loading || !userId) return;

    let alive = true;
    const run = async () => {
      try {
        setLoadingData(true);
        const all = await getAllJournalEntries(userId);
        if (!alive) return;
        setEntries(Array.isArray(all) ? (all as any) : []);
      } catch (e) {
        console.error("[rules-alarms] load error", e);
        if (alive) setEntries([]);
      } finally {
        if (alive) setLoadingData(false);
      }
    };
    run();

    return () => {
      alive = false;
    };
  }, [loading, userId]);

  // Persist rule toggles + snoozes + history
  useEffect(() => saveRuleState(ruleState), [ruleState]);
  useEffect(() => saveSnoozed(snoozed), [snoozed]);
  useEffect(() => saveHistory(history), [history]);

  // Clean up expired snoozes occasionally
  useEffect(() => {
    const now = new Date();
    const cleaned: SnoozeMap = { ...snoozed };
    let changed = false;

    for (const [id, untilIso] of Object.entries(cleaned)) {
      const d = new Date(untilIso);
      if (Number.isNaN(d.getTime()) || d <= now) {
        delete cleaned[id];
        changed = true;
      }
    }

    if (changed) setSnoozed(cleaned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayIso = useMemo(() => isoDate(new Date()), []);

  /* -----------------------------
     Build fills + open lots (cross-day)
  ----------------------------- */
  const { fills, sessionMeta } = useMemo(() => buildFills(entries), [entries]);

  const openLots = useMemo(() => {
    if (!ruleState.open_positions && !ruleState.expired_options) return [];
    return processFifo(fills);
  }, [fills, ruleState.open_positions, ruleState.expired_options]);

  /* -----------------------------
     Generate alarms
  ----------------------------- */
  const alarmsAll: Alarm[] = useMemo(() => {
    const out: Alarm[] = [];
    const nowIso = new Date().toISOString();

    const tagsForDate = (date: string): string[] => {
      const e = entries.find((x) => String(x.date).slice(0, 10) === date);
      const tags = (e?.tags ?? []) as any;
      return Array.isArray(tags) ? tags.map((t) => String(t)) : [];
    };

    const hasAnyTag = (tags: string[], pool: string[]) => {
      const set = new Set(tags.map((t) => safeUpper(t)));
      for (const p of pool) if (set.has(safeUpper(p))) return true;
      return false;
    };

    // 1) Open positions (including expired options)
    for (const lot of openLots) {
      const isOption = lot.kind === "option";

      // expiry: prefer explicit; else derive from openDate + dte
      const expiryDerived =
        lot.expiry && lot.expiry.includes("-")
          ? lot.expiry
          : typeof lot.dte === "number" && Number.isFinite(lot.dte)
          ? addDaysIso(lot.openDate, lot.dte)
          : null;

      const isExpired = isOption && !!expiryDerived && todayIso >= expiryDerived;

      // filter: expired vs open
      if (isExpired && !ruleState.expired_options) continue;
      if (!isExpired && !ruleState.open_positions) continue;

      const id = `${isExpired ? "exp" : "open"}|${lot.openDate}|${lot.symbol}|${lot.kind}|${lot.side}|${lot.premiumSide}|${lot.optionStrategy}`;

      const premiumTone =
        lot.kind === "option" && lot.premiumSide === "credit" ? "Premium credit (short volatility)" : "Debit premium (defined risk)";

      if (isExpired) {
        out.push({
          id,
          type: "EXPIRED_OPTION_UNRESOLVED",
          severity: "warning",
          title: "Expired option needs confirmation",
          message: `Unresolved option position is past expiry. Confirm resolution to $0.00 to clean your ledger. (${premiumTone})`,
          date: lot.openDate,
          createdAtIso: nowIso,
          href: `/journal/${lot.openDate}?focus=${encodeURIComponent(lot.symbol)}`,
          meta: {
            lot,
            expiryDerived,
            isExpired,
          },
        });
      } else {
        out.push({
          id,
          type: "OPEN_POSITION_UNRESOLVED",
          severity: "info",
          title: "Open position detected",
          message: `Unresolved position remains open in your ledger. Review or reconcile via import/exit entry.`,
          date: lot.openDate,
          createdAtIso: nowIso,
          href: `/journal/${lot.openDate}?focus=${encodeURIComponent(lot.symbol)}`,
          meta: {
            lot,
            expiryDerived,
            isExpired,
          },
        });
      }
    }

    // 2) Journal hygiene alarms (per day)
    // Keep this bounded: latest 120 days based on available entries
    const sortedDates = [...entries]
      .map((e) => String(e.date).slice(0, 10))
      .filter(Boolean)
      .sort((a, b) => (a < b ? 1 : -1))
      .slice(0, 120);

    for (const date of sortedDates) {
      const tags = tagsForDate(date);
      const payload = sessionMeta[date] ?? {};
      const premarketEmpty = isBlankHtml(payload?.premarket);

      if (ruleState.missing_emotions && !hasAnyTag(tags, EMOTION_TAGS)) {
        out.push({
          id: `emo|${date}`,
          type: "MISSING_EMOTIONS",
          severity: "info",
          title: "Journal hygiene: emotions missing",
          message: "No emotions selected for this day. Emotional labeling reduces impulsive loops.",
          date,
          createdAtIso: nowIso,
          href: `/journal/${date}`,
          meta: { date },
        });
      }

      if (ruleState.missing_strategy_checklist && !hasAnyTag(tags, STRATEGY_CHECKLIST_TAGS)) {
        out.push({
          id: `chk|${date}`,
          type: "MISSING_STRATEGY_CHECKLIST",
          severity: "info",
          title: "Process drift: checklist missing",
          message: "No strategy checklist tags found. Process drift is a silent performance leak.",
          date,
          createdAtIso: nowIso,
          href: `/journal/${date}`,
          meta: { date },
        });
      }

      if (ruleState.missing_premarket && premarketEmpty) {
        out.push({
          id: `pm|${date}`,
          type: "MISSING_PREMARKET",
          severity: "info",
          title: "Premarket prep missing",
          message: "Premarket section is empty. Prep is your first risk-control.",
          date,
          createdAtIso: nowIso,
          href: `/journal/${date}`,
          meta: { date },
        });
      }
    }

    // 3) Custom alarms (placeholder container — can be extended later)
    // For now: none.

    // Apply snoozes
    const now = new Date();
    const snoozedIds = new Set<string>();
    for (const [id, untilIso] of Object.entries(snoozed || {})) {
      const d = new Date(untilIso);
      if (!Number.isNaN(d.getTime()) && d > now) snoozedIds.add(id);
    }

    return out.filter((a) => !snoozedIds.has(a.id));
  }, [entries, openLots, ruleState, sessionMeta, snoozed, todayIso]);

  const alarmsFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alarmsAll
      .filter((a) => (severityFilter === "ALL" ? true : a.severity === severityFilter))
      .filter((a) => (typeFilter === "ALL" ? true : a.type === typeFilter))
      .filter((a) => {
        if (!q) return true;
        const hay = `${a.title} ${a.message} ${a.date} ${a.type}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        // severity first
        const rank = (s: AlarmSeverity) => (s === "critical" ? 3 : s === "warning" ? 2 : 1);
        const r = rank(b.severity) - rank(a.severity);
        if (r !== 0) return r;
        // newest date first
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return a.id < b.id ? 1 : -1;
      });
  }, [alarmsAll, query, severityFilter, typeFilter]);

  const selectedAlarm = useMemo(() => {
    if (!selectedAlarmId) return alarmsFiltered[0] ?? null;
    return alarmsFiltered.find((a) => a.id === selectedAlarmId) ?? alarmsFiltered[0] ?? null;
  }, [alarmsFiltered, selectedAlarmId]);

  useEffect(() => {
    if (!selectedAlarmId && alarmsFiltered.length) setSelectedAlarmId(alarmsFiltered[0].id);
  }, [alarmsFiltered, selectedAlarmId]);

  /* -----------------------------
     Actions: Snooze + Resolve
  ----------------------------- */

  const snoozeAlarm = (alarmId: string, hours: number) => {
    const until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    setSnoozed((prev) => ({ ...(prev || {}), [alarmId]: until }));
  };

  const openResolveConfirm = (alarm: Alarm) => {
    setConfirmAlarm(alarm);
    setConfirmOpen(true);
  };

  const closeConfirm = () => {
    if (busyResolve) return;
    setConfirmOpen(false);
    setConfirmAlarm(null);
  };

  async function resolveExpiredOptionToZero(alarm: Alarm) {
    if (!userId) return;
    if (alarm.type !== "EXPIRED_OPTION_UNRESOLVED") return;

    const lot = alarm.meta?.lot as OpenLot | undefined;
    if (!lot) return;

    setBusyResolve(true);

    try {
      // 1) Load journal entry by date (source of truth for notes payload)
      const openDate = lot.openDate;
      const existing = await getJournalEntryByDate(userId, openDate);

      if (!existing) {
        throw new Error(`Cannot resolve: journal entry not found for ${openDate}.`);
      }

      // 2) Parse notes payload, append synthetic exit (UI format)
      const payload = parseNotesPayload((existing as any).notes);

      const entArr = Array.isArray(payload.entries) ? payload.entries : [];
      const exArr = Array.isArray(payload.exits) ? payload.exits : [];

      // Compute remaining qty for this key within THIS day payload (conservative)
      // If the day doesn't contain the entry rows (import model differs), we still append exit into this day
      // to satisfy the “where it is open” UX and to clear analytics open-positions.
      const remainingQty = Math.max(0, Number(lot.qtyLeft) || 0);
      if (remainingQty <= 0) {
        // nothing to do
        snoozeAlarm(alarm.id, 72);
        return;
      }

      const syntheticExitUi = {
        id: uuid(),
        symbol: lot.symbol,
        kind: lot.kind,
        side: lot.side,
        premiumSide: lot.premiumSide,
        optionStrategy: lot.optionStrategy,
        price: "0",
        quantity: String(remainingQty),
        time: "EXP",
        dte: 0,
        expiry: null,
      };

      const nextPayload: ParsedNotesPayload = {
        ...payload,
        entries: entArr,
        exits: [...exArr, syntheticExitUi],
      };

      const nextNotesStr = JSON.stringify(nextPayload);

      // 3) Update PnL for that journal day (same-day FIFO)
      const nextPnl = computeAutoPnLForDay(nextPayload.entries || [], nextPayload.exits || []);

      // 4) Save journal entry (notes + pnl)
      const entryToSave = {
        ...(existing as any),
        user_id: userId,
        date: openDate,
        notes: nextNotesStr,
        pnl: nextPnl,
      };

      await saveJournalEntry(userId, entryToSave as any);

      // 5) Save journal_trades rows to match payload (keeps DB + notes consistent)
      const toStored = (r: any): StoredTradeRow => {
        const t = normalizeTradeRow(r);
        return {
          id: t?.id ?? uuid(),
          symbol: t?.symbol ?? "",
          kind: (t?.kind ?? "other") as any,
          side: (t?.side ?? "long") as any,
          premiumSide: (t as any)?.premiumSide,
          optionStrategy: (t as any)?.optionStrategy,
          price: Number(t?.price ?? 0),
          quantity: Number(t?.quantity ?? 0),
          time: String(t?.time ?? ""),
          dte: t?.dte ?? undefined,
          // keep additional fields untouched (future schema)
        } as any;
      };

      const storedEntries = (nextPayload.entries || []).map(toStored).filter((x) => x.symbol);
      const storedExits = (nextPayload.exits || []).map(toStored).filter((x) => x.symbol);

      await saveJournalTradesForDay(userId, openDate, { entries: storedEntries, exits: storedExits } as any);

      // 6) Update local cache so alarms recompute instantly
      setEntries((prev) =>
        (prev || []).map((e) =>
          String(e.date).slice(0, 10) === openDate ? { ...(e as any), notes: nextNotesStr, pnl: nextPnl } : e
        )
      );

      // 7) Audit trail (local) + best-effort DB write
      const histItem: HistoryItem = {
        id: uuid(),
        createdAtIso: new Date().toISOString(),
        action: "RESOLVE_TO_ZERO",
        openDate,
        symbol: lot.symbol,
        kind: lot.kind,
        side: lot.side,
        premiumSide: lot.premiumSide,
        optionStrategy: lot.optionStrategy,
        qty: remainingQty,
        expiryDerived: alarm.meta?.expiryDerived ?? null,
      };

      setHistory((prev) => [histItem, ...(prev || [])].slice(0, 300));

      // Optional DB insert (won't break if table doesn't exist)
      try {
        await supabaseBrowser.from("ntj_resolution_runs").insert([
          {
            user_id: userId,
            created_at: histItem.createdAtIso,
            action: histItem.action,
            open_date: histItem.openDate,
            symbol: histItem.symbol,
            kind: histItem.kind,
            side: histItem.side,
            premium_side: histItem.premiumSide,
            option_strategy: histItem.optionStrategy,
            qty: histItem.qty,
            expiry_derived: histItem.expiryDerived,
          },
        ]);
      } catch {
        // ignore if not configured yet
      }

      // 8) Snooze the alarm after successful resolve (it will also disappear because position is closed)
      snoozeAlarm(alarm.id, 24);
    } catch (err: any) {
      console.error("[resolveExpiredOptionToZero] error", err);
      alert(err?.message ?? "Resolution failed. Check console logs.");
    } finally {
      setBusyResolve(false);
    }
  }

  /* =========================
     Render
  ========================= */

  if (loading || !user || loadingData) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading rules & alarms…</p>
      </main>
    );
  }

  const totals = {
    active: alarmsFiltered.length,
    expired: alarmsFiltered.filter((a) => a.type === "EXPIRED_OPTION_UNRESOLVED").length,
    open: alarmsFiltered.filter((a) => a.type === "OPEN_POSITION_UNRESOLVED").length,
  };

  const severityBadge = (sev: AlarmSeverity) => {
    if (sev === "critical") return "border-rose-500/40 bg-rose-500/10 text-rose-200";
    if (sev === "warning") return "border-amber-400/40 bg-amber-400/10 text-amber-100";
    return "border-slate-600/45 bg-slate-800/40 text-slate-200";
  };

  const typeLabel = (t: Alarm["type"]) => {
    if (t === "EXPIRED_OPTION_UNRESOLVED") return "Expired option";
    if (t === "OPEN_POSITION_UNRESOLVED") return "Open position";
    if (t === "MISSING_EMOTIONS") return "Journal hygiene";
    if (t === "MISSING_STRATEGY_CHECKLIST") return "Process drift";
    if (t === "MISSING_PREMARKET") return "Premarket";
    return "Custom";
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-4 md:px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <header className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">
                  Rules & Alarms
                </p>
                <h1 className="text-3xl md:text-4xl font-semibold mt-1">
                  Alerts, guardrails, and audit trail
                </h1>
                <p className="text-sm md:text-base text-slate-400 mt-2 max-w-3xl">
                  System-grade alerts: unresolved positions, expired options requiring confirmation, and journal hygiene.
                  Built to keep traders disciplined, not discouraged.
                </p>
              </div>

              <div className="flex flex-col items-start md:items-end gap-2">
                <Link
                  href="/dashboard"
                  className="px-3 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs md:text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
                >
                  ← Back to dashboard
                </Link>
                <p className="text-[11px] text-slate-500">
                  Active alarms:{" "}
                  <span className="text-emerald-300 font-semibold">{totals.active}</span>
                </p>
              </div>
            </div>

            {/* Tabs */}
            <section className={wrapCard()}>
              <div className="p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "alarms", label: "Alarms" },
                    { id: "rules", label: "Rules" },
                    { id: "history", label: "History" },
                  ].map((t) => {
                    const active = tab === (t.id as any);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id as any)}
                        className={`px-3 py-1.5 rounded-full text-xs md:text-sm border transition ${
                          active
                            ? "bg-emerald-400 text-slate-950 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.30)]"
                            : "bg-slate-950 text-slate-200 border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                    <span className="font-mono">{totals.expired}</span> expired
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                    <span className="font-mono">{totals.open}</span> open
                  </div>
                </div>
              </div>
            </section>
          </header>

          {/* ============= Alarms Tab ============= */}
          {tab === "alarms" && (
            <section className="grid grid-cols-1 lg:grid-cols-[1fr,420px] gap-4">
              {/* List */}
              <div className={wrapCard()}>
                <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                  <div>
                    <p className={chartTitle()}>Active alarms</p>
                    <p className={chartSub()}>
                      Click an alarm to review. Expired options require confirmation before resolving to $0.00.
                    </p>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-end gap-2">
                    <div>
                      <span className="text-[11px] text-slate-500 font-mono">SEARCH</span>
                      <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="symbol, date, type…"
                        className="mt-1 w-full md:w-60 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <div>
                        <span className="text-[11px] text-slate-500 font-mono">SEVERITY</span>
                        <select
                          value={severityFilter}
                          onChange={(e) => setSeverityFilter(e.target.value as any)}
                          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                        >
                          <option value="ALL">All</option>
                          <option value="critical">Critical</option>
                          <option value="warning">Warning</option>
                          <option value="info">Info</option>
                        </select>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-500 font-mono">TYPE</span>
                        <select
                          value={typeFilter}
                          onChange={(e) => setTypeFilter(e.target.value as any)}
                          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                        >
                          <option value="ALL">All</option>
                          <option value="EXPIRED_OPTION_UNRESOLVED">Expired option</option>
                          <option value="OPEN_POSITION_UNRESOLVED">Open position</option>
                          <option value="MISSING_EMOTIONS">Missing emotions</option>
                          <option value="MISSING_STRATEGY_CHECKLIST">Missing checklist</option>
                          <option value="MISSING_PREMARKET">Missing premarket</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-2 max-h-[66vh] overflow-auto">
                  {alarmsFiltered.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                      <p className="text-slate-200 text-sm font-medium">No alarms right now</p>
                      <p className="text-slate-500 text-sm mt-1">
                        Clean ledger, clean mind. If you expected alarms, check Rules toggles and your journal data.
                      </p>
                    </div>
                  ) : (
                    alarmsFiltered.map((a) => {
                      const active = a.id === selectedAlarmId;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setSelectedAlarmId(a.id)}
                          className={`w-full text-left rounded-2xl border p-4 transition ${
                            active
                              ? "border-emerald-400/60 bg-emerald-400/5 shadow-[0_0_25px_rgba(16,185,129,0.10)]"
                              : "border-slate-800 bg-slate-950/40 hover:bg-slate-950/65"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-slate-100 font-medium">{a.title}</p>
                              <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">
                                {a.message}
                              </p>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              <span className={`px-2 py-1 rounded-full text-[11px] border ${severityBadge(a.severity)}`}>
                                {a.severity.toUpperCase()}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                {typeLabel(a.type)}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono">
                                {formatDateFriendly(a.date)}
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Detail */}
              <div className={`${wrapCard()} lg:sticky lg:top-6 h-fit`}>
                <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <p className={chartTitle()}>Alarm detail</p>
                    <p className={chartSub()}>Review context, then take action.</p>
                  </div>
                  <InfoTip text="Expired options are not auto-closed. Traders must confirm a synthetic exit at $0.00 to keep the ledger and psychology clean. This prevents hidden open-risk and distorted stats." />
                </div>

                <div className="p-4">
                  {!selectedAlarm ? (
                    <p className="text-slate-500 text-sm">Select an alarm.</p>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold text-slate-100">{selectedAlarm.title}</p>
                          <p className="text-sm text-slate-400 mt-1 leading-relaxed">{selectedAlarm.message}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-[11px] border ${severityBadge(selectedAlarm.severity)}`}>
                          {selectedAlarm.severity.toUpperCase()}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Type</p>
                          <p className="text-sm text-slate-200 mt-1">{typeLabel(selectedAlarm.type)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Date</p>
                          <p className="text-sm text-slate-200 mt-1">{formatDateFriendly(selectedAlarm.date)}</p>
                        </div>
                      </div>

                      {/* Open-lot details */}
                      {selectedAlarm.meta?.lot && (
                        <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                            Position details
                          </p>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-[11px] text-slate-500">Symbol</p>
                              <p className="font-mono text-slate-100">{selectedAlarm.meta.lot.symbol}</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-slate-500">Kind</p>
                              <p className="font-mono text-slate-100">{selectedAlarm.meta.lot.kind}</p>
                            </div>

                            <div>
                              <p className="text-[11px] text-slate-500">Side</p>
                              <p className="font-mono text-slate-100">{selectedAlarm.meta.lot.side}</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-slate-500">Premium</p>
                              <p className="font-mono text-slate-100">{selectedAlarm.meta.lot.premiumSide}</p>
                            </div>

                            <div>
                              <p className="text-[11px] text-slate-500">Strategy</p>
                              <p className="font-mono text-slate-100">{selectedAlarm.meta.lot.optionStrategy}</p>
                            </div>
                            <div>
                              <p className="text-[11px] text-slate-500">Remaining</p>
                              <p className="font-mono text-slate-100">{Number(selectedAlarm.meta.lot.qtyLeft).toFixed(2)}</p>
                            </div>

                            <div className="col-span-2">
                              <p className="text-[11px] text-slate-500">Expiry (derived)</p>
                              <p className="font-mono text-slate-100">
                                {selectedAlarm.meta.expiryDerived ?? "—"}{" "}
                                {selectedAlarm.meta.isExpired ? (
                                  <span className="ml-2 text-amber-200">EXPIRED</span>
                                ) : (
                                  <span className="ml-2 text-slate-400">not expired</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mt-4 flex flex-col gap-2">
                        {selectedAlarm.href && (
                          <Link
                            href={selectedAlarm.href}
                            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:border-emerald-400 hover:text-emerald-300 transition text-center"
                          >
                            Review in Journal
                          </Link>
                        )}

                        {selectedAlarm.type === "EXPIRED_OPTION_UNRESOLVED" && (
                          <button
                            type="button"
                            onClick={() => openResolveConfirm(selectedAlarm)}
                            className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-sm font-semibold hover:bg-emerald-300 transition"
                          >
                            Resolve to $0.00 (confirm)
                          </button>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => snoozeAlarm(selectedAlarm.id, 24)}
                            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:border-slate-500 transition"
                          >
                            Snooze 24h
                          </button>
                          <button
                            type="button"
                            onClick={() => snoozeAlarm(selectedAlarm.id, 72)}
                            className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:border-slate-500 transition"
                          >
                            Snooze 3d
                          </button>
                        </div>

                        <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                          Tip: If you imported broker data and still see an open position, it often means an expiration
                          event did not create a closing fill. Use “Resolve to $0.00” after confirming.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Confirm modal */}
              <ConfirmModal
                open={confirmOpen}
                title="Confirm resolution to $0.00"
                body={
                  <>
                    <p>
                      This will append a <span className="text-emerald-300 font-semibold">synthetic exit</span> at{" "}
                      <span className="font-mono text-slate-100">$0.00</span> to the original journal day, in order to
                      remove unresolved expired options from your open positions.
                    </p>
                    <p className="mt-2 text-[13px] text-slate-400">
                      This is a ledger hygiene operation. It does not change your broker statement, and it is only done
                      after your confirmation.
                    </p>
                    {confirmAlarm?.meta?.lot && (
                      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-[13px] text-slate-200">
                        <p className="font-mono">
                          {confirmAlarm.meta.lot.symbol} · {confirmAlarm.meta.lot.kind} · {confirmAlarm.meta.lot.side} ·{" "}
                          {confirmAlarm.meta.lot.premiumSide} · qty {Number(confirmAlarm.meta.lot.qtyLeft).toFixed(2)}
                        </p>
                        <p className="text-[12px] text-slate-500 mt-1">
                          Date: {confirmAlarm.meta.lot.openDate} · Expiry (derived): {confirmAlarm.meta.expiryDerived ?? "—"}
                        </p>
                      </div>
                    )}
                  </>
                }
                confirmText="Yes, resolve to $0.00"
                cancelText="Cancel"
                onCancel={closeConfirm}
                onConfirm={() => {
                  if (!confirmAlarm) return;
                  resolveExpiredOptionToZero(confirmAlarm);
                  closeConfirm();
                }}
                busy={busyResolve}
              />
            </section>
          )}

          {/* ============= Rules Tab ============= */}
          {tab === "rules" && (
            <section className="space-y-4">
              <div className={wrapCard()}>
                <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <p className={chartTitle()}>Alarm rules catalog</p>
                    <p className={chartSub()}>
                      Choose which system alarms you want enabled. These are guardrails — not punishments.
                    </p>
                  </div>
                  <InfoTip text="Rules are evaluated from your Journal Date pages. For scale, these will later be persisted server-side (Supabase) per user. For now: local settings." />
                </div>

                <div className="p-4 space-y-3">
                  {DEFAULT_RULES.map((r) => {
                    const on = !!ruleState[r.id];
                    return (
                      <div
                        key={r.id}
                        className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3"
                      >
                        <div>
                          <p className="text-slate-100 font-medium">{r.label}</p>
                          <p className="text-sm text-slate-500 mt-1 leading-relaxed">{r.description}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 font-mono">{r.id}</span>
                          <button
                            type="button"
                            onClick={() =>
                              setRuleState((prev) => ({ ...prev, [r.id]: !prev[r.id] }))
                            }
                            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                              on
                                ? "bg-emerald-400 text-slate-950 border-emerald-300 hover:bg-emerald-300"
                                : "bg-slate-950 text-slate-200 border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
                            }`}
                          >
                            {on ? "Enabled" : "Disabled"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 border-t border-slate-800">
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Next step: custom alarms (user-defined) + server persistence + notification channels.
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ============= History Tab ============= */}
          {tab === "history" && (
            <section className="space-y-4">
              <div className={wrapCard()}>
                <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
                  <div>
                    <p className={chartTitle()}>Audit trail</p>
                    <p className={chartSub()}>
                      Confirmed actions are recorded. This protects both the trader and the platform.
                    </p>
                  </div>
                  <InfoTip text="This is stored locally right now (and optionally in a Supabase table if you create ntj_resolution_runs). Next: full server-side audit with searchable runs and exports." />
                </div>

                <div className="p-4 overflow-x-auto">
                  {history.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                      <p className="text-slate-200 text-sm font-medium">No history yet</p>
                      <p className="text-slate-500 text-sm mt-1">
                        When you resolve expired options to $0.00, you will see an audit record here.
                      </p>
                    </div>
                  ) : (
                    <table className="min-w-[980px] w-full text-sm">
                      <thead>
                        <tr className="text-[11px] uppercase tracking-[0.22em] text-slate-500 border-b border-slate-800">
                          <th className="px-3 py-2 text-left">Time</th>
                          <th className="px-3 py-2 text-left">Action</th>
                          <th className="px-3 py-2 text-left">Open date</th>
                          <th className="px-3 py-2 text-left">Symbol</th>
                          <th className="px-3 py-2 text-left">Kind</th>
                          <th className="px-3 py-2 text-left">Premium</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-left">Expiry (derived)</th>
                          <th className="px-3 py-2 text-left">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.slice(0, 200).map((h) => (
                          <tr key={h.id} className="border-t border-slate-800 bg-slate-950/35 hover:bg-slate-950/55 transition">
                            <td className="px-3 py-2 text-slate-300">
                              {new Date(h.createdAtIso).toLocaleString()}
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-200">{h.action}</td>
                            <td className="px-3 py-2 font-mono text-slate-200">{h.openDate}</td>
                            <td className="px-3 py-2 font-mono text-slate-100">{h.symbol}</td>
                            <td className="px-3 py-2 font-mono text-slate-200">{h.kind}</td>
                            <td className="px-3 py-2 font-mono text-slate-200">{h.premiumSide}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-200">{h.qty.toFixed(2)}</td>
                            <td className="px-3 py-2 font-mono text-slate-300">{h.expiryDerived ?? "—"}</td>
                            <td className="px-3 py-2">
                              <Link
                                href={`/journal/${h.openDate}?focus=${encodeURIComponent(h.symbol)}`}
                                className="text-emerald-300 hover:text-emerald-200 underline"
                              >
                                Open journal
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
