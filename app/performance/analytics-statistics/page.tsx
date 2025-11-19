"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import {
  getAllJournalEntries,
  type JournalEntry,
} from "@/lib/journalLocal";
import TopNav from "@/app/components/TopNav";

type AnalyticsGroupId =
  | "overview"
  | "day-of-week"
  | "psychology"
  | "instruments";

type DayOfWeekKey = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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
    description: "Global performance, risk discipline and probabilities.",
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
    description: "Most supportive symbols and instruments to review.",
  },
];

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

export default function AnalyticsStatisticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeGroup, setActiveGroup] =
    useState<AnalyticsGroupId>("overview");

  // Protect route
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  // Load journal entries
  useEffect(() => {
    if (loading || !user) return;
    const all = getAllJournalEntries();
    setEntries(all);
  }, [loading, user]);

  // Later you can filter this by growth-plan start date if needed
  const usedEntries = entries;

  /* =========================
     Basic stats & probabilities
  ========================= */
  const baseStats = useMemo(() => {
    const totalSessions = usedEntries.length;
    let greenSessions = 0;
    let learningSessions = 0;
    let flatSessions = 0;
    let sumPnl = 0;

    let bestDay: { date: string; pnl: number } | null = null;
    let toughestDay: { date: string; pnl: number } | null = null;

    usedEntries.forEach((e) => {
      const pnl = e.pnl ?? 0;
      sumPnl += pnl;

      if (pnl > 0) greenSessions += 1;
      else if (pnl < 0) learningSessions += 1;
      else flatSessions += 1;

      if (!bestDay || pnl > bestDay.pnl) {
        bestDay = { date: e.date, pnl };
      }
      if (!toughestDay || pnl < toughestDay.pnl) {
        toughestDay = { date: e.date, pnl };
      }
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
  }, [usedEntries]);

  const probabilityStats = useMemo(() => {
    const total = usedEntries.length;
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

    usedEntries.forEach((e) => {
      const pnl = e.pnl ?? 0;
      const isGreen = pnl > 0;
      const isLearning = pnl < 0;

      const respectedPlan = !!(e as any).respectedPlan;
      const tags = e.tags || [];
      const hasFomo = tags.includes("FOMO");
      const hasRevenge = tags.includes("Revenge trade");

      if (isGreen) baseGreen++;

      // Plan respect
      if (respectedPlan) {
        respectCount++;
        if (isGreen) respectGreen++;
        if (isLearning) respectLearning++;
      }

      // FOMO
      if (hasFomo) {
        fomoCount++;
        if (isGreen) fomoGreen++;
        if (isLearning) fomoLearning++;
      }

      // Revenge trade
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

    const pGreenFomo =
      fomoCount > 0 ? (fomoGreen / fomoCount) * 100 : 0;
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
  }, [usedEntries]);

  /* =========================
     Stop Loss / Breakeven stats
  ========================= */
  const riskStats = useMemo(() => {
    const total = usedEntries.length;
    if (total === 0) {
      return {
        total,
        plannedStopSessions: 0,
        stopTaggedSessions: 0,
        breakEvenTaggedSessions: 0,
        bothStopAndBreakEvenSessions: 0,
        noStopEvidenceSessions: 0,
        pPlannedStop: 0,
        pStopTouched: 0,
        pStopAndBE: 0,
        pNoStop: 0,
        stopTouchedGreen: 0,
        stopTouchedLearning: 0,
        pGreenWhenStopTouched: 0,
        pLearningWhenStopTouched: 0,
        breakEvenGreen: 0,
        breakEvenLearning: 0,
        pGreenWhenBE: 0,
        pLearningWhenBE: 0,
      };
    }

    let plannedStopSessions = 0;
    let stopTaggedSessions = 0;
    let breakEvenTaggedSessions = 0;
    let bothStopAndBreakEvenSessions = 0;
    let noStopEvidenceSessions = 0;

    let stopTouchedGreen = 0;
    let stopTouchedLearning = 0;

    let breakEvenGreen = 0;
    let breakEvenLearning = 0;

    usedEntries.forEach((e) => {
      const tags = e.tags || [];
      const pnl = e.pnl ?? 0;
      const isGreen = pnl > 0;
      const isLearning = pnl < 0;

      const hasPlannedStop = tags.includes("Planned stop was in place");
      const hasStopLoss = tags.includes("Stop Loss");
      const hasBreakeven = tags.includes("Breakeven");
      const hasAnyStopTag = hasPlannedStop || hasStopLoss || hasBreakeven;

      if (hasPlannedStop) plannedStopSessions++;
      if (hasStopLoss) {
        stopTaggedSessions++;
        if (isGreen) stopTouchedGreen++;
        else if (isLearning) stopTouchedLearning++;
      }
      if (hasBreakeven) {
        breakEvenTaggedSessions++;
        if (isGreen) breakEvenGreen++;
        else if (isLearning) breakEvenLearning++;
      }
      if (hasStopLoss && hasBreakeven) {
        bothStopAndBreakEvenSessions++;
      }
      if (!hasAnyStopTag) {
        noStopEvidenceSessions++;
      }
    });

    const pPlannedStop = (plannedStopSessions / total) * 100;
    const pStopTouched = (stopTaggedSessions / total) * 100;
    const pStopAndBE = (bothStopAndBreakEvenSessions / total) * 100;
    const pNoStop = (noStopEvidenceSessions / total) * 100;

    const pGreenWhenStopTouched =
      stopTaggedSessions > 0
        ? (stopTouchedGreen / stopTaggedSessions) * 100
        : 0;
    const pLearningWhenStopTouched =
      stopTaggedSessions > 0
        ? (stopTouchedLearning / stopTaggedSessions) * 100
        : 0;

    const pGreenWhenBE =
      breakEvenTaggedSessions > 0
        ? (breakEvenGreen / breakEvenTaggedSessions) * 100
        : 0;
    const pLearningWhenBE =
      breakEvenTaggedSessions > 0
        ? (breakEvenLearning / breakEvenTaggedSessions) * 100
        : 0;

    return {
      total,
      plannedStopSessions,
      stopTaggedSessions,
      breakEvenTaggedSessions,
      bothStopAndBreakEvenSessions,
      noStopEvidenceSessions,
      pPlannedStop,
      pStopTouched,
      pStopAndBE,
      pNoStop,
      stopTouchedGreen,
      stopTouchedLearning,
      pGreenWhenStopTouched,
      pLearningWhenStopTouched,
      breakEvenGreen,
      breakEvenLearning,
      pGreenWhenBE,
      pLearningWhenBE,
    };
  }, [usedEntries]);

  /* =========================
     Direction (LONG / SHORT) stats
  ========================= */
  const directionStats = useMemo(() => {
    const total = usedEntries.length;

    let longSessions = 0;
    let longGreen = 0;
    let longLearning = 0;

    let shortSessions = 0;
    let shortGreen = 0;
    let shortLearning = 0;

    usedEntries.forEach((e) => {
      const dir = (e as any).direction;
      const pnl = e.pnl ?? 0;
      const isGreen = pnl > 0;
      const isLearning = pnl < 0;

      if (dir === "long") {
        longSessions++;
        if (isGreen) longGreen++;
        else if (isLearning) longLearning++;
      } else if (dir === "short") {
        shortSessions++;
        if (isGreen) shortGreen++;
        else if (isLearning) shortLearning++;
      }
    });

    const longWinRate =
      longSessions > 0 ? (longGreen / longSessions) * 100 : 0;
    const shortWinRate =
      shortSessions > 0 ? (shortGreen / shortSessions) * 100 : 0;

    return {
      total,
      longSessions,
      longGreen,
      longLearning,
      longWinRate,
      shortSessions,
      shortGreen,
      shortLearning,
      shortWinRate,
    };
  }, [usedEntries]);

  /* =========================
     Day-of-week stats
  ========================= */
  const dayOfWeekStats = useMemo(() => {
    const base: Record<
      DayOfWeekKey,
      {
        sessions: number;
        green: number;
        learning: number;
        flat: number;
        sumPnl: number;
      }
    > = {
      0: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      1: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      2: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      3: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      4: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      5: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
      6: { sessions: 0, green: 0, learning: 0, flat: 0, sumPnl: 0 },
    };

    usedEntries.forEach((e) => {
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

    const items = (Object.keys(base) as unknown as DayOfWeekKey[]).map(
      (dow) => {
        const s = base[dow];
        const winRate =
          s.sessions > 0 ? (s.green / s.sessions) * 100 : 0;
        const avgPnl =
          s.sessions > 0 ? s.sumPnl / s.sessions : 0;
        return {
          dow,
          label: DAY_LABELS[dow],
          ...s,
          winRate,
          avgPnl,
        };
      }
    );

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
  }, [usedEntries]);

  /* =========================
     Instrument stats
  ========================= */
  const instrumentStats = useMemo(() => {
    type InstrumentAgg = {
      sessions: number;
      green: number;
      learning: number;
      sumPnl: number;
    };

    const map: Record<string, InstrumentAgg> = {};

    usedEntries.forEach((e) => {
      const raw = (e.instrument || "").trim().toUpperCase();
      if (!raw) return;

      const pnl = e.pnl ?? 0;
      const isGreen = pnl > 0;
      const isLearning = pnl < 0;

      if (!map[raw]) {
        map[raw] = { sessions: 0, green: 0, learning: 0, sumPnl: 0 };
      }

      const s = map[raw];
      s.sessions += 1;
      s.sumPnl += pnl;
      if (isGreen) s.green += 1;
      else if (isLearning) s.learning += 1;
    });

    const items = Object.entries(map).map(([symbol, s]) => {
      const winRate =
        s.sessions > 0 ? (s.green / s.sessions) * 100 : 0;
      const avgPnl =
        s.sessions > 0 ? s.sumPnl / s.sessions : 0;
      return {
        symbol,
        ...s,
        winRate,
        avgPnl,
      };
    });

    const sortedByWinRate = [...items].sort(
      (a, b) => b.winRate - a.winRate
    );
    const mostSupportive = sortedByWinRate.slice(0, 5);

    const sortedByHardest = [...items].sort(
      (a, b) => a.winRate - b.winRate
    );
    const toReview = sortedByHardest.slice(0, 5);

    return { items, mostSupportive, toReview };
  }, [usedEntries]);

  /* =========================
     Rendering helpers
  ========================= */
  if (loading || !user) {
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
                weekdays, psychology, instruments and risk discipline (Stop Loss,
                Breakeven, LONG vs SHORT). All focused on learning, not punishment.
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
                <Link
                  href="/dashboard"
                  className="text-emerald-400 underline"
                >
                  dashboard journal
                </Link>{" "}
                to unlock analytics and probabilities.
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
                            ? "bg-emerald-400 text-slate-950 border-emerald-300"
                            : "bg-slate-950 text-slate-200 border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
                        }`}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  {
                    GROUPS.find((g) => g.id === activeGroup)?.description
                  }
                </p>
              </section>

              {/* Active group content */}
              {activeGroup === "overview" && (
                <OverviewSection
                  baseStats={baseStats}
                  probabilityStats={probabilityStats}
                  riskStats={riskStats}
                  directionStats={directionStats}
                />
              )}

              {activeGroup === "day-of-week" && (
                <DayOfWeekSection stats={dayOfWeekStats} />
              )}

              {activeGroup === "psychology" && (
                <PsychologySection
                  baseStats={baseStats}
                  probabilityStats={probabilityStats}
                />
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
   Sections
========================= */

function OverviewSection({
  baseStats,
  probabilityStats,
  riskStats,
  directionStats,
}: {
  baseStats: any;
  probabilityStats: any;
  riskStats: any;
  directionStats: any;
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

  const {
    baseGreenRate,
    pGreenRespect,
    pLearningRespect,
  } = probabilityStats;

  const {
    pStopTouched,
    pStopAndBE,
    pNoStop,
    pPlannedStop,
    pGreenWhenStopTouched,
    pLearningWhenStopTouched,
    pGreenWhenBE,
    pLearningWhenBE,
  } = riskStats;

  const {
    longSessions,
    longGreen,
    longLearning,
    longWinRate,
    shortSessions,
    shortGreen,
    shortLearning,
    shortWinRate,
  } = directionStats;

  const respectEdge = pGreenRespect - baseGreenRate;

  return (
    <section className="space-y-6">
      {/* Top cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs text-slate-400 mb-1">Total sessions</p>
          <p className="text-3xl font-semibold text-slate-50">
            {totalSessions}
          </p>
          <p className="text-[11px] text-slate-500 mt-2">
            Each session is one day of trading in your journal.
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs text-emerald-300 mb-1">
            Green sessions
          </p>
          <p className="text-3xl font-semibold text-emerald-400">
            {greenSessions}
          </p>
          <p className="text-[11px] text-emerald-200 mt-1">
            Win rate: {greenRate.toFixed(1)}%
          </p>
        </div>

        <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4">
          <p className="text-xs text-sky-300 mb-1">
            Learning sessions
          </p>
          <p className="text-3xl font-semibold text-sky-300">
            {learningSessions}
          </p>
          <p className="text-[11px] text-slate-300 mt-1">
            These days are raw material for rule upgrades.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
          <p className="text-xs text-slate-400 mb-1">
            Average P&amp;L per session
          </p>
          <p
            className={`text-3xl font-semibold ${
              avgPnl >= 0 ? "text-emerald-300" : "text-sky-300"
            }`}
          >
            {avgPnl >= 0 ? "+" : "-"}$
            {Math.abs(avgPnl).toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Total P&amp;L:{" "}
            <span
              className={
                sumPnl >= 0 ? "text-emerald-300" : "text-sky-300"
              }
            >
              {sumPnl >= 0 ? "+" : "-"}$
              {Math.abs(sumPnl).toFixed(2)}
            </span>
          </p>
        </div>
      </div>

      {/* Best / toughest days */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-xs text-emerald-300 mb-1">
            Strongest day on record
          </p>
          {bestDay ? (
            <>
              <p className="text-lg font-semibold text-slate-50">
                {formatDateFriendly(bestDay.date)}
              </p>
              <p className="text-sm text-emerald-300 mt-1">
                Result: +${bestDay.pnl.toFixed(2)}
              </p>
              <p className="text-[11px] text-slate-400 mt-2">
                Use this day as a case study: what rules and conditions
                were present?
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              No sessions with P&amp;L yet.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
          <p className="text-xs text-sky-300 mb-1">
            Toughest day on record
          </p>
          {toughestDay ? (
            <>
              <p className="text-lg font-semibold text-slate-50">
                {formatDateFriendly(toughestDay.date)}
              </p>
              <p className="text-sm text-sky-300 mt-1">
                Result: -${Math.abs(toughestDay.pnl).toFixed(2)}
              </p>
              <p className="text-[11px] text-slate-200 mt-2">
                This is a high-value learning day: what early signals
                were ignored? What rule could have stopped the bleed?
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              No sessions with P&amp;L yet.
            </p>
          )}
        </div>
      </div>

      {/* Probability metrics + Risk & Direction */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-6">
        {/* Performance probabilities */}
        <div>
          <p className="text-sm font-medium text-slate-100 mb-2">
            Performance probabilities
          </p>
          <p className="text-xs text-slate-400 mb-4">
            These are not guarantees, just a mirror of how your behavior
            has translated into results so far.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                Base probability of a green session
              </p>
              <p className="text-2xl font-semibold text-emerald-300">
                {probabilityStats.baseGreenRate.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Green sessions / total sessions.
              </p>
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                Probability of green when you respect your plan
              </p>
              <p className="text-2xl font-semibold text-emerald-300">
                {probabilityStats.pGreenRespect.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Sessions where plan was respected and ended green, divided
                by all sessions where plan was respected.
              </p>
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                Probability of landing on the learning side with FOMO
              </p>
              <p className="text-2xl font-semibold text-sky-300">
                {probabilityStats.pLearningFomo.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Among sessions tagged with FOMO, how often they ended as
                learning days.
              </p>
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                Plan respect “edge”
              </p>
              <p
                className={`text-2xl font-semibold ${
                  respectEdge >= 0
                    ? "text-emerald-300"
                    : "text-sky-300"
                }`}
              >
                {respectEdge.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Difference between green rate with plan respect vs. overall
                green rate.
              </p>
            </div>
          </div>
        </div>

        {/* Risk: Stop Loss / Breakeven */}
        <div className="border-t border-slate-800 pt-4">
          <p className="text-sm font-medium text-slate-100 mb-2">
            Stop Loss &amp; Breakeven discipline (per session)
          </p>
          <p className="text-xs text-slate-400 mb-4">
            These metrics use the checklist tags:{" "}
            <span className="text-slate-200">
              “Planned stop was in place”, “Stop Loss”, “Breakeven”.
            </span>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                % sessions with planned stop in place
              </p>
              <p className="text-2xl font-semibold text-emerald-300">
                {pPlannedStop.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Sessions where you checked “Planned stop was in place”.
              </p>
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                % sessions where Stop Loss was hit
              </p>
              <p className="text-2xl font-semibold text-slate-100">
                {pStopTouched.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Sessions with the “Stop Loss” tag.
              </p>
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                % sessions with Stop Loss + Breakeven
              </p>
              <p className="text-2xl font-semibold text-emerald-300">
                {pStopAndBE.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                You marked both “Stop Loss” and “Breakeven” (you moved
                your stop and protected the trade).
              </p>
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                % sessions with no Stop Loss evidence
              </p>
              <p
                className={`text-2xl font-semibold ${
                  pNoStop > 0 ? "text-rose-300" : "text-emerald-300"
                }`}
              >
                {pNoStop.toFixed(1)}%
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                You did not check “Planned stop was in place”, “Stop Loss”
                or “Breakeven”.
              </p>
            </div>
          </div>

          {/* Conditional probabilities for Stop / BE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                When Stop Loss was hit
              </p>
              <p className="text-xs text-slate-300">
                Green:{" "}
                <span className="text-emerald-300 font-semibold">
                  {pGreenWhenStopTouched.toFixed(1)}%
                </span>{" "}
                · Learning:{" "}
                <span className="text-sky-300 font-semibold">
                  {pLearningWhenStopTouched.toFixed(1)}%
                </span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Shows whether respecting the stop still allows you to end
                the day protected vs. turning into a deep learning day.
              </p>
            </div>

            <div>
              <p className="text-[11px] text-slate-400 mb-1">
                When you tagged Breakeven
              </p>
              <p className="text-xs text-slate-300">
                Green:{" "}
                <span className="text-emerald-300 font-semibold">
                  {pGreenWhenBE.toFixed(1)}%
                </span>{" "}
                · Learning:{" "}
                <span className="text-sky-300 font-semibold">
                  {pLearningWhenBE.toFixed(1)}%
                </span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Tells you if moving your stop to BE is helping you survive
                the day or if you are getting stopped out too early.
              </p>
            </div>
          </div>
        </div>

        {/* Direction: LONG vs SHORT */}
        <div className="border-t border-slate-800 pt-4">
          <p className="text-sm font-medium text-slate-100 mb-2">
            Directional performance (LONG vs SHORT)
          </p>
          <p className="text-xs text-slate-400 mb-4">
            These metrics use the “Direction” field in your journal per
            session.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {/* LONG */}
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-xs text-emerald-300 mb-1">
                LONG sessions
              </p>
              <p className="text-sm text-slate-200 mb-1">
                Sessions marked as LONG:{" "}
                <span className="font-semibold text-emerald-200">
                  {longSessions}
                </span>
              </p>
              <p className="text-xs text-slate-300">
                Times you win in LONG:{" "}
                <span className="font-semibold text-emerald-300">
                  {longGreen}
                </span>
              </p>
              <p className="text-xs text-slate-300">
                Times you lose in LONG:{" "}
                <span className="font-semibold text-sky-300">
                  {longLearning}
                </span>
              </p>
              <p className="text-xs text-slate-300 mt-1">
                LONG win rate:{" "}
                <span className="font-semibold text-emerald-300">
                  {longWinRate.toFixed(1)}%
                </span>
              </p>
              <p className="text-[11px] text-slate-400 mt-2">
                Use this to validate whether your natural edge is mainly
                on the long side.
              </p>
            </div>

            {/* SHORT */}
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
              <p className="text-xs text-sky-300 mb-1">
                SHORT sessions
              </p>
              <p className="text-sm text-slate-200 mb-1">
                Sessions marked as SHORT:{" "}
                <span className="font-semibold text-sky-100">
                  {shortSessions}
                </span>
              </p>
              <p className="text-xs text-slate-300">
                Times you win in SHORT:{" "}
                <span className="font-semibold text-emerald-300">
                  {shortGreen}
                </span>
              </p>
              <p className="text-xs text-slate-300">
                Times you lose in SHORT:{" "}
                <span className="font-semibold text-sky-300">
                  {shortLearning}
                </span>
              </p>
              <p className="text-xs text-slate-300 mt-1">
                SHORT win rate:{" "}
                <span className="font-semibold text-sky-300">
                  {shortWinRate.toFixed(1)}%
                </span>
              </p>
              <p className="text-[11px] text-slate-200 mt-2">
                If SHORT performance is materially weaker, your system
                may be primarily bullish; you can limit shorts to only
                your A+ setups.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DayOfWeekSection({
  stats,
}: {
  stats: any;
}) {
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
                <th className="px-3 py-2 border-b border-slate-800">
                  Day
                </th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">
                  Sessions
                </th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">
                  Green
                </th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">
                  Learning
                </th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">
                  Flat
                </th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">
                  Win rate
                </th>
                <th className="px-3 py-2 border-b border-slate-800 text-right">
                  Avg P&amp;L
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i: any) => (
                <tr
                  key={i.dow}
                  className="border-t border-slate-800 bg-slate-950/60"
                >
                  <td className="px-3 py-2">{i.label}</td>
                  <td className="px-3 py-2 text-right">
                    {i.sessions}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-300">
                    {i.green}
                  </td>
                  <td className="px-3 py-2 text-right text-sky-300">
                    {i.learning}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300">
                    {i.flat}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {i.winRate.toFixed(1)}%
                  </td>
                  <td className="px-3 py-2 text-right">
                    {i.avgPnl >= 0 ? "+" : "-"}$
                    {Math.abs(i.avgPnl).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-slate-500 mt-2">
          Based on your journal date and P&amp;L for each session.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-xs text-emerald-300 mb-1">
            Most supportive day of the week
          </p>
          {best && best.sessions > 0 ? (
            <>
              <p className="text-lg font-semibold text-slate-50">
                {best.label}
              </p>
              <p className="text-sm text-emerald-300 mt-1">
                Win rate: {best.winRate.toFixed(1)}% · Sessions:{" "}
                {best.sessions}
              </p>
              <p className="text-[11px] text-slate-400 mt-2">
                Consider planning your higher-quality playbook setups on
                this day, keeping risk parameters constant.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              No weekday has enough data yet.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
          <p className="text-xs text-sky-300 mb-1">
            Day to monitor closely
          </p>
          {hardest && hardest.sessions > 0 ? (
            <>
              <p className="text-lg font-semibold text-slate-50">
                {hardest.label}
              </p>
              <p className="text-sm text-sky-300 mt-1">
                Win rate: {hardest.winRate.toFixed(1)}% · Sessions:{" "}
                {hardest.sessions}
              </p>
              <p className="text-[11px] text-slate-200 mt-2">
                You can choose to reduce risk on this day, or only trade
                your very best A+ setups.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              No weekday has enough data yet.
            </p>
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
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs text-slate-400 mb-1">
            Sessions with plan respect checked
          </p>
          <p className="text-2xl font-semibold text-emerald-300">
            {respectCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Out of {totalSessions} total sessions (
            {totalSessions > 0
              ? ((respectCount / totalSessions) * 100).toFixed(1)
              : "0"}
            %).
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs text-slate-400 mb-1">
            Sessions tagged with FOMO
          </p>
          <p className="text-2xl font-semibold text-sky-300">
            {fomoCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Based on the “FOMO” tag in your journal.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
          <p className="text-xs text-slate-400 mb-1">
            Sessions tagged as revenge trade
          </p>
          <p className="text-2xl font-semibold text-sky-300">
            {revengeCount}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Based on the “Revenge trade” tag.
          </p>
        </div>
      </div>

      {/* Plan respect vs overall */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <p className="text-sm font-medium text-slate-100 mb-2">
          Plan respect vs overall performance
        </p>
        <p className="text-xs text-slate-400 mb-4">
          How often sessions end on the green or learning side when you
          check “I respected my rules and risk plan today”.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[11px] text-slate-400 mb-1">
              Overall distribution
            </p>
            <p className="text-xs text-slate-300">
              Green sessions:{" "}
              <span className="text-emerald-300 font-semibold">
                {greenSessions}
              </span>
            </p>
            <p className="text-xs text-slate-300">
              Learning sessions:{" "}
              <span className="text-sky-300 font-semibold">
                {learningSessions}
              </span>
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">
              With plan respected
            </p>
            <p className="text-xs text-slate-300">
              Green:{" "}
              <span className="text-emerald-300 font-semibold">
                {respectGreen}
              </span>{" "}
              ({pGreenRespect.toFixed(1)}%)
            </p>
            <p className="text-xs text-slate-300">
              Learning:{" "}
              <span className="text-sky-300 font-semibold">
                {respectLearning}
              </span>{" "}
              ({pLearningRespect.toFixed(1)}%)
            </p>
          </div>

          <div>
            <p className="text-[11px] text-slate-400 mb-1">
              Interpretation
            </p>
            <p className="text-[11px] text-slate-200">
              If respecting your plan consistently leads to more green
              sessions (and fewer learning sessions), your rules are
              aligned with your edge. If not, it may be time to refine
              the playbook.
            </p>
          </div>
        </div>
      </div>

      {/* FOMO & revenge trade impact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* FOMO */}
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
          <p className="text-sm font-medium text-slate-100 mb-2">
            FOMO impact
          </p>
          {fomoCount === 0 ? (
            <p className="text-xs text-slate-300">
              You don&apos;t have any sessions tagged with FOMO yet. Use
              the “FOMO” tag when it appears so you can track its impact.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-300 mb-2">
                Sessions with FOMO:{" "}
                <span className="font-semibold text-sky-100">
                  {fomoCount}
                </span>
              </p>
              <p className="text-xs text-slate-300">
                Green with FOMO:{" "}
                <span className="text-emerald-300 font-semibold">
                  {fomoGreen}
                </span>{" "}
                ({pGreenFomo.toFixed(1)}%)
              </p>
              <p className="text-xs text-slate-300">
                Learning with FOMO:{" "}
                <span className="text-sky-300 font-semibold">
                  {fomoLearning}
                </span>{" "}
                ({pLearningFomo.toFixed(1)}%)
              </p>
              <p className="text-[11px] text-slate-200 mt-2">
                If learning days dominate when FOMO is present, that is a
                clear sign that “I only trade when the plan is there” is
                not just a mantra, it&apos;s a risk rule.
              </p>
            </>
          )}
        </div>

        {/* Revenge trade */}
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
          <p className="text-sm font-medium text-slate-100 mb-2">
            Revenge trade impact
          </p>
          {revengeCount === 0 ? (
            <p className="text-xs text-slate-300">
              No sessions are tagged as “Revenge trade” yet. When you
              notice that behavior, tag it so you can quantify its cost.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-300 mb-2">
                Sessions with revenge trade:{" "}
                <span className="font-semibold text-rose-100">
                  {revengeCount}
                </span>
              </p>
              <p className="text-xs text-slate-300">
                Green:{" "}
                <span className="text-emerald-300 font-semibold">
                  {revengeGreen}
                </span>{" "}
                ({pGreenRevenge.toFixed(1)}%)
              </p>
              <p className="text-xs text-slate-300">
                Learning:{" "}
                <span className="text-sky-300 font-semibold">
                  {revengeLearning}
                </span>{" "}
                ({pLearningRevenge.toFixed(1)}%)
              </p>
              <p className="text-[11px] text-slate-200 mt-2">
                If the probability of landing on the learning side
                explodes when revenge trades appear, your rule is simple:
                when frustration spikes, size and frequency must go to
                minimum.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function InstrumentsSection({
  stats,
}: {
  stats: any;
}) {
  const { items, mostSupportive, toReview } = stats;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <p className="text-sm font-medium text-slate-100 mb-3">
          Instrument statistics
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">
            No instruments recorded yet. Make sure you fill the “Main
            instrument” field in your journal.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm border border-slate-800 rounded-xl overflow-hidden">
              <thead className="bg-slate-900">
                <tr>
                  <th className="px-3 py-2 border-b border-slate-800">
                    Symbol
                  </th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">
                    Sessions
                  </th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">
                    Green
                  </th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">
                    Learning
                  </th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">
                    Win rate
                  </th>
                  <th className="px-3 py-2 border-b border-slate-800 text-right">
                    Avg P&amp;L
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((i: any) => (
                  <tr
                    key={i.symbol}
                    className="border-t border-slate-800 bg-slate-950/60"
                  >
                    <td className="px-3 py-2 font-mono text-xs">
                      {i.symbol}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {i.sessions}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-300">
                      {i.green}
                    </td>
                    <td className="px-3 py-2 text-right text-sky-300">
                      {i.learning}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {i.winRate.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right">
                      {i.avgPnl >= 0 ? "+" : "-"}$
                      {Math.abs(i.avgPnl).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Best / review lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-sm font-medium text-slate-100 mb-2">
            Most supportive instruments
          </p>
          {mostSupportive.length === 0 ? (
            <p className="text-xs text-slate-300">
              Not enough instrument data yet.
            </p>
          ) : (
            <ul className="space-y-1 text-xs text-slate-200">
              {mostSupportive.map((i: any) => (
                <li
                  key={i.symbol}
                  className="flex items-center justify-between"
                >
                  <span className="font-mono">{i.symbol}</span>
                  <span>
                    {i.winRate.toFixed(1)}% · {i.sessions} sessions
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-300 mt-2">
            These instruments align more often with your current edge.
          </p>
        </div>

        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
          <p className="text-sm font-medium text-slate-100 mb-2">
            Instruments to review
          </p>
          {toReview.length === 0 ? (
            <p className="text-xs text-slate-300">
              Not enough instrument data yet.
            </p>
          ) : (
            <ul className="space-y-1 text-xs text-slate-200">
              {toReview.map((i: any) => (
                <li
                  key={i.symbol}
                  className="flex items-center justify-between"
                >
                  <span className="font-mono">{i.symbol}</span>
                  <span>
                    {i.winRate.toFixed(1)}% · {i.sessions} sessions
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-200 mt-2">
            Either narrow your playbook for these symbols or consider
            reducing risk until the data improves.
          </p>
        </div>
      </div>
    </section>
  );
}
