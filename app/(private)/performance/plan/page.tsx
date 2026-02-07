// app/(private)/plan/page.tsx
"use client";

/**
 * Purpose
 * - Show the active Growth Plan (from Supabase table: public.growth_plans)
 * - Track Deposits/Withdrawals in a separate ledger (Supabase table: public.cashflows)
 * - Keep trading statistics clean: cashflows never count as P&L.
 *
 * Route
 * - /plan
 *
 * Dependencies
 * - Growth plan table exists: public.growth_plans (your current schema)
 * - Cashflows table exists: public.cashflows (see SQL migration file provided)
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";

import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

import { supabaseBrowser } from "@/lib/supaBaseClient";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import type { JournalEntry } from "@/lib/journalLocal";

import {
  createCashflow,
  deleteCashflow,
  listCashflows,
  signedCashflowAmount,
  type Cashflow,
  type CashflowType,
} from "@/lib/cashflowsSupabase";

/* =========================
   Types + helpers
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
};

function toNum(x: unknown, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

function clampInt(n: number, lo = 0, hi = 999999): number {
  const v = Math.floor(Number.isFinite(n) ? n : 0);
  return Math.max(lo, Math.min(hi, v));
}

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currency(n: number, locale?: string): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(locale || undefined, { style: "currency", currency: "USD" });
}

function getPlanUserId(user: any): string {
  // growth_plans.user_id is UUID
  return String(user?.id || user?.uid || "");
}

function getJournalUserId(user: any): string {
  // keep compatibility with your existing journal storage
  return String(user?.uid || user?.id || user?.email || "");
}

function dailyTargetPct(plan: GrowthPlan | null): number {
  if (!plan) return 0;
  return plan.dailyTargetPct > 0 ? plan.dailyTargetPct : plan.dailyGoalPercent;
}

async function fetchLatestGrowthPlan(userId: string, accountId?: string | null): Promise<GrowthPlan | null> {
  if (!userId) return null;

  // IMPORTANT:
  // Supabase's typed `select()` parser needs a string literal to infer row types.
  // Avoid building the select string dynamically (e.g., array.join), otherwise strict TS may infer
  // the result as `GenericStringError` (TS2352).
  const SELECT_GROWTH_PLAN =
    "id,user_id,starting_balance,target_balance,daily_target_pct,daily_goal_percent,max_daily_loss_percent,loss_days_per_week,trading_days,selected_plan,created_at,updated_at" as const;

  try {
    let q = supabaseBrowser
      .from("growth_plans")
      .select(SELECT_GROWTH_PLAN)
      .eq("user_id", userId);
    if (accountId) q = q.eq("account_id", accountId);
    const { data, error } = await q
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("[PlanPage] growth_plans fetch error:", error);
      return null;
    }

    const row = (data as any)?.[0] ?? undefined;
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
      lossDaysPerWeek: Math.max(0, Math.min(5, clampInt(toNum(row.loss_days_per_week, 0), 0, 5))),
      tradingDays: Math.max(0, clampInt(toNum(row.trading_days, 0), 0, 10000)),

      selectedPlan: row.selected_plan ?? null,

      createdAtIso,
      updatedAtIso,
    };
  } catch (err) {
    console.error("[PlanPage] growth_plans fetch exception:", err);
    return null;
  }
}

/* =========================
   Page
========================= */

