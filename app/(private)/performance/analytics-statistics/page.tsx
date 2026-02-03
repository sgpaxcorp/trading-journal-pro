"use client";

// app/(private)/performance/analytics-statistics/page.tsx

/**
 * Analytics & Statistics
 *
 * Goals
 * - Provide robust trading analytics by reading trades/journal entries from Supabase.
 * - Compute key KPIs: Win rate, expectancy, P&L distribution, drawdown, streaks, time-based performance, instruments.
 * - Use a clean UI with charting (ApexCharts) and tables.
 *
 * Notes
 * - This page assumes you already store trade logs / journal entries in Supabase.
 * - It also reads daily snapshots from `daily_snapshots` if available.
 * - NEW: It also reads `cashflows` (deposits/withdrawals) so account equity reflects deposits.
 */

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
import { listCashflows, signedCashflowAmount, type Cashflow } from "@/lib/cashflowsSupabase";

// ApexCharts needs dynamic import (no SSR)
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

/* =====================
   Types
===================== */

type AnalyticsGroupId =
  | "overview"
  | "performance"
  | "risk"
  | "distribution"
  | "time"
  | "instruments"
  | "trades"
  | "statistics";

type DateRangePreset = "7D" | "30D" | "90D" | "YTD" | "ALL";

type DateRange = {
  preset: DateRangePreset;
  startIso: string; // YYYY-MM-DD
  endIso: string; // YYYY-MM-DD
};

type SessionWithTrades = {
  id: string;
  date: string; // YYYY-MM-DD
  title?: string;

  instrumentType?: InstrumentType;
  symbol?: string;

  pnlGross?: number; // before fees
  feesUsd?: number;
  pnlNet?: number; // after fees

  // derived stats
  win: boolean;
  absNet: number;

  // optional per-trade stats if available
  totalTrades?: number;
  winners?: number;
  losers?: number;
};

type EquityPoint = {
  date: string; // YYYY-MM-DD
  value: number;
};

type DailyPnlPoint = {
  date: string;
  value: number;
};

type HistogramBin = {
  label: string;
  count: number;
};

type MonthBucket = {
  month: string; // YYYY-MM
  pnl: number;
  trades: number;
  winRate: number;
};

type SymbolBucket = {
  symbol: string;
  pnl: number;
  trades: number;
  winRate: number;
};

type DayOfWeekBucket = {
  dow: string;
  pnl: number;
  trades: number;
  winRate: number;
};

type HourBucket = {
  hour: string;
  pnl: number;
  trades: number;
  winRate: number;
};

type TradeRow = {
  date: string;
  title: string;
  instrumentType?: InstrumentType;
  symbol?: string;
  pnlNet: number;
  feesUsd: number;
  win: boolean;
};

type AnalyticsSnapshot = {
  updatedAtIso: string;

  // totals
  totalSessions: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;

  grossPnl: number;
  netPnl: number;
  totalFees: number;
  avgNetPerSession: number;

  profitFactor: number | null;
  expectancy: number;
  avgWin: number;
  avgLoss: number;

  maxWin: number;
  maxLoss: number;

  maxDrawdown: number;
  longestWinStreak: number;
  longestLossStreak: number;

  equityCurve: EquityPoint[];
  dailyPnl: DailyPnlPoint[];

  pnlHistogram: HistogramBin[];

  monthly: MonthBucket[];
  bySymbol: SymbolBucket[];
  byDOW: DayOfWeekBucket[];
  byHour: HourBucket[];

  tradesTable: TradeRow[];
};

