// app/analytics-statistics/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, Fragment } from "react";
import type { ReactNode } from "react";
import type { ApexOptions } from "apexcharts";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";

import { type InstrumentType } from "@/lib/journalNotes";
import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import { listDailySnapshots, type DailySnapshotRow } from "@/lib/snapshotSupabase";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// ECharts (client-only)
const EChartsReact = dynamic(() => import("echarts-for-react"), { ssr: false });
// ApexCharts (client-only)
const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/* =========================
   Types
========================= */

type AnalyticsGroupId =
  | "overview"
  | "day-of-week"
  | "psychology"
  | "instruments"
  | "terminal"
  | "statistics";
type DayOfWeekKey = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type SideType = "long" | "short";
type PremiumSide = "none" | "debit" | "credit";

type EntryTradeRow = {
  id?: string;
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  price: string;
  quantity: string;
  time: string;
  dte?: number | null;
  expiry?: string | null;
  underlying?: string | null;

  premiumSide?: PremiumSide | string;
  optionStrategy?: string | null;

  // optional fee fields (broker imports)
  feesUsd?: number | string;
  fees_usd?: number | string;
  fee?: number | string;
  fees?: number | string;
  commissionUsd?: number | string;
  commission_usd?: number | string;
  commission?: number | string;
  commissions?: number | string;
  commissionsUsd?: number | string;
  commissions_usd?: number | string;

  // optional future KPIs (if you later persist them)
  riskPct?: number | string;
  rewardPct?: number | string;
};

type ExitTradeRow = EntryTradeRow;

type SessionWithTrades = JournalEntry & {
  entries: EntryTradeRow[];
  exits: ExitTradeRow[];
  uniqueSymbols: string[];
  uniqueKinds: InstrumentType[];
  uniqueUnderlyings: string[];
  perSymbolPnL: Record<string, number>;
  perUnderlyingPnL: Record<string, number>;
  pnlComputed: number;
  feesUsd: number;
  pnlNet: number;
  isGreenComputed: boolean;
  isLearningComputed: boolean;
  isFlatComputed: boolean;
  firstHour: number | null;
};

type AnalyticsSnapshot = {
  updatedAt?: string;
  totals?: {
    totalSessions?: number;
    greenSessions?: number;
    learningSessions?: number;
    flatSessions?: number;
    sumPnl?: number;
    avgPnl?: number;
    baseGreenRate?: number;
  };
  series?: {
    equityCurve?: { date: string; value: number }[];
    dayOfWeek?: {
      dow: number;
      label: string;
      winRate: number;
      sessions: number;
      avgPnl: number;
    }[];
    dailyPnl?: { date: string; pnl: number }[];
  };
  edges?: {
    symbols?: {
      symbol: string;
      sessions: number;
      winRate: number;
      netPnl: number;
      avgPnlPerSession?: number;
    }[];
    underlyings?: {
      underlying: string;
      sessions: number;
      winRate: number;
      netPnl: number;
      avgPnlPerSession?: number;
    }[];
  };
  usage?: {
    premarketFillRate?: number;
    aiUsageRate?: number;
    aiUsedSessions?: number;
  };
};

/* =========================
   Constants
========================= */

const DAY_LABELS: Record<DayOfWeekKey, string> = {
  0: "Sunday",
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
};

const GROUPS: { id: AnalyticsGroupId; label: string; description: string }[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Global performance, probabilities, and curve.",
  },
  {
    id: "day-of-week",
    label: "Day of week",
    description: "Weekday edge & distribution.",
  },
  {
    id: "psychology",
    label: "Psychology",
    description: "Emotions, plan adherence & mistakes (from Journal tags).",
  },
  {
    id: "instruments",
    label: "Instruments",
    description: "Symbols, underlyings, kinds, and edge tables.",
  },
  {
    id: "terminal",
    label: "Terminal",
    description: "Terminal panels: heatmaps + advanced chart engines.",
  },
  {
    id: "statistics",
    label: "Statistics",
    description: "Wall-Street style KPI terminal with strategy split + filters.",
  },
];

const STRATEGY_TAGS = [
  "News-driven trade",
  "Momentum trade",
  "Trend Follow Trade",
  "Reversal trade",
  "Scalping trade",
  "Swing trade",
  "Options trade",
  "Stock trade",
  "Futures Trade",
  "Forex Trade",
  "Crypto Trade",
] as const;

const PSYCHOLOGY_TAGS = [
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
] as const;

type KpiCategory =
  | "Trades"
  | "P&L"
  | "Costs"
  | "Streaks"
  | "Risk & RRR"
  | "Time"
  | "Account";

/* =========================
   Terminal Theme
========================= */

const CHART_COLORS = {
  emerald: "#34d399",
  emeraldDim: "rgba(52, 211, 153, 0.14)",
  sky: "#38bdf8",
  skyDim: "rgba(56, 189, 248, 0.14)",
  danger: "#fb7185",
  dangerDim: "rgba(251, 113, 133, 0.14)",
  grid: "rgba(148, 163, 184, 0.12)",
  axis: "rgba(148, 163, 184, 0.55)",
  text: "rgba(226, 232, 240, 0.92)",
};

function axisStyle() {
  return { fill: CHART_COLORS.axis, fontSize: 11 };
}

function tooltipProps() {
  return {
    contentStyle: {
      background: "rgba(2,6,23,0.94)",
      border: "1px solid rgba(148,163,184,0.18)",
      borderRadius: 14,
      boxShadow: "0 0 30px rgba(0,0,0,0.55)",
      color: CHART_COLORS.text,
      fontSize: 12,
    },
    itemStyle: { color: CHART_COLORS.text },
    labelStyle: { color: "rgba(148,163,184,0.9)" },
    cursor: { stroke: "rgba(148,163,184,0.18)" },
  } as const;
}

