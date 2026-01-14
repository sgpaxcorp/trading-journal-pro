// app/balance-chart/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

import { useAuth } from "@/context/AuthContext";
import TopNav from "@/app/components/TopNav";

import { supabaseBrowser } from "@/lib/supaBaseClient";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import type { JournalEntry } from "@/lib/journalLocal";

/* =========================
   Types (DB + view)
========================= */

type DbGrowthPlanRow = {
  id: string;
  user_id: string;

  starting_balance: unknown;
  target_balance: unknown;

  daily_target_pct: unknown;
  daily_goal_percent: unknown;

  max_daily_loss_percent: unknown;
  loss_days_per_week: unknown;
  trading_days: unknown;

  selected_plan: string | null;

  created_at: string | null;
  updated_at: string | null;
};

type GrowthPlan = {
  id: string;
  userId: string;

  startingBalance: number;
  targetBalance: number;

  dailyTargetPct: number; // preferred
  dailyGoalPercent: number; // legacy/compat

  maxDailyLossPercent: number;
  lossDaysPerWeek: number;
  tradingDays: number;

  selectedPlan: string | null;

  createdAtIso: string;
  updatedAtIso: string;
};

type ChartPoint = {
  date: string; // YYYY-MM-DD
  actual: number;
  projected: number;
  dayPnl: number;
};

/* =========================
   Utils
========================= */

