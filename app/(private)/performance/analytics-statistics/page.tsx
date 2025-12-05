// app/analytics-statistics/page.tsx
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

// 👇 Los datos ahora vienen de Supabase
import { getAllJournalEntries } from "@/lib/journalSupabase";

/* =========================
   Types
========================= */

type AnalyticsGroupId =
  | "overview"
  | "day-of-week"
  | "psychology"
  | "instruments";

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
};

type ExitTradeRow = EntryTradeRow;

type SessionWithTrades = JournalEntry & {
  entries: EntryTradeRow[];
  exits: ExitTradeRow[];
  uniqueSymbols: string[]; // unique from entries+exits
  uniqueKinds: InstrumentType[]; // unique kinds traded
  perSymbolPnL: Record<string, number>; // symbol -> pnl within session
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
  {
    id: "overview",
    label: "Overview",
    description: "Global performance and probability metrics.",
  },
  {
    id: "day-of-week",
    label: "Day of week",
    description: "How weekdays affect your results.",
  },
  {
    id: "psychology",
    label: "Psychology & Rules",
    description: "FOMO, plan respect and learning patterns.",
  },
  {
    id: "instruments",
    label: "Instruments",
    description: "Ticker + instrument-type edge and probabilities.",
  },
];

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
  // Ajusta "other" si tu union real es distinta (por ejemplo "stock")
  return (k || "other") as InstrumentType;
}

function normalizeSide(s: any): SideType {
  return (s === "short" ? "short" : "long") as SideType;
}

/* ---- Parse trades stored in notes JSON ---- */
function parseNotesTrades(notesRaw: unknown): {
  entries: EntryTradeRow[];
  exits: ExitTradeRow[];
} {
  if (typeof notesRaw !== "string") return { entries: [], exits: [] };
  try {
    const parsed = JSON.parse(notesRaw);
    if (!parsed || typeof parsed !== "object") return { entries: [], exits: [] };

    const entries =
      Array.isArray((parsed as any).entries) ? (parsed as any).entries : [];
    const exits =
      Array.isArray((parsed as any).exits) ? (parsed as any).exits : [];

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

  const underlying = m[1]; // SPX / SPXW
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
    const expiryUTC = Date.UTC(
      expiry.getFullYear(),
      expiry.getMonth(),
      expiry.getDate()
    );
    const msPerDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.round((expiryUTC - entryUTC) / msPerDay);
    if (diffDays === 0) return 0;
    return diffDays >= 0 ? diffDays : null;
  } catch {
    return null;
  }
}

