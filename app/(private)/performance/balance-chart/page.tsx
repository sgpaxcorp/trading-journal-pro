// app/(private)/performance/balance-chart/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

import type { JournalEntry } from "@/lib/journalLocal";
import { getAllJournalEntries } from "@/lib/journalSupabase";

import { supabaseBrowser } from "@/lib/supaBaseClient";
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

/* =========================================================
   Types
========================================================= */

type DbGrowthPlanRow = {
  id: string;
  user_id: string;
  starting_balance: any;
  target_balance: any;

  // Some schemas include both; we’ll accept either.
  daily_target_pct?: any;
  daily_goal_percent?: any;

  max_daily_loss_percent?: any;

  trading_days?: any;
  max_one_percent_loss_days?: any;
  loss_days_per_week?: any;

  max_risk_per_trade_usd?: any;

  steps?: any;
  rules?: any;
  selected_plan?: string | null;
  version?: number | null;

  created_at?: string | null;
  updated_at?: string | null;
};

type GrowthPlan = {
  id: string;
  userId: string;

  startingBalance: number;
  targetBalance: number;

  dailyTargetPct: number;
  maxDailyLossPct: number;

  tradingDays: number;
  maxOnePercentLossDays: number;
  lossDaysPerWeek: number;

  maxRiskPerTradeUsd: number | null;

  steps?: any;
  rules?: any;
  selectedPlan?: string | null;
  version?: number | null;

  createdAt?: string | null;
  updatedAt?: string | null;
};

type ChartPoint = {
  date: string; // YYYY-MM-DD
  actual: number;
  projected: number;
  dayPnl: number;
};

/* =========================================================
   Helpers
========================================================= */

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function safeUpper(s: string) {
  return (s || "").trim().toUpperCase();
}