/* =====================
   Helpers
===================== */

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfYearIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function toNumberMaybe(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function cashflowSignedUsd(cf: any): number {
  return signedCashflowAmount(cf as any);
}

function cashflowDateIso(cf: any): string {
  const raw = cf?.date ?? cf?.created_at ?? cf?.createdAt ?? "";
  if (!raw) return "";
  const s = String(raw);
  if (s.length >= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fmtUsd(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function fmtPct(p: number): string {
  const v = Number.isFinite(p) ? p : 0;
  return `${v.toFixed(2)}%`;
}

function safeDiv(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return a / b;
}

function looksLikeYYYYMMDD(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}

function sum(nums: number[]): number {
  return nums.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0);
}

function mean(nums: number[]): number {
  const v = nums.filter((n) => Number.isFinite(n));
  if (v.length === 0) return 0;
  return sum(v) / v.length;
}

function stddev(nums: number[]): number {
  const v = nums.filter((n) => Number.isFinite(n));
  if (v.length < 2) return 0;
  const m = mean(v);
  const variance = mean(v.map((x) => (x - m) ** 2));
  return Math.sqrt(variance);
}

function median(nums: number[]): number {
  const v = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  if (v.length % 2 === 0) return (v[mid - 1] + v[mid]) / 2;
  return v[mid];
}

function quantile(nums: number[], q: number): number {
  const v = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const pos = (v.length - 1) * clamp(q, 0, 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = v[base];
  const b = v[Math.min(v.length - 1, base + 1)];
  return a + rest * (b - a);
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const item of arr) {
    const k = key(item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}

function sortIsoDates(a: string, b: string): number {
  // ISO date strings sort lexicographically
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function dowLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay();
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || "";
}

function hourLabelFromIso(isoDateTime: string | null | undefined): string | null {
  if (!isoDateTime) return null;
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  return String(h).padStart(2, "0") + ":00";
}

function monthLabel(iso: string): string {
  // YYYY-MM
  return String(iso).slice(0, 7);
}

function parseFeesUsdFromEntry(entry: any): number {
  // flexible: feesUsd, fees_usd, fees
  return toNumberMaybe(entry?.feesUsd ?? entry?.fees_usd ?? entry?.fees ?? 0);
}

function parsePnlGrossFromEntry(entry: any): number {
  // flexible: pnl, pnlUsd, pnl_gross
  return toNumberMaybe(entry?.pnlGross ?? entry?.pnl_gross ?? entry?.pnlUsd ?? entry?.pnl ?? 0);
}

function parsePnlNetFromEntry(entry: any): number {
  // if already provided
  const direct = toNumberMaybe(entry?.pnlNet ?? entry?.pnl_net ?? NaN);
  if (Number.isFinite(direct)) return direct;

  // else derive
  const gross = parsePnlGrossFromEntry(entry);
  const fees = parseFeesUsdFromEntry(entry);
  return gross - fees;
}

function parseInstrumentType(entry: any): InstrumentType | undefined {
  // keep compatible with your existing shapes
  const it = String(entry?.instrumentType ?? entry?.instrument_type ?? entry?.type ?? "").toLowerCase().trim();
  if (it === "futures" || it === "options" || it === "stocks" || it === "forex" || it === "crypto") {
    return it as InstrumentType;
  }
  return undefined;
}

function parseSymbol(entry: any): string | undefined {
  const s = String(entry?.symbol ?? entry?.ticker ?? entry?.instrument ?? "").trim();
  return s ? s : undefined;
}

function parseTitle(entry: any): string {
  const t = String(entry?.title ?? entry?.name ?? entry?.notesTitle ?? "").trim();
  return t || "Trade";
}

function parseDateIso(entry: any): string {
  const iso = String(entry?.date ?? entry?.trade_date ?? entry?.created_at ?? "").slice(0, 10);
  return looksLikeYYYYMMDD(iso) ? iso : "";
}

function parseCreatedAtIso(entry: any): string {
  const iso = String(entry?.created_at ?? entry?.createdAt ?? "");
  return iso;
}

function buildSessionsFromEntries(entries: JournalEntry[]): SessionWithTrades[] {
  const out: SessionWithTrades[] = [];

  for (const e of entries ?? []) {
    const date = parseDateIso(e);
    if (!date) continue;

    const pnlGross = parsePnlGrossFromEntry(e);
    const feesUsd = parseFeesUsdFromEntry(e);
    const pnlNet = parsePnlNetFromEntry(e);

    const win = pnlNet >= 0;

    out.push({
      id: String((e as any)?.id ?? (e as any)?.uuid ?? `${date}-${Math.random()}`),
      date,
      title: parseTitle(e),
      instrumentType: parseInstrumentType(e),
      symbol: parseSymbol(e),
      pnlGross,
      feesUsd,
      pnlNet,
      win,
      absNet: Math.abs(pnlNet),
    });
  }

  // sort by date
  out.sort((a, b) => sortIsoDates(a.date, b.date));
  return out;
}

function filterByRange(sessions: SessionWithTrades[], startIso: string, endIso: string): SessionWithTrades[] {
  const start = looksLikeYYYYMMDD(startIso) ? startIso : "";
  const end = looksLikeYYYYMMDD(endIso) ? endIso : "";

  return (sessions ?? []).filter((s) => {
    const d = s.date;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  });
}

function computeEquityCurve(
  sessionsAll: SessionWithTrades[],
  cashflowsAll: Cashflow[],
  startingBalance: number,
  planStartIso: string,
  startIso: string,
  endIso: string
): { equityCurve: EquityPoint[]; dailyPnl: DailyPnlPoint[] } {
  const planStart = looksLikeYYYYMMDD(planStartIso) ? planStartIso : "";
  const start = looksLikeYYYYMMDD(startIso) ? startIso : "";
  const end = looksLikeYYYYMMDD(endIso) ? endIso : "";

  const tradeByDate: Record<string, number> = {};
  let tradeBefore = 0;

  for (const s of sessionsAll ?? []) {
    const d = s.date;
    if (!looksLikeYYYYMMDD(d)) continue;
    if (planStart && d < planStart) continue;

    const net = toNumberMaybe(s.pnlNet);

    if (start && d < start) {
      tradeBefore += net;
      continue;
    }
    if (end && d > end) continue;

    tradeByDate[d] = (tradeByDate[d] || 0) + net;
  }

  const cashByDate: Record<string, number> = {};
  let cashBefore = 0;

  for (const cf of cashflowsAll ?? []) {
    const d = cashflowDateIso(cf);
    if (!looksLikeYYYYMMDD(d)) continue;
    if (planStart && d < planStart) continue;

    const net = cashflowSignedUsd(cf);
    if (net === 0) continue;

    if (start && d < start) {
      cashBefore += net;
      continue;
    }
    if (end && d > end) continue;

    cashByDate[d] = (cashByDate[d] || 0) + net;
  }

  const equityDates = Array.from(new Set([...Object.keys(tradeByDate), ...Object.keys(cashByDate)])).sort(sortIsoDates);
  const dailyDates = Object.keys(tradeByDate).sort(sortIsoDates);

  let eq = startingBalance + tradeBefore + cashBefore;

  const equityCurve: EquityPoint[] = equityDates.map((d) => {
    eq += (tradeByDate[d] || 0) + (cashByDate[d] || 0);
    return { date: d, value: Number(eq.toFixed(2)) };
  });

  const dailyPnl: DailyPnlPoint[] = dailyDates.map((d) => ({ date: d, value: Number((tradeByDate[d] || 0).toFixed(2)) }));

  return { equityCurve, dailyPnl };
}

function computeDrawdown(equity: EquityPoint[]): number {
  let peak = -Infinity;
  let maxDd = 0;

  for (const p of equity ?? []) {
    const v = p.value;
    if (!Number.isFinite(v)) continue;
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxDd) maxDd = dd;
  }

  return maxDd;
}

function computeStreaks(sessions: SessionWithTrades[]): { win: number; loss: number } {
  let bestWin = 0;
  let bestLoss = 0;

  let curWin = 0;
  let curLoss = 0;

  for (const s of sessions ?? []) {
    if (s.win) {
      curWin += 1;
      curLoss = 0;
    } else {
      curLoss += 1;
      curWin = 0;
    }
    if (curWin > bestWin) bestWin = curWin;
    if (curLoss > bestLoss) bestLoss = curLoss;
  }

  return { win: bestWin, loss: bestLoss };
}

function computeHistogram(values: number[], bins = 14): HistogramBin[] {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return [];

  const min = Math.min(...v);
  const max = Math.max(...v);
  if (min === max) {
    return [{ label: `${min.toFixed(0)}`, count: v.length }];
  }

  const width = (max - min) / bins;
  const counts = new Array(bins).fill(0);

  for (const x of v) {
    const idx = clamp(Math.floor((x - min) / width), 0, bins - 1);
    counts[idx] += 1;
  }

  const out: HistogramBin[] = [];
  for (let i = 0; i < bins; i++) {
    const a = min + i * width;
    const b = a + width;
    out.push({ label: `${a.toFixed(0)}–${b.toFixed(0)}`, count: counts[i] });
  }

  return out;
}

function computeMonthlyBuckets(sessions: SessionWithTrades[]): MonthBucket[] {
  const byMonth = groupBy(sessions, (s) => monthLabel(s.date));
  const out: MonthBucket[] = Object.entries(byMonth)
    .map(([month, arr]) => {
      const pnl = sum(arr.map((s) => s.pnlNet ?? 0));
      const trades = arr.length;
      const wins = arr.filter((s) => s.win).length;
      const winRate = trades ? (wins / trades) * 100 : 0;
      return { month, pnl, trades, winRate };
    })
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));

  return out;
}

function computeSymbolBuckets(sessions: SessionWithTrades[]): SymbolBucket[] {
  const bySym = groupBy(sessions, (s) => String(s.symbol || "(none)").toUpperCase());
  const out: SymbolBucket[] = Object.entries(bySym).map(([symbol, arr]) => {
    const pnl = sum(arr.map((s) => s.pnlNet ?? 0));
    const trades = arr.length;
    const wins = arr.filter((s) => s.win).length;
    const winRate = trades ? (wins / trades) * 100 : 0;
    return { symbol, pnl, trades, winRate };
  });

  // sort by pnl desc
  out.sort((a, b) => b.pnl - a.pnl);
  return out;
}

function computeDOWBuckets(sessions: SessionWithTrades[]): DayOfWeekBucket[] {
  const byDow = groupBy(sessions, (s) => dowLabel(s.date));
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const out: DayOfWeekBucket[] = Object.entries(byDow).map(([dow, arr]) => {
    const pnl = sum(arr.map((s) => s.pnlNet ?? 0));
    const trades = arr.length;
    const wins = arr.filter((s) => s.win).length;
    const winRate = trades ? (wins / trades) * 100 : 0;
    return { dow, pnl, trades, winRate };
  });

  out.sort((a, b) => order.indexOf(a.dow) - order.indexOf(b.dow));
  return out;
}

function computeHourBuckets(entries: JournalEntry[], sessions: SessionWithTrades[]): HourBucket[] {
  // try to use created_at time, mapped by date
  const timeById: Record<string, string> = {};
  for (const e of entries ?? []) {
    const id = String((e as any)?.id ?? (e as any)?.uuid ?? "");
    const t = parseCreatedAtIso(e);
    if (id && t) timeById[id] = t;
  }

  const buckets: Record<string, { pnl: number; trades: number; wins: number }> = {};

  for (const s of sessions ?? []) {
    // try to recover time bucket from id
    const tIso = timeById[s.id];
    const h = hourLabelFromIso(tIso);
    if (!h) continue;

    if (!buckets[h]) buckets[h] = { pnl: 0, trades: 0, wins: 0 };
    buckets[h].pnl += toNumberMaybe(s.pnlNet);
    buckets[h].trades += 1;
    if (s.win) buckets[h].wins += 1;
  }

  const out: HourBucket[] = Object.entries(buckets)
    .map(([hour, b]) => {
      const winRate = b.trades ? (b.wins / b.trades) * 100 : 0;
      return { hour, pnl: b.pnl, trades: b.trades, winRate };
    })
    .sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0));

  return out;
}

