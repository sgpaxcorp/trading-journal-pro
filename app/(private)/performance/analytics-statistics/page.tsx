// =========================
// CHUNK 1 / 2
// app/analytics-statistics/page.tsx
// =========================
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";



import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

import { type InstrumentType } from "@/lib/journalNotes";
// Solo usamos el TYPE (lo de live compute depende de tu shape actual)
import type { JournalEntry } from "@/lib/journalLocal";
// Data real desde Supabase (como lo tienes)
import { getAllJournalEntries } from "@/lib/journalSupabase";
import { listDailySnapshots, type DailySnapshotRow } from "@/lib/snapshotSupabase";

// Recharts (tu base “terminal” sutil)
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

/* -------------------------
   Optional chart engines
-------------------------- */
// ECharts (client-only)
const EChartsReact = dynamic(() => import("echarts-for-react"), { ssr: false });

/* =========================
   Types
========================= */

type AnalyticsGroupId = "overview" | "day-of-week" | "psychology" | "instruments" | "terminal" | "statistics";
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
    dayOfWeek?: { dow: number; label: string; winRate: number; sessions: number; avgPnl: number }[];
    dailyPnl?: { date: string; pnl: number }[];
  };
  edges?: {
    symbols?: { symbol: string; sessions: number; winRate: number; netPnl: number; avgPnlPerSession?: number }[];
    underlyings?: {
      underlying: string;
      sessions: number;
      winRate: number;
      netPnl: number;
      avgPnlPerSession?: number;
    }[];
  };
  usage?: { premarketFillRate?: number; aiUsageRate?: number; aiUsedSessions?: number };
  heatmaps?: {
    hourUnderlying?: { underlying: string; hour: number; sessions: number; winRate: number; avgPnl: number }[];
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
  { id: "overview", label: "Overview", description: "Global performance, probabilities, and curve." },
  { id: "day-of-week", label: "Day of week", description: "Weekday edge & distribution." },
  { id: "psychology", label: "Psychology", description: "Emotions, plan adherence & mistakes." },
  { id: "instruments", label: "Instruments", description: "Symbols, underlyings, kinds, and edge tables." },
  { id: "terminal", label: "Terminal", description: "Wall-Street panels: heatmaps + advanced chart engines." },
  { id: "statistics", label: "Statistics", description: "100+ pro KPIs (floor-style) with tooltips + filters." },

];

/* =========================
   Terminal Theme (Bloomberg-ish)
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
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
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
   Parsers / helpers
========================= */

function parseNotesTrades(notesRaw: unknown): { entries: EntryTradeRow[]; exits: ExitTradeRow[] } {
  if (typeof notesRaw !== "string") return { entries: [], exits: [] };
  try {
    const parsed = JSON.parse(notesRaw);
    const entries = Array.isArray((parsed as any)?.entries) ? (parsed as any).entries : [];
    const exits = Array.isArray((parsed as any)?.exits) ? (parsed as any).exits : [];
    return { entries, exits };
  } catch {
    return { entries: [], exits: [] };
  }
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

function computePnLBySymbol(entries: EntryTradeRow[], exits: ExitTradeRow[]): Record<string, number> {
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

    const [symbol, , side] = k.split("|") as [string, string, SideType];
    const sign = side === "short" ? -1 : 1;
        const kindStr = String(k.split("|")[1] || "").toLowerCase();
    const multiplier = kindStr.includes("opt") ? 100 : 1;
    const pnl = (avgExit - avgEntry) * closedQty * sign * multiplier;

    out[symbol] = (out[symbol] || 0) + pnl;
  }
  
/* =========================
   Fees / commissions helpers
========================= */

return out;
}


/* =========================
   Fees / Commissions helpers
   - Supports fees at session-level and trade-level
========================= */

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

/* =========================
   Auth token helper (sin romper tu AuthContext)
========================= */
async function getBearerTokenSafe(user: any): Promise<string> {
  const direct = (user as any)?.access_token || (user as any)?.token || (user as any)?.jwt || "";
  if (direct) return String(direct);

  try {
    const mod = await import("@/lib/supaBaseClient");
    const supabaseBrowser = (mod as any).supabaseBrowser;
    if (supabaseBrowser?.auth?.getSession) {
      const { data } = await supabaseBrowser.auth.getSession();
      const t = data?.session?.access_token;
      if (t) return t;
    }
  } catch {
    // ignore
  }
  return "";
}

/* =========================
   Heatmap UI (Hour × Underlying)
========================= */

function heatCellBg(winRate: number, n: number) {
  const conf = clamp(n / 6, 0, 1);
  const wr = clamp(winRate / 100, 0, 1);
  const a = 0.06 + conf * 0.22 + wr * 0.14; // sutil
  return `rgba(52,211,153,${a.toFixed(3)})`;
}
function heatCellBorder(winRate: number) {
  return winRate >= 55 ? "rgba(52,211,153,0.55)" : "rgba(148,163,184,0.14)";
}