/* ---- Compute PnL per symbol inside one session ---- */
function computePnLBySymbol(
  entries: EntryTradeRow[],
  exits: ExitTradeRow[]
): Record<string, number> {
  const key = (s: string, k: InstrumentType, side: SideType) =>
    `${s}|${k}|${side}`;

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
   Page
========================= */

export default function AnalyticsStatisticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeGroup, setActiveGroup] =
    useState<AnalyticsGroupId>("overview");
  const [loadingData, setLoadingData] = useState<boolean>(true);

  /* Protect route */
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  /* Load journal entries from Supabase */
  useEffect(() => {
    if (loading || !user) return;

    const load = async () => {
      try {
        setLoadingData(true);

        const userId =
          (user as any)?.uid || (user as any)?.id || (user as any)?.email || "";

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

  const usedEntries = entries;

  /* =========================
     Normalize sessions with trades
  ========================= */
  const sessions: SessionWithTrades[] = useMemo(() => {
    return usedEntries.map((s) => {
      const { entries: entRaw, exits: exRaw } = parseNotesTrades(s.notes);

      const ent2: EntryTradeRow[] = (entRaw || []).map((t: any) => {
        const kind = normalizeKind(t.kind);
        const side = normalizeSide(t.side);
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
            };
          }
        }
        return { ...t, kind, side };
      });

      const ex2: ExitTradeRow[] = (exRaw || []).map((t: any) => {
        const kind = normalizeKind(t.kind);
        const side = normalizeSide(t.side);
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
            };
          }
        }
        return { ...t, kind, side };
      });

      const uniqueSymbolsSet = new Set<string>();
      for (const t of ent2) uniqueSymbolsSet.add(safeUpper(t.symbol));
      for (const t of ex2) uniqueSymbolsSet.add(safeUpper(t.symbol));
      uniqueSymbolsSet.delete("");

      const uniqueKindsSet = new Set<InstrumentType>();
      for (const t of ent2) uniqueKindsSet.add(normalizeKind(t.kind));
      for (const t of ex2) uniqueKindsSet.add(normalizeKind(t.kind));

      const perSymbolPnL = computePnLBySymbol(ent2, ex2);

      return {
        ...s,
        entries: ent2,
        exits: ex2,
        uniqueSymbols: Array.from(uniqueSymbolsSet),
        uniqueKinds: Array.from(uniqueKindsSet),
        perSymbolPnL,
      };
    });
  }, [usedEntries]);

  /* =========================
     Basic stats & probabilities
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
      if (!toughestDay || pnl < toughestDay.pnl)
        toughestDay = { date: e.date, pnl };
    });

    const greenRate =
      totalSessions > 0 ? (greenSessions / totalSessions) * 100 : 0;
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
      const hasRevenge =
        tagsUpper.includes("REVENGE TRADE");

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

    const pGreenRespect =
      respectCount > 0 ? (respectGreen / respectCount) * 100 : 0;
    const pLearningRespect =
      respectCount > 0 ? (respectLearning / respectCount) * 100 : 0;

    const pGreenFomo = fomoCount > 0 ? (fomoGreen / fomoCount) * 100 : 0;
    const pLearningFomo =
      fomoCount > 0 ? (fomoLearning / fomoCount) * 100 : 0;

    const pGreenRevenge =
      revengeCount > 0 ? (revengeGreen / revengeCount) * 100 : 0;
    const pLearningRevenge =
      revengeCount > 0 ? (revengeLearning / revengeCount) * 100 : 0;

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
     Day-of-week stats
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
    const best =
      withSessions.length > 0
        ? [...withSessions].sort((a, b) => b.winRate - a.winRate)[0]
        : null;
    const hardest =
      withSessions.length > 0
        ? [...withSessions].sort((a, b) => a.winRate - b.winRate)[0]
        : null;

    return { items, best, hardest };
  }, [sessions]);

  /* =========================
     Instruments / Ticker stats
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

    const tickerMap: Record<string, {
      symbol: string;
      sessions: number;
      green: number;
      learning: number;
      flat: number;
      tradesClosed: number;
      netPnl: number;
      grossProfit: number;
      grossLoss: number;
      byDow: Record<DayOfWeekKey, { sessions: number; green: number; sumPnl: number }>;
    }> = {};

    const kindMap: Record<string, {
      kind: InstrumentType;
      sessions: number;
      green: number;
      learning: number;
      flat: number;
      sumPnl: number;
    }> = {};

    sessions.forEach((s) => {
      const pnl = s.pnl ?? 0;
      const isGreen = pnl > 0;
      const isLearning = pnl < 0;
      const isFlat = pnl === 0;

      const d = new Date(s.date + "T00:00:00");
      const dow = Number.isNaN(d.getTime()) ? null : (d.getDay() as DayOfWeekKey);

      const symbolsHere = s.uniqueSymbols;

      for (const sym of symbolsHere) {
        tickerMap[sym] ||= {
          symbol: sym,
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
        kindMap[key] ||= {
          kind: key,
          sessions: 0,
          green: 0,
          learning: 0,
          flat: 0,
          sumPnl: 0,
        };
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

      const bestDow =
        dowItems.length
          ? [...dowItems].sort((a, b) => b.winRate - a.winRate)[0].dow
          : null;
      const worstDow =
        dowItems.length
          ? [...dowItems].sort((a, b) => a.winRate - b.winRate)[0].dow
          : null;

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
      };
    });

    const kinds: KindAgg[] = Object.values(kindMap).map((k) => {
      const winRate = k.sessions > 0 ? (k.green / k.sessions) * 100 : 0;
      const avgPnlPerSession = k.sessions > 0 ? k.sumPnl / k.sessions : 0;
      return { ...k, winRate, avgPnlPerSession };
    });

    const byWinRate = [...tickers].sort((a, b) => b.winRate - a.winRate);
    const byNetPnl = [...tickers].sort((a, b) => b.netPnl - a.netPnl);
    const byLoss = [...tickers].sort((a, b) => a.netPnl - b.netPnl);

    return {
      tickers,
      kinds,
      mostSupportive: byWinRate.slice(0, 7),
      topEarners: byNetPnl.slice(0, 7),
      toReview: byLoss.slice(0, 7),
      kindByEdge: [...kinds].sort((a, b) => b.winRate - a.winRate),
    };
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
                weekdays, psychology and instruments. Futuristic, clean, edge-focused.
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
                <span className="text-emerald-300 font-semibold">
                  {baseStats.totalSessions}
                </span>
              </p>
            </div>
          </header>

          {baseStats.totalSessions === 0 ? (
            <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-6">
              <p className="text-slate-200 text-sm font-medium mb-1">
                No data yet
              </p>
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
                <OverviewSection baseStats={baseStats} probabilityStats={probabilityStats} />
              )}

              {activeGroup === "day-of-week" && (
                <DayOfWeekSection stats={dayOfWeekStats} />
              )}

              {activeGroup === "psychology" && (
                <PsychologySection baseStats={baseStats} probabilityStats={probabilityStats} />
              )}

              {activeGroup === "instruments" && (
                <InstrumentsSection stats={instrumentStats} />
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
      <p className={`text-xs mb-1 ${good ? "text-emerald-200" : "text-sky-200"}`}>
        {label}
      </p>
      <p className={`text-3xl font-semibold ${good ? "text-emerald-300" : "text-sky-300"}`}>
        {value}
      </p>
      {sub && <div className="text-[11px] text-slate-400 mt-2">{sub}</div>}
    </div>
  );
}

/* =========================
   Sections
========================= */