function buildTradesTable(sessions: SessionWithTrades[]): TradeRow[] {
  return (sessions ?? [])
    .slice()
    .sort((a, b) => sortIsoDates(b.date, a.date))
    .map((s) => ({
      date: s.date,
      title: s.title || "Trade",
      instrumentType: s.instrumentType,
      symbol: s.symbol,
      pnlNet: toNumberMaybe(s.pnlNet),
      feesUsd: toNumberMaybe(s.feesUsd),
      win: s.win,
    }));
}

function computeSnapshot(
  entries: JournalEntry[],
  sessionsAll: SessionWithTrades[],
  sessions: SessionWithTrades[],
  cashflows: Cashflow[],
  startingBalance: number,
  planStartIso: string,
  range: DateRange
): AnalyticsSnapshot {
  const totalSessions = sessions.length;
  const wins = sessions.filter((s) => s.win).length;
  const losses = totalSessions - wins;
  const winRate = totalSessions ? (wins / totalSessions) * 100 : 0;

  const grossPnl = sum(sessions.map((s) => toNumberMaybe(s.pnlGross)));
  const totalFees = sum(sessions.map((s) => toNumberMaybe(s.feesUsd)));
  const netPnl = sum(sessions.map((s) => toNumberMaybe(s.pnlNet)));
  const avgNetPerSession = totalSessions ? netPnl / totalSessions : 0;

  const winsArr = sessions.filter((s) => s.pnlNet != null && s.pnlNet >= 0).map((s) => toNumberMaybe(s.pnlNet));
  const lossArr = sessions.filter((s) => s.pnlNet != null && s.pnlNet < 0).map((s) => Math.abs(toNumberMaybe(s.pnlNet)));

  const sumWins = sum(winsArr);
  const sumLoss = sum(lossArr);
  const profitFactor = sumLoss > 0 ? sumWins / sumLoss : null;

  const avgWin = winsArr.length ? mean(winsArr) : 0;
  const avgLoss = lossArr.length ? mean(lossArr) : 0;

  const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;

  const maxWin = winsArr.length ? Math.max(...winsArr) : 0;
  const maxLoss = lossArr.length ? Math.max(...lossArr) : 0;

  const { equityCurve, dailyPnl } = computeEquityCurve(sessionsAll, cashflows, startingBalance, planStartIso, range.startIso, range.endIso);
  const maxDrawdown = computeDrawdown(equityCurve);
  const streaks = computeStreaks(sessions);

  const pnlHistogram = computeHistogram(sessions.map((s) => toNumberMaybe(s.pnlNet)));
  const monthly = computeMonthlyBuckets(sessions);
  const bySymbol = computeSymbolBuckets(sessions);
  const byDOW = computeDOWBuckets(sessions);
  const byHour = computeHourBuckets(entries, sessions);

  const tradesTable = buildTradesTable(sessions);

  // totalTrades is the same as totalSessions here (since one entry per trade session). Keep for future.
  const totalTrades = totalSessions;

  return {
    updatedAtIso: new Date().toISOString(),

    totalSessions,
    totalTrades,
    wins,
    losses,
    winRate,

    grossPnl,
    netPnl,
    totalFees,
    avgNetPerSession,

    profitFactor,
    expectancy,
    avgWin,
    avgLoss,

    maxWin,
    maxLoss,

    maxDrawdown,
    longestWinStreak: streaks.win,
    longestLossStreak: streaks.loss,

    equityCurve,
    dailyPnl,

    pnlHistogram,

    monthly,
    bySymbol,
    byDOW,
    byHour,

    tradesTable,
  };
}

