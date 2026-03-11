"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
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
  updateProfitLossCost,
  getProfitLossProfile,
  upsertProfitLossProfile,
  listProfitLossBudgets,
  listNormalizedTradeCosts,
  upsertProfitLossBudget,
  buildDefaultProfitLossProfile,
  type ProfitLossCost,
  type ProfitLossBudget,
  type ProfitLossProfile,
  type NormalizedTradeCostRow,
  type BillingCycle,
  type CostCategory,
  type TraderType,
} from "@/lib/profitLossTrackSupabase";
import {
  SUGGESTED_COST_PRESETS,
  TRADER_TYPE_LABELS,
  type SuggestedCostPreset,
} from "@/lib/profitLossTrackPresets";
import { listDailySnapshots, type DailySnapshotRow } from "@/lib/snapshotSupabase";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import type { JournalEntry } from "@/lib/journalTypes";

type RangeKey = "week" | "month" | "quarter" | "semiannual" | "annual";
type TabKey = "summary" | "income" | "runway" | "stack" | "vendors" | "budget" | "controls";
type TradeCostSource = "normalized_trades" | "journal_notes";

type CostFormState = {
  name: string;
  category: CostCategory;
  billingCycle: BillingCycle;
  amount: string;
  vendor: string;
  startsAt: string;
  endsAt: string;
  notes: string;
  includeInBreakEven: boolean;
  isActive: boolean;
  amortizationMonths: string;
  presetKey: string;
};

type BudgetFormState = Record<CostCategory, string>;

type AlertLevel = "high" | "medium" | "low";

const BILLING_DAYS: Record<BillingCycle, number> = {
  weekly: 7,
  monthly: 365 / 12,
  quarterly: 365 / 4,
  semiannual: 365 / 2,
  annual: 365,
  one_time: 0,
};

const RANGE_MONTHS: Record<RangeKey, number> = {
  week: 12 / 52,
  month: 1,
  quarter: 3,
  semiannual: 6,
  annual: 12,
};

const CATEGORY_LABELS: Record<CostCategory, { en: string; es: string }> = {
  subscription: { en: "Subscriptions", es: "Suscripciones" },
  data: { en: "Market data", es: "Data de mercado" },
  education: { en: "Education", es: "Educacion" },
  funding: { en: "Funding fees", es: "Fees de fondeo" },
  software: { en: "Platforms & software", es: "Plataformas y software" },
  mentorship: { en: "Mentorship", es: "Mentoria" },
  broker: { en: "Broker & execution", es: "Broker y ejecucion" },
  admin: { en: "Admin & business", es: "Admin y negocio" },
  other: { en: "Other", es: "Otros" },
};

const CYCLE_LABELS: Record<BillingCycle, { en: string; es: string }> = {
  weekly: { en: "Weekly", es: "Semanal" },
  monthly: { en: "Monthly", es: "Mensual" },
  quarterly: { en: "Quarterly", es: "Trimestral" },
  semiannual: { en: "Semi-annual", es: "Semestral" },
  annual: { en: "Annual", es: "Anual" },
  one_time: { en: "One-time", es: "Unico" },
};

const COST_CATEGORIES = Object.keys(CATEGORY_LABELS) as CostCategory[];

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfQuarter(date: Date) {
  const q = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), q * 3, 1);
}

function startOfSemiannual(date: Date) {
  const month = date.getMonth();
  return new Date(date.getFullYear(), month < 6 ? 0 : 6, 1);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1);
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function endOfQuarter(date: Date) {
  const start = startOfQuarter(date);
  return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}

function endOfSemiannual(date: Date) {
  const start = startOfSemiannual(date);
  return new Date(start.getFullYear(), start.getMonth() + 6, 0);
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31);
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
}

function clampRange(start: Date, end: Date, min: Date, max: Date) {
  const s = start > min ? start : min;
  const e = end < max ? end : max;
  if (e < s) return null;
  return { start: s, end: e };
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

function currency(n: number) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatPct(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "--";
  return `${(n * 100).toFixed(1)}%`;
}

function getRangeStart(today: Date, rangeKey: RangeKey) {
  if (rangeKey === "week") return startOfWeek(today);
  if (rangeKey === "month") return startOfMonth(today);
  if (rangeKey === "quarter") return startOfQuarter(today);
  if (rangeKey === "semiannual") return startOfSemiannual(today);
  return startOfYear(today);
}

function getRangeEnd(date: Date, rangeKey: RangeKey) {
  if (rangeKey === "week") return endOfWeek(date);
  if (rangeKey === "month") return endOfMonth(date);
  if (rangeKey === "quarter") return endOfQuarter(date);
  if (rangeKey === "semiannual") return endOfSemiannual(date);
  return endOfYear(date);
}

function getElapsedMonthFactor(rangeStart: Date, rangeEnd: Date, rangeKey: RangeKey) {
  const elapsedDays = Math.max(1, daysBetween(rangeStart, rangeEnd));
  const totalDays = Math.max(1, daysBetween(rangeStart, getRangeEnd(rangeStart, rangeKey)));
  return RANGE_MONTHS[rangeKey] * (elapsedDays / totalDays);
}

function getPreviousRange(rangeStart: Date, rangeEnd: Date, rangeKey: RangeKey) {
  const elapsedDays = Math.max(1, daysBetween(rangeStart, rangeEnd));

  if (rangeKey === "week") {
    const start = addDays(rangeStart, -7);
    return { start, end: addDays(start, elapsedDays - 1) };
  }

  if (rangeKey === "month") {
    const start = new Date(rangeStart.getFullYear(), rangeStart.getMonth() - 1, 1);
    const end = addDays(start, elapsedDays - 1);
    const cap = endOfMonth(start);
    return { start, end: end > cap ? cap : end };
  }

  if (rangeKey === "quarter") {
    const start = new Date(rangeStart.getFullYear(), rangeStart.getMonth() - 3, 1);
    const end = addDays(start, elapsedDays - 1);
    const cap = endOfQuarter(start);
    return { start, end: end > cap ? cap : end };
  }

  if (rangeKey === "semiannual") {
    const start = new Date(rangeStart.getFullYear(), rangeStart.getMonth() - 6, 1);
    const end = addDays(start, elapsedDays - 1);
    const cap = endOfSemiannual(start);
    return { start, end: end > cap ? cap : end };
  }

  const start = new Date(rangeStart.getFullYear() - 1, 0, 1);
  const end = addDays(start, elapsedDays - 1);
  const cap = endOfYear(start);
  return { start, end: end > cap ? cap : end };
}

function periodLabel(rangeKey: RangeKey, L: (en: string, es: string) => string) {
  if (rangeKey === "week") return L("This week", "Esta semana");
  if (rangeKey === "month") return L("This month", "Este mes");
  if (rangeKey === "quarter") return L("This quarter", "Este trimestre");
  if (rangeKey === "semiannual") return L("This semiannual period", "Este semestre");
  return L("This year", "Este ano");
}

function blankCostForm(): CostFormState {
  return {
    name: "",
    category: "subscription",
    billingCycle: "monthly",
    amount: "",
    vendor: "",
    startsAt: "",
    endsAt: "",
    notes: "",
    includeInBreakEven: true,
    isActive: true,
    amortizationMonths: "",
    presetKey: "",
  };
}

function blankBudgetForm(): BudgetFormState {
  return COST_CATEGORIES.reduce((acc, key) => {
    acc[key] = "";
    return acc;
  }, {} as BudgetFormState);
}

function formFromBudgets(budgets: ProfitLossBudget[]): BudgetFormState {
  const next = blankBudgetForm();
  budgets.forEach((budget) => {
    next[budget.category] = budget.monthly_amount > 0 ? String(budget.monthly_amount) : "";
  });
  return next;
}

function formFromCost(cost: ProfitLossCost): CostFormState {
  return {
    name: cost.name,
    category: cost.category,
    billingCycle: cost.billing_cycle,
    amount: String(cost.amount ?? ""),
    vendor: cost.vendor ?? "",
    startsAt: cost.starts_at ?? "",
    endsAt: cost.ends_at ?? "",
    notes: cost.notes ?? "",
    includeInBreakEven: cost.include_in_break_even ?? true,
    isActive: cost.is_active ?? true,
    amortizationMonths:
      cost.amortization_months == null || cost.amortization_months <= 0
        ? ""
        : String(cost.amortization_months),
    presetKey: cost.preset_key ?? "",
  };
}

function getBudgetStatus(row: {
  budgetToDate: number;
  utilization: number;
}) {
  if (row.budgetToDate <= 0) return "no-budget" as const;
  if (row.utilization > 1) return "over" as const;
  if (row.utilization > 0.8) return "near" as const;
  return "on-track" as const;
}

function defaultAmortizationMonths(cost: ProfitLossCost | SuggestedCostPreset) {
  const billingCycle = "billing_cycle" in cost ? cost.billing_cycle : cost.billingCycle;
  if (billingCycle !== "one_time") return null;
  if ("amortizationMonths" in cost && cost.amortizationMonths) return cost.amortizationMonths;
  if ("amortization_months" in cost && cost.amortization_months) return cost.amortization_months;
  return cost.category === "education" ? 12 : 1;
}

function monthlyEquivalent(cost: ProfitLossCost) {
  if ((cost.is_active ?? true) === false) return 0;
  if (cost.amount <= 0) return 0;
  switch (cost.billing_cycle) {
    case "weekly":
      return (cost.amount * 52) / 12;
    case "monthly":
      return cost.amount;
    case "quarterly":
      return cost.amount / 3;
    case "semiannual":
      return cost.amount / 6;
    case "annual":
      return cost.amount / 12;
    case "one_time": {
      const months = Math.max(1, defaultAmortizationMonths(cost) ?? 1);
      return cost.amount / months;
    }
    default:
      return cost.amount;
  }
}

function expenseForRange(cost: ProfitLossCost, rangeStart: Date, rangeEnd: Date) {
  if ((cost.is_active ?? true) === false || cost.amount <= 0) return 0;

  const startDate = parseDate(cost.starts_at) ?? parseDate(cost.created_at) ?? new Date(2000, 0, 1);
  if (cost.billing_cycle === "one_time") {
    const months = Math.max(1, defaultAmortizationMonths(cost) ?? 1);
    const amortizationEnd = addMonths(startDate, months);
    amortizationEnd.setDate(amortizationEnd.getDate() - 1);
    const overlap = clampRange(rangeStart, rangeEnd, startDate, amortizationEnd);
    if (!overlap) return 0;
    const totalDays = Math.max(1, daysBetween(startDate, amortizationEnd));
    const overlapDays = daysBetween(overlap.start, overlap.end);
    return cost.amount * (overlapDays / totalDays);
  }

  const costEnd = parseDate(cost.ends_at) ?? new Date(2999, 11, 31);
  const overlap = clampRange(rangeStart, rangeEnd, startDate, costEnd);
  if (!overlap) return 0;
  const overlapDays = daysBetween(overlap.start, overlap.end);
  const cycleDays = BILLING_DAYS[cost.billing_cycle] || 30;
  return cost.amount * (overlapDays / cycleDays);
}

function costCountsInBreakEven(cost: ProfitLossCost, profile: ProfitLossProfile) {
  if ((cost.is_active ?? true) === false) return false;
  if ((cost.include_in_break_even ?? true) === false) return false;
  if (cost.category === "education" && !profile.include_education_in_break_even) return false;
  return true;
}

function addBillingStep(date: Date, billingCycle: BillingCycle) {
  const next = new Date(date);
  switch (billingCycle) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      return next;
    case "quarterly":
      next.setMonth(next.getMonth() + 3);
      return next;
    case "semiannual":
      next.setMonth(next.getMonth() + 6);
      return next;
    case "annual":
      next.setFullYear(next.getFullYear() + 1);
      return next;
    default:
      return null;
  }
}

function nextRenewalDate(cost: ProfitLossCost, today: Date) {
  if ((cost.is_active ?? true) === false) return null;
  if (cost.billing_cycle === "one_time") return null;

  const endDate = parseDate(cost.ends_at);
  const baseDate = parseDate(cost.starts_at) ?? parseDate(cost.created_at);
  if (!baseDate) return null;
  if (endDate && endDate < today) return null;

  let next = new Date(baseDate);
  let guard = 0;
  while (next < today && guard < 500) {
    const stepped = addBillingStep(next, cost.billing_cycle);
    if (!stepped) return null;
    next = stepped;
    guard += 1;
  }

  if (endDate && next > endDate) return null;
  return next;
}

function daysUntil(date: Date, today: Date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const current = new Date(today);
  current.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
}

