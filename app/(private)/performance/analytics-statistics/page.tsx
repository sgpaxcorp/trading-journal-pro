// =========================
// CHUNK 1 / 2
// app/analytics-statistics/page.tsx
// =========================
"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import TopNav from "@/app/components/TopNav";

import { type InstrumentType } from "@/lib/journalNotes";

// 👇 Solo usamos el TYPE desde journalLocal
import type { JournalEntry } from "@/lib/journalLocal";

// 👇 Los datos ahora vienen de Supabase (tu flujo actual se queda)
import { getAllJournalEntries } from "@/lib/journalSupabase";

// ✅ Charts tipo terminal (Bloomberg-style)
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

/* =========================
   Types
========================= */

type AnalyticsGroupId =
  | "overview"
  | "day-of-week"
  | "psychology"
  | "instruments"
  | "terminal"; // ✅ NUEVO TAB (NO elimina ninguno)

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
  expiry?: string | null; // YYYY-MM-DD
  underlying?: string | null; // ✅ NEW (enriched)
};

type ExitTradeRow = EntryTradeRow;

type SessionWithTrades = JournalEntry & {
  entries: EntryTradeRow[];
  exits: ExitTradeRow[];
  uniqueSymbols: string[];
  uniqueKinds: InstrumentType[];
  perSymbolPnL: Record<string, number>;

  // ✅ NEW: derived
  uniqueUnderlyings: string[];
  firstHour: number | null;
};

// ✅ NUEVO: Snapshot shape (flexible) — NO rompe aunque el backend cambie.
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

function getDayLabel(dow: DayOfWeekKey | null): string {
  if (dow == null) return "—";
  return DAY_LABELS[dow];
}

const GROUPS: { id: AnalyticsGroupId; label: string; description: string }[] = [
  { id: "overview", label: "Overview", description: "Global performance and probability metrics." },
  { id: "day-of-week", label: "Day of week", description: "How weekdays affect your results." },
  { id: "psychology", label: "Psychology & Rules", description: "FOMO, plan respect and learning patterns." },
  { id: "instruments", label: "Instruments", description: "Ticker + instrument-type edge and probabilities." },
  { id: "terminal", label: "Terminal", description: "Bloomberg-style panels: equity curve, weekday edge, top symbols, heatmaps." },
];

/* =========================
   Bloomberg-style Chart Theme
========================= */

const CHART_COLORS = {
  emerald: "#34d399",
  emeraldDim: "rgba(52, 211, 153, 0.22)",
  sky: "#38bdf8",
  skyDim: "rgba(56, 189, 248, 0.20)",
  danger: "#fb7185",
  dangerDim: "rgba(251, 113, 133, 0.22)",
  grid: "rgba(148, 163, 184, 0.16)",
  axis: "rgba(148, 163, 184, 0.58)",
  text: "rgba(226, 232, 240, 0.92)",
};

function axisStyle() {
  return { fill: CHART_COLORS.axis, fontSize: 11 };
}

function tooltipProps() {
  return {
    contentStyle: {
      background: "rgba(2,6,23,0.92)",
      border: "1px solid rgba(148,163,184,0.22)",
      borderRadius: 14,
      boxShadow: "0 0 25px rgba(0,0,0,0.45)",
      color: CHART_COLORS.text,
      fontSize: 12,
    },
    itemStyle: { color: CHART_COLORS.text },
    labelStyle: { color: "rgba(148,163,184,0.9)" },
  } as const;
}

function chartWrapClass() {
  return "rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_0_30px_rgba(15,23,42,0.85)]";
}

function chartTitleClass() {
  return "text-xs uppercase tracking-[0.22em] text-slate-300";
}

function chartSubClass() {
  return "text-[11px] text-slate-500 mt-1";
}

function fmtMoney(x: number) {
  const sign = x >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(x).toFixed(2)}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/* =========================
   Helpers
========================= */

function formatDateFriendly(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      year: "numeric",
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

/* ---- Parse trades stored in notes JSON ---- */
function parseNotesTrades(notesRaw: unknown): { entries: EntryTradeRow[]; exits: ExitTradeRow[] } {
  if (typeof notesRaw !== "string") return { entries: [], exits: [] };
  try {
    const parsed = JSON.parse(notesRaw);
    if (!parsed || typeof parsed !== "object") return { entries: [], exits: [] };

    const entries = Array.isArray((parsed as any).entries) ? (parsed as any).entries : [];
    const exits = Array.isArray((parsed as any).exits) ? (parsed as any).exits : [];

    return { entries, exits };
  } catch {
    return { entries: [], exits: [] };
  }
}

/* ---- SPX option parsing + DTE ---- */
function parseSPXOptionSymbol(raw: string) {
  const s = safeUpper(raw).replace(/^[\.\-]/, "");
  const m = s.match(/^([A-Z]+W?)(\d{6})([CP])(\d+(?:\.\d+)?)$/);
  if (!m) return null;

  const underlying = m[1];
  const yy = Number(m[2].slice(0, 2));
  const mm = Number(m[2].slice(2, 4));
  const dd = Number(m[2].slice(4, 6));
  const right = m[3] as "C" | "P";
  const strike = Number(m[4]);
  if (!yy || !mm || !dd) return null;

  const year = 2000 + yy;
  const expiry = new Date(year, mm - 1, dd);
  if (Number.isNaN(expiry.getTime())) return null;

  return { underlying, expiry, right, strike };
}

function calcDTE(entryDateYYYYMMDD: string, expiry: Date) {
  try {
    const [y, m, d] = entryDateYYYYMMDD.split("-").map(Number);
    const entryUTC = Date.UTC(y, m - 1, d);
    const expiryUTC = Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((expiryUTC - entryUTC) / msPerDay);
    if (diffDays === 0) return 0;
    return diffDays >= 0 ? diffDays : null;
  } catch {
    return null;
  }
}

/* ---- OCC option parsing (generic) to infer underlying ---- */
function parseOCCOptionSymbol(raw: string) {
  // OCC: ROOT + YYMMDD + C/P + STRIKE(8)
  // AAPL240621C00195000
  const s = safeUpper(raw).replace(/\s+/g, "").replace(/^[\.\-]/, "");
  const m = s.match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
  if (!m) return null;

  const underlying = m[1];
  const yy = Number(m[2].slice(0, 2));
  const mm = Number(m[2].slice(2, 4));
  const dd = Number(m[2].slice(4, 6));
  const right = m[3] as "C" | "P";
  const strike = Number(m[4]) / 1000;

  const year = 2000 + yy;
  const expiry = new Date(year, mm - 1, dd);
  if (Number.isNaN(expiry.getTime())) return null;

  return { underlying, expiry, right, strike };
}

function getUnderlyingFromSymbol(raw: string): string {
  const s = safeUpper(raw).replace(/^[\.\-]/, "");
  if (!s) return "";

  const spx = parseSPXOptionSymbol(s);
  if (spx?.underlying) return spx.underlying;

  const occ = parseOCCOptionSymbol(s);
  if (occ?.underlying) return occ.underlying;

  // Futures like ESZ5 / NQH6 -> root
  const fut = s.match(/^([A-Z]{1,3})[FGHJKMNQUVXZ]\d{1,2}$/);
  if (fut?.[1]) return fut[1];

  // Stock/ETF basic root
  const root = s.match(/^([A-Z]{1,6})/);
  return root?.[1] ?? s;
}

/* ---- Parse hour bucket from time string ---- */
function parseHourBucket(t: unknown): number | null {
  if (!t) return null;
  const s = String(t).trim();
  if (!s) return null;

  // HH:MM
  const m1 = s.match(/^(\d{1,2}):(\d{2})/);
  if (m1) {
    const hh = Number(m1[1]);
    if (Number.isFinite(hh) && hh >= 0 && hh <= 23) return hh;
  }

  // ISO datetime
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getHours();

  return null;
}

/* ---- Generic “usage”: counts filled fields safely ---- */
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

/* ---- Compute PnL per symbol inside one session ---- */
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
    const pnl = (avgExit - avgEntry) * closedQty * sign;

    out[symbol] = (out[symbol] || 0) + pnl;
  }
  return out;
}