export default function PlanPage() {
  const { user, loading } = useAuth() as any;
  const { activeAccountId, loading: accountsLoading } = useTradingAccounts();
  const router = useRouter();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const localeTag = isEs ? "es-ES" : "en-US";

  const planUserId = useMemo(() => getPlanUserId(user), [user]);
  const journalUserId = useMemo(() => getJournalUserId(user), [user]);

  const [plan, setPlan] = useState<GrowthPlan | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // form
  const [cfType, setCfType] = useState<CashflowType>("deposit");
  const [cfDate, setCfDate] = useState<string>(isoToday());
  const [cfAmount, setCfAmount] = useState<string>("");
  const [cfNote, setCfNote] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [cashflowTableMissing, setCashflowTableMissing] = useState(false);

  const fmtCurrency = (n: number) => currency(n, localeTag);

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  async function reloadAll() {
    if (loading || !user || accountsLoading || !activeAccountId) return;
    if (!planUserId) return;

    setLoadingData(true);
    setCashflowTableMissing(false);

    try {
      const gp = await fetchLatestGrowthPlan(planUserId, activeAccountId);
      setPlan(gp);

      // journal entries (for trading P&L)
      if (journalUserId) {
        const all = await getAllJournalEntries(journalUserId, activeAccountId);
        setEntries(all ?? []);
      } else {
        setEntries([]);
      }

      // cashflows ledger (deposits/withdrawals)
      try {
        const fromDate = gp ? String(gp.createdAtIso).slice(0, 10) : undefined;
        const opts = fromDate
          ? { fromDate, throwOnError: true, forceServer: true, accountId: activeAccountId }
          : { throwOnError: true, forceServer: true, accountId: activeAccountId };

        const primary = String((user as any)?.id || "");
        const secondary = String((user as any)?.uid || "");

        let cf: Cashflow[] = [];
        if (primary) cf = await listCashflows(primary, opts);
        if ((!cf || cf.length === 0) && secondary && secondary !== primary) {
          const alt = await listCashflows(secondary, opts);
          if (alt?.length) cf = alt;
        }

        setCashflows(cf ?? []);
      } catch (err: any) {
        console.error("[PlanPage] cashflows load error:", err);
        // Common setup issue: missing table
        setCashflows([]);
        setCashflowTableMissing(true);
      }
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (loading || !user || accountsLoading || !activeAccountId) return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, planUserId, journalUserId, accountsLoading, activeAccountId]);

  const planStartDate = useMemo(() => {
    if (!plan) return "";
    return String(plan.createdAtIso || plan.updatedAtIso || "").slice(0, 10);
  }, [plan]);

  const totalTradingPnl = useMemo(() => {
    if (!planStartDate) return 0;
    return (entries ?? [])
      .filter((e) => e.date >= planStartDate)
      .reduce((acc, e) => acc + toNum((e as any).pnl, 0), 0);
  }, [entries, planStartDate]);

  const cashflowNet = useMemo(() => {
    return (cashflows ?? []).reduce((acc, cf) => acc + signedCashflowAmount(cf), 0);
  }, [cashflows]);

  const cashflowDeposits = useMemo(() => {
    return (cashflows ?? [])
      .filter((c) => c.type === "deposit")
      .reduce((acc, c) => acc + Math.abs(toNum(c.amount, 0)), 0);
  }, [cashflows]);

  const cashflowWithdrawals = useMemo(() => {
    return (cashflows ?? [])
      .filter((c) => c.type === "withdrawal")
      .reduce((acc, c) => acc + Math.abs(toNum(c.amount, 0)), 0);
  }, [cashflows]);

  const balances = useMemo(() => {
    const starting = plan?.startingBalance ?? 0;

    const tradingEquity = starting + totalTradingPnl; // PURE trading (no deposits/withdrawals)
    const accountEquity = tradingEquity + cashflowNet; // real account equity after cashflows

    const pct = dailyTargetPct(plan);
    const dailyGoalUsd = accountEquity * (pct / 100);
    const maxLossUsd = accountEquity * ((plan?.maxDailyLossPercent ?? 0) / 100);

    return {
      starting,
      tradingEquity,
      accountEquity,
      pct,
      dailyGoalUsd,
      maxLossUsd,
    };
  }, [plan, totalTradingPnl, cashflowNet]);

  const progress = useMemo(() => {
    const target = plan?.targetBalance ?? 0;
    if (!plan || target <= 0) {
      return { tradingPct: 0, accountPct: 0 };
    }

    const tradingPct = balances.tradingEquity / target;
    const accountPct = balances.accountEquity / target;

    return {
      tradingPct: Math.max(0, Math.min(1.25, tradingPct)),
      accountPct: Math.max(0, Math.min(1.25, accountPct)),
    };
  }, [plan, balances.tradingEquity, balances.accountEquity]);

  async function onAddCashflow() {
    if (!planUserId || !activeAccountId) return;
    if (!cfDate) return;

    const amount = Number(String(cfAmount).replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return;

    setSaving(true);
    try {
      await createCashflow({
        userId: planUserId,
        accountId: activeAccountId,
        date: cfDate,
        type: cfType,
        amount,
        note: cfNote?.trim() ? cfNote.trim() : null,
      });

      setCfAmount("");
      setCfNote("");

      // reload ledger only (cheaper), but keep it simple: reload everything
      await reloadAll();
    } catch (err) {
      console.error("[PlanPage] createCashflow error:", err);
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteCashflow(id: string) {
    if (!planUserId) return;

    const ok = window.confirm(
      L(
        "Delete this cashflow record? This does NOT delete any trades, only this deposit/withdrawal row.",
        "¿Eliminar este cashflow? Esto NO borra trades, solo esta fila de depósito/retiro."
      )
    );
    if (!ok) return;

    setSaving(true);
    try {
      await deleteCashflow(planUserId, id);
      await reloadAll();
    } catch (err) {
      console.error("[PlanPage] deleteCashflow error:", err);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user || loadingData) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">
          {L("Loading your plan...", "Cargando tu plan...")}
        </p>
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
              <h1 className="text-3xl font-semibold">{L("Cash Flow Tracking", "Seguimiento de cashflow")}</h1>
              <p className="text-sm text-slate-400 mt-1">
                {L(
                  "Deposits/withdrawals live here so your trading statistics stay clean. This page updates your goal dollars automatically based on account equity.",
                  "Aquí viven los depósitos/retiros para mantener limpias tus estadísticas. Esta página actualiza tus metas automáticamente según el equity."
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/growth-plan"
                className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                {L("Growth plan wizard →", "Asistente de plan →")}
              </Link>

              <Link
                href="/balance-chart"
                className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                {L("Balance chart →", "Gráfico de balance →")}
              </Link>

              <button
                type="button"
                onClick={() => reloadAll()}
                className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 hover:text-slate-100 transition"
              >
                {L("Refresh", "Actualizar")}
              </button>
            </div>
          </div>
        </header>

        {!plan ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300">
            {L(
              "No Growth Plan found yet (table:",
              "Aún no hay un Growth Plan (tabla:"
            )}{" "}
            <span className="text-slate-100 font-semibold">growth_plans</span>).{" "}
            {L("Create one in", "Crea uno en")}{" "}
            <Link className="text-emerald-300 hover:text-emerald-200 underline" href="/growth-plan">
              {L("Growth Plan Wizard", "Asistente de plan")}
            </Link>
            .
          </div>
        ) : (
          <>
            {/* KPI row */}
            <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Starting balance", "Balance inicial")}
                </div>
                <div className="mt-1 text-2xl font-semibold">{fmtCurrency(balances.starting)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {L("Plan created:", "Plan creado:")}{" "}
                  <span className="text-slate-200">{planStartDate || "—"}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Trading equity", "Equity de trading")}
                </div>
                <div className="mt-1 text-2xl font-semibold">{fmtCurrency(balances.tradingEquity)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {L("P&L (trading only):", "P&L (solo trading):")}{" "}
                  <span className={totalTradingPnl >= 0 ? "text-emerald-300 font-semibold" : "text-sky-300 font-semibold"}>
                    {totalTradingPnl >= 0 ? "+" : "-"}{fmtCurrency(Math.abs(totalTradingPnl))}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Account equity", "Equity de cuenta")}
                </div>
                <div className="mt-1 text-2xl font-semibold">{fmtCurrency(balances.accountEquity)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {L("Net cashflow:", "Cashflow neto:")}{" "}
                  <span className={cashflowNet >= 0 ? "text-emerald-300 font-semibold" : "text-sky-300 font-semibold"}>
                    {cashflowNet >= 0 ? "+" : "-"}{fmtCurrency(Math.abs(cashflowNet))}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Today's thresholds", "Umbrales de hoy")}
                </div>
                <div className="mt-1 text-sm text-slate-200 space-y-1">
                  <div>
                    {L("Daily goal:", "Meta diaria:")}{" "}
                    <span className="text-emerald-300 font-semibold">
                      {fmtCurrency(balances.dailyGoalUsd)}
                    </span>{" "}
                    <span className="text-slate-500">({balances.pct.toFixed(3)}%)</span>
                  </div>
                  <div>
                    {L("Max daily loss:", "Pérdida diaria máx:")}{" "}
                    <span className="text-sky-300 font-semibold">
                      {fmtCurrency(balances.maxLossUsd)}
                    </span>{" "}
                    <span className="text-slate-500">({(plan.maxDailyLossPercent ?? 0).toFixed(2)}%)</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Progress bars */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                    {L("Progress vs target", "Progreso vs meta")}
                  </div>
                  <div className="text-xs text-slate-400">
                    {L("Target:", "Meta:")}{" "}
                    <span className="text-slate-100 font-semibold">{fmtCurrency(plan.targetBalance ?? 0)}</span>
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                      <span>{L("Trading only", "Solo trading")}</span>
                      <span className="text-slate-200 font-semibold">{(progress.tradingPct * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-400/70"
                        style={{ width: `${Math.min(100, progress.tradingPct * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                      <span>{L("Including cashflows", "Incluyendo cashflows")}</span>
                      <span className="text-slate-200 font-semibold">{(progress.accountPct * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-sky-400/70"
                        style={{ width: `${Math.min(100, progress.accountPct * 100)}%` }}
                      />
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    {L(
                      "Cashflows do not count as trading performance. They only adjust account equity and goal dollars.",
                      "Los cashflows no cuentan como performance. Solo ajustan el equity y las metas."
                    )}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Plan snapshot", "Resumen del plan")}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[11px] text-slate-500">{L("Trading days", "Días de trading")}</div>
                    <div className="mt-1 text-slate-100 font-semibold">{plan.tradingDays ?? 0}</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[11px] text-slate-500">{L("Loss days/week", "Días de pérdida/sem")}</div>
                    <div className="mt-1 text-slate-100 font-semibold">{plan.lossDaysPerWeek ?? 0}</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[11px] text-slate-500">{L("Selected plan", "Plan seleccionado")}</div>
                    <div className="mt-1 text-slate-100 font-semibold">{plan.selectedPlan || "—"}</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="text-[11px] text-slate-500">{L("Daily target %", "% meta diaria")}</div>
                    <div className="mt-1 text-emerald-300 font-semibold">{balances.pct.toFixed(3)}%</div>
                  </div>
                </div>
              </div>
            </section>

            {/* Two-column layout: Ledger + Add */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Ledger */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-50">{L("Cashflow ledger", "Ledger de cashflow")}</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {L(
                        "Deposits & withdrawals tracked separately from trading stats.",
                        "Depósitos y retiros se registran separados de las estadísticas de trading."
                      )}
                    </p>
                  </div>

                  <div className="text-right text-xs text-slate-400 space-y-1">
                    <div>
                      {L("Deposits:", "Depósitos:")}{" "}
                      <span className="text-emerald-300 font-semibold">{fmtCurrency(cashflowDeposits)}</span>
                    </div>
                    <div>
                      {L("Withdrawals:", "Retiros:")}{" "}
                      <span className="text-sky-300 font-semibold">{fmtCurrency(cashflowWithdrawals)}</span>
                    </div>
                  </div>
                </div>

                {cashflowTableMissing ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
                    {L(
                      "Cashflow module is not enabled yet (table",
                      "El módulo de cashflow aún no está habilitado (tabla"
                    )}{" "}
                    <span className="text-slate-100 font-semibold">cashflows</span>{" "}
                    {L("not found or blocked by RLS).", "no encontrada o bloqueada por RLS).")}
                    <div className="text-xs text-slate-500 mt-2">
                      {L(
                        "If you're the developer: run the cashflows migration SQL and confirm RLS policies.",
                        "Si eres developer: corre la migración SQL de cashflows y confirma las políticas RLS."
                      )}
                    </div>
                  </div>
                ) : cashflows.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-300">
                    {L("No cashflows yet.", "Aún no hay cashflows.")}
                    <div className="text-xs text-slate-500 mt-1">
                      {L("Add a deposit or withdrawal on the right.", "Agrega un depósito o retiro a la derecha.")}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {cashflows.map((cf) => {
                      const signed = signedCashflowAmount(cf);
                      const isDeposit = cf.type === "deposit";
                      return (
                        <div
                          key={cf.id}
                          className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 flex items-start justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 font-mono">{cf.date}</span>
                              <span
                                className={[
                                  "text-[10px] px-2 py-0.5 rounded-full border",
                                  isDeposit
                                    ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                                    : "border-sky-500/30 text-sky-300 bg-sky-500/10",
                                ].join(" ")}
                              >
                                {isDeposit ? L("DEPOSIT", "DEPÓSITO") : L("WITHDRAWAL", "RETIRO")}
                              </span>
                            </div>

                            <div className="mt-1 text-sm text-slate-100 font-semibold">
                              {signed >= 0 ? "+" : "-"}
                              {fmtCurrency(Math.abs(signed))}
                            </div>

                            {cf.note ? (
                              <div className="mt-1 text-xs text-slate-400 wrap-break-word">
                                {cf.note}
                              </div>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            onClick={() => onDeleteCashflow(cf.id)}
                            disabled={saving}
                            className="shrink-0 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-red-400/60 hover:text-red-300 transition disabled:opacity-60"
                          >
                            {L("Delete", "Eliminar")}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Add form */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-50">{L("Add cashflow", "Agregar cashflow")}</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {L(
                        "This updates goal dollars automatically, without changing win-rate or P&L stats.",
                        "Esto actualiza las metas automáticamente sin cambiar tu win-rate ni P&L."
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">{L("Type", "Tipo")}</label>
                    <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950/60 p-1">
                      <button
                        type="button"
                        onClick={() => setCfType("deposit")}
                        className={[
                          "px-3 py-1.5 text-xs rounded-lg transition",
                          cfType === "deposit"
                            ? "bg-emerald-400 text-slate-950 font-semibold"
                            : "text-slate-300 hover:text-slate-50",
                        ].join(" ")}
                      >
                        {L("Deposit", "Depósito")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCfType("withdrawal")}
                        className={[
                          "px-3 py-1.5 text-xs rounded-lg transition",
                          cfType === "withdrawal"
                            ? "bg-sky-400 text-slate-950 font-semibold"
                            : "text-slate-300 hover:text-slate-50",
                        ].join(" ")}
                      >
                        {L("Withdrawal", "Retiro")}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">{L("Date", "Fecha")}</label>
                    <input
                      type="date"
                      value={cfDate}
                      onChange={(e) => setCfDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">{L("Amount (USD)", "Monto (USD)")}</label>
                    <input
                      inputMode="decimal"
                      value={cfAmount}
                      onChange={(e) => setCfAmount(e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="1000"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs text-slate-400 mb-1">{L("Note (optional)", "Nota (opcional)")}</label>
                    <input
                      value={cfNote}
                      onChange={(e) => setCfNote(e.target.value)}
                      placeholder={L(
                        "e.g., Added margin / New deposit / Withdrew profits",
                        "ej., Añadí margen / Nuevo depósito / Retiré ganancias"
                      )}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onAddCashflow}
                    disabled={saving || cashflowTableMissing}
                    className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                  >
                    {L("Add", "Agregar")}
                  </button>

                  <div className="text-xs text-slate-500">
                    {L("After saving, your ", "Luego de guardar, tu ")}
                    <span className="text-slate-200">{L("daily goal $", "meta diaria $")}</span>
                    {L(" and ", " y ")}
                    <span className="text-slate-200">{L("max loss $", "pérdida máx $")}</span>{" "}
                    {L("update based on account equity.", "se actualizan según el equity de la cuenta.")}
                  </div>
                </div>

                <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-400 space-y-2">
                  <div className="text-slate-200 font-semibold">{L("How this works", "Cómo funciona")}</div>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>
                      {L(
                        "Trading P&L is calculated only from your journal/trade imports.",
                        "El P&L de trading se calcula solo desde tu journal/imports."
                      )}
                    </li>
                    <li>
                      {L("Deposits/withdrawals are stored in", "Los depósitos/retiros se guardan en")}{" "}
                      <span className="font-mono">cashflows</span>{" "}
                      {L("and never counted as P&L.", "y nunca cuentan como P&L.")}
                    </li>
                    <li>
                      {L("Goal dollars (and max-loss dollars) are computed from your", "Las metas en $ (y pérdidas máx) se calculan desde tu")}{" "}
                      <span className="text-slate-200">{L("account equity", "equity de cuenta")}</span>{" "}
                      = {L("trading equity", "trading equity")} + {L("net cashflows", "cashflows netos")}.
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
