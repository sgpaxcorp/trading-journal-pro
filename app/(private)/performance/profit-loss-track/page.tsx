"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import {
  listProfitLossCosts,
  createProfitLossCost,
  deleteProfitLossCost,
  type ProfitLossCost,
  type BillingCycle,
  type CostCategory,
} from "@/lib/profitLossTrackSupabase";
import { listDailySnapshots, type DailySnapshotRow } from "@/lib/snapshotSupabase";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import type { JournalEntry } from "@/lib/journalTypes";

type RangeKey = "qtd" | "ytd" | "fiscal" | "custom";
type TabKey = "summary" | "income" | "balance" | "cashflow" | "costs";

const BILLING_DAYS: Record<BillingCycle, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  semiannual: 182,
  annual: 365,
  one_time: 0,
};

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfQuarter(date: Date) {
  const q = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), q * 3, 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function startOfFiscal(date: Date) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - 1);
  d.setDate(d.getDate() + 1);
  return d;
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

function toNumberOrNull(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseTradeCosts(entry: JournalEntry | null | undefined) {
  const notes = parseNotesJson(entry?.notes);
  const fees = toNumberOrNull(notes?.costs?.fees ?? notes?.fees);
  const commissions = toNumberOrNull(notes?.costs?.commissions ?? notes?.commissions);
  const f = fees ?? 0;
  const c = commissions ?? 0;
  return { fees: f, commissions: c, total: f + c };
}

function clampRange(start: Date, end: Date, min: Date, max: Date) {
  const s = start > min ? start : min;
  const e = end < max ? end : max;
  if (e < s) return null;
  return { start: s, end: e };
}

function daysBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)) + 1);
}