/* =========================
   NEW: auth header helper (no rompe tu AuthContext)
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
  // intensity from confidence (n) and winRate
  const conf = clamp(n / 6, 0, 1); // 0..1 after 6 sessions
  const wr = clamp(winRate / 100, 0, 1);
  const a = 0.08 + conf * 0.25 + wr * 0.15; // 0.08..~0.48
  return `rgba(52,211,153,${a.toFixed(3)})`;
}

function heatCellBorder(winRate: number) {
  return winRate >= 55 ? "rgba(52,211,153,0.65)" : "rgba(148,163,184,0.18)";
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
    <div className={chartWrapClass()}>
      <div className="flex items-baseline justify-between">
        <p className={chartTitleClass()}>{title}</p>
        <p className="text-[11px] text-slate-500">Hour × Underlying</p>
      </div>
      {sub ? <p className={chartSubClass()}>{sub}</p> : null}

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[900px]">
          {/* header hours */}
          <div className="grid" style={{ gridTemplateColumns: `160px repeat(${hours.length}, 1fr)` }}>
            <div className="text-[11px] text-slate-500 px-2 py-1">Underlying</div>
            {hours.map((h) => (
              <div key={h} className="text-[10px] text-slate-500 px-1 py-1 text-center">
                {h}
              </div>
            ))}
          </div>

          {/* rows */}
          <div className="space-y-1">
            {matrix.map((r) => (
              <div
                key={r.underlying}
                className="grid gap-1"
                style={{ gridTemplateColumns: `160px repeat(${hours.length}, 1fr)` }}
              >
                <div className="px-2 py-1 text-[11px] text-slate-200 font-mono truncate">{r.underlying}</div>
                {r.row.map((c) => (
                  <div
                    key={c.hour}
                    className="h-7 rounded-md border text-[10px] flex items-center justify-center"
                    style={{
                      background: c.n > 0 ? heatCellBg(c.winRate, c.n) : "rgba(15,23,42,0.35)",
                      borderColor: c.n > 0 ? heatCellBorder(c.winRate) : "rgba(148,163,184,0.12)",
                      color: "rgba(226,232,240,0.90)",
                    }}
                    title={`Underlying: ${r.underlying}\nHour: ${c.hour}\nSessions: ${c.n}\nWinRate: ${c.winRate.toFixed(
                      1
                    )}%\nAvgPnL: ${fmtMoney(c.avgPnl)}`}
                  >
                    {c.n > 0 ? `${Math.round(c.winRate)}%` : "—"}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-500 mt-3">
            Tip: hover cells for sessions, win-rate and avg P&amp;L.
          </p>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Page
========================= */

export default function AnalyticsStatisticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // ✅ Tu flujo actual se queda
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeGroup, setActiveGroup] = useState<AnalyticsGroupId>("overview");
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // ✅ NUEVO: snapshot
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState<boolean>(false);
  const [snapshotError, setSnapshotError] = useState<string>("");

  // ✅ NUEVO: modo (sin romper live compute)
  const [dataMode, setDataMode] = useState<"snapshot" | "live">("snapshot");

  /* Protect route */
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  /* Load journal entries from Supabase (tu code original) */
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

  /* ✅ NUEVO: cargar snapshot (no interfiere con live) */
  const refreshSnapshot = async () => {
    try {
      setSnapshotLoading(true);
      setSnapshotError("");

      const token = await getBearerTokenSafe(user);
      const res = await fetch("/api/analytics/snapshot", {
        method: "GET",
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Snapshot error (${res.status})`);
      }

      const json = (await res.json()) as AnalyticsSnapshot;
      setSnapshot(json || null);
    } catch (e: any) {
      console.error("[AnalyticsStatisticsPage] snapshot error:", e);
      setSnapshot(null);
      setSnapshotError(e?.message || "Failed to load snapshot");
    } finally {
      setSnapshotLoading(false);
    }
  };

  const rebuildAnalytics = async () => {
    try {
      setSnapshotLoading(true);
      setSnapshotError("");

      const token = await getBearerTokenSafe(user);
      const res = await fetch("/api/analytics/rebuild", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Rebuild error (${res.status})`);
      }

      await refreshSnapshot();
    } catch (e: any) {
      console.error("[AnalyticsStatisticsPage] rebuild error:", e);
      setSnapshotError(e?.message || "Failed to rebuild analytics");
    } finally {
      setSnapshotLoading(false);
    }
  };

  useEffect(() => {
    if (loading || !user) return;
    refreshSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const usedEntries = entries;

  /* =========================
     Normalize sessions with trades (tu code + enrich underlying/hour)
  ========================= */
  const sessions: SessionWithTrades[] = useMemo(() => {
    return usedEntries.map((s) => {
      const { entries: entRaw, exits: exRaw } = parseNotesTrades(s.notes);

      const ent2: EntryTradeRow[] = (entRaw || []).map((t: any) => {
        const kind = normalizeKind(t.kind);
        const side = normalizeSide(t.side);

        // enrich underlying now (even if not option)
        const underlying = t?.underlying ? String(t.underlying) : getUnderlyingFromSymbol(t.symbol);

        if (kind === "option" && (t.dte == null || t.expiry == null)) {
          const spx = parseSPXOptionSymbol(t.symbol);
          if (spx) {
            const dte = calcDTE(s.date, spx.expiry);
            return {
              ...t,
              kind,
              side,
              dte,
              expiry: spx.expiry.toISOString().slice(0, 10),
              underlying: spx.underlying || underlying,
            };
          }
        }
        return { ...t, kind, side, underlying };
      });

      const ex2: ExitTradeRow[] = (exRaw || []).map((t: any) => {
        const kind = normalizeKind(t.kind);
        const side = normalizeSide(t.side);

        const underlying = t?.underlying ? String(t.underlying) : getUnderlyingFromSymbol(t.symbol);

        if (kind === "option" && (t.dte == null || t.expiry == null)) {
          const spx = parseSPXOptionSymbol(t.symbol);
          if (spx) {
            const dte = calcDTE(s.date, spx.expiry);
            return {
              ...t,
              kind,
              side,
              dte,
              expiry: spx.expiry.toISOString().slice(0, 10),
              underlying: spx.underlying || underlying,
            };
          }
        }
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

      const firstTime =
        ent2.find((x) => String(x?.time || "").trim())?.time ??
        ex2.find((x) => String(x?.time || "").trim())?.time ??
        null;
      const firstHour = parseHourBucket(firstTime);

      return {
        ...s,
        entries: ent2,
        exits: ex2,
        uniqueSymbols: Array.from(uniqueSymbolsSet),
        uniqueKinds: Array.from(uniqueKindsSet),
        perSymbolPnL,
        uniqueUnderlyings: Array.from(uniqueUnderlyingsSet),
        firstHour,
      };
    });
  }, [usedEntries]);

  /* =========================
     Basic stats & probabilities (tu code)
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
      const pnl = e.pnl ?? 0;
      sumPnl += pnl;

      if (pnl > 0) greenSessions += 1;
      else if (pnl < 0) learningSessions += 1;
      else flatSessions += 1;

      if (!bestDay || pnl > bestDay.pnl) bestDay = { date: e.date, pnl };
      if (!toughestDay || pnl < toughestDay.pnl) toughestDay = { date: e.date, pnl };
    });

    const greenRate = totalSessions > 0 ? (greenSessions / totalSessions) * 100 : 0;
    const avgPnl = totalSessions > 0 ? sumPnl / totalSessions : 0;

    return {
      totalSessions,
      greenSessions,
      learningSessions,
      flatSessions,
      greenRate,
      avgPnl,
      sumPnl,
      bestDay,
      toughestDay,
    };
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
      const pnl = e.pnl ?? 0;
      const isGreen = pnl > 0;
      const isLearning = pnl < 0;

      const respectedPlan = !!(e as any).respectedPlan;

      const tagsRaw = e.tags || [];
      const tags = tagsRaw.map((t: string) => t.trim());
      const tagsUpper = tags.map(safeUpper);

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

  /* =========================
     Day-of-week stats (tu code)
  ========================= */
  const dayOfWeekStats = useMemo(() => {
    const base: Record<
      DayOfWeekKey,
      { sessions: number; green: number; learning: number; flat: number; sumPnl: number }
    > = {
      0: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      1: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      2: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      3: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      4: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      5: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      6: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
    };

    sessions.forEach((e) => {
      if (!e.date) return;
      const d = new Date(e.date + "T00:00:00");
      if (Number.isNaN(d.getTime())) return;
      const dow = d.getDay() as DayOfWeekKey;
      const pnl = e.pnl ?? 0;
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

  /* =========================
     Instruments / Ticker stats (tu code + Underlying)
  ========================= */
  const instrumentStats = useMemo(() => {
    type TickerAgg = {
      symbol: string;
      sessions: number;
      green: number;
      learning: number;
      flat: number;
      tradesClosed: number;
      netPnl: number;
      grossProfit: number;
      grossLoss: number;
      winRate: number;
      avgPnlPerSession: number;
      bestDow: DayOfWeekKey | null;
      worstDow: DayOfWeekKey | null;
      underlying: string;
    };

    type UnderAgg = {
      underlying: string;
      sessions: number;
      green: number;
      learning: number;
      flat: number;
      netPnl: number;
      winRate: number;
      avgPnlPerSession: number;
    };

    type KindAgg = {
      kind: InstrumentType;
      sessions: number;
      green: number;
      learning: number;
      flat: number;
      sumPnl: number;
      winRate: number;
      avgPnlPerSession: number;
    };

    const tickerMap: Record<
      string,
      {
        symbol: string;
        underlying: string;
        sessions: number;
        green: number;
        learning: number;
        flat: number;
        tradesClosed: number;
        netPnl: number;
        grossProfit: number;
        grossLoss: number;
        byDow: Record<DayOfWeekKey, { sessions: number; green: number; sumPnl: number }>;
      }
    > = {};

    const underMap: Record<string, { underlying: string; sessions: number; green: number; learning: number; flat: number; netPnl: number }> =
      {};

    const kindMap: Record<string, { kind: InstrumentType; sessions: number; green: number; learning: number; flat: number; sumPnl: number }> =
      {};

    sessions.forEach((s) => {
      const pnl = s.pnl ?? 0;
      const isGreen = pnl > 0;
      const isLearning = pnl < 0;
      const isFlat = pnl === 0;

      const d = new Date(s.date + "T00:00:00");
      const dow = Number.isNaN(d.getTime()) ? null : (d.getDay() as DayOfWeekKey);

      // Underlyings for this session
      for (const u of s.uniqueUnderlyings || []) {
        underMap[u] ||= { underlying: u, sessions: 0, green: 0, learning: 0, flat: 0, netPnl: 0 };
        const U = underMap[u];
        U.sessions += 1;
        if (isGreen) U.green += 1;
        if (isLearning) U.learning += 1;
        if (isFlat) U.flat += 1;
        U.netPnl += pnl;
      }

      const symbolsHere = s.uniqueSymbols;

      for (const sym of symbolsHere) {
        const underlying = getUnderlyingFromSymbol(sym);

        tickerMap[sym] ||= {
          symbol: sym,
          underlying,
          sessions: 0,
          green: 0,
          learning: 0,
          flat: 0,
          tradesClosed: 0,
          netPnl: 0,
          grossProfit: 0,
          grossLoss: 0,
          byDow: {
            0: { sessions: 0, green: 0, sumPnl: 0 },
            1: { sessions: 0, green: 0, sumPnl: 0 },
            2: { sessions: 0, green: 0, sumPnl: 0 },
            3: { sessions: 0, green: 0, sumPnl: 0 },
            4: { sessions: 0, green: 0, sumPnl: 0 },
            5: { sessions: 0, green: 0, sumPnl: 0 },
            6: { sessions: 0, green: 0, sumPnl: 0 },
          },
        };

        const t = tickerMap[sym];
        t.sessions += 1;
        if (isGreen) t.green += 1;
        if (isLearning) t.learning += 1;
        if (isFlat) t.flat += 1;

        const symPnl = s.perSymbolPnL[sym] || 0;
        t.netPnl += symPnl;
        if (symPnl > 0) t.grossProfit += symPnl;
        if (symPnl < 0) t.grossLoss += symPnl;

        if (dow != null) {
          const bd = t.byDow[dow];
          bd.sessions += 1;
          bd.sumPnl += symPnl;
          if (symPnl > 0) bd.green += 1;
        }
      }

      for (const k of s.uniqueKinds) {
        const key = normalizeKind(k);
        kindMap[key] ||= { kind: key, sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 };
        const K = kindMap[key];
        K.sessions += 1;
        K.sumPnl += pnl;
        if (isGreen) K.green += 1;
        if (isLearning) K.learning += 1;
        if (isFlat) K.flat += 1;
      }

      for (const ex of s.exits) {
        const sym = safeUpper(ex.symbol);
        if (!sym || !tickerMap[sym]) continue;
        tickerMap[sym].tradesClosed += 1;
      }
    });

    const tickers: TickerAgg[] = Object.values(tickerMap).map((t) => {
      const winRate = t.sessions > 0 ? (t.green / t.sessions) * 100 : 0;
      const avgPnlPerSession = t.sessions > 0 ? t.netPnl / t.sessions : 0;

      const dowItems = (Object.keys(t.byDow) as unknown as DayOfWeekKey[])
        .map((dow) => {
          const v = t.byDow[dow];
          const wr = v.sessions > 0 ? (v.green / v.sessions) * 100 : 0;
          return { dow, winRate: wr, sessions: v.sessions };
        })
        .filter((x) => x.sessions > 0);

      const bestDow = dowItems.length ? [...dowItems].sort((a, b) => b.winRate - a.winRate)[0].dow : null;
      const worstDow = dowItems.length ? [...dowItems].sort((a, b) => a.winRate - b.winRate)[0].dow : null;

      return {
        symbol: t.symbol,
        sessions: t.sessions,
        green: t.green,
        learning: t.learning,
        flat: t.flat,
        tradesClosed: t.tradesClosed,
        netPnl: t.netPnl,
        grossProfit: t.grossProfit,
        grossLoss: t.grossLoss,
        winRate,
        avgPnlPerSession,
        bestDow,
        worstDow,
        underlying: t.underlying,
      };
    });

    const underlyings: UnderAgg[] = Object.values(underMap).map((u) => {
      const winRate = u.sessions > 0 ? (u.green / u.sessions) * 100 : 0;
      const avgPnlPerSession = u.sessions > 0 ? u.netPnl / u.sessions : 0;
      return { ...u, winRate, avgPnlPerSession };
    });

    const kinds: KindAgg[] = Object.values(kindMap).map((k) => {
      const winRate = k.sessions > 0 ? (k.green / k.sessions) * 100 : 0;
      const avgPnlPerSession = k.sessions > 0 ? k.sumPnl / k.sessions : 0;
      return { ...k, winRate, avgPnlPerSession };
    });

    const mostSupportive = [...tickers].sort((a, b) => b.winRate - a.winRate).slice(0, 7);
    const topEarners = [...tickers].sort((a, b) => b.netPnl - a.netPnl).slice(0, 7);
    const toReview = [...tickers].sort((a, b) => a.netPnl - b.netPnl).slice(0, 7);

    const underlyingByEdge = [...underlyings].sort((a, b) => b.winRate - a.winRate);
    const underlyingTopNet = [...underlyings].sort((a, b) => b.netPnl - a.netPnl);

    return {
      tickers,
      kinds,
      underlyings,
      mostSupportive,
      topEarners,
      toReview,
      kindByEdge: [...kinds].sort((a, b) => b.winRate - a.winRate),
      underlyingByEdge,
      underlyingTopNet,
    };
  }, [sessions]);

  /* =========================
     NEW: chart datasets (live; snapshot overrides in UI)
  ========================= */

  const equityCurveLive = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let cum = 0;
    return sorted.map((s) => {
      const pnl = Number(s.pnl ?? 0);
      cum += pnl;
      return { date: s.date, value: Number(cum.toFixed(2)), pnl: Number(pnl.toFixed(2)) };
    });
  }, [sessions]);

  const dailyPnlLive = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const last = sorted.slice(Math.max(0, sorted.length - 40));
    return last.map((s) => ({ date: s.date, pnl: Number((s.pnl ?? 0).toFixed(2)) }));
  }, [sessions]);

  const instrumentMixLive = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of sessions) {
      for (const k of s.uniqueKinds || []) {
        const kk = String(k || "other");
        map[kk] = (map[kk] || 0) + 1;
      }
    }
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [sessions]);

  const underlyingMixLive = useMemo(() => {
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

  const psychologyLive = useMemo(() => {
    const freq: Record<string, number> = {};
    const timeline = [...sessions]
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
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

        const tagsRaw = s.tags || [];
        const tagsUpper = tagsRaw.map((t: string) => safeUpper(t || ""));
        const hasFOMO = tagsUpper.includes("FOMO");
        const hasRevenge = tagsUpper.includes("REVENGE TRADE");

        return {
          date: s.date,
          pnl: Number((s.pnl ?? 0).toFixed(2)),
          emotion: top,
          respectedPlan: !!(s as any).respectedPlan,
          fomo: hasFOMO ? 1 : 0,
          revenge: hasRevenge ? 1 : 0,
        };
      });

    const freqArr = Object.entries(freq)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);

    return { freqArr, timeline };
  }, [sessions]);

  const usageLive = useMemo(() => {
    // Ajusta estos keys a tus nombres reales si quieres precisión 1:1
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
    // underlying -> hour -> agg
    const book: Record<string, Record<number, { n: number; green: number; sumPnl: number }>> = {};

    for (const s of sessions) {
      const pnl = Number(s.pnl ?? 0);
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

    // pick top underlyings by sessions
    const underScores = Object.keys(book).map((u) => {
      const total = Object.values(book[u]).reduce((acc, v) => acc + (v?.n || 0), 0);
      return { u, total };
    });

    const underList = underScores
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((x) => x.u);

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
     NEW: unify display stats (snapshot vs live)
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
          {/* Header */}
          <header className="flex flex-col md:flex-row justify-between gap-4 mb-6">
            <div>
              <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">
                Performance · Analytics
              </p>
              <h1 className="text-3xl md:text-4xl font-semibold mt-1">
                Analytics & Statistics
              </h1>
              <p className="text-sm md:text-base text-slate-400 mt-2 max-w-2xl">
                Visualize how your sessions behave over time: probabilities,
                weekdays, psychology and instruments. Futuristic, clean,
                edge-focused.
              </p>

              {/* ✅ NEW: data mode + snapshot controls */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-slate-700 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setDataMode("snapshot")}
                    className={`px-3 py-1.5 text-xs transition ${
                      dataMode === "snapshot"
                        ? "bg-emerald-400 text-slate-950"
                        : "bg-slate-950 text-slate-200 hover:text-emerald-300"
                    }`}
                    title="Use server snapshot (recommended for scale)"
                  >
                    Snapshot (API)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDataMode("live")}
                    className={`px-3 py-1.5 text-xs transition ${
                      dataMode === "live"
                        ? "bg-emerald-400 text-slate-950"
                        : "bg-slate-950 text-slate-200 hover:text-emerald-300"
                    }`}
                    title="Compute in the browser (dev / small data)"
                  >
                    Live compute
                  </button>
                </div>

                <button
                  type="button"
                  onClick={refreshSnapshot}
                  disabled={snapshotLoading}
                  className="px-3 py-1.5 rounded-full text-xs border border-slate-700 hover:border-emerald-400 hover:text-emerald-300 transition disabled:opacity-60"
                >
                  Refresh snapshot
                </button>

                <button
                  type="button"
                  onClick={rebuildAnalytics}
                  disabled={snapshotLoading}
                  className="px-3 py-1.5 rounded-full text-xs border border-slate-700 hover:border-sky-400 hover:text-sky-300 transition disabled:opacity-60"
                >
                  Rebuild analytics
                </button>

                {snapshot?.updatedAt && (
                  <span className="text-[11px] text-slate-500">
                    Snapshot:{" "}
                    <span className="text-slate-300">
                      {new Date(snapshot.updatedAt).toLocaleString()}
                    </span>
                  </span>
                )}

                {!!snapshotError && (
                  <span className="text-[11px] text-sky-300">
                    {snapshotError}
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
                <span className="text-emerald-300 font-semibold">
                  {uiTotals.totalSessions}
                </span>
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
              {/* Group selector */}
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
                            ? "bg-emerald-400 text-slate-950 border-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
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
                <DayOfWeekSection stats={dayOfWeekStats} weekdayBars={uiWeekdayBars} />
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

                         </>
          )}
        </div>
      </div>
    </main>
  );
}

/* =========================
   UI bits (futuristic)
========================= */

function futuristicCardClass(isGood: boolean) {
  return isGood
    ? "rounded-2xl border border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_25px_rgba(16,185,129,0.15)]"
    : "rounded-2xl border border-sky-500/40 bg-sky-500/5 shadow-[0_0_25px_rgba(56,189,248,0.12)]";
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
      {sub && <div className="text-[11px] text-slate-400 mt-2">{sub}</div>}
    </div>
  );
}

function TerminalPanel({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_0_30px_rgba(15,23,42,0.8)]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-300">{title}</p>
        {right ? <div className="text-[11px] text-slate-500">{right}</div> : null}
      </div>
      {children}
    </div>
  );
}

function TinyGauge({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" }) {
  const v = clamp(value, 0, 100);
  const bar = tone === "emerald" ? "bg-emerald-400" : "bg-sky-400";
  const glow =
    tone === "emerald"
      ? "shadow-[0_0_20px_rgba(16,185,129,0.25)]"
      : "shadow-[0_0_20px_rgba(56,189,248,0.25)]";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-400">{label}</p>
        <p className={`text-[11px] ${tone === "emerald" ? "text-emerald-300" : "text-sky-300"} font-semibold`}>
          {v.toFixed(1)}%
        </p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full ${bar} ${glow}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

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
        <StatCard
          label="Learning sessions"
          value={learningSessions}
          sub="These days are raw material for rule upgrades."
          good={false}
        />
        <StatCard
          label="Avg P&L per session"
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

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_0_30px_rgba(15,23,42,0.8)]">
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

      {/* ✅ NEW: pro charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={chartWrapClass()}>
          <div className="flex items-baseline justify-between">
            <p className={chartTitleClass()}>EQUITY CURVE</p>
            <p className="text-[11px] text-slate-500">cum P&amp;L</p>
          </div>
          <p className={chartSubClass()}>Cumulative performance over time.</p>
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={equity}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 6" />
                <XAxis dataKey="date" tick={axisStyle()} tickLine={false} axisLine={false} hide />
                <YAxis tick={axisStyle()} tickLine={false} axisLine={false} width={70} />
                <Tooltip {...tooltipProps()} />
                <Line type="monotone" dataKey="value" stroke={CHART_COLORS.emerald} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Total: <span className="text-emerald-300 font-semibold">{fmtMoney(sumPnl)}</span>
          </p>
        </div>

        <div className={chartWrapClass()}>
          <div className="flex items-baseline justify-between">
            <p className={chartTitleClass()}>DAILY P&amp;L</p>
            <p className="text-[11px] text-slate-500">last 40</p>
          </div>
          <p className={chartSubClass()}>Daily distribution (green positive, red negative).</p>
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyPnl}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 6" />
                <XAxis dataKey="date" tick={axisStyle()} tickLine={false} axisLine={false} hide />
                <YAxis tick={axisStyle()} tickLine={false} axisLine={false} width={70} />
                <Tooltip {...tooltipProps()} />
                <Bar dataKey="pnl" radius={[10, 10, 10, 10]}>
                  {dailyPnl.map((d, idx) => (
                    <Cell
                      key={idx}
                      fill={Number(d.pnl) >= 0 ? CHART_COLORS.emeraldDim : CHART_COLORS.dangerDim}
                      stroke={Number(d.pnl) >= 0 ? CHART_COLORS.emerald : CHART_COLORS.danger}
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Avg/day: <span className="text-slate-200 font-semibold">{fmtMoney(avgPnl)}</span>
          </p>
        </div>

        <div className={chartWrapClass()}>
          <div className="flex items-baseline justify-between">
            <p className={chartTitleClass()}>INSTRUMENT MIX</p>
            <p className="text-[11px] text-slate-500">by session</p>
          </div>
          <p className={chartSubClass()}>What you trade most (option/future/stock/etc).</p>

          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip {...tooltipProps()} />
                <Pie data={instrumentMix} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {instrumentMix.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i % 2 === 0 ? CHART_COLORS.emeraldDim : CHART_COLORS.skyDim}
                      stroke={i % 2 === 0 ? CHART_COLORS.emerald : CHART_COLORS.sky}
                      strokeWidth={1}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
            {instrumentMix.slice(0, 6).map((p) => (
              <div key={p.name} className="flex items-center justify-between">
                <span className="text-slate-300">{p.name}</span>
                <span className="text-slate-500">{p.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ✅ Usage (premarket + AI) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TinyGauge label="Premarket completion rate" value={usage.premarketFillRate} tone="emerald" />
        <TinyGauge label="AI Coaching usage rate" value={usage.aiUsageRate} tone="sky" />
        <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-[11px] text-slate-400">AI used sessions</p>
          <p className="text-2xl font-semibold text-sky-300 mt-1">{usage.aiUsedSessions}</p>
          <p className="text-[11px] text-slate-500 mt-2">Counts sessions where AI flags/counters exist.</p>
        </div>
      </div>
    </section>
  );
}

function DayOfWeekSection({ stats, weekdayBars }: { stats: any; weekdayBars: any[] }) {
  const { items, best, hardest } = stats;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-sm font-medium text-slate-100 mb-3">Day-of-week behavior</p>

        {/* ✅ NEW: charts first */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className={chartWrapClass()}>
            <div className="flex items-baseline justify-between">
              <p className={chartTitleClass()}>WEEKDAY WIN RATE</p>
              <p className="text-[11px] text-slate-500">%</p>
            </div>
            <p className={chartSubClass()}>Win-rate by day of week.</p>

            <div className="mt-3 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayBars}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 6" />
                  <XAxis dataKey="label" tick={axisStyle()} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle()} tickLine={false} axisLine={false} width={70} />
                  <Tooltip {...tooltipProps()} />
                  <Bar dataKey="winRate" fill={CHART_COLORS.emeraldDim} stroke={CHART_COLORS.emerald} strokeWidth={1} radius={[10, 10, 10, 10]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={chartWrapClass()}>
            <div className="flex items-baseline justify-between">
              <p className={chartTitleClass()}>WEEKDAY AVG P&amp;L</p>
              <p className="text-[11px] text-slate-500">$</p>
            </div>
            <p className={chartSubClass()}>Average P&amp;L by weekday.</p>

            <div className="mt-3 h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekdayBars}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 6" />
                  <XAxis dataKey="label" tick={axisStyle()} tickLine={false} axisLine={false} />
                  <YAxis tick={axisStyle()} tickLine={false} axisLine={false} width={70} />
                  <Tooltip {...tooltipProps()} />
                  <Bar dataKey="avgPnl" radius={[10, 10, 10, 10]}>
                    {weekdayBars.map((d: any, idx: number) => (
                      <Cell
                        key={idx}
                        fill={Number(d.avgPnl) >= 0 ? CHART_COLORS.emeraldDim : CHART_COLORS.dangerDim}
                        stroke={Number(d.avgPnl) >= 0 ? CHART_COLORS.emerald : CHART_COLORS.danger}
                        strokeWidth={1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* table (tuya) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs md:text-sm border border-slate-800 rounded-xl overflow-hidden">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-3 py-2 border-b border-slate-800">Day</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Sessions</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Green</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Learning</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Flat</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Win rate</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Avg P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i: any) => (
                <tr key={i.dow} className="border-t border-slate-800 bg-slate-950/60">
                  <td className="px-3 py-2">{i.label}</td>
                  <td className="px-3 py-2 text-right">{i.sessions}</td>
                  <td className="px-3 py-2 text-right text-emerald-300">{i.green}</td>
                  <td className="px-3 py-2 text-right text-sky-300">{i.learning}</td>
                  <td className="px-3 py-2 text-right text-slate-300">{i.flat}</td>
                  <td className="px-3 py-2 text-right">{i.winRate.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">
                    {i.avgPnl >= 0 ? "+" : "-"}${Math.abs(i.avgPnl).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${futuristicCardClass(true)} p-4`}>
          <p className="text-xs text-emerald-200 mb-1">Most supportive day</p>
          {best ? (
            <>
              <p className="text-lg font-semibold">{best.label}</p>
              <p className="text-sm text-emerald-300 mt-1">Win rate: {best.winRate.toFixed(1)}% · Sessions: {best.sessions}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">No weekday data yet.</p>
          )}
        </div>

        <div className={`${futuristicCardClass(false)} p-4`}>
          <p className="text-xs text-sky-200 mb-1">Day to monitor</p>
          {hardest ? (
            <>
              <p className="text-lg font-semibold">{hardest.label}</p>
              <p className="text-sm text-sky-300 mt-1">Win rate: {hardest.winRate.toFixed(1)}% · Sessions: {hardest.sessions}</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">No weekday data yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function PsychologySection({
  baseStats,
  probabilityStats,
  psychology,
  usage,
}: {
  baseStats: any;
  probabilityStats: any;
  psychology: { freqArr: { name: string; value: number }[]; timeline: any[] };
  usage: { premarketFillRate: number; aiUsageRate: number; aiUsedSessions: number };
}) {
  const { totalSessions, greenSessions, learningSessions } = baseStats;

  const {
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
  } = probabilityStats;

  const emoBars = psychology.freqArr || [];
  const emoTimeline = psychology.timeline || [];

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Sessions with plan respect"
          value={respectCount}
          sub={
            <>
              Out of {totalSessions} sessions ({totalSessions > 0 ? ((respectCount / totalSessions) * 100).toFixed(1) : "0"}%).
            </>
          }
          good
        />
        <StatCard
          label="Sessions with FOMO"
          value={fomoCount}
          sub={`Green: ${fomoGreen} (${pGreenFomo.toFixed(1)}%) · Learning: ${fomoLearning} (${pLearningFomo.toFixed(1)}%)`}
          good={false}
        />
        <StatCard
          label="Sessions with revenge trades"
          value={revengeCount}
          sub={`Green: ${revengeGreen} (${pGreenRevenge.toFixed(1)}%) · Learning: ${revengeLearning} (${pLearningRevenge.toFixed(1)}%)`}
          good={false}
        />
      </div>

      {/* ✅ NEW: emotion charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={chartWrapClass()}>
          <div className="flex items-baseline justify-between">
            <p className={chartTitleClass()}>EMOTION FREQUENCY</p>
            <p className="text-[11px] text-slate-500">top 12</p>
          </div>
          <p className={chartSubClass()}>Which emotions appear most in your workflow.</p>

          <div className="mt-3 h-60">
            {emoBars.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={emoBars}>
                  <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 6" />
                  <XAxis dataKey="name" tick={axisStyle()} tickLine={false} axisLine={false} interval={0} />
                  <YAxis tick={axisStyle()} tickLine={false} axisLine={false} width={70} />
                  <Tooltip {...tooltipProps()} />
                  <Bar dataKey="value" fill={CHART_COLORS.skyDim} stroke={CHART_COLORS.sky} strokeWidth={1} radius={[10, 10, 10, 10]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400 mt-6">No emotion data detected yet (add emotions in your journal psychology).</p>
            )}
          </div>
        </div>

        <div className={chartWrapClass()}>
          <div className="flex items-baseline justify-between">
            <p className={chartTitleClass()}>EMOTION / P&amp;L TIMELINE</p>
            <p className="text-[11px] text-slate-500">area</p>
          </div>
          <p className={chartSubClass()}>P&amp;L over time (use alongside emotion tags).</p>

          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={emoTimeline}>
                <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 6" />
                <XAxis dataKey="date" tick={axisStyle()} tickLine={false} axisLine={false} hide />
                <YAxis tick={axisStyle()} tickLine={false} axisLine={false} width={70} />
                <Tooltip {...tooltipProps()} />
                <Area type="monotone" dataKey="pnl" stroke={CHART_COLORS.emerald} fill={CHART_COLORS.emeraldDim} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-2">
            <TinyGauge label="Plan respected rate" value={totalSessions ? (respectCount / totalSessions) * 100 : 0} tone="emerald" />
            <TinyGauge label="AI usage rate" value={usage.aiUsageRate} tone="sky" />
            <TinyGauge label="Premarket fill rate" value={usage.premarketFillRate} tone="emerald" />
          </div>
        </div>
      </div>

      <div className={`${futuristicCardClass(true)} p-4`}>
        <p className="text-sm font-medium text-slate-100 mb-2">Plan respect vs overall performance</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[11px] text-slate-400 mb-1">Overall</p>
            <p className="text-xs text-slate-300">
              Green: <span className="text-emerald-300 font-semibold">{greenSessions}</span>
            </p>
            <p className="text-xs text-slate-300">
              Learning: <span className="text-sky-300 font-semibold">{learningSessions}</span>
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">With plan respected</p>
            <p className="text-xs text-slate-300">
              Green: <span className="text-emerald-300 font-semibold">{respectGreen}</span> ({pGreenRespect.toFixed(1)}%)
            </p>
            <p className="text-xs text-slate-300">
              Learning: <span className="text-sky-300 font-semibold">{respectLearning}</span> ({pLearningRespect.toFixed(1)}%)
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Interpretation</p>
            <p className="text-[11px] text-slate-200">
              If plan-respect increases green probability, your rules align with edge. If not, upgrade playbook inputs (entries, stops, sizing).
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function InstrumentsSection({
  stats,
  underlyingMix,
  heat,
}: {
  stats: any;
  underlyingMix: { name: string; value: number }[];
  heat: { underList: string[]; hours: number[]; matrix: any[] };
}) {
  const { tickers, kindByEdge, mostSupportive, topEarners, toReview, underlyingByEdge, underlyingTopNet } = stats;

  return (
    <section className="space-y-6">
      {/* ✅ NEW: underlying pie + heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={chartWrapClass()}>
          <div className="flex items-baseline justify-between">
            <p className={chartTitleClass()}>TOP UNDERLYINGS</p>
            <p className="text-[11px] text-slate-500">by sessions</p>
          </div>
          <p className={chartSubClass()}>Underlying (asset root) inferred from contracts and symbols.</p>

          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip {...tooltipProps()} />
                <Pie data={underlyingMix} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {underlyingMix.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i % 2 === 0 ? CHART_COLORS.skyDim : CHART_COLORS.emeraldDim}
                      stroke={i % 2 === 0 ? CHART_COLORS.sky : CHART_COLORS.emerald}
                      strokeWidth={1}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
            {underlyingMix.slice(0, 8).map((p) => (
              <div key={p.name} className="flex items-center justify-between">
                <span className="text-slate-300 font-mono">{p.name}</span>
                <span className="text-slate-500">{p.value}</span>
              </div>
            ))}
          </div>
        </div>

        <HeatmapHourUnderlying
          title="HEATMAP EDGE"
          sub="Where your edge clusters by time and underlying."
          matrix={heat.matrix || []}
          hours={heat.hours || []}
        />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-sm font-medium text-slate-100 mb-3">Probability by instrument type</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs md:text-sm border border-slate-800 rounded-xl overflow-hidden">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-3 py-2 border-b border-slate-800">Type</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Sessions</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Green</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Learning</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Win rate</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Avg P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {kindByEdge.map((k: any) => (
                <tr key={k.kind} className="border-t border-slate-800 bg-slate-950/60">
                  <td className="px-3 py-2 font-mono">{k.kind}</td>
                  <td className="px-3 py-2 text-right">{k.sessions}</td>
                  <td className="px-3 py-2 text-right text-emerald-300">{k.green}</td>
                  <td className="px-3 py-2 text-right text-sky-300">{k.learning}</td>
                  <td className="px-3 py-2 text-right">{k.winRate.toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right">
                    {k.avgPnlPerSession >= 0 ? "+" : "-"}${Math.abs(k.avgPnlPerSession).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">Based on unique instrument types traded each session.</p>
      </div>

      {/* ✅ Underlying edge tables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={chartWrapClass()}>
          <div className="flex items-baseline justify-between">
            <p className={chartTitleClass()}>UNDERLYING EDGE</p>
            <p className="text-[11px] text-slate-500">win-rate</p>
          </div>
          <p className={chartSubClass()}>Best underlying by win-rate (needs sample size).</p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 border-b border-slate-800">Underlying</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Sess</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">WR</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {underlyingByEdge.slice(0, 8).map((u: any) => (
                  <tr key={u.underlying} className="border-t border-slate-800 bg-slate-950/60">
                    <td className="px-3 py-2 font-mono">{u.underlying}</td>
                    <td className="px-3 py-2 text-right">{u.sessions}</td>
                    <td className="px-3 py-2 text-right">{u.winRate.toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right ${u.netPnl >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                      {fmtMoney(u.netPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={chartWrapClass()}>
          <div className="flex items-baseline justify-between">
            <p className={chartTitleClass()}>UNDERLYING TOP NET</p>
            <p className="text-[11px] text-slate-500">P&amp;L</p>
          </div>
          <p className={chartSubClass()}>Highest net by underlying.</p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-800 rounded-xl overflow-hidden">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 border-b border-slate-800">Underlying</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Sess</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">WR</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {underlyingTopNet.slice(0, 8).map((u: any) => (
                  <tr key={u.underlying} className="border-t border-slate-800 bg-slate-950/60">
                    <td className="px-3 py-2 font-mono">{u.underlying}</td>
                    <td className="px-3 py-2 text-right">{u.sessions}</td>
                    <td className="px-3 py-2 text-right">{u.winRate.toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right ${u.netPnl >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                      {fmtMoney(u.netPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-sm font-medium text-slate-100 mb-3">Ticker statistics (from Entries + Exits)</p>

        {tickers.length === 0 ? (
          <p className="text-sm text-slate-400">No tickers recorded yet. Add trades in Entries/Exits.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm border border-slate-800 rounded-xl overflow-hidden">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 border-b border-slate-800">Symbol</th>
                  <th className="px-3 py-2 border-b border-slate-800">Underlying</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Sessions</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Closed trades</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Win rate</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Net P&amp;L</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Avg/session</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Best DOW</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Worst DOW</th>
                </tr>
              </thead>
              <tbody>
                {tickers.map((t: any) => (
                  <tr key={t.symbol} className="border-t border-slate-800 bg-slate-950/60">
                    <td className="px-3 py-2 font-mono">{t.symbol}</td>
                    <td className="px-3 py-2 font-mono text-slate-300">{t.underlying || "—"}</td>
                    <td className="px-3 py-2 text-right">{t.sessions}</td>
                    <td className="px-3 py-2 text-right">{t.tradesClosed}</td>
                    <td className="px-3 py-2 text-right">{t.winRate.toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right ${t.netPnl >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                      {fmtMoney(t.netPnl)}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtMoney(t.avgPnlPerSession)}</td>
                    <td className="px-3 py-2 text-right">{getDayLabel(t.bestDow)}</td>
                    <td className="px-3 py-2 text-right">{getDayLabel(t.worstDow)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${futuristicCardClass(true)} p-4`}>
          <p className="text-sm font-medium text-slate-100 mb-2">Most supportive tickers (win-rate)</p>
          <ul className="space-y-1 text-xs text-slate-200">
            {mostSupportive.map((i: any) => (
              <li key={i.symbol} className="flex items-center justify-between">
                <span className="font-mono">{i.symbol}</span>
                <span>{i.winRate.toFixed(1)}% · {i.sessions} sess</span>
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
                <span className="text-emerald-300">+${i.netPnl.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${futuristicCardClass(false)} p-4`}>
          <p className="text-sm font-medium text-slate-100 mb-2">Tickers to review</p>
          <ul className="space-y-1 text-xs text-slate-200">
            {toReview.map((i: any) => (
              <li key={i.symbol} className="flex items-center justify-between">
                <span className="font-mono">{i.symbol}</span>
                <span className="text-sky-300">-${Math.abs(i.netPnl).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