function wrapCard() {
  return "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-[0_0_30px_rgba(15,23,42,0.75)]";
}
function chartTitle() {
  return "text-[11px] uppercase tracking-[0.22em] text-slate-300";
}
function chartSub() {
  return "text-[11px] text-slate-500 mt-1";
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function fmtMoney(x: number) {
  const sign = x >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(x).toFixed(2)}`;
}

function formatDateFriendly(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function safeUpper(s: string) {
  return (s || "").trim().toUpperCase();
}

function normalizeKind(k: any): InstrumentType {
  return (k || "other") as InstrumentType;
}

function normalizeSide(s: any): SideType {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "short") return "short";
  return "long";
}

/* =========================
   Date Range (presets + calendar)
========================= */

type RangePreset = "ALL" | "YTD" | "LAST_YEAR" | "LAST_90D" | "LAST_30D" | "CUSTOM";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfDayUtc(dateIso: string) {
  // include entire day
  return new Date(`${dateIso}T00:00:00.000Z`);
}
function endOfDayUtc(dateIso: string) {
  return new Date(`${dateIso}T23:59:59.999Z`);
}

function computePreset(preset: Exclude<RangePreset, "CUSTOM">) {
  const now = new Date();
  const end = new Date(now);
  const start = new Date(now);

  if (preset === "ALL") {
    // wide enough default; you can later compute from earliest session
    start.setFullYear(now.getFullYear() - 5);
  } else if (preset === "YTD") {
    start.setMonth(0, 1);
  } else if (preset === "LAST_YEAR") {
    start.setFullYear(now.getFullYear() - 1);
  } else if (preset === "LAST_90D") {
    start.setDate(now.getDate() - 90);
  } else if (preset === "LAST_30D") {
    start.setDate(now.getDate() - 30);
  }

  return { startIso: isoDate(start), endIso: isoDate(end) };
}

/* =========================
   Parsers / helpers (FIXED)
========================= */

// FIX: supports notes as string OR jsonb/object.
function parseNotesTrades(
  notesRaw: unknown
): { entries: EntryTradeRow[]; exits: ExitTradeRow[] } {
  if (!notesRaw) return { entries: [], exits: [] };

  // jsonb/object already
  if (typeof notesRaw === "object") {
    const parsed = notesRaw as any;
    return {
      entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
      exits: Array.isArray(parsed?.exits) ? parsed.exits : [],
    };
  }

  // string JSON
  if (typeof notesRaw === "string") {
    try {
      const parsed = JSON.parse(notesRaw);
      return {
        entries: Array.isArray((parsed as any)?.entries)
          ? (parsed as any).entries
          : [],
        exits: Array.isArray((parsed as any)?.exits)
          ? (parsed as any).exits
          : [],
      };
    } catch {
      return { entries: [], exits: [] };
    }
  }

  return { entries: [], exits: [] };
}

function parseOCCOptionSymbol(raw: string) {
  const s = safeUpper(raw).replace(/\s+/g, "").replace(/^[\.\-]/, "");
  const m = s.match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
  if (!m) return null;
  const underlying = m[1];
  const yy = Number(m[2].slice(0, 2));
  const mm = Number(m[2].slice(2, 4));
  const dd = Number(m[2].slice(4, 6));
  const year = 2000 + yy;
  const expiry = new Date(year, mm - 1, dd);
  if (Number.isNaN(expiry.getTime())) return null;
  return { underlying, expiry };
}

function parseSPXLikeOptionExpiryIso(raw: string): string | null {
  const s = safeUpper(raw).replace(/\s+/g, "").replace(/^[\.\-]/, "");
  // SPXW251121C6565 / SPX251121P6000
  const m = s.match(/^([A-Z]+W?)(\d{6})([CP])(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const yy = Number(m[2].slice(0, 2));
  const mm = Number(m[2].slice(2, 4));
  const dd = Number(m[2].slice(4, 6));
  const year = 2000 + yy;
  const expiry = new Date(year, mm - 1, dd);
  if (Number.isNaN(expiry.getTime())) return null;
  return isoDate(expiry);
}

function getUnderlyingFromSymbol(raw: string): string {
  const s = safeUpper(raw).replace(/^[\.\-]/, "");
  if (!s) return "";
  const occ = parseOCCOptionSymbol(s);
  if (occ?.underlying) return occ.underlying;

  const fut = s.match(/^([A-Z]{1,3})[FGHJKMNQUVXZ]\d{1,2}$/);
  if (fut?.[1]) return fut[1];

  const root = s.match(/^([A-Z]{1,6})/);
  return root?.[1] ?? s;
}

function parseHourBucket(t: unknown): number | null {
  if (!t) return null;
  const s = String(t).trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{1,2}):(\d{2})/);
  if (m1) {
    const hh = Number(m1[1]);
    if (Number.isFinite(hh) && hh >= 0 && hh <= 23) return hh;
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getHours();
  return null;
}

function countTruthyFields(obj: any, keys: string[]) {
  let c = 0;
  for (const k of keys) {
    const v = obj?.[k];
    if (Array.isArray(v)) {
      if (v.length > 0) c++;
    } else if (typeof v === "string") {
      if (v.trim().length > 0) c++;
    } else if (typeof v === "number") {
      if (Number.isFinite(v)) c++;
    } else if (typeof v === "boolean") {
      if (v) c++;
    } else if (v != null) {
      c++;
    }
  }
  return c;
}

// FIX: single source of truth for session P&L used everywhere
function sessionNet(s: any): number {
  const v = Number(s?.pnlNet ?? s?.pnlComputed ?? s?.pnl ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function toNumberMaybe(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function extractSessionFeesUsd(session: any): number {
  if (!session || typeof session !== "object") return 0;
  const keys = [
    "feesUsd",
    "fees_usd",
    "feesUSD",
    "fees",
    "fee",
    "commissionUsd",
    "commission_usd",
    "commissionsUsd",
    "commissions_usd",
    "commission",
    "commissions",
    "totalFees",
    "totalFeesUsd",
    "totalCommission",
    "totalCommissions",
  ];
  for (const k of keys) {
    if (k in session) {
      const n = toNumberMaybe((session as any)[k]);
      if (n !== 0) return n;
    }
  }
  return 0;
}

function sumFeesFromTrades(entries: EntryTradeRow[], exits: ExitTradeRow[]): number {
  const keys = [
    "feesUsd",
    "fees_usd",
    "fees",
    "fee",
    "commissionUsd",
    "commission_usd",
    "commissionsUsd",
    "commissions_usd",
    "commission",
    "commissions",
  ];

  let total = 0;

  const addFrom = (t: any) => {
    if (!t || typeof t !== "object") return;
    for (const k of keys) {
      if (k in t) {
        const n = toNumberMaybe(t[k]);
        if (Number.isFinite(n) && n !== 0) total += n;
      }
    }
  };

  for (const e of entries || []) addFrom(e);
  for (const x of exits || []) addFrom(x);

  return total;
}

function computePnLBySymbol(
  entries: EntryTradeRow[],
  exits: ExitTradeRow[]
): Record<string, number> {
  const key = (s: string, k: InstrumentType, side: SideType) => `${s}|${k}|${side}`;
  const entryAgg: Record<string, { sumPxQty: number; sumQty: number }> = {};
  const exitAgg: Record<string, { sumPxQty: number; sumQty: number }> = {};

  for (const e of entries) {
    const sym = safeUpper(e.symbol);
    if (!sym) continue;
    const k = key(sym, normalizeKind(e.kind), normalizeSide(e.side));
    const px = parseFloat(e.price);
    const qty = parseFloat(e.quantity);
    if (!Number.isFinite(px) || !Number.isFinite(qty) || qty <= 0) continue;
    entryAgg[k] ||= { sumPxQty: 0, sumQty: 0 };
    entryAgg[k].sumPxQty += px * qty;
    entryAgg[k].sumQty += qty;
  }

  for (const x of exits) {
    const sym = safeUpper(x.symbol);
    if (!sym) continue;
    const k = key(sym, normalizeKind(x.kind), normalizeSide(x.side));
    const px = parseFloat(x.price);
    const qty = parseFloat(x.quantity);
    if (!Number.isFinite(px) || !Number.isFinite(qty) || qty <= 0) continue;
    exitAgg[k] ||= { sumPxQty: 0, sumQty: 0 };
    exitAgg[k].sumPxQty += px * qty;
    exitAgg[k].sumQty += qty;
  }

  const out: Record<string, number> = {};
  for (const k of Object.keys(exitAgg)) {
    const e = entryAgg[k];
    const x = exitAgg[k];
    if (!e || !x) continue;

    const avgEntry = e.sumPxQty / e.sumQty;
    const avgExit = x.sumPxQty / x.sumQty;
    const closedQty = Math.min(e.sumQty, x.sumQty);

    const [symbol, kind, side] = k.split("|") as [string, string, SideType];
    const sign = side === "short" ? -1 : 1;

    const kindStr = String(kind || "").toLowerCase();
    const multiplier = kindStr.includes("opt") || kindStr.includes("option") ? 100 : 1;

    const pnl = (avgExit - avgEntry) * closedQty * sign * multiplier;
    out[symbol] = (out[symbol] || 0) + pnl;
  }

  return out;
}

function safeDateFromSession(s: any): Date | null {
  const cands = [
    s?.date,
    s?.sessionDate,
    s?.created_at,
    s?.updated_at,
    s?.timestamp,
  ].filter((x: any) => typeof x === "string");
  for (const c of cands) {
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

const DEFAULT_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

/* =========================
   UI bits
========================= */

function futuristicCardClass(isGood: boolean) {
  return isGood
    ? "rounded-2xl border border-emerald-500/35 bg-emerald-500/5 shadow-[0_0_25px_rgba(16,185,129,0.12)]"
    : "rounded-2xl border border-sky-500/35 bg-sky-500/5 shadow-[0_0_25px_rgba(56,189,248,0.10)]";
}

function StatCard({
  label,
  value,
  sub,
  good = true,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  good?: boolean;
}) {
  return (
    <div className={`${futuristicCardClass(good)} p-4`}>
      <p className={`text-xs mb-1 ${good ? "text-emerald-200" : "text-sky-200"}`}>
        {label}
      </p>
      <p className={`text-3xl font-semibold ${good ? "text-emerald-300" : "text-sky-300"}`}>
        {value}
      </p>
      {sub && <div className="text-[11px] text-slate-400 mt-2 leading-relaxed">{sub}</div>}
    </div>
  );
}

function MiniKpi({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: "good" | "bad" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
      ? "text-sky-300"
      : "text-slate-200";
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2 hover:border-slate-700 transition">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className={`text-sm font-mono mt-1 ${cls}`}>{value}</p>
    </div>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center">
      <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 text-[11px] text-slate-300 hover:text-emerald-200">
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-[300px] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-950/95 p-3 text-[11px] leading-relaxed text-slate-200 shadow-[0_0_25px_rgba(0,0,0,0.6)] opacity-0 transition group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
}

/* =========================
   Terminal: Time heatmap (DOW × Hour)
========================= */

type TimeHeatCell = {
  dow: DayOfWeekKey;
  hour: number;
  n: number;
  wins: number;
  avgNet: number;
  winRate: number;
};
type TimeHeatMapData = { hours: number[]; rows: { label: string; cells: TimeHeatCell[] }[] };

function clampToHours(h: number, hours: number[]) {
  if (!hours.length) return h;
  let best = hours[0];
  let bestD = Math.abs(h - best);
  for (const x of hours) {
    const d = Math.abs(h - x);
    if (d < bestD) {
      bestD = d;
      best = x;
    }
  }
  return best;
}

function inferFirstHourFromSession(s: any): number | null {
  const candidates: string[] = [];
  if (typeof s?.created_at === "string") candidates.push(s.created_at);
  if (typeof s?.date === "string") candidates.push(s.date);
  if (typeof s?.sessionDate === "string") candidates.push(s.sessionDate);
  if (typeof s?.timestamp === "string") candidates.push(s.timestamp);

  for (const c of candidates) {
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d.getHours();
  }

  const t = s?.entries?.[0]?.time;
  if (typeof t === "string" && t.includes(":")) {
    const hh = Number(t.split(":")[0]);
    if (Number.isFinite(hh)) return hh;
  }
  return null;
}

function buildDowHourTimeHeat(
  sessions: SessionWithTrades[],
  hours: number[] = DEFAULT_HOURS
): TimeHeatMapData {
  const map = new Map<string, { n: number; wins: number; sumNet: number }>();

  for (const s of sessions) {
    const dt = safeDateFromSession(s);
    const dow = (dt ? (dt.getDay() as DayOfWeekKey) : 0) as DayOfWeekKey;

    const hourRaw =
      typeof s.firstHour === "number" && Number.isFinite(s.firstHour)
        ? s.firstHour
        : inferFirstHourFromSession(s);

    if (hourRaw == null) continue;

    const hour = clampToHours(hourRaw, hours);
    const key = `${dow}|${hour}`;

    const net = sessionNet(s);
    const cur = map.get(key) ?? { n: 0, wins: 0, sumNet: 0 };
    cur.n += 1;
    if (net > 0) cur.wins += 1;
    cur.sumNet += net;
    map.set(key, cur);
  }

  const rows = (Object.keys(DAY_LABELS) as unknown as DayOfWeekKey[])
    .sort((a, b) => Number(a) - Number(b))
    .map((dow) => {
      const cells: TimeHeatCell[] = hours.map((hour) => {
        const key = `${dow}|${hour}`;
        const v = map.get(key) ?? { n: 0, wins: 0, sumNet: 0 };
        const avgNet = v.n ? v.sumNet / v.n : 0;
        const winRate = v.n ? (v.wins / v.n) * 100 : 0;
        return { dow, hour, n: v.n, wins: v.wins, avgNet, winRate };
      });
      return { label: DAY_LABELS[dow], cells };
    });

  return { hours, rows };
}

function TimeHeatMap({
  title,
  sub,
  data,
}: {
  title: string;
  sub?: string;
  data: TimeHeatMapData;
}) {
  return (
    <div className={wrapCard()}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className={chartTitle()}>{title}</p>
          {sub ? <p className={chartSub()}>{sub}</p> : null}
        </div>
        <span className="text-[11px] text-slate-500 font-mono">HEAT</span>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[760px]">
          <div
            className="grid"
            style={{ gridTemplateColumns: `120px repeat(${data.hours.length}, minmax(42px, 1fr))` }}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 py-2">
              Day
            </div>
            {data.hours.map((h) => (
              <div key={h} className="text-[10px] uppercase tracking-[0.18em] text-slate-500 py-2 text-center">
                {String(h).padStart(2, "0")}
              </div>
            ))}

            {data.rows.map((r) => (
              <Fragment key={r.label}>
                <div className="py-2 pr-2 text-xs text-slate-200 font-mono">{r.label}</div>
                {r.cells.map((c) => {
                  const intensity = c.n ? Math.min(1, c.winRate / 100) : 0;
                  return (
                    <div
                      key={`${c.dow}-${c.hour}`}
                      className="h-10 rounded-xl border border-slate-800/80 flex items-center justify-center text-[11px] font-mono"
                      style={{
                        background: c.n
                          ? `rgba(52,211,153,${0.10 + intensity * 0.40})`
                          : "rgba(15,23,42,0.25)",
                      }}
                      title={`${r.label} @ ${c.hour}:00 — ${c.n} sess • win ${c.winRate.toFixed(
                        1
                      )}% • avg ${fmtMoney(c.avgNet)}`}
                    >
                      {c.n ? `${c.winRate.toFixed(0)}%` : "—"}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>

          <p className="mt-3 text-[11px] text-slate-500">
            Global win-rate by time bucket (net P&amp;L after fees).
          </p>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Trade Ledger (FIFO across date range)
   - Closes trades when exits exist
   - Auto-closes expired CREDIT options (no exit) at 0.00
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
  const s = (symbol || "").trim().toUpperCase().replace(/^\//, "");
  const m = s.match(/^([A-Z]{1,4})/);
  return m?.[1] ?? s;
}

function normalizePremiumSide(kind: InstrumentType, raw?: any, side?: any): PremiumSide {
  const s = String(raw ?? "").toLowerCase().trim();

  if (kind !== "option") return "none";

  if (s.includes("credit")) return "credit";
  if (s.includes("debit")) return "debit";

  // If missing premiumSide, infer from side when possible
  const sideStr = String(side ?? "").toLowerCase().trim();
  if (sideStr === "short") return "credit";

  // Default option behavior (Journal default): debit
  return "debit";
}

function pnlSign(kind: InstrumentType, side: SideType, premiumSide: PremiumSide): number {
  if (kind === "option") return premiumSide === "credit" ? -1 : 1;
  return side === "short" ? -1 : 1;
}

function getContractMultiplier(kind: InstrumentType, symbol: string): number {
  if (kind === "option") return 100;
  if (kind === "future") {
    const root = futureRoot(symbol);
    return FUTURES_MULTIPLIERS[root] ?? 1;
  }
  return 1;
}

function looksLikeYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function sessionDateIsoKey(s: any): string {
  const raw = String(s?.date ?? s?.sessionDate ?? "").slice(0, 10);
  if (looksLikeYYYYMMDD(raw)) return raw;
  const d = safeDateFromSession(s);
  return d ? isoDate(d) : "";
}

function parseTimeOnDate(dateIso: string, timeRaw: unknown): Date | null {
  if (!dateIso || !looksLikeYYYYMMDD(dateIso) || !timeRaw) return null;
  const t = String(timeRaw).trim();
  if (!t) return null;

  // if it's an ISO-ish datetime, try direct
  const direct = new Date(t);
  if (!Number.isNaN(direct.getTime())) return direct;

  // HH:MM(:SS)? (AM|PM)?
  const m = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;

  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ss = Number(m[3] ?? "0");
  const ap = (m[4] ?? "").toUpperCase();

  if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return null;
  if (mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;

  if (ap === "AM") {
    if (hh === 12) hh = 0;
  } else if (ap === "PM") {
    if (hh < 12) hh += 12;
  }

  if (hh < 0 || hh > 23) return null;

  const hh2 = String(hh).padStart(2, "0");
  const mm2 = String(mm).padStart(2, "0");
  const ss2 = String(ss).padStart(2, "0");

  // local time is OK for duration computations
  const dt = new Date(`${dateIso}T${hh2}:${mm2}:${ss2}`);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function tagsUpperFromSession(s: any): string[] {
  const raw = Array.isArray(s?.tags) ? s.tags : [];
  return raw.map((t: any) => safeUpper(String(t ?? ""))).filter(Boolean);
}

function inferOptionExpiryIso(row: any): string | null {
  const exp = String(row?.expiry ?? "").slice(0, 10);
  if (looksLikeYYYYMMDD(exp)) return exp;

  const sym = safeUpper(row?.symbol ?? "");
  if (!sym) return null;

  const spx = parseSPXLikeOptionExpiryIso(sym);
  if (spx) return spx;

  const occ = parseOCCOptionSymbol(sym);
  if (occ?.expiry) return isoDate(occ.expiry);

  return null;
}

type TradeClose = {
  id: string; // exit id (or synthetic)
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  premiumSide: PremiumSide;
  qty: number;
  pnl: number;
  holdMin: number | null;
  entryDateIso: string;
  exitDateIso: string;
  tagsUpper: string[]; // from ENTRY session (strategy classification)
  synthetic?: boolean;
};

type OpenPosition = {
  key: string;
  symbol: string;
  kind: InstrumentType;
  side: SideType;
  premiumSide: PremiumSide;
  qty: number;
  tagsUpper: string[]; // from ENTRY session
  expiryIso?: string | null;
};

type TradeEvent =
  | {
      type: "entry";
      dt: Date | null;
      dateIso: string;
      tagsUpper: string[];
      row: EntryTradeRow;
      idx: number;
    }
  | {
      type: "exit";
      dt: Date | null;
      dateIso: string;
      tagsUpper: string[];
      row: ExitTradeRow;
      idx: number;
    };

function buildTradeLedgerFIFO(
  sessions: SessionWithTrades[],
  rangeEndIso?: string
): { closedTrades: TradeClose[]; openPositions: OpenPosition[] } {
  // Build ordered events
  const events: TradeEvent[] = [];
  let ei = 0;

  for (const s of sessions) {
    const dateIso = sessionDateIsoKey(s);
    const tagsUpper = tagsUpperFromSession(s);

    for (const r of (s.entries || []) as EntryTradeRow[]) {
      const dt = parseTimeOnDate(dateIso, (r as any).time);
      events.push({ type: "entry", dt, dateIso, tagsUpper, row: r, idx: ei++ });
    }
    for (const r of (s.exits || []) as ExitTradeRow[]) {
      const dt = parseTimeOnDate(dateIso, (r as any).time);
      events.push({ type: "exit", dt, dateIso, tagsUpper, row: r, idx: ei++ });
    }
  }

  // Sort chronologically; stable fallback; entries first when same timestamp
  events.sort((a, b) => {
    const ta = a.dt?.getTime() ?? 0;
    const tb = b.dt?.getTime() ?? 0;
    if (ta !== tb) return ta - tb;
    if (a.type !== b.type) return a.type === "entry" ? -1 : 1;
    return a.idx - b.idx;
  });

  type Lot = {
    symbol: string;
    kind: InstrumentType;
    side: SideType;
    premiumSide: PremiumSide;
    price: number;
    qtyLeft: number;
    entryDt: Date | null;
    entryDateIso: string;
    expiryIso?: string | null;
    tagsUpper: string[]; // from ENTRY session
  };

  const keyOf = (symbol: string, kind: InstrumentType, side: SideType, premiumSide: PremiumSide) => {
    // Make matching more resilient:
    // - Options: ignore side in key (premiumSide defines the economics)
    // - Linear: ignore premiumSide
    if (kind === "option") return `${symbol}|${kind}|${premiumSide}`;
    return `${symbol}|${kind}|${side}`;
  };

  const lotsByKey: Record<string, Lot[]> = {};
  const closed: TradeClose[] = [];

  let fallbackExitId = 0;

  for (const ev of events) {
    if (ev.type === "entry") {
      const sym = safeUpper(ev.row.symbol);
      if (!sym) continue;

      const kind = normalizeKind((ev.row as any).kind);
      const side = normalizeSide((ev.row as any).side);
      const prem = normalizePremiumSide(kind, (ev.row as any).premiumSide, (ev.row as any).side);

      const px = toNumberMaybe((ev.row as any).price);
      const qty = toNumberMaybe((ev.row as any).quantity);
      if (!Number.isFinite(px) || !Number.isFinite(qty) || qty <= 0) continue;

      const expiryIso = kind === "option" ? inferOptionExpiryIso(ev.row) : null;

      const k = keyOf(sym, kind, side, prem);
      lotsByKey[k] ||= [];
      lotsByKey[k].push({
        symbol: sym,
        kind,
        side,
        premiumSide: prem,
        price: px,
        qtyLeft: qty,
        entryDt: ev.dt,
        entryDateIso: ev.dateIso,
        expiryIso,
        tagsUpper: ev.tagsUpper,
      });
      continue;
    }

    // exit
    const sym = safeUpper(ev.row.symbol);
    if (!sym) continue;

    const kind = normalizeKind((ev.row as any).kind);
    const side = normalizeSide((ev.row as any).side);
    const prem = normalizePremiumSide(kind, (ev.row as any).premiumSide, (ev.row as any).side);

    const exitPx = toNumberMaybe((ev.row as any).price);
    let exitQty = toNumberMaybe((ev.row as any).quantity);
    if (!Number.isFinite(exitPx) || !Number.isFinite(exitQty) || exitQty <= 0) continue;

    const picked = (() => {
      const exact = keyOf(sym, kind, side, prem);
      const cands: string[] = [exact];

      // If data is missing or inconsistent, fall back to a more tolerant match.
      // This prevents false "open trades" when exits exist but legacy rows omit side/premium fields.
      if (kind === "option") {
        cands.push(keyOf(sym, kind, side, prem === "credit" ? "debit" : "credit"));
      }
      cands.push(keyOf(sym, kind, side === "long" ? "short" : "long", prem));
      if (kind === "option") {
        cands.push(keyOf(sym, kind, side === "long" ? "short" : "long", prem === "credit" ? "debit" : "credit"));
      }

      // Ultimate fallback: any open lot for this symbol+kind.
      // Prefer earliest lot (FIFO) by entry date/time when multiple keys are open.
      let bestKey: string | null = null;
      let bestTime = Number.POSITIVE_INFINITY;

      const tryKey = (kk: string) => {
        const lots = lotsByKey[kk];
        if (!lots || lots.length === 0) return;
        const t0 = lots[0]?.entryDt?.getTime?.() ?? 0;
        if (t0 < bestTime) {
          bestTime = t0;
          bestKey = kk;
        }
      };

      for (const kk of cands) tryKey(kk);

      if (!bestKey) {
        const prefix = `${sym}|${kind}|`;
        for (const kk of Object.keys(lotsByKey)) {
          if (!kk.startsWith(prefix)) continue;
          tryKey(kk);
        }
      }

      if (!bestKey) return null;
      return { k: bestKey, lots: lotsByKey[bestKey] as Lot[] };
    })();

    if (!picked || !picked.lots || picked.lots.length === 0) continue;

    const k = picked.k;
    const lots = picked.lots;

    // IMPORTANT: compute economics from the OPEN LOT (position), not from the exit row.
    const sign = pnlSign(lots[0].kind, lots[0].side, lots[0].premiumSide);
    const mult = getContractMultiplier(lots[0].kind, sym);

    let pnlSum = 0;
    let qtySum = 0;

    // weighted hold time by qty
    let holdQtyKnown = 0;
    let holdWeighted = 0;

    const exitDt = ev.dt;

    // IMPORTANT: classification tags from first lot used
    const tagsUpperForTrade = lots[0]?.tagsUpper ?? ev.tagsUpper;
    const entryDateIso = lots[0]?.entryDateIso ?? ev.dateIso;

    while (exitQty > 0 && lots.length > 0) {
      const lot = lots[0];
      const closeQty = Math.min(lot.qtyLeft, exitQty);

      const pnlSeg = (exitPx - lot.price) * closeQty * sign * mult;
      pnlSum += pnlSeg;
      qtySum += closeQty;

      if (lot.entryDt && exitDt) {
        const hm = (exitDt.getTime() - lot.entryDt.getTime()) / 60000;
        if (Number.isFinite(hm) && hm >= 0) {
          holdQtyKnown += closeQty;
          holdWeighted += hm * closeQty;
        }
      }

      lot.qtyLeft -= closeQty;
      exitQty -= closeQty;

      if (lot.qtyLeft <= 0) lots.shift();
    }

    const exitId = String((ev.row as any).id ?? `exit-${fallbackExitId++}`);

    closed.push({
      id: exitId,
      symbol: sym,
      kind,
      side,
      premiumSide: prem,
      qty: qtySum,
      pnl: Number(pnlSum.toFixed(2)),
      holdMin: holdQtyKnown > 0 ? holdWeighted / holdQtyKnown : null,
      entryDateIso,
      exitDateIso: ev.dateIso,
      tagsUpper: tagsUpperForTrade,
      synthetic: false,
    });
  }

  // Auto-close expired CREDIT options (no exit) at 0.00 to reflect premium win at expiry.
  // This prevents credit strategies from showing as "open forever" in analytics.
  const todayIso = isoDate(new Date());
  const endIso = looksLikeYYYYMMDD(String(rangeEndIso ?? "")) ? String(rangeEndIso) : todayIso;
  const cutoffIso = endIso < todayIso ? endIso : todayIso;

  for (const [k, lots] of Object.entries(lotsByKey)) {
    if (!lots?.length) continue;

    for (const lot of lots) {
      if (lot.qtyLeft <= 0) continue;
      if (lot.kind !== "option") continue;
      if (lot.premiumSide !== "credit") continue;

      const expIso = lot.expiryIso;
      if (!expIso || !looksLikeYYYYMMDD(expIso)) continue;

      // close only if expiration already passed within the chosen end range
      if (expIso > cutoffIso) continue;

      const exitPx = 0;
      const sign = pnlSign(lot.kind, lot.side, lot.premiumSide);
      const mult = getContractMultiplier(lot.kind, lot.symbol);

      const closeQty = lot.qtyLeft;
      const pnl = (exitPx - lot.price) * closeQty * sign * mult;

      const exitDt = parseTimeOnDate(expIso, "16:00") ?? new Date(`${expIso}T16:00:00`);
      let holdMin: number | null = null;
      if (lot.entryDt && exitDt && Number.isFinite(exitDt.getTime())) {
        const hm = (exitDt.getTime() - lot.entryDt.getTime()) / 60000;
        holdMin = Number.isFinite(hm) && hm >= 0 ? hm : null;
      }

      closed.push({
        id: `expiry-${lot.symbol}-${expIso}-${Math.random().toString(16).slice(2)}`,
        symbol: lot.symbol,
        kind: lot.kind,
        side: lot.side,
        premiumSide: lot.premiumSide,
        qty: closeQty,
        pnl: Number(pnl.toFixed(2)),
        holdMin,
        entryDateIso: lot.entryDateIso,
        exitDateIso: expIso,
        tagsUpper: lot.tagsUpper,
        synthetic: true,
      });

      lot.qtyLeft = 0;
    }

    // remove emptied lots
    lotsByKey[k] = lots.filter((x) => x.qtyLeft > 0);
  }

  // Open positions (aggregate remaining qty by key)
  const openPositions: OpenPosition[] = [];
  for (const [k, lots] of Object.entries(lotsByKey)) {
    if (!lots?.length) continue;
    const qtyLeft = lots.reduce((a, l) => a + (Number(l.qtyLeft) || 0), 0);
    if (qtyLeft <= 0) continue;
    const first = lots[0];
    openPositions.push({
      key: k,
      symbol: first.symbol,
      kind: first.kind,
      side: first.side,
      premiumSide: first.premiumSide,
      qty: qtyLeft,
      tagsUpper: first.tagsUpper,
      expiryIso: first.expiryIso ?? null,
    });
  }

  return { closedTrades: closed, openPositions };
}

/* =========================
   KPI Aggregation
========================= */

function fmtPct(x: number, digits = 1) {
  if (!Number.isFinite(x)) return "—";
  return `${x.toFixed(digits)}%`;
}

function fmtDurationMin(min: number | null | undefined) {
  if (min == null || !Number.isFinite(min)) return "—";
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (h <= 0) return `${mm}m`;
  if (mm === 0) return `${h}h`;
  return `${h}h ${mm}m`;
}

function mean(nums: number[]) {
  const a = nums.filter((n) => Number.isFinite(n));
  if (!a.length) return 0;
  return a.reduce((x, y) => x + y, 0) / a.length;
}

function longestStreak(sessions: SessionWithTrades[], pred: (net: number) => boolean) {
  const sorted = [...sessions].sort((a, b) => {
    const da = sessionDateIsoKey(a);
    const db = sessionDateIsoKey(b);
    return da < db ? -1 : da > db ? 1 : 0;
  });

  let best = 0;
  let cur = 0;
  for (const s of sorted) {
    const net = sessionNet(s);
    if (pred(net)) {
      cur += 1;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  }
  return best;
}

function inferPlannedRrrFromTags(tagsUpper: string[]): number | null {
  const joined = tagsUpper.join(" | ");

  if (joined.includes("RISK-TO-REWARD") && (joined.includes("≥ 2R") || joined.includes(">= 2R"))) return 2.0;
  if (joined.includes("RISK-TO-REWARD") && (joined.includes("< 1.5R") || joined.includes("<1.5R"))) return 1.5;

  if (tagsUpper.includes("GOOD RISK-REWARD")) return 2.0;
  if (tagsUpper.includes("POOR RISK-REWARD")) return 1.0;

  return null;
}

function extractRiskRewardPctFromTrades(sessions: SessionWithTrades[]) {
  const risk: number[] = [];
  const reward: number[] = [];

  const pickPct = (v: any): number | null => {
    const n = toNumberMaybe(v);
    if (!Number.isFinite(n)) return null;
    if (n < 0 || n > 100) return null;
    return n;
  };

  for (const s of sessions) {
    for (const t of (s.entries || []) as any[]) {
      const r = pickPct(t?.riskPct ?? t?.risk_percent ?? t?.riskPercent ?? t?.risk_pct);
      const w = pickPct(t?.rewardPct ?? t?.reward_percent ?? t?.rewardPercent ?? t?.reward_pct);
      if (r != null) risk.push(r);
      if (w != null) reward.push(w);
    }
  }

  return {
    avgRiskPct: risk.length ? mean(risk) : null,
    avgRewardPct: reward.length ? mean(reward) : null,
  };
}

function disciplineScore0to10(s: any): number | null {
  const direct =
    (typeof s?.disciplineRating === "number" && s.disciplineRating) ||
    (typeof s?.psychology?.disciplineRating === "number" && s.psychology.disciplineRating) ||
    null;

  if (direct != null && Number.isFinite(direct)) return clamp(direct, 0, 10);

  const tagsUpper = tagsUpperFromSession(s);
  let score =
    (s?.respectedPlan === false || tagsUpper.includes("NOT FOLLOW MY PLAN") || tagsUpper.includes("NO RESPECT MY PLAN"))
      ? 4
      : 10;

  if (tagsUpper.includes("FOMO")) score -= 1.5;
  if (tagsUpper.includes("REVENGE TRADE")) score -= 2.0;
  if (tagsUpper.includes("OVERCONFIDENT")) score -= 1.0;

  if (tagsUpper.includes("DISCIPLINE")) score += 0.5;
  if (tagsUpper.includes("PATIENCE")) score += 0.3;
  if (tagsUpper.includes("FOCUS")) score += 0.3;

  return clamp(score, 0, 10);
}

type StatsAgg = {
  totalClosedTrades: number;
  totalOpenTrades: number;

  totalWinningTrades: number;
  totalLearnedTrades: number;
  totalBreakEvenTrades: number;

  tradeWinRate: number;

  avgWinningTrade: number;
  avgLearnedTrade: number;

  largestWinningTrade: number;
  largestLearnedTrade: number;

  longestWinningStreak: number; // sessions-based
  longestLearnedStreak: number; // sessions-based

  totalTradeCosts: number; // fees
  totalPL: number; // net (after fees)

  accountGrowthPct: number | null;

  avgRiskPct: number | null;
  avgRewardPct: number | null;

  tradeExpectancy: number;

  avgPlannedRRR: number | null;
  avgAchievedRRR: number | null;

  avgHoldMin: number | null;
  avgHoldMinWinners: number | null;
  avgHoldMinLearned: number | null;

  totalDeposits: number | null;
  totalWithdrawals: number | null;

  disciplineAvg: number | null;
};

function sumFromDailySnaps(rows: DailySnapshotRow[], keys: string[]) {
  let total = 0;
  let seen = false;
  for (const r of rows || []) {
    for (const k of keys) {
      if ((r as any)?.[k] != null) {
        const n = toNumberMaybe((r as any)[k]);
        if (Number.isFinite(n)) {
          total += n;
          seen = true;
        }
      }
    }
  }
  return seen ? total : null;
}

function computeStatsAgg(params: {
  sessions: SessionWithTrades[];
  ledgerClosedTrades: TradeClose[];
  ledgerOpenPositions: OpenPosition[];
  dailySnaps: DailySnapshotRow[];
}): StatsAgg {
  const { sessions, ledgerClosedTrades, ledgerOpenPositions, dailySnaps } = params;

  // P&L + fees from sessions (authoritative, net after fees)
  const totalPL = sessions.reduce((a, s) => a + sessionNet(s), 0);
  const totalTradeCosts = sessions.reduce((a, s) => a + (Number(s?.feesUsd) || 0), 0);

  // Trades classification (per-exit close)
  const EPS = 1e-9;
  const pnlList = ledgerClosedTrades.map((t) => Number(t.pnl) || 0);

  const winners = pnlList.filter((x) => x > EPS);
  const learned = pnlList.filter((x) => x < -EPS);
  const breakeven = pnlList.filter((x) => Math.abs(x) <= EPS);

  const totalClosedTrades = pnlList.length;
  const totalWinningTrades = winners.length;
  const totalLearnedTrades = learned.length;
  const totalBreakEvenTrades = breakeven.length;

  const tradeWinRate = totalClosedTrades ? (totalWinningTrades / totalClosedTrades) * 100 : 0;

  const avgWinningTrade = winners.length ? mean(winners) : 0;
  const avgLearnedTrade = learned.length ? mean(learned) : 0;

  const largestWinningTrade = pnlList.length ? Math.max(...pnlList) : 0;
  const largestLearnedTrade = pnlList.length ? Math.min(...pnlList) : 0;

  const tradeExpectancy = totalClosedTrades ? mean(pnlList) : 0;

  const avgAchievedRRR =
    learned.length && avgWinningTrade !== 0
      ? Math.abs(avgWinningTrade) / Math.max(1e-9, Math.abs(avgLearnedTrade))
      : null;

  // Planned RRR from tags (session-level flags)
  const planned: number[] = [];
  for (const s of sessions) {
    const tagsUpper = tagsUpperFromSession(s);
    const r = inferPlannedRrrFromTags(tagsUpper);
    if (r != null) planned.push(r);
  }
  const avgPlannedRRR = planned.length ? mean(planned) : null;

  // Hold time metrics
  const holds = ledgerClosedTrades
    .map((t) => (t.holdMin == null ? null : Number(t.holdMin)))
    .filter((x): x is number => x != null && Number.isFinite(x));

  const holdW = ledgerClosedTrades
    .filter((t) => t.pnl > EPS && t.holdMin != null)
    .map((t) => Number(t.holdMin))
    .filter((x) => Number.isFinite(x));

  const holdL = ledgerClosedTrades
    .filter((t) => t.pnl < -EPS && t.holdMin != null)
    .map((t) => Number(t.holdMin))
    .filter((x) => Number.isFinite(x));

  const avgHoldMin = holds.length ? mean(holds) : null;
  const avgHoldMinWinners = holdW.length ? mean(holdW) : null;
  const avgHoldMinLearned = holdL.length ? mean(holdL) : null;

  // Open trades: number of remaining open position keys (after credit-expiry auto-close)
  const totalOpenTrades = ledgerOpenPositions.length;

  // Streaks (sessions-based)
  const longestWinningStreak = longestStreak(sessions, (net) => net > 0);
  const longestLearnedStreak = longestStreak(sessions, (net) => net < 0);

  // Account growth from snapshots (if available)
  let accountGrowthPct: number | null = null;
  const snaps = [...(dailySnaps || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (snaps.length >= 1) {
    const startBal = toNumberMaybe((snaps[0] as any).start_of_day_balance);
    const last = snaps[snaps.length - 1];
    const endBal = toNumberMaybe((last as any).start_of_day_balance) + toNumberMaybe((last as any).realized_usd);
    if (Number.isFinite(startBal) && startBal > 0 && Number.isFinite(endBal)) {
      accountGrowthPct = ((endBal - startBal) / startBal) * 100;
    }
  }

  // Deposits/withdrawals (optional columns in snapshots)
  const totalDeposits = sumFromDailySnaps(snaps, ["deposits_usd", "depositsUsd", "deposits"]);
  const totalWithdrawals = sumFromDailySnaps(snaps, ["withdrawals_usd", "withdrawalsUsd", "withdrawals"]);

  // Risk/Reward % (only if stored)
  const { avgRiskPct, avgRewardPct } = extractRiskRewardPctFromTrades(sessions);

  // Discipline avg
  const discVals = sessions
    .map((s) => disciplineScore0to10(s))
    .filter((x): x is number => x != null && Number.isFinite(x));
  const disciplineAvg = discVals.length ? mean(discVals) : null;

  return {
    totalClosedTrades,
    totalOpenTrades,
    totalWinningTrades,
    totalLearnedTrades,
    totalBreakEvenTrades,
    tradeWinRate,
    avgWinningTrade,
    avgLearnedTrade,
    largestWinningTrade,
    largestLearnedTrade,
    longestWinningStreak,
    longestLearnedStreak,
    totalTradeCosts,
    totalPL,
    accountGrowthPct,
    avgRiskPct,
    avgRewardPct,
    tradeExpectancy,
    avgPlannedRRR,
    avgAchievedRRR,
    avgHoldMin,
    avgHoldMinWinners,
    avgHoldMinLearned,
    totalDeposits,
    totalWithdrawals,
    disciplineAvg,
  };
}

/* =========================
   Sections
========================= */

function OverviewSection({
  probabilityStats,
  uiTotals,
  equity,
  dailyPnl,
  usage,
}: {
  probabilityStats: any;
  uiTotals: any;
  equity: { date: string; value: number }[];
  dailyPnl: { date: string; pnl: number }[];
  usage: { premarketFillRate: number; aiUsageRate: number; aiUsedSessions: number };
}) {
  const { totalSessions, greenSessions, learningSessions, sumPnl, avgPnl } = uiTotals;
  const respectEdge = probabilityStats.pGreenRespect - probabilityStats.baseGreenRate;

  const equityApexSeries = useMemo(() => {
    const pts = (equity || []).map((p) => {
      const ts = Date.parse(`${p.date}T00:00:00.000Z`);
      return { x: Number.isFinite(ts) ? ts : p.date, y: Number(p.value) || 0 };
    });
    return [{ name: "Equity", data: pts }];
  }, [equity]);

  const equityApexOptions = useMemo<ApexOptions>(() => {
    return {
      chart: {
        type: "area",
        background: "transparent",
        toolbar: {
          show: true,
          tools: {
            download: true,
            selection: true,
            zoom: true,
            zoomin: true,
            zoomout: true,
            pan: true,
            reset: true,
          },
        },
        zoom: { enabled: true },
        foreColor: CHART_COLORS.axis,
      },
      theme: { mode: "dark" },
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 2 },
      colors: [CHART_COLORS.emerald],
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 0.2,
          opacityFrom: 0.35,
          opacityTo: 0.05,
          stops: [0, 90, 100],
        },
      },
      grid: { borderColor: CHART_COLORS.grid, strokeDashArray: 6 },
      xaxis: {
        type: "datetime",
        labels: {
          style: {
            colors: CHART_COLORS.axis,
            fontSize: "11px",
            fontFamily: "inherit",
          },
        },
        axisBorder: { color: CHART_COLORS.grid },
        axisTicks: { color: CHART_COLORS.grid },
      },
      yaxis: {
        labels: {
          style: {
            colors: CHART_COLORS.axis,
            fontSize: "11px",
            fontFamily: "inherit",
          },
          formatter: (v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return "";
            return `$${n.toFixed(0)}`;
          },
        },
      },
      tooltip: {
        theme: "dark",
        x: { format: "MMM dd" },
        y: {
          formatter: (v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return "";
            return `$${n.toFixed(2)}`;
          },
        },
      },
    };
  }, [equity]);


  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total sessions" value={totalSessions} sub="Each session is one day of trading in your journal." good />
        <StatCard
          label="Green sessions"
          value={greenSessions}
          sub={`Win rate: ${totalSessions > 0 ? ((greenSessions / totalSessions) * 100).toFixed(1) : "0.0"}%`}
          good
        />
        <StatCard label="Learning sessions" value={learningSessions} sub="These days are raw material for rule upgrades." good={false} />
        <StatCard
          label="Avg P&L / session"
          value={`${avgPnl >= 0 ? "+" : "-"}$${Math.abs(avgPnl).toFixed(2)}`}
          sub={
            <>
              Total P&amp;L:{" "}
              <span className={sumPnl >= 0 ? "text-emerald-300" : "text-sky-300"}>
                {sumPnl >= 0 ? "+" : "-"}${Math.abs(sumPnl).toFixed(2)}
              </span>
            </>
          }
          good={avgPnl >= 0}
        />
      </div>

      <div className={wrapCard()}>
        <p className="text-sm font-medium text-slate-100 mb-2">Performance probabilities</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-[11px] text-slate-400 mb-1">Base probability of green</p>
            <p className="text-2xl font-semibold text-emerald-300">
              {probabilityStats.baseGreenRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">Green when plan respected</p>
            <p className="text-2xl font-semibold text-emerald-300">
              {probabilityStats.pGreenRespect.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">Learning with FOMO</p>
            <p className="text-2xl font-semibold text-sky-300">
              {probabilityStats.pLearningFomo.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">Plan edge</p>
            <p
              className={`text-2xl font-semibold ${
                respectEdge >= 0 ? "text-emerald-300" : "text-sky-300"
              }`}
            >
              {respectEdge.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${wrapCard()} lg:col-span-2`}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className={chartTitle()}>Equity Curve</p>
              <p className={chartSub()}>Account equity over time (start balance + net P&amp;L)</p>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">EQ</span>
          </div>

          <div className="mt-3 h-[280px]">
            {equity && equity.length ? (
              // @ts-ignore
              <ApexChart
                type="area"
                height={280}
                options={equityApexOptions}
                series={equityApexSeries as any}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                No equity data in this range.
              </div>
            )}
          </div>
        </div>

        <div className={wrapCard()}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className={chartTitle()}>Workflow usage</p>
              <p className={chartSub()}>Premarket + AI coaching adoption</p>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">UX</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2">
            <MiniKpi label="Premarket fill rate" value={`${usage.premarketFillRate.toFixed(1)}%`} />
            <MiniKpi label="AI usage rate" value={`${usage.aiUsageRate.toFixed(1)}%`} />
            <MiniKpi label="AI used sessions" value={usage.aiUsedSessions} />
          </div>

          <div className="mt-4 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip {...tooltipProps()} />
                <Pie
                  data={[
                    { name: "Premarket", value: Math.max(0.01, usage.premarketFillRate) },
                    { name: "AI Coaching", value: Math.max(0.01, usage.aiUsageRate) },
                    { name: "Other", value: Math.max(0.01, 100 - (usage.premarketFillRate + usage.aiUsageRate) / 2) },
                  ]}
                  dataKey="value"
                  innerRadius={58}
                  outerRadius={86}
                  paddingAngle={3}
                  stroke="rgba(148,163,184,0.08)"
                >
                  <Cell fill={CHART_COLORS.emerald} />
                  <Cell fill={CHART_COLORS.sky} />
                  <Cell fill={"rgba(148,163,184,0.30)"} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Daily P&amp;L</p>
            <p className={chartSub()}>Selected range</p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">DPNL</span>
        </div>

        <div className="mt-3 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyPnl} barCategoryGap={18} barGap={6}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 8" />
              <XAxis
                dataKey="date"
                tick={axisStyle()}
                tickFormatter={formatDateFriendly}
                axisLine={{ stroke: CHART_COLORS.grid }}
                tickLine={false}
              />
              <YAxis tick={axisStyle()} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} width={46} />
              <Tooltip {...tooltipProps()} formatter={(v: any) => fmtMoney(Number(v))} />
              <Bar dataKey="pnl" radius={[8, 8, 8, 8]} fill={CHART_COLORS.sky} opacity={0.88} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function DayOfWeekSection({ weekdayBars }: { weekdayBars: any[] }) {
  return (
    <section className="space-y-6">
      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Weekday win-rate</p>
            <p className={chartSub()}>Edge by day of week (selected range)</p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">DOW</span>
        </div>

        <div className="mt-3 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekdayBars} barCategoryGap={20} barGap={6}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 8" />
              <XAxis dataKey="label" tick={axisStyle()} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} />
              <YAxis tick={axisStyle()} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} width={46} domain={[0, 100]} />
              <Tooltip {...tooltipProps()} formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
              <Bar dataKey="winRate" radius={[8, 8, 8, 8]} fill={CHART_COLORS.emerald} opacity={0.88} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

