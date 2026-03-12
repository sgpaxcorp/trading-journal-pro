// app/(private)/performance/plan-summary/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

import { getAllJournalEntries } from "@/lib/journalSupabase";
import type { JournalEntry } from "@/lib/journalLocal";

import {
  listCashflows,
  signedCashflowAmount,
  createCashflow,
  type Cashflow,
} from "@/lib/cashflowsSupabase";

import {
  getGrowthPlanSupabaseByAccount,
  upsertGrowthPlanSupabase,
  type GrowthPlan,
} from "@/lib/growthPlanSupabase";
import {
  getTakenPlannedWithdrawalAmount,
  getTotalPlannedWithdrawalAmount,
  normalizePlannedWithdrawals,
} from "@/lib/growthPlanProjection";

type PlannedWithdrawal = NonNullable<GrowthPlan["plannedWithdrawals"]>[number];

function toNum(x: unknown, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return String(iso).slice(0, 10);
}

function currency(n: number, locale?: string): string {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(locale || undefined, { style: "currency", currency: "USD" });
}

function getPlanUserId(user: any): string {
  return String(user?.id || user?.uid || "");
}

function getJournalUserId(user: any): string {
  return String(user?.uid || user?.id || user?.email || "");
}

function daysBetween(a: string, b: string): number {
  if (!a || !b) return 0;
  const da = new Date(`${a}T00:00:00Z`);
  const db = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return 0;
  return Math.max(0, Math.ceil((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24)));
}

function normalizePhases(rows: Array<any> | null | undefined) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map((item) => ({
    id: item.id || crypto.randomUUID(),
    title: item.title ?? null,
    targetEquity: Math.max(0, toNum(item.targetEquity, 0)),
    targetDate: item.targetDate ? String(item.targetDate).slice(0, 10) : null,
    status: item.status ?? "pending",
    completedAt: item.completedAt ?? null,
  }));
}