function downloadTextFile(filename: string, content: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsvFile(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const content = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  downloadTextFile(filename, content);
}

export default function ProfitLossTrackPage() {
  const { user } = useAuth() as any;
  const { plan, loading: planLoading } = useUserPlan();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const L = (en: string, es: string) => (lang === "es" ? es : en);
  const { activeAccountId } = useTradingAccounts();

  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const [tab, setTab] = useState<TabKey>("summary");
  const [profile, setProfile] = useState<ProfitLossProfile | null>(null);
  const [costs, setCosts] = useState<ProfitLossCost[]>([]);
  const [budgets, setBudgets] = useState<ProfitLossBudget[]>([]);
  const [snapshots, setSnapshots] = useState<DailySnapshotRow[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [tradeCostRows, setTradeCostRows] = useState<NormalizedTradeCostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null);
  const [selectedBudgetCategory, setSelectedBudgetCategory] = useState<CostCategory | null>(null);
  const [form, setForm] = useState<CostFormState>(blankCostForm());
  const [budgetForm, setBudgetForm] = useState<BudgetFormState>(blankBudgetForm());
  const [presetBusyKey, setPresetBusyKey] = useState<string | null>(null);

  const today = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }, []);

  const range = useMemo(() => {
    return {
      start: getRangeStart(today, rangeKey),
      end: today,
    };
  }, [today, rangeKey]);

  const previousRange = useMemo(() => getPreviousRange(range.start, range.end, rangeKey), [range, rangeKey]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const nextDay = new Date(range.end);
        nextDay.setDate(nextDay.getDate() + 1);
        const [costRows, profileRow, budgetRows, snapRows, entryRows, tradeRows] = await Promise.all([
          listProfitLossCosts(user.id, activeAccountId),
          getProfitLossProfile(user.id, activeAccountId),
          listProfitLossBudgets(user.id, activeAccountId),
          listDailySnapshots(user.id, toIso(range.start), toIso(range.end), activeAccountId),
          getAllJournalEntries(user.id, activeAccountId),
          listNormalizedTradeCosts({
            userId: user.id,
            accountId: activeAccountId,
            fromIso: `${toIso(range.start)}T00:00:00.000Z`,
            toIso: `${toIso(nextDay)}T00:00:00.000Z`,
          }),
        ]);

        if (cancelled) return;
        setCosts(costRows);
        setProfile(profileRow ?? buildDefaultProfitLossProfile(user.id, activeAccountId));
        setBudgets(budgetRows);
        setSnapshots(snapRows);
        setEntries(entryRows);
        setTradeCostRows(tradeRows);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || "Failed to load data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeAccountId, range.start, range.end]);

  useEffect(() => {
    setBudgetForm(formFromBudgets(budgets));
  }, [budgets]);

  const activeProfile = profile ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId);
  const periodTitle = periodLabel(rangeKey, L);

  const traderTypeSuggestions = useMemo(() => {
    return SUGGESTED_COST_PRESETS.filter((item) => item.traderTypes.includes(activeProfile.trader_type));
  }, [activeProfile.trader_type]);

  const totals = useMemo(() => {
    const totalTrading = snapshots.reduce((sum, row) => sum + (row.realized_usd || 0), 0);
    const rangeStartIso = toIso(range.start);
    const rangeEndIso = toIso(range.end);
    const journalTradeRecordCount = entries.filter((entry) => {
      const date = String(entry?.date ?? "").slice(0, 10);
      return !!date && date >= rangeStartIso && date <= rangeEndIso;
    }).length;

    const normalizedTradeCosts = tradeCostRows.reduce(
      (acc, row) => {
        acc.fees += row.fees || 0;
        acc.commissions += row.commissions || 0;
        acc.total += row.total_cost || 0;
        return acc;
      },
      { fees: 0, commissions: 0, total: 0 }
    );

    const journalTradeCosts = entries.reduce(
      (acc, entry) => {
        const date = String(entry?.date ?? "").slice(0, 10);
        if (!date || date < rangeStartIso || date > rangeEndIso) return acc;
        const costsLocal = parseTradeCosts(entry);
        acc.fees += costsLocal.fees;
        acc.commissions += costsLocal.commissions;
        acc.total += costsLocal.total;
        return acc;
      },
      { fees: 0, commissions: 0, total: 0 }
    );

    const tradeCostSource: TradeCostSource = tradeCostRows.length > 0 ? "normalized_trades" : "journal_notes";
    const tradeCosts = tradeCostSource === "normalized_trades" ? normalizedTradeCosts : journalTradeCosts;
    const tradeRecordCount = tradeCostSource === "normalized_trades" ? tradeCostRows.length : journalTradeRecordCount;

    const activeCosts = costs.filter((item) => (item.is_active ?? true) !== false);
    const periodExpenses = activeCosts.reduce((sum, cost) => sum + expenseForRange(cost, range.start, range.end), 0);
    const netAfterExpenses = totalTrading - periodExpenses;

    const expensesByCategory = activeCosts.reduce((acc, cost) => {
      const key = cost.category;
      acc[key] = (acc[key] || 0) + expenseForRange(cost, range.start, range.end);
      return acc;
    }, {} as Record<CostCategory, number>);

    const monthlyStackCost = activeCosts.reduce((sum, cost) => sum + monthlyEquivalent(cost), 0);
    const monthlyBreakEvenBase = activeCosts
      .filter((cost) => costCountsInBreakEven(cost, activeProfile))
      .reduce((sum, cost) => sum + monthlyEquivalent(cost), 0);

    const monthlyOwnerPay = activeProfile.include_owner_pay_in_break_even
      ? activeProfile.owner_pay_target_monthly
      : 0;

    const monthlyTradeCostDrag = tradeCosts.total / Math.max(RANGE_MONTHS[rangeKey], 0.0001);
    const monthlyBreakEven = monthlyBreakEvenBase + monthlyOwnerPay;
    const selectedPeriodBreakEven = monthlyBreakEven * RANGE_MONTHS[rangeKey];
    const dailyBreakEven = monthlyBreakEven / Math.max(1, activeProfile.trading_days_per_month);
    const perTradeBreakEven = monthlyBreakEven / Math.max(1, activeProfile.avg_trades_per_month);
    const surplusAfterBreakEven = netAfterExpenses - selectedPeriodBreakEven;
    const cashRunwayMonths = monthlyBreakEven > 0 ? activeProfile.initial_capital / monthlyBreakEven : null;
    const expenseRatio = totalTrading > 0 ? periodExpenses / totalTrading : null;

    return {
      totalTrading,
      tradeCosts,
      tradeRecordCount,
      tradeCostSource,
      periodExpenses,
      netAfterExpenses,
      expensesByCategory,
      monthlyStackCost,
      monthlyBreakEvenBase,
      monthlyOwnerPay,
      monthlyTradeCostDrag,
      monthlyBreakEven,
      selectedPeriodBreakEven,
      dailyBreakEven,
      perTradeBreakEven,
      surplusAfterBreakEven,
      cashRunwayMonths,
      expenseRatio,
      feePerRecord: tradeRecordCount > 0 ? tradeCosts.total / tradeRecordCount : null,
      activeCount: activeCosts.length,
    };
  }, [activeProfile, costs, entries, range, rangeKey, snapshots, tradeCostRows]);

  const tradeCostSourceLabel =
    totals.tradeCostSource === "normalized_trades"
      ? L("Broker sync / imports", "Sync del broker / imports")
      : L("Journal notes fallback", "Fallback de journal notes");

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

    const expensesByDate = new Map<string, number>();
    days.forEach((date) => expensesByDate.set(date, 0));

    costs.forEach((cost) => {
      if ((cost.is_active ?? true) === false) return;
      if (cost.amount <= 0) return;
      days.forEach((date) => {
        const amount = expenseForRange(cost, parseDate(date) ?? range.start, parseDate(date) ?? range.start);
        if (amount > 0) {
          expensesByDate.set(date, (expensesByDate.get(date) || 0) + amount);
        }
      });
    });

    let cumulativeNet = 0;
    return days.map((date) => {
      const trading = tradingByDate.get(date) || 0;
      const expenses = expensesByDate.get(date) || 0;
      const net = trading - expenses;
      cumulativeNet += net;
      return { date, trading, expenses, net, cumulativeNet };
    });
  }, [costs, snapshots, range]);

  const vendorRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        vendor: string;
        activeItems: number;
        monthlyEquivalent: number;
        selectedPeriodSpend: number;
        nextRenewal: Date | null;
      }
    >();

    costs
      .filter((cost) => (cost.is_active ?? true) !== false)
      .forEach((cost) => {
        const vendor = cost.vendor?.trim() || cost.name;
        const row = grouped.get(vendor) ?? {
          vendor,
          activeItems: 0,
          monthlyEquivalent: 0,
          selectedPeriodSpend: 0,
          nextRenewal: null,
        };
        row.activeItems += 1;
        row.monthlyEquivalent += monthlyEquivalent(cost);
        row.selectedPeriodSpend += expenseForRange(cost, range.start, range.end);
        const renewal = nextRenewalDate(cost, today);
        if (renewal && (!row.nextRenewal || renewal < row.nextRenewal)) {
          row.nextRenewal = renewal;
        }
        grouped.set(vendor, row);
      });

    return Array.from(grouped.values()).sort((a, b) => {
      if (b.monthlyEquivalent !== a.monthlyEquivalent) return b.monthlyEquivalent - a.monthlyEquivalent;
      return a.vendor.localeCompare(b.vendor);
    });
  }, [costs, range, today]);

  const upcomingRenewals = useMemo(() => {
    return costs
      .filter((cost) => (cost.is_active ?? true) !== false)
      .map((cost) => ({
        id: cost.id,
        name: cost.name,
        vendor: cost.vendor?.trim() || cost.name,
        billingCycle: cost.billing_cycle,
        amount: cost.amount,
        renewal: nextRenewalDate(cost, today),
      }))
      .filter((row) => row.renewal)
      .sort((a, b) => a.renewal!.getTime() - b.renewal!.getTime());
  }, [costs, today]);

  const budgetSummary = useMemo(() => {
    const monthlyByCategory = COST_CATEGORIES.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {} as Record<CostCategory, number>);

    budgets.forEach((budget) => {
      monthlyByCategory[budget.category] = budget.monthly_amount;
    });

    const fullPeriodByCategory = COST_CATEGORIES.reduce((acc, key) => {
      acc[key] = monthlyByCategory[key] * RANGE_MONTHS[rangeKey];
      return acc;
    }, {} as Record<CostCategory, number>);

    const elapsedFactor = getElapsedMonthFactor(range.start, range.end, rangeKey);
    const toDateByCategory = COST_CATEGORIES.reduce((acc, key) => {
      acc[key] = monthlyByCategory[key] * elapsedFactor;
      return acc;
    }, {} as Record<CostCategory, number>);

    const monthlyBudgetTotal = COST_CATEGORIES.reduce((sum, key) => sum + monthlyByCategory[key], 0);
    const fullPeriodBudgetTotal = COST_CATEGORIES.reduce((sum, key) => sum + fullPeriodByCategory[key], 0);
    const budgetToDateTotal = COST_CATEGORIES.reduce((sum, key) => sum + toDateByCategory[key], 0);
    const selectedPeriodVariance = budgetToDateTotal - totals.periodExpenses;

    const categoryRows = COST_CATEGORIES.map((key) => {
      const actual = totals.expensesByCategory[key] || 0;
      const budgetToDate = toDateByCategory[key] || 0;
      const fullBudget = fullPeriodByCategory[key] || 0;
      const utilization = budgetToDate > 0 ? actual / budgetToDate : actual > 0 ? Infinity : 0;
      return {
        category: key,
        actual,
        budgetToDate,
        fullBudget,
        variance: budgetToDate - actual,
        utilization,
      };
    }).filter((row) => row.actual > 0 || row.budgetToDate > 0 || row.fullBudget > 0);

    return {
      monthlyByCategory,
      fullPeriodByCategory,
      toDateByCategory,
      elapsedFactor,
      monthlyBudgetTotal,
      fullPeriodBudgetTotal,
      budgetToDateTotal,
      selectedPeriodVariance,
      categoryRows,
    };
  }, [budgets, range.end, range.start, rangeKey, totals.expensesByCategory, totals.periodExpenses]);

  const previousBudgetSummary = useMemo(() => {
    const elapsedFactor = getElapsedMonthFactor(previousRange.start, previousRange.end, rangeKey);
    const actualByCategory = COST_CATEGORIES.reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {} as Record<CostCategory, number>);

    costs
      .filter((cost) => (cost.is_active ?? true) !== false)
      .forEach((cost) => {
        actualByCategory[cost.category] += expenseForRange(cost, previousRange.start, previousRange.end);
      });

    const budgetToDateByCategory = COST_CATEGORIES.reduce((acc, key) => {
      acc[key] = (budgetSummary.monthlyByCategory[key] || 0) * elapsedFactor;
      return acc;
    }, {} as Record<CostCategory, number>);

    const actualTotal = COST_CATEGORIES.reduce((sum, key) => sum + actualByCategory[key], 0);
    const budgetToDateTotal = COST_CATEGORIES.reduce((sum, key) => sum + budgetToDateByCategory[key], 0);
    const variance = budgetToDateTotal - actualTotal;

    return {
      actualByCategory,
      budgetToDateByCategory,
      actualTotal,
      budgetToDateTotal,
      variance,
    };
  }, [budgetSummary.monthlyByCategory, costs, previousRange.end, previousRange.start, rangeKey]);

  useEffect(() => {
    if (!vendorRows.length) {
      if (selectedVendor !== null) setSelectedVendor(null);
      return;
    }
    if (!selectedVendor || !vendorRows.some((row) => row.vendor === selectedVendor)) {
      setSelectedVendor(vendorRows[0].vendor);
    }
  }, [selectedVendor, vendorRows]);

  useEffect(() => {
    if (!budgetSummary.categoryRows.length) {
      if (selectedBudgetCategory !== null) setSelectedBudgetCategory(null);
      return;
    }
    if (
      !selectedBudgetCategory ||
      !budgetSummary.categoryRows.some((row) => row.category === selectedBudgetCategory)
    ) {
      setSelectedBudgetCategory(budgetSummary.categoryRows[0].category);
    }
  }, [budgetSummary.categoryRows, selectedBudgetCategory]);

  const selectedVendorDetail = useMemo(() => {
    if (!selectedVendor) return null;
    const items = costs
      .filter((cost) => (cost.vendor?.trim() || cost.name) === selectedVendor)
      .map((cost) => ({
        ...cost,
        monthlyEquivalent: monthlyEquivalent(cost),
        selectedPeriodSpend: expenseForRange(cost, range.start, range.end),
        renewal: nextRenewalDate(cost, today),
      }))
      .sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);

    if (!items.length) return null;

    const monthlyTotal = items.reduce((sum, item) => sum + item.monthlyEquivalent, 0);
    const selectedPeriodTotal = items.reduce((sum, item) => sum + item.selectedPeriodSpend, 0);

    return {
      vendor: selectedVendor,
      monthlyTotal,
      selectedPeriodTotal,
      nextRenewal: items
        .map((item) => item.renewal)
        .filter(Boolean)
        .sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null,
      items,
    };
  }, [costs, range.end, range.start, selectedVendor, today]);

  const recommendedBudgetByCategory = useMemo(() => {
    return traderTypeSuggestions.reduce((acc, preset) => {
      const monthlyAmount =
        preset.billingCycle === "one_time"
          ? preset.amount / Math.max(1, preset.amortizationMonths ?? (preset.category === "education" ? 12 : 1))
          : (() => {
              switch (preset.billingCycle) {
                case "weekly":
                  return (preset.amount * 52) / 12;
                case "monthly":
                  return preset.amount;
                case "quarterly":
                  return preset.amount / 3;
                case "semiannual":
                  return preset.amount / 6;
                case "annual":
                  return preset.amount / 12;
                default:
                  return preset.amount;
              }
            })();
      acc[preset.category] = (acc[preset.category] || 0) + monthlyAmount;
      return acc;
    }, {} as Record<CostCategory, number>);
  }, [traderTypeSuggestions]);

  const budgetComparison = useMemo(() => {
    const spendDelta = totals.periodExpenses - previousBudgetSummary.actualTotal;
    const spendDeltaPct =
      previousBudgetSummary.actualTotal > 0 ? spendDelta / previousBudgetSummary.actualTotal : null;
    const recommendedMonthlyTotal = COST_CATEGORIES.reduce(
      (sum, key) => sum + (recommendedBudgetByCategory[key] || 0),
      0
    );

    return {
      spendDelta,
      spendDeltaPct,
      recommendedMonthlyTotal,
      recommendationGap: budgetSummary.monthlyBudgetTotal - recommendedMonthlyTotal,
    };
  }, [
    budgetSummary.monthlyBudgetTotal,
    previousBudgetSummary.actualTotal,
    recommendedBudgetByCategory,
    totals.periodExpenses,
  ]);

  const budgetChartRows = useMemo(() => {
    return budgetSummary.categoryRows
      .map((row) => ({
        category: row.category,
        label: L(CATEGORY_LABELS[row.category].en, CATEGORY_LABELS[row.category].es),
        budgetToDate: row.budgetToDate,
        actual: row.actual,
        previousActual: previousBudgetSummary.actualByCategory[row.category] || 0,
      }))
      .sort((a, b) => b.actual - a.actual);
  }, [L, budgetSummary.categoryRows, previousBudgetSummary.actualByCategory]);

  const selectedBudgetCategoryDetail = useMemo(() => {
    if (!selectedBudgetCategory) return null;
    const summaryRow = budgetSummary.categoryRows.find((row) => row.category === selectedBudgetCategory);
    if (!summaryRow) return null;

    const items = costs
      .filter((cost) => (cost.is_active ?? true) !== false && cost.category === selectedBudgetCategory)
      .map((cost) => ({
        ...cost,
        vendorLabel: cost.vendor?.trim() || cost.name,
        monthlyEquivalent: monthlyEquivalent(cost),
        selectedPeriodSpend: expenseForRange(cost, range.start, range.end),
        previousPeriodSpend: expenseForRange(cost, previousRange.start, previousRange.end),
        renewal: nextRenewalDate(cost, today),
      }))
      .sort((a, b) => b.selectedPeriodSpend - a.selectedPeriodSpend || b.monthlyEquivalent - a.monthlyEquivalent);

    const actualTotal = summaryRow.actual;
    const status = getBudgetStatus(summaryRow);
    const actionPlan =
      status === "over"
        ? [
            L("Reduce or pause the largest vendor in this category first.", "Reduce o pausa primero el vendor mas grande de esta categoria."),
            L("Review renewals and switch off non-essential tools before the next charge.", "Revisa renovaciones y apaga herramientas no esenciales antes del proximo cargo."),
            L("Rebuild the budget if the higher spend is intentional and permanent.", "Reconstruye el presupuesto si el gasto mayor es intencional y permanente."),
          ]
        : status === "near"
          ? [
              L("Freeze new spend in this category until the period closes.", "Congela gasto nuevo en esta categoria hasta cerrar el periodo."),
              L("Check the next renewal and confirm it is still needed.", "Verifica la proxima renovacion y confirma que sigue siendo necesaria."),
              L("Compare this category against the trader preset before adding more tools.", "Compara esta categoria contra el preset del trader antes de agregar mas herramientas."),
            ]
          : status === "no-budget"
            ? [
                L("Set a monthly budget so this category can be measured properly.", "Define un presupuesto mensual para medir esta categoria correctamente."),
                L("Use the trader preset as a baseline if you want a quick target.", "Usa el preset del trader como base si quieres un objetivo rapido."),
                L("Group the vendors here before you increase stack complexity.", "Agrupa los vendors aqui antes de aumentar la complejidad del stack."),
              ]
            : [
                L("Keep the stack stable and avoid adding unnecessary tools.", "Mantén el stack estable y evita agregar herramientas innecesarias."),
                L("Review the top vendor only if performance still lags despite staying on budget.", "Revisa el vendor principal solo si el performance sigue flojo aun estando en presupuesto."),
                L("Carry this budget into the next close unless your workflow changed.", "Mantén este presupuesto para el próximo cierre salvo que tu workflow haya cambiado."),
              ];

    return {
      category: selectedBudgetCategory,
      label: L(CATEGORY_LABELS[selectedBudgetCategory].en, CATEGORY_LABELS[selectedBudgetCategory].es),
      summaryRow,
      status,
      items,
      actionPlan,
      actualTotal,
    };
  }, [
    L,
    budgetSummary.categoryRows,
    costs,
    previousRange.end,
    previousRange.start,
    range.end,
    range.start,
    selectedBudgetCategory,
    today,
  ]);

  const controlAlerts = useMemo(() => {
    const alerts: Array<{ level: AlertLevel; title: string; detail: string }> = [];

    if (totals.surplusAfterBreakEven < 0) {
      alerts.push({
        level: "high",
        title: L("Below break-even", "Debajo del break-even"),
        detail: L(
          `You are short ${currency(Math.abs(totals.surplusAfterBreakEven))} versus this period's break-even.`,
          `Estas corto ${currency(Math.abs(totals.surplusAfterBreakEven))} versus el break-even de este periodo.`
        ),
      });
    }

    upcomingRenewals.forEach((row) => {
      if (!row.renewal) return;
      const days = daysUntil(row.renewal, today);
      if (days <= activeProfile.renewal_alert_days) {
        alerts.push({
          level: "high",
          title: L("Renewal within alert window", "Renovacion dentro de la ventana de alerta"),
          detail: `${row.name} · ${currency(row.amount)} · ${toIso(row.renewal)}`,
        });
      } else if (days <= 30) {
        alerts.push({
          level: "medium",
          title: L("Renewal due within 30 days", "Renovacion dentro de 30 dias"),
          detail: `${row.name} · ${currency(row.amount)} · ${toIso(row.renewal)}`,
        });
      }
    });

    budgetSummary.categoryRows
      .filter((row) => row.budgetToDate > 0 && row.actual > row.budgetToDate * (1 + activeProfile.overspend_alert_pct))
      .sort((a, b) => b.actual - b.budgetToDate - (a.actual - a.budgetToDate))
      .slice(0, 3)
      .forEach((row) => {
        alerts.push({
          level: "medium",
          title: L("Over budget category", "Categoria sobre presupuesto"),
          detail: `${L(CATEGORY_LABELS[row.category].en, CATEGORY_LABELS[row.category].es)} · ${currency(row.actual - row.budgetToDate)} ${L("over", "por encima")}`,
        });
      });

    if (budgetSummary.monthlyBudgetTotal <= 0) {
      alerts.push({
        level: "low",
        title: L("No monthly budget set", "No hay presupuesto mensual"),
        detail: L(
          "Set category budgets so the module can flag overspend automatically.",
          "Define presupuestos por categoria para que el modulo marque sobregastos automaticamente."
        ),
      });
    }

    if (
      totals.monthlyTradeCostDrag > 0 &&
      totals.monthlyTradeCostDrag > totals.monthlyBreakEvenBase * activeProfile.variable_cost_alert_ratio
    ) {
      alerts.push({
        level: "medium",
        title: L("Variable trading costs are elevated", "Los costos variables de trading estan altos"),
        detail: L(
          `Observed monthly fee drag is ${currency(totals.monthlyTradeCostDrag)}. Review broker costs and frequency.`,
          `El drag mensual observado por fees es ${currency(totals.monthlyTradeCostDrag)}. Revisa costos del broker y frecuencia.`
        ),
      });
    }

    return alerts.slice(0, 8);
  }, [
    activeProfile.overspend_alert_pct,
    activeProfile.renewal_alert_days,
    activeProfile.variable_cost_alert_ratio,
    L,
    budgetSummary.categoryRows,
    budgetSummary.monthlyBudgetTotal,
    today,
    totals.monthlyBreakEvenBase,
    totals.monthlyTradeCostDrag,
    totals.surplusAfterBreakEven,
    upcomingRenewals,
  ]);

  const monthlyClose = useMemo(() => {
    const checklist = [
      {
        label: L("Business setup saved", "Setup del negocio guardado"),
        done: !!profile,
      },
      {
        label: L("Monthly budget exists", "Existe presupuesto mensual"),
        done: budgetSummary.monthlyBudgetTotal > 0,
      },
      {
        label: L("All active costs have vendors", "Todos los costos activos tienen vendor"),
        done: costs.filter((cost) => (cost.is_active ?? true) !== false).every((cost) => !!cost.vendor?.trim()),
      },
      {
        label: L("All recurring costs have a start date", "Todos los costos recurrentes tienen fecha de inicio"),
        done: costs
          .filter((cost) => (cost.is_active ?? true) !== false && cost.billing_cycle !== "one_time")
          .every((cost) => !!parseDate(cost.starts_at ?? cost.created_at)),
      },
      {
        label: L("No critical renewal in alert window", "No hay renovacion critica en la ventana de alerta"),
        done: !upcomingRenewals.some((row) => row.renewal && daysUntil(row.renewal, today) <= activeProfile.renewal_alert_days),
      },
      {
        label: L("No category above overspend threshold", "Ninguna categoria supera el umbral de sobregasto"),
        done: !budgetSummary.categoryRows.some(
          (row) => row.budgetToDate > 0 && row.actual > row.budgetToDate * (1 + activeProfile.overspend_alert_pct)
        ),
      },
    ];

    const completed = checklist.filter((item) => item.done).length;
    const readiness = checklist.length ? completed / checklist.length : 0;

    const actions: string[] = [];
    if (totals.surplusAfterBreakEven < 0) {
      actions.push(
        L(
          `Close the period below break-even by ${currency(Math.abs(totals.surplusAfterBreakEven))}.`,
          `Cierra el periodo debajo del break-even por ${currency(Math.abs(totals.surplusAfterBreakEven))}.`
        )
      );
    }
    if (budgetSummary.selectedPeriodVariance < 0) {
      actions.push(
        L(
          `Operating spend is ${currency(Math.abs(budgetSummary.selectedPeriodVariance))} above budget.`,
          `El gasto operativo esta ${currency(Math.abs(budgetSummary.selectedPeriodVariance))} por encima del presupuesto.`
        )
      );
    }
    if (upcomingRenewals[0]?.renewal) {
      actions.push(
        L(
          `Review the next renewal: ${upcomingRenewals[0].name} on ${toIso(upcomingRenewals[0].renewal)}.`,
          `Revisa la proxima renovacion: ${upcomingRenewals[0].name} el ${toIso(upcomingRenewals[0].renewal)}.`
        )
      );
    }

    return { checklist, completed, readiness, actions };
  }, [
    L,
    activeProfile.overspend_alert_pct,
    activeProfile.renewal_alert_days,
    budgetSummary.monthlyBudgetTotal,
    budgetSummary.categoryRows,
    budgetSummary.selectedPeriodVariance,
    costs,
    profile,
    today,
    totals.surplusAfterBreakEven,
    upcomingRenewals,
  ]);

  const managementSummaryText = useMemo(() => {
    const lines = [
      `${L("Profit & Loss Track", "Profit & Loss Track")} — ${periodTitle}`,
      `${L("Trader type", "Tipo de trader")}: ${L(
        TRADER_TYPE_LABELS[activeProfile.trader_type].en,
        TRADER_TYPE_LABELS[activeProfile.trader_type].es
      )}`,
      `${L("Monthly break-even", "Break-even mensual")}: ${currency(totals.monthlyBreakEven)}`,
      `${L("Selected period break-even", "Break-even del periodo")}: ${currency(totals.selectedPeriodBreakEven)}`,
      `${L("Actual net after expenses", "Neto real despues de gastos")}: ${currency(totals.netAfterExpenses)}`,
      `${L("Budget variance", "Varianza vs presupuesto")}: ${currency(budgetSummary.selectedPeriodVariance)}`,
      `${L("Observed fees", "Fees observados")}: ${currency(totals.tradeCosts.total)} (${tradeCostSourceLabel})`,
      `${L("Top vendor", "Vendor principal")}: ${vendorRows[0]?.vendor ?? "--"}${vendorRows[0] ? ` (${currency(vendorRows[0].monthlyEquivalent)} / ${L("month", "mes")})` : ""}`,
      `${L("Critical alerts", "Alertas criticas")}: ${controlAlerts.length}`,
    ];

    if (monthlyClose.actions.length) {
      lines.push("", `${L("Priority actions", "Acciones prioritarias")}:`);
      monthlyClose.actions.forEach((item, index) => {
        lines.push(`${index + 1}. ${item}`);
      });
    }

    return lines.join("\n");
  }, [
    L,
    activeProfile.trader_type,
    budgetSummary.selectedPeriodVariance,
    controlAlerts.length,
    monthlyClose.actions,
    periodTitle,
    totals.monthlyBreakEven,
    totals.netAfterExpenses,
    totals.selectedPeriodBreakEven,
    totals.tradeCosts.total,
    tradeCostSourceLabel,
    vendorRows,
  ]);

  async function reloadCosts() {
    if (!user?.id) return;
    const refreshed = await listProfitLossCosts(user.id, activeAccountId);
    setCosts(refreshed);
  }

  async function reloadBudgets() {
    if (!user?.id) return;
    const refreshed = await listProfitLossBudgets(user.id, activeAccountId);
    setBudgets(refreshed);
  }

  async function saveProfile() {
    if (!user?.id || !profile) return;
    try {
      setProfileSaving(true);
      setError(null);
      const saved = await upsertProfitLossProfile({
        ...profile,
        user_id: user.id,
        account_id: activeAccountId ?? null,
      });
      setProfile(saved);
    } catch (err: any) {
      setError(err?.message || L("Failed to save setup", "No se pudo guardar el setup"));
    } finally {
      setProfileSaving(false);
    }
  }

  async function saveBudgets() {
    if (!user?.id) return;

    try {
      setBudgetSaving(true);
      setError(null);

      for (const category of COST_CATEGORIES) {
        const amount = Number(budgetForm[category] || 0);
        // eslint-disable-next-line no-await-in-loop
        await upsertProfitLossBudget({
          userId: user.id,
          accountId: activeAccountId,
          category,
          monthlyAmount: Number.isFinite(amount) ? amount : 0,
        });
      }

      await reloadBudgets();
    } catch (err: any) {
      setError(err?.message || L("Failed to save budgets", "No se pudo guardar el presupuesto"));
    } finally {
      setBudgetSaving(false);
    }
  }

  function useCurrentStackAsBudget() {
    const next = blankBudgetForm();
    costs
      .filter((cost) => (cost.is_active ?? true) !== false)
      .forEach((cost) => {
        const current = Number(next[cost.category] || 0);
        next[cost.category] = String(current + monthlyEquivalent(cost));
      });
    setBudgetForm(next);
  }

  function useRecommendedBudget() {
    const next = blankBudgetForm();
    COST_CATEGORIES.forEach((category) => {
      const suggested = recommendedBudgetByCategory[category] || 0;
      next[category] = suggested > 0 ? suggested.toFixed(2) : "";
    });
    setBudgetForm(next);
  }

  function buildClosePackageCsvRows() {
    const rows: Array<Array<string | number | null | undefined>> = [
      [L("Section", "Seccion"), L("Metric", "Metrica"), L("Value", "Valor"), L("Notes", "Notas")],
      ["overview", L("Period", "Periodo"), periodTitle, rangeKey],
      ["overview", L("Trading P&L (net)", "P&L de trading (neto)"), totals.totalTrading, ""],
      ["overview", L("Observed commissions & fees", "Comisiones y fees observados"), totals.tradeCosts.total, tradeCostSourceLabel],
      ["overview", L("Operating expenses", "Gastos operativos"), totals.periodExpenses, ""],
      ["overview", L("Net after expenses", "Neto despues de gastos"), totals.netAfterExpenses, ""],
      ["overview", L("Selected period break-even", "Break-even del periodo"), totals.selectedPeriodBreakEven, ""],
      ["overview", L("Budget variance", "Varianza vs presupuesto"), budgetSummary.selectedPeriodVariance, ""],
      [],
      [L("Section", "Seccion"), L("Category", "Categoria"), L("Budget", "Presupuesto"), L("Actual", "Real"), L("Variance", "Varianza")],
      ...budgetSummary.categoryRows.map((row) => [
        "budget",
        L(CATEGORY_LABELS[row.category].en, CATEGORY_LABELS[row.category].es),
        row.budgetToDate,
        row.actual,
        row.variance,
      ]),
      [],
      [L("Section", "Seccion"), L("Vendor", "Vendor"), L("Monthly", "Mensual"), L("Period spend", "Gasto del periodo"), L("Next renewal", "Proxima renovacion")],
      ...vendorRows.map((row) => [
        "vendor",
        row.vendor,
        row.monthlyEquivalent,
        row.selectedPeriodSpend,
        row.nextRenewal ? toIso(row.nextRenewal) : "--",
      ]),
      [],
      [L("Section", "Seccion"), L("Alert", "Alerta"), L("Level", "Nivel"), L("Detail", "Detalle")],
      ...controlAlerts.map((alert) => ["alert", alert.title, alert.level, alert.detail]),
    ];

    if (monthlyClose.checklist.length) {
      rows.push([]);
      rows.push([L("Section", "Seccion"), L("Close check", "Check de cierre"), L("Status", "Estado"), ""]);
      monthlyClose.checklist.forEach((item) => {
        rows.push(["close", item.label, item.done ? L("Done", "Listo") : L("Open", "Abierto"), ""]);
      });
    }

    return rows;
  }

  function downloadClosePackageCsv() {
    downloadCsvFile(
      `profit-loss-close-package-${rangeKey}-${toIso(today)}.csv`,
      buildClosePackageCsvRows()
    );
  }

  function downloadClosePackagePdf() {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const marginX = 42;
    let cursorY = 44;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(L("Profit & Loss Close Package", "Close Package de Profit & Loss"), marginX, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    cursorY += 18;
    doc.text(`${L("Period", "Periodo")}: ${periodTitle}`, marginX, cursorY);
    cursorY += 14;
    doc.text(`${L("Trader type", "Tipo de trader")}: ${L(TRADER_TYPE_LABELS[activeProfile.trader_type].en, TRADER_TYPE_LABELS[activeProfile.trader_type].es)}`, marginX, cursorY);
    cursorY += 14;
    doc.text(`${L("Trade cost source", "Fuente de costos variables")}: ${tradeCostSourceLabel}`, marginX, cursorY);

    autoTable(doc, {
      startY: cursorY + 18,
      head: [[L("Metric", "Metrica"), L("Value", "Valor")]],
      body: [
        [L("Trading P&L (net)", "P&L de trading (neto)"), currency(totals.totalTrading)],
        [L("Observed commissions & fees", "Comisiones y fees observados"), `${currency(totals.tradeCosts.total)} (${tradeCostSourceLabel})`],
        [L("Operating expenses", "Gastos operativos"), currency(totals.periodExpenses)],
        [L("Net after expenses", "Neto despues de gastos"), currency(totals.netAfterExpenses)],
        [L("Selected period break-even", "Break-even del periodo"), currency(totals.selectedPeriodBreakEven)],
        [L("Budget variance", "Varianza vs presupuesto"), currency(budgetSummary.selectedPeriodVariance)],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 23, 42] },
      margin: { left: marginX, right: marginX },
    });

    const summaryEndY = (doc as any).lastAutoTable?.finalY ?? cursorY + 140;
    autoTable(doc, {
      startY: summaryEndY + 18,
      head: [[L("Category", "Categoria"), L("Budget", "Presupuesto"), L("Actual", "Real"), L("Variance", "Varianza")]],
      body:
        budgetSummary.categoryRows.length > 0
          ? budgetSummary.categoryRows.map((row) => [
              L(CATEGORY_LABELS[row.category].en, CATEGORY_LABELS[row.category].es),
              currency(row.budgetToDate),
              currency(row.actual),
              currency(row.variance),
            ])
          : [[L("No budget rows", "Sin filas de presupuesto"), "--", "--", "--"]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 163, 74] },
      margin: { left: marginX, right: marginX },
    });

    const budgetEndY = (doc as any).lastAutoTable?.finalY ?? summaryEndY + 120;
    autoTable(doc, {
      startY: budgetEndY + 18,
      head: [[L("Vendor", "Vendor"), L("Monthly", "Mensual"), L("Period spend", "Gasto del periodo"), L("Next renewal", "Proxima renovacion")]],
      body:
        vendorRows.length > 0
          ? vendorRows.slice(0, 10).map((row) => [
              row.vendor,
              currency(row.monthlyEquivalent),
              currency(row.selectedPeriodSpend),
              row.nextRenewal ? toIso(row.nextRenewal) : "--",
            ])
          : [[L("No vendors", "Sin vendors"), "--", "--", "--"]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: marginX, right: marginX },
    });

    const vendorEndY = (doc as any).lastAutoTable?.finalY ?? budgetEndY + 120;
    autoTable(doc, {
      startY: vendorEndY + 18,
      head: [[L("Alert", "Alerta"), L("Level", "Nivel"), L("Detail", "Detalle")]],
      body:
        controlAlerts.length > 0
          ? controlAlerts.slice(0, 10).map((alert) => [alert.title, alert.level, alert.detail])
          : [[L("No active control alerts", "Sin alertas activas"), "--", "--"]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [234, 179, 8] },
      margin: { left: marginX, right: marginX },
    });

    doc.save(`profit-loss-close-package-${rangeKey}-${toIso(today)}.pdf`);
  }

  function downloadCategoryCsv() {
    if (!selectedBudgetCategoryDetail) return;

    const rows: Array<Array<string | number | null | undefined>> = [
      [L("Category", "Categoria"), selectedBudgetCategoryDetail.label],
      [L("Period", "Periodo"), periodTitle],
      [L("Budget to date", "Presupuesto a la fecha"), selectedBudgetCategoryDetail.summaryRow.budgetToDate],
      [L("Actual", "Real"), selectedBudgetCategoryDetail.summaryRow.actual],
      [L("Variance", "Varianza"), selectedBudgetCategoryDetail.summaryRow.variance],
      [L("Full period budget", "Presupuesto completo"), selectedBudgetCategoryDetail.summaryRow.fullBudget],
      [],
      [L("Vendor", "Vendor"), L("Current", "Actual"), L("Previous", "Anterior"), L("Monthly eq.", "Eq. mensual"), L("Share", "Participacion"), L("Next renewal", "Proxima renovacion")],
      ...selectedBudgetCategoryDetail.items.map((item) => [
        item.vendorLabel,
        item.selectedPeriodSpend,
        item.previousPeriodSpend,
        item.monthlyEquivalent,
        selectedBudgetCategoryDetail.actualTotal > 0
          ? `${((item.selectedPeriodSpend / selectedBudgetCategoryDetail.actualTotal) * 100).toFixed(1)}%`
          : "--",
        item.renewal ? toIso(item.renewal) : "--",
      ]),
      [],
      [L("Recommended actions", "Acciones recomendadas")],
      ...selectedBudgetCategoryDetail.actionPlan.map((item) => [item]),
    ];

    downloadCsvFile(
      `profit-loss-category-${selectedBudgetCategoryDetail.category}-${rangeKey}-${toIso(today)}.csv`,
      rows
    );
  }

  function downloadCategoryPdf() {
    if (!selectedBudgetCategoryDetail) return;

    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const marginX = 42;
    let cursorY = 44;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(selectedBudgetCategoryDetail.label, marginX, cursorY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    cursorY += 18;
    doc.text(`${L("Period", "Periodo")}: ${periodTitle}`, marginX, cursorY);
    cursorY += 14;
    doc.text(`${L("Status", "Estado")}: ${selectedBudgetCategoryDetail.status}`, marginX, cursorY);

    autoTable(doc, {
      startY: cursorY + 18,
      head: [[L("Metric", "Metrica"), L("Value", "Valor")]],
      body: [
        [L("Budget to date", "Presupuesto a la fecha"), currency(selectedBudgetCategoryDetail.summaryRow.budgetToDate)],
        [L("Actual", "Real"), currency(selectedBudgetCategoryDetail.summaryRow.actual)],
        [L("Variance", "Varianza"), currency(selectedBudgetCategoryDetail.summaryRow.variance)],
        [L("Full period budget", "Presupuesto completo"), currency(selectedBudgetCategoryDetail.summaryRow.fullBudget)],
        [
          L("Previous period", "Periodo anterior"),
          currency(previousBudgetSummary.actualByCategory[selectedBudgetCategoryDetail.category] || 0),
        ],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [15, 23, 42] },
      margin: { left: marginX, right: marginX },
    });

    const summaryEndY = (doc as any).lastAutoTable?.finalY ?? cursorY + 120;
    autoTable(doc, {
      startY: summaryEndY + 18,
      head: [[L("Vendor", "Vendor"), L("Current", "Actual"), L("Previous", "Anterior"), L("Monthly eq.", "Eq. mensual"), L("Share", "Participacion"), L("Next renewal", "Proxima renovacion")]],
      body:
        selectedBudgetCategoryDetail.items.length > 0
          ? selectedBudgetCategoryDetail.items.map((item) => [
              item.vendorLabel,
              currency(item.selectedPeriodSpend),
              currency(item.previousPeriodSpend),
              currency(item.monthlyEquivalent),
              selectedBudgetCategoryDetail.actualTotal > 0
                ? `${((item.selectedPeriodSpend / selectedBudgetCategoryDetail.actualTotal) * 100).toFixed(0)}%`
                : "--",
              item.renewal ? toIso(item.renewal) : "--",
            ])
          : [[L("No active vendors", "Sin vendors activos"), "--", "--", "--", "--", "--"]],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [22, 163, 74] },
      margin: { left: marginX, right: marginX },
    });

    const vendorEndY = (doc as any).lastAutoTable?.finalY ?? summaryEndY + 120;
    autoTable(doc, {
      startY: vendorEndY + 18,
      head: [[L("Recommended actions", "Acciones recomendadas")]],
      body: selectedBudgetCategoryDetail.actionPlan.map((item) => [item]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: marginX, right: marginX },
    });

    doc.save(`profit-loss-category-${selectedBudgetCategoryDetail.category}-${rangeKey}-${toIso(today)}.pdf`);
  }

  async function saveCostForm() {
    if (!user?.id) return;
    if (!form.name || !form.amount) return;

    try {
      setError(null);
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setError(L("Enter a valid amount", "Ingresa un monto valido"));
        return;
      }

      const patch = {
        name: form.name,
        category: form.category,
        billing_cycle: form.billingCycle,
        amount,
        vendor: form.vendor || null,
        starts_at: form.startsAt || null,
        ends_at: form.endsAt || null,
        notes: form.notes || null,
        preset_key: form.presetKey || null,
        is_active: form.isActive,
        include_in_break_even: form.includeInBreakEven,
        amortization_months:
          form.billingCycle === "one_time" && Number(form.amortizationMonths) > 0
            ? Number(form.amortizationMonths)
            : null,
      };

      if (editingCostId) {
        await updateProfitLossCost(user.id, editingCostId, patch);
      } else {
        await createProfitLossCost({
          userId: user.id,
          accountId: activeAccountId,
          name: patch.name,
          category: patch.category,
          billingCycle: patch.billing_cycle,
          amount: patch.amount,
          vendor: patch.vendor,
          startsAt: patch.starts_at,
          endsAt: patch.ends_at,
          notes: patch.notes,
          presetKey: patch.preset_key,
          isActive: patch.is_active,
          includeInBreakEven: patch.include_in_break_even,
          amortizationMonths: patch.amortization_months,
        });
      }

      setEditingCostId(null);
      setForm(blankCostForm());
      await reloadCosts();
    } catch (err: any) {
      setError(err?.message || L("Failed to save cost", "No se pudo guardar el costo"));
    }
  }

  async function removeCost(id: string) {
    if (!user?.id) return;
    try {
      await deleteProfitLossCost(user.id, id);
      if (editingCostId === id) {
        setEditingCostId(null);
        setForm(blankCostForm());
      }
      setCosts((prev) => prev.filter((item) => item.id !== id));
    } catch (err: any) {
      setError(err?.message || L("Failed to delete", "No se pudo borrar"));
    }
  }

  async function toggleCost(cost: ProfitLossCost, patch: Partial<ProfitLossCost>) {
    if (!user?.id) return;
    try {
      const updated = await updateProfitLossCost(user.id, cost.id, patch);
      setCosts((prev) => prev.map((item) => (item.id === cost.id ? updated : item)));
      if (editingCostId === cost.id) {
        setForm(formFromCost(updated));
      }
    } catch (err: any) {
      setError(err?.message || L("Failed to update cost", "No se pudo actualizar el costo"));
    }
  }

  async function addSuggestedCost(preset: SuggestedCostPreset) {
    if (!user?.id) return;
    try {
      setPresetBusyKey(preset.presetKey);
      const existing = costs.find((item) => item.preset_key === preset.presetKey);
      if (existing) {
        const updated = await updateProfitLossCost(user.id, existing.id, {
          is_active: true,
          include_in_break_even: preset.includeInBreakEven ?? true,
        });
        setCosts((prev) => prev.map((item) => (item.id === existing.id ? updated : item)));
        return;
      }

      const created = await createProfitLossCost({
        userId: user.id,
        accountId: activeAccountId,
        name: preset.name,
        category: preset.category,
        billingCycle: preset.billingCycle,
        amount: preset.amount,
        vendor: preset.vendor ?? null,
        notes: preset.notes ?? null,
        presetKey: preset.presetKey,
        includeInBreakEven: preset.includeInBreakEven ?? true,
        amortizationMonths: preset.amortizationMonths ?? null,
      });
      setCosts((prev) => [created, ...prev]);
    } catch (err: any) {
      setError(err?.message || L("Failed to add suggestion", "No se pudo agregar la sugerencia"));
    } finally {
      setPresetBusyKey(null);
    }
  }

  async function applySuggestedStack() {
    if (!user?.id) return;
    try {
      setPresetBusyKey("__all__");
      for (const preset of traderTypeSuggestions) {
        // eslint-disable-next-line no-await-in-loop
        await addSuggestedCost(preset);
      }
    } finally {
      setPresetBusyKey(null);
    }
  }

  if (planLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-16">
          <p className="text-sm text-slate-400">{L("Loading...", "Cargando...")}</p>
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
              {L("Advanced feature", "Funcion Advanced")}
            </p>
            <h1 className="text-xl font-semibold mt-2">
              {L(
                "Profit & Loss Track is included in Advanced",
                "Profit & Loss Track esta incluido en Advanced"
              )}
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              {L(
                "Track your trading business stack, monthly break-even, and operating profitability.",
                "Controla tu stack del negocio de trading, tu break-even mensual y tu rentabilidad operativa."
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
      <div className="max-w-7xl mx-auto px-6 md:px-10 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-emerald-300 text-[11px] uppercase tracking-[0.35em]">
              {L("Profit & Loss Track", "Profit & Loss Track")}
            </p>
            <h1 className="text-3xl font-semibold mt-2">
              {L("Trading business break-even", "Break-even del negocio de trading")}
            </h1>
            <p className="text-slate-400 text-sm mt-2 max-w-3xl">
              {L(
                "Build your trading business stack, keep costs organized, and know the minimum net trading profit you need to clear real operating expenses.",
                "Arma tu stack del negocio de trading, organiza costos y entiende el minimo de profit neto que necesitas para cubrir gastos reales."
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["week", "month", "quarter", "semiannual", "annual"] as RangeKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRangeKey(key)}
                className={`rounded-full border px-3 py-1.5 transition ${
                  rangeKey === key
                    ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                    : "border-slate-700 text-slate-300 hover:border-emerald-400/70"
                }`}
              >
                {L(
                  key === "week"
                    ? "Week"
                    : key === "month"
                    ? "Month"
                    : key === "quarter"
                    ? "Quarter"
                    : key === "semiannual"
                    ? "Semiannual"
                    : "Annual",
                  key === "week"
                    ? "Semana"
                    : key === "month"
                    ? "Mes"
                    : key === "quarter"
                    ? "Trimestre"
                    : key === "semiannual"
                    ? "Semestral"
                    : "Anual"
                )}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{L("Business setup", "Setup del negocio")}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {L(
                    "Keep this simple. Initial capital is not an expense; it is your business capital base.",
                    "Mantenlo simple. El capital inicial no es gasto; es la base de capital del negocio."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={saveProfile}
                disabled={profileSaving || !profile}
                className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
              >
                {profileSaving ? L("Saving...", "Guardando...") : L("Save setup", "Guardar setup")}
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-1 text-xs">
                <span className="text-slate-400">{L("Trader type", "Tipo de trader")}</span>
                <select
                  value={activeProfile.trader_type}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                      trader_type: e.target.value as TraderType,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                >
                  {(Object.keys(TRADER_TYPE_LABELS) as TraderType[]).map((key) => (
                    <option key={key} value={key}>
                      {L(TRADER_TYPE_LABELS[key].en, TRADER_TYPE_LABELS[key].es)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="text-slate-400">{L("Initial business capital", "Capital inicial del negocio")}</span>
                <input
                  value={String(activeProfile.initial_capital ?? 0)}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                      initial_capital: Number(e.target.value || 0),
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="text-slate-400">{L("Trading days / month", "Dias de trading / mes")}</span>
                <input
                  value={String(activeProfile.trading_days_per_month ?? 20)}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                      trading_days_per_month: Math.max(1, Number(e.target.value || 0)),
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="text-slate-400">{L("Average trades / month", "Promedio de trades / mes")}</span>
                <input
                  value={String(activeProfile.avg_trades_per_month ?? 40)}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                      avg_trades_per_month: Math.max(1, Number(e.target.value || 0)),
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="text-slate-400">{L("Owner pay target / month", "Meta de retiro del dueno / mes")}</span>
                <input
                  value={String(activeProfile.owner_pay_target_monthly ?? 0)}
                  onChange={(e) =>
                    setProfile((prev) => ({
                      ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                      owner_pay_target_monthly: Number(e.target.value || 0),
                    }))
                  }
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                />
              </label>

              <div className="space-y-2 text-xs rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">{L("Include education in break-even", "Incluir educacion en break-even")}</span>
                  <input
                    type="checkbox"
                    checked={activeProfile.include_education_in_break_even}
                    onChange={(e) =>
                      setProfile((prev) => ({
                        ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                        include_education_in_break_even: e.target.checked,
                      }))
                    }
                  />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-slate-300">{L("Include owner pay in break-even", "Incluir retiro del dueno en break-even")}</span>
                  <input
                    type="checkbox"
                    checked={activeProfile.include_owner_pay_in_break_even}
                    onChange={(e) =>
                      setProfile((prev) => ({
                        ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                        include_owner_pay_in_break_even: e.target.checked,
                      }))
                    }
                  />
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">
                  {L("Suggested stack", "Stack sugerido")}
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {L(
                    "Preset thinking for the tools this trader type normally needs.",
                    "Preset pensado para las herramientas que normalmente necesita este tipo de trader."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={applySuggestedStack}
                disabled={presetBusyKey === "__all__" || traderTypeSuggestions.length === 0}
                className="rounded-xl border border-emerald-400/60 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50"
              >
                {presetBusyKey === "__all__"
                  ? L("Adding...", "Agregando...")
                  : L("Add recommended stack", "Agregar stack recomendado")}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {traderTypeSuggestions.map((preset) => {
                const exists = costs.some((item) => item.preset_key === preset.presetKey && (item.is_active ?? true));
                return (
                  <div
                    key={preset.presetKey}
                    className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{preset.name}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {L(CATEGORY_LABELS[preset.category].en, CATEGORY_LABELS[preset.category].es)}
                          {preset.vendor ? ` · ${preset.vendor}` : ""}
                        </p>
                        {preset.notes ? <p className="text-[11px] text-slate-500 mt-1">{preset.notes}</p> : null}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-emerald-200">{currency(preset.amount)}</p>
                        <p className="text-[11px] text-slate-500">
                          {L(CYCLE_LABELS[preset.billingCycle].en, CYCLE_LABELS[preset.billingCycle].es)}
                        </p>
                        <button
                          type="button"
                          onClick={() => addSuggestedCost(preset)}
                          disabled={presetBusyKey === preset.presetKey || exists}
                          className="mt-2 rounded-lg border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400 disabled:opacity-50"
                        >
                          {exists
                            ? L("Active", "Activo")
                            : presetBusyKey === preset.presetKey
                            ? L("Adding...", "Agregando...")
                            : L("Add", "Agregar")}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          {[
            {
              label: L("Monthly break-even", "Break-even mensual"),
              value: currency(totals.monthlyBreakEven),
              hint: L("Net trading profit needed every month", "Profit neto de trading necesario cada mes"),
            },
            {
              label: periodTitle,
              value: currency(totals.selectedPeriodBreakEven),
              hint: L("Break-even for selected period", "Break-even del periodo seleccionado"),
            },
            {
              label: L("Daily minimum", "Minimo diario"),
              value: currency(totals.dailyBreakEven),
              hint: L("Based on your trading days", "Basado en tus dias de trading"),
            },
            {
              label: L("Per trade minimum", "Minimo por trade"),
              value: currency(totals.perTradeBreakEven),
              hint: L("Based on your average trade count", "Basado en tu promedio de trades"),
            },
            {
              label: periodTitle,
              value: currency(totals.netAfterExpenses),
              hint: L("Actual net after operating expenses", "Neto real despues de gastos operativos"),
            },
            {
              label: L("Above / below break-even", "Sobre / bajo break-even"),
              value: currency(totals.surplusAfterBreakEven),
              hint: L("Net result minus selected period break-even", "Resultado neto menos break-even del periodo"),
            },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{card.label}</p>
              <p className="text-2xl font-semibold mt-2">{card.value}</p>
              <p className="text-xs text-slate-500 mt-1">{card.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2 text-xs">
          {([
            { key: "summary", label: L("Summary", "Resumen") },
            { key: "income", label: L("Income statement", "Estado de resultados") },
            { key: "runway", label: L("Break-even & runway", "Break-even y runway") },
            { key: "stack", label: L("Stack & expenses", "Stack y gastos") },
            { key: "vendors", label: L("Vendors & renewals", "Vendors y renovaciones") },
            { key: "budget", label: L("Budget vs actual", "Presupuesto vs real") },
            { key: "controls", label: L("Controls", "Controles") },
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
              {[
                {
                  label: L("Active stack items", "Items activos del stack"),
                  value: String(totals.activeCount),
                  hint: L("Recurring and one-time tools", "Herramientas recurrentes y one-time"),
                },
                {
                  label: L("Monthly stack cost", "Costo mensual del stack"),
                  value: currency(totals.monthlyStackCost),
                  hint: L("Normalized monthly equivalent", "Equivalente mensual normalizado"),
                },
                {
                  label: L("Expense ratio", "Ratio de gastos"),
                  value: formatPct(totals.expenseRatio),
                  hint: L("Operating expenses vs net trading P&L", "Gastos operativos vs P&L neto de trading"),
                },
                {
                  label: L("Owner pay target / month", "Meta de retiro / mes"),
                  value: currency(activeProfile.owner_pay_target_monthly),
                  hint: activeProfile.include_owner_pay_in_break_even
                    ? L("Included in break-even", "Incluido en break-even")
                    : L("Not included in break-even", "No incluido en break-even"),
                },
                {
                  label: L("Top vendor", "Vendor principal"),
                  value: vendorRows[0]?.vendor ?? "--",
                  hint: vendorRows[0]
                    ? `${currency(vendorRows[0].monthlyEquivalent)} ${L("monthly", "mensual")}`
                    : L("No vendors yet", "Aun no hay vendors"),
                },
                {
                  label: L("Budget status", "Estado del presupuesto"),
                  value: currency(budgetSummary.selectedPeriodVariance),
                  hint: budgetSummary.selectedPeriodVariance >= 0
                    ? L("Positive means under budget", "Positivo significa bajo presupuesto")
                    : L("Negative means over budget", "Negativo significa sobre presupuesto"),
                },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{card.label}</p>
                  <p className="text-2xl font-semibold mt-2">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{card.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{L("Net business trend", "Tendencia neta del negocio")}</h3>
                  <span className="text-[11px] text-slate-500">{periodTitle}</span>
                </div>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <Tooltip formatter={(value: any) => currency(Number(value))} labelStyle={{ color: "#0f172a" }} />
                      <Line type="monotone" dataKey="net" stroke="#34d399" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="cumulativeNet" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{L("Expense mix", "Mix de gastos")}</h3>
                  <span className="text-[11px] text-slate-500">{periodTitle}</span>
                </div>
                <div className="mt-4 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(Object.keys(totals.expensesByCategory) as CostCategory[])
                        .map((key) => ({
                          category: L(CATEGORY_LABELS[key].en, CATEGORY_LABELS[key].es),
                          value: totals.expensesByCategory[key] || 0,
                        }))
                        .filter((row) => row.value > 0)}
                    >
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="category" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <Tooltip formatter={(value: any) => currency(Number(value))} labelStyle={{ color: "#0f172a" }} />
                      <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {Object.keys(totals.expensesByCategory).length === 0 && (
                  <p className="text-xs text-slate-500 mt-2">
                    {L("Add stack items to see your expense mix.", "Agrega items al stack para ver tu mix de gastos.")}
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
              {L(
                "Built from net trading P&L plus your operating stack for the selected calendar period.",
                "Construido desde el P&L neto de trading mas tu stack operativo para el periodo calendario seleccionado."
              )}
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
                <span>{L("Operating stack expenses", "Gastos operativos del stack")}</span>
                <span className="font-semibold">-{currency(totals.periodExpenses)}</span>
              </div>
              <div className="h-px bg-slate-800" />
              <div className="flex items-center justify-between text-emerald-200">
                <span className="font-semibold">{L("Business operating income", "Resultado operativo del negocio")}</span>
                <span className="font-semibold">{currency(totals.netAfterExpenses)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>{L("Target owner pay (management view)", "Meta de retiro del dueno (vista gerencial)")}</span>
                <span className="font-semibold">-{currency(activeProfile.owner_pay_target_monthly * RANGE_MONTHS[rangeKey])}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-100">
                <span className="font-semibold">{L("Surplus after owner target", "Excedente despues de retiro objetivo")}</span>
                <span className="font-semibold">
                  {currency(totals.netAfterExpenses - activeProfile.owner_pay_target_monthly * RANGE_MONTHS[rangeKey])}
                </span>
              </div>
            </div>
          </div>
        )}

        {tab === "runway" && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <h2 className="text-lg font-semibold">{L("Break-even engine", "Motor de break-even")}</h2>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{L("Monthly operating break-even", "Break-even operativo mensual")}</span>
                  <span className="font-semibold">{currency(totals.monthlyBreakEvenBase)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{L("Owner pay included", "Retiro del dueno incluido")}</span>
                  <span className="font-semibold">{currency(totals.monthlyOwnerPay)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{L("Monthly business break-even", "Break-even mensual del negocio")}</span>
                  <span className="font-semibold">{currency(totals.monthlyBreakEven)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{L("Selected period break-even", "Break-even del periodo seleccionado")}</span>
                  <span className="font-semibold">{currency(totals.selectedPeriodBreakEven)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{L("Daily minimum net", "Minimo neto diario")}</span>
                  <span className="font-semibold">{currency(totals.dailyBreakEven)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{L("Per trade minimum net", "Minimo neto por trade")}</span>
                  <span className="font-semibold">{currency(totals.perTradeBreakEven)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <h2 className="text-lg font-semibold">{L("Capital runway", "Runway de capital")}</h2>
              <p className="text-xs text-slate-500 mt-1">
                {L(
                  "Management view only. Initial business capital is treated as capital, not as an expense.",
                  "Vista gerencial solamente. El capital inicial del negocio se trata como capital, no como gasto."
                )}
              </p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>{L("Recorded initial capital", "Capital inicial registrado")}</span>
                  <span className="font-semibold">{currency(activeProfile.initial_capital)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{L("Months of runway at current break-even", "Meses de runway al break-even actual")}</span>
                  <span className="font-semibold">
                    {totals.cashRunwayMonths == null || !Number.isFinite(totals.cashRunwayMonths)
                      ? "--"
                      : `${totals.cashRunwayMonths.toFixed(1)} ${L("months", "meses")}`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{L("This period net result", "Resultado neto de este periodo")}</span>
                  <span className="font-semibold">{currency(totals.netAfterExpenses)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{L("Gap vs selected period break-even", "Brecha vs break-even del periodo")}</span>
                  <span className="font-semibold">{currency(totals.surplusAfterBreakEven)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "stack" && (
          <>
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{L("Expense ledger", "Ledger de gastos")}</h2>
                  <span className="text-xs text-slate-500">{periodTitle}</span>
                </div>

                <div className="mt-4 space-y-3">
                  {costs.length === 0 && !loading ? (
                    <p className="text-sm text-slate-400">{L("No stack items yet.", "Aun no hay items en el stack.")}</p>
                  ) : (
                    costs.map((cost) => (
                      <div key={cost.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{cost.name}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {L(CATEGORY_LABELS[cost.category].en, CATEGORY_LABELS[cost.category].es)}
                              {cost.vendor ? ` · ${cost.vendor}` : ""}
                              {" · "}
                              {L(CYCLE_LABELS[cost.billing_cycle].en, CYCLE_LABELS[cost.billing_cycle].es)}
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {L("Monthly equivalent", "Equivalente mensual")}: {currency(monthlyEquivalent(cost))}
                              {cost.billing_cycle === "one_time"
                                ? ` · ${L("Amortization", "Amortizacion")}: ${defaultAmortizationMonths(cost)}`
                                : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{currency(cost.amount)}</p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {(cost.is_active ?? true)
                                ? L("Active", "Activo")
                                : L("Inactive", "Inactivo")}
                              {" · "}
                              {(cost.include_in_break_even ?? true)
                                ? L("In break-even", "En break-even")
                                : L("Excluded from break-even", "Fuera de break-even")}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                          <button
                            type="button"
                            onClick={() => toggleCost(cost, { is_active: !(cost.is_active ?? true) })}
                            className="rounded-lg border border-slate-700 px-3 py-1 text-slate-200 hover:border-emerald-400"
                          >
                            {(cost.is_active ?? true)
                              ? L("Set inactive", "Desactivar")
                              : L("Set active", "Activar")}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              toggleCost(cost, {
                                include_in_break_even: !(cost.include_in_break_even ?? true),
                              })
                            }
                            className="rounded-lg border border-slate-700 px-3 py-1 text-slate-200 hover:border-emerald-400"
                          >
                            {(cost.include_in_break_even ?? true)
                              ? L("Exclude from break-even", "Excluir de break-even")
                              : L("Include in break-even", "Incluir en break-even")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCostId(cost.id);
                              setForm(formFromCost(cost));
                            }}
                            className="rounded-lg border border-slate-700 px-3 py-1 text-slate-200 hover:border-emerald-400"
                          >
                            {L("Edit", "Editar")}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeCost(cost.id)}
                            className="rounded-lg border border-red-500/40 px-3 py-1 text-red-200 hover:border-red-400"
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
                  {editingCostId ? L("Edit stack item", "Editar item del stack") : L("Add stack item", "Agregar item al stack")}
                </h2>
                <div className="mt-4 space-y-3 text-xs">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={L("Item name", "Nombre del item")}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={form.category}
                      onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as CostCategory }))}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    >
                      {(Object.keys(CATEGORY_LABELS) as CostCategory[]).map((key) => (
                        <option key={key} value={key}>
                          {L(CATEGORY_LABELS[key].en, CATEGORY_LABELS[key].es)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={form.billingCycle}
                      onChange={(e) => setForm((prev) => ({ ...prev, billingCycle: e.target.value as BillingCycle }))}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    >
                      {(Object.keys(CYCLE_LABELS) as BillingCycle[]).map((key) => (
                        <option key={key} value={key}>
                          {L(CYCLE_LABELS[key].en, CYCLE_LABELS[key].es)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      value={form.amount}
                      onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                      placeholder={L("Amount", "Monto")}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    />
                    <input
                      value={form.vendor}
                      onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))}
                      placeholder={L("Vendor", "Proveedor")}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="date"
                      value={form.startsAt}
                      onChange={(e) => setForm((prev) => ({ ...prev, startsAt: e.target.value }))}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    />
                    <input
                      type="date"
                      value={form.endsAt}
                      onChange={(e) => setForm((prev) => ({ ...prev, endsAt: e.target.value }))}
                      className="rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    />
                  </div>
                  {form.billingCycle === "one_time" && (
                    <input
                      value={form.amortizationMonths}
                      onChange={(e) => setForm((prev) => ({ ...prev, amortizationMonths: e.target.value }))}
                      placeholder={L("Amortization months", "Meses de amortizacion")}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                    />
                  )}
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder={L("Notes", "Notas")}
                    rows={3}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                  />
                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 space-y-2">
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-slate-300">{L("Active", "Activo")}</span>
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3">
                      <span className="text-slate-300">{L("Include in break-even", "Incluir en break-even")}</span>
                      <input
                        type="checkbox"
                        checked={form.includeInBreakEven}
                        onChange={(e) => setForm((prev) => ({ ...prev, includeInBreakEven: e.target.checked }))}
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveCostForm}
                      className="flex-1 rounded-xl bg-emerald-400 text-slate-950 py-2 text-xs font-semibold hover:bg-emerald-300 transition"
                    >
                      {editingCostId ? L("Save changes", "Guardar cambios") : L("Add item", "Agregar item")}
                    </button>
                    {editingCostId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCostId(null);
                          setForm(blankCostForm());
                        }}
                        className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:border-emerald-400"
                      >
                        {L("Cancel", "Cancelar")}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "vendors" && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: L("Active vendors", "Vendors activos"),
                  value: String(vendorRows.length),
                  hint: L("Grouped from your active stack", "Agrupados desde tu stack activo"),
                },
                {
                  label: L("Next renewal", "Proxima renovacion"),
                  value: upcomingRenewals[0]?.renewal ? toIso(upcomingRenewals[0].renewal) : "--",
                  hint: upcomingRenewals[0]?.name ?? L("No recurring renewals", "No hay renovaciones recurrentes"),
                },
                {
                  label: L("Recurring monthly stack", "Stack mensual recurrente"),
                  value: currency(
                    costs
                      .filter((cost) => (cost.is_active ?? true) !== false && cost.billing_cycle !== "one_time")
                      .reduce((sum, cost) => sum + monthlyEquivalent(cost), 0)
                  ),
                  hint: L("One-time items excluded", "One-time excluidos"),
                },
                {
                  label: L("Observed fee drag / month", "Drag de fees / mes"),
                  value: currency(totals.monthlyTradeCostDrag),
                  hint:
                    totals.tradeCostSource === "normalized_trades"
                      ? L(
                          "Auto-detected from normalized broker sync/import data. Already embedded in net trading P&L.",
                          "Auto-detectado desde data normalizada de broker sync/import. Ya esta incluido en el P&L neto."
                        )
                      : L(
                          "Fallback from journal notes. Already embedded in net trading P&L.",
                          "Fallback desde journal notes. Ya esta incluido en el P&L neto."
                        ),
                },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{card.label}</p>
                  <p className="text-2xl font-semibold mt-2">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{card.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <h2 className="text-lg font-semibold">{L("Upcoming renewals", "Proximas renovaciones")}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {L(
                    "Use this to see which recurring tools are about to hit your cash flow.",
                    "Usa esto para ver que herramientas recurrentes van a impactar tu flujo de caja."
                  )}
                </p>
                <div className="mt-4 space-y-3">
                  {upcomingRenewals.length === 0 ? (
                    <p className="text-sm text-slate-400">{L("No renewals found.", "No se encontraron renovaciones.")}</p>
                  ) : (
                    upcomingRenewals.slice(0, 8).map((row) => (
                      <div key={row.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{row.name}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {row.vendor} {" · "} {L(CYCLE_LABELS[row.billingCycle].en, CYCLE_LABELS[row.billingCycle].es)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold">{currency(row.amount)}</p>
                            <p className="text-[11px] text-slate-500 mt-1">{row.renewal ? toIso(row.renewal) : "--"}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                  <h2 className="text-lg font-semibold">{L("Vendor center", "Centro de vendors")}</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {L(
                      "Grouped view of who is costing you money and when they renew.",
                      "Vista agrupada de quien te cuesta dinero y cuando renuevan."
                    )}
                  </p>
                  <div className="mt-4 space-y-3">
                    {vendorRows.length === 0 ? (
                      <p className="text-sm text-slate-400">{L("No vendors yet.", "Aun no hay vendors.")}</p>
                    ) : (
                      vendorRows.map((row) => (
                        <button
                          key={row.vendor}
                          type="button"
                          onClick={() => setSelectedVendor(row.vendor)}
                          className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                            selectedVendor === row.vendor
                              ? "border-emerald-400 bg-emerald-400/10"
                              : "border-slate-800 bg-slate-950/40 hover:border-emerald-400/60"
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{row.vendor}</p>
                              <p className="text-xs text-slate-400 mt-1">
                                {row.activeItems} {L("active items", "items activos")}
                              </p>
                            </div>
                            <div className="grid gap-1 text-right text-[11px] text-slate-300">
                              <p>
                                {L("Monthly", "Mensual")}:{" "}
                                <span className="font-semibold">{currency(row.monthlyEquivalent)}</span>
                              </p>
                              <p>
                                {periodTitle}:{" "}
                                <span className="font-semibold">{currency(row.selectedPeriodSpend)}</span>
                              </p>
                              <p>
                                {L("Next renewal", "Proxima renovacion")}:{" "}
                                <span className="font-semibold">{row.nextRenewal ? toIso(row.nextRenewal) : "--"}</span>
                              </p>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                  <h2 className="text-lg font-semibold">{L("Vendor drilldown", "Detalle del vendor")}</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {L(
                      "Review the exact tools, cycles, and renewals behind one vendor.",
                      "Revisa las herramientas, ciclos y renovaciones exactas detras de un vendor."
                    )}
                  </p>
                  {!selectedVendorDetail ? (
                    <p className="mt-4 text-sm text-slate-400">
                      {L("Select a vendor to inspect its stack.", "Selecciona un vendor para inspeccionar su stack.")}
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{selectedVendorDetail.vendor}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {selectedVendorDetail.items.length} {L("tracked items", "items registrados")}
                            </p>
                          </div>
                          <div className="grid gap-1 text-right text-[11px] text-slate-300">
                            <p>
                              {L("Monthly", "Mensual")}:{" "}
                              <span className="font-semibold">{currency(selectedVendorDetail.monthlyTotal)}</span>
                            </p>
                            <p>
                              {periodTitle}:{" "}
                              <span className="font-semibold">{currency(selectedVendorDetail.selectedPeriodTotal)}</span>
                            </p>
                            <p>
                              {L("Nearest renewal", "Renovacion mas cercana")}:{" "}
                              <span className="font-semibold">
                                {selectedVendorDetail.nextRenewal ? toIso(selectedVendorDetail.nextRenewal) : "--"}
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                      {selectedVendorDetail.items.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{item.name}</p>
                              <p className="text-xs text-slate-400 mt-1">
                                {L(CATEGORY_LABELS[item.category].en, CATEGORY_LABELS[item.category].es)} {" · "}
                                {L(CYCLE_LABELS[item.billing_cycle].en, CYCLE_LABELS[item.billing_cycle].es)}
                              </p>
                            </div>
                            <div className="grid gap-1 text-right text-[11px] text-slate-300">
                              <p>
                                {L("Amount", "Monto")}: <span className="font-semibold">{currency(item.amount)}</span>
                              </p>
                              <p>
                                {L("Monthly eq.", "Eq. mensual")}:{" "}
                                <span className="font-semibold">{currency(item.monthlyEquivalent)}</span>
                              </p>
                              <p>
                                {L("Next renewal", "Proxima renovacion")}:{" "}
                                <span className="font-semibold">{item.renewal ? toIso(item.renewal) : "--"}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}

        {tab === "budget" && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: L("Monthly budget", "Presupuesto mensual"),
                  value: currency(budgetSummary.monthlyBudgetTotal),
                  hint: L("Planned operating expense ceiling", "Techo planificado de gasto operativo"),
                },
                {
                  label: L("Full period budget", "Presupuesto completo del periodo"),
                  value: currency(budgetSummary.fullPeriodBudgetTotal),
                  hint: periodTitle,
                },
                {
                  label: L("Budget to date", "Presupuesto a la fecha"),
                  value: currency(budgetSummary.budgetToDateTotal),
                  hint: L("Prorated to the elapsed part of the period", "Prorrateado a la parte transcurrida del periodo"),
                },
                {
                  label: L("Actual operating spend", "Gasto operativo real"),
                  value: currency(totals.periodExpenses),
                  hint: periodTitle,
                },
                {
                  label: L("Variance to date", "Varianza a la fecha"),
                  value: currency(budgetSummary.selectedPeriodVariance),
                  hint:
                    budgetSummary.selectedPeriodVariance >= 0
                      ? L("Positive is favorable", "Positivo es favorable")
                      : L("Negative means overspend", "Negativo significa sobregasto"),
                },
                {
                  label: L("Previous period spend", "Gasto del periodo anterior"),
                  value: currency(previousBudgetSummary.actualTotal),
                  hint: `${toIso(previousRange.start)} - ${toIso(previousRange.end)}`,
                },
                {
                  label: L("Vs previous period", "Vs periodo anterior"),
                  value: currency(budgetComparison.spendDelta),
                  hint:
                    budgetComparison.spendDeltaPct == null
                      ? L("No prior comparison", "Sin comparacion previa")
                      : `${budgetComparison.spendDeltaPct >= 0 ? "+" : ""}${(budgetComparison.spendDeltaPct * 100).toFixed(1)}%`,
                },
                {
                  label: L("Observed trading fees", "Fees de trading observados"),
                  value: currency(totals.tradeCosts.total),
                  hint: tradeCostSourceLabel,
                },
                {
                  label: L("Preset monthly budget", "Presupuesto mensual del preset"),
                  value: currency(budgetComparison.recommendedMonthlyTotal),
                  hint:
                    budgetComparison.recommendationGap >= 0
                      ? L("Saved budget is above the preset", "El presupuesto guardado esta por encima del preset")
                      : L("Saved budget is below the preset", "El presupuesto guardado esta por debajo del preset"),
                },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{card.label}</p>
                  <p className="text-2xl font-semibold mt-2">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{card.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{L("Category comparison", "Comparacion por categoria")}</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {L(
                        "Compare budget to date, actual spend, and the previous period for each category.",
                        "Compara presupuesto a la fecha, gasto real y periodo anterior por categoria."
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />{L("Budget to date", "Presupuesto a la fecha")}</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" />{L("Actual", "Real")}</span>
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />{L("Previous", "Anterior")}</span>
                  </div>
                </div>
                <div className="mt-4 h-[360px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={budgetChartRows} layout="vertical" margin={{ left: 12, right: 12, top: 8, bottom: 8 }}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={120}
                        tick={{ fontSize: 10, fill: "#94a3b8" }}
                      />
                      <Tooltip formatter={(value: any) => currency(Number(value))} labelStyle={{ color: "#0f172a" }} />
                      <Bar
                        dataKey="budgetToDate"
                        fill="#34d399"
                        radius={[0, 4, 4, 0]}
                        onClick={(data: any) => {
                          const category = data?.payload?.category as CostCategory | undefined;
                          if (category) setSelectedBudgetCategory(category);
                        }}
                      >
                        {budgetChartRows.map((row) => (
                          <Cell
                            key={`budget-${row.category}`}
                            fill="#34d399"
                            fillOpacity={!selectedBudgetCategory || selectedBudgetCategory === row.category ? 1 : 0.28}
                            cursor="pointer"
                          />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="actual"
                        fill="#38bdf8"
                        radius={[0, 4, 4, 0]}
                        onClick={(data: any) => {
                          const category = data?.payload?.category as CostCategory | undefined;
                          if (category) setSelectedBudgetCategory(category);
                        }}
                      >
                        {budgetChartRows.map((row) => (
                          <Cell
                            key={`actual-${row.category}`}
                            fill="#38bdf8"
                            fillOpacity={!selectedBudgetCategory || selectedBudgetCategory === row.category ? 1 : 0.28}
                            cursor="pointer"
                          />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="previousActual"
                        fill="#f59e0b"
                        radius={[0, 4, 4, 0]}
                        onClick={(data: any) => {
                          const category = data?.payload?.category as CostCategory | undefined;
                          if (category) setSelectedBudgetCategory(category);
                        }}
                      >
                        {budgetChartRows.map((row) => (
                          <Cell
                            key={`previous-${row.category}`}
                            fill="#f59e0b"
                            fillOpacity={!selectedBudgetCategory || selectedBudgetCategory === row.category ? 1 : 0.28}
                            cursor="pointer"
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-3 text-[11px] text-slate-500">
                  {L(
                    "Click any bar to sync the drilldown on the right.",
                    "Haz click en cualquier barra para sincronizar el drilldown de la derecha."
                  )}
                </p>
                {budgetChartRows.length === 0 && (
                  <p className="text-sm text-slate-400 mt-3">
                    {L("No category data yet.", "Aun no hay data por categoria.")}
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{L("Category drilldown", "Drilldown por categoria")}</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {L(
                        "See which vendors are driving the category and what action to take next.",
                        "Mira que vendors empujan la categoria y que accion conviene tomar."
                      )}
                    </p>
                  </div>
                  {selectedBudgetCategoryDetail && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={downloadCategoryPdf}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-emerald-400"
                      >
                        {L("Export PDF", "Exportar PDF")}
                      </button>
                      <button
                        type="button"
                        onClick={downloadCategoryCsv}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-emerald-400"
                      >
                        {L("Export CSV", "Exportar CSV")}
                      </button>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {budgetSummary.categoryRows.map((row) => (
                    <button
                      key={row.category}
                      type="button"
                      onClick={() => setSelectedBudgetCategory(row.category)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        selectedBudgetCategory === row.category
                          ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                          : "border-slate-700 text-slate-300 hover:border-emerald-400/70"
                      }`}
                    >
                      {L(CATEGORY_LABELS[row.category].en, CATEGORY_LABELS[row.category].es)}
                    </button>
                  ))}
                </div>

                {!selectedBudgetCategoryDetail ? (
                  <p className="text-sm text-slate-400 mt-4">
                    {L("Pick a category to inspect it.", "Selecciona una categoria para inspeccionarla.")}
                  </p>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{selectedBudgetCategoryDetail.label}</p>
                          <p className="text-xs text-slate-500 mt-1">{periodTitle}</p>
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                            selectedBudgetCategoryDetail.status === "over"
                              ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                              : selectedBudgetCategoryDetail.status === "near"
                                ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                                : selectedBudgetCategoryDetail.status === "no-budget"
                                  ? "border-slate-700 bg-slate-900/70 text-slate-300"
                                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                          }`}
                        >
                          {selectedBudgetCategoryDetail.status === "over"
                            ? L("Reduce", "Reducir")
                            : selectedBudgetCategoryDetail.status === "near"
                              ? L("Review", "Revisar")
                              : selectedBudgetCategoryDetail.status === "no-budget"
                                ? L("Set budget", "Definir budget")
                                : L("Keep", "Mantener")}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2 text-[11px] text-slate-300">
                        <p>
                          {L("Budget to date", "Presupuesto a la fecha")}:{" "}
                          <span className="font-semibold">{currency(selectedBudgetCategoryDetail.summaryRow.budgetToDate)}</span>
                        </p>
                        <p>
                          {L("Actual", "Real")}:{" "}
                          <span className="font-semibold">{currency(selectedBudgetCategoryDetail.summaryRow.actual)}</span>
                        </p>
                        <p>
                          {L("Previous period", "Periodo anterior")}:{" "}
                          <span className="font-semibold">
                            {currency(previousBudgetSummary.actualByCategory[selectedBudgetCategoryDetail.category] || 0)}
                          </span>
                        </p>
                        <p>
                          {L("Full period budget", "Presupuesto completo")}:{" "}
                          <span className="font-semibold">{currency(selectedBudgetCategoryDetail.summaryRow.fullBudget)}</span>
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                      <p className="text-sm font-semibold">{L("Recommended actions", "Acciones recomendadas")}</p>
                      <div className="mt-3 space-y-2">
                        {selectedBudgetCategoryDetail.actionPlan.map((item, index) => (
                          <div key={`${selectedBudgetCategoryDetail.category}-action-${index}`} className="flex gap-2 text-sm text-slate-200">
                            <span className="text-emerald-300">{index + 1}.</span>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">{L("Vendor drivers", "Vendors que empujan la categoria")}</p>
                        <p className="text-[11px] text-slate-500">
                          {selectedBudgetCategoryDetail.items.length} {L("items", "items")}
                        </p>
                      </div>
                      <div className="mt-3 space-y-3">
                        {selectedBudgetCategoryDetail.items.length === 0 ? (
                          <p className="text-sm text-slate-400">
                            {L("No active vendors in this category.", "No hay vendors activos en esta categoria.")}
                          </p>
                        ) : (
                          selectedBudgetCategoryDetail.items.map((item) => {
                            const share =
                              selectedBudgetCategoryDetail.actualTotal > 0
                                ? item.selectedPeriodSpend / selectedBudgetCategoryDetail.actualTotal
                                : 0;
                            return (
                              <div key={item.id} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-medium">{item.vendorLabel}</p>
                                    <p className="text-[11px] text-slate-500 mt-1">
                                      {L(CYCLE_LABELS[item.billing_cycle].en, CYCLE_LABELS[item.billing_cycle].es)}
                                      {" · "}
                                      {L("Monthly eq.", "Eq. mensual")}: {currency(item.monthlyEquivalent)}
                                    </p>
                                  </div>
                                  <div className="text-right text-[11px] text-slate-300">
                                    <p>
                                      {L("Current", "Actual")}: <span className="font-semibold">{currency(item.selectedPeriodSpend)}</span>
                                    </p>
                                    <p>
                                      {L("Previous", "Anterior")}: <span className="font-semibold">{currency(item.previousPeriodSpend)}</span>
                                    </p>
                                    <p>
                                      {L("Share", "Participacion")}:{" "}
                                      <span className="font-semibold">{selectedBudgetCategoryDetail.actualTotal > 0 ? `${(share * 100).toFixed(0)}%` : "--"}</span>
                                    </p>
                                  </div>
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                                  <span>{L("Amount", "Monto")}: {currency(item.amount)}</span>
                                  <span>
                                    {L("Next renewal", "Proxima renovacion")}: {item.renewal ? toIso(item.renewal) : "--"}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">{L("Budget builder", "Constructor de presupuesto")}</h2>
                    <p className="text-xs text-slate-500 mt-1">
                      {L(
                        "Set a simple monthly budget by category. The system will scale it to week, quarter, and year automatically.",
                        "Define un presupuesto mensual simple por categoria. El sistema lo escala a semana, trimestre y ano automaticamente."
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={useRecommendedBudget}
                      className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-emerald-400"
                    >
                      {L("Use trader preset", "Usar preset del trader")}
                    </button>
                    <button
                      type="button"
                      onClick={useCurrentStackAsBudget}
                      className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-emerald-400"
                    >
                      {L("Use current stack", "Usar stack actual")}
                    </button>
                    <button
                      type="button"
                      onClick={saveBudgets}
                      disabled={budgetSaving}
                      className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                    >
                      {budgetSaving ? L("Saving...", "Guardando...") : L("Save budgets", "Guardar presupuestos")}
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {COST_CATEGORIES.map((category) => (
                    <label key={category} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm">
                      <span className="text-slate-300">{L(CATEGORY_LABELS[category].en, CATEGORY_LABELS[category].es)}</span>
                      <input
                        value={budgetForm[category]}
                        onChange={(e) =>
                          setBudgetForm((prev) => ({
                            ...prev,
                            [category]: e.target.value,
                          }))
                        }
                        placeholder="0.00"
                        className="w-32 rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-right text-sm"
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <h2 className="text-lg font-semibold">{L("Budget vs actual", "Presupuesto vs real")}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {L(
                    "Budget to date is prorated to the elapsed portion of the selected period. The row bar shows how much of that budget has already been consumed.",
                    "El presupuesto a la fecha se prorratea a la parte transcurrida del periodo seleccionado. La barra muestra cuanto de ese presupuesto ya se consumio."
                  )}
                </p>
                <div className="mt-4 space-y-3">
                  {budgetSummary.categoryRows.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      {L("No budget or actual expenses yet.", "Aun no hay presupuesto ni gastos reales.")}
                    </p>
                  ) : (
                    budgetSummary.categoryRows.map((row) => (
                      <div key={row.category} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">
                              {L(CATEGORY_LABELS[row.category].en, CATEGORY_LABELS[row.category].es)}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">{periodTitle}</p>
                          </div>
                          <div className="grid gap-1 text-right text-[11px] text-slate-300">
                            <p>
                              {L("Budget to date", "Presupuesto a la fecha")}:{" "}
                              <span className="font-semibold">{currency(row.budgetToDate)}</span>
                            </p>
                            <p>
                              {L("Actual", "Real")}: <span className="font-semibold">{currency(row.actual)}</span>
                            </p>
                            <p className={row.variance >= 0 ? "text-emerald-200" : "text-rose-200"}>
                              {L("Variance", "Varianza")}: <span className="font-semibold">{currency(row.variance)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="mt-3">
                          {(() => {
                            const previousActual = previousBudgetSummary.actualByCategory[row.category] || 0;
                            const deltaVsPrevious = row.actual - previousActual;
                            const status =
                              row.budgetToDate <= 0
                                ? "no-budget"
                                : row.utilization > 1
                                  ? "over"
                                  : row.utilization > 0.8
                                    ? "near"
                                    : "on-track";
                            const badgeClass =
                              status === "over"
                                ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
                                : status === "near"
                                  ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                                  : status === "no-budget"
                                    ? "border-slate-700 bg-slate-900/70 text-slate-300"
                                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
                            const statusLabel =
                              status === "over"
                                ? L("Over budget", "Sobre presupuesto")
                                : status === "near"
                                  ? L("Near limit", "Cerca del limite")
                                  : status === "no-budget"
                                    ? L("No budget set", "Sin presupuesto")
                                    : L("On track", "En control");
                            const fillWidth =
                              row.budgetToDate > 0
                                ? `${Math.min(140, Math.max(6, row.utilization * 100))}%`
                                : row.actual > 0
                                  ? "100%"
                                  : "0%";
                            const fillClass =
                              status === "over"
                                ? "bg-rose-400"
                                : status === "near"
                                  ? "bg-amber-300"
                                  : status === "no-budget"
                                    ? "bg-slate-500"
                                    : "bg-emerald-400";

                            return (
                              <>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                  <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${badgeClass}`}>
                                    {statusLabel}
                                  </span>
                                  <div className="text-[11px] text-slate-400">
                                    {L("Prev. period", "Periodo ant.")}:{" "}
                                    <span className="font-semibold text-slate-200">{currency(previousActual)}</span>
                                    {" · "}
                                    {L("Delta", "Delta")}:{" "}
                                    <span className={deltaVsPrevious <= 0 ? "text-emerald-200" : "text-rose-200"}>
                                      {currency(deltaVsPrevious)}
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-3 h-2 rounded-full bg-slate-800">
                                  <div className={`h-2 rounded-full ${fillClass}`} style={{ width: fillWidth }} />
                                </div>
                                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                                  <span>
                                    {L("Consumed", "Consumido")}:{" "}
                                    {row.budgetToDate > 0 && Number.isFinite(row.utilization)
                                      ? `${(row.utilization * 100).toFixed(0)}%`
                                      : "--"}
                                  </span>
                                  <span>
                                    {L("Full period budget", "Presupuesto completo")}: {currency(row.fullBudget)}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>
        )}

        {tab === "controls" && (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {[
                {
                  label: L("Open alerts", "Alertas abiertas"),
                  value: String(controlAlerts.length),
                  hint: L("Renewals, overspend, and break-even warnings", "Renovaciones, sobregasto y alertas de break-even"),
                },
                {
                  label: L("Critical renewals", "Renovaciones criticas"),
                  value: String(
                    upcomingRenewals.filter(
                      (row) => row.renewal && daysUntil(row.renewal, today) <= activeProfile.renewal_alert_days
                    ).length
                  ),
                  hint: L(
                    `Due within ${activeProfile.renewal_alert_days} days`,
                    `Vencen dentro de ${activeProfile.renewal_alert_days} dias`
                  ),
                },
                {
                  label: L("Over-budget categories", "Categorias sobre presupuesto"),
                  value: String(
                    budgetSummary.categoryRows.filter(
                      (row) => row.budgetToDate > 0 && row.actual > row.budgetToDate * (1 + activeProfile.overspend_alert_pct)
                    ).length
                  ),
                  hint: periodTitle,
                },
                {
                  label: L("Fee per trade record", "Fee por registro de trade"),
                  value: totals.feePerRecord == null ? "--" : currency(totals.feePerRecord),
                  hint: tradeCostSourceLabel,
                },
                {
                  label: L("Recommended preset budget", "Presupuesto recomendado del preset"),
                  value: currency(
                    COST_CATEGORIES.reduce((sum, key) => sum + (recommendedBudgetByCategory[key] || 0), 0)
                  ),
                  hint: L("Built from your trader type suggestions", "Construido desde las sugerencias de tu tipo de trader"),
                },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">{card.label}</p>
                  <p className="text-2xl font-semibold mt-2">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-1">{card.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                <h2 className="text-lg font-semibold">{L("Control alerts", "Alertas de control")}</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {L(
                    "These alerts surface the problems that will usually damage a trading business first.",
                    "Estas alertas muestran primero los problemas que normalmente deterioran un negocio de trading."
                  )}
                </p>
                <div className="mt-4 space-y-3">
                  {controlAlerts.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      {L("No active control alerts right now.", "No hay alertas activas de control ahora mismo.")}
                    </p>
                  ) : (
                    controlAlerts.map((alert, index) => (
                      <div
                        key={`${alert.title}-${index}`}
                        className={`rounded-xl border px-4 py-3 ${
                          alert.level === "high"
                            ? "border-rose-500/40 bg-rose-500/10"
                            : alert.level === "medium"
                            ? "border-amber-400/40 bg-amber-400/10"
                            : "border-slate-700 bg-slate-950/40"
                        }`}
                      >
                        <p className="text-sm font-semibold">{alert.title}</p>
                        <p className="text-xs text-slate-300 mt-1">{alert.detail}</p>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <div className="grid gap-6">
                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">{L("Control settings", "Configuracion de control")}</h2>
                      <p className="text-xs text-slate-500 mt-1">
                        {L(
                          "These thresholds drive the alerts above and define what the module treats as risk.",
                          "Estos umbrales alimentan las alertas y definen lo que el modulo trata como riesgo."
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={saveProfile}
                      disabled={profileSaving || !profile}
                      className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                    >
                      {profileSaving ? L("Saving...", "Guardando...") : L("Save settings", "Guardar configuracion")}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-3 text-xs">
                    <label className="space-y-1">
                      <span className="text-slate-400">{L("Renewal alert days", "Dias de alerta de renovacion")}</span>
                      <input
                        value={String(activeProfile.renewal_alert_days)}
                        onChange={(e) =>
                          setProfile((prev) => ({
                            ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                            renewal_alert_days: Math.max(1, Number(e.target.value || 0)),
                          }))
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-400">{L("Overspend alert %", "Porcentaje de alerta de sobregasto")}</span>
                      <input
                        value={String(Number((activeProfile.overspend_alert_pct * 100).toFixed(1)))}
                        onChange={(e) =>
                          setProfile((prev) => ({
                            ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                            overspend_alert_pct: Math.max(0, Number(e.target.value || 0) / 100),
                          }))
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-slate-400">{L("Variable cost alert ratio %", "Ratio % de alerta para costos variables")}</span>
                      <input
                        value={String(Number((activeProfile.variable_cost_alert_ratio * 100).toFixed(1)))}
                        onChange={(e) =>
                          setProfile((prev) => ({
                            ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                            variable_cost_alert_ratio: Math.max(0, Number(e.target.value || 0) / 100),
                          }))
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3 text-xs">
                    {[
                      {
                        label: L("In-app alerts", "Alertas in-app"),
                        value: activeProfile.finance_alerts_inapp_enabled,
                        onToggle: () =>
                          setProfile((prev) => ({
                            ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                            finance_alerts_inapp_enabled: !activeProfile.finance_alerts_inapp_enabled,
                          })),
                      },
                      {
                        label: L("Push alerts", "Alertas push"),
                        value: activeProfile.finance_alerts_push_enabled,
                        onToggle: () =>
                          setProfile((prev) => ({
                            ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                            finance_alerts_push_enabled: !activeProfile.finance_alerts_push_enabled,
                          })),
                      },
                      {
                        label: L("Email alerts", "Alertas por email"),
                        value: activeProfile.finance_alerts_email_enabled,
                        onToggle: () =>
                          setProfile((prev) => ({
                            ...(prev ?? buildDefaultProfitLossProfile(user?.id ?? "", activeAccountId)),
                            finance_alerts_email_enabled: !activeProfile.finance_alerts_email_enabled,
                          })),
                      },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={item.onToggle}
                        className={`rounded-xl border px-4 py-3 text-left transition ${
                          item.value
                            ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                            : "border-slate-700 bg-slate-950/40 text-slate-300"
                        }`}
                      >
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                          {item.value ? L("Enabled", "Activo") : L("Disabled", "Inactivo")}
                        </p>
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-slate-500">
                    {L(
                      "The hourly cron uses these settings when it sends renewal, overspend, and variable-cost alerts.",
                      "El cron horario usa esta configuracion para enviar alertas de renovacion, sobregasto y costos variables."
                    )}
                  </p>
                </section>

                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                  <h2 className="text-lg font-semibold">{L("Variable cost watch", "Monitor de costos variables")}</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {L(
                      "Variable costs should stay visible even when they are already embedded inside trading P&L.",
                      "Los costos variables deben mantenerse visibles aunque ya esten dentro del P&L de trading."
                    )}
                  </p>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span>{L("Cost source", "Fuente de costos")}</span>
                      <span className="font-semibold">{tradeCostSourceLabel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{L("Observed commissions & fees", "Comisiones y fees observados")}</span>
                      <span className="font-semibold">{currency(totals.tradeCosts.total)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{L("Monthly normalized fee drag", "Drag mensual normalizado de fees")}</span>
                      <span className="font-semibold">{currency(totals.monthlyTradeCostDrag)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{L("Trade records in period", "Registros de trade en el periodo")}</span>
                      <span className="font-semibold">{totals.tradeRecordCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{L("Observed fee per record", "Fee observado por registro")}</span>
                      <span className="font-semibold">
                        {totals.feePerRecord == null ? "--" : currency(totals.feePerRecord)}
                      </span>
                    </div>
                    <div className="h-px bg-slate-800" />
                    <div className="flex items-center justify-between">
                      <span>{L("Preset budget recommendation", "Recomendacion de presupuesto del preset")}</span>
                      <span className="font-semibold">
                        {currency(COST_CATEGORIES.reduce((sum, key) => sum + (recommendedBudgetByCategory[key] || 0), 0))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>{L("Current saved monthly budget", "Presupuesto mensual guardado")}</span>
                      <span className="font-semibold">{currency(budgetSummary.monthlyBudgetTotal)}</span>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">{L("Management summary", "Resumen gerencial")}</h2>
                      <p className="text-xs text-slate-500 mt-1">
                        {L(
                          "Use this as your export-ready close memo for yourself, a mentor, or an accountant.",
                          "Usa esto como memo de cierre listo para exportar para ti, un mentor o un contador."
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={downloadClosePackagePdf}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-emerald-400"
                      >
                        {L("Download close PDF", "Descargar close PDF")}
                      </button>
                      <button
                        type="button"
                        onClick={downloadClosePackageCsv}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-emerald-400"
                      >
                        {L("Download close CSV", "Descargar close CSV")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (typeof navigator !== "undefined" && navigator.clipboard) {
                            void navigator.clipboard.writeText(managementSummaryText);
                          }
                        }}
                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-emerald-400"
                      >
                        {L("Copy summary", "Copiar resumen")}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextFile(
                            `profit-loss-summary-${rangeKey}-${toIso(today)}.txt`,
                            managementSummaryText
                          )
                        }
                        className="rounded-xl border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-emerald-400"
                      >
                        {L("Download .txt", "Descargar .txt")}
                      </button>
                    </div>
                  </div>
                  <textarea
                    readOnly
                    value={managementSummaryText}
                    rows={12}
                    className="mt-4 w-full rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-sm text-slate-200"
                  />
                </section>
              </div>
            </div>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <h2 className="text-lg font-semibold">{L("Monthly close", "Cierre mensual")}</h2>
              <p className="text-xs text-slate-500 mt-1">
                {L(
                  "A simple close panel to tell you whether this period is operationally clean.",
                  "Un panel simple de cierre para decirte si este periodo esta operativamente limpio."
                )}
              </p>
              <div className="mt-4 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
                <div className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
                    {L("Close readiness", "Preparacion del cierre")}
                  </p>
                  <p className="mt-2 text-3xl font-semibold">{(monthlyClose.readiness * 100).toFixed(0)}%</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {monthlyClose.completed}/{monthlyClose.checklist.length} {L("checks complete", "checks completos")}
                  </p>
                </div>
                <div className="grid gap-3">
                  {monthlyClose.checklist.map((item) => (
                    <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{item.label}</p>
                        <span
                          className={`text-xs font-semibold ${
                            item.done ? "text-emerald-200" : "text-rose-200"
                          }`}
                        >
                          {item.done ? L("Done", "Listo") : L("Open", "Abierto")}
                        </span>
                      </div>
                    </div>
                  ))}
                  {monthlyClose.actions.length > 0 && (
                    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
                      <p className="text-sm font-semibold">{L("Priority actions", "Acciones prioritarias")}</p>
                      <div className="mt-2 space-y-1 text-xs text-slate-200">
                        {monthlyClose.actions.map((item, index) => (
                          <p key={`${item}-${index}`}>{index + 1}. {item}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
