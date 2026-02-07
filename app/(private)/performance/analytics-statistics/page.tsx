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
import { useEffect, useMemo, useState, useRef, Fragment } from "react";
import type { ReactNode } from "react";
import type { ApexOptions } from "apexcharts";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

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

type Lang = "en" | "es";
const LL = (lang: Lang, en: string, es: string) => (lang === "es" ? es : en);

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

type JournalTradeRow = {
  journal_date: string;
  leg: string;
  symbol: string | null;
  kind: string | null;
  side: string | null;
  premium: string | null;
  strategy: string | null;
  price: number | null;
  quantity: number | null;
  time: string | null;
};

type MatchedTrade = {
  date: string;
  symbol: string;
  kind: InstrumentType;
  side: "long" | "short";
  premium: "debit" | "credit" | "none";
  entryTimeMin: number | null;
  exitTimeMin: number | null;
  durationMin: number | null;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
};

type TradeAnalytics = {
  matchedTrades: MatchedTrade[];
  tradeCount: number;
  tradeDays: number;
  hourBuckets: HourBucket[];
  hold: {
    avgHoldMins: number | null;
    medianHoldMins: number | null;
    minHoldMins: number | null;
    maxHoldMins: number | null;
    avgHoldWinMins: number | null;
    avgHoldLossMins: number | null;
    totalHoldHours: number | null;
  };
  avgPnlPerTrade: number | null;
  pnlPerHour: number | null;
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
  breakevens: number;
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
  maxDrawdownPct: number;
  longestWinStreak: number;
  longestLossStreak: number;

  // institutional KPIs
  cagr: number | null;
  sharpe: number | null;
  sortino: number | null;
  recoveryFactor: number | null;
  payoffRatio: number | null;

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

function resolveJournalUserId(user: any): string {
  return String(user?.uid || user?.id || user?.email || "");
}

function resolveCashflowUserIds(user: any): { primary: string; secondary: string } {
  const primary = String(user?.id || "");
  const secondary = String(user?.uid || "");
  return { primary, secondary };
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

function toNumberOrNull(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
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
  const locale = typeof document !== "undefined" ? document.documentElement.lang : undefined;
  return v.toLocaleString(locale || undefined, { style: "currency", currency: "USD" });
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
  const locale =
    typeof document !== "undefined"
      ? document.documentElement.lang || "en"
      : "en";
  try {
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d);
  } catch {
    const day = d.getDay();
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] || "";
  }
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

function parseNotesJson(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

function parseCostsFromEntry(entry: any): { fees: number; commissions: number; total: number } {
  const notes = parseNotesJson(entry?.notes);
  const fees = toNumberOrNull(notes?.costs?.fees ?? notes?.fees);
  const commissions = toNumberOrNull(notes?.costs?.commissions ?? notes?.commissions);
  const f = fees ?? 0;
  const c = commissions ?? 0;
  return { fees: f, commissions: c, total: f + c };
}

function parseFeesUsdFromEntry(entry: any): number {
  // flexible: feesUsd, fees_usd, fees
  const direct = toNumberOrNull(entry?.feesUsd ?? entry?.fees_usd ?? entry?.fees);
  if (direct != null) return direct;
  return parseCostsFromEntry(entry).total;
}

function parsePnlGrossFromEntry(entry: any): number {
  // flexible: pnl, pnlUsd, pnl_gross
  const notes = parseNotesJson(entry?.notes);
  const noteGross = toNumberOrNull(notes?.pnl?.gross ?? notes?.pnl_gross);
  if (noteGross != null) return noteGross;

  const directGross = toNumberOrNull(entry?.pnlGross ?? entry?.pnl_gross ?? entry?.pnlUsd);
  if (directGross != null) return directGross;

  const costs = parseCostsFromEntry(entry);
  const noteNet = toNumberOrNull(notes?.pnl?.net ?? notes?.pnl_net);
  if (noteNet != null) return noteNet + costs.total;

  const directNet = toNumberOrNull(entry?.pnlNet ?? entry?.pnl_net);
  if (directNet != null) return directNet + costs.total;

  const fallback = toNumberOrNull(entry?.pnl);
  return fallback != null ? fallback + costs.total : 0;
}

function parsePnlNetFromEntry(entry: any): number {
  // if already provided
  const direct = toNumberOrNull(entry?.pnlNet ?? entry?.pnl_net);
  if (direct != null) return direct;

  const notes = parseNotesJson(entry?.notes);
  const noteNet = toNumberOrNull(notes?.pnl?.net ?? notes?.pnl_net);
  if (noteNet != null) return noteNet;

  const costs = parseCostsFromEntry(entry);
  const noteGross = toNumberOrNull(notes?.pnl?.gross ?? notes?.pnl_gross);
  if (noteGross != null) return noteGross - costs.total;

  const directGross = toNumberOrNull(entry?.pnlGross ?? entry?.pnl_gross ?? entry?.pnlUsd);
  if (directGross != null) return directGross - costs.total;

  const fallback = toNumberOrNull(entry?.pnl);
  return fallback != null ? fallback : 0;
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
  if (t) return t;
  const lang = typeof document !== "undefined" ? document.documentElement.lang : "en";
  return lang && lang.toLowerCase().startsWith("es") ? "Operación" : "Trade";
}

function parseDateIso(entry: any): string {
  const iso = String(entry?.date ?? entry?.trade_date ?? entry?.created_at ?? "").slice(0, 10);
  return looksLikeYYYYMMDD(iso) ? iso : "";
}

function parseCreatedAtIso(entry: any): string {
  const iso = String(entry?.created_at ?? entry?.createdAt ?? "");
  return iso;
}

function buildSessionsFromEntries(entries: JournalEntry[], tradeDates?: Set<string>): SessionWithTrades[] {
  const out: SessionWithTrades[] = [];

  for (const e of entries ?? []) {
    const date = parseDateIso(e);
    if (!date) continue;

    const pnlGross = parsePnlGrossFromEntry(e);
    const feesUsd = parseFeesUsdFromEntry(e);
    const pnlNet = parsePnlNetFromEntry(e);

    const notes = parseNotesJson(e?.notes);
    const hasNotesTrades =
      Array.isArray(notes?.entries) && notes?.entries?.length > 0 ||
      Array.isArray(notes?.exits) && notes?.exits?.length > 0;
    const hasTradeEvidence = (tradeDates?.has(date) ?? false) || hasNotesTrades || Math.abs(pnlNet) > 0;
    if (!hasTradeEvidence) continue;

    const win = pnlNet > 0;

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

function computeDrawdownPct(equity: EquityPoint[]): number {
  let peak = -Infinity;
  let maxDdPct = 0;

  for (const p of equity ?? []) {
    const v = p.value;
    if (!Number.isFinite(v)) continue;
    if (v > peak) peak = v;
    if (peak <= 0) continue;
    const ddPct = ((peak - v) / peak) * 100;
    if (ddPct > maxDdPct) maxDdPct = ddPct;
  }

  return maxDdPct;
}

function computeDailyReturns(equity: EquityPoint[]): number[] {
  if (!equity || equity.length < 2) return [];
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1]?.value ?? 0;
    const cur = equity[i]?.value ?? 0;
    if (!Number.isFinite(prev) || !Number.isFinite(cur) || prev === 0) continue;
    out.push((cur - prev) / prev);
  }
  return out;
}

function computeSharpe(returns: number[]): number | null {
  if (!returns.length) return null;
  const meanDaily = mean(returns);
  const sd = stddev(returns);
  if (!Number.isFinite(sd) || sd === 0) return null;
  return (meanDaily * 252) / (sd * Math.sqrt(252));
}

function computeSortino(returns: number[]): number | null {
  if (!returns.length) return null;
  const meanDaily = mean(returns);
  const downside = returns.filter((r) => r < 0);
  const downsideSd = stddev(downside);
  if (!Number.isFinite(downsideSd) || downsideSd === 0) return null;
  return (meanDaily * 252) / (downsideSd * Math.sqrt(252));
}

function computeCagr(equity: EquityPoint[]): number | null {
  if (!equity || equity.length < 2) return null;
  const first = equity[0];
  const last = equity[equity.length - 1];
  if (!first || !last) return null;
  const start = first.value;
  const end = last.value;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) return null;
  const startDate = new Date(first.date);
  const endDate = new Date(last.date);
  const years = (endDate.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (!Number.isFinite(years) || years <= 0) return null;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

function computeRecoveryFactor(netProfit: number, maxDrawdown: number): number | null {
  if (!Number.isFinite(netProfit) || !Number.isFinite(maxDrawdown) || maxDrawdown === 0) return null;
  return netProfit / maxDrawdown;
}

function computePayoffRatio(avgWin: number, avgLoss: number): number | null {
  if (!Number.isFinite(avgWin) || !Number.isFinite(avgLoss) || avgLoss === 0) return null;
  return avgWin / avgLoss;
}

function computeStreaks(sessions: SessionWithTrades[]): { win: number; loss: number } {
  let bestWin = 0;
  let bestLoss = 0;

  let curWin = 0;
  let curLoss = 0;

  for (const s of sessions ?? []) {
    const pnl = toNumberMaybe(s.pnlNet);
    if (pnl > 0) {
      curWin += 1;
      curLoss = 0;
    } else if (pnl < 0) {
      curLoss += 1;
      curWin = 0;
    } else {
      curWin = 0;
      curLoss = 0;
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

function countOutcomeStats(sessions: SessionWithTrades[]) {
  let wins = 0;
  let losses = 0;
  let breakevens = 0;

  for (const s of sessions ?? []) {
    const pnl = toNumberMaybe(s.pnlNet);
    if (pnl > 0) wins += 1;
    else if (pnl < 0) losses += 1;
    else breakevens += 1;
  }

  const denom = wins + losses;
  const winRate = denom > 0 ? (wins / denom) * 100 : 0;
  return { wins, losses, breakevens, winRate };
}

function computeMonthlyBuckets(sessions: SessionWithTrades[]): MonthBucket[] {
  const byMonth = groupBy(sessions, (s) => monthLabel(s.date));
  const out: MonthBucket[] = Object.entries(byMonth)
    .map(([month, arr]) => {
      const pnl = sum(arr.map((s) => s.pnlNet ?? 0));
      const trades = arr.length;
      const stats = countOutcomeStats(arr);
      const winRate = stats.winRate;
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
    const stats = countOutcomeStats(arr);
    const winRate = stats.winRate;
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
    const stats = countOutcomeStats(arr);
    const winRate = stats.winRate;
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
    if (toNumberMaybe(s.pnlNet) > 0) buckets[h].wins += 1;
  }

  const out: HourBucket[] = Object.entries(buckets)
    .map(([hour, b]) => {
      const losses = Math.max(0, b.trades - b.wins);
      const denom = b.wins + losses;
      const winRate = denom ? (b.wins / denom) * 100 : 0;
      return { hour, pnl: b.pnl, trades: b.trades, winRate };
    })
    .sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0));

  return out;
}

function parseClockToMinutes(raw?: string | null): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const ampm = m[4]?.toUpperCase();
  if (ampm === "AM") {
    if (hh === 12) hh = 0;
  } else if (ampm === "PM") {
    if (hh < 12) hh += 12;
  }
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function hourLabelFromMinutes(mins: number | null): string | null {
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  if (!Number.isFinite(h)) return null;
  return `${String(h).padStart(2, "0")}:00`;
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

function normalizeKind(kindRaw?: string | null): InstrumentType {
  const v = String(kindRaw ?? "").trim().toLowerCase();
  if (v.startsWith("opt")) return "option";
  if (v.startsWith("fut")) return "future";
  if (v.startsWith("sto")) return "stock";
  if (v.startsWith("cry")) return "crypto";
  if (v.startsWith("for")) return "forex";
  return "other";
}

function normalizeSide(sideRaw?: string | null): "long" | "short" {
  const v = String(sideRaw ?? "").trim().toLowerCase();
  return v === "short" ? "short" : "long";
}

function normalizePremiumSide(kind: InstrumentType, premiumRaw?: string | null): "credit" | "debit" | "none" {
  if (kind !== "option") return "none";
  const v = String(premiumRaw ?? "").trim().toLowerCase();
  if (v.startsWith("cr")) return "credit";
  if (v.startsWith("de")) return "debit";
  return "debit";
}

function pnlSign(kind: InstrumentType, side: "long" | "short", premium: "credit" | "debit" | "none"): number {
  if (kind === "option") return premium === "credit" ? -1 : 1;
  return side === "short" ? -1 : 1;
}

function getContractMultiplier(kind: InstrumentType, symbol: string) {
  if (kind === "option") return 100;
  if (kind === "future") {
    const root = futureRoot(symbol);
    return FUTURES_MULTIPLIERS[root] ?? 1;
  }
  return 1;
}

function computeTradeAnalytics(tradeRows: JournalTradeRow[], sessions: SessionWithTrades[]): TradeAnalytics {
  if (!tradeRows || tradeRows.length === 0) {
    return {
      matchedTrades: [],
      tradeCount: 0,
      tradeDays: 0,
      hourBuckets: [],
      hold: {
        avgHoldMins: null,
        medianHoldMins: null,
        minHoldMins: null,
        maxHoldMins: null,
        avgHoldWinMins: null,
        avgHoldLossMins: null,
        totalHoldHours: null,
      },
      avgPnlPerTrade: null,
      pnlPerHour: null,
    };
  }

  const dailyNet = new Map<string, number>();
  for (const s of sessions ?? []) {
    if (!s.date) continue;
    dailyNet.set(s.date, toNumberMaybe(s.pnlNet));
  }

  const rowsByDate = groupBy(tradeRows, (r) => r.journal_date || (r as any).date || "");
  const matchedTrades: MatchedTrade[] = [];

  for (const [date, rows] of Object.entries(rowsByDate)) {
    const entries = rows.filter((r) => !String(r.leg ?? "").toLowerCase().includes("exit"));
    const exits = rows.filter((r) => String(r.leg ?? "").toLowerCase().includes("exit"));

    const entryLots: Record<string, Array<{
      qtyLeft: number;
      price: number;
      timeMin: number | null;
      symbol: string;
      kind: InstrumentType;
      side: "long" | "short";
      premium: "credit" | "debit" | "none";
    }>> = {};

    for (const e of entries) {
      const symbol = String(e.symbol ?? "").trim().toUpperCase();
      if (!symbol) continue;
      const kind = normalizeKind(e.kind);
      const side = normalizeSide(e.side);
      const premium = normalizePremiumSide(kind, e.premium);
      const price = toNumberOrNull(e.price);
      const qty = toNumberOrNull(e.quantity);
      if (price == null || qty == null || qty <= 0) continue;
      const timeMin = parseClockToMinutes(e.time);
      const key = `${symbol}|${kind}|${side}|${premium}`;
      entryLots[key] ||= [];
      entryLots[key].push({ qtyLeft: qty, price, timeMin, symbol, kind, side, premium });
    }

    const sortedExits = exits.slice().sort((a, b) => {
      const ta = parseClockToMinutes(a.time);
      const tb = parseClockToMinutes(b.time);
      if (ta == null && tb == null) return 0;
      if (ta == null) return 1;
      if (tb == null) return -1;
      return ta - tb;
    });

    const matches: MatchedTrade[] = [];
    for (const x of sortedExits) {
      const symbol = String(x.symbol ?? "").trim().toUpperCase();
      if (!symbol) continue;
      const kind = normalizeKind(x.kind);
      const side = normalizeSide(x.side);
      const premium = normalizePremiumSide(kind, x.premium);
      const exitPrice = toNumberOrNull(x.price);
      let exitQty = toNumberOrNull(x.quantity);
      if (exitPrice == null || exitQty == null || exitQty <= 0) continue;
      const exitTimeMin = parseClockToMinutes(x.time);

      const key = `${symbol}|${kind}|${side}|${premium}`;
      const lots = entryLots[key];
      if (!lots || lots.length === 0) continue;

      const sign = pnlSign(kind, side, premium);
      const mult = getContractMultiplier(kind, symbol);

      while (exitQty > 0 && lots.length > 0) {
        const lot = lots[0];
        const closeQty = Math.min(lot.qtyLeft, exitQty);
        const pnl = (exitPrice - lot.price) * closeQty * sign * mult;
        const durationMin =
          lot.timeMin != null && exitTimeMin != null && exitTimeMin >= lot.timeMin
            ? exitTimeMin - lot.timeMin
            : null;

        matches.push({
          date,
          symbol,
          kind,
          side,
          premium,
          entryTimeMin: lot.timeMin,
          exitTimeMin,
          durationMin,
          qty: closeQty,
          entryPrice: lot.price,
          exitPrice,
          pnl,
        });

        lot.qtyLeft -= closeQty;
        exitQty -= closeQty;
        if (lot.qtyLeft <= 0) lots.shift();
      }
    }

    const computedNet = matches.reduce((s, t) => s + toNumberMaybe(t.pnl), 0);
    const dailyTarget = toNumberOrNull(dailyNet.get(date));
    if (dailyTarget != null && dailyTarget !== 0) {
      if (computedNet !== 0) {
        const scale = dailyTarget / computedNet;
        matches.forEach((t) => {
          t.pnl = Number((t.pnl * scale).toFixed(4));
        });
      } else {
        const totalQty = matches.reduce((s, t) => s + t.qty, 0) || 0;
        if (totalQty > 0) {
          matches.forEach((t) => {
            t.pnl = Number((dailyTarget * (t.qty / totalQty)).toFixed(4));
          });
        }
      }
    }

    matchedTrades.push(...matches);
  }

  const hourBucketsMap: Record<string, { pnl: number; trades: number; wins: number; losses: number }> = {};
  for (const t of matchedTrades) {
    const hour = hourLabelFromMinutes(t.exitTimeMin);
    if (!hour) continue;
    if (!hourBucketsMap[hour]) {
      hourBucketsMap[hour] = { pnl: 0, trades: 0, wins: 0, losses: 0 };
    }
    hourBucketsMap[hour].pnl += toNumberMaybe(t.pnl);
    hourBucketsMap[hour].trades += 1;
    if (t.pnl > 0) hourBucketsMap[hour].wins += 1;
    else if (t.pnl < 0) hourBucketsMap[hour].losses += 1;
  }

  const hourBuckets: HourBucket[] = Object.entries(hourBucketsMap)
    .map(([hour, b]) => {
      const denom = b.wins + b.losses;
      const winRate = denom > 0 ? (b.wins / denom) * 100 : 0;
      return { hour, pnl: b.pnl, trades: b.trades, winRate };
    })
    .sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0));

  const durations = matchedTrades
    .map((t) => t.durationMin)
    .filter((n): n is number => n != null && Number.isFinite(n));

  const winDurations = matchedTrades
    .filter((t) => t.pnl > 0 && t.durationMin != null)
    .map((t) => t.durationMin as number);
  const lossDurations = matchedTrades
    .filter((t) => t.pnl < 0 && t.durationMin != null)
    .map((t) => t.durationMin as number);

  const avgHoldMins = durations.length ? mean(durations) : null;
  const medianHoldMins = durations.length ? median(durations) : null;
  const minHoldMins = durations.length ? Math.min(...durations) : null;
  const maxHoldMins = durations.length ? Math.max(...durations) : null;
  const avgHoldWinMins = winDurations.length ? mean(winDurations) : null;
  const avgHoldLossMins = lossDurations.length ? mean(lossDurations) : null;

  const totalHoldHours = durations.length ? sum(durations) / 60 : null;
  const totalNetPnl = matchedTrades.reduce((s, t) => s + toNumberMaybe(t.pnl), 0);
  const avgPnlPerTrade = matchedTrades.length ? totalNetPnl / matchedTrades.length : null;
  const pnlPerHour = totalHoldHours && totalHoldHours > 0 ? totalNetPnl / totalHoldHours : null;

  const tradeDays = new Set(matchedTrades.map((t) => t.date)).size;

  return {
    matchedTrades,
    tradeCount: matchedTrades.length,
    tradeDays,
    hourBuckets,
    hold: {
      avgHoldMins,
      medianHoldMins,
      minHoldMins,
      maxHoldMins,
      avgHoldWinMins,
      avgHoldLossMins,
      totalHoldHours,
    },
    avgPnlPerTrade,
    pnlPerHour,
  };
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
  range: DateRange,
  tradeStats?: TradeAnalytics | null
): AnalyticsSnapshot {
  const totalSessions = sessions.length;
  const outcomeStats = countOutcomeStats(sessions);
  const wins = outcomeStats.wins;
  const losses = outcomeStats.losses;
  const breakevens = outcomeStats.breakevens;
  const winRate = outcomeStats.winRate;

  const grossPnl = sum(sessions.map((s) => toNumberMaybe(s.pnlGross)));
  const totalFees = sum(sessions.map((s) => toNumberMaybe(s.feesUsd)));
  const netPnl = sum(sessions.map((s) => toNumberMaybe(s.pnlNet)));
  const avgNetPerSession = totalSessions ? netPnl / totalSessions : 0;

  const winsArr = sessions.filter((s) => s.pnlNet != null && s.pnlNet > 0).map((s) => toNumberMaybe(s.pnlNet));
  const lossArr = sessions.filter((s) => s.pnlNet != null && s.pnlNet < 0).map((s) => Math.abs(toNumberMaybe(s.pnlNet)));

  const sumWins = sum(winsArr);
  const sumLoss = sum(lossArr);
  const profitFactor = sumLoss > 0 ? sumWins / sumLoss : null;

  const avgWin = winsArr.length ? mean(winsArr) : 0;
  const avgLoss = lossArr.length ? mean(lossArr) : 0;

  const denom = wins + losses;
  const pWin = denom > 0 ? wins / denom : 0;
  const expectancy = pWin * avgWin - (1 - pWin) * avgLoss;

  const maxWin = winsArr.length ? Math.max(...winsArr) : 0;
  const maxLoss = lossArr.length ? Math.max(...lossArr) : 0;

  const { equityCurve, dailyPnl } = computeEquityCurve(sessionsAll, cashflows, startingBalance, planStartIso, range.startIso, range.endIso);
  const maxDrawdown = computeDrawdown(equityCurve);
  const maxDrawdownPct = computeDrawdownPct(equityCurve);
  const returns = computeDailyReturns(equityCurve);
  const sharpe = computeSharpe(returns);
  const sortino = computeSortino(returns);
  const cagr = computeCagr(equityCurve);
  const recoveryFactor = computeRecoveryFactor(netPnl, maxDrawdown);
  const payoffRatio = computePayoffRatio(avgWin, avgLoss);
  const streaks = computeStreaks(sessions);

  const pnlHistogram = computeHistogram(sessions.map((s) => toNumberMaybe(s.pnlNet)));
  const monthly = computeMonthlyBuckets(sessions);
  const bySymbol = computeSymbolBuckets(sessions);
  const byDOW = computeDOWBuckets(sessions);
  const byHour = tradeStats?.hourBuckets?.length
    ? tradeStats.hourBuckets
    : computeHourBuckets(entries, sessions);

  const tradesTable = buildTradesTable(sessions);

  const totalTrades = tradeStats?.tradeCount ?? totalSessions;

  return {
    updatedAtIso: new Date().toISOString(),

    totalSessions,
    totalTrades,
    wins,
    losses,
    breakevens,
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
    maxDrawdownPct,
    longestWinStreak: streaks.win,
    longestLossStreak: streaks.loss,

    cagr,
    sharpe,
    sortino,
    recoveryFactor,
    payoffRatio,

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
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale) as Lang;
  const isEs = lang === "es";
  const L = (en: string, es: string) => LL(lang, en, es);
  const localeTag = isEs ? "es-ES" : "en-US";

  const userId = (user as any)?.id as string | undefined;
  const journalUserId = useMemo(() => resolveJournalUserId(user), [user]);
  const cashflowUserIds = useMemo(() => resolveCashflowUserIds(user), [user]);

  const [dateRange, setDateRange] = useState<DateRange>(() => getDefaultRange("30D"));

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [tradeRows, setTradeRows] = useState<JournalTradeRow[]>([]);
  const [activeGroup, setActiveGroup] = useState<AnalyticsGroupId>("overview");
  const [loadingData, setLoadingData] = useState(true);
  const autoRangeAppliedRef = useRef(false);

  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [dailySnaps, setDailySnaps] = useState<DailySnapshotRow[]>([]);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [serverSeries, setServerSeries] = useState<{
    series: Array<{ date: string; value: number }>;
    daily: Array<{ date: string; value: number }>;
  } | null>(null);

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
      if (!journalUserId && !userId) return;

      setLoadingData(true);
      try {
        const primaryId = journalUserId || userId || "";
        let all = primaryId ? await getAllJournalEntries(primaryId) : [];
        if ((!all || all.length === 0) && userId && userId !== primaryId) {
          const alt = await getAllJournalEntries(userId);
          if (alt?.length) all = alt;
        }
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
  }, [journalUserId, userId]);

  // Load journal_trades for timing analytics (entries/exits per fill)
  useEffect(() => {
    let alive = true;

    async function run() {
      if (!userId && !journalUserId) return;

      const start = looksLikeYYYYMMDD(dateRange.startIso) ? dateRange.startIso : "";
      const end = looksLikeYYYYMMDD(dateRange.endIso) ? dateRange.endIso : "";

      const fetchRows = async (uid: string) => {
        let q = supabaseBrowser
          .from("journal_trades")
          .select("journal_date, leg, symbol, kind, side, premium, strategy, price, quantity, time")
          .eq("user_id", uid)
          .order("journal_date", { ascending: true });
        if (start) q = q.gte("journal_date", start);
        if (end) q = q.lte("journal_date", end);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []) as JournalTradeRow[];
      };

      try {
        let rows: JournalTradeRow[] = [];
        if (userId) rows = await fetchRows(userId);
        if ((!rows || rows.length === 0) && journalUserId && journalUserId !== userId) {
          rows = await fetchRows(journalUserId);
        }
        if (!alive) return;
        setTradeRows(rows ?? []);
      } catch (err) {
        console.error("[AnalyticsStatistics] journal_trades fetch error:", err);
        if (!alive) return;
        setTradeRows([]);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [userId, journalUserId, dateRange.startIso, dateRange.endIso]);

  // Load daily snapshots (optional)
  useEffect(() => {
    let alive = true;

    async function run() {
      const uid = userId ?? "";
      if (!uid) return;

      try {
        const start = dateRange.startIso;
        const end = dateRange.endIso;
        if (!start || !end) {
          setDailySnaps([]);
          return;
        }

        const snaps = await listDailySnapshots(uid, start, end);
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
        const opts = fromDate ? { fromDate, throwOnError: false, forceServer: true } : { throwOnError: false, forceServer: true };
        let rows = cashflowUserIds.primary ? await listCashflows(cashflowUserIds.primary, opts) : [];
        if ((!rows || rows.length === 0) && cashflowUserIds.secondary && cashflowUserIds.secondary !== cashflowUserIds.primary) {
          const alt = await listCashflows(cashflowUserIds.secondary, opts);
          if (alt?.length) rows = alt;
        }
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
  }, [cashflowUserIds.primary, cashflowUserIds.secondary, planStartIso, dateRange.startIso, dateRange.endIso]);

  // Server series (authoritative)
  useEffect(() => {
    let alive = true;
    async function loadSeries() {
      if (loading) return;
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;

        const res = await fetch("/api/account/series", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        if (!alive) return;
        if (Array.isArray(body?.series)) {
          setServerSeries({
            series: body.series,
            daily: Array.isArray(body?.daily) ? body.daily : [],
          });
        }
      } catch {
        // ignore
      }
    }
    loadSeries();
    return () => {
      alive = false;
    };
  }, [loading]);

  const tradeDates = useMemo(() => {
    return new Set(
      (tradeRows ?? [])
        .map((r) => r.journal_date || (r as any).date || "")
        .filter(looksLikeYYYYMMDD)
    );
  }, [tradeRows]);

  const sessionsAll = useMemo(() => buildSessionsFromEntries(entries, tradeDates), [entries, tradeDates]);

  const sessions = useMemo(() => {
    // Apply range and also clamp to plan start if present
    const ranged = filterByRange(sessionsAll, dateRange.startIso, dateRange.endIso);
    if (!planStartIso) return ranged;
    return ranged.filter((s) => s.date >= planStartIso);
  }, [sessionsAll, dateRange.startIso, dateRange.endIso, planStartIso]);

  const tradeStats = useMemo(() => computeTradeAnalytics(tradeRows, sessions), [tradeRows, sessions]);

  // Auto-expand to ALL if range returns zero sessions but data exists
  useEffect(() => {
    if (autoRangeAppliedRef.current) return;
    if (dateRange.preset === "ALL") return;
    if (sessionsAll.length > 0 && sessions.length === 0) {
      autoRangeAppliedRef.current = true;
      setDateRange(getDefaultRange("ALL"));
    }
  }, [sessionsAll.length, sessions.length, dateRange.preset]);

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
    const snap = computeSnapshot(entries, sessionsAll, sessions, cashflows, planStartingBalance, planStartIso, dateRange, tradeStats);
    setSnapshot(snap);
  }, [entries, sessionsAll, sessions, cashflows, planStartingBalance, planStartIso, dateRange, tradeStats]);

  // Derived display data
  const uiTotals = useMemo(() => {
    const s = snapshot;
    if (!s) {
      return {
        totalSessions: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
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
      breakevens: s.breakevens,
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
    if (serverSeries && serverSeries.series.length) {
      return serverSeries.series.map((p) => ({ date: p.date, value: Number(p.value ?? 0) }));
    }
    return s.equityCurve;
  }, [snapshot, serverSeries]);

  const uiDaily = useMemo(() => {
    const s = snapshot;
    if (!s) return [] as DailyPnlPoint[];
    if (serverSeries && serverSeries.daily.length) {
      return serverSeries.daily.map((p) => ({ date: p.date, value: Number(p.value ?? 0) }));
    }
    return s.dailyPnl;
  }, [snapshot, serverSeries]);

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">{L("Loading…", "Cargando…")}</p>
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
              <h1 className="text-3xl font-semibold">
                {L("Analytics & Statistics", "Análisis y estadísticas")}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {L(
                  "Deep performance breakdown for your trading journal. Deposits/withdrawals are pulled from",
                  "Desglose profundo del performance de tu journal. Depósitos/retiros se leen desde"
                )}{" "}
                <span className="font-mono">cashflows</span>{" "}
                {L(
                  "and included in account equity.",
                  "y se incluyen en el equity de cuenta."
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                {L("Dashboard →", "Dashboard →")}
              </Link>

              <Link
                href="/balance-chart"
                className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                {L("Balance chart →", "Gráfico de balance →")}
              </Link>
            </div>
          </div>
        </header>

        {/* Date range selector */}
        <section className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">{L("Range", "Rango")}</div>
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
              <span>{L("All time →", "Todo el histórico →")} {dateRange.endIso}</span>
            )}
          </div>
        </section>

        {/* Top KPIs */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label={L("Sessions", "Sesiones")}
            value={uiTotals.totalSessions.toLocaleString()}
            sub={loadingData ? L("Loading…", "Cargando…") : ""}
            help={L(
              "Trading days with activity inside the selected range.",
              "Días con actividad de trading dentro del rango seleccionado."
            )}
          />
          <KpiCard
            label={L("Win rate", "Tasa de acierto")}
            value={fmtPct(uiTotals.winRate)}
            sub={
              lang === "es"
                ? `${uiTotals.wins}G / ${uiTotals.losses}Apr / ${uiTotals.breakevens}Plano`
                : `${uiTotals.wins}W / ${uiTotals.losses}Learn / ${uiTotals.breakevens}Flat`
            }
            help={L(
              "Wins divided by (wins + lessons). Flat days are excluded.",
              "Ganadas dividido entre (ganadas + aprendizajes). Días planos se excluyen."
            )}
          />
          <KpiCard
            label={L("Net P&L", "P&L neto")}
            value={fmtUsd(uiTotals.netPnl)}
            valueClass={uiTotals.netPnl >= 0 ? "text-emerald-300" : "text-sky-300"}
            sub={`${L("Fees", "Comisiones")}: ${fmtUsd(uiTotals.totalFees)}`}
            help={L(
              "Sum of net P&L after fees across the selected sessions.",
              "Suma del P&L neto (después de comisiones) en el rango seleccionado."
            )}
          />
          <KpiCard
            label={L("Expectancy", "Expectativa")}
            value={fmtUsd(uiTotals.expectancy)}
            sub={uiTotals.profitFactor != null ? `PF: ${uiTotals.profitFactor.toFixed(2)}` : "PF: —"}
            help={L(
              "Expected result per session: P(win)×avgWin − P(lesson)×avgLesson.",
              "Resultado esperado por sesión: P(ganar)×promedioWin − P(aprender)×promedioLesson."
            )}
          />
        </section>

        {/* Tabs */}
        <section className="mb-6">
          <div className="flex flex-wrap gap-2">
            {([
              ["overview", L("Overview", "Resumen")],
              ["performance", L("Performance", "Rendimiento")],
              ["risk", L("Risk", "Riesgo")],
              ["distribution", L("Distribution", "Distribución")],
              ["time", L("Time", "Tiempo")],
              ["instruments", L("Instruments", "Instrumentos")],
              ["trades", L("Trades", "Operaciones")],
              ["statistics", L("Statistics", "Estadísticas")],
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
            {L("No trade sessions found in this date range.", "No se encontraron sesiones en este rango.")}
            <div className="text-xs text-slate-500 mt-2">
              {L(
                "If you expected data, confirm your journal entries are saved in Supabase for user id",
                "Si esperabas datos, confirma que tus entradas están guardadas en Supabase para el usuario"
              )}{" "}
              <span className="font-mono">{String(userId || "")}</span>.
            </div>
          </div>
        ) : (
          <>
            {activeGroup === "overview" && (
              <OverviewSection lang={lang} equity={uiEquity} daily={uiDaily} snapshot={snapshot} />
            )}

            {activeGroup === "performance" && <PerformanceSection lang={lang} snapshot={snapshot} />}

            {activeGroup === "risk" && <RiskSection lang={lang} snapshot={snapshot} />}

            {activeGroup === "distribution" && <DistributionSection lang={lang} snapshot={snapshot} />}

            {activeGroup === "time" && <TimeSection lang={lang} snapshot={snapshot} />}

            {activeGroup === "instruments" && <InstrumentsSection lang={lang} snapshot={snapshot} />}

            {activeGroup === "trades" && <TradesSection lang={lang} snapshot={snapshot} />}

            {activeGroup === "statistics" && (
              <StatisticsSection
                lang={lang}
                sessions={sessions}
                dailySnaps={dailySnaps}
                cashflows={cashflowsInRange}
                rangeEndIso={dateRange.endIso}
                tradeStats={tradeStats}
              />
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

function InfoDot({ text }: { text: string }) {
  return (
    <span
      className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-700 text-[10px] text-slate-400"
      title={text}
      aria-label={text}
    >
      i
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  valueClass,
  help,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  help: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="text-[11px] text-slate-500 tracking-widest uppercase flex items-center">
        <span>{label}</span>
        <InfoDot text={help} />
      </div>
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
  lang,
  equity,
  daily,
  snapshot,
}: {
  lang: Lang;
  equity: EquityPoint[];
  daily: DailyPnlPoint[];
  snapshot: AnalyticsSnapshot | null;
}) {
  const T = (en: string, es: string) => LL(lang, en, es);
  const eqSeries = useMemo(() => {
    const pts = equity ?? [];
    const data = pts.map((p) => [new Date(p.date).getTime(), p.value]);
    if (data.length === 1) {
      const [x, y] = data[0];
      data.push([x + 86400000, y]);
    }
    return [{ name: T("Equity", "Equity"), data }];
  }, [equity, lang]);

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
    return [{ name: T("Daily P&L", "P&L diario"), data }];
  }, [daily, lang]);

  const pnlBounds = useMemo(() => {
    const vals = (daily ?? []).map((p) => Number(p.value ?? 0)).filter((v) => Number.isFinite(v));
    if (!vals.length) return { min: -1, max: 1 };
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (min === max) {
      const pad = Math.max(1, Math.abs(min) * 0.5);
      return { min: min - pad, max: max + pad };
    }
    const span = Math.max(1, (max - min) * 0.2);
    return { min: min - span, max: max + span };
  }, [daily]);

  const eqOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "line",
        toolbar: { show: false },
        foreColor: "#cbd5e1",
        background: "transparent",
        dropShadow: {
          enabled: true,
          top: 2,
          left: 0,
          blur: 6,
          opacity: 0.2,
        },
      },
      stroke: { width: 2.4, curve: "smooth" },
      colors: ["#38bdf8"],
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 0.3,
          opacityFrom: 0.35,
          opacityTo: 0.02,
          stops: [0, 70, 100],
        },
      },
      markers: { size: 2 },
      xaxis: { type: "datetime" },
      yaxis: { labels: { formatter: (v) => `$${Math.round(v)}` } },
      tooltip: { x: { format: "yyyy-MM-dd" }, y: { formatter: (v) => fmtUsd(v) } },
      grid: { borderColor: "#1f2937", strokeDashArray: 4 },
      theme: { mode: "dark" },
    }),
    []
  );

  const pnlOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "candlestick",
        toolbar: { show: false },
        foreColor: "#cbd5e1",
        background: "transparent",
      },
      xaxis: { type: "datetime" },
      yaxis: {
        min: pnlBounds.min,
        max: pnlBounds.max,
        labels: { formatter: (v) => `$${Math.round(v)}` },
      },
      tooltip: { x: { format: "yyyy-MM-dd" }, y: { formatter: (v) => fmtUsd(v) } },
      grid: { borderColor: "#1f2937", strokeDashArray: 4 },
      theme: { mode: "dark" },
      plotOptions: {
        candlestick: {
          colors: {
            upward: "#22c55e",
            downward: "#60a5fa",
          },
          wick: { useFillColor: true },
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
    [pnlBounds.min, pnlBounds.max]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card
        title={T("Equity Curve", "Curva de equity")}
        right={<span className="text-xs text-slate-500">{T("Account equity (trading P&L + deposits/withdrawals)", "Equity de cuenta (P&L trading + depósitos/retiros)")}</span>}
      >
        <div className="h-[320px]">
          <Chart options={eqOptions} series={eqSeries as any} type="line" height={320} />
        </div>
      </Card>

      <Card title={T("Daily P&L", "P&L diario")} right={<span className="text-xs text-slate-500">{T("Trading P&L only", "Solo P&L de trading")}</span>}>
        <div className="h-[320px]">
          <Chart options={pnlOptions} series={pnlSeries as any} type="candlestick" height={320} />
        </div>
      </Card>

      <Card title={T("Quick stats", "Estadísticas rápidas")}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 text-sm">
          <MiniStat
            label={T("Avg / session", "Promedio / sesión")}
            value={snapshot ? fmtUsd(snapshot.avgNetPerSession) : "—"}
            help={T("Average net result per session.", "Promedio neto por sesión.")}
          />
          <MiniStat
            label={T("Max win", "Máx. ganancia")}
            value={snapshot ? fmtUsd(snapshot.maxWin) : "—"}
            help={T("Best single-session result.", "Mejor resultado en una sesión.")}
          />
          <MiniStat
            label={T("Max lesson", "Máx. aprendizaje")}
            value={snapshot ? fmtUsd(snapshot.maxLoss) : "—"}
            help={T("Largest drawdown in a single session.", "Mayor caída en una sola sesión.")}
          />
          <MiniStat
            label={T("Max drawdown", "Máx. drawdown")}
            value={snapshot ? fmtUsd(snapshot.maxDrawdown) : "—"}
            help={T("Largest peak-to-trough decline in equity.", "Mayor caída desde un pico hasta un valle en equity.")}
          />
          <MiniStat
            label={T("Avg win", "Promedio ganador")}
            value={snapshot ? fmtUsd(snapshot.avgWin) : "—"}
            help={T("Average winning session result.", "Promedio de sesiones ganadoras.")}
          />
          <MiniStat
            label={T("Avg lesson", "Promedio aprendizaje")}
            value={snapshot ? fmtUsd(snapshot.avgLoss) : "—"}
            help={T("Average learning session magnitude.", "Promedio de sesiones de aprendizaje.")}
          />
          <MiniStat
            label={T("Breakeven rate", "Tasa de plano")}
            value={
              snapshot && snapshot.totalSessions > 0
                ? fmtPct((snapshot.breakevens / snapshot.totalSessions) * 100)
                : "—"
            }
            help={T("Share of flat sessions.", "Porcentaje de sesiones planas.")}
          />
        </div>
      </Card>

      <Card title={T("Streaks", "Rachas")}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <MiniStat
            label={T("Longest win streak", "Racha ganadora más larga")}
            value={snapshot ? String(snapshot.longestWinStreak) : "—"}
            help={T("Most consecutive winning sessions.", "Mayor número de sesiones ganadoras consecutivas.")}
          />
          <MiniStat
            label={T("Longest lesson streak", "Racha de aprendizaje más larga")}
            value={snapshot ? String(snapshot.longestLossStreak) : "—"}
            help={T("Most consecutive learning sessions.", "Mayor número de sesiones de aprendizaje consecutivas.")}
          />
        </div>
      </Card>

      <Card title={T("Institutional KPIs", "KPIs institucionales")}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <MiniStat
            label={T("CAGR", "CAGR")}
            value={snapshot?.cagr != null ? fmtPct(snapshot.cagr) : "—"}
            help={T("Annualized growth based on the equity curve.", "Crecimiento anualizado basado en la curva de equity.")}
          />
          <MiniStat
            label={T("Sharpe", "Sharpe")}
            value={snapshot?.sharpe != null ? snapshot.sharpe.toFixed(2) : "—"}
            help={T("Risk-adjusted return vs total volatility.", "Retorno ajustado por riesgo vs volatilidad total.")}
          />
          <MiniStat
            label={T("Sortino", "Sortino")}
            value={snapshot?.sortino != null ? snapshot.sortino.toFixed(2) : "—"}
            help={T("Risk-adjusted return vs downside volatility only.", "Retorno ajustado por riesgo vs volatilidad negativa.")}
          />
          <MiniStat
            label={T("Max DD %", "Máx DD %")}
            value={snapshot?.maxDrawdownPct != null ? fmtPct(snapshot.maxDrawdownPct) : "—"}
            help={T("Max drawdown as a percentage of peak equity.", "Máximo drawdown como % del pico de equity.")}
          />
          <MiniStat
            label={T("Recovery factor", "Recovery factor")}
            value={snapshot?.recoveryFactor != null ? snapshot.recoveryFactor.toFixed(2) : "—"}
            help={T("Net profit divided by max drawdown.", "Ganancia neta dividido por max drawdown.")}
          />
          <MiniStat
            label={T("Payoff ratio", "Payoff ratio")}
            value={snapshot?.payoffRatio != null ? snapshot.payoffRatio.toFixed(2) : "—"}
            help={T("Average win divided by average lesson.", "Promedio ganancia dividido por promedio aprendizaje.")}
          />
        </div>
        <p className="text-[11px] text-slate-500 mt-3">
          {T(
            "Sharpe/Sortino use daily equity returns; CAGR is annualized from the first/last equity points.",
            "Sharpe/Sortino usan retornos diarios de equity; CAGR es anualizado desde el primer/último punto."
          )}
        </p>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, help }: { label: string; value: string; help: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
      <div className="text-[11px] text-slate-500 flex items-center">
        <span>{label}</span>
        <InfoDot text={help} />
      </div>
      <div className="mt-1 text-slate-100 font-semibold">{value}</div>
    </div>
  );
}

function PerformanceSection({ lang, snapshot }: { lang: Lang; snapshot: AnalyticsSnapshot | null }) {
  const T = (en: string, es: string) => LL(lang, en, es);
  const rows = snapshot?.monthly ?? [];

  return (
    <Card title={T("Monthly performance", "Rendimiento mensual")} right={<span className="text-xs text-slate-500">{T("Net P&L by month", "P&L neto por mes")}</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{T("No data.", "Sin datos.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800">
                <th className="text-left py-2 pr-4">{T("Month", "Mes")}</th>
                <th className="text-right py-2 px-2">{T("P&L", "P&L")}</th>
                <th className="text-right py-2 px-2">{T("Trades", "Operaciones")}</th>
                <th className="text-right py-2 pl-2">{T("Win rate", "Tasa de acierto")}</th>
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

function RiskSection({ lang, snapshot }: { lang: Lang; snapshot: AnalyticsSnapshot | null }) {
  const T = (en: string, es: string) => LL(lang, en, es);
  if (!snapshot) return <Card title={T("Risk", "Riesgo")}><p className="text-sm text-slate-400">{T("No data.", "Sin datos.")}</p></Card>;

  const pnl = snapshot.tradesTable.map((t) => t.pnlNet);
  const avg = mean(pnl);
  const sd = stddev(pnl);
  const med = median(pnl);
  const q25 = quantile(pnl, 0.25);
  const q75 = quantile(pnl, 0.75);

  return (
    <Card title={T("Risk & consistency", "Riesgo y consistencia")}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <MiniStat label={T("Std dev", "Desv. estándar")} value={fmtUsd(sd)} help={T("Volatility of session results.", "Volatilidad de resultados por sesión.")} />
        <MiniStat label={T("Median", "Mediana")} value={fmtUsd(med)} help={T("Middle session result.", "Resultado central por sesión.")} />
        <MiniStat label={T("Avg", "Promedio")} value={fmtUsd(avg)} help={T("Average session result.", "Promedio por sesión.")} />
        <MiniStat label={T("25th pct", "Pct 25")} value={fmtUsd(q25)} help={T("Bottom quartile of results.", "Cuartil inferior de resultados.")} />
        <MiniStat label={T("75th pct", "Pct 75")} value={fmtUsd(q75)} help={T("Top quartile of results.", "Cuartil superior de resultados.")} />
        <MiniStat label={T("Profit factor", "Factor de ganancia")} value={snapshot.profitFactor != null ? snapshot.profitFactor.toFixed(2) : "—"} help={T("Sum of wins divided by sum of lessons.", "Suma de ganadas dividido por suma de aprendizajes.")} />
      </div>

      <p className="text-xs text-slate-500 mt-4">
        {T(
          "Std dev measures how volatile your per-session results are. Lower is generally more consistent.",
          "La desviación estándar mide qué tan volátiles son tus resultados por sesión. Más bajo suele ser más consistente."
        )}
      </p>
    </Card>
  );
}

function DistributionSection({ lang, snapshot }: { lang: Lang; snapshot: AnalyticsSnapshot | null }) {
  const T = (en: string, es: string) => LL(lang, en, es);
  const bins = snapshot?.pnlHistogram ?? [];

  const series = useMemo(() => {
    return [{ name: T("Count", "Cantidad"), data: bins.map((b) => b.count) }];
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
    <Card title={T("P&L distribution", "Distribución de P&L")} right={<span className="text-xs text-slate-500">{T("Histogram of session P&L", "Histograma de P&L por sesión")}</span>}>
      {bins.length === 0 ? (
        <p className="text-sm text-slate-400">{T("No data.", "Sin datos.")}</p>
      ) : (
        <div className="h-[320px]">
          <Chart options={options} series={series as any} type="bar" height={320} />
        </div>
      )}
    </Card>
  );
}

function TimeSection({ lang, snapshot }: { lang: Lang; snapshot: AnalyticsSnapshot | null }) {
  const T = (en: string, es: string) => LL(lang, en, es);
  const byDOW = snapshot?.byDOW ?? [];
  const byHour = snapshot?.byHour ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title={T("By day of week", "Por día de la semana")}>
        {byDOW.length === 0 ? (
          <p className="text-sm text-slate-400">{T("No data.", "Sin datos.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 pr-4">{T("Day", "Día")}</th>
                  <th className="text-right py-2 px-2">{T("P&L", "P&L")}</th>
                  <th className="text-right py-2 px-2">{T("Trades", "Operaciones")}</th>
                  <th className="text-right py-2 pl-2">{T("Win rate", "Tasa de acierto")}</th>
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

      <Card title={T("By hour", "Por hora")}>
        {byHour.length === 0 ? (
          <p className="text-sm text-slate-400">
            {T(
              "No data (requires trade times in your journal).",
              "Sin datos (requiere horas de trades en tu journal)."
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-800">
                  <th className="text-left py-2 pr-4">{T("Hour", "Hora")}</th>
                  <th className="text-right py-2 px-2">{T("P&L", "P&L")}</th>
                  <th className="text-right py-2 px-2">{T("Trades", "Operaciones")}</th>
                  <th className="text-right py-2 pl-2">{T("Win rate", "Tasa de acierto")}</th>
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

function InstrumentsSection({ lang, snapshot }: { lang: Lang; snapshot: AnalyticsSnapshot | null }) {
  const T = (en: string, es: string) => LL(lang, en, es);
  const rows = snapshot?.bySymbol ?? [];

  return (
    <Card title={T("By symbol", "Por símbolo")} right={<span className="text-xs text-slate-500">{T("Sorted by net P&L", "Ordenado por P&L neto")}</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{T("No data.", "Sin datos.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800">
                <th className="text-left py-2 pr-4">{T("Symbol", "Símbolo")}</th>
                <th className="text-right py-2 px-2">{T("P&L", "P&L")}</th>
                <th className="text-right py-2 px-2">{T("Trades", "Operaciones")}</th>
                <th className="text-right py-2 pl-2">{T("Win rate", "Tasa de acierto")}</th>
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

function TradesSection({ lang, snapshot }: { lang: Lang; snapshot: AnalyticsSnapshot | null }) {
  const T = (en: string, es: string) => LL(lang, en, es);
  const rows = snapshot?.tradesTable ?? [];

  return (
    <Card title={T("Trades", "Operaciones")} right={<span className="text-xs text-slate-500">{T("Most recent first", "Más recientes primero")}</span>}>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">{T("No data.", "Sin datos.")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-800">
                <th className="text-left py-2 pr-4">{T("Date", "Fecha")}</th>
                <th className="text-left py-2 px-2">{T("Title", "Título")}</th>
                <th className="text-left py-2 px-2">{T("Instrument", "Instrumento")}</th>
                <th className="text-left py-2 px-2">{T("Symbol", "Símbolo")}</th>
                <th className="text-right py-2 px-2">{T("Fees", "Comisiones")}</th>
                <th className="text-right py-2 pl-2">{T("Net", "Neto")}</th>
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
  medianHoldMins: number | null;
  minHoldMins: number | null;
  maxHoldMins: number | null;
  avgHoldWinMins: number | null;
  avgHoldLossMins: number | null;
  avgPnlPerTrade: number | null;
  pnlPerHour: number | null;
  tradesPerSession: number | null;

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
  tradeStats?: TradeAnalytics | null;
}): StatsAgg {
  const { sessions, ledgerClosedTrades, ledgerOpenPositions, dailySnaps, cashflows, tradeStats } = opts;

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

  const avgHoldMins: number | null = tradeStats?.hold?.avgHoldMins ?? null;
  const medianHoldMins: number | null = tradeStats?.hold?.medianHoldMins ?? null;
  const minHoldMins: number | null = tradeStats?.hold?.minHoldMins ?? null;
  const maxHoldMins: number | null = tradeStats?.hold?.maxHoldMins ?? null;
  const avgHoldWinMins: number | null = tradeStats?.hold?.avgHoldWinMins ?? null;
  const avgHoldLossMins: number | null = tradeStats?.hold?.avgHoldLossMins ?? null;
  const avgPnlPerTrade: number | null = tradeStats?.avgPnlPerTrade ?? null;
  const pnlPerHour: number | null = tradeStats?.pnlPerHour ?? null;
  const tradesPerSession: number | null = tradeStats && sessions.length ? tradeStats.tradeCount / sessions.length : null;

  const closedTrades = ledgerClosedTrades ?? [];
  const totalClosedTrades = tradeStats?.tradeCount ?? closedTrades.length;

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
    medianHoldMins,
    minHoldMins,
    maxHoldMins,
    avgHoldWinMins,
    avgHoldLossMins,
    avgPnlPerTrade,
    pnlPerHour,
    tradesPerSession,

    totalClosedTrades,
    avgRMultiple,
    bestRMultiple,
    worstRMultiple,

    openPositionsCount,
  };
}

function StatisticsSection({
  lang,
  sessions,
  dailySnaps,
  cashflows,
  rangeEndIso,
  tradeStats,
}: {
  lang: Lang;
  sessions: SessionWithTrades[];
  dailySnaps: DailySnapshotRow[];
  cashflows: Cashflow[];
  rangeEndIso: string;
  tradeStats: TradeAnalytics;
}) {
  const T = (en: string, es: string) => LL(lang, en, es);
  // if you have a trade ledger, load it here; for now we infer from sessions
  const ledgerClosedTrades = useMemo(() => [], []);
  const ledgerOpenPositions = useMemo(() => [], []);

  const agg = useMemo(() => {
    return computeStatsAgg({ sessions, ledgerClosedTrades, ledgerOpenPositions, dailySnaps, cashflows, tradeStats });
  }, [sessions, ledgerClosedTrades, ledgerOpenPositions, dailySnaps, cashflows, tradeStats]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card title={T("Account metrics", "Métricas de cuenta")} right={<span className="text-xs text-slate-500">{T("As of", "Al")} {rangeEndIso}</span>}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <MiniStat label={T("Account growth", "Crecimiento de cuenta")} value={agg.accountGrowthPct != null ? fmtPct(agg.accountGrowthPct) : "—"} help={T("Change in equity over the range.", "Cambio en equity durante el rango.")} />
          <MiniStat label={T("Trade costs", "Costos de trading")} value={fmtUsd(agg.totalTradeCosts)} help={T("Total commissions + fees.", "Total de comisiones + fees.")} />
          <MiniStat label={T("Deposits", "Depósitos")} value={agg.totalDeposits != null ? fmtUsd(agg.totalDeposits) : "—"} help={T("Cash added to the account.", "Aportes de efectivo a la cuenta.")} />
          <MiniStat label={T("Withdrawals", "Retiros")} value={agg.totalWithdrawals != null ? fmtUsd(agg.totalWithdrawals) : "—"} help={T("Cash removed from the account.", "Retiros de efectivo de la cuenta.")} />
        </div>
        <p className="text-xs text-slate-500 mt-4">
          {T(
            "Deposits/withdrawals are read from",
            "Los depósitos/retiros se leen desde"
          )}{" "}
          <span className="font-mono">cashflows</span>{" "}
          {T(
            "when snapshot columns aren't available.",
            "cuando las columnas de snapshot no están disponibles."
          )}
        </p>
      </Card>

      <Card title={T("Trade metrics", "Métricas de trading")}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <MiniStat label={T("Closed trades", "Operaciones cerradas")} value={String(agg.totalClosedTrades)} help={T("Count of closed trade legs.", "Cantidad de operaciones cerradas.")} />
          <MiniStat label={T("Open positions", "Posiciones abiertas")} value={String(agg.openPositionsCount)} help={T("Open positions detected in the ledger.", "Posiciones abiertas detectadas en el ledger.")} />
          <MiniStat label={T("Avg R", "R promedio")} value={agg.avgRMultiple != null ? agg.avgRMultiple.toFixed(2) : "—"} help={T("Average R-multiple (if available).", "R-múltiplo promedio (si disponible).")} />
          <MiniStat label={T("Best R", "Mejor R")} value={agg.bestRMultiple != null ? agg.bestRMultiple.toFixed(2) : "—"} help={T("Best single-trade R-multiple.", "Mejor R-múltiplo por trade.")} />
          <MiniStat label={T("Lowest R", "R más bajo")} value={agg.worstRMultiple != null ? agg.worstRMultiple.toFixed(2) : "—"} help={T("Lowest single-trade R-multiple.", "R-múltiplo más bajo por trade.")} />
          <MiniStat label={T("Avg hold", "Holding promedio")} value={agg.avgHoldMins != null ? `${agg.avgHoldMins.toFixed(0)} min` : "—"} help={T("Average holding time for closed trades.", "Tiempo promedio en operaciones cerradas.")} />
        </div>
      </Card>

      <Card title={T("Timing & efficiency", "Tiempo y eficiencia")}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <MiniStat label={T("Median hold", "Holding mediana")} value={agg.medianHoldMins != null ? `${agg.medianHoldMins.toFixed(0)} min` : "—"} help={T("Median holding time.", "Tiempo mediano de holding.")} />
          <MiniStat label={T("Shortest hold", "Holding mínimo")} value={agg.minHoldMins != null ? `${agg.minHoldMins.toFixed(0)} min` : "—"} help={T("Shortest holding time.", "Menor tiempo de holding.")} />
          <MiniStat label={T("Longest hold", "Holding máximo")} value={agg.maxHoldMins != null ? `${agg.maxHoldMins.toFixed(0)} min` : "—"} help={T("Longest holding time.", "Mayor tiempo de holding.")} />
          <MiniStat label={T("Avg hold (wins)", "Holding promedio (ganadas)")} value={agg.avgHoldWinMins != null ? `${agg.avgHoldWinMins.toFixed(0)} min` : "—"} help={T("Average holding time for winning trades.", "Promedio de holding en trades ganadores.")} />
          <MiniStat label={T("Avg hold (lessons)", "Holding promedio (aprendizajes)")} value={agg.avgHoldLossMins != null ? `${agg.avgHoldLossMins.toFixed(0)} min` : "—"} help={T("Average holding time for learning trades.", "Promedio de holding en trades de aprendizaje.")} />
          <MiniStat label={T("Trades / session", "Operaciones / sesión")} value={agg.tradesPerSession != null ? agg.tradesPerSession.toFixed(2) : "—"} help={T("Average number of trades per session.", "Promedio de trades por sesión.")} />
          <MiniStat label={T("Avg P&L / trade", "P&L prom. / trade")} value={agg.avgPnlPerTrade != null ? fmtUsd(agg.avgPnlPerTrade) : "—"} help={T("Average net P&L per trade.", "P&L neto promedio por trade.")} />
          <MiniStat label={T("P&L per hour", "P&L por hora")} value={agg.pnlPerHour != null ? fmtUsd(agg.pnlPerHour) : "—"} help={T("Net P&L divided by total holding hours.", "P&L neto dividido entre horas en posición.")} />
        </div>
      </Card>
    </div>
  );
}
