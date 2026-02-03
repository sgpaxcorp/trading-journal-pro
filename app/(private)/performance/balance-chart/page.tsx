"use client";

// app/(private)/performance/balance-chart/page.tsx

/**
 * Balance Chart
 *
 * Shows your plan's expected equity curve (projection) vs. actual performance.
 * - Projection uses plan starting balance and daily target percentage.
 * - Actual uses realized P&L from your journal entries.
 *
 * Key requirements
 * - Always use the user's Growth Plan starting balance (Supabase: growth_plans.starting_balance)
 * - Use trading days count from the plan (growth_plans.trading_days)
 * - Use the plan creation date as the first trading day anchor.
 * - Support deposits/withdrawals as cashflows (Supabase: cashflows),
 *   and incorporate them into the ACTUAL balance (and neutralize them vs the projection).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

import { supabaseBrowser } from "@/lib/supaBaseClient";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import type { JournalEntry } from "@/lib/journalLocal";

import { listCashflows, type Cashflow } from "@/lib/cashflowsSupabase";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

/* =========================
   Helpers
========================= */

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1);
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function listTradingDaysBetween(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  if (!startIso || !endIso) return out;
  let cur = parseISODate(startIso);
  const end = parseISODate(endIso);

  // guard
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return out;

  // Ensure cur <= end
  if (cur.getTime() > end.getTime()) return out;

  while (cur.getTime() <= end.getTime()) {
    if (isWeekday(cur)) out.push(isoDate(cur));
    cur = addDays(cur, 1);
  }

  return out;
}