function toNum(x: unknown, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODateYYYYMMDD(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getDailyTargetPct(plan: GrowthPlan | null): number {
  if (!plan) return 0;
  // Prefer daily_target_pct, fallback to daily_goal_percent
  return plan.dailyTargetPct > 0 ? plan.dailyTargetPct : plan.dailyGoalPercent;
}

async function fetchLatestGrowthPlan(userId: string): Promise<GrowthPlan | null> {
  if (!userId) return null;

    // IMPORTANT:
    // Supabase's typed `select()` parser needs a string literal to infer row types.
    // Using an array + `.join(',')` turns the argument into a generic `string`, which
    // makes the inferred row type become `GenericStringError` (TS2352) in strict TS setups.
    const SELECT_GROWTH_PLAN =
      "id,user_id,starting_balance,target_balance,daily_target_pct,daily_goal_percent,max_daily_loss_percent,loss_days_per_week,trading_days,selected_plan,created_at,updated_at" as const;


  try {
    const { data, error } = await supabaseBrowser
      .from("growth_plans")
      .select(SELECT_GROWTH_PLAN)
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[BalanceChartPage] growth_plans fetch error:", error);
      return null;
    }

    const row = data?.[0] ?? undefined;
    if (!row) return null;

    const createdAtIso = row.created_at || row.updated_at || new Date().toISOString();
    const updatedAtIso = row.updated_at || row.created_at || new Date().toISOString();

    return {
      id: row.id,
      userId: row.user_id,
      startingBalance: toNum(row.starting_balance, 0),
      targetBalance: toNum(row.target_balance, 0),
      dailyTargetPct: toNum(row.daily_target_pct, 0),
      dailyGoalPercent: toNum(row.daily_goal_percent, 0),
      maxDailyLossPercent: toNum(row.max_daily_loss_percent, 0),
      lossDaysPerWeek: Math.max(0, Math.min(5, Math.floor(toNum(row.loss_days_per_week, 0)))),
      tradingDays: Math.max(0, Math.floor(toNum(row.trading_days, 0))),
      selectedPlan: row.selected_plan ?? null,
      createdAtIso,
      updatedAtIso,
    };
  } catch (err) {
    console.error("[BalanceChartPage] growth_plans fetch exception:", err);
    return null;
  }
}

/* =========================
   Page
========================= */

export default function BalanceChartPage() {
  const { user, loading } = useAuth() as any;
  const router = useRouter();

  const [plan, setPlan] = useState<GrowthPlan | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(true);

  // Protect route
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  // Load plan (Supabase) + journal entries (Supabase)
  useEffect(() => {
    if (loading || !user) return;

    const load = async () => {
      setLoadingData(true);
      try {
        const planUserId = (user as any)?.id || (user as any)?.uid || "";
        const journalUserId =
          (user as any)?.uid || (user as any)?.id || (user as any)?.email || "";

        const gp = await fetchLatestGrowthPlan(planUserId);
        setPlan(gp);

        if (!journalUserId) {
          setEntries([]);
          return;
        }

        const all = await getAllJournalEntries(journalUserId);
        setEntries(all ?? []);
      } catch (err) {
        console.error("[BalanceChartPage] error loading data:", err);
        setEntries([]);
        setPlan(null);
      } finally {
        setLoadingData(false);
      }
    };

    load();
  }, [loading, user]);

  const {
    chartData,
    tradingDays,
    currentBalance,
    projectedBalance,
    diff,
    hasData,
    planStartDate,
    currentDateStr,
    totalPnl,
  } = useMemo(() => {
    if (!plan) {
      return {
        chartData: [] as ChartPoint[],
        tradingDays: 0,
        currentBalance: 0,
        projectedBalance: 0,
        diff: 0,
        hasData: false,
        planStartDate: "",
        currentDateStr: "",
        totalPnl: 0,
      };
    }

    const starting = plan.startingBalance ?? 0;

    // Plan start date: prefer created_at, fallback to updated_at, fallback to today
    const planDateStr = String(plan.createdAtIso || new Date().toISOString()).slice(0, 10);

    const dailyTargetPct = getDailyTargetPct(plan);
    const lossDaysPerWeek = plan.lossDaysPerWeek ?? 0;
    const maxDailyLossPct = plan.maxDailyLossPercent ?? 0;
    const planTradingDays = plan.tradingDays ?? 0;

    // Journal entries from plan start
    const filtered = (entries ?? [])
      .filter((e) => e.date >= planDateStr)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (filtered.length === 0) {
      return {
        chartData: [] as ChartPoint[],
        tradingDays: 0,
        currentBalance: starting,
        projectedBalance: starting,
        diff: 0,
        hasData: false,
        planStartDate: planDateStr,
        currentDateStr: planDateStr,
        totalPnl: 0,
      };
    }

    const firstTradingDateStr = filtered[0].date;
    const lastTradingDateStr = filtered[filtered.length - 1].date;

    const firstDate = parseISODateYYYYMMDD(firstTradingDateStr);
    const lastDate = parseISODateYYYYMMDD(lastTradingDateStr);

    // Aggregate P&L by date
    const pnlByDate = new Map<string, number>();
    filtered.forEach((e) => {
      const dayPnl = toNum((e as any).pnl, 0);
      pnlByDate.set(e.date, (pnlByDate.get(e.date) ?? 0) + dayPnl);
    });

    // Build list of trading dates (Mon–Fri) between first and last
    const allTradingDates: string[] = [];
    const cursor = new Date(firstDate);

    while (cursor <= lastDate) {
      const dow = cursor.getDay(); // 0 Sun, 6 Sat
      if (dow !== 0 && dow !== 6) {
        allTradingDates.push(isoDate(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Respect the number of trading days defined in the plan
    const effectiveTradingDays =
      planTradingDays > 0
        ? Math.min(planTradingDays, allTradingDates.length)
        : allTradingDates.length;

    if (effectiveTradingDays === 0) {
      return {
        chartData: [] as ChartPoint[],
        tradingDays: 0,
        currentBalance: starting,
        projectedBalance: starting,
        diff: 0,
        hasData: false,
        planStartDate: planDateStr,
        currentDateStr: firstTradingDateStr,
        totalPnl: 0,
      };
    }

    const out: ChartPoint[] = [];
    let cumPnl = 0;
    let projBalance = starting;

    for (let i = 0; i < effectiveTradingDays; i++) {
      const dateStr = allTradingDates[i];
      const dayPnl = pnlByDate.get(dateStr) ?? 0;

      // Actual balance: starting + cumulative P&L on trading days
      cumPnl += dayPnl;
      const actualBalance = starting + cumPnl;

      // Projected balance:
      let projectedForDay = projBalance;

      if (dailyTargetPct > 0) {
        // Weekly pattern of loss days (Mon–Fri → 0..4)
        const dayInWeek = i % 5;
        const isLossDay =
          lossDaysPerWeek > 0 &&
          dayInWeek < lossDaysPerWeek &&
          maxDailyLossPct > 0;

        const pct = isLossDay ? -maxDailyLossPct : dailyTargetPct;
        const change = projBalance * (pct / 100);
        projBalance = projBalance + change;
        projectedForDay = projBalance;
      } else if ((plan.targetBalance ?? 0) > starting && effectiveTradingDays > 1) {
        // Linear interpolation from starting to target over trading days
        const target = plan.targetBalance ?? starting;
        const frac = i / (effectiveTradingDays - 1);
        projectedForDay = starting + (target - starting) * frac;
      } else {
        projectedForDay = starting;
      }

      out.push({
        date: dateStr,
        actual: actualBalance,
        projected: projectedForDay,
        dayPnl,
      });
    }

    const lastPoint = out[out.length - 1];
    const currentBalance = lastPoint.actual;
    const projectedBalance = lastPoint.projected;
    const diff = currentBalance - projectedBalance;
    const totalPnl = cumPnl;

    return {
      chartData: out,
      tradingDays: effectiveTradingDays,
      currentBalance,
      projectedBalance,
      diff,
      hasData: true,
      planStartDate: planDateStr,
      currentDateStr: lastPoint.date,
      totalPnl,
    };
  }, [plan, entries]);

  if (loading || !user || loadingData) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">Loading your balance chart...</p>
      </main>
    );
  }

  const totalPnlIsPositive = totalPnl > 0;
  const totalPnlIsZero = totalPnl === 0;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="px-6 md:px-10 py-8 max-w-5xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <h1 className="text-3xl font-semibold">Balance chart</h1>
              <p className="text-sm text-slate-400 mt-1">
                Actual account balance vs projected balance based on your growth plan (loaded from Supabase).
              </p>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              ← Back to dashboard
            </Link>
          </div>
        </header>

        {!plan && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
            We couldn&apos;t find a Growth Plan in Supabase for your account yet. Create one first so we can project
            your balance over time.
          </div>
        )}

        {plan && !hasData && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
            We haven&apos;t found any trading days in this plan yet. Log/import trades to see your balance evolution.
          </div>
        )}

        {plan && hasData && (
          <>
            {/* Chart card */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-50">
                    Account balance over time
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Trading days only (Mon–Fri), from your first trading day in this plan to your latest trading day.
                  </p>
                </div>

                <div className="text-right text-xs text-slate-400 space-y-1">
                  <div>
                    Current balance:{" "}
                    <span className="text-slate-100 font-semibold">
                      ${currentBalance.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    Projected balance:{" "}
                    <span className="text-emerald-300 font-semibold">
                      ${projectedBalance.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    Total P/L:{" "}
                    <span
                      className={`font-semibold ${
                        totalPnlIsZero
                          ? "text-slate-100"
                          : totalPnlIsPositive
                          ? "text-emerald-300"
                          : "text-sky-300"
                      }`}
                    >
                      {totalPnlIsPositive ? "+" : totalPnlIsZero ? "" : "-"}$
                      {Math.abs(totalPnl).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickFormatter={(val: string) => val.slice(5)} // MM-DD
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickFormatter={(val: number) => `$${val.toFixed(0)}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#020617",
                        border: "1px solid #1f2937",
                        borderRadius: "0.75rem",
                        fontSize: 12,
                      }}
                      formatter={(value: any, name: any) => [
                        `$${Number(value).toFixed(2)}`,
                        name,
                      ]}
                      labelFormatter={(label: string) => `Date: ${label}`}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11 }}
                      formatter={(value) => (
                        <span style={{ color: "#e5e7eb" }}>{value}</span>
                      )}
                    />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      name="Actual balance"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="projected"
                      name="Projected balance"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="4 4"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Summary */}
            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-5 text-sm text-slate-200">
              <p className="mb-2">
                Your performance over{" "}
                <span className="font-semibold">
                  {tradingDays} trading day{tradingDays !== 1 ? "s" : ""}
                </span>{" "}
                gives you a current balance of{" "}
                <span className="font-semibold">
                  ${currentBalance.toFixed(2)}
                </span>
                , while the projected balance according to your plan is{" "}
                <span className="font-semibold text-emerald-300">
                  ${projectedBalance.toFixed(2)}
                </span>
                .
              </p>

              {diff >= 0 ? (
                <p className="text-emerald-300">
                  You are on track with your plan. Keep respecting your rules, protecting your downside, and reviewing
                  your statistics to refine your technique.
                </p>
              ) : (
                <p className="text-slate-300">
                  You are currently below the projected curve, but you are still in the game. Stay aligned with your
                  rules and use your stats to find specific, controllable improvements.
                </p>
              )}
            </section>

            {/* Growth plan table */}
            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:p-5 text-xs md:text-sm text-slate-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                <div>
                  <h2 className="text-sm md:text-base font-semibold text-slate-50">
                    Growth plan schedule
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Trading days only, from your first trading day in this plan to your current trading day.
                  </p>
                </div>
                <div className="text-[11px] text-slate-400 md:text-right">
                  <div>
                    Plan created on:{" "}
                    <span className="text-slate-100 font-semibold">
                      {planStartDate}
                    </span>
                  </div>
                  <div>
                    Current date:{" "}
                    <span className="text-emerald-300 font-semibold">
                      {currentDateStr}
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-900/80">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-400 border-b border-slate-800">
                        Day #
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-400 border-b border-slate-800">
                        Date
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-slate-400 border-b border-slate-800">
                        Day P&amp;L
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-slate-400 border-b border-slate-800">
                        Actual balance
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-slate-400 border-b border-slate-800">
                        Projected balance
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-slate-400 border-b border-slate-800">
                        Diff vs projected
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((row, idx) => {
                      const isCurrent = row.date === currentDateStr;
                      const diffRow = row.actual - row.projected;
                      return (
                        <tr
                          key={row.date}
                          className={`border-b border-slate-800/70 ${
                            isCurrent ? "bg-emerald-500/10" : "bg-transparent"
                          }`}
                        >
                          <td
                            className={`px-3 py-2 ${
                              isCurrent
                                ? "font-semibold text-emerald-200"
                                : "text-slate-200"
                            }`}
                          >
                            {idx + 1}
                          </td>
                          <td
                            className={`px-3 py-2 ${
                              isCurrent
                                ? "font-semibold text-emerald-200"
                                : "text-slate-200"
                            }`}
                          >
                            {row.date}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {row.dayPnl >= 0 ? "+" : "-"}$
                            {Math.abs(row.dayPnl).toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            ${row.actual.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right text-emerald-300">
                            ${row.projected.toFixed(2)}
                          </td>
                          <td
                            className={`px-3 py-2 text-right ${
                              diffRow >= 0
                                ? "text-emerald-300"
                                : "text-sky-300"
                            }`}
                          >
                            {diffRow >= 0 ? "+" : "-"}$
                            {Math.abs(diffRow).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
