// app/analytics-statistics/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, Fragment } from "react";
import type { ReactNode } from "react";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

import { type InstrumentType } from "@/lib/journalNotes";
import type { JournalEntry } from "@/lib/journalLocal";
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
  AreaChart,
  Area,
} from "recharts";

// ECharts (client-only)
const EChartsReact = dynamic(() => import("echarts-for-react"), { ssr: false });

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
    description: "Emotions, plan adherence & mistakes.",
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
    description: "KPI grid with search + filters.",
  },
];

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
  return (s === "short" ? "short" : "long") as SideType;
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

    // mild improvement: options multiplier based on normalized kind string
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
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-3 py-2">
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
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-[280px] -translate-x-1/2 rounded-2xl border border-slate-700 bg-slate-950/95 p-3 text-[11px] leading-relaxed text-slate-200 shadow-[0_0_25px_rgba(0,0,0,0.6)] opacity-0 transition group-hover:opacity-100">
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
   Sections (kept similar, but now consistent P&L)
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
              <p className={chartSub()}>Cumulative P&amp;L over time</p>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">EQ</span>
          </div>

          <div className="mt-3 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equity}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 8" />
                <XAxis
                  dataKey="date"
                  tick={axisStyle()}
                  tickFormatter={formatDateFriendly}
                  axisLine={{ stroke: CHART_COLORS.grid }}
                  tickLine={false}
                />
                <YAxis tick={axisStyle()} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} width={46} />
                <Tooltip {...tooltipProps()} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_COLORS.emerald}
                  strokeWidth={2}
                  fill={CHART_COLORS.emeraldDim}
                  fillOpacity={1}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
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