function toNum(x: unknown, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

function currency(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function formatDateFriendly(iso: string): string {
  if (!iso) return "";
  const d = parseISODate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function resolveUserId(user: any): string {
  // Prefer Supabase Auth UUID
  return String(user?.id || user?.uid || user?.email || "");
}

/* =========================
   Growth plan
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

  dailyTargetPct: number;
  dailyGoalPercent: number;

  maxDailyLossPercent: number;
  lossDaysPerWeek: number;
  tradingDays: number;

  selectedPlan: string | null;

  createdAtIso: string;
  updatedAtIso: string;

  // Back-compat for older code paths
  createdAt?: string | null;
  updatedAt?: string | null;
};

function mapGrowthPlanRow(row: DbGrowthPlanRow): GrowthPlan {
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
}

function dateIsoFromAny(s: any): string {
  if (!s) return "";
  const str = String(s);
  if (str.length >= 10) return str.slice(0, 10);
  return "";
}

/**
 * Balance Chart needs a stable "Plan start" anchor.
 *
 * In this project, analytics and cashflows are keyed from the plan's creation date.
 * So we prefer `createdAt`, then fall back to `updatedAt`, then today.
 */
function planStartIsoFromPlan(plan: GrowthPlan | null | undefined): string {
  const created = dateIsoFromAny(plan?.createdAtIso ?? plan?.createdAt);
  const updated = dateIsoFromAny(plan?.updatedAtIso ?? plan?.updatedAt);
  return created || updated || isoDate(new Date());
}

function dailyTargetPct(plan: GrowthPlan | null): number {
  if (!plan) return 0;
  return plan.dailyTargetPct > 0 ? plan.dailyTargetPct : plan.dailyGoalPercent;
}

/* =========================
   Cashflows
========================= */

function cashflowNet(cf: any): number {
  const t = String(cf?.type ?? cf?.cashflow_type ?? "").toLowerCase().trim();
  const amt = toNum(cf?.amount_usd ?? cf?.amountUsd ?? cf?.amount ?? 0, 0);
  if (!Number.isFinite(amt) || amt === 0) return 0;
  if (t === "withdrawal") return -Math.abs(amt);
  return Math.abs(amt);
}

/* =========================
   Journal session PnL
========================= */

function sessionPnlUsd(e: any): number {
  // Try to be compatible with different journal schemas.
  // Prefer already-net PnL if present; otherwise fall back.
  const net = toNum((e as any)?.pnlNet, NaN);
  if (Number.isFinite(net)) return net;

  const pnl = toNum((e as any)?.pnl, NaN);
  if (Number.isFinite(pnl)) return pnl;

  const realized = toNum((e as any)?.realized, NaN);
  if (Number.isFinite(realized)) return realized;

  const realizedUsd = toNum((e as any)?.realized_usd, NaN);
  if (Number.isFinite(realizedUsd)) return realizedUsd;

  return 0;
}

/* =========================
   Page
========================= */

export default function BalanceChartPage() {
  const { user, loading } = useAuth() as any;
  const userId = useMemo(() => resolveUserId(user), [user]);

  const [plan, setPlan] = useState<GrowthPlan | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  /* -------- Load plan, journal, cashflows -------- */
  useEffect(() => {
    let alive = true;

    async function loadAll() {
      if (loading || !userId) return;
      setLoadingData(true);

      try {
        // Growth plan
        const SELECT_GROWTH_PLAN =
          "id,user_id,starting_balance,target_balance,daily_target_pct,daily_goal_percent,max_daily_loss_percent,loss_days_per_week,trading_days,selected_plan,created_at,updated_at" as const;

        const { data, error } = await supabaseBrowser
          .from("growth_plans")
          .select(SELECT_GROWTH_PLAN)
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        if (!alive) return;

        if (error) {
          console.error("[BalanceChart] growth_plans fetch error:", error);
          setPlan(null);
        } else {
          const row = (data as any)?.[0] as DbGrowthPlanRow | undefined;
          setPlan(row ? mapGrowthPlanRow(row) : null);
        }

        // Journal entries
        try {
          const all = await getAllJournalEntries(userId);
          if (!alive) return;
          setEntries((all ?? []) as any);
        } catch (err) {
          console.error("[BalanceChart] getAllJournalEntries error:", err);
          if (!alive) return;
          setEntries([]);
        }

        // Cashflows
        try {
          // We'll set a conservative fromDate after we know the plan
          // (we'll re-load below once planStartIso is available).
          setCashflows([]);
        } catch {
          setCashflows([]);
        }
      } finally {
        if (alive) setLoadingData(false);
      }
    }

    loadAll();
    return () => {
      alive = false;
    };
  }, [loading, userId]);

  // Load cashflows once plan is known (so we use a stable plan start anchor)
  useEffect(() => {
    let alive = true;

    async function loadCashflows() {
      if (loading || !userId) return;
      const planStartIso = planStartIsoFromPlan(plan);

      try {
        const cf = await listCashflows(userId, { fromDate: planStartIso, throwOnError: false });
        if (!alive) return;
        setCashflows(cf ?? []);
      } catch (err) {
        console.error("[BalanceChart] listCashflows error:", err);
        if (!alive) return;
        setCashflows([]);
      }
    }

    loadCashflows();
    return () => {
      alive = false;
    };
  }, [loading, userId, plan]);

  /* -------- Compute chart data -------- */
  const computed = useMemo(() => {
    const planStartIso = planStartIsoFromPlan(plan);
    const start = plan?.startingBalance ?? 0;

    // PnL by date
    const pnlByDate: Record<string, number> = {};
    let lastSessionIso = "";

    for (const e of entries ?? []) {
      const d = String((e as any)?.date ?? "").slice(0, 10);
      if (!d) continue;
      const pnl = sessionPnlUsd(e);
      pnlByDate[d] = (pnlByDate[d] ?? 0) + pnl;
      if (!lastSessionIso || d > lastSessionIso) lastSessionIso = d;
    }

    // Cashflows by date (net)
    const cashByDate: Record<string, number> = {};
    let lastCashIso = "";

    for (const cf of cashflows ?? []) {
      const d = String((cf as any)?.date ?? (cf as any)?.created_at ?? "").slice(0, 10);
      if (!d) continue;
      const net = cashflowNet(cf);
      cashByDate[d] = (cashByDate[d] ?? 0) + net;
      if (!lastCashIso || d > lastCashIso) lastCashIso = d;
    }

    const todayIso = isoDate(new Date());

    // Range end: whichever is latest between today, last journal day, last cashflow day
    const rangeEndIso = [todayIso, lastSessionIso, lastCashIso].filter(Boolean).sort().pop() || todayIso;

    // Build trading-day schedule (Mon–Fri)
    const allTradingDates = listTradingDaysBetween(planStartIso, rangeEndIso);

    // Respect plan.tradingDays if set, but do not lose cashflows that occur after the last trading day
    const effectiveTradingDays = plan?.tradingDays && plan.tradingDays > 0
      ? Math.min(allTradingDates.length, plan.tradingDays)
      : allTradingDates.length;

    const tradingDates = allTradingDates.slice(0, effectiveTradingDays);

    // Prepare cash events sorted
    const cashEvents = Object.entries(cashByDate)
      .map(([date, net]) => ({ date, net }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let cashIdx = 0;
    let cumCash = 0;

    let cumPnl = 0;
    let projBalance = start;

    const pct = dailyTargetPct(plan);
    const lossDaysPerWeek = plan?.lossDaysPerWeek ?? 0;

    const out: Array<{ date: string; actual: number; projected: number; dayPnl: number }> = [];

    // Iterate trading days
    for (let i = 0; i < tradingDates.length; i++) {
      const dateStr = tradingDates[i];

      // Apply any cashflows up to this date
      let cashDelta = 0;
      while (cashIdx < cashEvents.length && cashEvents[cashIdx].date <= dateStr) {
        cashDelta += cashEvents[cashIdx].net;
        cashIdx++;
      }
      if (cashDelta !== 0) {
        cumCash += cashDelta;
        projBalance += cashDelta; // neutralize cashflows in projection by applying them equally
      }

      const dayPnl = pnlByDate[dateStr] ?? 0;
      cumPnl += dayPnl;

      // Actual balance = start + cumulative pnl + cumulative cashflows
      const actualBalance = start + cumPnl + cumCash;

      // Projected balance: apply daily target (and allow loss days)
      let projectedBalance = projBalance;
      if (pct > 0) {
        const isLossDay = lossDaysPerWeek > 0 && (i % 5) < lossDaysPerWeek;
        const r = pct / 100;
        projectedBalance = projectedBalance * (1 + (isLossDay ? -r : r));
      }
      projBalance = projectedBalance;

      out.push({
        date: dateStr,
        actual: Number(actualBalance.toFixed(2)),
        projected: Number(projectedBalance.toFixed(2)),
        dayPnl: Number(dayPnl.toFixed(2)),
      });
    }

    // Apply remaining cashflows that happened AFTER the last trading day (e.g., weekend deposits)
    let cashDeltaAfterLastTrade = 0;
    while (cashIdx < cashEvents.length) {
      cashDeltaAfterLastTrade += cashEvents[cashIdx].net;
      cashIdx++;
    }

    if (cashDeltaAfterLastTrade !== 0) {
      cumCash += cashDeltaAfterLastTrade;
      projBalance += cashDeltaAfterLastTrade; // keep projection neutral to cashflows
    }

    // Decide what we show as "current" point:
    // - Normally the last trading day.
    // - If there's a cashflow after the last trading day, add an "as-of" point on rangeEndIso.
    const lastPoint = out[out.length - 1] || {
      date: planStartIso,
      actual: start,
      projected: start,
      dayPnl: 0,
    };

    let currentPoint = lastPoint;
    if (cashDeltaAfterLastTrade !== 0 && rangeEndIso && rangeEndIso !== lastPoint.date) {
      const actualAsOf = start + cumPnl + cumCash;
      const projectedAsOf = projBalance;
      const asOfPoint = {
        date: rangeEndIso,
        actual: Number(actualAsOf.toFixed(2)),
        projected: Number(projectedAsOf.toFixed(2)),
        dayPnl: 0,
      };
      out.push(asOfPoint);
      currentPoint = asOfPoint;
    }

    const currentBalance = currentPoint.actual;
    const projectedBalance = currentPoint.projected;

    const diff = currentBalance - projectedBalance;
    const diffPct = projectedBalance !== 0 ? (diff / projectedBalance) * 100 : 0;

    const totalTradingPnl = cumPnl;
    const totalCashflowNet = cumCash;

    return {
      planStartDate: planStartIso,
      currentDateStr: currentPoint.date,
      tradingDays: tradingDates.length,

      chartData: out,

      currentBalance,
      projectedBalance,
      diff,
      diffPct,

      totalTradingPnl,
      totalCashflowNet,

      pct,
    };
  }, [plan, entries, cashflows]);

  /* =========================
     Render
  ========================= */

  if (loading || loadingData) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading balance chart…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Balance Chart</h1>
            <p className="text-sm text-slate-400 mt-1">
              Actual account equity vs your growth-plan projection. Cashflows (deposits/withdrawals) are applied to both lines so trading performance stays comparable.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Trading days are Mon–Fri. If a cashflow happens on a weekend, we add an “as-of” point for the latest cashflow date.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/plan"
              className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              Cashflows →
            </Link>
            <Link
              href="/analytics-statistics"
              className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              Analytics →
            </Link>
          </div>
        </header>

        {!plan ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300">
            No Growth Plan found yet (table: <span className="text-slate-100 font-semibold">growth_plans</span>). Create one in{" "}
            <Link className="text-emerald-300 hover:text-emerald-200 underline" href="/growth-plan">
              Growth Plan Wizard
            </Link>
            .
          </div>
        ) : (
          <>
            {/* KPI row */}
            <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">Starting balance</div>
                <div className="mt-1 text-2xl font-semibold">{currency(plan.startingBalance)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  Plan start: <span className="text-slate-200">{computed.planStartDate}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">Current balance</div>
                <div className="mt-1 text-2xl font-semibold">{currency(computed.currentBalance)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  As of: <span className="text-slate-200">{computed.currentDateStr}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">Projected balance</div>
                <div className="mt-1 text-2xl font-semibold">{currency(computed.projectedBalance)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  Daily target: <span className="text-slate-200">{computed.pct.toFixed(3)}%</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">Vs projection</div>
                <div className="mt-1 text-2xl font-semibold">
                  <span className={computed.diff >= 0 ? "text-emerald-300" : "text-sky-300"}>
                    {computed.diff >= 0 ? "+" : "-"}{currency(Math.abs(computed.diff))}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {computed.diffPct >= 0 ? "+" : "-"}{Math.abs(computed.diffPct).toFixed(2)}%
                </div>
              </div>
            </section>

            {/* Chart */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold">Equity curve</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Trading days only (Mon–Fri). Cashflows are applied to both lines; weekend cashflows appear as an “as-of” point.
                  </p>
                </div>
                <div className="text-xs text-slate-400">
                  Trading P&amp;L: <span className={computed.totalTradingPnl >= 0 ? "text-emerald-300 font-semibold" : "text-sky-300 font-semibold"}>
                    {computed.totalTradingPnl >= 0 ? "+" : "-"}{currency(Math.abs(computed.totalTradingPnl))}
                  </span>
                  <span className="mx-2 text-slate-700">|</span>
                  Net cashflow: <span className={computed.totalCashflowNet >= 0 ? "text-emerald-300 font-semibold" : "text-sky-300 font-semibold"}>
                    {computed.totalCashflowNet >= 0 ? "+" : "-"}{currency(Math.abs(computed.totalCashflowNet))}
                  </span>
                </div>
              </div>

              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={computed.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={formatDateFriendly} />
                    <YAxis tickFormatter={(v) => currency(Number(v))} />
                    <Tooltip
                      formatter={(value: any) => currency(Number(value))}
                      labelFormatter={(label) => `Date: ${label}`}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="projected" name="Projected" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="actual" name="Actual" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Schedule table */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-semibold">Schedule</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    From your plan start to your latest trading day (plus an as-of point if a weekend cashflow occurred).
                  </p>
                </div>

                <div className="text-xs text-slate-400">
                  Trading days shown: <span className="text-slate-200 font-semibold">{computed.tradingDays}</span>
                </div>
              </div>

              <div className="overflow-auto rounded-xl border border-slate-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-950/60 text-slate-400">
                    <tr>
                      <th className="text-left px-4 py-2">#</th>
                      <th className="text-left px-4 py-2">Date</th>
                      <th className="text-right px-4 py-2">Day P&amp;L</th>
                      <th className="text-right px-4 py-2">Actual</th>
                      <th className="text-right px-4 py-2">Projected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computed.chartData.map((r, idx) => {
                      const isCurrent = r.date === computed.currentDateStr;
                      return (
                        <tr key={r.date} className={isCurrent ? "bg-emerald-500/10" : ""}>
                          <td className="px-4 py-2 text-slate-500">{idx + 1}</td>
                          <td className="px-4 py-2 text-slate-200">{r.date}</td>
                          <td className={"px-4 py-2 text-right " + (r.dayPnl >= 0 ? "text-emerald-300" : "text-sky-300")}>
                            {r.dayPnl >= 0 ? "+" : "-"}{currency(Math.abs(r.dayPnl))}
                          </td>
                          <td className="px-4 py-2 text-right text-slate-100 font-semibold">{currency(r.actual)}</td>
                          <td className="px-4 py-2 text-right text-slate-300">{currency(r.projected)}</td>
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