function HeatmapHourUnderlying({
  title,
  sub,
  matrix,
  hours,
}: {
  title: string;
  sub?: string;
  matrix: { underlying: string; row: { hour: number; n: number; winRate: number; avgPnl: number }[] }[];
  hours: number[];
}) {
  return (
    <div className={wrapCard()}>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className={chartTitle()}>{title}</p>
          {sub ? <p className={chartSub()}>{sub}</p> : null}
        </div>
        <p className="text-[11px] text-slate-500 font-mono">H×U</p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid" style={{ gridTemplateColumns: `170px repeat(${hours.length}, 1fr)` }}>
            <div className="text-[11px] text-slate-500 px-2 py-1">Underlying</div>
            {hours.map((h) => (
              <div key={h} className="text-[10px] text-slate-500 px-1 py-1 text-center font-mono">
                {String(h).padStart(2, "0")}
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            {matrix.map((r) => (
              <div
                key={r.underlying}
                className="grid gap-1"
                style={{ gridTemplateColumns: `170px repeat(${hours.length}, 1fr)` }}
              >
                <div className="px-2 py-1 text-[11px] text-slate-200 font-mono truncate">{r.underlying}</div>
                {r.row.map((c) => (
                  <div
                    key={c.hour}
                    className="h-7 rounded-md border text-[10px] flex items-center justify-center font-mono"
                    style={{
                      background: c.n > 0 ? heatCellBg(c.winRate, c.n) : "rgba(15,23,42,0.28)",
                      borderColor: c.n > 0 ? heatCellBorder(c.winRate) : "rgba(148,163,184,0.10)",
                      color: "rgba(226,232,240,0.90)",
                    }}
                    title={`Underlying: ${r.underlying}\nHour: ${c.hour}\nSessions: ${c.n}\nWinRate: ${c.winRate.toFixed(
                      1
                    )}%\nAvgPnL: ${fmtMoney(c.avgPnl)}`}
                  >
                    {c.n > 0 ? `${c.n}` : ""}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-500 mt-3">Tip: hover cells for sessions, win-rate, avg P&amp;L.</p>
        </div>
      </div>
    </div>
  );
}

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
      <p className={`text-xs mb-1 ${good ? "text-emerald-200" : "text-sky-200"}`}>{label}</p>
      <p className={`text-3xl font-semibold ${good ? "text-emerald-300" : "text-sky-300"}`}>{value}</p>
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
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
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

// =========================
// CHUNK 2 / 2
// app/analytics-statistics/page.tsx
// =========================

/* =========================
   Sections
========================= */

function OverviewSection({
  baseStats,
  probabilityStats,
  uiTotals,
  equity,
  dailyPnl,
  instrumentMix,
  usage,
}: {
  baseStats: any;
  probabilityStats: any;
  uiTotals: any;
  equity: { date: string; value: number }[];
  dailyPnl: { date: string; pnl: number }[];
  instrumentMix: { name: string; value: number }[];
  usage: { premarketFillRate: number; aiUsageRate: number; aiUsedSessions: number };
}) {
  const { totalSessions, greenSessions, learningSessions, sumPnl, avgPnl } = uiTotals;
  const bestDay = baseStats.bestDay;
  const toughestDay = baseStats.toughestDay;

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${futuristicCardClass(true)} p-4`}>
          <p className="text-xs text-emerald-200 mb-1">Strongest day</p>
          {bestDay ? (
            <>
              <p className="text-lg font-semibold text-slate-50">{formatDateFriendly(bestDay.date)}</p>
              <p className="text-sm text-emerald-300 mt-1">Result: +${bestDay.pnl.toFixed(2)}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">No sessions with P&amp;L yet.</p>
          )}
        </div>

        <div className={`${futuristicCardClass(false)} p-4`}>
          <p className="text-xs text-sky-200 mb-1">Toughest day</p>
          {toughestDay ? (
            <>
              <p className="text-lg font-semibold text-slate-50">{formatDateFriendly(toughestDay.date)}</p>
              <p className="text-sm text-sky-300 mt-1">Result: -${Math.abs(toughestDay.pnl).toFixed(2)}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">No sessions with P&amp;L yet.</p>
          )}
        </div>
      </div>

      <div className={wrapCard()}>
        <p className="text-sm font-medium text-slate-100 mb-2">Performance probabilities</p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-[11px] text-slate-400 mb-1">Base probability of green</p>
            <p className="text-2xl font-semibold text-emerald-300">{probabilityStats.baseGreenRate.toFixed(1)}%</p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Green when plan respected</p>
            <p className="text-2xl font-semibold text-emerald-300">{probabilityStats.pGreenRespect.toFixed(1)}%</p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Learning with FOMO</p>
            <p className="text-2xl font-semibold text-sky-300">{probabilityStats.pLearningFomo.toFixed(1)}%</p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Plan edge</p>
            <p className={`text-2xl font-semibold ${respectEdge >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
              {respectEdge.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      {/* Charts row (sutil, con spacing y sin “relleno pesado”) */}
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
                <XAxis dataKey="date" tick={axisStyle()} tickFormatter={formatDateFriendly} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} />
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
            <MiniKpi label="Premarket fill rate" value={`${usage.premarketFillRate.toFixed(1)}%`} tone="neutral" />
            <MiniKpi label="AI usage rate" value={`${usage.aiUsageRate.toFixed(1)}%`} tone="neutral" />
            <MiniKpi label="AI used sessions" value={usage.aiUsedSessions} tone="neutral" />
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
            <p className={chartSub()}>Last ~40 sessions</p>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">DPNL</span>
        </div>

        <div className="mt-3 h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyPnl} barCategoryGap={18} barGap={6}>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="4 8" />
              <XAxis dataKey="date" tick={axisStyle()} tickFormatter={formatDateFriendly} axisLine={{ stroke: CHART_COLORS.grid }} tickLine={false} />
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

function DayOfWeekSection({ stats, weekdayBars }: { stats: any; weekdayBars: any[] }) {
  return (
    <section className="space-y-6">
      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Weekday win-rate</p>
            <p className={chartSub()}>Edge by day of week</p>
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

        <div className="mt-4 grid grid-cols-1 md:grid-cols-1 gap-3">
          <MiniKpi label="Sessions" value={stats?.items?.reduce((a: number, b: any) => a + (b.sessions || 0), 0) ?? 0} tone="neutral" />
        </div>
      </div>
    </section>
  );
}

function PsychologySection({
  probabilityStats,
  psychology,
  usage,
}: {
  baseStats: any;
  probabilityStats: any;
  psychology: { freqArr: { name: string; value: number }[]; timeline: any[] };
  usage: { premarketFillRate: number; aiUsageRate: number; aiUsedSessions: number };
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

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <MiniKpi label="Green when plan respected" value={`${probabilityStats.pGreenRespect.toFixed(1)}%`} tone="good" />
          <MiniKpi label="Learning w/ FOMO" value={`${probabilityStats.pLearningFomo.toFixed(1)}%`} tone="bad" />
          <MiniKpi label="Premarket fill rate" value={`${usage.premarketFillRate.toFixed(1)}%`} />
          <MiniKpi label="AI usage rate" value={`${usage.aiUsageRate.toFixed(1)}%`} />
        </div>
      </div>

      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Emotions over time</p>
            <p className={chartSub()}>Timeline (PnL + primary emotion)</p>
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

        <p className="text-[11px] text-slate-500 mt-3">
          Tip: Usa esto para ver si ciertas emociones correlacionan con drawdowns o overconfidence.
        </p>
      </div>
    </section>
  );
}

function InstrumentsSection({ stats, underlyingMix, heat }: { stats: any; underlyingMix: any[]; heat: any }) {
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

      {/* Table */}
      <div className={wrapCard()}>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className={chartTitle()}>Ticker table</p>
            <p className={chartSub()}>Symbol + Underlying + edge metrics</p>
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

        <p className="text-[11px] text-slate-500 mt-3">
          Tip: Para “floor trader vibes”, usa la tabla como scanner: win% alto + net positivo + consistency.
        </p>
      </div>

      {/* Heatmap */}
      <HeatmapHourUnderlying
        title="Time HeatMap"
        sub="Intensity by time bucket (hover for win-rate + avg P&L)."
        matrix={heat.matrix}
        hours={heat.hours}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${futuristicCardClass(true)} p-4`}>
          <p className="text-sm font-medium text-slate-100 mb-2">Most supportive tickers (win-rate)</p>
          <ul className="space-y-1 text-xs text-slate-200">
            {mostSupportive.map((i: any) => (
              <li key={i.symbol} className="flex items-center justify-between">
                <span className="font-mono">{i.symbol}</span>
                <span className="text-slate-300">{i.winRate.toFixed(1)}% · {i.sessions} sess</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${futuristicCardClass(true)} p-4`}>
          <p className="text-sm font-medium text-slate-100 mb-2">Top earners (net P&amp;L)</p>
          <ul className="space-y-1 text-xs text-slate-200">
            {topEarners.map((i: any) => (
              <li key={i.symbol} className="flex items-center justify-between">
                <span className="font-mono">{i.symbol}</span>
                <span className="text-emerald-300 font-mono">+${i.netPnl.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${futuristicCardClass(false)} p-4`}>
          <p className="text-sm font-medium text-slate-100 mb-2">Tickers to review (only losers)</p>
          {toReview.length === 0 ? (
            <p className="text-xs text-slate-400">No losing tickers (net &lt; 0) with at least 2 sessions.</p>
          ) : (
          <ul className="space-y-1 text-xs text-slate-200">
            {toReview.map((i: any) => (
              <li key={i.symbol} className="flex items-center justify-between">
                <span className="font-mono">{i.symbol}</span>
                <span className="text-sky-300 font-mono">-${Math.abs(i.netPnl).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function TerminalSection({
  equity,
  dailyPnl,
  weekdayBars,
  heat,
}: {
  equity: { date: string; value: number }[];
  dailyPnl: { date: string; pnl: number }[];
  weekdayBars: { label: string; winRate: number; sessions: number; avgPnl: number }[];
  heat: { hours: number[]; matrix: any[] };
}) {
  // NOTE: equity se mantiene en props (para compatibilidad), pero aquí NO renderizamos curves duplicadas.
  // La única Equity Curve se queda en Overview (Recharts AreaChart).

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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className={wrapCard()}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className={chartTitle()}>ECharts — Weekday edge</p>
              <p className={chartSub()}>Very clean bars + terminal grid</p>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">ECH</span>
          </div>
          <div className="mt-3 h-80">
            {/* @ts-ignore */}
            <EChartsReact option={echartsOption} style={{ height: 320, width: "100%" }} />
          </div>
        </div>

        <div className={wrapCard()}>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className={chartTitle()}>Daily P&amp;L — terminal bars</p>
              <p className={chartSub()}>Recharts “clean” config: gaps + subtle grid</p>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">BARS</span>
          </div>

          <div className="mt-3 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyPnl} barCategoryGap={22} barGap={8}>
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
      </div>

      <HeatmapHourUnderlying
        title="Terminal heatmap"
        sub="Hour × Underlying: where your edge actually lives."
        matrix={heat.matrix}
        hours={heat.hours}
      />
    </section>
  );
}
type StatCategory =
  | "PnL"
  | "Consistency"
  | "Risk"
  | "Time"
  | "Instruments"
  | "Process"
  | "Psychology";

type StatItem = {
  id: string;
  title: string;
  tooltip: string;
  category: StatCategory;
  value: string;
  tone?: "good" | "bad" | "neutral";
};

function StatTile({ s }: { s: StatItem }) {
  const toneCls =
    s.tone === "good"
      ? "text-emerald-300"
      : s.tone === "bad"
      ? "text-sky-300"
      : "text-slate-200";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3 hover:bg-slate-950/70 transition">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{s.category}</p>
          <p className="text-sm text-slate-100 mt-1 flex items-center">
            {s.title}
            <Tip text={s.tooltip} />
          </p>
        </div>
        <p className={`text-sm font-mono ${toneCls}`}>{s.value}</p>
      </div>
    </div>
  );
}

function StatisticsSection({
  baseStats,
  probabilityStats,
  dayOfWeekStats,
  sessions,
  usage,
  heat,
  instrumentStats,
}: {
  baseStats: any;
  probabilityStats: any;
  dayOfWeekStats: any;
  sessions: any[];
  usage: { premarketFillRate: number; aiUsageRate: number; aiUsedSessions: number };
  heat: { hours: number[]; matrix: any[] };
  instrumentStats: any;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<StatCategory | "All">("All");

  // Helpers
  const total = sessions.length || 0;
  const pnls = useMemo(() => sessions.map((s: any) => Number(s?.pnl ?? 0)).filter(Number.isFinite), [sessions]);
  const sortedPnls = useMemo(() => [...pnls].sort((a, b) => a - b), [pnls]);

  const median = useMemo(() => {
    if (!sortedPnls.length) return 0;
    const mid = Math.floor(sortedPnls.length / 2);
    return sortedPnls.length % 2 ? sortedPnls[mid] : (sortedPnls[mid - 1] + sortedPnls[mid]) / 2;
  }, [sortedPnls]);

  const std = useMemo(() => {
    if (pnls.length < 2) return 0;
    const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length;
    const v = pnls.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / (pnls.length - 1);
    return Math.sqrt(v);
  }, [pnls]);

  const profitFactor = useMemo(() => {
    let wins = 0;
    let losses = 0;
    for (const x of pnls) {
      if (x > 0) wins += x;
      if (x < 0) losses += Math.abs(x);
    }
    if (losses === 0) return wins > 0 ? 99 : 0;
    return wins / losses;
  }, [pnls]);

  const avgWin = useMemo(() => {
    const arr = pnls.filter((x) => x > 0);
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }, [pnls]);

  const avgLoss = useMemo(() => {
    const arr = pnls.filter((x) => x < 0);
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length; // negative
  }, [pnls]);

  const winRate = useMemo(() => (total ? (pnls.filter((x) => x > 0).length / total) * 100 : 0), [pnls, total]);

  const maxDrawdown = useMemo(() => {
    // equity drawdown based on cumulative pnl by date order
    const ordered = [...sessions].sort((a: any, b: any) => String(a?.date || "").localeCompare(String(b?.date || "")));
    let peak = 0;
    let eq = 0;
    let maxDd = 0;
    for (const s of ordered) {
      eq += Number(s?.pnl ?? 0);
      if (eq > peak) peak = eq;
      const dd = peak - eq;
      if (dd > maxDd) maxDd = dd;
    }
    return maxDd;
  }, [sessions]);
  const dowAgg = useMemo(() => {
    const base: Record<number, { dow: number; label: string; sessions: number; wins: number; sumPnl: number }> = {
      0: { dow: 0, label: DAY_LABELS[0], sessions: 0, wins: 0, sumPnl: 0 },
      1: { dow: 1, label: DAY_LABELS[1], sessions: 0, wins: 0, sumPnl: 0 },
      2: { dow: 2, label: DAY_LABELS[2], sessions: 0, wins: 0, sumPnl: 0 },
      3: { dow: 3, label: DAY_LABELS[3], sessions: 0, wins: 0, sumPnl: 0 },
      4: { dow: 4, label: DAY_LABELS[4], sessions: 0, wins: 0, sumPnl: 0 },
      5: { dow: 5, label: DAY_LABELS[5], sessions: 0, wins: 0, sumPnl: 0 },
      6: { dow: 6, label: DAY_LABELS[6], sessions: 0, wins: 0, sumPnl: 0 },
    };

    for (const s of sessions || []) {
      const d = (s as any)?.date ? new Date(String((s as any).date)) : null;
      if (!d || Number.isNaN(d.getTime())) continue;
      const dow = d.getDay();
      const pnl = Number((s as any).pnlNet ?? (s as any).pnlComputed ?? (s as any).pnl ?? 0);
      const row = base[dow];
      row.sessions += 1;
      row.sumPnl += pnl;
      if (pnl > 0) row.wins += 1;
    }

    const items = Object.values(base).map((x) => {
      const winRate = x.sessions ? (x.wins / x.sessions) * 100 : 0;
      const avgPnl = x.sessions ? x.sumPnl / x.sessions : 0;
      return { ...x, winRate, avgPnl };
    });

    const best = items
      .filter((x) => x.sessions > 0)
      .sort((a, b) => b.avgPnl - a.avgPnl || b.winRate - a.winRate || b.sessions - a.sessions)[0];
    const worst = items
      .filter((x) => x.sessions > 0)
      .sort((a, b) => a.avgPnl - b.avgPnl || a.winRate - b.winRate || b.sessions - a.sessions)[0];

    return { items, best, worst };
  }, [sessions]);

  const bestDow = dowAgg.best?.label ?? "—";
  const worstDow = dowAgg.worst?.label ?? "—";

  const topUnderlying = useMemo(() => instrumentStats?.tickers?.[0]?.underlying ?? "—", [instrumentStats]);

  const aiEdge = useMemo(() => {
    // rough: win rate in sessions where aiUsedSessions inferred by usage keys (already computed in usageLive)
    // We don't have per-session AI flag uniformly, so show adoption only.
    return usage.aiUsageRate;
  }, [usage]);

  // Build 100+ stats with some computed, some placeholders (until you decide what to store)
  const stats: StatItem[] = useMemo(() => {
    const tiles: StatItem[] = [];

    const push = (x: StatItem) => tiles.push(x);

    // PnL (15)
    push({ id: "pnl_net", category: "PnL", title: "Net P&L", tooltip: "Total P&L across all sessions.", value: fmtMoney(baseStats.sumPnl), tone: baseStats.sumPnl >= 0 ? "good" : "bad" });
    push({ id: "pnl_avg", category: "PnL", title: "Avg P&L / session", tooltip: "Mean daily/session P&L.", value: fmtMoney(baseStats.avgPnl), tone: baseStats.avgPnl >= 0 ? "good" : "bad" });
    push({ id: "pnl_median", category: "PnL", title: "Median P&L", tooltip: "Median session P&L (robust to outliers).", value: fmtMoney(median), tone: median >= 0 ? "good" : "bad" });
    push({ id: "pnl_std", category: "PnL", title: "StdDev P&L", tooltip: "Volatility of daily results (standard deviation).", value: `$${std.toFixed(2)}`, tone: "neutral" });
    push({ id: "pnl_pf", category: "PnL", title: "Profit Factor", tooltip: "Gross wins / gross losses. >1 is positive expectancy.", value: profitFactor.toFixed(2), tone: profitFactor >= 1 ? "good" : "bad" });
    push({ id: "pnl_avg_win", category: "PnL", title: "Avg win day", tooltip: "Average P&L on green sessions.", value: fmtMoney(avgWin), tone: "good" });
    push({ id: "pnl_avg_loss", category: "PnL", title: "Avg loss day", tooltip: "Average P&L on red sessions.", value: fmtMoney(avgLoss), tone: "bad" });
    push({ id: "pnl_win_rate", category: "PnL", title: "Win rate", tooltip: "Percent of sessions with positive P&L.", value: `${winRate.toFixed(1)}%`, tone: winRate >= 50 ? "good" : "neutral" });

    // Consistency (15)
    push({ id: "cons_total", category: "Consistency", title: "Total sessions", tooltip: "Total trading sessions logged.", value: String(total), tone: "neutral" });
    push({ id: "cons_green", category: "Consistency", title: "Green sessions", tooltip: "Number of positive P&L sessions.", value: String(baseStats.greenSessions), tone: "good" });
    push({ id: "cons_learning", category: "Consistency", title: "Learning sessions", tooltip: "Number of negative P&L sessions.", value: String(baseStats.learningSessions), tone: "bad" });
    push({ id: "cons_flat", category: "Consistency", title: "Flat sessions", tooltip: "Sessions with P&L = 0.", value: String(baseStats.flatSessions), tone: "neutral" });

    // Risk (15)
    push({ id: "risk_maxdd", category: "Risk", title: "Max drawdown", tooltip: "Largest peak-to-trough equity drawdown (based on session P&L).", value: `-$${maxDrawdown.toFixed(2)}`, tone: maxDrawdown > 0 ? "bad" : "neutral" });

    // Time (15)
    push({ id: "time_best_dow", category: "Time", title: "Best weekday", tooltip: "Weekday with highest win rate.", value: bestDow, tone: "good" });
    push({ id: "time_worst_dow", category: "Time", title: "Worst weekday", tooltip: "Weekday with lowest win rate.", value: worstDow, tone: "bad" });

    // Instruments (15)
    push({ id: "inst_top_under", category: "Instruments", title: "Top underlying (by activity)", tooltip: "Most active underlying (approx. from symbols).", value: String(topUnderlying), tone: "neutral" });

    // Process (15)
    push({ id: "proc_premarket", category: "Process", title: "Premarket fill rate", tooltip: "How often premarket fields are filled (proxy).", value: `${usage.premarketFillRate.toFixed(1)}%`, tone: usage.premarketFillRate >= 60 ? "good" : "neutral" });
    push({ id: "proc_ai_rate", category: "Process", title: "AI usage rate", tooltip: "Percent of sessions where AI coaching was used (proxy).", value: `${usage.aiUsageRate.toFixed(1)}%`, tone: aiEdge >= 50 ? "good" : "neutral" });

    // Psychology (20) — placeholders unless your tags/emotions are stable
    push({ id: "psy_base_green", category: "Psychology", title: "Base green probability", tooltip: "Baseline probability of green session.", value: `${probabilityStats.baseGreenRate.toFixed(1)}%`, tone: "neutral" });
    push({ id: "psy_green_respect", category: "Psychology", title: "Green when plan respected", tooltip: "Win rate on sessions where you respected plan.", value: `${probabilityStats.pGreenRespect.toFixed(1)}%`, tone: "good" });
    push({ id: "psy_learning_fomo", category: "Psychology", title: "Learning when FOMO", tooltip: "Probability of a red day when FOMO is tagged.", value: `${probabilityStats.pLearningFomo.toFixed(1)}%`, tone: "bad" });

    // Fill up to 110 items (professional KPI catalog) — until you store more fields we show “—”
    const catalog: { id: string; category: StatCategory; title: string; tooltip: string }[] = [
      // PnL extras
      { id: "pnl_expectancy", category: "PnL", title: "Expectancy ($)", tooltip: "Expected value per session. Needs avg win/loss + probabilities." },
      { id: "pnl_tail_loss", category: "Risk", title: "Tail loss (worst 5%)", tooltip: "Average of worst 5% sessions. Needs enough sample." },
      { id: "pnl_tail_gain", category: "Risk", title: "Tail gain (best 5%)", tooltip: "Average of best 5% sessions. Needs enough sample." },

      // Time / heat
      { id: "time_best_hour", category: "Time", title: "Best hour bucket", tooltip: "Hour bucket with best win rate (from first trade time)." },
      { id: "time_worst_hour", category: "Time", title: "Worst hour bucket", tooltip: "Hour bucket with worst win rate (from first trade time)." },
      { id: "time_edge_zones", category: "Time", title: "Edge zones count", tooltip: "Heatmap cells with win-rate above threshold (e.g., 60%)." },

      // Execution/risk fields you may store later
      { id: "proc_risk_per_trade", category: "Process", title: "Avg risk per trade", tooltip: "Requires storing risk per trade (planned stop/size)." },
      { id: "proc_mae", category: "Process", title: "MAE (avg)", tooltip: "Max adverse excursion (needs price path or entry/exit extremes)." },
      { id: "proc_mfe", category: "Process", title: "MFE (avg)", tooltip: "Max favorable excursion (needs price path or entry/exit extremes)." },
      { id: "proc_rr", category: "Process", title: "Avg R multiple", tooltip: "Needs risk per trade to convert P&L into R." },

      // Psychology
      { id: "psy_fomo_freq", category: "Psychology", title: "FOMO frequency", tooltip: "Percent of sessions tagged FOMO." },
      { id: "psy_revenge_freq", category: "Psychology", title: "Revenge frequency", tooltip: "Percent of sessions tagged Revenge Trade." },
      { id: "psy_emotion_div", category: "Psychology", title: "Emotion diversity", tooltip: "How varied your emotions are across sessions." },
    ];

    for (const c of catalog) {
      push({
        id: c.id,
        category: c.category,
        title: c.title,
        tooltip: c.tooltip,
        value: "—",
        tone: "neutral",
      });
    }

    
  

    return tiles;
  }, [
    baseStats.sumPnl,
    baseStats.avgPnl,
    baseStats.greenSessions,
    baseStats.learningSessions,
    baseStats.flatSessions,
    median,
    std,
    profitFactor,
    avgWin,
    avgLoss,
    winRate,
    total,
    maxDrawdown,
    dayOfWeekStats,
    usage,
    probabilityStats,
    instrumentStats,
    topUnderlying,
    aiEdge,
    sessions,
  ]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return stats.filter((s) => {
      if (cat !== "All" && s.category !== cat) return false;
      if (!qq) return true;
      return (
        s.title.toLowerCase().includes(qq) ||
        s.tooltip.toLowerCase().includes(qq) ||
        s.category.toLowerCase().includes(qq)
      );
    });
  }, [stats, q, cat]);

  return (
    <section className="space-y-4">
      <div className={wrapCard()}>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className={chartTitle()}>Statistics Terminal</p>
              <Tip text="This panel is designed like a Bloomberg-style KPI grid. Some KPIs are computed now; some show — until you decide to store risk/setup fields." />
            </div>
            <p className={chartSub()}>100+ professional KPIs for self-awareness, edge discovery, and leak control.</p>
          </div>

          <div className="flex flex-col md:flex-row gap-2 md:items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search: drawdown, FOMO, expectancy…"
              className="w-full md:w-[340px] rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-emerald-400"
            />
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value as any)}
              className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
            >
              <option value="All">All</option>
              <option value="PnL">PnL</option>
              <option value="Consistency">Consistency</option>
              <option value="Risk">Risk</option>
              <option value="Time">Time</option>
              <option value="Instruments">Instruments</option>
              <option value="Process">Process</option>
              <option value="Psychology">Psychology</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
          <MiniKpi label="Computed KPIs" value={stats.filter((x) => x.value !== "—").length} />
          <MiniKpi label="Total KPIs" value={stats.length} />
          <MiniKpi label="Win rate" value={`${winRate.toFixed(1)}%`} tone={winRate >= 50 ? "good" : "neutral"} />
          <MiniKpi label="Profit Factor" value={profitFactor.toFixed(2)} tone={profitFactor >= 1 ? "good" : "bad"} />
          <MiniKpi label="Max Drawdown" value={`-$${maxDrawdown.toFixed(0)}`} tone="bad" />
          <MiniKpi label="Premarket fill" value={`${usage.premarketFillRate.toFixed(0)}%`} tone={usage.premarketFillRate >= 60 ? "good" : "neutral"} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((s) => (
          <StatTile key={s.id} s={s} />
        ))}
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

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeGroup, setActiveGroup] = useState<AnalyticsGroupId>("overview");
  const [loadingData, setLoadingData] = useState(true);

  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [dailySnaps, setDailySnaps] = useState<DailySnapshotRow[]>([]);
  const [dataMode] = useState<"snapshot" | "live">("snapshot");

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  // Daily snapshots = fuente de verdad para escala (50K+ usuarios)
  useEffect(() => {
    let alive = true;
    const run = async () => {
      const userId = (user as any)?.id;
      if (!userId) return;
      try {
        const end = new Date();
        const start = new Date(end);
        start.setDate(end.getDate() - 120);
        const to = end.toISOString().slice(0, 10);
        const from = start.toISOString().slice(0, 10);
        const rows = await listDailySnapshots(userId, from, to);
        if (!alive) return;
        setDailySnaps(rows);
      } catch (e) {
        console.error("[daily_snapshots] load error", e);
        if (alive) setDailySnaps([]);
      }
    };
    run();
    return () => { alive = false; };
  }, [user]);


  useEffect(() => {
    if (loading || !user) return;

    const load = async () => {
      try {
        setLoadingData(true);

        const userId = (user as any)?.uid || (user as any)?.id || (user as any)?.email || "";
        if (!userId) {
          setEntries([]);
          return;
        }

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
  }, [loading, user]);



  useEffect(() => {
    if (loading || !user) return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  /* =========================
     Normalize sessions with trades
  ========================= */
  const sessions: SessionWithTrades[] = useMemo(() => {
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

      // Map symbol -> underlying (best-effort) and aggregate PnL by underlying too
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

      // Prefer journal's stored PnL if valid; else use computed from trades
      const pnlStored = Number((s as any)?.pnl);
      const pnlComputed = Number.isFinite(pnlStored)
        ? pnlStored
        : Object.values(perSymbolPnL || {}).reduce((a, v) => a + (Number(v) || 0), 0);

      // Fees: prefer session-level if present; otherwise sum per-trade fees if present
      const feesSession = extractSessionFeesUsd(s as any);
      const feesTrades = sumFeesFromTrades(ent2 as any[], ex2 as any[]);
      const feesUsd = feesSession !== 0 ? feesSession : feesTrades;

      // Net PnL after fees
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

  // Build "snapshot" local from Supabase daily_snapshots + journal sessions (NO manual buttons)
  useEffect(() => {
    const snaps = [...(dailySnaps || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
    const equityCurve = snaps.map((s) => ({ date: s.date, value: (Number(s.start_of_day_balance) || 0) + (Number(s.realized_usd) || 0) }));
    const dailyPnl = snaps.map((s) => ({ date: s.date, pnl: Number(s.realized_usd) || 0 }));

    const totalSessions = sessions.length;
    const greenSessions = sessions.filter((s) => s.isGreenComputed).length;
    const learningSessions = sessions.filter((s) => s.isLearningComputed).length;
    const flatSessions = sessions.filter((s) => s.isFlatComputed).length;
    const sumPnl = sessions.reduce((a, s) => a + (Number((s as any).pnlNet ?? (s as any).pnlComputed ?? 0) || 0), 0);
    const avgPnl = totalSessions ? sumPnl / totalSessions : 0;
    const baseGreenRate = totalSessions ? (greenSessions / totalSessions) * 100 : 0;

    const symAgg: Record<string, { sessions: number; greens: number; sumPnl: number }> = {};
    const undAgg: Record<string, { sessions: number; greens: number; sumPnl: number }> = {};
    for (const s of sessions) {
      for (const sym of s.uniqueSymbols || []) {
        const k = safeUpper(sym);
        if (!k) continue;
        symAgg[k] ||= { sessions: 0, greens: 0, sumPnl: 0 };
        symAgg[k].sessions++;
        symAgg[k].greens += s.isGreenComputed ? 1 : 0;
        symAgg[k].sumPnl += Number(s.perSymbolPnL?.[k] ?? 0);
      }
      for (const und of s.uniqueUnderlyings || []) {
        const k = safeUpper(und);
        if (!k) continue;
        undAgg[k] ||= { sessions: 0, greens: 0, sumPnl: 0 };
        undAgg[k].sessions++;
        undAgg[k].greens += s.isGreenComputed ? 1 : 0;
        undAgg[k].sumPnl += Number(s.perUnderlyingPnL?.[k] ?? 0);
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
     Base stats
  ========================= */
  const baseStats = useMemo(() => {
    const totalSessions = sessions.length;
    let greenSessions = 0;
    let learningSessions = 0;
    let flatSessions = 0;
    let sumPnl = 0;

    let bestDay: { date: string; pnl: number } | null = null;
    let toughestDay: { date: string; pnl: number } | null = null;

    sessions.forEach((e) => {
      const pnl = Number((e as any).pnlNet ?? (e as any).pnlComputed ?? (e as any).pnl ?? 0);
      sumPnl += pnl;

      if (pnl > 0) greenSessions += 1;
      else if (pnl < 0) learningSessions += 1;
      else flatSessions += 1;

      if (!bestDay || pnl > bestDay.pnl) bestDay = { date: (e as any).date, pnl };
      if (!toughestDay || pnl < toughestDay.pnl) toughestDay = { date: (e as any).date, pnl };
    });

    const greenRate = totalSessions > 0 ? (greenSessions / totalSessions) * 100 : 0;
    const avgPnl = totalSessions > 0 ? sumPnl / totalSessions : 0;

    return { totalSessions, greenSessions, learningSessions, flatSessions, greenRate, avgPnl, sumPnl, bestDay, toughestDay };
  }, [sessions]);

  const probabilityStats = useMemo(() => {
    const total = sessions.length;
    if (total === 0) {
      return {
        baseGreenRate: 0,
        respectCount: 0,
        respectGreen: 0,
        respectLearning: 0,
        pGreenRespect: 0,
        pLearningRespect: 0,
        fomoCount: 0,
        fomoGreen: 0,
        fomoLearning: 0,
        pGreenFomo: 0,
        pLearningFomo: 0,
        revengeCount: 0,
        revengeGreen: 0,
        revengeLearning: 0,
        pGreenRevenge: 0,
        pLearningRevenge: 0,
      };
    }

    let baseGreen = 0;

    let respectCount = 0;
    let respectGreen = 0;
    let respectLearning = 0;

    let fomoCount = 0;
    let fomoGreen = 0;
    let fomoLearning = 0;

    let revengeCount = 0;
    let revengeGreen = 0;
    let revengeLearning = 0;

    sessions.forEach((e) => {
      const pnl = Number((e as any).pnlNet ?? (e as any).pnlComputed ?? (e as any).pnl ?? 0);
      const isGreen = pnl > 0;
      const isLearning = pnl < 0;

      const respectedPlan = !!(e as any).respectedPlan;

      const tagsRaw = ((e as any).tags || []) as string[];
      const tagsUpper = tagsRaw.map((t) => safeUpper(t || ""));
      const hasFomo = tagsUpper.includes("FOMO");
      const hasRevenge = tagsUpper.includes("REVENGE TRADE");

      if (isGreen) baseGreen++;

      if (respectedPlan) {
        respectCount++;
        if (isGreen) respectGreen++;
        if (isLearning) respectLearning++;
      }

      if (hasFomo) {
        fomoCount++;
        if (isGreen) fomoGreen++;
        if (isLearning) fomoLearning++;
      }

      if (hasRevenge) {
        revengeCount++;
        if (isGreen) revengeGreen++;
        if (isLearning) revengeLearning++;
      }
    });

    const baseGreenRate = (baseGreen / total) * 100;
    const pGreenRespect = respectCount > 0 ? (respectGreen / respectCount) * 100 : 0;
    const pLearningRespect = respectCount > 0 ? (respectLearning / respectCount) * 100 : 0;
    const pGreenFomo = fomoCount > 0 ? (fomoGreen / fomoCount) * 100 : 0;
    const pLearningFomo = fomoCount > 0 ? (fomoLearning / fomoCount) * 100 : 0;
    const pGreenRevenge = revengeCount > 0 ? (revengeGreen / revengeCount) * 100 : 0;
    const pLearningRevenge = revengeCount > 0 ? (revengeLearning / revengeCount) * 100 : 0;

    return {
      baseGreenRate,
      respectCount,
      respectGreen,
      respectLearning,
      pGreenRespect,
      pLearningRespect,
      fomoCount,
      fomoGreen,
      fomoLearning,
      pGreenFomo,
      pLearningFomo,
      revengeCount,
      revengeGreen,
      revengeLearning,
      pGreenRevenge,
      pLearningRevenge,
    };
  }, [sessions]);

  const dayOfWeekStats = useMemo(() => {
    const base: Record<DayOfWeekKey, { sessions: number; green: number; learning: number; flat: number; sumPnl: number }> = {
      0: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      1: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      2: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      3: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      4: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      5: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      6: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
    };

    sessions.forEach((e) => {
      const date = (e as any).date as string;
      if (!date) return;
      const d = new Date(date + "T00:00:00");
      if (Number.isNaN(d.getTime())) return;
      const dow = d.getDay() as DayOfWeekKey;
      const pnl = Number((e as any).pnlNet ?? (e as any).pnlComputed ?? (e as any).pnl ?? 0);
      const stats = base[dow];

      stats.sessions += 1;
      stats.sumPnl += pnl;

      if (pnl > 0) stats.green += 1;
      else if (pnl < 0) stats.learning += 1;
      else stats.flat += 1;
    });

    const items = (Object.keys(base) as unknown as DayOfWeekKey[]).map((dow) => {
      const s = base[dow];
      const winRate = s.sessions > 0 ? (s.green / s.sessions) * 100 : 0;
      const avgPnl = s.sessions > 0 ? s.sumPnl / s.sessions : 0;
      return { dow, label: DAY_LABELS[dow], ...s, winRate, avgPnl };
    });

    const withSessions = items.filter((i) => i.sessions > 0);
    const best = withSessions.length > 0 ? [...withSessions].sort((a, b) => b.winRate - a.winRate)[0] : null;
    const hardest = withSessions.length > 0 ? [...withSessions].sort((a, b) => a.winRate - b.winRate)[0] : null;

    return { items, best, hardest };
  }, [sessions]);

  const equityCurveLive = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => String((a as any).date || "").localeCompare(String((b as any).date || "")));
    let cum = 0;
    return sorted.map((s) => {
      const pnl = Number((s as any).pnl ?? 0);
      cum += pnl;
      return { date: String((s as any).date || ""), value: Number(cum.toFixed(2)), pnl: Number(pnl.toFixed(2)) };
    });
  }, [sessions]);

  const dailyPnlLive = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => String((a as any).date || "").localeCompare(String((b as any).date || "")));
    const last = sorted.slice(Math.max(0, sorted.length - 40));
    return last.map((s) => ({ date: String((s as any).date || ""), pnl: Number(Number((s as any).pnl ?? 0).toFixed(2)) }));
  }, [sessions]);

  const instrumentMixLive = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sessions) {
      for (const k of (s.uniqueKinds || []) as any[]) {
        const kk = String(k || "other");
        map[kk] = (map[kk] || 0) + 1;
      }
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [sessions]);

  const underlyingMixLive = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sessions) {
      for (const u of s.uniqueUnderlyings || []) {
        const uu = String(u || "—");
        map[uu] = (map[uu] || 0) + 1;
      }
    }
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [sessions]);

  const psychologyLive = useMemo(() => {
    const freq: Record<string, number> = {};
    const timeline = [...sessions]
      .sort((a, b) => String((a as any).date || "").localeCompare(String((b as any).date || "")))
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

        const tagsRaw = ((s as any).tags || []) as string[];
        const tagsUpper = tagsRaw.map((t) => safeUpper(t || ""));
        const hasFOMO = tagsUpper.includes("FOMO");
        const hasRevenge = tagsUpper.includes("REVENGE TRADE");

        return {
          date: String((s as any).date || ""),
          pnl: Number(Number((s as any).pnl ?? 0).toFixed(2)),
          emotion: top,
          respectedPlan: !!(s as any).respectedPlan,
          fomo: hasFOMO ? 1 : 0,
          revenge: hasRevenge ? 1 : 0,
        };
      });

    const freqArr = Object.entries(freq).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 12);
    return { freqArr, timeline };
  }, [sessions]);

  const usageLive = useMemo(() => {
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

  const heatmapLive = useMemo(() => {
    const book: Record<string, Record<number, { n: number; green: number; sumPnl: number }>> = {};

    for (const s of sessions) {
      const pnl = Number((s as any).pnl ?? 0);
      const isGreen = pnl > 0;
      const hr = s.firstHour;
      if (hr == null) continue;

      const underlyings = (s.uniqueUnderlyings || []).filter(Boolean);
      const uniq = Array.from(new Set(underlyings));

      for (const u of uniq) {
        book[u] ||= {};
        book[u][hr] ||= { n: 0, green: 0, sumPnl: 0 };
        book[u][hr].n += 1;
        if (isGreen) book[u][hr].green += 1;
        book[u][hr].sumPnl += pnl;
      }
    }

    const underScores = Object.keys(book).map((u) => {
      const total = Object.values(book[u]).reduce((acc, v) => acc + (v?.n || 0), 0);
      return { u, total };
    });

    const underList = underScores.sort((a, b) => b.total - a.total).slice(0, 10).map((x) => x.u);
    const hours = Array.from({ length: 24 }).map((_, i) => i);

    const matrix = underList.map((u) => {
      const row = hours.map((h) => {
        const v = book[u]?.[h];
        const n = v?.n ?? 0;
        const winRate = n > 0 ? (v!.green / n) * 100 : 0;
        const avgPnl = n > 0 ? v!.sumPnl / n : 0;
        return { hour: h, n, winRate, avgPnl };
      });
      return { underlying: u, row };
    });

    return { underList, hours, matrix };
  }, [sessions]);

  /* =========================
     UI totals (snapshot vs live)
  ========================= */
  const uiTotals = useMemo(() => {
    if (dataMode === "snapshot" && snapshot?.totals) {
      const t = snapshot.totals;
      return {
        totalSessions: t.totalSessions ?? baseStats.totalSessions,
        greenSessions: t.greenSessions ?? baseStats.greenSessions,
        learningSessions: t.learningSessions ?? baseStats.learningSessions,
        flatSessions: t.flatSessions ?? baseStats.flatSessions,
        sumPnl: t.sumPnl ?? baseStats.sumPnl,
        avgPnl: t.avgPnl ?? baseStats.avgPnl,
        baseGreenRate: t.baseGreenRate ?? probabilityStats.baseGreenRate,
      };
    }
    return {
      totalSessions: baseStats.totalSessions,
      greenSessions: baseStats.greenSessions,
      learningSessions: baseStats.learningSessions,
      flatSessions: baseStats.flatSessions,
      sumPnl: baseStats.sumPnl,
      avgPnl: baseStats.avgPnl,
      baseGreenRate: probabilityStats.baseGreenRate,
    };
  }, [dataMode, snapshot, baseStats, probabilityStats]);

  const uiEquity = useMemo(() => {
    if (dataMode === "snapshot" && snapshot?.series?.equityCurve?.length) return snapshot.series.equityCurve;
    return equityCurveLive.map((x) => ({ date: x.date, value: x.value }));
  }, [dataMode, snapshot, equityCurveLive]);

  const uiDaily = useMemo(() => {
    if (dataMode === "snapshot" && snapshot?.series?.dailyPnl?.length) return snapshot.series.dailyPnl;
    return dailyPnlLive;
  }, [dataMode, snapshot, dailyPnlLive]);

  const uiWeekdayBars = useMemo(() => {
    const s = snapshot?.series?.dayOfWeek;
    if (dataMode === "snapshot" && Array.isArray(s) && s.length) return s;
    return (dayOfWeekStats?.items || []).map((i: any) => ({
      dow: i.dow,
      label: i.label,
      winRate: i.winRate,
      sessions: i.sessions,
      avgPnl: i.avgPnl,
    }));
  }, [dataMode, snapshot, dayOfWeekStats]);

  const uiUsage = useMemo(() => {
    if (dataMode === "snapshot" && snapshot?.usage) {
      const u = snapshot.usage;
      return {
        premarketFillRate: u.premarketFillRate ?? usageLive.premarketFillRate,
        aiUsageRate: u.aiUsageRate ?? usageLive.aiUsageRate,
        aiUsedSessions: u.aiUsedSessions ?? usageLive.aiUsedSessions,
      };
    }
    return usageLive;
  }, [dataMode, snapshot, usageLive]);

  // Minimal instrument stats for this page (si quieres más, lo expandimos luego)
  const instrumentStats = useMemo(() => {
    // very light: reuse your logic later if desired
    // For now we approximate lists from symbol pnl
    const map: Record<string, { symbol: string; sessions: number; netPnl: number; win: number; underlying: string; tradesClosed: number }> = {};
    for (const s of sessions) {
      const pnl = Number((s as any).pnl ?? 0);
      const isGreen = pnl > 0;

      for (const sym of s.uniqueSymbols || []) {
        const underlying = getUnderlyingFromSymbol(sym);
        map[sym] ||= { symbol: sym, sessions: 0, netPnl: 0, win: 0, underlying, tradesClosed: 0 };
        map[sym].sessions += 1;
        if (isGreen) map[sym].win += 1;
        map[sym].netPnl += Number(s.perSymbolPnL?.[sym] ?? 0);
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
        bestDow: null,
        worstDow: null,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    const mostSupportive = [...tickers].sort((a, b) => b.winRate - a.winRate).slice(0, 7);
    const topEarners = [...tickers].sort((a, b) => b.netPnl - a.netPnl).slice(0, 7);
    const toReview = tickers.filter((t) => t.sessions >= 2 && t.netPnl < 0).sort((a, b) => a.netPnl - b.netPnl).slice(0, 7);

    return { tickers, mostSupportive, topEarners, toReview };
  }, [sessions]);

  /* =========================
     Rendering
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
          <header className="flex flex-col md:flex-row justify-between gap-4 mb-6">
            <div>
              <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">Performance · Analytics</p>
              <h1 className="text-3xl md:text-4xl font-semibold mt-1">Analytics & Statistics</h1>
              <p className="text-sm md:text-base text-slate-400 mt-2 max-w-2xl">
                Bloomberg-style terminal panels. Clean spacing. Real edge metrics.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs transition ${
                      dataMode === "snapshot"
                        ? "bg-emerald-400 text-slate-950"
                        : "bg-slate-950 text-slate-200 hover:text-emerald-300"
                    }`}
                    title="Use server snapshot (recommended for scale)"
                  >
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs transition ${
                      dataMode === "live"
                        ? "bg-emerald-400 text-slate-950"
                        : "bg-slate-950 text-slate-200 hover:text-emerald-300"
                    }`}
                    title="Compute in the browser (dev / small data)"
                  >
                  </button>
                </div>

                <button
                  type="button"
                 
                  className="px-3 py-1.5 rounded-full text-xs border border-slate-700 hover:border-emerald-400 hover:text-emerald-300 transition disabled:opacity-60"
                >
                  Refresh snapshot
                </button>

                <button
                  type="button"
                 
                  className="px-3 py-1.5 rounded-full text-xs border border-slate-700 hover:border-sky-400 hover:text-sky-300 transition disabled:opacity-60"
                >
                  Rebuild analytics
                </button>

                {snapshot?.updatedAt && (
                  <span className="text-[11px] text-slate-500">
                    Snapshot: <span className="text-slate-300">{new Date(snapshot.updatedAt).toLocaleString()}</span>
                  </span>
                )}


              </div>
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
              <section className="mb-6">
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
                <p className="text-xs text-slate-500 mt-2">{GROUPS.find((g) => g.id === activeGroup)?.description}</p>
              </section>

              {activeGroup === "overview" && (
                <OverviewSection
                  baseStats={baseStats}
                  probabilityStats={probabilityStats}
                  uiTotals={uiTotals}
                  equity={uiEquity}
                  dailyPnl={uiDaily}
                  instrumentMix={instrumentMixLive}
                  usage={uiUsage}
                />
              )}

              {activeGroup === "day-of-week" && (
                <DayOfWeekSection stats={dayOfWeekStats} weekdayBars={uiWeekdayBars as any} />
              )}

              {activeGroup === "psychology" && (
                <PsychologySection
                  baseStats={baseStats}
                  probabilityStats={probabilityStats}
                  psychology={psychologyLive}
                  usage={uiUsage}
                />
              )}

              {activeGroup === "instruments" && (
                <InstrumentsSection
                  stats={instrumentStats}
                  underlyingMix={underlyingMixLive}
                  heat={heatmapLive}
                />
              )}

              {activeGroup === "terminal" && (
                <TerminalSection
                  equity={uiEquity}
                  dailyPnl={uiDaily}
                  weekdayBars={uiWeekdayBars as any}
                  heat={heatmapLive}
                />
              )}
              {activeGroup === "statistics" && (
  <StatisticsSection
    baseStats={baseStats}
    probabilityStats={probabilityStats}
    dayOfWeekStats={dayOfWeekStats}
    sessions={sessions}
    usage={uiUsage}
    heat={heatmapLive}
    instrumentStats={instrumentStats}
  />
)}

            </>
          )}
        </div>
      </div>
    </main>
  );
}