function OverviewSection({
  baseStats,
  probabilityStats,
}: {
  baseStats: any;
  probabilityStats: any;
}) {
  const {
    totalSessions,
    greenSessions,
    learningSessions,
    flatSessions,
    greenRate,
    avgPnl,
    sumPnl,
    bestDay,
    toughestDay,
  } = baseStats;

  const respectEdge =
    probabilityStats.pGreenRespect - probabilityStats.baseGreenRate;

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total sessions"
          value={totalSessions}
          sub="Each session is one day of trading in your journal."
          good
        />
        <StatCard
          label="Green sessions"
          value={greenSessions}
          sub={`Win rate: ${greenRate.toFixed(1)}%`}
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
              Total P&L:{" "}
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
              <p className="text-lg font-semibold text-slate-50">
                {formatDateFriendly(bestDay.date)}
              </p>
              <p className="text-sm text-emerald-300 mt-1">
                Result: +${bestDay.pnl.toFixed(2)}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">No sessions with P&L yet.</p>
          )}
        </div>

        <div className={`${futuristicCardClass(false)} p-4`}>
          <p className="text-xs text-sky-200 mb-1">Toughest day</p>
          {toughestDay ? (
            <>
              <p className="text-lg font-semibold text-slate-50">
                {formatDateFriendly(toughestDay.date)}
              </p>
              <p className="text-sm text-sky-300 mt-1">
                Result: -${Math.abs(toughestDay.pnl).toFixed(2)}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">No sessions with P&L yet.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-[0_0_30px_rgba(15,23,42,0.8)]">
        <p className="text-sm font-medium text-slate-100 mb-2">
          Performance probabilities
        </p>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-[11px] text-slate-400 mb-1">
              Base probability of green
            </p>
            <p className="text-2xl font-semibold text-emerald-300">
              {probabilityStats.baseGreenRate.toFixed(1)}%
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">
              Green when plan respected
            </p>
            <p className="text-2xl font-semibold text-emerald-300">
              {probabilityStats.pGreenRespect.toFixed(1)}%
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">
              Learning with FOMO
            </p>
            <p className="text-2xl font-semibold text-sky-300">
              {probabilityStats.pLearningFomo.toFixed(1)}%
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Plan edge</p>
            <p className={`text-2xl font-semibold ${respectEdge >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
              {respectEdge.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function DayOfWeekSection({ stats }: { stats: any }) {
  const { items, best, hardest } = stats;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-sm font-medium text-slate-100 mb-3">
          Day-of-week behavior
        </p>
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
                <th className="px-3 py-2 border-b border-slate-800 text-right">Avg P&L</th>
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
              <p className="text-sm text-emerald-300 mt-1">
                Win rate: {best.winRate.toFixed(1)}% · Sessions: {best.sessions}
              </p>
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
              <p className="text-sm text-sky-300 mt-1">
                Win rate: {hardest.winRate.toFixed(1)}% · Sessions: {hardest.sessions}
              </p>
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
}: {
  baseStats: any;
  probabilityStats: any;
}) {
  const {
    totalSessions,
    greenSessions,
    learningSessions,
  } = baseStats;

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

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Sessions with plan respect"
          value={respectCount}
          sub={
            <>
              Out of {totalSessions} sessions (
              {totalSessions > 0
                ? ((respectCount / totalSessions) * 100).toFixed(1)
                : "0"}
              %).
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

      <div className={`${futuristicCardClass(true)} p-4`}>
        <p className="text-sm font-medium text-slate-100 mb-2">
          Plan respect vs overall performance
        </p>

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
              Green: <span className="text-emerald-300 font-semibold">{respectGreen}</span>{" "}
              ({pGreenRespect.toFixed(1)}%)
            </p>
            <p className="text-xs text-slate-300">
              Learning: <span className="text-sky-300 font-semibold">{respectLearning}</span>{" "}
              ({pLearningRespect.toFixed(1)}%)
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">Interpretation</p>
            <p className="text-[11px] text-slate-200">
              If plan-respect rises your green probability, your rules are aligned with your edge.
              If not, upgrade the playbook.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function InstrumentsSection({ stats }: { stats: any }) {
  const { tickers, kindByEdge, mostSupportive, topEarners, toReview } = stats;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-sm font-medium text-slate-100 mb-3">
          Probability by instrument type
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs md:text-sm border border-slate-800 rounded-xl overflow-hidden">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-3 py-2 border-b border-slate-800">Type</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Sessions</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Green</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Learning</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Win rate</th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">Avg P&L</th>
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
        <p className="text-[11px] text-slate-500 mt-2">
          Based on unique instrument types traded each session.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-sm font-medium text-slate-100 mb-3">
          Ticker statistics (from Entries + Exits)
        </p>

        {tickers.length === 0 ? (
          <p className="text-sm text-slate-400">
            No tickers recorded yet. Add trades in Entries/Exits.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm border border-slate-800 rounded-xl overflow-hidden">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 border-b border-slate-800">Symbol</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Sessions</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Closed trades</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Win rate</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Net P&L</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Avg/session</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Best DOW</th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">Worst DOW</th>
                </tr>
              </thead>
              <tbody>
                {tickers.map((t: any) => (
                  <tr key={t.symbol} className="border-t border-slate-800 bg-slate-950/60">
                    <td className="px-3 py-2 font-mono">{t.symbol}</td>
                    <td className="px-3 py-2 text-right">{t.sessions}</td>
                    <td className="px-3 py-2 text-right">{t.tradesClosed}</td>
                    <td className="px-3 py-2 text-right">{t.winRate.toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right ${t.netPnl >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                      {t.netPnl >= 0 ? "+" : "-"}${Math.abs(t.netPnl).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.avgPnlPerSession >= 0 ? "+" : "-"}${Math.abs(t.avgPnlPerSession).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {getDayLabel(t.bestDow)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {getDayLabel(t.worstDow)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`${futuristicCardClass(true)} p-4`}>
          <p className="text-sm font-medium text-slate-100 mb-2">
            Most supportive tickers (win-rate)
          </p>
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
          <p className="text-sm font-medium text-slate-100 mb-2">
            Top earners (net P&L)
          </p>
          <ul className="space-y-1 text-xs text-slate-200">
            {topEarners.map((i: any) => (
              <li key={i.symbol} className="flex items-center justify-between">
                <span className="font-mono">{i.symbol}</span>
                <span className="text-emerald-300">
                  +${i.netPnl.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`${futuristicCardClass(false)} p-4`}>
          <p className="text-sm font-medium text-slate-100 mb-2">
            Tickers to review
          </p>
          <ul className="space-y-1 text-xs text-slate-200">
            {toReview.map((i: any) => (
              <li key={i.symbol} className="flex items-center justify-between">
                <span className="font-mono">{i.symbol}</span>
                <span className="text-sky-300">
                  -${Math.abs(i.netPnl).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