function currency(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function ProfitLossTrackPage() {
  const { user, loading: authLoading } = useAuth() as any;
  const { plan, loading: planLoading } = useUserPlan();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const L = (en: string, es: string) => (lang === "es" ? es : en);

  const { activeAccountId } = useTradingAccounts();

  const CATEGORY_LABELS: Record<CostCategory, { en: string; es: string }> = {
    subscription: { en: "Subscription", es: "Suscripción" },
    data: { en: "Market data", es: "Data de mercado" },
    education: { en: "Education", es: "Educación" },
    funding: { en: "Funding accounts", es: "Cuentas de fondeo" },
    software: { en: "Software/tools", es: "Software/herramientas" },
    other: { en: "Other", es: "Otros" },
  };

  const CYCLE_LABELS: Record<BillingCycle, { en: string; es: string }> = {
    weekly: { en: "Weekly", es: "Semanal" },
    monthly: { en: "Monthly", es: "Mensual" },
    quarterly: { en: "Quarterly", es: "Trimestral" },
    semiannual: { en: "Semi-annual", es: "Semestral" },
    annual: { en: "Annual", es: "Anual" },
    one_time: { en: "One-time", es: "Único" },
  };

  const [rangeKey, setRangeKey] = useState<RangeKey>("ytd");
  const [customRange, setCustomRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [tab, setTab] = useState<TabKey>("summary");
  const [costs, setCosts] = useState<ProfitLossCost[]>([]);
  const [snapshots, setSnapshots] = useState<DailySnapshotRow[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    category: "subscription" as CostCategory,
    billingCycle: "monthly" as BillingCycle,
    amount: "",
    vendor: "",
    startsAt: "",
    endsAt: "",
    notes: "",
  });

  const range = useMemo(() => {
    const today = new Date();
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const fallbackStart = new Date(end);
    fallbackStart.setDate(fallbackStart.getDate() - 29);

    if (rangeKey === "custom") {
      const customStartDate = parseDate(customRange.start) ?? fallbackStart;
      const customEndDate = parseDate(customRange.end) ?? end;
      const start = customStartDate <= customEndDate ? customStartDate : customEndDate;
      const finalEnd = customStartDate <= customEndDate ? customEndDate : customStartDate;
      return { start, end: finalEnd };
    }

    if (rangeKey === "qtd") {
      return { start: startOfQuarter(end), end };
    }

    if (rangeKey === "fiscal") {
      return { start: startOfFiscal(end), end };
    }

    return { start: startOfYear(end), end };
  }, [rangeKey, customRange.start, customRange.end]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [costRows, snapRows, entryRows] = await Promise.all([
          listProfitLossCosts(user.id, activeAccountId),
          listDailySnapshots(user.id, toIso(range.start), toIso(range.end), activeAccountId),
          getAllJournalEntries(user.id, activeAccountId),
        ]);
        if (cancelled) return;
        setCosts(costRows);
        setSnapshots(snapRows);
        setEntries(entryRows);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeAccountId, range.start, range.end]);

  const totals = useMemo(() => {
    const totalTrading = snapshots.reduce((sum, row) => sum + (row.realized_usd || 0), 0);
    const rangeDays = daysBetween(range.start, range.end);
    const rangeStartIso = toIso(range.start);
    const rangeEndIso = toIso(range.end);

    const tradeCosts = entries.reduce(
      (acc, entry) => {
        const date = String(entry?.date ?? "").slice(0, 10);
        if (!date || date < rangeStartIso || date > rangeEndIso) return acc;
        const costs = parseTradeCosts(entry);
        acc.fees += costs.fees;
        acc.commissions += costs.commissions;
        acc.total += costs.total;
        return acc;
      },
      { fees: 0, commissions: 0, total: 0 }
    );

    const costTotals = costs.map((cost) => {
      const cycleDays = BILLING_DAYS[cost.billing_cycle];
      if (cost.billing_cycle === "one_time") {
        const costDate = parseDate(cost.starts_at) || parseDate(cost.created_at) || null;
        if (!costDate) return { cost, value: 0 };
        if (costDate < range.start || costDate > range.end) return { cost, value: 0 };
        return { cost, value: cost.amount };
      }

      const costStart = parseDate(cost.starts_at) ?? new Date(2000, 0, 1);
      const costEnd = parseDate(cost.ends_at) ?? new Date(2999, 11, 31);
      const overlap = clampRange(range.start, range.end, costStart, costEnd);
      if (!overlap) return { cost, value: 0 };
      const overlapDays = daysBetween(overlap.start, overlap.end);
      const periods = cycleDays > 0 ? overlapDays / cycleDays : 0;
      const value = cost.amount * periods;
      return { cost, value };
    });

    const totalExpenses = costTotals.reduce((sum, item) => sum + item.value, 0);
    const netAfterCosts = totalTrading - totalExpenses;

    const byCategory = costTotals.reduce((acc, item) => {
      const key = item.cost.category;
      acc[key] = (acc[key] || 0) + item.value;
      return acc;
    }, {} as Record<CostCategory, number>);

    const activeCount = costs.filter((c) => c.amount > 0).length;

    return {
      totalTrading,
      tradeCosts,
      totalExpenses,
      netAfterCosts,
      byCategory,
      activeCount,
      rangeDays,
      startBalance: snapshots[0]?.start_of_day_balance ?? 0,
    };
  }, [costs, snapshots, entries, range]);

  const series = useMemo(() => {
    const days: string[] = [];
    const dayCursor = new Date(range.start);
    while (dayCursor <= range.end) {
      days.push(toIso(dayCursor));
      dayCursor.setDate(dayCursor.getDate() + 1);
    }

    const tradingByDate = new Map<string, number>();
    snapshots.forEach((row) => {
      tradingByDate.set(row.date, (tradingByDate.get(row.date) || 0) + (row.realized_usd || 0));
    });

    const expenseByDate = new Map<string, number>();
    costs.forEach((cost) => {
      if (cost.amount <= 0) return;
      const costStart = parseDate(cost.starts_at) ?? new Date(2000, 0, 1);
      const costEnd = parseDate(cost.ends_at) ?? new Date(2999, 11, 31);
      const overlap = clampRange(range.start, range.end, costStart, costEnd);
      if (!overlap) return;

      if (cost.billing_cycle === "one_time") {
        const costDate = parseDate(cost.starts_at) || parseDate(cost.created_at) || overlap.start;
        const dateKey = toIso(costDate);
        expenseByDate.set(dateKey, (expenseByDate.get(dateKey) || 0) + cost.amount);
        return;
      }

      const cycleDays = BILLING_DAYS[cost.billing_cycle] || 30;
      const perDay = cost.amount / cycleDays;
      const cursor = new Date(overlap.start);
      while (cursor <= overlap.end) {
        const key = toIso(cursor);
        expenseByDate.set(key, (expenseByDate.get(key) || 0) + perDay);
        cursor.setDate(cursor.getDate() + 1);
      }
    });

    let cumulativeNet = 0;
    return days.map((date) => {
      const trading = tradingByDate.get(date) || 0;
      const expenses = expenseByDate.get(date) || 0;
      const net = trading - expenses;
      cumulativeNet += net;
      return { date, trading, expenses, net, cumulativeNet };
    });
  }, [costs, snapshots, range]);

  const statements = useMemo(() => {
    const operatingCash = totals.startBalance + totals.totalTrading - totals.totalExpenses;
    const assets = operatingCash;
    const liabilities = 0;
    const equity = assets - liabilities;
    return {
      operatingCash,
      assets,
      liabilities,
      equity,
    };
  }, [totals]);

  const addCost = async () => {
    if (!user?.id) return;
    if (!form.name || !form.amount) return;
    try {
      setError(null);
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError(L("Enter a valid amount", "Ingresa un monto válido"));
        return;
      }
      await createProfitLossCost({
        userId: user.id,
        accountId: activeAccountId,
        name: form.name,
        category: form.category,
        billingCycle: form.billingCycle,
        amount,
        vendor: form.vendor || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        notes: form.notes || null,
      });
      setForm({
        name: "",
        category: "subscription",
        billingCycle: "monthly",
        amount: "",
        vendor: "",
        startsAt: "",
        endsAt: "",
        notes: "",
      });
      const refreshed = await listProfitLossCosts(user.id, activeAccountId);
      setCosts(refreshed);
    } catch (err: any) {
      setError(err?.message || L("Failed to add cost", "No se pudo agregar"));
    }
  };

  const removeCost = async (id: string) => {
    if (!user?.id) return;
    try {
      await deleteProfitLossCost(user.id, id);
      setCosts((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      setError(err?.message || L("Failed to delete", "No se pudo borrar"));
    }
  };

  if (planLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-16">
          <p className="text-sm text-slate-400">{L("Loading…", "Cargando…")}</p>
        </div>
      </main>
    );
  }

  if (plan !== "advanced") {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-emerald-300 text-[11px] uppercase tracking-[0.3em]">
              {L("Advanced feature", "Función Advanced")}
            </p>
            <h1 className="text-xl font-semibold mt-2">
              {L(
                "Profit & Loss Track is included in Advanced",
                "Profit & Loss Track está incluido en Advanced"
              )}
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              {L(
                "Track your trading business expenses, subscriptions, and net profitability with full visibility.",
                "Controla tus gastos, suscripciones y rentabilidad neta con visibilidad total."
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/billing"
                className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
              >
                {L("Upgrade to Advanced", "Actualizar a Advanced")}
              </Link>
              <Link
                href="/plans-comparison"
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-emerald-400 transition"
              >
                {L("Compare plans", "Comparar planes")}
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-emerald-300 text-[11px] uppercase tracking-[0.35em]">
              {L("Profit & Loss Track", "Profit & Loss Track")}
            </p>
            <h1 className="text-3xl font-semibold mt-2">
              {L("Trading business accounting", "Contabilidad del negocio de trading")}
            </h1>
            <p className="text-slate-400 text-sm mt-2 max-w-2xl">
              {L(
                "Track subscriptions, education, data feeds, funding programs, and see if your trading profit covers the real cost of operating.",
                "Registra suscripciones, educación, data feeds, programas de fondeo y verifica si tu profit cubre los costos reales de operar."
              )}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {(["qtd", "ytd", "fiscal", "custom"] as RangeKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setRangeKey(key)}
                  className={`rounded-full border px-3 py-1 transition ${
                    rangeKey === key
                      ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                      : "border-slate-700 text-slate-300 hover:border-emerald-400/70"
                  }`}
                >
                  {L(
                    key === "qtd"
                      ? "QTD"
                      : key === "ytd"
                      ? "YTD"
                      : key === "fiscal"
                      ? "Fiscal year"
                      : "Custom",
                    key === "qtd"
                      ? "QTD"
                      : key === "ytd"
                      ? "YTD"
                      : key === "fiscal"
                      ? "Año fiscal"
                      : "Personalizado"
                  )}
                </button>
              ))}
            </div>
            {rangeKey === "custom" && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="date"
                  value={customRange.start || toIso(range.start)}
                  onChange={(e) => setCustomRange((prev) => ({ ...prev, start: e.target.value }))}
                  className="rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1 text-[11px]"
                />
                <span className="text-slate-500">→</span>
                <input
                  type="date"
                  value={customRange.end || toIso(range.end)}
                  onChange={(e) => setCustomRange((prev) => ({ ...prev, end: e.target.value }))}
                  className="rounded-lg border border-slate-700 bg-slate-950/70 px-2 py-1 text-[11px]"
                />
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-2 text-xs">
          {([
            { key: "summary", label: L("Summary dashboard", "Resumen") },
            { key: "income", label: L("Income statement", "Estado de resultados") },
            { key: "balance", label: L("Balance sheet", "Balance general") },
            { key: "cashflow", label: L("Cashflow statement", "Flujo de caja") },
            { key: "costs", label: L("Costs & subscriptions", "Costos y suscripciones") },
          ] as { key: TabKey; label: string }[]).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-full border px-3 py-1 transition ${
                tab === item.key
                  ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                  : "border-slate-700 text-slate-300 hover:border-emerald-400/70"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "summary" && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              {[{
                label: L("Trading P&L (net)", "P&L de trading (neto)"),
                value: currency(totals.totalTrading),
                hint: L("After commissions & fees", "Luego de comisiones y fees"),
              }, {
                label: L("Trading costs", "Costos de trading"),
                value: currency(totals.tradeCosts.total),
                hint: L("Commissions + fees", "Comisiones + fees"),
              }, {
                label: L("Operating expenses", "Gastos operativos"),
                value: currency(totals.totalExpenses),
                hint: L("Subscriptions & tools", "Suscripciones y herramientas"),
              }, {
                label: L("Net after costs", "Neto después de costos"),
                value: currency(totals.netAfterCosts),
                hint: L("Trading net minus expenses", "Neto de trading menos gastos"),
              }].map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{card.label}</p>
                  <p className="text-2xl font-semibold mt-2">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{card.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{L("Net profitability trend", "Tendencia de rentabilidad neta")}</h3>
                  <span className="text-[11px] text-slate-500">{L("After expenses", "Después de gastos")}</span>
                </div>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <Tooltip
                        formatter={(value: any) => currency(Number(value))}
                        labelStyle={{ color: "#0f172a" }}
                      />
                      <Line type="monotone" dataKey="net" stroke="#34d399" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="cumulativeNet" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{L("Expense mix", "Mix de gastos")}</h3>
                  <span className="text-[11px] text-slate-500">{L("By category", "Por categoría")}</span>
                </div>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(Object.keys(totals.byCategory) as CostCategory[]).map((key) => ({
                        category: L(CATEGORY_LABELS[key].en, CATEGORY_LABELS[key].es),
                        value: totals.byCategory[key] || 0,
                      }))}
                    >
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="category" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <Tooltip
                        formatter={(value: any) => currency(Number(value))}
                        labelStyle={{ color: "#0f172a" }}
                      />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {Object.keys(totals.byCategory).length === 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    {L("Add costs to see a breakdown.", "Agrega costos para ver el desglose.")}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {tab === "income" && (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-lg font-semibold">{L("Income statement", "Estado de resultados")}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {L("Derived from realized trading P&L and recorded expenses.", "Derivado del P&L realizado y los gastos registrados.")}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>{L("Trading P&L (gross)", "P&L de trading (bruto)")}</span>
                <span className="font-semibold">{currency(totals.totalTrading + totals.tradeCosts.total)}</span>
              </div>
              <div className="flex items-center justify-between text-rose-200/80">
                <span>{L("Commissions & fees", "Comisiones y fees")}</span>
                <span className="font-semibold">-{currency(totals.tradeCosts.total)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{L("Trading P&L (net)", "P&L de trading (neto)")}</span>
                <span className="font-semibold">{currency(totals.totalTrading)}</span>
              </div>
              <div className="flex items-center justify-between text-rose-200/80">
                <span>{L("Operating expenses", "Gastos operativos")}</span>
                <span className="font-semibold">-{currency(totals.totalExpenses)}</span>
              </div>
              <div className="h-px bg-slate-800" />
              <div className="flex items-center justify-between text-emerald-200">
                <span className="font-semibold">{L("Net income", "Utilidad neta")}</span>
                <span className="font-semibold">{currency(totals.netAfterCosts)}</span>
              </div>
            </div>
          </div>
        )}

        {tab === "balance" && (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-lg font-semibold">{L("Balance sheet", "Balance general")}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {L("Simplified view based on tracked cash and operating costs.", "Vista simplificada basada en cash y costos operativos registrados.")}
            </p>
            <div className="mt-4 grid gap-6 md:grid-cols-2 text-sm">
              <div>
                <h3 className="text-xs uppercase tracking-[0.2em] text-slate-400">{L("Assets", "Activos")}</h3>
                <div className="mt-2 flex items-center justify-between">
                  <span>{L("Operating cash", "Caja operativa")}</span>
                  <span className="font-semibold">{currency(statements.assets)}</span>
                </div>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-[0.2em] text-slate-400">{L("Liabilities & equity", "Pasivos y patrimonio")}</h3>
                <div className="mt-2 flex items-center justify-between">
                  <span>{L("Liabilities", "Pasivos")}</span>
                  <span className="font-semibold">{currency(statements.liabilities)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{L("Owner's equity", "Patrimonio")}</span>
                  <span className="font-semibold">{currency(statements.equity)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "cashflow" && (
          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
            <h2 className="text-lg font-semibold">{L("Cashflow statement", "Estado de flujo de caja")}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {L("Operating cashflow derived from trading results minus expenses.", "Flujo operativo derivado del P&L menos gastos.")}
            </p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>{L("Net operating cashflow", "Flujo operativo neto")}</span>
                <span className="font-semibold">{currency(totals.netAfterCosts)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>{L("Investing cashflow", "Flujo de inversión")}</span>
                <span className="font-semibold">{currency(0)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>{L("Financing cashflow", "Flujo de financiamiento")}</span>
                <span className="font-semibold">{currency(0)}</span>
              </div>
              <div className="h-px bg-slate-800" />
              <div className="flex items-center justify-between text-emerald-200">
                <span className="font-semibold">{L("Net change in cash", "Cambio neto en caja")}</span>
                <span className="font-semibold">{currency(totals.netAfterCosts)}</span>
              </div>
            </div>
          </div>
        )}

        {tab === "costs" && (
          <>
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {L("Expense ledger", "Registro de gastos")}
                  </h2>
                  <span className="text-xs text-slate-500">
                    {L("Range", "Rango")}: {toIso(range.start)} → {toIso(range.end)}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {costs.length === 0 && !loading ? (
                    <p className="text-sm text-slate-400">
                      {L("No costs added yet.", "Aún no agregas costos.")}
                    </p>
                  ) : (
                    costs.map((cost) => (
                      <div key={cost.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold">{cost.name}</p>
                          <p className="text-xs text-slate-400">
                            {L("Category", "Categoría")}: {L(
                              CATEGORY_LABELS[cost.category].en,
                              CATEGORY_LABELS[cost.category].es
                            )}{" "}
                            · {L("Cycle", "Ciclo")}: {L(
                              CYCLE_LABELS[cost.billing_cycle].en,
                              CYCLE_LABELS[cost.billing_cycle].es
                            )}
                          </p>
                          {cost.vendor && (
                            <p className="text-xs text-slate-500">{cost.vendor}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{currency(cost.amount)}</p>
                          <button
                            type="button"
                            onClick={() => removeCost(cost.id)}
                            className="text-[11px] text-red-300 hover:text-red-200"
                          >
                            {L("Remove", "Eliminar")}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <h2 className="text-lg font-semibold">
                  {L("Add a cost", "Agregar costo")}
                </h2>
                <div className="mt-4 space-y-3 text-xs">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder={L("Cost name", "Nombre del costo")}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={form.category}
                      onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as CostCategory }))}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    >
                      {["subscription", "data", "education", "funding", "software", "other"].map((c) => (
                        <option key={c} value={c}>
                          {L(
                            CATEGORY_LABELS[c as CostCategory].en,
                            CATEGORY_LABELS[c as CostCategory].es
                          )}
                        </option>
                      ))}
                    </select>
                    <select
                      value={form.billingCycle}
                      onChange={(e) => setForm((p) => ({ ...p, billingCycle: e.target.value as BillingCycle }))}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    >
                      {["weekly", "monthly", "quarterly", "semiannual", "annual", "one_time"].map((c) => (
                        <option key={c} value={c}>
                          {L(
                            CYCLE_LABELS[c as BillingCycle].en,
                            CYCLE_LABELS[c as BillingCycle].es
                          )}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={form.amount}
                      onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                      placeholder={L("Amount", "Monto")}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    />
                    <input
                      value={form.vendor}
                      onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))}
                      placeholder={L("Vendor (optional)", "Proveedor (opcional)")}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={form.startsAt}
                      onChange={(e) => setForm((p) => ({ ...p, startsAt: e.target.value }))}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    />
                    <input
                      type="date"
                      value={form.endsAt}
                      onChange={(e) => setForm((p) => ({ ...p, endsAt: e.target.value }))}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    />
                  </div>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder={L("Notes (optional)", "Notas (opcional)")}
                    rows={3}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={addCost}
                    className="w-full rounded-xl bg-emerald-400 text-slate-950 py-2 text-xs font-semibold hover:bg-emerald-300 transition"
                  >
                    {L("Add cost", "Agregar costo")}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <h2 className="text-lg font-semibold">
                {L("Cost breakdown", "Desglose de costos")}
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {(Object.keys(totals.byCategory) as CostCategory[]).map((key) => (
                  <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      {L(CATEGORY_LABELS[key].en, CATEGORY_LABELS[key].es)}
                    </p>
                    <p className="text-lg font-semibold">{currency(totals.byCategory[key] || 0)}</p>
                  </div>
                ))}
                {Object.keys(totals.byCategory).length === 0 && (
                  <p className="text-sm text-slate-500">{L("Add costs to see breakdown.", "Agrega costos para ver el desglose.")}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