/* =========================
   Psychology (from Journal tags)
========================= */

function PsychologySection({
  probabilityStats,
  psychology,
}: {
  probabilityStats: any;
  psychology: {
    freqArr: { name: string; value: number }[];
    timeline: any[];
    kpis: { tag: string; count: number; winRate: number; avgPnl: number }[];
  };
}) {
  const freq = psychology.freqArr || [];
  const timeline = psychology.timeline || [];
  const kpis = psychology.kpis || [];

  const emoColor = (emo: string) => {
    const e = safeUpper(emo);
    if (e.includes("ANXI") || e.includes("DESPER")) return CHART_COLORS.sky;
    if (e.includes("FOMO") || e.includes("GREED") || e.includes("REVENGE")) return CHART_COLORS.danger;
    if (e.includes("CALM") || e.includes("FOCUS") || e.includes("PATIENCE") || e.includes("DISCIPLINE"))
      return CHART_COLORS.emerald;
    return "rgba(148,163,184,0.60)";
  };

  const groupAgg = useMemo(() => {
    const pos = ["CALM", "FOCUS", "PATIENCE", "DISCIPLINE"];
    const neg = ["FOMO", "GREEDY", "DESPERATE", "ANXIETY", "REVENGE TRADE", "OVERCONFIDENT"];

    const map = new Map(kpis.map((k) => [safeUpper(k.tag), k]));
    const sum = (keys: string[]) => {
      let c = 0;
      let wins = 0;
      let sumPnl = 0;
      for (const k of keys) {
        const r = map.get(k);
        if (!r) continue;
        c += r.count;
        wins += (r.winRate / 100) * r.count;
        sumPnl += r.avgPnl * r.count;
      }
      const winRate = c ? (wins / c) * 100 : 0;
      const avgPnl = c ? sumPnl / c : 0;
      return { c, winRate, avgPnl };
    };

    return { positive: sum(pos), highRisk: sum(neg) };
  }, [kpis]);

  return (
    <section className="space-y-6">
      <div className={`${wrapCard()} bg-gradient-to-br from-slate-900/70 via-slate-900/60 to-slate-950/70`}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Psychology KPIs</p>
            <p className={chartSub()}>
              Impact analysis (counts, win-rate, and average P&amp;L when the tag is present).
            </p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">PSY</span>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <MiniKpi
            label="High-performance states (Calm/Focus/Patience/Discipline)"
            value={`${groupAgg.positive.c} events · ${groupAgg.positive.winRate.toFixed(1)}% · ${fmtMoney(groupAgg.positive.avgPnl)}`}
            tone={groupAgg.positive.avgPnl >= 0 ? "good" : "neutral"}
          />
          <MiniKpi
            label="High-risk states (FOMO/Greedy/Desperate/Anxiety/Revenge/Overconf.)"
            value={`${groupAgg.highRisk.c} events · ${groupAgg.highRisk.winRate.toFixed(1)}% · ${fmtMoney(groupAgg.highRisk.avgPnl)}`}
            tone={groupAgg.highRisk.avgPnl < 0 ? "bad" : "neutral"}
          />
          <MiniKpi
            label="Plan edge"
            value={`${(probabilityStats.pGreenRespect - probabilityStats.baseGreenRate).toFixed(1)}%`}
            tone={probabilityStats.pGreenRespect >= probabilityStats.baseGreenRate ? "good" : "neutral"}
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[920px] w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.22em] text-slate-500 border-b border-slate-800">
                <th className="px-3 py-2 text-left">Tag</th>
                <th className="px-3 py-2 text-right">Count</th>
                <th className="px-3 py-2 text-right">Win%</th>
                <th className="px-3 py-2 text-right">Avg P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {kpis.map((r) => (
                <tr
                  key={r.tag}
                  className="border-t border-slate-800 bg-slate-950/45 hover:bg-slate-950/70 transition"
                >
                  <td className="px-3 py-2 font-mono text-slate-100">{r.tag}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{r.count}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{r.winRate.toFixed(1)}%</td>
                  <td className={`px-3 py-2 text-right font-mono ${r.avgPnl >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                    {fmtMoney(r.avgPnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <MiniKpi label="Green when plan respected" value={`${probabilityStats.pGreenRespect.toFixed(1)}%`} tone="good" />
          <MiniKpi label="Learning w/ FOMO" value={`${probabilityStats.pLearningFomo.toFixed(1)}%`} tone="bad" />
          <MiniKpi label="Base green" value={`${probabilityStats.baseGreenRate.toFixed(1)}%`} />
        </div>
      </div>

      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Emotion frequency</p>
            <p className={chartSub()}>Most common psychology tags (top 12)</p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">EMO</span>
        </div>

        <div className="mt-3 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={freq} barCategoryGap={22} barGap={6} layout="vertical">
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 8" />
              <XAxis type="number" tick={axisStyle()} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={axisStyle()} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} width={140} />
              <Tooltip {...tooltipProps()} />
              <Bar dataKey="value" radius={[8, 8, 8, 8]}>
                {freq.map((x) => (
                  <Cell key={x.name} fill={emoColor(x.name)} opacity={0.90} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Psychology over time</p>
            <p className={chartSub()}>Timeline (net PnL + first detected psychology tag)</p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">TL</span>
        </div>

        <div className="mt-3 h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeline}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 8" />
              <XAxis dataKey="date" tick={axisStyle()} tickFormatter={formatDateFriendly} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} />
              <YAxis tick={axisStyle()} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} width={46} />
              <Tooltip {...tooltipProps()} formatter={(v: any, k: any) => (k === "pnl" ? fmtMoney(Number(v)) : v)} />
              <Line type="monotone" dataKey="pnl" stroke={CHART_COLORS.emerald} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function InstrumentsSection({ stats, underlyingMix }: { stats: any; underlyingMix: any[] }) {
  const mostSupportive = stats.mostSupportive || [];
  const topEarners = stats.topEarners || [];
  const toReview = stats.toReview || [];
  const tickers = (stats.tickers || []) as any[];

  type TickerSortKey = "symbol" | "sessions" | "winRate" | "netPnl" | "avgPnl";

  const [search, setSearch] = useState<string>("");
  const [sortKey, setSortKey] = useState<TickerSortKey>("sessions");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState<number>(1);

  const pageSize = 25;

  const filteredTickers = useMemo(() => {
    const q = safeUpper(search).trim();
    if (!q) return tickers;

    return tickers.filter((t) => {
      const sym = safeUpper(String(t?.symbol ?? ""));
      const und = safeUpper(String(t?.underlying ?? ""));
      return sym.includes(q) || und.includes(q);
    });
  }, [tickers, search]);

  const sortedTickers = useMemo(() => {
    const arr = [...filteredTickers];
    const dir = sortDir === "asc" ? 1 : -1;

    const num = (v: any) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    arr.sort((a, b) => {
      if (sortKey === "symbol") {
        return (
          safeUpper(String(a?.symbol ?? "")).localeCompare(safeUpper(String(b?.symbol ?? ""))) *
          dir
        );
      }
      if (sortKey === "sessions") return (num(a?.sessions) - num(b?.sessions)) * dir;
      if (sortKey === "winRate") return (num(a?.winRate) - num(b?.winRate)) * dir;
      if (sortKey === "netPnl") return (num(a?.netPnl) - num(b?.netPnl)) * dir;
      if (sortKey === "avgPnl") return (num(a?.avgPnlPerSession) - num(b?.avgPnlPerSession)) * dir;
      return 0;
    });

    return arr;
  }, [filteredTickers, sortKey, sortDir]);

  useEffect(() => {
    // reset pagination when the user changes filters/sort
    setPage(1);
  }, [search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedTickers.length / pageSize));
  const pageSafe = Math.min(Math.max(1, page), totalPages);

  const pageItems = useMemo(() => {
    const start = (pageSafe - 1) * pageSize;
    return sortedTickers.slice(start, start + pageSize);
  }, [sortedTickers, pageSafe]);

  const sortMark = (k: TickerSortKey) => {
    if (sortKey !== k) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  const toggleSort = (k: TickerSortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(k);
    setSortDir(k === "symbol" ? "asc" : "desc");
  };

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={`${wrapCard()} lg:col-span-2`}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className={chartTitle()}>Underlying mix</p>
              <p className={chartSub()}>Top 10 underlyings by sessions</p>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">UMIX</span>
          </div>

          <div className="mt-3 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip {...tooltipProps()} />
                <Pie
                  data={underlyingMix}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={78}
                  outerRadius={120}
                  paddingAngle={3}
                  stroke="rgba(148,163,184,0.08)"
                >
                  {underlyingMix.map((x: any, idx: number) => (
                    <Cell
                      key={x.name}
                      fill={idx % 2 === 0 ? CHART_COLORS.emerald : CHART_COLORS.sky}
                      opacity={0.14 + (1 - idx / Math.max(1, underlyingMix.length)) * 0.78}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className={wrapCard()}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className={chartTitle()}>Instrument overview</p>
              <p className={chartSub()}>Quick edges</p>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">EDGE</span>
          </div>

          <div className="mt-3 space-y-2">
            <MiniKpi label="Top supportive ticker" value={mostSupportive?.[0]?.symbol ?? "—"} tone="good" />
            <MiniKpi label="Top earner ticker" value={topEarners?.[0]?.symbol ?? "—"} tone="good" />
            <MiniKpi label="Review ticker" value={toReview?.[0]?.symbol ?? "—"} tone="bad" />
          </div>
        </div>
      </div>

      <div className={wrapCard()}>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <p className={chartTitle()}>Ticker table</p>
            <p className={chartSub()}>
              Search, sort, and page through symbol + edge metrics (selected range).
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-mono">SEARCH</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SPX, AAPL, ES…"
                className="w-56 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <span className="font-mono">{sortedTickers.length}</span> rows
            </div>

            <span className="text-[11px] text-slate-500 font-mono">TAB</span>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.22em] text-slate-500 border-b border-slate-800">
                <th
                  className="px-3 py-2 text-left cursor-pointer select-none hover:text-slate-300"
                  onClick={() => toggleSort("symbol")}
                  title="Sort"
                >
                  Symbol{sortMark("symbol")}
                </th>
                <th className="px-3 py-2 text-left">Underlying</th>
                <th
                  className="px-3 py-2 text-right cursor-pointer select-none hover:text-slate-300"
                  onClick={() => toggleSort("sessions")}
                  title="Sort"
                >
                  Sessions{sortMark("sessions")}
                </th>
                <th className="px-3 py-2 text-right">Closed</th>
                <th
                  className="px-3 py-2 text-right cursor-pointer select-none hover:text-slate-300"
                  onClick={() => toggleSort("winRate")}
                  title="Sort"
                >
                  Win%{sortMark("winRate")}
                </th>
                <th
                  className="px-3 py-2 text-right cursor-pointer select-none hover:text-slate-300"
                  onClick={() => toggleSort("netPnl")}
                  title="Sort"
                >
                  Net{sortMark("netPnl")}
                </th>
                <th
                  className="px-3 py-2 text-right cursor-pointer select-none hover:text-slate-300"
                  onClick={() => toggleSort("avgPnl")}
                  title="Sort"
                >
                  Avg{sortMark("avgPnl")}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t: any) => (
                <tr
                  key={t.symbol}
                  className="border-t border-slate-800 bg-slate-950/45 hover:bg-slate-950/70 transition"
                >
                  <td className="px-3 py-2 font-mono text-slate-100">{t.symbol}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{t.underlying || "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{t.sessions}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{t.tradesClosed}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{Number(t.winRate || 0).toFixed(1)}%</td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      Number(t.netPnl || 0) >= 0 ? "text-emerald-300" : "text-sky-300"
                    }`}
                  >
                    {fmtMoney(Number(t.netPnl || 0))}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">
                    {fmtMoney(Number(t.avgPnlPerSession || 0))}
                  </td>
                </tr>
              ))}

              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                    No tickers match your search in this date range.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={pageSafe <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-2 rounded-xl border border-slate-800 text-slate-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:border-emerald-400 hover:text-emerald-300 transition"
          >
            Prev
          </button>

          <div className="text-[11px] text-slate-500 font-mono">
            PAGE {pageSafe} / {totalPages}
          </div>

          <button
            type="button"
            disabled={pageSafe >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-2 rounded-xl border border-slate-800 text-slate-200 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:border-emerald-400 hover:text-emerald-300 transition"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function TerminalSection({
  weekdayBars,
  sessions,
}: {
  weekdayBars: { label: string; winRate: number }[];
  sessions: SessionWithTrades[];
}) {
  const [minSessionsCell, setMinSessionsCell] = useState(1);

  const timeHeat = useMemo(() => {
    const raw = buildDowHourTimeHeat(sessions, DEFAULT_HOURS);
    const rows = raw.rows.map((r) => ({
      ...r,
      cells: r.cells.map((c) =>
        c.n >= minSessionsCell ? c : { ...c, n: 0, wins: 0, avgNet: 0, winRate: 0 }
      ),
    }));
    return { ...raw, rows };
  }, [sessions, minSessionsCell]);

  const echartsOption = useMemo(() => {
    return {
      backgroundColor: "transparent",
      grid: { left: 34, right: 16, top: 18, bottom: 30 },
      xAxis: {
        type: "category",
        data: weekdayBars.map((x) => x.label),
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.14)" } },
        axisLabel: { color: "rgba(148,163,184,0.70)", fontFamily: "monospace" },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.14)" } },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.10)", type: "dashed" } },
        axisLabel: { color: "rgba(148,163,184,0.70)", formatter: "{value}%" },
      },
      tooltip: { trigger: "axis" },
      series: [
        {
          type: "bar",
          data: weekdayBars.map((x) => Number(x.winRate.toFixed(2))),
          barWidth: 18,
          itemStyle: {
            borderRadius: [8, 8, 8, 8],
            color: "rgba(52,211,153,0.85)",
          },
        },
      ],
    };
  }, [weekdayBars]);

  return (
    <section className="space-y-6">
      <div className={wrapCard()}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className={chartTitle()}>Terminal Controls</p>
            <p className={chartSub()}>Heatmap uses the same date range as the whole page.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-mono">MIN-N</span>
              <input
                type="number"
                min={1}
                max={50}
                value={minSessionsCell}
                onChange={(e) => setMinSessionsCell(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <span className="font-mono">{sessions.length}</span> sessions
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={wrapCard()}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className={chartTitle()}>ECharts — Weekday edge</p>
              <p className={chartSub()}>Win-rate by weekday (net).</p>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">ECH</span>
          </div>
          <div className="mt-3 h-80">
            {/* @ts-ignore */}
            <EChartsReact option={echartsOption} style={{ height: 320, width: "100%" }} />
          </div>
        </div>

        <div className={wrapCard()}>
          <p className={chartTitle()}>Time HeatMap</p>
          <p className={chartSub()}>Day-of-week × hour bucket (net after fees).</p>
          <div className="mt-3">
            <TimeHeatMap title="Time HeatMap" data={timeHeat} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================
   Statistics Section (Wall Street KPI Terminal)
========================= */

type KpiItem = {
  id: string;
  category: KpiCategory;
  label: string;
  value: ReactNode;
  description?: string;
  tone?: "good" | "bad" | "neutral";
};

function KpiCard({ kpi }: { kpi: KpiItem }) {
  const tone =
    kpi.tone === "good"
      ? "text-emerald-300"
      : kpi.tone === "bad"
      ? "text-sky-300"
      : "text-slate-200";

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-800/90 bg-slate-950/55 px-4 py-3 shadow-[0_0_25px_rgba(0,0,0,0.35)] hover:border-slate-700 hover:bg-slate-950/70 transition">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition pointer-events-none"
        style={{ background: "radial-gradient(600px circle at 20% 0%, rgba(52,211,153,0.10), transparent 40%), radial-gradient(600px circle at 80% 120%, rgba(56,189,248,0.10), transparent 40%)" }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
            {kpi.label}
          </p>
          {kpi.description ? <Tip text={kpi.description} /> : null}
        </div>
        <p className={`mt-2 text-[22px] leading-[1.2] font-mono ${tone}`}>
          {kpi.value}
        </p>
      </div>
    </div>
  );
}

function StatisticsSection({
  sessions,
  dailySnaps,
  rangeEndIso,
}: {
  sessions: SessionWithTrades[];
  dailySnaps: DailySnapshotRow[];
  rangeEndIso: string;
}) {
  const [strategy, setStrategy] = useState<string>("ALL");
  const [category, setCategory] = useState<string>("ALL");
  const [query, setQuery] = useState<string>("");

  const ledgerAll = useMemo(() => buildTradeLedgerFIFO(sessions, rangeEndIso), [sessions, rangeEndIso]);

  const byStrategy = useMemo(() => {
    const map: Record<string, {
      tag: string;
      sessions: SessionWithTrades[];
      closedTrades: TradeClose[];
      openPositions: OpenPosition[];
      sumPnl: number;
      sumFees: number;
    }> = {};

    for (const t of STRATEGY_TAGS) {
      map[safeUpper(t)] = {
        tag: t,
        sessions: [],
        closedTrades: [],
        openPositions: [],
        sumPnl: 0,
        sumFees: 0,
      };
    }

    for (const s of sessions) {
      const tagsU = tagsUpperFromSession(s);

      for (const t of STRATEGY_TAGS) {
        const tu = safeUpper(t);
        if (tagsU.includes(tu)) {
          map[tu].sessions.push(s);
          map[tu].sumPnl += sessionNet(s);
          map[tu].sumFees += Number((s as any)?.feesUsd) || 0;
        }
      }
    }

    for (const tr of ledgerAll.closedTrades) {
      for (const t of STRATEGY_TAGS) {
        const tu = safeUpper(t);
        if (tr.tagsUpper.includes(tu)) {
          map[tu].closedTrades.push(tr);
        }
      }
    }

    for (const op of ledgerAll.openPositions) {
      for (const t of STRATEGY_TAGS) {
        const tu = safeUpper(t);
        if (op.tagsUpper.includes(tu)) {
          map[tu].openPositions.push(op);
        }
      }
    }

    return map;
  }, [sessions, ledgerAll]);

  const selected = useMemo(() => {
    if (strategy === "ALL") {
      return {
        sessions,
        closedTrades: ledgerAll.closedTrades,
        openPositions: ledgerAll.openPositions,
      };
    }
    const k = safeUpper(strategy);
    const row = byStrategy[k];
    return row
      ? { sessions: row.sessions, closedTrades: row.closedTrades, openPositions: row.openPositions }
      : { sessions: [], closedTrades: [], openPositions: [] };
  }, [strategy, sessions, ledgerAll, byStrategy]);

  const agg = useMemo(() => {
    return computeStatsAgg({
      sessions: selected.sessions,
      ledgerClosedTrades: selected.closedTrades,
      ledgerOpenPositions: selected.openPositions,
      dailySnaps,
    });
  }, [selected, dailySnaps]);

  const kpis: KpiItem[] = useMemo(() => {
    const items: KpiItem[] = [
      // Trades
      {
        id: "closed_trades",
        category: "Trades",
        label: "Total Number of Closed Trades",
        value: agg.totalClosedTrades,
        description: "Counts trade-closes (exits) + synthetic closes for expired CREDIT options.",
      },
      {
        id: "open_trades",
        category: "Trades",
        label: "Total Number of Open Trades",
        value: agg.totalOpenTrades,
        description:
          "Open positions remaining after FIFO matching. CREDIT options with expiration in range are auto-closed at 0.00.",
      },
      {
        id: "win_trades",
        category: "Trades",
        label: "Total Number of Winning Trades",
        value: agg.totalWinningTrades,
        tone: "good",
      },
      {
        id: "learned_trades",
        category: "Trades",
        label: "Total Number of Learned Trades",
        value: agg.totalLearnedTrades,
        tone: agg.totalLearnedTrades > 0 ? "bad" : "neutral",
        description: "We avoid 'loss' terminology. Learned trades are trades with negative realized P&L.",
      },
      {
        id: "be_trades",
        category: "Trades",
        label: "Total Number of Break Even Trades",
        value: agg.totalBreakEvenTrades,
      },
      {
        id: "trade_win_rate",
        category: "Trades",
        label: "Trade Win Rate",
        value: fmtPct(agg.tradeWinRate),
        tone: agg.tradeWinRate >= 50 ? "good" : "neutral",
      },

      // P&L
      {
        id: "total_pl",
        category: "P&L",
        label: "Total P/L",
        value: fmtMoney(agg.totalPL),
        tone: agg.totalPL >= 0 ? "good" : "bad",
        description: "Sum of session net P&L (after fees) for selected range/strategy.",
      },
      {
        id: "avg_win_trade",
        category: "P&L",
        label: "Average Winning Trade",
        value: fmtMoney(agg.avgWinningTrade),
        tone: "good",
      },
      {
        id: "avg_learned_trade",
        category: "P&L",
        label: "Average Learned Trade",
        value: fmtMoney(agg.avgLearnedTrade),
        tone: agg.avgLearnedTrade < 0 ? "bad" : "neutral",
      },
      {
        id: "largest_win_trade",
        category: "P&L",
        label: "Largest Winning Trade",
        value: fmtMoney(agg.largestWinningTrade),
        tone: "good",
      },
      {
        id: "largest_learned_trade",
        category: "P&L",
        label: "Largest Learned Trade",
        value: fmtMoney(agg.largestLearnedTrade),
        tone: agg.largestLearnedTrade < 0 ? "bad" : "neutral",
      },
      {
        id: "expectancy",
        category: "P&L",
        label: "Trade Expectancy (Average P/L)",
        value: fmtMoney(agg.tradeExpectancy),
        tone: agg.tradeExpectancy >= 0 ? "good" : "bad",
      },

      // Costs
      {
        id: "trade_costs",
        category: "Costs",
        label: "Total Trade Costs",
        value: fmtMoney(agg.totalTradeCosts),
        description: "Aggregated fees/commissions found in session or trade rows.",
      },

      // Streaks
      {
        id: "win_streak",
        category: "Streaks",
        label: "Longest Winning Streak",
        value: agg.longestWinningStreak,
        description: "Measured as consecutive green sessions (net > 0).",
        tone: "good",
      },
      {
        id: "learned_streak",
        category: "Streaks",
        label: "Longest Learned Streak",
        value: agg.longestLearnedStreak,
        description: "Measured as consecutive learning sessions (net < 0).",
        tone: agg.longestLearnedStreak >= 3 ? "bad" : "neutral",
      },

      // Risk & RRR
      {
        id: "avg_risk_pct",
        category: "Risk & RRR",
        label: "Average % Risk Per Trade",
        value: agg.avgRiskPct == null ? "—" : fmtPct(agg.avgRiskPct, 2),
        description: "Requires riskPct fields stored on trades. If not present, shows —.",
      },
      {
        id: "avg_reward_pct",
        category: "Risk & RRR",
        label: "Average % Reward Per Trade",
        value: agg.avgRewardPct == null ? "—" : fmtPct(agg.avgRewardPct, 2),
        description: "Requires rewardPct fields stored on trades. If not present, shows —.",
      },
      {
        id: "planned_rrr",
        category: "Risk & RRR",
        label: "Avg Planned RRR (risk reward ratio)",
        value: agg.avgPlannedRRR == null ? "—" : agg.avgPlannedRRR.toFixed(2),
        description: "Derived from session tags like 'Risk-to-reward ≥ 2R (planned)' / '< 1.5R (tight)'.",
      },
      {
        id: "achieved_rrr",
        category: "Risk & RRR",
        label: "Avg Achieved RRR (risk reward ratio)",
        value: agg.avgAchievedRRR == null ? "—" : agg.avgAchievedRRR.toFixed(2),
        description: "Computed as avgWinner / abs(avgLearnedTrade) from closed trades.",
      },

      // Time
      {
        id: "hold_avg",
        category: "Time",
        label: "Average trade hold time (total)",
        value: fmtDurationMin(agg.avgHoldMin),
        description: "Computed from entry/exit times stored on trades.",
      },
      {
        id: "hold_win",
        category: "Time",
        label: "Average trade hold time for winners",
        value: fmtDurationMin(agg.avgHoldMinWinners),
      },
      {
        id: "hold_learned",
        category: "Time",
        label: "Average trade hold time for learned trades",
        value: fmtDurationMin(agg.avgHoldMinLearned),
      },

      // Account
      {
        id: "growth",
        category: "Account",
        label: "Account Growth (%)",
        value: agg.accountGrowthPct == null ? "—" : fmtPct(agg.accountGrowthPct, 2),
        description: "Uses daily snapshots start_of_day_balance + realized_usd. If snapshots missing, shows —.",
        tone: agg.accountGrowthPct != null && agg.accountGrowthPct >= 0 ? "good" : "neutral",
      },
      {
        id: "deposits",
        category: "Account",
        label: "Total deposits",
        value: agg.totalDeposits == null ? "—" : fmtMoney(agg.totalDeposits),
        description: "Requires deposits columns on daily snapshots (deposits_usd / depositsUsd / deposits).",
      },
      {
        id: "withdrawals",
        category: "Account",
        label: "Total withdrawals",
        value: agg.totalWithdrawals == null ? "—" : fmtMoney(agg.totalWithdrawals),
        description: "Requires withdrawals columns on daily snapshots (withdrawals_usd / withdrawalsUsd / withdrawals).",
      },
      {
        id: "discipline",
        category: "Account",
        label: "Discipline rating average (out of 10)",
        value: agg.disciplineAvg == null ? "—" : agg.disciplineAvg.toFixed(2),
        description: "Uses disciplineRating if present; else a deterministic heuristic based on tags + respectedPlan.",
        tone: agg.disciplineAvg != null && agg.disciplineAvg >= 7 ? "good" : "neutral",
      },
    ];

    return items;
  }, [agg]);

  const categories = useMemo(() => {
    const set = new Set<string>(kpis.map((k) => k.category));
    return ["ALL", ...Array.from(set)];
  }, [kpis]);

  const kpisFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return kpis.filter((k) => {
      if (category !== "ALL" && k.category !== category) return false;
      if (!q) return true;
      const hay = `${k.label} ${k.description ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [kpis, category, query]);

  const grouped = useMemo(() => {
    const map: Record<string, KpiItem[]> = {};
    for (const k of kpisFiltered) {
      map[k.category] ||= [];
      map[k.category].push(k);
    }
    return map;
  }, [kpisFiltered]);

  const strategyRows = useMemo(() => {
    return (STRATEGY_TAGS as readonly string[]).map((t) => {
      const r = byStrategy[safeUpper(t)];
      const closed = r?.closedTrades ?? [];
      const pnlList = closed.map((x) => Number(x.pnl) || 0);
      const winRate = pnlList.length ? (pnlList.filter((x) => x > 0).length / pnlList.length) * 100 : 0;
      const expectancy = pnlList.length ? mean(pnlList) : 0;

      return {
        tag: t,
        sessions: r?.sessions.length ?? 0,
        closedTrades: pnlList.length,
        openTrades: r?.openPositions.length ?? 0,
        winRate,
        expectancy,
        net: r?.sumPnl ?? 0,
      };
    });
  }, [byStrategy]);

  return (
    <section className="space-y-6">
      {/* Command header */}
      <div className={`${wrapCard()} bg-gradient-to-br from-slate-900/70 via-slate-950/65 to-slate-950/80`}>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
          <div>
            <p className={chartTitle()}>KPI Terminal</p>
            <p className={chartSub()}>
              Strategy split + KPI categories + search (built for scale, consistent trade closure logic).
            </p>
          </div>

          <div className="flex flex-col md:flex-row md:items-end gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-mono">STRATEGY</span>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              >
                <option value="ALL">All strategies</option>
                {STRATEGY_TAGS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-mono">CATEGORY</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "ALL" ? "All categories" : c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-mono">SEARCH</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search KPI…"
                className="w-[240px] rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <MiniKpi label="Selected sessions" value={selected.sessions.length} />
          <MiniKpi label="Closed trades" value={agg.totalClosedTrades} />
          <MiniKpi label="Trade win rate" value={fmtPct(agg.tradeWinRate)} tone={agg.tradeWinRate >= 50 ? "good" : "neutral"} />
          <MiniKpi label="Total P/L" value={fmtMoney(agg.totalPL)} tone={agg.totalPL >= 0 ? "good" : "bad"} />
        </div>
      </div>

      {/* Strategy breakdown */}
      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Strategy breakdown</p>
            <p className={chartSub()}>Click a strategy to filter all KPIs.</p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">STRAT</span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.22em] text-slate-500 border-b border-slate-800">
                <th className="px-3 py-2 text-left">Strategy</th>
                <th className="px-3 py-2 text-right">Sessions</th>
                <th className="px-3 py-2 text-right">Closed</th>
                <th className="px-3 py-2 text-right">Open</th>
                <th className="px-3 py-2 text-right">Win%</th>
                <th className="px-3 py-2 text-right">Expectancy</th>
                <th className="px-3 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {strategyRows.map((r) => {
                const active = strategy !== "ALL" && safeUpper(strategy) === safeUpper(r.tag);
                return (
                  <tr
                    key={r.tag}
                    className={`border-t border-slate-800 transition cursor-pointer ${
                      active ? "bg-emerald-500/10" : "bg-slate-950/45 hover:bg-slate-950/70"
                    }`}
                    onClick={() => setStrategy(r.tag)}
                    title="Click to filter KPIs by this strategy"
                  >
                    <td className="px-3 py-2 font-mono text-slate-100">{r.tag}</td>
                    <td className="px-3 py-2 text-right text-slate-200">{r.sessions}</td>
                    <td className="px-3 py-2 text-right text-slate-200">{r.closedTrades}</td>
                    <td className="px-3 py-2 text-right text-slate-200">{r.openTrades}</td>
                    <td className="px-3 py-2 text-right text-slate-200">{r.winRate.toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right font-mono ${r.expectancy >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                      {fmtMoney(r.expectancy)}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${r.net >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                      {fmtMoney(r.net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() => setStrategy("ALL")}
          className="mt-3 px-3 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-emerald-400 hover:text-emerald-300 transition"
        >
          Reset strategy filter
        </button>
      </div>

      {/* KPI grid */}
      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>KPI Grid</p>
            <p className={chartSub()}>
              Showing: <span className="text-slate-200 font-mono">{strategy === "ALL" ? "ALL" : strategy}</span>{" "}
              · {category === "ALL" ? "All categories" : category} · {kpisFiltered.length} KPIs
            </p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">KPI</span>
        </div>

        <div className="mt-4 space-y-6">
          {Object.entries(grouped).map(([cat, arr]) => (
            <div key={cat}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                  {cat}
                </p>
                <span className="text-[11px] text-slate-600 font-mono">
                  {arr.length}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {arr.map((k) => (
                  <KpiCard key={k.id} kpi={k} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-[11px] text-slate-500">
          Note: CREDIT option positions with no exit are auto-closed at expiry price 0.00 when the expiry date is within the selected range.
          This prevents "phantom opens" in statistics.
        </div>
      </div>
    </section>
  );
}

/* =========================
   Page
========================= */

export default function AnalyticsStatisticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // range presets + calendar
  const [preset, setPreset] = useState<RangePreset>("YTD");
  const initial = useMemo(() => computePreset("YTD"), []);
  const [startIso, setStartIso] = useState<string>(initial.startIso);
  const [endIso, setEndIso] = useState<string>(initial.endIso);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeGroup, setActiveGroup] = useState<AnalyticsGroupId>("overview");
  const [loadingData, setLoadingData] = useState(true);

  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [dailySnaps, setDailySnaps] = useState<DailySnapshotRow[]>([]);

  // Growth Plan (authoritative starting balance for equity curve)
  const [planStartingBalance, setPlanStartingBalance] = useState<number>(0);
  const [planStartIso, setPlanStartIso] = useState<string>("");
  const [loadingPlan, setLoadingPlan] = useState<boolean>(true);

  // auth gate
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  // preset -> dates
  useEffect(() => {
    if (preset === "CUSTOM") return;
    const { startIso: s, endIso: e } = computePreset(preset);
    setStartIso(s);
    setEndIso(e);
  }, [preset]);

  const dateRange = useMemo(() => {
    const start = startIso ? startOfDayUtc(startIso) : null;
    const end = endIso ? endOfDayUtc(endIso) : null;
    return { startIso, endIso, start, end };
  }, [startIso, endIso]);

  // unified userId (Supabase UUID) everywhere
  const userId = (user as any)?.id as string | undefined;

  // Load Growth Plan from Supabase (to avoid any local/legacy starting-balance drift)
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!userId) {
        if (alive) setLoadingPlan(false);
        return;
      }

      try {
        setLoadingPlan(true);

        const { data, error } = await supabaseBrowser
          .from("growth_plans")
          .select("starting_balance, created_at, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1);

        if (!alive) return;

        if (error) {
          console.error("[analytics] growth_plans load error:", error);
          setPlanStartingBalance(0);
          setPlanStartIso("");
          return;
        }

        const row = Array.isArray(data) && data.length ? (data[0] as any) : null;
        const sb = Number(row?.starting_balance ?? 0);
        setPlanStartingBalance(Number.isFinite(sb) ? sb : 0);

        const startIso = String(row?.created_at ?? row?.updated_at ?? "").slice(0, 10);
        setPlanStartIso(looksLikeYYYYMMDD(startIso) ? startIso : "");
      } catch (e) {
        console.error("[analytics] growth_plans load exception:", e);
        if (!alive) return;
        setPlanStartingBalance(0);
        setPlanStartIso("");
      } finally {
        if (alive) setLoadingPlan(false);
      }
    };

    run();

    return () => {
      alive = false;
    };
  }, [userId]);

  // Load journal entries (all-time; filter in-memory by selected range)
  useEffect(() => {
    if (loading || !userId) return;

    const load = async () => {
      try {
        setLoadingData(true);
        const all = await getAllJournalEntries(userId);
        setEntries(all);
      } catch (err) {
        console.error("[AnalyticsStatisticsPage] error loading entries:", err);
        setEntries([]);
      } finally {
        setLoadingData(false);
      }
    };

    load();
  }, [loading, userId]);

  // Load daily snapshots for selected range
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!userId) return;
      if (!dateRange.startIso || !dateRange.endIso) return;

      try {
        const rows = await listDailySnapshots(userId, dateRange.startIso, dateRange.endIso);
        if (!alive) return;
        setDailySnaps(rows || []);
      } catch (e) {
        console.error("[daily_snapshots] load error", e);
        if (alive) setDailySnaps([]);
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [userId, dateRange.startIso, dateRange.endIso]);

  /* =========================
     Normalize sessions with trades (parseNotesTrades + pnlNet)
  ========================= */
  const sessionsAll: SessionWithTrades[] = useMemo(() => {
    return (entries || []).map((s) => {
      const { entries: entRaw, exits: exRaw } = parseNotesTrades((s as any).notes);

      const ent2: EntryTradeRow[] = (entRaw || []).map((t: any) => {
        const kind = normalizeKind(t.kind);
        const side = normalizeSide(t.side);
        const underlying = t?.underlying ? String(t.underlying) : getUnderlyingFromSymbol(t.symbol);
        return { ...t, kind, side, underlying };
      });

      const ex2: ExitTradeRow[] = (exRaw || []).map((t: any) => {
        const kind = normalizeKind(t.kind);
        const side = normalizeSide(t.side);
        const underlying = t?.underlying ? String(t.underlying) : getUnderlyingFromSymbol(t.symbol);
        return { ...t, kind, side, underlying };
      });

      const uniqueSymbolsSet = new Set<string>();
      for (const t of ent2) uniqueSymbolsSet.add(safeUpper(t.symbol));
      for (const t of ex2) uniqueSymbolsSet.add(safeUpper(t.symbol));
      uniqueSymbolsSet.delete("");

      const uniqueKindsSet = new Set<InstrumentType>();
      for (const t of ent2) uniqueKindsSet.add(normalizeKind(t.kind));
      for (const t of ex2) uniqueKindsSet.add(normalizeKind(t.kind));

      const uniqueUnderlyingsSet = new Set<string>();
      for (const t of ent2) if (t.underlying) uniqueUnderlyingsSet.add(safeUpper(String(t.underlying)));
      for (const t of ex2) if (t.underlying) uniqueUnderlyingsSet.add(safeUpper(String(t.underlying)));
      uniqueUnderlyingsSet.delete("");

      const perSymbolPnL = computePnLBySymbol(ent2, ex2);

      // Map symbol -> underlying and aggregate PnL by underlying
      const symToUnd: Record<string, string> = {};
      for (const t of ent2) {
        const sym = safeUpper(t.symbol);
        if (!sym) continue;
        symToUnd[sym] = safeUpper(String(t.underlying || getUnderlyingFromSymbol(sym)));
      }
      for (const t of ex2) {
        const sym = safeUpper(t.symbol);
        if (!sym) continue;
        symToUnd[sym] = safeUpper(String(t.underlying || getUnderlyingFromSymbol(sym)));
      }

      const perUnderlyingPnL: Record<string, number> = {};
      for (const [sym, pnl] of Object.entries(perSymbolPnL || {})) {
        const und = symToUnd[sym] || getUnderlyingFromSymbol(sym);
        const u = safeUpper(und);
        if (!u) continue;
        perUnderlyingPnL[u] = (perUnderlyingPnL[u] || 0) + (Number(pnl) || 0);
      }

      // Prefer stored PnL if valid; else compute from trades
      const pnlStored = Number((s as any)?.pnl);
      const pnlComputed = Number.isFinite(pnlStored)
        ? pnlStored
        : Object.values(perSymbolPnL || {}).reduce((a, v) => a + (Number(v) || 0), 0);

      // Fees: prefer session-level else trade-level
      const feesSession = extractSessionFeesUsd(s as any);
      const feesTrades = sumFeesFromTrades(ent2 as any[], ex2 as any[]);
      const feesUsd = feesSession !== 0 ? feesSession : feesTrades;

      const pnlNet = pnlComputed - (Number.isFinite(feesUsd) ? feesUsd : 0);

      const isGreenComputed = pnlNet > 0;
      const isLearningComputed = pnlNet < 0;
      const isFlatComputed = pnlNet === 0;

      const firstTime =
        ent2.find((x) => String(x?.time || "").trim())?.time ??
        ex2.find((x) => String(x?.time || "").trim())?.time ??
        null;

      const firstHour = parseHourBucket(firstTime);

      return {
        ...(s as any),
        entries: ent2,
        exits: ex2,
        uniqueSymbols: Array.from(uniqueSymbolsSet),
        uniqueKinds: Array.from(uniqueKindsSet),
        uniqueUnderlyings: Array.from(uniqueUnderlyingsSet),
        perSymbolPnL,
        perUnderlyingPnL,
        pnlComputed,
        feesUsd,
        pnlNet,
        isGreenComputed,
        isLearningComputed,
        isFlatComputed,
        firstHour,
      } as SessionWithTrades;
    });
  }, [entries]);

  // Filter sessions by selected date range (page-wide)
  const sessions: SessionWithTrades[] = useMemo(() => {
    const { start, end } = dateRange;
    if (!start || !end) return sessionsAll;

    return sessionsAll.filter((s) => {
      const d = safeDateFromSession(s);
      if (!d) return true; // don't drop unknown dates
      return d >= start && d <= end;
    });
  }, [sessionsAll, dateRange]);

  // Build snapshot-like object for UI (based on filtered sessions + filtered daily snaps)
  useEffect(() => {
    // Equity curve = Growth Plan starting balance + cumulative net session P&L (after fees).
    // This prevents stale/legacy baselines (e.g., default 5000) from leaking into analytics.
    const startIso = dateRange.startIso;
    const endIso = dateRange.endIso;
    const planStart = looksLikeYYYYMMDD(planStartIso) ? planStartIso : "";

    const daily: Record<string, number> = {};
    let pnlBefore = 0;

    for (const s of sessionsAll) {
      const dIso = sessionDateIsoKey(s);
      if (!dIso) continue;
      if (planStart && dIso < planStart) continue;

      const net = sessionNet(s);

      if (startIso && dIso < startIso) {
        pnlBefore += net;
        continue;
      }
      if (endIso && dIso > endIso) continue;

      daily[dIso] = (daily[dIso] || 0) + net;
    }

    const dates = Object.keys(daily).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    let eq = (Number.isFinite(planStartingBalance) ? planStartingBalance : 0) + pnlBefore;

    const equityCurve = dates.map((d) => {
      eq += daily[d] || 0;
      return { date: d, value: Number(eq.toFixed(2)) };
    });

    const dailyPnl = dates.map((d) => ({ date: d, pnl: Number((daily[d] || 0).toFixed(2)) }));

    const totalSessions = sessions.length;
    const greenSessions = sessions.filter((s) => s.isGreenComputed).length;
    const learningSessions = sessions.filter((s) => s.isLearningComputed).length;
    const flatSessions = sessions.filter((s) => s.isFlatComputed).length;

    const sumPnl = sessions.reduce((a, s) => a + sessionNet(s), 0);
    const avgPnl = totalSessions ? sumPnl / totalSessions : 0;
    const baseGreenRate = totalSessions ? (greenSessions / totalSessions) * 100 : 0;

    const symAgg: Record<string, { sessions: number; greens: number; sumPnl: number; closed: number }> = {};
    const undAgg: Record<string, { sessions: number; greens: number; sumPnl: number }> = {};

    for (const s of sessions) {
      const net = sessionNet(s);
      const isGreen = net > 0;

      for (const sym of s.uniqueSymbols || []) {
        const k = safeUpper(sym);
        if (!k) continue;
        symAgg[k] ||= { sessions: 0, greens: 0, sumPnl: 0, closed: 0 };
        symAgg[k].sessions++;
        symAgg[k].greens += isGreen ? 1 : 0;
        symAgg[k].sumPnl += Number(s.perSymbolPnL?.[k] ?? 0);
      }

      for (const und of s.uniqueUnderlyings || []) {
        const k = safeUpper(und);
        if (!k) continue;
        undAgg[k] ||= { sessions: 0, greens: 0, sumPnl: 0 };
        undAgg[k].sessions++;
        undAgg[k].greens += isGreen ? 1 : 0;
        undAgg[k].sumPnl += Number(s.perUnderlyingPnL?.[k] ?? 0);
      }

      // closed count (approx)
      for (const ex of s.exits || []) {
        const sym = safeUpper(ex.symbol);
        if (sym && symAgg[sym]) symAgg[sym].closed += 1;
      }
    }

    const symbols = Object.entries(symAgg)
      .map(([symbol, v]) => ({
        symbol,
        sessions: v.sessions,
        winRate: v.sessions ? (v.greens / v.sessions) * 100 : 0,
        netPnl: v.sumPnl,
        avgPnlPerSession: v.sessions ? v.sumPnl / v.sessions : 0,
      }))
      .sort((a, b) => b.netPnl - a.netPnl);

    const underlyings = Object.entries(undAgg)
      .map(([underlying, v]) => ({
        underlying,
        sessions: v.sessions,
        winRate: v.sessions ? (v.greens / v.sessions) * 100 : 0,
        netPnl: v.sumPnl,
        avgPnlPerSession: v.sessions ? v.sumPnl / v.sessions : 0,
      }))
      .sort((a, b) => b.netPnl - a.netPnl);

    setSnapshot({
      updatedAt: new Date().toISOString(),
      totals: { totalSessions, greenSessions, learningSessions, flatSessions, sumPnl, avgPnl, baseGreenRate },
      series: { equityCurve, dailyPnl },
      edges: { symbols, underlyings },
    });
  }, [sessionsAll, sessions, dateRange.startIso, dateRange.endIso, planStartingBalance, planStartIso]);

  /* =========================
     Probability stats (always use sessionNet)
  ========================= */
  const probabilityStats = useMemo(() => {
    const total = sessions.length;
    if (total === 0) {
      return {
        baseGreenRate: 0,
        pGreenRespect: 0,
        pLearningFomo: 0,
      };
    }

    let baseGreen = 0;

    let respectCount = 0;
    let respectGreen = 0;

    let fomoCount = 0;
    let fomoLearning = 0;

    for (const e of sessions) {
      const pnl = sessionNet(e);
      const isGreen = pnl > 0;
      const isLearning = pnl < 0;

      const respectedPlan = !!(e as any).respectedPlan;
      const tagsUpper = tagsUpperFromSession(e);
      const hasFomo = tagsUpper.includes("FOMO");

      if (isGreen) baseGreen++;

      if (respectedPlan) {
        respectCount++;
        if (isGreen) respectGreen++;
      }

      if (hasFomo) {
        fomoCount++;
        if (isLearning) fomoLearning++;
      }
    }

    const baseGreenRate = (baseGreen / total) * 100;
    const pGreenRespect = respectCount > 0 ? (respectGreen / respectCount) * 100 : 0;
    const pLearningFomo = fomoCount > 0 ? (fomoLearning / fomoCount) * 100 : 0;

    return {
      baseGreenRate,
      pGreenRespect,
      pLearningFomo,
    };
  }, [sessions]);

  /* =========================
     Day of week (sessionNet)
  ========================= */
  const uiWeekdayBars = useMemo(() => {
    const base: Record<DayOfWeekKey, { sessions: number; wins: number; sum: number }> = {
      0: { sessions: 0, wins: 0, sum: 0 },
      1: { sessions: 0, wins: 0, sum: 0 },
      2: { sessions: 0, wins: 0, sum: 0 },
      3: { sessions: 0, wins: 0, sum: 0 },
      4: { sessions: 0, wins: 0, sum: 0 },
      5: { sessions: 0, wins: 0, sum: 0 },
      6: { sessions: 0, wins: 0, sum: 0 },
    };

    for (const s of sessions) {
      const d = safeDateFromSession(s);
      if (!d) continue;
      const dow = d.getDay() as DayOfWeekKey;
      const pnl = sessionNet(s);
      base[dow].sessions += 1;
      base[dow].sum += pnl;
      if (pnl > 0) base[dow].wins += 1;
    }

    return (Object.keys(base) as unknown as DayOfWeekKey[]).map((dow) => {
      const x = base[dow];
      const winRate = x.sessions ? (x.wins / x.sessions) * 100 : 0;
      const avgPnl = x.sessions ? x.sum / x.sessions : 0;
      return { dow, label: DAY_LABELS[dow], winRate, sessions: x.sessions, avgPnl };
    });
  }, [sessions]);

  /* =========================
     Live series (fallback if snapshots absent)
  ========================= */
  const equityCurveLive = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => {
      const da = safeDateFromSession(a);
      const db = safeDateFromSession(b);
      return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
    });

    let cum = 0;
    return sorted.map((s) => {
      const pnl = sessionNet(s);
      cum += pnl;
      const d = safeDateFromSession(s);
      const key = d ? isoDate(d) : String((s as any).date || "");
      return { date: key, value: Number(cum.toFixed(2)) };
    });
  }, [sessions]);

  const dailyPnlLive = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => {
      const da = safeDateFromSession(a);
      const db = safeDateFromSession(b);
      return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
    });
    return sorted.map((s) => {
      const d = safeDateFromSession(s);
      const key = d ? isoDate(d) : String((s as any).date || "");
      return { date: key, pnl: Number(sessionNet(s).toFixed(2)) };
    });
  }, [sessions]);

  const uiEquity = useMemo(() => {
    const s = snapshot?.series?.equityCurve;
    if (Array.isArray(s) && s.length) return s;
    return equityCurveLive;
  }, [snapshot, equityCurveLive]);

  const uiDaily = useMemo(() => {
    const s = snapshot?.series?.dailyPnl;
    if (Array.isArray(s) && s.length) return s;
    return dailyPnlLive;
  }, [snapshot, dailyPnlLive]);

  /* =========================
     Usage
  ========================= */
  const uiUsage = useMemo(() => {
    const PREMARKET_KEYS = ["premarketBias", "premarketPlan", "premarketLevels", "premarketCatalyst", "premarketChecklist"];
    const AI_KEYS = ["aiCoachingUsed", "aiCoachUsed", "ai_messages_count", "aiCoachCount"];

    let pmFilled = 0;
    let pmTotal = 0;
    let aiUsedSessions = 0;

    for (const s of sessions) {
      pmFilled += countTruthyFields(s as any, PREMARKET_KEYS);
      pmTotal += PREMARKET_KEYS.length;

      const aiCount = countTruthyFields(s as any, AI_KEYS);
      if (aiCount > 0) aiUsedSessions += 1;
    }

    const premarketFillRate = pmTotal > 0 ? (pmFilled / pmTotal) * 100 : 0;
    const aiUsageRate = sessions.length > 0 ? (aiUsedSessions / sessions.length) * 100 : 0;

    return { premarketFillRate, aiUsageRate, aiUsedSessions };
  }, [sessions]);

  /* =========================
     Instruments stats
  ========================= */
  const underlyingMix = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sessions) {
      for (const u of s.uniqueUnderlyings || []) {
        const uu = String(u || "—");
        map[uu] = (map[uu] || 0) + 1;
      }
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [sessions]);

  const instrumentStats = useMemo(() => {
    const map: Record<
      string,
      { symbol: string; sessions: number; netPnl: number; win: number; underlying: string; tradesClosed: number }
    > = {};

    for (const s of sessions) {
      const isGreen = sessionNet(s) > 0;

      for (const sym of s.uniqueSymbols || []) {
        const symbol = safeUpper(sym);
        if (!symbol) continue;
        const underlying = getUnderlyingFromSymbol(symbol);
        map[symbol] ||= { symbol, sessions: 0, netPnl: 0, win: 0, underlying, tradesClosed: 0 };
        map[symbol].sessions += 1;
        if (isGreen) map[symbol].win += 1;
        map[symbol].netPnl += Number(s.perSymbolPnL?.[symbol] ?? 0);
      }
      for (const ex of s.exits || []) {
        const sym = safeUpper(ex.symbol);
        if (sym && map[sym]) map[sym].tradesClosed += 1;
      }
    }

    const tickers = Object.values(map)
      .map((t) => ({
        symbol: t.symbol,
        underlying: t.underlying,
        sessions: t.sessions,
        tradesClosed: t.tradesClosed,
        winRate: t.sessions ? (t.win / t.sessions) * 100 : 0,
        netPnl: t.netPnl,
        avgPnlPerSession: t.sessions ? t.netPnl / t.sessions : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    const mostSupportive = [...tickers].sort((a, b) => b.winRate - a.winRate).slice(0, 7);
    const topEarners = [...tickers].sort((a, b) => b.netPnl - a.netPnl).slice(0, 7);
    const toReview = tickers
      .filter((t) => t.sessions >= 2 && t.netPnl < 0)
      .sort((a, b) => a.netPnl - b.netPnl)
      .slice(0, 7);

    return { tickers, mostSupportive, topEarners, toReview };
  }, [sessions]);

  /* =========================
     Psychology: read from session tags
  ========================= */
  const psychologyLive = useMemo(() => {
    const freq: Record<string, number> = {};

    const emoAgg: Record<string, { n: number; wins: number; sum: number }> = {};
    for (const t of PSYCHOLOGY_TAGS) {
      emoAgg[safeUpper(t)] = { n: 0, wins: 0, sum: 0 };
    }

    const timeline = [...sessions]
      .sort((a, b) => {
        const da = safeDateFromSession(a);
        const db = safeDateFromSession(b);
        return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
      })
      .map((s) => {
        const tagsUpper = tagsUpperFromSession(s);

        const emos = (PSYCHOLOGY_TAGS as readonly string[])
          .map((t) => safeUpper(t))
          .filter((u) => tagsUpper.includes(u));

        for (const e of emos) {
          freq[e] = (freq[e] || 0) + 1;
        }

        const pnl = Number(sessionNet(s).toFixed(2));
        const isGreen = pnl > 0;

        for (const e of emos) {
          emoAgg[e].n += 1;
          emoAgg[e].wins += isGreen ? 1 : 0;
          emoAgg[e].sum += pnl;
        }

        const top = emos.length ? emos[0] : "—";
        const d = safeDateFromSession(s);
        const dateKey = d ? isoDate(d) : String((s as any).date || "");

        return { date: dateKey, pnl, emotion: top };
      });

    const freqArr = Object.entries(freq)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);

    const kpis = (PSYCHOLOGY_TAGS as readonly string[]).map((t) => {
      const k = safeUpper(t);
      const v = emoAgg[k] || { n: 0, wins: 0, sum: 0 };
      return {
        tag: t,
        count: v.n,
        winRate: v.n ? (v.wins / v.n) * 100 : 0,
        avgPnl: v.n ? v.sum / v.n : 0,
      };
    });

    return { freqArr, timeline, kpis };
  }, [sessions]);

  /* =========================
     Totals (selected range)
  ========================= */
  const uiTotals = useMemo(() => {
    const totalSessions = sessions.length;
    const greenSessions = sessions.filter((s) => s.isGreenComputed).length;
    const learningSessions = sessions.filter((s) => s.isLearningComputed).length;
    const flatSessions = sessions.filter((s) => s.isFlatComputed).length;
    const sumPnl = sessions.reduce((a, s) => a + sessionNet(s), 0);
    const avgPnl = totalSessions ? sumPnl / totalSessions : 0;
    const baseGreenRate = totalSessions ? (greenSessions / totalSessions) * 100 : 0;

    const t = snapshot?.totals;
    if (t) {
      return {
        totalSessions: t.totalSessions ?? totalSessions,
        greenSessions: t.greenSessions ?? greenSessions,
        learningSessions: t.learningSessions ?? learningSessions,
        flatSessions: t.flatSessions ?? flatSessions,
        sumPnl: t.sumPnl ?? sumPnl,
        avgPnl: t.avgPnl ?? avgPnl,
        baseGreenRate: t.baseGreenRate ?? baseGreenRate,
      };
    }

    return { totalSessions, greenSessions, learningSessions, flatSessions, sumPnl, avgPnl, baseGreenRate };
  }, [sessions, snapshot]);

  /* =========================
     Render
  ========================= */
  if (loading || !user || loadingData || loadingPlan) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading analytics…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-4 md:px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <header className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">
                  Performance · Analytics
                </p>
                <h1 className="text-3xl md:text-4xl font-semibold mt-1">
                  Analytics & Statistics
                </h1>
                <p className="text-sm md:text-base text-slate-400 mt-2 max-w-2xl">
                  Terminal-style analytics with consistent realized net P&amp;L and a selectable date range.
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
                  Sessions analyzed:{" "}
                  <span className="text-emerald-300 font-semibold">{uiTotals.totalSessions}</span>
                </p>
              </div>
            </div>

            {/* Date Range Controls */}
            <div className={wrapCard()}>
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                <div>
                  <p className={chartTitle()}>Date Range</p>
                  <p className={chartSub()}>
                    Presets or custom calendar range. This filters the entire analytics page.
                  </p>
                </div>

                <div className="flex flex-col md:flex-row md:items-end gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-mono">PRESET</span>
                    <select
                      value={preset}
                      onChange={(e) => setPreset(e.target.value as RangePreset)}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    >
                      <option value="ALL">All (last 5Y)</option>
                      <option value="YTD">YTD</option>
                      <option value="LAST_YEAR">Last Year</option>
                      <option value="LAST_90D">Last 90 Days</option>
                      <option value="LAST_30D">Last 30 Days</option>
                      <option value="CUSTOM">Custom</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-mono">FROM</span>
                    <input
                      type="date"
                      value={startIso}
                      onChange={(e) => {
                        setPreset("CUSTOM");
                        setStartIso(e.target.value);
                      }}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-mono">TO</span>
                    <input
                      type="date"
                      value={endIso}
                      onChange={(e) => {
                        setPreset("CUSTOM");
                        setEndIso(e.target.value);
                      }}
                      className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
                    <span className="font-mono">{startIso}</span> → <span className="font-mono">{endIso}</span>
                  </div>
                </div>
              </div>

              {snapshot?.updatedAt && (
                <div className="mt-3 text-[11px] text-slate-500">
                  Updated:{" "}
                  <span className="text-slate-300">
                    {new Date(snapshot.updatedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {/* Group tabs */}
            <section>
              <div className="flex flex-wrap gap-2">
                {GROUPS.map((g) => {
                  const active = g.id === activeGroup;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setActiveGroup(g.id)}
                      className={`px-3 py-1.5 rounded-full text-xs md:text-sm border transition ${
                        active
                          ? "bg-emerald-400 text-slate-950 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.30)]"
                          : "bg-slate-950 text-slate-200 border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
                      }`}
                    >
                      {g.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {GROUPS.find((g) => g.id === activeGroup)?.description}
              </p>
            </section>
          </header>

          {uiTotals.totalSessions === 0 ? (
            <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-6">
              <p className="text-slate-200 text-sm font-medium mb-1">No data yet</p>
              <p className="text-sm text-slate-400">
                Start logging your trading sessions in the{" "}
                <Link href="/dashboard" className="text-emerald-400 underline">
                  dashboard journal
                </Link>{" "}
                to unlock analytics.
              </p>
            </section>
          ) : (
            <>
              {activeGroup === "overview" && (
                <OverviewSection
                  probabilityStats={probabilityStats}
                  uiTotals={uiTotals}
                  equity={uiEquity}
                  dailyPnl={uiDaily}
                  usage={uiUsage}
                />
              )}

              {activeGroup === "day-of-week" && (
                <DayOfWeekSection weekdayBars={uiWeekdayBars as any} />
              )}

              {activeGroup === "psychology" && (
                <PsychologySection
                  probabilityStats={probabilityStats}
                  psychology={psychologyLive}
                />
              )}

              {activeGroup === "instruments" && (
                <InstrumentsSection
                  stats={instrumentStats}
                  underlyingMix={underlyingMix}
                />
              )}

              {activeGroup === "terminal" && (
                <TerminalSection
                  weekdayBars={uiWeekdayBars.map((x) => ({ label: x.label, winRate: x.winRate }))}
                  sessions={sessions}
                />
              )}

              {activeGroup === "statistics" && (
                <StatisticsSection sessions={sessions} dailySnaps={dailySnaps} rangeEndIso={dateRange.endIso} />
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