export default function PlanSummaryPage() {
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
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  async function reloadAll() {
    if (loading || !user || accountsLoading || !activeAccountId) return;
    setLoadingData(true);
    setError("");
    try {
      const [planRes, entriesRes, cashflowRes] = await Promise.all([
        getGrowthPlanSupabaseByAccount(activeAccountId),
        getAllJournalEntries(journalUserId, activeAccountId),
        planUserId ? listCashflows(planUserId, { accountId: activeAccountId }) : Promise.resolve([]),
      ]);
      setPlan(planRes);
      setEntries(entriesRes ?? []);
      setCashflows(cashflowRes ?? []);
    } catch (err) {
      console.error("[PlanSummary] load error:", err);
      setError(L("Could not load your plan summary.", "No pudimos cargar tu resumen del plan."));
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (loading || !user || accountsLoading || !activeAccountId) return;
    reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, accountsLoading, activeAccountId]);

  const planStartDate = useMemo(() => {
    if (!plan) return "";
    return (
      String(plan.planStartDate || plan.createdAt || plan.updatedAt || "").slice(0, 10) ||
      ""
    );
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

  const tradingEquity = useMemo(() => {
    const starting = plan?.startingBalance ?? 0;
    return starting + totalTradingPnl;
  }, [plan, totalTradingPnl]);

  const accountEquity = useMemo(() => tradingEquity + cashflowNet, [tradingEquity, cashflowNet]);
  const targetEquity = useMemo(() => Math.max(0, toNum(plan?.targetBalance, 0)), [plan]);
  const withdrawals = useMemo(() => normalizePlannedWithdrawals(plan?.plannedWithdrawals), [plan]);
  const totalPlannedWithdrawal = useMemo(() => getTotalPlannedWithdrawalAmount(withdrawals), [withdrawals]);
  const takenPlannedWithdrawal = useMemo(() => getTakenPlannedWithdrawalAmount(withdrawals), [withdrawals]);
  const totalWealthProduced = useMemo(
    () => accountEquity + takenPlannedWithdrawal,
    [accountEquity, takenPlannedWithdrawal]
  );

  const progressPct = useMemo(() => {
    if (!targetEquity || targetEquity <= 0) return 0;
    return Math.max(0, Math.min(1.25, accountEquity / targetEquity));
  }, [accountEquity, targetEquity]);

  const remainingToTarget = useMemo(() => {
    if (!targetEquity) return 0;
    return Math.max(0, targetEquity - accountEquity);
  }, [accountEquity, targetEquity]);

  const planStyleLabel = useMemo(() => {
    if (!plan?.planStyle) return L("Balanced", "Balanceado");
    if (plan.planStyle === "conservative") return L("Conservative", "Conservador");
    if (plan.planStyle === "aggressive") return L("Aggressive", "Agresivo");
    return L("Balanced", "Balanceado");
  }, [plan, L]);

  const planModeLabel = useMemo(() => {
    if (!plan?.planMode || plan.planMode === "auto") return L("Automatic (date-based)", "Automático (por fecha)");
    return L("Manual phases", "Fases manuales");
  }, [plan, L]);

  const phases = useMemo(() => normalizePhases((plan as any)?.planPhases ?? (plan as any)?.plan_phases), [plan]);

  const currentPhase = useMemo(() => {
    if (!phases.length) return null;
    const sorted = [...phases].sort((a, b) => a.targetEquity - b.targetEquity);
    const next = sorted.find((p) => accountEquity < p.targetEquity);
    return next || sorted[sorted.length - 1];
  }, [phases, accountEquity]);

  const phaseRows = useMemo(() => {
    if (!plan || phases.length === 0) return [] as Array<any>;
    const sorted = [...phases].sort((a, b) => a.targetEquity - b.targetEquity);
    const base = plan.startingBalance ?? 0;
    return sorted.map((p, idx) => {
      const prev = idx === 0 ? base : sorted[idx - 1].targetEquity;
      const span = Math.max(1, p.targetEquity - prev);
      const progress = Math.max(0, Math.min(1.25, (accountEquity - prev) / span));
      return {
        ...p,
        prevTarget: prev,
        progress,
        remaining: Math.max(0, p.targetEquity - accountEquity),
      };
    });
  }, [plan, phases, accountEquity]);

  const phaseRanking = useMemo(() => {
    if (!phaseRows.length) return [] as Array<any>;
    return [...phaseRows].sort((a, b) => b.progress - a.progress);
  }, [phaseRows]);

  const dailyGoalPct =
    (plan?.dailyTargetPct ?? plan?.dailyGoalPercent ?? 0) as number;
  const dailyGoalUsd = accountEquity * (dailyGoalPct / 100);
  const maxLossUsd = accountEquity * ((plan?.maxDailyLossPercent ?? 0) / 100);

  const targetDate = plan?.targetDate ?? null;
  const daysToTarget = planStartDate && targetDate ? daysBetween(planStartDate, targetDate) : 0;
  const daysRemaining = targetDate ? daysBetween(isoToday(), targetDate) : 0;
  const monthsRemaining = daysRemaining > 0 ? daysRemaining / 30.4 : 0;
  const monthlyTarget = monthsRemaining > 0 ? remainingToTarget / monthsRemaining : 0;
  const weeklyTarget = daysRemaining > 0 ? remainingToTarget / (daysRemaining / 7) : 0;

  const reachedPending = useMemo(() => {
    return withdrawals.find(
      (w) =>
        (w.status ?? "pending") === "pending" &&
        accountEquity >= (w.projectedEquityBeforeWithdrawal ?? w.targetEquity ?? 0)
    );
  }, [withdrawals, accountEquity]);

  async function updateWithdrawalStatus(id: string, status: "taken" | "skipped") {
    if (!plan || !activeAccountId) return;
    const next = withdrawals.map((w) =>
      w.id === id
        ? {
            ...w,
            status,
            achievedAt: w.achievedAt ?? isoToday(),
            decidedAt: isoToday(),
          }
        : w
    );
    setPlan({ ...plan, plannedWithdrawals: next });
    await upsertGrowthPlanSupabase({ plannedWithdrawals: next }, activeAccountId);
  }

  async function onConfirmWithdrawal(item: PlannedWithdrawal) {
    if (!planUserId || !activeAccountId) return;
    const ok = window.confirm(
      L(
        `Confirm withdrawal of ${currency(item.amount, localeTag)}? This will add a cashflow entry.`,
        `¿Confirmar retiro de ${currency(item.amount, localeTag)}? Se añadirá un cashflow.`
      )
    );
    if (!ok) return;
    setActionId(item.id);
    try {
      if (item.amount > 0) {
        await createCashflow({
          userId: planUserId,
          accountId: activeAccountId,
          date: isoToday(),
          type: "withdrawal",
          amount: Math.abs(item.amount),
          note: item.periodLabel
            ? `Planned withdrawal · ${item.periodLabel}`
            : "Planned withdrawal",
          reasonCode: "profit_distribution",
          sourceModule: "growth_plan",
          linkedPlanWithdrawalId: item.id,
        });
      }
      await updateWithdrawalStatus(item.id, "taken");
      await reloadAll();
    } catch (err) {
      console.error("[PlanSummary] confirm withdrawal error:", err);
      setError(L("Could not confirm the withdrawal.", "No pudimos confirmar el retiro."));
    } finally {
      setActionId(null);
    }
  }

  async function onSkipWithdrawal(item: PlannedWithdrawal) {
    if (!plan || !activeAccountId) return;
    setActionId(item.id);
    try {
      await updateWithdrawalStatus(item.id, "skipped");
      await reloadAll();
    } catch (err) {
      console.error("[PlanSummary] skip withdrawal error:", err);
      setError(L("Could not update this withdrawal.", "No pudimos actualizar este retiro."));
    } finally {
      setActionId(null);
    }
  }

  if (loading || !user || loadingData) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">
          {L("Loading your plan summary...", "Cargando resumen del plan...")}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-emerald-400 uppercase tracking-[0.24em] text-[11px]">Neuro Trader Journal</p>
            <h1 className="text-3xl font-semibold">{L("Plan Summary", "Resumen del plan")}</h1>
            <p className="text-sm text-slate-400 mt-1">
              {L(
                "Wall‑Street style briefing of your Growth Plan, targets, and risk envelope.",
                "Briefing estilo Wall‑Street de tu plan, metas y rango de riesgo."
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/growth-plan"
              className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              {L("Edit growth plan →", "Editar plan →")}
            </Link>
            <Link
              href="/performance/plan"
              className="inline-flex items-center rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              {L("Cashflow tracking →", "Cashflow →")}
            </Link>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            {error}
          </div>
        ) : null}

        {!plan ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">
            {L("No Growth Plan found yet.", "Aún no hay un Growth Plan.")}{" "}
            <Link className="text-emerald-300 hover:text-emerald-200 underline" href="/growth-plan">
              {L("Create your plan", "Crea tu plan")}
            </Link>
            .
          </div>
        ) : (
          <>
            {reachedPending ? (
              <section className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200">
                      {L("Withdrawal milestone reached", "Meta de retiro alcanzada")}
                    </p>
                    <p className="text-sm text-slate-200 mt-1">
                      {L(
                        "You reached the planned withdrawal level.",
                        "Llegaste al nivel de retiro planificado."
                      )}{" "}
                      <span className="font-semibold text-amber-200">
                        {currency(reachedPending.amount, localeTag)}
                      </span>{" "}
                      {L("at", "en")}{" "}
                      {currency(
                        reachedPending.projectedEquityBeforeWithdrawal ?? reachedPending.targetEquity,
                        localeTag
                      )}{" "}
                      {L("equity", "equity")}
                      {reachedPending.periodLabel ? (
                        <>
                          {" "}
                          · <span className="text-slate-300">{reachedPending.periodLabel}</span>
                        </>
                      ) : null}
                      {reachedPending.plannedDate ? (
                        <>
                          {" "}
                          · <span className="text-slate-400">{formatDate(reachedPending.plannedDate)}</span>
                        </>
                      ) : null}
                      .
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onConfirmWithdrawal(reachedPending)}
                      disabled={actionId === reachedPending.id}
                      className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                    >
                      {L("Confirm withdrawal", "Confirmar retiro")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onSkipWithdrawal(reachedPending)}
                      disabled={actionId === reachedPending.id}
                      className="rounded-lg border border-amber-300/60 px-3 py-1.5 text-xs font-medium text-amber-100 hover:border-amber-200"
                    >
                      {L("Continue without withdrawal", "Continuar sin retiro")}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {/* Snapshot cards */}
            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Plan start", "Inicio del plan")}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {currency(plan.startingBalance ?? 0, localeTag)}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {L("Start date:", "Fecha inicio:")}{" "}
                  <span className="text-slate-200">{formatDate(planStartDate)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Target", "Meta")}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {currency(targetEquity || 0, localeTag)}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {L("Target date:", "Fecha meta:")}{" "}
                  <span className="text-slate-200">{formatDate(targetDate)}</span>
                </div>
                {totalPlannedWithdrawal > 0 ? (
                  <div className="mt-1 text-xs text-slate-500">
                    {L("Planned withdrawals:", "Retiros planificados:")}{" "}
                    <span className="text-sky-300">{currency(totalPlannedWithdrawal, localeTag)}</span>
                  </div>
                ) : null}
                {plan.targetMultiple ? (
                  <div className="mt-1 text-xs text-slate-500">
                    {L("Target multiple:", "Multiplicador:")}{" "}
                    <span className="text-slate-300">{plan.targetMultiple.toFixed(2)}x</span>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Account equity", "Equity de cuenta")}
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {currency(accountEquity, localeTag)}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {L("Trading P&L:", "P&L trading:")}{" "}
                  <span className={totalTradingPnl >= 0 ? "text-emerald-300" : "text-sky-300"}>
                    {totalTradingPnl >= 0 ? "+" : "-"}
                    {currency(Math.abs(totalTradingPnl), localeTag)}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Progress", "Progreso")}
                </div>
                <div className="mt-1 text-2xl font-semibold">{(progressPct * 100).toFixed(1)}%</div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-800">
                  <div
                    className="h-2 rounded-full bg-emerald-400"
                    style={{ width: `${Math.min(100, progressPct * 100)}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {L("Remaining:", "Restante:")}{" "}
                  <span className="text-slate-200">{currency(remainingToTarget, localeTag)}</span>
                </div>
                {takenPlannedWithdrawal > 0 ? (
                  <div className="mt-1 text-xs text-slate-500">
                    {L("Wealth produced incl. taken withdrawals:", "Capital producido incl. retiros tomados:")}{" "}
                    <span className="text-slate-200">{currency(totalWealthProduced, localeTag)}</span>
                  </div>
                ) : null}
              </div>
            </section>

            {/* Plan briefing */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Plan brief", "Resumen del plan")}
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Plan style", "Estilo")}</span>
                    <span className="font-semibold">{planStyleLabel}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Plan mode", "Modo")}</span>
                    <span className="font-semibold">{planModeLabel}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Selected plan", "Plan elegido")}</span>
                    <span className="font-semibold">
                      {plan.selectedPlan === "suggested"
                        ? L("Suggested", "Sugerido")
                        : plan.selectedPlan === "chosen"
                          ? L("Chosen", "Elegido")
                          : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Trading days", "Días de trading")}</span>
                    <span className="font-semibold">{plan.tradingDays ?? 0}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Loss days/week", "Días pérdida/sem")}</span>
                    <span className="font-semibold">{plan.lossDaysPerWeek ?? 0}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Planned withdrawals", "Retiros planificados")}</span>
                    <span className="font-semibold">
                      {withdrawals.length > 0 ? currency(totalPlannedWithdrawal, localeTag) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Taken so far", "Tomados hasta ahora")}</span>
                    <span className="font-semibold">
                      {takenPlannedWithdrawal > 0 ? currency(takenPlannedWithdrawal, localeTag) : "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Risk envelope", "Rango de riesgo")}
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Daily goal", "Meta diaria")}</span>
                    <span className="font-semibold">
                      {currency(dailyGoalUsd, localeTag)}{" "}
                      <span className="text-slate-500">({dailyGoalPct.toFixed(2)}%)</span>
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Max daily loss", "Pérdida diaria máx")}</span>
                    <span className="font-semibold">
                      {currency(maxLossUsd, localeTag)}{" "}
                      <span className="text-slate-500">
                        ({(plan.maxDailyLossPercent ?? 0).toFixed(2)}%)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Risk per trade", "Riesgo por trade")}</span>
                    <span className="font-semibold">
                      {(plan.maxRiskPerTradePercent ?? 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-[11px] text-slate-500 tracking-widest uppercase">
                  {L("Timeline", "Calendario")}
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Days to target", "Días a meta")}</span>
                    <span className="font-semibold">{daysToTarget || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Days remaining", "Días restantes")}</span>
                    <span className="font-semibold">{daysRemaining || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Monthly target", "Meta mensual")}</span>
                    <span className="font-semibold">
                      {monthsRemaining > 0 ? currency(monthlyTarget, localeTag) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-400">{L("Weekly target", "Meta semanal")}</span>
                    <span className="font-semibold">
                      {daysRemaining > 0 ? currency(weeklyTarget, localeTag) : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Planned withdrawals */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-slate-500 tracking-widest uppercase">
                    {L("Planned withdrawals", "Retiros planificados")}
                  </p>
                  <p className="text-sm text-slate-400">
                    {L(
                      "Confirm each withdrawal when the equity milestone is reached.",
                      "Confirma cada retiro cuando alcanzas la meta."
                    )}
                  </p>
                </div>
              </div>

              {withdrawals.length === 0 ? (
                <div className="mt-4 text-sm text-slate-400">
                  {L("No planned withdrawals yet.", "Aún no hay retiros planificados.")}
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {withdrawals.map((w) => (
                    <div
                      key={w.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3"
                    >
                      <div>
                        <div className="text-sm text-slate-200">
                          {currency(w.amount, localeTag)} {L("at", "a")}{" "}
                          <span className="text-emerald-300">
                            {currency(w.projectedEquityBeforeWithdrawal ?? w.targetEquity, localeTag)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {L("Status", "Estado")}:{" "}
                          <span className="text-slate-200">
                            {w.status === "taken"
                              ? L("Confirmed", "Confirmado")
                              : w.status === "skipped"
                                ? L("Skipped", "Omitido")
                                : L("Pending", "Pendiente")}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {w.periodLabel ? (
                            <span className="text-slate-300">{w.periodLabel}</span>
                          ) : null}
                          {w.plannedDate ? (
                            <span className="ml-2">{L("Planned date", "Fecha planificada")}: <span className="text-slate-300">{formatDate(w.plannedDate)}</span></span>
                          ) : null}
                        </div>
                        {w.projectedEquityAfterWithdrawal != null ? (
                          <div className="text-xs text-slate-500">
                            {L("Projected equity after withdrawal", "Equity proyectado después del retiro")}:{" "}
                            <span className="text-slate-300">
                              {currency(w.projectedEquityAfterWithdrawal, localeTag)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      {(w.status ?? "pending") === "pending" &&
                      accountEquity >= (w.projectedEquityBeforeWithdrawal ?? w.targetEquity) ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onConfirmWithdrawal(w)}
                            disabled={actionId === w.id}
                            className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                          >
                            {L("Confirm", "Confirmar")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSkipWithdrawal(w)}
                            disabled={actionId === w.id}
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500"
                          >
                            {L("Continue", "Continuar")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {plan?.planMode === "manual" ? (
              <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div>
                  <p className="text-[11px] text-slate-500 tracking-widest uppercase">
                    {L("Manual phases", "Fases manuales")}
                  </p>
                  <p className="text-sm text-slate-400">
                    {L(
                      "Short‑term milestones that ladder into your long‑term target.",
                      "Metas corto plazo que escalan hacia tu meta de largo plazo."
                    )}
                  </p>
                </div>

                {phaseRows.length === 0 ? (
                  <div className="mt-4 text-sm text-slate-400">
                    {L("No phases configured yet.", "Aún no hay fases configuradas.")}
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {phaseRows.map((phase) => (
                      <div
                        key={phase.id}
                        className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm text-slate-200">
                            {phase.title || L("Phase", "Fase")}
                          </div>
                          <div className="text-xs text-slate-500">
                            {L("Target:", "Meta:")}{" "}
                            <span className="text-emerald-300">{currency(phase.targetEquity, localeTag)}</span>
                            {phase.targetDate ? (
                              <>
                                {" "}
                                · {L("Date:", "Fecha:")}{" "}
                                <span className="text-slate-200">{phase.targetDate}</span>
                              </>
                            ) : null}
                          </div>
                          <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className="h-2 bg-linear-to-r from-emerald-400 via-emerald-300 to-sky-400"
                              style={{ width: `${Math.min(100, phase.progress * 100)}%` }}
                            />
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">
                            {L("Progress:", "Progreso:")}{" "}
                            <span className="text-slate-200">{(phase.progress * 100).toFixed(1)}%</span>{" "}
                            · {L("Remaining", "Falta")}:{" "}
                            <span className="text-slate-200">{currency(phase.remaining, localeTag)}</span>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">
                          {L("Status:", "Estado:")}{" "}
                          <span className="text-slate-200">
                            {phase.status === "completed" ? L("Completed", "Completada") : L("Pending", "Pendiente")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {currentPhase ? (
                  <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-400/10 p-3">
                    <p className="text-xs text-emerald-200 uppercase tracking-[0.2em]">
                      {L("Current phase", "Fase actual")}
                    </p>
                    <p className="text-sm text-slate-200 mt-1">
                      {currentPhase.title || L("Phase", "Fase")} ·{" "}
                      {currency(currentPhase.targetEquity, localeTag)}
                    </p>
                  </div>
                ) : null}

                {phaseRanking.length > 0 ? (
                  <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="text-xs text-slate-500 uppercase tracking-[0.2em]">
                      {L("Internal phase ranking", "Ranking interno de fases")}
                    </p>
                    <div className="mt-2 space-y-2 text-xs text-slate-300">
                      {phaseRanking.slice(0, 5).map((phase, idx) => (
                        <div key={phase.id} className="flex items-center justify-between">
                          <span>
                            #{idx + 1} {phase.title || L("Phase", "Fase")}
                          </span>
                          <span className="text-emerald-300">{(phase.progress * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