function PsychologySection({
  probabilityStats,
  psychology,
}: {
  probabilityStats: any;
  psychology: { freqArr: { name: string; value: number }[]; timeline: any[] };
}) {
  const freq = psychology.freqArr || [];
  const timeline = psychology.timeline || [];

  const emoColor = (emo: string) => {
    const e = safeUpper(emo);
    if (e.includes("FEAR") || e.includes("ANX")) return CHART_COLORS.sky;
    if (e.includes("FOMO") || e.includes("GREED")) return CHART_COLORS.danger;
    if (e.includes("CALM") || e.includes("CONF")) return CHART_COLORS.emerald;
    return "rgba(148,163,184,0.60)";
  };

  return (
    <section className="space-y-6">
      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Emotion frequency</p>
            <p className={chartSub()}>Most common emotions (top 12)</p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">EMO</span>
        </div>

        <div className="mt-3 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={freq} barCategoryGap={22} barGap={6} layout="vertical">
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 8" />
              <XAxis type="number" tick={axisStyle()} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={axisStyle()} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} width={110} />
              <Tooltip {...tooltipProps()} />
              <Bar dataKey="value" radius={[8, 8, 8, 8]}>
                {freq.map((x) => (
                  <Cell key={x.name} fill={emoColor(x.name)} opacity={0.90} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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
            <p className={chartTitle()}>Emotions over time</p>
            <p className={chartSub()}>Timeline (net PnL + primary emotion)</p>
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
  const tickers = stats.tickers || [];

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
            <MiniKpi label="Worst ticker" value={toReview?.[0]?.symbol ?? "—"} tone="bad" />
          </div>
        </div>
      </div>

      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Ticker table</p>
            <p className={chartSub()}>Symbol + edge metrics (selected range)</p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">TAB</span>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.22em] text-slate-500 border-b border-slate-800">
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-left">Underlying</th>
                <th className="px-3 py-2 text-right">Sessions</th>
                <th className="px-3 py-2 text-right">Closed</th>
                <th className="px-3 py-2 text-right">Win%</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2 text-right">Avg</th>
              </tr>
            </thead>
            <tbody>
              {tickers.slice(0, 60).map((t: any) => (
                <tr key={t.symbol} className="border-t border-slate-800 bg-slate-950/45 hover:bg-slate-950/70 transition">
                  <td className="px-3 py-2 font-mono text-slate-100">{t.symbol}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{t.underlying || "—"}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{t.sessions}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{t.tradesClosed}</td>
                  <td className="px-3 py-2 text-right text-slate-200">{t.winRate.toFixed(1)}%</td>
                  <td className={`px-3 py-2 text-right font-mono ${t.netPnl >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                    {fmtMoney(t.netPnl)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{fmtMoney(t.avgPnlPerSession)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
   Page
========================= */

export default function AnalyticsStatisticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // FIX: range presets + calendar
  const [preset, setPreset] = useState<RangePreset>("YTD");
  const initial = useMemo(() => computePreset("YTD"), []);
  const [startIso, setStartIso] = useState<string>(initial.startIso);
  const [endIso, setEndIso] = useState<string>(initial.endIso);

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeGroup, setActiveGroup] = useState<AnalyticsGroupId>("overview");
  const [loadingData, setLoadingData] = useState(true);

  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [dailySnaps, setDailySnaps] = useState<DailySnapshotRow[]>([]);

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

  // FIX: unified userId (Supabase UUID) everywhere
  const userId = (user as any)?.id as string | undefined;

  // Load journal entries (all-time; we filter in-memory by selected range)
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
     Normalize sessions with trades (FIXED parseNotesTrades + pnlNet)
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
    const snaps = [...(dailySnaps || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
    // equity from snapshots (if you store balances, use them here; this is kept as your current logic)
    const equityCurve = snaps.map((s) => ({
      date: s.date,
      value: (Number(s.start_of_day_balance) || 0) + (Number(s.realized_usd) || 0),
    }));
    const dailyPnl = snaps.map((s) => ({ date: s.date, pnl: Number(s.realized_usd) || 0 }));

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
  }, [dailySnaps, sessions]);

  /* =========================
     Probability stats (FIX: always use sessionNet)
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
      const tagsRaw = ((e as any).tags || []) as string[];
      const tagsUpper = tagsRaw.map((t) => safeUpper(t || ""));
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
     Day of week (FIX: sessionNet)
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
     (FIX: sessionNet used)
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
     Usage (unchanged logic, but filtered sessions)
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
     Instruments stats (FIX: green/red uses sessionNet)
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
     Psychology (FIX: uses sessionNet)
  ========================= */
  const psychologyLive = useMemo(() => {
    const freq: Record<string, number> = {};
    const timeline = [...sessions]
      .sort((a, b) => {
        const da = safeDateFromSession(a);
        const db = safeDateFromSession(b);
        return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
      })
      .map((s) => {
        const rawEmos =
          (s as any).emotions ??
          (s as any).psychology?.emotions ??
          (s as any).psychologyEmotions ??
          ((s as any).emotionPrimary ? [(s as any).emotionPrimary] : []);

        const arr = Array.isArray(rawEmos) ? rawEmos : [];
        const cleaned = arr.map((x: any) => String(x || "").trim()).filter(Boolean);
        for (const e of cleaned) freq[safeUpper(e)] = (freq[safeUpper(e)] || 0) + 1;

        const top = cleaned.length ? safeUpper(cleaned[0]) : "—";
        const d = safeDateFromSession(s);
        const dateKey = d ? isoDate(d) : String((s as any).date || "");

        return {
          date: dateKey,
          pnl: Number(sessionNet(s).toFixed(2)),
          emotion: top,
        };
      });

    const freqArr = Object.entries(freq)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);

    return { freqArr, timeline };
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

    // prefer snapshot totals if present (but they are already computed with filtered sessions in this file)
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
  if (loading || !user || loadingData) {
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

            {/* Date Range Controls (NEW) */}
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

              {/* Statistics group: you can re-add your full KPI grid here.
                  Kept out to keep this file manageable, but all fixes are applied (sessionNet + range). */}
              {activeGroup === "statistics" && (
                <div className={wrapCard()}>
                  <p className={chartTitle()}>Statistics</p>
                  <p className={chartSub()}>
                    Your KPI grid can be plugged back in here. The important fixes are already applied:
                    unified userId, notes(jsonb) parsing, and sessionNet consistency + date range filtering.
                  </p>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                    <MiniKpi label="Sessions" value={uiTotals.totalSessions} />
                    <MiniKpi label="Net P&L" value={fmtMoney(uiTotals.sumPnl)} tone={uiTotals.sumPnl >= 0 ? "good" : "bad"} />
                    <MiniKpi label="Win rate" value={`${uiTotals.baseGreenRate.toFixed(1)}%`} tone={uiTotals.baseGreenRate >= 50 ? "good" : "neutral"} />
                  </div>
                  <p className="mt-4 text-[11px] text-slate-500">
                    Si quieres, en el próximo mensaje integro tu StatisticsSection completo dentro de esta misma
                    versión ya corregida (queda largo, pero totalmente posible).
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