function getDefaultRange(preset: DateRangePreset): DateRange {
  const today = isoDate(new Date());
  if (preset === "7D") {
    return { preset, startIso: addDaysIso(today, -7), endIso: today };
  }
  if (preset === "30D") {
    return { preset, startIso: addDaysIso(today, -30), endIso: today };
  }
  if (preset === "90D") {
    return { preset, startIso: addDaysIso(today, -90), endIso: today };
  }
  if (preset === "YTD") {
    return { preset, startIso: startOfYearIso(), endIso: today };
  }
  // ALL
  return { preset, startIso: "", endIso: today };
}

/* =====================
   Component
===================== */

export default function AnalyticsStatisticsPage() {
  const { user, loading } = useAuth() as any;
  const router = useRouter();

  const userId = (user as any)?.id as string | undefined;

  const [dateRange, setDateRange] = useState<DateRange>(() => getDefaultRange("30D"));

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeGroup, setActiveGroup] = useState<AnalyticsGroupId>("overview");
  const [loadingData, setLoadingData] = useState(true);

  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [dailySnaps, setDailySnaps] = useState<DailySnapshotRow[]>([]);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);

  // Growth plan context
  const [planStartingBalance, setPlanStartingBalance] = useState<number>(0);
  const [planStartIso, setPlanStartIso] = useState<string>("");

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  // Load growth plan starting balance + start date
  useEffect(() => {
    let alive = true;

    async function run() {
      if (!userId) return;

      try {
        const SELECT_GROWTH_PLAN = "starting_balance,created_at,updated_at" as const;
        const { data, error } = await supabaseBrowser
          .from("growth_plans")
          .select(SELECT_GROWTH_PLAN)
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        if (!alive) return;

        if (error) {
          console.error("[AnalyticsStatistics] growth_plans fetch error:", error);
          setPlanStartingBalance(0);
          setPlanStartIso("");
          return;
        }

        const row = (data as any)?.[0];
        const starting = toNumberMaybe(row?.starting_balance ?? 0);
        const startIso = String(row?.created_at ?? row?.updated_at ?? "").slice(0, 10);

        setPlanStartingBalance(starting);
        setPlanStartIso(looksLikeYYYYMMDD(startIso) ? startIso : "");
      } catch (err) {
        console.error("[AnalyticsStatistics] growth_plans fetch exception:", err);
        setPlanStartingBalance(0);
        setPlanStartIso("");
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [userId]);

  // Load journal entries (trades)
  useEffect(() => {
    let alive = true;

    async function run() {
      if (!userId) return;

      setLoadingData(true);
      try {
        const all = await getAllJournalEntries(userId);
        if (!alive) return;
        setEntries((all ?? []) as any);
      } catch (err) {
        console.error("[AnalyticsStatistics] getAllJournalEntries error:", err);
        if (!alive) return;
        setEntries([]);
      } finally {
        if (!alive) return;
        setLoadingData(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [userId]);

  // Load daily snapshots (optional)
  useEffect(() => {
    let alive = true;

    async function run() {
      if (!userId) return;

      try {
        const start = dateRange.startIso;
        const end = dateRange.endIso;
        if (!start || !end) {
          setDailySnaps([]);
          return;
        }

        const snaps = await listDailySnapshots(userId, start, end);
        if (!alive) return;
        setDailySnaps(snaps ?? []);
      } catch (err) {
        console.error("[AnalyticsStatistics] listDailySnapshots error:", err);
        if (!alive) return;
        setDailySnaps([]);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [userId, dateRange.startIso, dateRange.endIso]);

  // Load cashflows (deposits/withdrawals) so equity reflects cash movements
  useEffect(() => {
    let alive = true;

    async function run() {
      if (!userId) return;

      // We fetch from plan start if available (to compute baseline inside the selected range),
      // and filter to the current end date client-side.
      const fromDate = looksLikeYYYYMMDD(planStartIso) ? planStartIso : (dateRange.startIso || undefined);
      const end = looksLikeYYYYMMDD(dateRange.endIso) ? dateRange.endIso : "";

      try {
        const rows = await listCashflows(userId, fromDate ? { fromDate, throwOnError: false } : { throwOnError: false });
        if (!alive) return;

        const filtered = (rows ?? []).filter((cf: any) => {
          const d = cashflowDateIso(cf);
          if (!looksLikeYYYYMMDD(d)) return false;
          if (end && d > end) return false;
          if (fromDate && d < fromDate) return false;
          return true;
        });

        setCashflows(filtered as any);
      } catch (err) {
        console.error("[AnalyticsStatistics] listCashflows error:", err);
        if (!alive) return;
        setCashflows([]);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [userId, planStartIso, dateRange.startIso, dateRange.endIso]);

  const sessionsAll = useMemo(() => buildSessionsFromEntries(entries), [entries]);

  const sessions = useMemo(() => {
    // Apply range and also clamp to plan start if present
    const ranged = filterByRange(sessionsAll, dateRange.startIso, dateRange.endIso);
    if (!planStartIso) return ranged;
    return ranged.filter((s) => s.date >= planStartIso);
  }, [sessionsAll, dateRange.startIso, dateRange.endIso, planStartIso]);

  // cashflows in selected range (for KPIs)
  const cashflowsInRange = useMemo(() => {
    const start = looksLikeYYYYMMDD(dateRange.startIso) ? dateRange.startIso : "";
    const end = looksLikeYYYYMMDD(dateRange.endIso) ? dateRange.endIso : "";

    return (cashflows ?? []).filter((cf: any) => {
      const d = cashflowDateIso(cf);
      if (!looksLikeYYYYMMDD(d)) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [cashflows, dateRange.startIso, dateRange.endIso]);

  // Build snapshot
  useEffect(() => {
    // We recompute snapshot when sessions/cashflows/range changes.
    const snap = computeSnapshot(entries, sessionsAll, sessions, cashflows, planStartingBalance, planStartIso, dateRange);
    setSnapshot(snap);
  }, [entries, sessionsAll, sessions, cashflows, planStartingBalance, planStartIso, dateRange]);

  // Derived display data
  const uiTotals = useMemo(() => {
    const s = snapshot;
    if (!s) {
      return {
        totalSessions: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        netPnl: 0,
        totalFees: 0,
        expectancy: 0,
        profitFactor: null as number | null,
      };
    }

    return {
      totalSessions: s.totalSessions,
      wins: s.wins,
      losses: s.losses,
      winRate: s.winRate,
      netPnl: s.netPnl,
      totalFees: s.totalFees,
      expectancy: s.expectancy,
      profitFactor: s.profitFactor,
    };
  }, [snapshot]);

  const uiEquity = useMemo(() => {
    const s = snapshot;
    if (!s) return [] as EquityPoint[];
    return s.equityCurve;
  }, [snapshot]);

  const uiDaily = useMemo(() => {
    const s = snapshot;
    if (!s) return [] as DailyPnlPoint[];
    return s.dailyPnl;
  }, [snapshot]);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold">Analytics &amp; Statistics</h1>
              <p className="text-sm text-slate-400 mt-1">
                Deep performance breakdown for your trading journal. Deposits/withdrawals are pulled from <span className="font-mono">cashflows</span> and included in account equity.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                Dashboard →
              </Link>

              <Link
                href="/balance-chart"
                className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                Balance chart →
              </Link>
            </div>
          </div>
        </header>

        {/* Date range selector */}
        <section className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">Range</div>
            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/60 p-1">
              {(["7D", "30D", "90D", "YTD", "ALL"] as DateRangePreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDateRange(getDefaultRange(p))}
                  className={[
                    "px-3 py-1.5 text-xs rounded-lg transition",
                    dateRange.preset === p
                      ? "bg-emerald-400 text-slate-950 font-semibold"
                      : "text-slate-300 hover:text-slate-50",
                  ].join(" ")}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-slate-500">
            {dateRange.startIso ? (
              <span>
                {dateRange.startIso} → {dateRange.endIso}
              </span>
            ) : (
              <span>All time → {dateRange.endIso}</span>
            )}
          </div>
        </section>

        {/* Top KPIs */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <KpiCard label="Sessions" value={uiTotals.totalSessions.toLocaleString()} sub={loadingData ? "Loading…" : ""} />
          <KpiCard label="Win rate" value={fmtPct(uiTotals.winRate)} sub={`${uiTotals.wins}W / ${uiTotals.losses}L`} />
          <KpiCard
            label="Net P&amp;L"
            value={fmtUsd(uiTotals.netPnl)}
            valueClass={uiTotals.netPnl >= 0 ? "text-emerald-300" : "text-sky-300"}
            sub={`Fees: ${fmtUsd(uiTotals.totalFees)}`}
          />
          <KpiCard
            label="Expectancy"
            value={fmtUsd(uiTotals.expectancy)}
            sub={uiTotals.profitFactor != null ? `PF: ${uiTotals.profitFactor.toFixed(2)}` : "PF: —"}
          />
        </section>

        {/* Tabs */}
        <section className="mb-6">
          <div className="flex flex-wrap gap-2">
            {([
              ["overview", "Overview"],
              ["performance", "Performance"],
              ["risk", "Risk"],
              ["distribution", "Distribution"],
              ["time", "Time"],
              ["instruments", "Instruments"],
              ["trades", "Trades"],
              ["statistics", "Statistics"],
            ] as Array<[AnalyticsGroupId, string]>).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveGroup(id)}
                className={[
                  "rounded-xl border px-3 py-1.5 text-xs transition",
                  activeGroup === id
                    ? "border-emerald-400 text-emerald-300"
                    : "border-slate-800 text-slate-300 hover:text-slate-50 hover:border-slate-700",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {uiTotals.totalSessions === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300">
            No trade sessions found in this date range.
            <div className="text-xs text-slate-500 mt-2">
              If you expected data, confirm your journal entries are saved in Supabase for user id <span className="font-mono">{String(userId || "")}</span>.
            </div>
          </div>
        ) : (
          <>
            {activeGroup === "overview" && (
              <OverviewSection equity={uiEquity} daily={uiDaily} snapshot={snapshot} />
            )}

            {activeGroup === "performance" && <PerformanceSection snapshot={snapshot} />}

            {activeGroup === "risk" && <RiskSection snapshot={snapshot} />}

            {activeGroup === "distribution" && <DistributionSection snapshot={snapshot} />}

            {activeGroup === "time" && <TimeSection snapshot={snapshot} />}

            {activeGroup === "instruments" && <InstrumentsSection snapshot={snapshot} />}

            {activeGroup === "trades" && <TradesSection snapshot={snapshot} />}

            {activeGroup === "statistics" && (
              <StatisticsSection sessions={sessions} dailySnaps={dailySnaps} cashflows={cashflowsInRange} rangeEndIso={dateRange.endIso} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

/* =====================
   UI Components
===================== */

function KpiCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-[11px] text-slate-500 tracking-widest uppercase">{label}</div>
      <div className={["mt-1 text-2xl font-semibold", valueClass || ""].join(" ")}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-base font-semibold text-slate-50">{title}</div>
        {right ? <div>{right}</div> : null}
      </div>
      {children}
    </div>
  );
}

/* =====================
   Sections
===================== */

function OverviewSection({
  equity,
  daily,
  snapshot,
}: {
  equity: EquityPoint[];
  daily: DailyPnlPoint[];
  snapshot: AnalyticsSnapshot | null;
}) {
  const eqSeries = useMemo(() => {
    const pts = equity ?? [];
    return [{ name: "Equity", data: pts.map((p) => [new Date(p.date).getTime(), p.value]) }];
  }, [equity]);

  const pnlSeries = useMemo(() => {
    const pts = daily ?? [];
    const data = pts.map((p) => {
      const v = Number(p.value ?? 0);
      const open = 0;
      const close = v;
      const high = Math.max(open, close);
      const low = Math.min(open, close);
      return { x: new Date(p.date).getTime(), y: [open, high, low, close] };
    });
    return [{ name: "Daily P&L", data }];
  }, [daily]);

  const eqOptions: ApexOptions = useMemo(
    () => ({
      chart: { type: "line", toolbar: { show: false }, foreColor: "#cbd5e1" },
      stroke: { width: 2 },
      xaxis: { type: "datetime" },
      yaxis: { labels: { formatter: (v) => `$${Math.round(v)}` } },
      tooltip: { x: { format: "yyyy-MM-dd" }, y: { formatter: (v) => fmtUsd(v) } },
      grid: { borderColor: "#1f2937" },
      theme: { mode: "dark" },
    }),
    []
  );

  const pnlOptions: ApexOptions = useMemo(
    () => ({
      chart: { type: "candlestick", toolbar: { show: false }, foreColor: "#cbd5e1" },
      xaxis: { type: "datetime" },
      yaxis: { labels: { formatter: (v) => `$${Math.round(v)}` } },
      tooltip: { x: { format: "yyyy-MM-dd" }, y: { formatter: (v) => fmtUsd(v) } },
      grid: { borderColor: "#1f2937" },
      theme: { mode: "dark" },
      plotOptions: {
        candlestick: {
          colors: {
            upward: "#22c55e",
            downward: "#ef4444",
          },
        },
      },
      annotations: {
        yaxis: [
          {
            y: 0,
            borderColor: "#334155",
            strokeDashArray: 4,
          },
        ],
      },
    }),
    []
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card
        title="Equity Curve"
        right={<span className="text-xs text-slate-500">Account equity (trading P&L + deposits/withdrawals)</span>}
      >
        <div className="h-[320px]">
          <Chart options={eqOptions} series={eqSeries as any} type="line" height={320} />
        </div>
      </Card>

      <Card title="Daily P&amp;L" right={<span className="text-xs text-slate-500">Trading P&amp;L only</span>}>
        <div className="h-[320px]">
          <Chart options={pnlOptions} series={pnlSeries as any} type="candlestick" height={320} />
        </div>
      </Card>

      <Card title="Quick stats">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <MiniStat label="Avg / session" value={snapshot ? fmtUsd(snapshot.avgNetPerSession) : "—"} />
          <MiniStat label="Max win" value={snapshot ? fmtUsd(snapshot.maxWin) : "—"} />
          <MiniStat label="Max loss" value={snapshot ? fmtUsd(snapshot.maxLoss) : "—"} />
          <MiniStat label="Max drawdown" value={snapshot ? fmtUsd(snapshot.maxDrawdown) : "—"} />
        </div>
      </Card>

      <Card title="Streaks">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <MiniStat label="Longest win streak" value={snapshot ? String(snapshot.longestWinStreak) : "—"} />
          <MiniStat label="Longest loss streak" value={snapshot ? String(snapshot.longestLossStreak) : "—"} />
        </div>
      </Card>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-1 text-slate-100 font-semibold">{value}</div>
    </div>
  );
}

function PerformanceSection({ snapshot }: { snapshot: AnalyticsSnapshot | null }) {
  const rows = snapshot?.monthly ?? [];

  return (
    <Card title="Monthly performance" right={<span className="text-xs text-slate-500">Net P&amp;L by month</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No data.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800">
                <th className="text-left py-2 pr-4">Month</th>
                <th className="text-right py-2 px-2">P&amp;L</th>
                <th className="text-right py-2 px-2">Trades</th>
                <th className="text-right py-2 pl-2">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} className="border-b border-slate-900/60">
                  <td className="py-2 pr-4 text-slate-200 font-mono">{r.month}</td>
                  <td className={"py-2 px-2 text-right " + (r.pnl >= 0 ? "text-emerald-300" : "text-sky-300")}>
                    {fmtUsd(r.pnl)}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-200">{r.trades}</td>
                  <td className="py-2 pl-2 text-right text-slate-200">{fmtPct(r.winRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RiskSection({ snapshot }: { snapshot: AnalyticsSnapshot | null }) {
  if (!snapshot) return <Card title="Risk"><p className="text-sm text-slate-400">No data.</p></Card>;

  const pnl = snapshot.tradesTable.map((t) => t.pnlNet);
  const avg = mean(pnl);
  const sd = stddev(pnl);
  const med = median(pnl);
  const q25 = quantile(pnl, 0.25);
  const q75 = quantile(pnl, 0.75);

  return (
    <Card title="Risk & consistency">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <MiniStat label="Std dev" value={fmtUsd(sd)} />
        <MiniStat label="Median" value={fmtUsd(med)} />
        <MiniStat label="Avg" value={fmtUsd(avg)} />
        <MiniStat label="25th pct" value={fmtUsd(q25)} />
        <MiniStat label="75th pct" value={fmtUsd(q75)} />
        <MiniStat label="Profit factor" value={snapshot.profitFactor != null ? snapshot.profitFactor.toFixed(2) : "—"} />
      </div>

      <p className="text-xs text-slate-500 mt-4">
        Std dev measures how volatile your per-session results are. Lower is generally more consistent.
      </p>
    </Card>
  );
}

function DistributionSection({ snapshot }: { snapshot: AnalyticsSnapshot | null }) {
  const bins = snapshot?.pnlHistogram ?? [];

  const series = useMemo(() => {
    return [{ name: "Count", data: bins.map((b) => b.count) }];
  }, [bins]);

  const options: ApexOptions = useMemo(
    () => ({
      chart: { type: "bar", toolbar: { show: false }, foreColor: "#cbd5e1" },
      xaxis: { categories: bins.map((b) => b.label) },
      grid: { borderColor: "#1f2937" },
      theme: { mode: "dark" },
      plotOptions: { bar: { borderRadius: 4 } },
      tooltip: { y: { formatter: (v) => String(v) } },
    }),
    [bins]
  );

  return (
    <Card title="P&amp;L distribution" right={<span className="text-xs text-slate-500">Histogram of session P&amp;L</span>}>
      {bins.length === 0 ? (
        <p className="text-sm text-slate-400">No data.</p>
      ) : (
        <div className="h-[320px]">
          <Chart options={options} series={series as any} type="bar" height={320} />
        </div>
      )}
    </Card>
  );
}

function TimeSection({ snapshot }: { snapshot: AnalyticsSnapshot | null }) {
  const byDOW = snapshot?.byDOW ?? [];
  const byHour = snapshot?.byHour ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="By day of week">
        {byDOW.length === 0 ? (
          <p className="text-sm text-slate-400">No data.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 pr-4">Day</th>
                  <th className="text-right py-2 px-2">P&amp;L</th>
                  <th className="text-right py-2 px-2">Trades</th>
                  <th className="text-right py-2 pl-2">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {byDOW.map((r) => (
                  <tr key={r.dow} className="border-b border-slate-900/60">
                    <td className="py-2 pr-4 text-slate-200 font-mono">{r.dow}</td>
                    <td className={"py-2 px-2 text-right " + (r.pnl >= 0 ? "text-emerald-300" : "text-sky-300")}>
                      {fmtUsd(r.pnl)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-200">{r.trades}</td>
                    <td className="py-2 pl-2 text-right text-slate-200">{fmtPct(r.winRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="By hour">
        {byHour.length === 0 ? (
          <p className="text-sm text-slate-400">No data (requires created_at timestamps in your entries).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 pr-4">Hour</th>
                  <th className="text-right py-2 px-2">P&amp;L</th>
                  <th className="text-right py-2 px-2">Trades</th>
                  <th className="text-right py-2 pl-2">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {byHour.map((r) => (
                  <tr key={r.hour} className="border-b border-slate-900/60">
                    <td className="py-2 pr-4 text-slate-200 font-mono">{r.hour}</td>
                    <td className={"py-2 px-2 text-right " + (r.pnl >= 0 ? "text-emerald-300" : "text-sky-300")}>
                      {fmtUsd(r.pnl)}
                    </td>
                    <td className="py-2 px-2 text-right text-slate-200">{r.trades}</td>
                    <td className="py-2 pl-2 text-right text-slate-200">{fmtPct(r.winRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function InstrumentsSection({ snapshot }: { snapshot: AnalyticsSnapshot | null }) {
  const rows = snapshot?.bySymbol ?? [];

  return (
    <Card title="By symbol" right={<span className="text-xs text-slate-500">Sorted by net P&amp;L</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No data.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800">
                <th className="text-left py-2 pr-4">Symbol</th>
                <th className="text-right py-2 px-2">P&amp;L</th>
                <th className="text-right py-2 px-2">Trades</th>
                <th className="text-right py-2 pl-2">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.symbol} className="border-b border-slate-900/60">
                  <td className="py-2 pr-4 text-slate-200 font-mono">{r.symbol}</td>
                  <td className={"py-2 px-2 text-right " + (r.pnl >= 0 ? "text-emerald-300" : "text-sky-300")}>
                    {fmtUsd(r.pnl)}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-200">{r.trades}</td>
                  <td className="py-2 pl-2 text-right text-slate-200">{fmtPct(r.winRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TradesSection({ snapshot }: { snapshot: AnalyticsSnapshot | null }) {
  const rows = snapshot?.tradesTable ?? [];

  return (
    <Card title="Trades" right={<span className="text-xs text-slate-500">Most recent first</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No data.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800">
                <th className="text-left py-2 pr-4">Date</th>
                <th className="text-left py-2 px-2">Title</th>
                <th className="text-left py-2 px-2">Instrument</th>
                <th className="text-left py-2 px-2">Symbol</th>
                <th className="text-right py-2 px-2">Fees</th>
                <th className="text-right py-2 pl-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={`${r.date}-${idx}`} className="border-b border-slate-900/60">
                  <td className="py-2 pr-4 text-slate-200 font-mono">{r.date}</td>
                  <td className="py-2 px-2 text-slate-200">{r.title}</td>
                  <td className="py-2 px-2 text-slate-300">{r.instrumentType || "—"}</td>
                  <td className="py-2 px-2 text-slate-300 font-mono">{r.symbol || "—"}</td>
                  <td className="py-2 px-2 text-right text-slate-400">{fmtUsd(r.feesUsd)}</td>
                  <td className={"py-2 pl-2 text-right font-semibold " + (r.pnlNet >= 0 ? "text-emerald-300" : "text-sky-300")}>
                    {fmtUsd(r.pnlNet)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* =====================
   Statistics Section
===================== */

type StatsAgg = {
  accountGrowthPct: number | null;
  totalDeposits: number | null;
  totalWithdrawals: number | null;
  totalTradeCosts: number;

  avgHoldMins: number | null;

  totalClosedTrades: number;
  avgRMultiple: number | null;
  bestRMultiple: number | null;
  worstRMultiple: number | null;

  openPositionsCount: number;
};

function sumFromDailySnaps(snaps: DailySnapshotRow[], fields: string[]): number | null {
  if (!snaps || snaps.length === 0) return null;

  let any = false;
  let acc = 0;
  for (const s of snaps) {
    for (const f of fields) {
      const v = (s as any)?.[f];
      if (v == null) continue;
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      acc += n;
      any = true;
      break;
    }
  }

  return any ? acc : null;
}

function computeStatsAgg(opts: {
  sessions: SessionWithTrades[];
  ledgerClosedTrades: any[];
  ledgerOpenPositions: any[];
  dailySnaps: DailySnapshotRow[];
  cashflows: Cashflow[];
}): StatsAgg {
  const { sessions, ledgerClosedTrades, ledgerOpenPositions, dailySnaps, cashflows } = opts;

  // account growth from snapshots if present
  let accountGrowthPct: number | null = null;
  if (dailySnaps && dailySnaps.length >= 1) {
    const first = dailySnaps[0] as any;
    const last = dailySnaps[dailySnaps.length - 1] as any;

    const startBal = toNumberMaybe(first?.start_of_day_balance ?? first?.sod_balance ?? first?.balance_start ?? NaN);
    const endBal =
      toNumberMaybe(last?.end_of_day_balance ?? last?.eod_balance ?? last?.balance_end ?? NaN) ||
      toNumberMaybe(last?.start_of_day_balance ?? last?.sod_balance ?? last?.balance_start ?? NaN) +
        toNumberMaybe(last?.realized_usd ?? last?.realizedUsd ?? 0);

    if (Number.isFinite(startBal) && startBal > 0 && Number.isFinite(endBal)) {
      accountGrowthPct = ((endBal - startBal) / startBal) * 100;
    }
  }

  const depositsFromSnaps = sumFromDailySnaps(dailySnaps, ["deposits", "deposit_usd", "deposits_usd"]);
  const withdrawalsFromSnaps = sumFromDailySnaps(dailySnaps, ["withdrawals", "withdrawal_usd", "withdrawals_usd"]);

  // Prefer snapshot fields if available; otherwise derive from cashflows ledger
  let totalDeposits: number | null = depositsFromSnaps;
  let totalWithdrawals: number | null = withdrawalsFromSnaps;

  if (totalDeposits == null || totalWithdrawals == null) {
    let dep = 0;
    let wd = 0;
    let seen = false;

    for (const cf of cashflows ?? []) {
      const net = cashflowSignedUsd(cf);
      if (net === 0) continue;
      if (net > 0) dep += Math.abs(net);
      else wd += Math.abs(net);
      seen = true;
    }

    if (seen) {
      if (totalDeposits == null) totalDeposits = dep;
      if (totalWithdrawals == null) totalWithdrawals = wd;
    }
  }

  const totalTradeCosts = sum((sessions ?? []).map((s) => toNumberMaybe(s.feesUsd)));

  // The journal in this project doesn’t always store hold time / R multiple, so keep these null unless you have data
  const avgHoldMins: number | null = null;

  const closedTrades = ledgerClosedTrades ?? [];
  const totalClosedTrades = closedTrades.length;

  const rMultiples = closedTrades
    .map((t: any) => toNumberMaybe(t?.r_multiple ?? t?.rMultiple ?? NaN))
    .filter((n) => Number.isFinite(n));

  const avgRMultiple = rMultiples.length ? mean(rMultiples) : null;
  const bestRMultiple = rMultiples.length ? Math.max(...rMultiples) : null;
  const worstRMultiple = rMultiples.length ? Math.min(...rMultiples) : null;

  const openPositionsCount = (ledgerOpenPositions ?? []).length;

  return {
    accountGrowthPct,
    totalDeposits,
    totalWithdrawals,
    totalTradeCosts,

    avgHoldMins,

    totalClosedTrades,
    avgRMultiple,
    bestRMultiple,
    worstRMultiple,

    openPositionsCount,
  };
}

function StatisticsSection({
  sessions,
  dailySnaps,
  cashflows,
  rangeEndIso,
}: {
  sessions: SessionWithTrades[];
  dailySnaps: DailySnapshotRow[];
  cashflows: Cashflow[];
  rangeEndIso: string;
}) {
  // if you have a trade ledger, load it here; for now we infer from sessions
  const ledgerClosedTrades = useMemo(() => [], []);
  const ledgerOpenPositions = useMemo(() => [], []);

  const agg = useMemo(() => {
    return computeStatsAgg({ sessions, ledgerClosedTrades, ledgerOpenPositions, dailySnaps, cashflows });
  }, [sessions, ledgerClosedTrades, ledgerOpenPositions, dailySnaps, cashflows]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title="Account metrics" right={<span className="text-xs text-slate-500">As of {rangeEndIso}</span>}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <MiniStat label="Account growth" value={agg.accountGrowthPct != null ? fmtPct(agg.accountGrowthPct) : "—"} />
          <MiniStat label="Trade costs" value={fmtUsd(agg.totalTradeCosts)} />
          <MiniStat label="Deposits" value={agg.totalDeposits != null ? fmtUsd(agg.totalDeposits) : "—"} />
          <MiniStat label="Withdrawals" value={agg.totalWithdrawals != null ? fmtUsd(agg.totalWithdrawals) : "—"} />
        </div>
        <p className="text-xs text-slate-500 mt-4">
          Deposits/withdrawals are read from <span className="font-mono">cashflows</span> when snapshot columns aren&apos;t available.
        </p>
      </Card>

      <Card title="Trade metrics">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <MiniStat label="Closed trades" value={String(agg.totalClosedTrades)} />
          <MiniStat label="Open positions" value={String(agg.openPositionsCount)} />
          <MiniStat label="Avg R" value={agg.avgRMultiple != null ? agg.avgRMultiple.toFixed(2) : "—"} />
          <MiniStat label="Best R" value={agg.bestRMultiple != null ? agg.bestRMultiple.toFixed(2) : "—"} />
          <MiniStat label="Worst R" value={agg.worstRMultiple != null ? agg.worstRMultiple.toFixed(2) : "—"} />
          <MiniStat label="Avg hold" value={agg.avgHoldMins != null ? `${agg.avgHoldMins.toFixed(0)} min` : "—"} />
        </div>
      </Card>
    </div>
  );
}