function fmtMoney(x: number) {
  const sign = x >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(x).toFixed(2)}`;
}

function fmtMoneyAbs(x: number) {
  return `$${Math.abs(x).toFixed(2)}`;
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

function isWeekday(d: Date) {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  return day >= 1 && day <= 5;
}

function listTradingDaysBetween(startIso: string, endIso: string): string[] {
  if (!startIso || !endIso) return [];
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const out: string[] = [];
  const cur = new Date(start);

  // Ensure ascending
  if (cur > end) return [];

  while (cur <= end) {
    if (isWeekday(cur)) out.push(isoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function dateIsoFromAny(x: any): string | null {
  if (!x) return null;
  const s = String(x);
  if (!s) return null;
  // already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s.slice(0, 10))) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return isoDate(d);
  return null;
}

/**
 * Balance Chart needs a stable "Plan start" anchor.
 * - `created_at` never changes (even if you overwrite the plan with upsert)
 * - `updated_at` represents the last "Approve & Save" moment (the effective plan start)
 *
 * We therefore prefer `updatedAt`, then fall back to `createdAt`, then today.
 */
function planStartIsoFromPlan(plan: GrowthPlan | null | undefined): string {
  const created = dateIsoFromAny(plan?.createdAt);
  const updated = dateIsoFromAny(plan?.updatedAt);

  // Prefer the most recent timestamp between created/updated (ISO dates compare lexicographically).
  if (created && updated) return created > updated ? created : updated;
  return updated || created || isoDate(new Date());
}


function sessionPnlUsd(s: any): number {
  // Use net if present; else fall back.
  const v = Number(s?.pnlNet ?? s?.pnlComputed ?? s?.pnl ?? s?.realized_usd ?? s?.profit ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function mapGrowthPlanRow(row: DbGrowthPlanRow): GrowthPlan {
  const dailyTargetPct = toNum(
    row.daily_target_pct ?? row.daily_goal_percent ?? 0,
    0
  );

  return {
    id: row.id,
    userId: row.user_id,

    startingBalance: toNum(row.starting_balance, 0),
    targetBalance: toNum(row.target_balance, 0),

    dailyTargetPct,
    maxDailyLossPct: toNum(row.max_daily_loss_percent, 0),

    tradingDays: Math.max(0, Math.floor(toNum(row.trading_days, 0))),
    maxOnePercentLossDays: Math.max(0, Math.floor(toNum(row.max_one_percent_loss_days, 0))),
    lossDaysPerWeek: Math.max(0, Math.floor(toNum(row.loss_days_per_week, 0))),

    maxRiskPerTradeUsd: row.max_risk_per_trade_usd == null ? null : toNum(row.max_risk_per_trade_usd, 0),

    steps: row.steps,
    rules: row.rules,
    selectedPlan: row.selected_plan ?? null,
    version: row.version ?? null,

    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function cashflowNet(cf: any): number {
  const t = String(cf?.type ?? cf?.cashflow_type ?? "").toLowerCase().trim();
  const amt = toNum(cf?.amount_usd ?? cf?.amountUsd ?? cf?.amount, 0);
  if (!Number.isFinite(amt)) return 0;
  if (t === "withdrawal") return -Math.abs(amt);
  return Math.abs(amt);
}

/* =========================================================
   UI bits
========================================================= */

function wrapCard() {
  return "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-[0_0_30px_rgba(15,23,42,0.75)]";
}
function chartTitle() {
  return "text-[11px] uppercase tracking-[0.22em] text-slate-300";
}
function chartSub() {
  return "text-[11px] text-slate-500 mt-1";
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
      <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-mono text-emerald-300">{value}</p>
      {sub ? <p className="mt-2 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

/* =========================================================
   Page
========================================================= */

export default function BalanceChartPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [plan, setPlan] = useState<GrowthPlan | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Auth gate
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  // Resolve Supabase user id (prefer AuthContext user.id; fallback to supabase session)
  const resolveUserId = async (): Promise<string | null> => {
    const direct = (user as any)?.id;
    if (typeof direct === "string" && direct) return direct;

    try {
      const { data } = await supabaseBrowser.auth.getUser();
      return data?.user?.id ?? null;
    } catch {
      return null;
    }
  };

  // Load plan + journal + cashflows
  useEffect(() => {
    if (loading) return;

    let alive = true;

    const run = async () => {
      try {
        setLoadingData(true);

        const userId = await resolveUserId();
        if (!alive) return;

        if (!userId) {
          setPlan(null);
          setEntries([]);
          setCashflows([]);
          return;
        }

        // 1) Growth plan
        const { data: gpRow, error: gpErr } = await supabaseBrowser
          .from("growth_plans")
          .select("*")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (gpErr) {
          console.error("[balance-chart] growth_plans load error:", gpErr);
          setPlan(null);
          setEntries([]);
          setCashflows([]);
          return;
        }

        const gp = gpRow ? mapGrowthPlanRow(gpRow as any) : null;
        setPlan(gp);

        // If no plan, don't load the rest.
        if (!gp) {
          setEntries([]);
          setCashflows([]);
          return;
        }

        const planStartIso = planStartIsoFromPlan(gp);

        // 2) Entries + Cashflows (parallel)
        const [allEntries, cfRows] = await Promise.all([
          getAllJournalEntries(userId),
          listCashflows(userId, { fromDate: planStartIso, throwOnError: false }),
        ]);

        if (!alive) return;

        setEntries(allEntries || []);
        setCashflows((cfRows || []).slice(0, 5000));
      } catch (e) {
        console.error("[balance-chart] load error:", e);
        if (!alive) return;
        setPlan(null);
        setEntries([]);
        setCashflows([]);
      } finally {
        if (alive) setLoadingData(false);
      }
    };

    run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  /* =========================================================
     Compute chart + schedule
  ========================================================= */

  const computed = useMemo(() => {
    if (!plan) {
      return {
        hasData: false,
        chartData: [] as ChartPoint[],
        planStartDate: "",
        currentDateStr: "",
        tradingDays: 0,
        currentBalance: 0,
        projectedBalance: 0,
        diff: 0,
        totalTradingPnl: 0,
        totalCashflowNet: 0,
      };
    }

    const todayIso = isoDate(new Date());
    const planStartIso = planStartIsoFromPlan(plan);

    // Aggregate PnL by date
    const pnlByDate = new Map<string, number>();
    let lastSessionIso = "";
    for (const s of entries || []) {
      const d = dateIsoFromAny((s as any)?.date ?? (s as any)?.sessionDate ?? (s as any)?.created_at);
      if (!d) continue;
      const pnl = sessionPnlUsd(s as any);
      pnlByDate.set(d, (pnlByDate.get(d) ?? 0) + pnl);
      if (!lastSessionIso || d > lastSessionIso) lastSessionIso = d;
    }

    // Last cashflow date (calendar day)
    let lastCashIso = "";
    for (const cf of cashflows || []) {
      const d = dateIsoFromAny((cf as any)?.date);
      if (!d) continue;
      if (!lastCashIso || d > lastCashIso) lastCashIso = d;
    }

    // End range = max(today, last session, last cashflow)
    const rangeEndIso = [todayIso, lastSessionIso, lastCashIso].filter(Boolean).sort().pop() || todayIso;

    const allTradingDates = listTradingDaysBetween(planStartIso, rangeEndIso);

    const effectiveTradingDays =
      plan.tradingDays && plan.tradingDays > 0
        ? Math.min(allTradingDates.length, plan.tradingDays)
        : allTradingDates.length;

    if (!effectiveTradingDays) {
      return {
        hasData: false,
        chartData: [] as ChartPoint[],
        planStartDate: planStartIso,
        currentDateStr: planStartIso,
        tradingDays: 0,
        currentBalance: plan.startingBalance,
        projectedBalance: plan.startingBalance,
        diff: 0,
        totalTradingPnl: 0,
        totalCashflowNet: 0,
      };
    }

    // Cashflow events (sorted ascending). We will apply any cashflows up to each trading day.
    const cashEvents = (cashflows || [])
      .map((c) => {
        const date = dateIsoFromAny((c as any)?.date);
        if (!date) return null;
        const net = cashflowNet(c);
        return { date, net };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => String(a.date).localeCompare(String(b.date))) as { date: string; net: number }[];

    let cashIdx = 0;
    let cumCash = 0;

    const out: ChartPoint[] = [];
    let cumPnl = 0;

    const starting = plan.startingBalance;
    const dailyTargetPct = plan.dailyTargetPct;
    const maxDailyLossPct = plan.maxDailyLossPct;
    const lossDaysPerWeek = plan.lossDaysPerWeek;

    // Projected balance starts at plan starting balance
    let projBalance = starting;

    for (let i = 0; i < effectiveTradingDays; i++) {
      const dateStr = allTradingDates[i];

      // Apply any cashflows up to this trading day (including weekend cashflows)
      let cashDelta = 0;
      while (cashIdx < cashEvents.length && cashEvents[cashIdx].date <= dateStr) {
        cashDelta += cashEvents[cashIdx].net;
        cumCash += cashEvents[cashIdx].net;
        cashIdx++;
      }

      // Trading P&L for this trading day
      const dayPnl = pnlByDate.get(dateStr) ?? 0;
      cumPnl += dayPnl;

      // Actual = starting + cumulative trading pnl + cumulative cashflows
      const actualBalance = starting + cumPnl + cumCash;

      // Projected:
      // 1) apply cashflow delta first (assumed start-of-day cash move)
      projBalance += cashDelta;

      // 2) apply plan projection return
      if (dailyTargetPct > 0) {
        const dayInWeek = i % 5;
        // Simple weekly model: first N days of each 5-day block are loss days.
        const isLossDay = lossDaysPerWeek > 0 && dayInWeek < lossDaysPerWeek && maxDailyLossPct > 0;
        const pct = isLossDay ? -maxDailyLossPct : dailyTargetPct;
        projBalance = projBalance + projBalance * (pct / 100);
      } else if ((plan.targetBalance ?? 0) > starting && effectiveTradingDays > 1) {
        // fallback linear interpolation (cashflows approximated via cumCash)
        const target = Number(plan.targetBalance ?? starting) || starting;
        const frac = i / (effectiveTradingDays - 1);
        projBalance = starting + (target - starting) * frac + cumCash;
      } else {
        projBalance = starting + cumCash;
      }

      out.push({
        date: dateStr,
        actual: Number(actualBalance.toFixed(2)),
        projected: Number(projBalance.toFixed(2)),
        dayPnl: Number(dayPnl.toFixed(2)),
      });
    }

    const lastPoint = out[out.length - 1];
    const currentBalance = lastPoint.actual;
    const projectedBalance = lastPoint.projected;
    const diff = currentBalance - projectedBalance;

    const totalCashflowNet = cumCash;
    const totalTradingPnl = cumPnl;

    return {
      chartData: out,
      tradingDays: effectiveTradingDays,
      currentBalance,
      projectedBalance,
      diff,
      hasData: true,
      planStartDate: planStartIso,
      currentDateStr: lastPoint.date,
      totalTradingPnl,
      totalCashflowNet,
    };
  }, [plan, entries, cashflows]);

  /* =========================================================
     Render
  ========================================================= */

  if (loading || !user || loadingData) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">Loading your balance chart…</p>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="px-4 md:px-8 py-8">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
              <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">
                Performance · Balance Chart
              </p>
              <h1 className="text-2xl md:text-3xl font-semibold mt-2">Balance Chart</h1>
              <p className="text-slate-400 mt-2">
                You don&apos;t have an active Growth Plan in Supabase yet.
              </p>
              <div className="mt-4 flex gap-2">
                <Link
                  href="/growth-plan"
                  className="px-3 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
                >
                  Create / edit growth plan
                </Link>
                <Link
                  href="/dashboard"
                  className="px-3 py-2 rounded-xl border border-slate-700 text-slate-200 text-sm hover:border-slate-500 transition"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const dailyGoalUsd = computed.currentBalance * (plan.dailyTargetPct / 100);
  const maxLossUsd = computed.currentBalance * (plan.maxDailyLossPct / 100);

  const planCreatedStr = plan.createdAt ? new Date(plan.createdAt).toISOString().slice(0, 10) : "—";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-4 md:px-8 py-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <header className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">
                  Performance · Balance Chart
                </p>
                <h1 className="text-3xl md:text-4xl font-semibold mt-1">Balance Chart</h1>
                <p className="text-sm md:text-base text-slate-400 mt-2 max-w-2xl">
                  Actual vs projected balances from your Growth Plan (Supabase) with cashflows applied to both lines (so deposits/withdrawals don&apos;t distort plan performance).
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
                  Plan created: <span className="text-slate-300 font-mono">{planCreatedStr}</span>
                </p>
              </div>
            </div>
          </header>

          {/* Quick stats */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Stat
              label="Current balance"
              value={`$${computed.currentBalance.toFixed(2)}`}
              sub={`Plan start: ${computed.planStartDate} · Current: ${computed.currentDateStr}`}
            />
            <Stat
              label="Projected balance"
              value={`$${computed.projectedBalance.toFixed(2)}`}
              sub={`Diff vs projected: ${fmtMoney(computed.diff)}`}
            />
            <Stat
              label="Today targets"
              value={`${fmtMoneyAbs(dailyGoalUsd)} goal · ${fmtMoneyAbs(maxLossUsd)} max loss`}
              sub={`Goal ${plan.dailyTargetPct.toFixed(3)}% · Max loss ${plan.maxDailyLossPct.toFixed(3)}%`}
            />
          </section>

          {/* Cashflow / PnL decomposition */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className={wrapCard()}>
              <p className={chartTitle()}>Trading P&amp;L (net)</p>
              <p className={chartSub()}>Sum of realized daily P&amp;L across the range.</p>
              <p className={`mt-3 text-3xl font-mono ${computed.totalTradingPnl >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                {fmtMoney(computed.totalTradingPnl)}
              </p>
            </div>
            <div className={wrapCard()}>
              <p className={chartTitle()}>Net cashflow</p>
              <p className={chartSub()}>Deposits minus withdrawals applied to both lines.</p>
              <p className={`mt-3 text-3xl font-mono ${computed.totalCashflowNet >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                {fmtMoney(computed.totalCashflowNet)}
              </p>
            </div>
          </section>

          {/* Chart */}
          <section className={wrapCard()}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className={chartTitle()}>Actual vs projected</p>
                <p className={chartSub()}>Trading days only (Mon–Fri). Cashflows are included but neutralized vs the projection.</p>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">BAL</span>
            </div>

            <div className="mt-4 h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={computed.chartData}>
                  <CartesianGrid stroke="rgba(148,163,184,0.12)" strokeDasharray="4 8" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "rgba(148,163,184,0.65)", fontSize: 11 }}
                    tickFormatter={formatDateFriendly}
                    axisLine={{ stroke: "rgba(148,163,184,0.12)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(148,163,184,0.65)", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(148,163,184,0.12)" }}
                    tickLine={false}
                    width={58}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(2,6,23,0.94)",
                      border: "1px solid rgba(148,163,184,0.18)",
                      borderRadius: 14,
                      boxShadow: "0 0 30px rgba(0,0,0,0.55)",
                      color: "rgba(226,232,240,0.92)",
                      fontSize: 12,
                    }}
                    itemStyle={{ color: "rgba(226,232,240,0.92)" }}
                    labelStyle={{ color: "rgba(148,163,184,0.9)" }}
                    cursor={{ stroke: "rgba(148,163,184,0.18)" }}
                    formatter={(v: any, k: any) => {
                      if (k === "dayPnl") return [fmtMoney(Number(v)), "Day P&L"];
                      return [`$${Number(v).toFixed(2)}`, String(k)];
                    }}
                    labelFormatter={(l: any) => `Date: ${l}`}
                  />
                  <Legend wrapperStyle={{ color: "rgba(148,163,184,0.8)" }} />

                  <Line
                    type="monotone"
                    dataKey="actual"
                    name="Actual balance"
                    stroke="rgba(52,211,153,0.95)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="projected"
                    name="Projected balance"
                    stroke="rgba(56,189,248,0.90)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Schedule table */}
          <section className={`${wrapCard()} mt-6`}>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-100">Growth plan schedule</p>
                <p className="text-xs text-slate-400">
                  Trading days only, from your first trading day in this plan to your current trading day.
                </p>
              </div>

              <div className="text-[11px] text-slate-500">
                Plan created on: <span className="text-slate-300 font-mono">{planCreatedStr}</span>
                <br />
                Current date: <span className="text-slate-300 font-mono">{computed.currentDateStr}</span>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[920px] w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.22em] text-slate-500 border-b border-slate-800">
                    <th className="px-3 py-2 text-left">Day #</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-right">Day P&amp;L</th>
                    <th className="px-3 py-2 text-right">Actual balance</th>
                    <th className="px-3 py-2 text-right">Projected balance</th>
                    <th className="px-3 py-2 text-right">Diff vs projected</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.chartData.map((r, idx) => {
                    const diff = r.actual - r.projected;
                    const isCurrent = r.date === computed.currentDateStr;

                    return (
                      <tr
                        key={r.date}
                        className={`border-t border-slate-800 transition ${
                          isCurrent ? "bg-emerald-500/10" : "bg-slate-950/45 hover:bg-slate-950/70"
                        }`}
                      >
                        <td className="px-3 py-2 text-slate-200 font-mono">{idx + 1}</td>
                        <td className="px-3 py-2 text-slate-200 font-mono">{r.date}</td>
                        <td className={`px-3 py-2 text-right font-mono ${r.dayPnl >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                          {fmtMoney(r.dayPnl)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-200">
                          ${r.actual.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-300">
                          ${r.projected.toFixed(2)}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${diff >= 0 ? "text-emerald-300" : "text-sky-300"}`}>
                          {fmtMoney(diff)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <p className="mt-3 text-[11px] text-slate-500">
                Notes: Cashflows are applied to both Actual and Projected. This keeps the &quot;Diff vs projected&quot; driven by trading performance, not deposits/withdrawals.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
