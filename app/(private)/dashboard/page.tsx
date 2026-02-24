// app/(private)/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { useAuth } from "@/context/AuthContext";
import { computeAdjustedTarget, getGrowthPlanSupabaseByAccount, upsertGrowthPlanSupabase, type GrowthPlan } from "@/lib/growthPlanSupabase";
import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import { upsertDailySnapshot } from "@/lib/snapshotSupabase";
import { getJournalTradesForDates } from "@/lib/journalTradesSupabase";
import { parseNotes, type TradesPayload } from "@/lib/journalNotes";
import { createAlertRule } from "@/lib/alertsSupabase";

// ✅ Cashflows (deposits/withdrawals)
import { listCashflows, signedCashflowAmount, type Cashflow } from "@/lib/cashflowsSupabase";

// IMPORTANT: do NOT import ChecklistItem type from your lib because it may be string/union.
// We only import the function and normalize its output.
import { getDailyChecklist } from "@/lib/checklistSupabase";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";

import TopNav from "@/app/components/TopNav";
import DashboardGrid, { type GridItemId } from "@/app/components/DashboardGrid";

const DynamicDashboardGrid = dynamic(() => Promise.resolve(DashboardGrid), {
  ssr: false,
});

/* =========================
   Types (UI only)
========================= */
type UiChecklistItem = { text: string; done: boolean };

/* =========================
   Utils
========================= */
function formatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateOnlyStr(value: unknown): string | null {
  if (!value) return null;

  if (typeof value === "string") {
    const s = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  }

  const d = new Date(value as any);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateYYYYMMDD(d);
}

function stripHtml(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getPlanStartDateStr(plan: unknown): string | null {
  const p: any = plan ?? null;
  if (!p) return null;

  return (
    toDateOnlyStr(p.planStartDate) ||
    toDateOnlyStr(p.plan_start_date) ||
    toDateOnlyStr(p.createdAt) ||
    toDateOnlyStr(p.created_at) ||
    toDateOnlyStr(p.createdAtIso) ||
    toDateOnlyStr(p.createdAtISO) ||
    toDateOnlyStr(p.updatedAt) ||
    toDateOnlyStr(p.updated_at) ||
    null
  );
}

function getWeekOfYear(date: Date): number {
  // Sunday-based week number (week 1 contains Jan 1).
  const year = date.getFullYear();
  const d = new Date(Date.UTC(year, date.getMonth(), date.getDate()));
  const day = d.getUTCDay(); // 0=Sun

  const weekStart = new Date(d);
  weekStart.setUTCDate(d.getUTCDate() - day);

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearStartSunday = new Date(yearStart);
  yearStartSunday.setUTCDate(yearStart.getUTCDate() - yearStart.getUTCDay());

  const diff = weekStart.getTime() - yearStartSunday.getTime();
  return Math.floor(diff / (7 * 86400000)) + 1;
}

function monthsBetween(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0;
  const s = new Date(`${startIso}T00:00:00Z`);
  const e = new Date(`${endIso}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth());
}

function normalizePhases(raw: any): Array<{
  id: string;
  title?: string | null;
  targetEquity: number;
  targetDate?: string | null;
  status?: "pending" | "completed";
  completedAt?: string | null;
}> {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item) => ({
    id: item.id || crypto.randomUUID(),
    title: item.title ?? null,
    targetEquity: Math.max(0, Number(item.targetEquity) || 0),
    targetDate: item.targetDate ? String(item.targetDate).slice(0, 10) : null,
    status: item.status ?? "pending",
    completedAt: item.completedAt ?? null,
  }));
}

type AutoPhase = {
  targetEquity: number;
  targetDate: string | null;
};

function getUsMarketHolidayDates(year: number): string[] {
  return getUsMarketHolidays(year, false).map((h) => h.date);
}

function listTradingDaysBetween(startIso: string, endIso: string): string[] {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return [];
  const start = s <= e ? s : e;
  const end = s <= e ? e : s;
  const years: number[] = [];
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) years.push(y);
  const holidaySet = new Set(years.flatMap(getUsMarketHolidayDates));

  const days: string[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const ds = toYMD(d);
    if (isTradingDay(ds, holidaySet)) days.push(ds);
  }
  return days;
}

function buildAutoPhases(
  starting: number,
  target: number,
  startIso: string,
  targetIso: string,
  cadence: "weekly" | "monthly" | "quarterly" | "biannual"
): AutoPhase[] {
  if (starting <= 0 || target <= 0) return [];
  const tradingDays = listTradingDaysBetween(startIso, targetIso);
  if (tradingDays.length === 0) return [];
  const totalTradingDays = tradingDays.length;
  const cadenceTradingDays =
    cadence === "weekly" ? 5 : cadence === "monthly" ? 21 : cadence === "quarterly" ? 63 : 126;
  const phasesCount = Math.max(1, Math.ceil(totalTradingDays / cadenceTradingDays));
  const multiple = target / starting;
  if (!Number.isFinite(multiple) || multiple <= 0) return [];

  const rows: AutoPhase[] = [];
  for (let i = 1; i <= phasesCount; i++) {
    const dayIndex =
      i === phasesCount
        ? totalTradingDays - 1
        : Math.min(totalTradingDays - 1, i * cadenceTradingDays - 1);
    const fraction = (dayIndex + 1) / totalTradingDays;
    const targetEquity = Math.round(starting * Math.pow(multiple, fraction));
    const targetDate = tradingDays[dayIndex] ?? tradingDays[tradingDays.length - 1] ?? targetIso;
    rows.push({ targetEquity, targetDate });
  }
  return rows;
}

type CalendarCell = {
  dateStr: string | null;
  dayNumber: number | null;
  entry?: JournalEntry;
  isToday: boolean;
  isCurrentMonth: boolean;
  holiday?: { date: string; label: string } | null;
};

type WeekSummary = {
  index: number;
  pnl: number;
  daysWithTrades: number;
};

type WidgetId = GridItemId;


// ===== Trading calendar / holidays =====
type Holiday = { date: string; label: string; marketClosed?: boolean };

function isWeekend(d: Date): boolean {
  // Stock market weekends: Saturday + Sunday
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isTradingDay(dateStr: string, holidaySet: Set<string>): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return !isWeekend(d) && !holidaySet.has(dateStr);
}

function isFuturesTradingDay(dateStr: string, holidaySet: Set<string>): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  // Futures trade Sunday–Friday (no Saturdays), excluding full market holidays.
  return day !== 6 && !holidaySet.has(dateStr);
}

function toYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number
): Date {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekdayOffset = (7 + weekday - firstOfMonth.getDay()) % 7;
  const day = 1 + firstWeekdayOffset + 7 * (n - 1);
  return new Date(year, month, day);
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const lastOfMonth = new Date(year, month + 1, 0);
  const offsetBack = (7 + lastOfMonth.getDay() - weekday) % 7;
  const day = lastOfMonth.getDate() - offsetBack;
  return new Date(year, month, day);
}

function observedDate(date: Date): Date {
  const day = date.getDay();
  if (day === 6) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  }
  if (day === 0) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  }
  return date;
}

function getUsMarketHolidays(year: number, isEs: boolean): Holiday[] {
  const label = (en: string, es: string) => (isEs ? es : en);
  const holidays: Holiday[] = [];

  holidays.push({
    date: toYMD(observedDate(new Date(year, 0, 1))),
    label: label("New Year's Day", "Año Nuevo"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 0, 1, 3)),
    label: label("Martin Luther King Jr. Day", "Día de Martin Luther King Jr."),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 1, 1, 3)),
    label: label("Presidents' Day", "Día de los Presidentes"),
    marketClosed: true,
  });
  // Good Friday (market closed)
  const easter = getEasterDate(year);
  const goodFriday = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2);
  holidays.push({
    date: toYMD(goodFriday),
    label: label("Good Friday", "Viernes Santo"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getLastWeekdayOfMonth(year, 4, 1)),
    label: label("Memorial Day", "Memorial Day"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(observedDate(new Date(year, 5, 19))),
    label: label("Juneteenth", "Juneteenth"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(observedDate(new Date(year, 6, 4))),
    label: label("Independence Day", "Día de la Independencia"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 8, 1, 1)),
    label: label("Labor Day", "Día del Trabajo"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(getNthWeekdayOfMonth(year, 10, 4, 4)),
    label: label("Thanksgiving Day", "Día de Acción de Gracias"),
    marketClosed: true,
  });
  holidays.push({
    date: toYMD(observedDate(new Date(year, 11, 25))),
    label: label("Christmas Day", "Navidad"),
    marketClosed: true,
  });

  holidays.sort((a, b) => a.date.localeCompare(b.date));
  return holidays;
}

function getEasterDate(year: number): Date {
  // Anonymous Gregorian algorithm (Meeus/Jones/Butcher)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function buildMonthCalendar(
  entries: JournalEntry[],
  baseDate: Date,
  localeTag: string,
  holidayMap: Map<string, Holiday>
): { cells: CalendarCell[]; weeks: WeekSummary[]; monthLabel: string } {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay(); // 0 = Sun

  const totalCells = 42;
  const todayStrLocal = formatDateYYYYMMDD(new Date());

  const monthEntries = entries.filter((e) => {
    const d = new Date((e as any).date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const entryMap = new Map(monthEntries.map((e) => [String((e as any).date).slice(0, 10), e]));
  const cells: CalendarCell[] = [];
  const weeks: WeekSummary[] = Array.from({ length: 6 }, (_, i) => ({
    index: i,
    pnl: 0,
    daysWithTrades: 0,
  }));

  for (let i = 0; i < totalCells; i++) {
    const weekIndex = Math.floor(i / 7);
    const dayNumber =
      i >= startWeekday && i < startWeekday + daysInMonth ? i - startWeekday + 1 : null;

    let dateStr: string | null = null;
    let isCurrentMonth = false;
    let entry: JournalEntry | undefined;
    let isToday = false;
    let holiday: Holiday | null = null;

    if (dayNumber !== null) {
      const d = new Date(year, month, dayNumber);
      dateStr = formatDateYYYYMMDD(d);
      isCurrentMonth = true;
      entry = entryMap.get(dateStr);
      isToday = dateStr === todayStrLocal;
      holiday = dateStr ? holidayMap.get(dateStr) ?? null : null;

      if (entry) {
        const rawPnl = (entry as any).pnl;
        const pnl = typeof rawPnl === "number" ? rawPnl : Number(rawPnl) || 0;
        weeks[weekIndex].pnl += pnl;
        weeks[weekIndex].daysWithTrades += 1;
      }
    }

    cells.push({ dateStr, dayNumber, entry, isToday, isCurrentMonth, holiday });
  }

  const monthLabel = baseDate.toLocaleString(localeTag, { month: "long", year: "numeric" });
  return { cells, weeks, monthLabel };
}

function calcGreenStreak(entries: JournalEntry[]): number {
  const sorted = [...entries].sort((a, b) =>
    String((a as any).date).localeCompare(String((b as any).date))
  );
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const pnlRaw = (sorted[i] as any).pnl;
    const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
    if (pnl > 0) streak++;
    else break;
  }
  return streak;
}

function getDailyTargetPct(plan: GrowthPlan | null): number {
  if (!plan) return 0;
  const p: any = plan;
  const raw = p.dailyTargetPct ?? p.dailyGoalPercent ?? 0;
  return Number(raw) || 0;
}

function calcTradingDayStats(entries: JournalEntry[], holidaySet: Set<string>) {
  const today = new Date();
  const year = today.getFullYear();
  const todayStrLocal = formatDateYYYYMMDD(today);

  const tradedDatesSet = new Set(
    entries
      .filter((e) => new Date(String((e as any).date)).getFullYear() === year)
      .map((e) => String((e as any).date).slice(0, 10))
  );

  const stockDays: string[] = [];
  const futuresDays: string[] = [];

  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);

  for (
    let d = new Date(jan1);
    d <= dec31;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const ds = formatDateYYYYMMDD(d);
    if (isTradingDay(ds, holidaySet)) stockDays.push(ds);
    if (isFuturesTradingDay(ds, holidaySet)) futuresDays.push(ds);
  }

  const pastStockDays = stockDays.filter((d) => d < todayStrLocal);
  const remainingStockDays = stockDays.filter((d) => d >= todayStrLocal);

  const tradedDaysSoFar = pastStockDays.filter((d) => tradedDatesSet.has(d));
  const missedDaysSoFar = pastStockDays.filter((d) => !tradedDatesSet.has(d));

  const remainingFuturesDays = futuresDays.filter((d) => d >= todayStrLocal);

  const daysInYear = Math.round((dec31.getTime() - jan1.getTime()) / 86400000) + 1;
  const dayOfYear = Math.floor((today.getTime() - jan1.getTime()) / 86400000) + 1;
  const remainingCryptoDays = Math.max(0, daysInYear - dayOfYear + 1);

  return {
    stock: {
      total: stockDays.length,
      remaining: remainingStockDays.length,
      tradedDays: tradedDaysSoFar.length,
      missedDays: missedDaysSoFar.length,
    },
    futures: {
      total: futuresDays.length,
      remaining: remainingFuturesDays.length,
    },
    crypto: {
      total: daysInYear,
      remaining: remainingCryptoDays,
    },
  };
}

/* =========================
   Checklist helpers (robust)
========================= */
function normalizeChecklistItems(items: unknown): UiChecklistItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .map((it: any): UiChecklistItem | null => {
      // if string → treat as text
      if (typeof it === "string") {
        const t = it.trim();
        return t ? { text: t, done: false } : null;
      }

      // if object with text/done
      if (it && typeof it === "object") {
        const text = String((it as any).text ?? "").trim();
        if (!text) return null;
        return { text, done: !!(it as any).done };
      }

      return null;
    })
    .filter((x): x is UiChecklistItem => !!x);
}

function extractChecklistTextsFromGrowthPlan(plan: GrowthPlan | null): string[] {
  if (!plan) return [];
  const p: any = plan;

  // ✅ PRIORITY: Growth Plan -> steps.prepare.checklist (Prepare Before Trading)
  const prepChecklist = p?.steps?.prepare?.checklist;

  const texts: string[] = [];

  const pushFromString = (s: string) => {
    texts.push(
      ...s
        .split(/\r?\n|•|\-|\*|\u2022/g)
        .map((x) => x.trim())
        .filter(Boolean)
    );
  };

  const pushFromArray = (arr: any[]) => {
    for (const it of arr) {
      if (!it) continue;

      // string item
      if (typeof it === "string") {
        const t = it.trim();
        if (t) texts.push(t);
        continue;
      }

      // object item (GrowthPlanChecklistItem)
      if (typeof it === "object") {
        const isActive = (it as any).isActive;
        if (isActive === false) continue; // respeta disabled items

        const t = typeof (it as any).text === "string" ? String((it as any).text).trim() : "";
        if (t) texts.push(t);
      }
    }
  };

  // ✅ 1) Try prepare checklist first
  if (typeof prepChecklist === "string") pushFromString(prepChecklist);
  else if (Array.isArray(prepChecklist)) pushFromArray(prepChecklist);

  // ✅ 2) Fallbacks (por si hay otro shape viejo)
  if (texts.length === 0) {
    const candidates = [
      p.todaysChecklist,
      p.todayChecklist,
      p.dailyChecklist,
      p.checklist,
      p.checklistItems,
      p.rules,
      p.ruleList,
      p.growthRules,
      p.playbookRules,
      p.playbook,
    ].filter((x) => x !== undefined && x !== null);

    for (const c of candidates) {
      if (!c) continue;

      if (typeof c === "string") {
        pushFromString(c);
        continue;
      }

      if (Array.isArray(c)) {
        pushFromArray(c);
        continue;
      }

      if (typeof c === "object") {
        const maybe = (c as any).rules ?? (c as any).checklist ?? (c as any).items;
        if (typeof maybe === "string") pushFromString(maybe);
        else if (Array.isArray(maybe)) pushFromArray(maybe);
      }
    }
  }

  // de-dup (case-insensitive)
  const seen = new Set<string>();
  return texts
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function mergeChecklistBaseWithSaved(baseTexts: string[], saved: UiChecklistItem[]): UiChecklistItem[] {
  const base = baseTexts.map((t) => ({ text: t, done: false }));
  const savedNorm = normalizeChecklistItems(saved);

  const byKey = new Map<string, UiChecklistItem>();
  for (const s of savedNorm) byKey.set(s.text.trim().toLowerCase(), s);

  const merged: UiChecklistItem[] = base.map((b) => {
    const key = b.text.trim().toLowerCase();
    const hit = byKey.get(key);
    return hit ? { text: b.text, done: !!hit.done } : b;
  });

  // keep custom items too
  for (const s of savedNorm) {
    const key = s.text.trim().toLowerCase();
    if (!base.some((b) => b.text.trim().toLowerCase() === key)) merged.push(s);
  }

  return merged;
}

/* =========================
   Dashboard
========================= */
export default function DashboardPage() {
  const { user, loading } = useAuth();
  const {
    accounts,
    activeAccountId,
    setActiveAccount,
    createAccount,
    loading: accountsLoading,
    error: accountsError,
  } = useTradingAccounts();
  const router = useRouter();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const localeTag = isEs ? "es-ES" : "en-US";
  const L = (en: string, es: string) => (isEs ? es : en);

  const ALL_WIDGETS: { id: WidgetId; label: string }[] = [
    { id: "progress", label: L("Account Progress", "Progreso de cuenta") },
    { id: "plan-progress", label: L("Plan Progress", "Progreso del plan") },
    { id: "plan-system", label: L("Trading System", "Sistema de trading") },
    { id: "daily-target", label: L("Daily Target", "Meta diaria") },
    { id: "calendar", label: L("P&L Calendar", "Calendario P&L") },
    { id: "weekly", label: L("Weekly Summary", "Resumen semanal") },
    { id: "streak", label: L("Green Streak", "Racha verde") },
    { id: "actions", label: L("Checklist", "Checklist") },
    { id: "trading-days", label: L("Trading Days (Year)", "Días de trading (año)") },
  ];

  const [plan, setPlan] = useState<GrowthPlan | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [serverSeries, setServerSeries] = useState<Array<{ date: string; value: number }> | null>(null);
  const [viewDate, setViewDate] = useState<Date | null>(new Date());

  const [calendarCells, setCalendarCells] = useState<CalendarCell[]>([]);
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [monthLabel, setMonthLabel] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [monthTrades, setMonthTrades] = useState<Record<string, TradesPayload>>({});

  const holidayList = useMemo(() => {
    const years = new Set([viewDate?.getFullYear() ?? new Date().getFullYear(), new Date().getFullYear()]);
    const list: Holiday[] = [];
    years.forEach((y) => list.push(...getUsMarketHolidays(y, isEs)));
    return list;
  }, [viewDate, isEs]);

  const holidayMap = useMemo(() => new Map(holidayList.map((h) => [h.date, h])), [holidayList]);
  const holidaySet = useMemo(() => new Set(holidayList.map((h) => h.date)), [holidayList]);

  const [activeWidgets, setActiveWidgets] = useState<WidgetId[]>([
    "progress",
    "plan-progress",
    "plan-system",
    "daily-target",
    "calendar",
    "weekly",
    "streak",
    "actions",
    "trading-days",
  ]);

  const [ecoNewsCountry, setEcoNewsCountry] = useState("US");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showAccountCreate, setShowAccountCreate] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBroker, setNewAccountBroker] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [widgetsLoaded, setWidgetsLoaded] = useState(false);
  const phaseAlertBusyRef = useRef(false);
  const phaseRuleIdRef = useRef<string | null>(null);

  const widgetTitleClass =
    "widget-title drag-handle select-none cursor-move text-[14px] font-semibold tracking-wide flex items-center gap-2 group";
  const widgetTitleTextClass =
    "text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-cyan-300 to-emerald-400";
  const widgetDragHintClass =
    "text-slate-500 text-[11px] opacity-0 group-hover:opacity-100 transition";

  // ✅ Checklist (today) — UI type ONLY
  const [todayChecklist, setTodayChecklist] = useState<UiChecklistItem[]>([]);
  const [todayChecklistNotes, setTodayChecklistNotes] = useState<string | null>(null);

  // Autosave UX
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [checklistSaveError, setChecklistSaveError] = useState<string | null>(null);

  // Keep original frozen todayStr (other widgets untouched)
  const [todayStr] = useState(() => formatDateYYYYMMDD(new Date()));
  const [currentWeekOfYear] = useState(() => getWeekOfYear(new Date()));

  // Rolling day ONLY for daily-target + actions
  const [rollingTodayStr, setRollingTodayStr] = useState(() => formatDateYYYYMMDD(new Date()));

  const planSystemLists = useMemo(() => {
    const system = plan?.steps?.execution_and_journal?.system;
    const clean = (arr: any[] | undefined) =>
      (arr ?? []).filter((i) => (i?.text ?? "").toString().trim().length > 0);
    const doList = clean(system?.doList as any[]);
    const dontList = clean(system?.dontList as any[]);
    const orderList = clean(system?.orderList as any[]);
    const all = [...doList, ...dontList, ...orderList];
    return {
      doList,
      dontList,
      orderList,
      all,
      allKey: all.map((i) => i.id).join("|"),
    };
  }, [plan]);

  const systemChecklistKey = useMemo(() => {
    const uid = (user as any)?.uid ?? "anon";
    return `tjpro_plan_system_checks_${uid}_${rollingTodayStr}`;
  }, [user, rollingTodayStr]);

  const [systemChecks, setSystemChecks] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ids = new Set(planSystemLists.all.map((i) => i.id));
    let parsed: Record<string, boolean> = {};
    try {
      const raw = window.localStorage.getItem(systemChecklistKey);
      if (raw) parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
    const cleaned: Record<string, boolean> = {};
    ids.forEach((id) => {
      cleaned[id] = !!parsed[id];
    });
    setSystemChecks(cleaned);
  }, [systemChecklistKey, planSystemLists.allKey]);

  const toggleSystemCheck = (id: string) => {
    setSystemChecks((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (typeof window !== "undefined") {
        window.localStorage.setItem(systemChecklistKey, JSON.stringify(next));
      }
      return next;
    });
  };

  // Debounce autosave
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPayloadRef = useRef<string>("");

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1, 0);
      const ms = Math.max(1000, next.getTime() - now.getTime());

      t = setTimeout(() => {
        setRollingTodayStr(formatDateYYYYMMDD(new Date()));
        schedule();
      }, ms);
    };

    schedule();
    return () => {
      if (t) clearTimeout(t);
    };
  }, []);

  // Persist widget toggles
  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;

    const storageKey =
      (user as any).uid
        ? `tjpro_dashboard_widgets_${(user as any).uid}`
        : "tjpro_dashboard_widgets_default";

    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((id: any) => ALL_WIDGETS.some((w) => w.id === id)) as WidgetId[];
          if (valid.length > 0) {
            const withPlan = valid.includes("plan-progress")
              ? valid
              : [...valid, "plan-progress" as WidgetId];
            const withSystem = withPlan.includes("plan-system")
              ? withPlan
              : [...withPlan, "plan-system" as WidgetId];
            setActiveWidgets(withSystem);
          }
        }
      }
    } catch (err) {
      console.warn("[dashboard] error loading widget toggles", err);
    } finally {
      setWidgetsLoaded(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user || !widgetsLoaded) return;
    if (typeof window === "undefined") return;

    const storageKey =
      (user as any).uid
        ? `tjpro_dashboard_widgets_${(user as any).uid}`
        : "tjpro_dashboard_widgets_default";

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(activeWidgets));
    } catch (err) {
      console.warn("[dashboard] error saving widget toggles", err);
    }
  }, [user, activeWidgets, widgetsLoaded]);

  // Protect route
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/signin");
  }, [loading, user, router]);

  // Load plan + journal + checklist + cashflows (rolling day for checklist)
  useEffect(() => {
    if (loading || !user || accountsLoading || !activeAccountId) return;

    const journalUserId = (user as any)?.uid || (user as any)?.id || "";
    const cashflowUserIdPrimary = (user as any)?.id || (user as any)?.uid || "";
    const cashflowUserIdSecondary = (user as any)?.uid || (user as any)?.id || "";

    if (!journalUserId && !cashflowUserIdPrimary) {
      setPlan(null);
      setEntries([]);
      setCashflows([]);
      setTodayChecklist([]);
      setTodayChecklistNotes(null);
      return;
    }

    let cancelled = false;

    const loadAll = async () => {
      try {
        const dbPlan = await getGrowthPlanSupabaseByAccount(activeAccountId);
        if (!cancelled) setPlan(dbPlan ?? null);

        // Journal entries (trading P&L)
        const dbEntries = journalUserId ? await getAllJournalEntries(journalUserId, activeAccountId) : [];
        if (!cancelled) setEntries(dbEntries);

        // Cashflows (deposits/withdrawals)
        try {
          const fromDate = getPlanStartDateStr(dbPlan ?? null) ?? undefined;
          const opts: any = fromDate
            ? { fromDate, throwOnError: true, forceServer: true, accountId: activeAccountId }
            : { throwOnError: true, forceServer: true, accountId: activeAccountId };

          let cf: Cashflow[] = [];

          if (cashflowUserIdPrimary) {
            cf = await listCashflows(String(cashflowUserIdPrimary), opts);
          }

          // fallback in case your auth object uses uid != id
          if ((!cf || cf.length === 0) && cashflowUserIdSecondary && cashflowUserIdSecondary !== cashflowUserIdPrimary) {
            const alt = await listCashflows(String(cashflowUserIdSecondary), opts);
            if (alt?.length) cf = alt;
          }

          if (!cancelled) setCashflows(cf ?? []);
        } catch (err) {
          console.warn("[dashboard] cashflows load error:", err);
          if (!cancelled) setCashflows([]);
        }

        // this can return ANY shape → normalize
        const checklistRow: any = journalUserId ? await getDailyChecklist(journalUserId, rollingTodayStr) : null;

        const defaultChecklist: string[] = [
          L("Respect your max daily loss limit.", "Respeta tu pérdida máxima diaria."),
          L("Take only planned setups from your playbook.", "Toma solo setups planificados de tu playbook."),
          L("Log your session inside 3 minutes.", "Registra tu sesión dentro de 3 minutos."),
        ];

        const baseTexts = extractChecklistTextsFromGrowthPlan(dbPlan ?? null);
        const base = baseTexts.length ? baseTexts : defaultChecklist;

        const savedItems = normalizeChecklistItems(checklistRow?.items ?? []);
        const merged = mergeChecklistBaseWithSaved(base, savedItems);

        if (!cancelled) {
          setTodayChecklist(merged);
          setTodayChecklistNotes(checklistRow?.notes ?? null);
          setChecklistSaveError(null);
          setChecklistSaving(false);
          lastPayloadRef.current = "";
        }
      } catch (err) {
        console.error("[dashboard] error loading data:", err);
        if (!cancelled) {
          setPlan(null);
          setEntries([]);
          setCashflows([]);
          setTodayChecklist([]);
          setTodayChecklistNotes(null);
          setChecklistSaving(false);
          setChecklistSaveError(L("Failed to load checklist.", "No se pudo cargar el checklist."));
        }
      }
    };

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [loading, user, rollingTodayStr, accountsLoading, activeAccountId]);

  // Authoritative balance series (server-side)
  useEffect(() => {
    let alive = true;
    async function loadSeries() {
      if (loading || !user || accountsLoading || !activeAccountId) return;
      try {
        const { data: sessionData } = await supabaseBrowser.auth.getSession();
        const token = sessionData?.session?.access_token;
        if (!token) return;

        const res = await fetch(`/api/account/series?accountId=${encodeURIComponent(activeAccountId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const body = await res.json();
        if (!alive) return;
        if (Array.isArray(body?.series)) {
          setServerSeries(body.series);
        }
      } catch {
        // ignore
      }
    }
    loadSeries();
    return () => {
      alive = false;
    };
  }, [loading, user]);

  // Rebuild calendar
  useEffect(() => {
    if (!viewDate) return;
    const { cells, weeks, monthLabel } = buildMonthCalendar(entries, viewDate, localeTag, holidayMap);
    setCalendarCells(cells);
    setWeeks(weeks);
    setMonthLabel(monthLabel);
  }, [entries, viewDate, localeTag, holidayMap]);

  // Load trades for the visible month (for quick summary panel)
  useEffect(() => {
    if (!user || !activeAccountId || !viewDate) return;
    const userId = (user as any)?.uid || (user as any)?.id || "";
    if (!userId) return;

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const monthDates = Array.from(
      new Set(
        entries
          .map((e) => String((e as any)?.date || "").slice(0, 10))
          .filter((ds) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return false;
            const d = new Date(ds + "T00:00:00");
            return d.getFullYear() === year && d.getMonth() === month;
          })
      )
    );

    if (monthDates.length === 0) {
      setMonthTrades({});
      setSelectedDate(null);
      return;
    }

    let alive = true;
    (async () => {
      try {
        const payload = await getJournalTradesForDates(userId, monthDates, activeAccountId);
        if (!alive) return;
        setMonthTrades(payload || {});

        if (!selectedDate || !monthDates.includes(selectedDate)) {
          const today = formatDateYYYYMMDD(new Date());
          if (monthDates.includes(today)) {
            setSelectedDate(today);
          } else {
            setSelectedDate(monthDates[0] || null);
          }
        }
      } catch (err) {
        if (!alive) return;
        setMonthTrades({});
      }
    })();

    return () => {
      alive = false;
    };
  }, [entries, viewDate, user, activeAccountId]);

  const weekRowNumbers = useMemo(() => {
    const rows: (number | null)[] = [];
    for (let row = 0; row < 6; row++) {
      let weekNo: number | null = null;
      let fallback: number | null = null;

        for (let col = 0; col < 7; col++) {
          const idx = row * 7 + col;
          const cell = calendarCells[idx];
          if (!cell || !cell.dateStr || cell.dayNumber === null) continue;

          const cellDate = new Date(cell.dateStr + "T00:00:00");
          const dow = cellDate.getDay();
          if (fallback === null) fallback = getWeekOfYear(cellDate);
          if (dow === 0) {
            weekNo = getWeekOfYear(cellDate);
            break;
          }
        }
      rows.push(weekNo ?? fallback);
    }
    return rows;
  }, [calendarCells]);

  const tradingStats = useMemo(() => calcTradingDayStats(entries, holidaySet), [entries, holidaySet]);

  const filteredEntries = useMemo(() => {
    const planStartStr = getPlanStartDateStr(plan);
    if (!planStartStr) return entries;

    const filtered = entries.filter((e) => {
      const raw = (e as any).date;
      if (!raw) return false;
      const entryStr = String(raw).slice(0, 10);
      return entryStr >= planStartStr;
    });

    return filtered.length > 0 ? filtered : entries;
  }, [plan, entries]);

  const filteredCashflows = useMemo(() => {
    // prefer to filter cashflows from plan start too (defensive)
    const planStartStr = getPlanStartDateStr(plan);
    if (!planStartStr) return cashflows;

    const filtered = cashflows.filter((cf) => {
      const raw = (cf as any)?.date;
      if (!raw) return false;
      const ds = String(raw).slice(0, 10);
      return ds >= planStartStr;
    });

    return filtered.length > 0 ? filtered : cashflows;
  }, [plan, cashflows]);

  const cashflowNet = useMemo(() => {
    return (filteredCashflows ?? []).reduce((acc, cf) => acc + signedCashflowAmount(cf), 0);
  }, [filteredCashflows]);

  // ✅ Daily Target uses rollingTodayStr ONLY
  const sessionDateStr = rollingTodayStr;

  const dailyCalcs = useMemo(() => {
    if (!plan) {
      return {
        dailyTargetPct: 0,
        startOfSessionBalance: 0,
        expectedSessionUSD: 0,
        actualSessionUSD: 0,
        diffSessionVsGoal: 0,
        goalMet: false,
        progressToGoal: 0,
        remainingToGoal: 0,
        aboveGoal: 0,
        isTradingDay: true,
        holidayLabel: null as string | null,
      };
    }

    const dailyTargetPct = getDailyTargetPct(plan);
    const starting = (plan as any).startingBalance ?? 0;
    const holiday = holidayMap.get(sessionDateStr) ?? null;
    const isClosedDay = !!holiday || !isTradingDay(sessionDateStr, holidaySet);

    const sumUpTo = (dateStr: string) =>
      filteredEntries
        .filter((e) => String((e as any).date).slice(0, 10) < dateStr)
        .reduce((s, e) => {
          const pnlRaw = (e as any).pnl;
          const entryPnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
          return s + entryPnl;
        }, 0);

    const sumCashflowsUpToInclusive = (dateStr: string) =>
      filteredCashflows
        .filter((cf) => String((cf as any)?.date).slice(0, 10) <= dateStr)
        .reduce((s, cf) => s + signedCashflowAmount(cf), 0);

    const sessionEntry =
      filteredEntries.find((e) => String((e as any).date).slice(0, 10) === sessionDateStr) ?? null;

    const actualSessionUSD = sessionEntry
      ? (() => {
          const pnlRaw = (sessionEntry as any).pnl;
          return typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
        })()
      : 0;

    const fallbackStart = starting + sumUpTo(sessionDateStr) + sumCashflowsUpToInclusive(sessionDateStr);

    let startOfSessionBalance = fallbackStart;

    if (serverSeries && serverSeries.length) {
      const exact = serverSeries.find((p) => p.date === sessionDateStr);
      if (exact && Number.isFinite(exact.value)) {
        startOfSessionBalance = Number(exact.value) - actualSessionUSD;
      } else {
        const prior = [...serverSeries].filter((p) => p.date < sessionDateStr).pop();
        if (prior && Number.isFinite(prior.value)) {
          startOfSessionBalance = Number(prior.value);
        }
      }
    }

    const expectedSessionUSD =
      !isClosedDay && dailyTargetPct !== 0 ? startOfSessionBalance * (dailyTargetPct / 100) : 0;

    const diffSessionVsGoal = actualSessionUSD - expectedSessionUSD;
    const goalMet = expectedSessionUSD > 0 && actualSessionUSD >= expectedSessionUSD;

    const progressToGoal =
      expectedSessionUSD > 0 ? Math.min(150, Math.max(0, (actualSessionUSD / expectedSessionUSD) * 100)) : 0;

    const remainingToGoal = expectedSessionUSD > 0 ? Math.max(0, expectedSessionUSD - actualSessionUSD) : 0;
    const aboveGoal = expectedSessionUSD > 0 ? Math.max(0, actualSessionUSD - expectedSessionUSD) : 0;

    return {
      dailyTargetPct,
      startOfSessionBalance,
      expectedSessionUSD,
      actualSessionUSD,
      diffSessionVsGoal,
      goalMet,
      progressToGoal,
      remainingToGoal,
      aboveGoal,
      isTradingDay: !isClosedDay,
      holidayLabel: holiday?.label ?? null,
    };
  }, [plan, filteredEntries, filteredCashflows, sessionDateStr, serverSeries, holidayMap, holidaySet]);

  // Snapshot upsert
  useEffect(() => {
    const userId = (user as any)?.uid || (user as any)?.id || "";
    if (!userId || !activeAccountId) return;
    if (!plan) return;
    if (!dailyCalcs.isTradingDay) return;
    if (dailyCalcs.dailyTargetPct === 0) return;

    let cancelled = false;

    const save = async () => {
      try {
        await upsertDailySnapshot({
          user_id: userId,
          account_id: activeAccountId,
          date: sessionDateStr,
          start_of_day_balance: dailyCalcs.startOfSessionBalance,
          expected_usd: dailyCalcs.expectedSessionUSD,
          realized_usd: dailyCalcs.actualSessionUSD,
          delta_usd: dailyCalcs.diffSessionVsGoal,
          goal_met: dailyCalcs.goalMet,
        });
        try {
          window.dispatchEvent(new Event("ntj_alert_engine_run_now"));
        } catch {
          // ignore
        }
      } catch (e) {
        if (!cancelled) console.warn("[snapshotSupabase] upsert error:", e);
      }
    };

    save();
    return () => {
      cancelled = true;
    };
  }, [user, plan, sessionDateStr, dailyCalcs, activeAccountId]);

  // ========== Checklist autosave ==========
  async function saveChecklistToServer(payload: { date: string; items: UiChecklistItem[]; notes?: string | null }) {
    const userId = (user as any)?.uid || (user as any)?.id || "";
    if (!userId) return;

    const serialized = JSON.stringify({ date: payload.date, items: payload.items, notes: payload.notes ?? null });
    if (serialized === lastPayloadRef.current) return;
    lastPayloadRef.current = serialized;

    setChecklistSaving(true);
    setChecklistSaveError(null);

    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/checklist/upsert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: payload.date,
          items: payload.items,
          notes: payload.notes ?? null,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }
    } catch (err) {
      console.warn("[checklist] autosave failed:", err);
      setChecklistSaveError(
        L(
          "Could not save checklist (retrying on next change).",
          "No se pudo guardar el checklist (reintentando en el próximo cambio)."
        )
      );
      lastPayloadRef.current = ""; // allow retry
    } finally {
      setChecklistSaving(false);
    }
  }

  function queueChecklistSave(nextItems: UiChecklistItem[], nextNotes?: string | null) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveChecklistToServer({
        date: rollingTodayStr,
        items: nextItems,
        notes: nextNotes ?? todayChecklistNotes,
      });
    }, 500);
  }

  function toggleChecklistItem(idx: number) {
    setTodayChecklist((prev) => {
      const next = prev.map((it, i) => (i === idx ? { ...it, done: !it.done } : it));
      queueChecklistSave(next);
      return next;
    });
  }

  // Derived metrics
  const name = (user as any)?.name || L("Trader", "Trader");

  const { starting, target, currentBalance, progressPct, clampedProgress } = useMemo(() => {
    const startingLocal = (plan as any)?.startingBalance ?? 0;
    const adjustedStart = plan ? startingLocal + (cashflowNet ?? 0) : startingLocal;
    const targetLocal = plan ? computeAdjustedTarget(plan, cashflowNet ?? 0) : 0;

    const totalPnlLocal = filteredEntries.reduce((sum, e) => {
      const pnlRaw = (e as any).pnl;
      const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
      return sum + pnl;
    }, 0);

    const latestSeriesValue = (() => {
      if (!serverSeries || serverSeries.length === 0) return null;
      const sorted = [...serverSeries].sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const last = sorted[sorted.length - 1];
      const v = Number(last?.value);
      return Number.isFinite(v) ? v : null;
    })();

    // ✅ Current account balance prefers authoritative equity series (if present)
    const fallbackBalance = plan ? adjustedStart + totalPnlLocal : startingLocal;
    const currentBalanceLocal = latestSeriesValue ?? fallbackBalance;

    const progressPctLocal =
      plan && targetLocal > adjustedStart
        ? ((currentBalanceLocal - adjustedStart) / (targetLocal - adjustedStart)) * 100
        : 0;

    const clampedProgressLocal = Math.max(0, Math.min(Number.isFinite(progressPctLocal) ? progressPctLocal : 0, 150));

    return {
      starting: adjustedStart,
      target: targetLocal,
      currentBalance: currentBalanceLocal,
      progressPct: progressPctLocal,
      clampedProgress: clampedProgressLocal,
    };
  }, [plan, filteredEntries, cashflowNet, serverSeries]);

  const planStartStr = useMemo(() => getPlanStartDateStr(plan) || "", [plan]);
  const targetDateStr = useMemo(
    () => String((plan as any)?.targetDate ?? (plan as any)?.target_date ?? "").slice(0, 10),
    [plan]
  );

  const autoPhaseCadence = useMemo(() => {
    const raw =
      (plan as any)?.steps?._ui?.autoPhaseCadence ??
      (plan as any)?.autoPhaseCadence ??
      (plan as any)?.planCadence ??
      "";
    const cleaned = String(raw || "").toLowerCase();
    return ["weekly", "monthly", "quarterly", "biannual"].includes(cleaned) ? (cleaned as any) : "monthly";
  }, [plan]);

  const autoCadenceLabel =
    autoPhaseCadence === "weekly"
      ? L("Weekly", "Semanal")
      : autoPhaseCadence === "monthly"
        ? L("Monthly", "Mensual")
        : autoPhaseCadence === "quarterly"
          ? L("Quarterly", "Trimestral")
          : L("Bi-annual", "Semestral");
  const autoCadenceUnit =
    autoPhaseCadence === "weekly"
      ? L("Week", "Semana")
      : autoPhaseCadence === "monthly"
        ? L("Month", "Mes")
        : autoPhaseCadence === "quarterly"
          ? L("Quarter", "Trimestre")
          : L("Semester", "Semestre");

  const autoPhases = useMemo(() => {
    if (!plan || (plan as any)?.planMode !== "auto") return [];
    if (!planStartStr || !targetDateStr) return [];
    const rawPhases = Array.isArray((plan as any)?.planPhases)
      ? (plan as any).planPhases
      : Array.isArray((plan as any)?.plan_phases)
        ? (plan as any).plan_phases
        : [];
    if (rawPhases.length > 0) {
      return normalizePhases(rawPhases).map((p) => ({
        targetEquity: p.targetEquity,
        targetDate: p.targetDate ?? null,
      }));
    }
    const starting = Number((plan as any)?.startingBalance ?? 0) || 0;
    const target = Number((plan as any)?.targetBalance ?? 0) || 0;
    if (starting <= 0 || target <= 0) return [];
    return buildAutoPhases(starting, target, planStartStr, targetDateStr, autoPhaseCadence);
  }, [plan, planStartStr, targetDateStr, autoPhaseCadence]);

  const phaseMetrics = useMemo(() => {
    if (!plan || !planStartStr || !targetDateStr) return null;

    const totalMonthsRaw = monthsBetween(planStartStr, targetDateStr);
    const totalMonths = Math.max(1, totalMonthsRaw + 1);

    const todayStr = formatDateYYYYMMDD(new Date());
    const currentMonthIndex = Math.min(
      totalMonths,
      Math.max(1, monthsBetween(planStartStr, todayStr) + 1)
    );

    const targetMultiple =
      (plan as any).targetMultiple ??
      ((plan as any)?.startingBalance > 0 && (plan as any)?.targetBalance > 0
        ? (plan as any).targetBalance / (plan as any).startingBalance
        : 0);

    if (!targetMultiple || !Number.isFinite(targetMultiple) || targetMultiple <= 0) return null;

    const adjustedStart = (plan as any).startingBalance + (cashflowNet ?? 0);
    const monthlyRate = Math.pow(targetMultiple, 1 / totalMonths) - 1;

    const prevTarget = adjustedStart * Math.pow(1 + monthlyRate, currentMonthIndex - 1);
    const monthTarget = adjustedStart * Math.pow(1 + monthlyRate, currentMonthIndex);
    const monthDelta = Math.max(1, monthTarget - prevTarget);
    const monthProgress = Math.max(0, Math.min(1.25, (currentBalance - prevTarget) / monthDelta));

    const remainingToMonth = Math.max(0, monthTarget - currentBalance);

    const nextMidIndex = Math.min(totalMonths, Math.ceil(currentMonthIndex / 6) * 6);
    const midTarget = adjustedStart * Math.pow(1 + monthlyRate, nextMidIndex);

    return {
      totalMonths,
      currentMonthIndex,
      monthTarget,
      monthProgress,
      remainingToMonth,
      monthlyRate,
      midIndex: nextMidIndex,
      midTarget,
    };
  }, [plan, planStartStr, targetDateStr, cashflowNet, currentBalance]);

  const autoPhaseMetrics = useMemo(() => {
    if (!plan || (plan as any)?.planMode !== "auto") return null;
    if (!autoPhases.length) return null;
    const sorted = [...autoPhases].sort((a, b) => a.targetEquity - b.targetEquity);
    const current = sorted.find((p) => currentBalance < p.targetEquity) || sorted[sorted.length - 1];
    const currentIndex = sorted.findIndex((p) => p === current);
    const baseStart = Number((plan as any)?.startingBalance ?? 0) + (cashflowNet ?? 0);
    const prevTarget = currentIndex > 0 ? sorted[currentIndex - 1].targetEquity : baseStart;
    const span = Math.max(1, current.targetEquity - prevTarget);
    const progress = Math.max(0, Math.min(1.25, (currentBalance - prevTarget) / span));
    return {
      current,
      index: currentIndex + 1,
      total: sorted.length,
      prevTarget,
      progress,
      remaining: Math.max(0, current.targetEquity - currentBalance),
    };
  }, [plan, autoPhases, currentBalance, cashflowNet]);

  const manualPhases = useMemo(() => {
    return normalizePhases((plan as any)?.planPhases ?? (plan as any)?.plan_phases);
  }, [plan]);

  const manualPhaseMetrics = useMemo(() => {
    if (!plan || manualPhases.length === 0) return null;

    const sorted = [...manualPhases].sort((a, b) => a.targetEquity - b.targetEquity);
    const current = sorted.find((p) => currentBalance < p.targetEquity) || sorted[sorted.length - 1];

    const currentIndex = sorted.findIndex((p) => p.id === current.id);
    const prevTarget = currentIndex > 0 ? sorted[currentIndex - 1].targetEquity : (plan as any)?.startingBalance ?? 0;
    const span = Math.max(1, current.targetEquity - prevTarget);
    const progress = Math.max(0, Math.min(1.25, (currentBalance - prevTarget) / span));

    return {
      current,
      prevTarget,
      progress,
      remaining: Math.max(0, current.targetEquity - currentBalance),
    };
  }, [plan, manualPhases, currentBalance]);

  async function ensurePhaseRuleId(userId: string): Promise<string | null> {
    if (!userId) return null;
    if (phaseRuleIdRef.current) return phaseRuleIdRef.current;

    try {
      const { data: existing, error } = await supabaseBrowser
        .from("ntj_alert_rules")
        .select("id")
        .eq("user_id", userId)
        .eq("key", "plan_phase_completed")
        .maybeSingle();

      if (!error && existing?.id) {
        phaseRuleIdRef.current = String(existing.id);
        return phaseRuleIdRef.current;
      }
    } catch {
      // ignore
    }

    const res = await createAlertRule(userId, {
      key: "plan_phase_completed",
      trigger_type: "PLAN_PHASE_COMPLETED",
      title: L("Plan phase completed", "Fase de plan completada"),
      message: L(
        "You completed a plan phase. Log the outcome and update the next target.",
        "Completaste una fase del plan. Registra el resultado y ajusta la próxima meta."
      ),
      severity: "info",
      enabled: true,
      channels: ["popup", "inapp"],
      kind: "reminder",
      category: "achievement",
      config: { source: "system", core: true },
    });

    if (res.ok) {
      phaseRuleIdRef.current = res.data.ruleId;
      return res.data.ruleId;
    }
    return null;
  }

  // Phase completion detector (manual mode) → marks phase completed + pushes alert event
  useEffect(() => {
    const userId = (user as any)?.id || (user as any)?.uid || "";
    if (!userId || !activeAccountId) return;
    if (!plan || (plan as any).planMode !== "manual") return;
    if (!manualPhases.length) return;
    if (phaseAlertBusyRef.current) return;

    const newlyCompleted = manualPhases.filter(
      (p) => (p.status ?? "pending") !== "completed" && currentBalance >= p.targetEquity
    );
    if (newlyCompleted.length === 0) return;

    phaseAlertBusyRef.current = true;

    (async () => {
      const nowIso = new Date().toISOString();
      const todayISO = formatDateYYYYMMDD(new Date());

      const rawPhases = Array.isArray((plan as any)?.planPhases)
        ? (plan as any).planPhases
        : Array.isArray((plan as any)?.plan_phases)
          ? (plan as any).plan_phases
          : [];

      const nextPhases = rawPhases.map((p: any) => {
        const id = String(p?.id ?? "");
        const match = newlyCompleted.find((n) => n.id === id);
        if (!match) return p;
        return {
          ...p,
          status: "completed",
          completedAt: p.completedAt ?? nowIso,
        };
      });

      try {
        await upsertGrowthPlanSupabase({ planPhases: nextPhases }, activeAccountId);
        setPlan((prev) => (prev ? ({ ...(prev as any), planPhases: nextPhases } as any) : prev));
      } catch (e) {
        console.warn("[dashboard] phase update failed", e);
      }

      const ruleId = await ensurePhaseRuleId(userId);
      if (ruleId) {
        for (const phase of newlyCompleted) {
          const title = L("Plan phase completed", "Fase de plan completada");
          const message = L(
            `Phase "${phase.title || "Phase"}" reached ${phase.targetEquity.toFixed(2)}.`,
            `Fase "${phase.title || "Fase"}" alcanzó ${phase.targetEquity.toFixed(2)}.`
          );
          try {
            await supabaseBrowser.from("ntj_alert_events").insert({
              user_id: userId,
              rule_id: ruleId,
              status: "active",
              triggered_at: nowIso,
              date: todayISO,
              payload: {
                kind: "reminder",
                category: "achievement",
                title,
                message,
                phase_id: phase.id,
                phase_title: phase.title ?? null,
                target_equity: phase.targetEquity,
                triggered_at: nowIso,
                date: todayISO,
              },
            });
          } catch (e) {
            console.warn("[dashboard] phase alert insert failed", e);
          }
        }

        try {
          window.dispatchEvent(new Event("ntj_alert_engine_run_now"));
        } catch {
          // ignore
        }
      }
    })().finally(() => {
      phaseAlertBusyRef.current = false;
    });
  }, [plan, manualPhases, currentBalance, activeAccountId, user, L]);

  const greenStreak = calcGreenStreak(filteredEntries);

  const greenDays = filteredEntries.filter((e) => {
    const pnlRaw = (e as any).pnl;
    const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
    return pnl > 0;
  }).length;

  const blueDays = filteredEntries.filter((e) => {
    const pnlRaw = (e as any).pnl;
    const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
    return pnl < 0;
  }).length;

  // Month navigation
  const goPrevMonth = () => {
    if (!viewDate) return;
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() - 1);
    setViewDate(d);
  };

  const goNextMonth = () => {
    if (!viewDate) return;
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() + 1);
    setViewDate(d);
  };

  const onDayClick = (dateStr: string | null) => {
    if (!dateStr) return;
    setSelectedDate(dateStr);
    router.push(`/journal/${dateStr}`);
  };

  const onOpenJournal = (dateStr: string | null) => {
    if (!dateStr) return;
    router.push(`/journal/${dateStr}`);
  };

  const layoutStorageKey =
    user && (user as any).uid ? `tjpro_dashboard_layout_${(user as any).uid}` : "tjpro_dashboard_layout_default";

  // ===== Render widgets =====
  const renderItem = (id: WidgetId) => {
    if (id === "progress") {
      return (
        <>
          <p className={widgetTitleClass}>
            <span className={widgetTitleTextClass}>
              {L("Account Progress", "Progreso de cuenta")}
            </span>
            <span className={widgetDragHintClass}>⠿</span>
          </p>

          {plan ? (
            <>
              <p className="text-[16px] text-slate-300 mt-2">
                {L("Start:", "Inicio:")}{" "}
                <span className="text-slate-50 font-semibold">${starting.toFixed(2)}</span> ·{" "}
                {L("Target:", "Meta:")}{" "}
                <span className="text-emerald-400 font-semibold">${target.toFixed(2)}</span>
              </p>

              <p className="text-[16px] text-slate-300 mt-1">
                {L("Current balance:", "Balance actual:")}{" "}
                <span className="text-slate-50 font-semibold">${currentBalance.toFixed(2)}</span>
              </p>

              <div className="mt-4 h-4 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-4 bg-linear-to-r from-emerald-400 via-emerald-300 to-sky-400"
                  style={{ width: `${clampedProgress}%` }}
                />
              </div>

              <p className="text-[14px] text-slate-400 mt-2 leading-snug">
                {clampedProgress <= 0
                  ? L(
                      "You are at 0% of this plan. Let the first sessions set the tone.",
                      "Estás en 0% de este plan. Deja que las primeras sesiones marquen el ritmo."
                    )
                  : clampedProgress < 100
                  ? L(
                      `You have completed ${progressPct.toFixed(1)}% of your target based on data since this plan started.`,
                      `Has completado ${progressPct.toFixed(1)}% de tu meta según los datos desde que inició este plan.`
                    )
                  : L(
                      "You have exceeded this target. Time to define the next structured goal.",
                      "Has superado esta meta. Es momento de definir el próximo objetivo."
                    )}
              </p>
            </>
          ) : (
            <p className="text-[14px] text-slate-500 mt-2">
              {L("No growth plan set yet.", "Aún no tienes un plan de crecimiento.")}{" "}
              <Link href="/growth-plan" data-tour="dash-edit-growth-plan" className="text-emerald-400 underline">
                {L("Create your plan now.", "Crea tu plan ahora.")}
              </Link>
            </p>
          )}
        </>
      );
    }

    if (id === "plan-progress") {
      return (
        <>
          <p className={widgetTitleClass}>
            <span className={widgetTitleTextClass}>
              {L("Plan Progress (Phases)", "Progreso del plan (fases)")}
            </span>
            <span className={widgetDragHintClass}>⠿</span>
          </p>

          {!plan ? (
            <p className="text-[14px] text-slate-500 mt-2">
              {L("No growth plan set yet.", "Aún no tienes un plan de crecimiento.")}{" "}
              <Link href="/growth-plan" data-tour="dash-edit-growth-plan" className="text-emerald-400 underline">
                {L("Create your plan now.", "Crea tu plan ahora.")}
              </Link>
            </p>
          ) : plan?.planMode === "manual" ? (
            manualPhaseMetrics ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Current phase", "Fase actual")}
                </p>
                <p className="text-[16px] text-slate-100 font-semibold">
                  {manualPhaseMetrics.current.title || L("Phase", "Fase")}
                </p>
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Target:", "Meta:")}{" "}
                  <span className="text-emerald-300">${manualPhaseMetrics.current.targetEquity.toFixed(2)}</span>
                </p>
                {manualPhaseMetrics.current.targetDate ? (
                  <p className="text-[12px] text-slate-500 mt-1">
                    {L("Target date:", "Fecha objetivo:")}{" "}
                    <span className="text-slate-200">{manualPhaseMetrics.current.targetDate}</span>
                  </p>
                ) : null}
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Progress:", "Progreso:")}{" "}
                  <span className="text-slate-200">{(manualPhaseMetrics.progress * 100).toFixed(1)}%</span>
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Phase progress", "Progreso de fase")}
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-2 bg-linear-to-r from-emerald-400 via-emerald-300 to-sky-400"
                    style={{ width: `${Math.min(100, manualPhaseMetrics.progress * 100)}%` }}
                  />
                </div>
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Remaining:", "Falta:")}{" "}
                  <span className="text-slate-200">${manualPhaseMetrics.remaining.toFixed(2)}</span>
                </p>
              </div>
            </div>
            ) : (
              <p className="text-[13px] text-slate-500 mt-2">
                {L("Add manual phases to activate this widget.", "Agrega fases manuales para activar este widget.")}{" "}
                <Link href="/growth-plan" data-tour="dash-edit-growth-plan" className="text-emerald-400 underline">
                  {L("Edit Growth Plan", "Editar Growth Plan")}
                </Link>
              </p>
            )
          ) : !targetDateStr ? (
            <p className="text-[13px] text-slate-500 mt-2">
              {L(
                "Add a target date to activate auto milestones.",
                "Agrega una fecha meta para activar metas automáticas."
              )}{" "}
              <Link href="/growth-plan" data-tour="dash-edit-growth-plan" className="text-emerald-400 underline">
                {L("Edit Growth Plan", "Editar Growth Plan")}
              </Link>
            </p>
          ) : autoPhaseMetrics ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Current milestone", "Meta actual")} · {autoCadenceUnit} {autoPhaseMetrics.index}/{autoPhaseMetrics.total}
                </p>
                <p className="text-[16px] text-slate-100 font-semibold">
                  ${autoPhaseMetrics.current.targetEquity.toFixed(2)}
                </p>
                {autoPhaseMetrics.current.targetDate ? (
                  <p className="text-[12px] text-slate-500 mt-1">
                    {L("Target date:", "Fecha objetivo:")}{" "}
                    <span className="text-slate-200">{autoPhaseMetrics.current.targetDate}</span>
                  </p>
                ) : null}
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Cadence:", "Cadencia:")}{" "}
                  <span className="text-slate-200">{autoCadenceLabel}</span>
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Milestone progress", "Progreso de meta")}
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-2 bg-linear-to-r from-emerald-400 via-emerald-300 to-sky-400"
                    style={{ width: `${Math.min(100, autoPhaseMetrics.progress * 100)}%` }}
                  />
                </div>
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Remaining:", "Falta:")}{" "}
                  <span className="text-slate-200">${autoPhaseMetrics.remaining.toFixed(2)}</span>
                </p>
              </div>
            </div>
          ) : phaseMetrics ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Long‑term target", "Meta largo plazo")}
                </p>
                <p className="text-[16px] text-emerald-300 font-semibold">
                  ${target.toFixed(2)}
                </p>
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Target date:", "Fecha meta:")}{" "}
                  <span className="text-slate-200">{targetDateStr}</span>
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Monthly milestone", "Meta mensual")} ·{" "}
                  {L("Month", "Mes")} {phaseMetrics.currentMonthIndex}/{phaseMetrics.totalMonths}
                </p>
                <p className="text-[16px] text-slate-100 font-semibold">
                  ${phaseMetrics.monthTarget.toFixed(2)}
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-2 bg-linear-to-r from-emerald-400 via-emerald-300 to-sky-400"
                    style={{ width: `${Math.min(100, phaseMetrics.monthProgress * 100)}%` }}
                  />
                </div>
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Remaining this month:", "Falta este mes:")}{" "}
                  <span className="text-slate-200">${phaseMetrics.remainingToMonth.toFixed(2)}</span>
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Mid‑term milestone", "Meta mediano plazo")} ·{" "}
                  {L("Month", "Mes")} {phaseMetrics.midIndex}
                </p>
                <p className="text-[16px] text-slate-100 font-semibold">
                  ${phaseMetrics.midTarget.toFixed(2)}
                </p>
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Compounded pacing:", "Ritmo compuesto:")}{" "}
                  <span className="text-slate-200">
                    {(phaseMetrics.monthlyRate * 100).toFixed(2)}%/{L("month", "mes")}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-slate-500 mt-2">
              {L("Phase tracking requires a target date and valid plan numbers.", "El tracking por fases requiere fecha meta y números válidos.")}
            </p>
          )}
        </>
      );
    }

    if (id === "plan-system") {
      const { doList, dontList, orderList } = planSystemLists;
      const hasItems = doList.length + dontList.length + orderList.length > 0;

      return (
        <>
          <p className={widgetTitleClass}>
            <span className={widgetTitleTextClass}>
              {L("Trading System", "Sistema de trading")}
            </span>
            <span className={widgetDragHintClass}>⠿</span>
          </p>

          {!plan ? (
            <p className="text-[14px] text-slate-500 mt-2">
              {L("No growth plan set yet.", "Aún no tienes un plan de crecimiento.")}{" "}
              <Link href="/growth-plan" data-tour="dash-edit-growth-plan" className="text-emerald-400 underline">
                {L("Create your plan now.", "Crea tu plan ahora.")}
              </Link>
            </p>
          ) : !hasItems ? (
            <p className="text-[14px] text-slate-500 mt-2">
              {L("Add your execution system (Do / Don't / Order) to activate this widget.", "Agrega tu sistema (Hacer / No hacer / Orden) para activar este widget.")}{" "}
              <Link href="/growth-plan" data-tour="dash-edit-growth-plan" className="text-emerald-400 underline">
                {L("Edit Growth Plan", "Editar Growth Plan")}
              </Link>
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">
                  {L("Do", "Hacer")}
                </p>
                <div className="mt-2 space-y-1 text-[13px] text-slate-200">
                  {doList.length ? (
                    doList.map((i) => (
                      <label key={i.id} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!systemChecks[i.id]}
                          onChange={() => toggleSystemCheck(i.id)}
                          className="mt-1 h-4 w-4 accent-emerald-400"
                        />
                        <span className={systemChecks[i.id] ? "line-through opacity-80" : ""}>{i.text}</span>
                      </label>
                    ))
                  ) : (
                    <div className="text-slate-500">{L("—", "—")}</div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-rose-300">
                  {L("Don't", "No hacer")}
                </p>
                <div className="mt-2 space-y-1 text-[13px] text-slate-200">
                  {dontList.length ? (
                    dontList.map((i) => (
                      <label key={i.id} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!systemChecks[i.id]}
                          onChange={() => toggleSystemCheck(i.id)}
                          className="mt-1 h-4 w-4 accent-rose-400"
                        />
                        <span className={systemChecks[i.id] ? "line-through opacity-80" : ""}>{i.text}</span>
                      </label>
                    ))
                  ) : (
                    <div className="text-slate-500">{L("—", "—")}</div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300">
                  {L("Order", "Orden")}
                </p>
                <div className="mt-2 space-y-1 text-[13px] text-slate-200">
                  {orderList.length ? (
                    orderList.map((i, idx) => (
                      <label key={i.id} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!systemChecks[i.id]}
                          onChange={() => toggleSystemCheck(i.id)}
                          className="mt-1 h-4 w-4 accent-sky-400"
                        />
                        <span className={systemChecks[i.id] ? "line-through opacity-80" : ""}>
                          {idx + 1}. {i.text}
                        </span>
                      </label>
                    ))
                  ) : (
                    <div className="text-slate-500">{L("—", "—")}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      );
    }

    if (id === "streak") {
      return (
        <>
          <p className={widgetTitleClass}>
            <span className={widgetTitleTextClass}>
              {L("Green Streak & Performance", "Racha verde y rendimiento")}
            </span>
            <span className={widgetDragHintClass}>⠿</span>
          </p>

          <p className="text-5xl font-semibold text-emerald-400 mt-1">
            {greenStreak}{" "}
            <span className="text-[16px] text-slate-400 font-normal">
              {L("days", "días")}
            </span>
          </p>

          <p className="text-[14px] text-slate-400 mt-2">
            {L("Green days:", "Días verdes:")}{" "}
            <span className="text-emerald-300 font-semibold">{greenDays}</span> ·{" "}
            {L("Blue days:", "Días azules:")}{" "}
            <span className="text-sky-300 font-semibold">{blueDays}</span>
          </p>

          <p className="text-[14px] text-slate-500 mt-2">
            {L(
              "The goal is consistency: protect your streak by respecting your max loss, not by forcing trades.",
              "El objetivo es la consistencia: protege tu racha respetando tu pérdida máxima, no forzando trades."
            )}
          </p>
        </>
      );
    }

    // ✅ Checklist widget (autosave)
    if (id === "actions") {
      return (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={widgetTitleClass}>
                <span className={widgetTitleTextClass}>
                  {L("Today's Checklist", "Checklist de hoy")}
                </span>
                <span className={widgetDragHintClass}>⠿</span>
              </p>
              <p className="text-[12px] text-slate-500 mt-1">
                {rollingTodayStr}
                {checklistSaving ? (
                  <span className="ml-2 text-emerald-300">{L("Saving…", "Guardando…")}</span>
                ) : null}
                {!checklistSaving && !checklistSaveError ? (
                  <span className="ml-2 text-slate-600">{L("Saved", "Guardado")}</span>
                ) : null}
              </p>
            </div>
          </div>

          {checklistSaveError ? (
            <p className="text-[12px] text-rose-300 mt-2">{checklistSaveError}</p>
          ) : null}

          <ul className="mt-3 space-y-2 text-[14px] text-slate-200">
            {todayChecklist.slice(0, 12).map((it, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => toggleChecklistItem(idx)}
                  className="w-full flex items-start gap-3 text-left rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 transition px-3 py-2"
                >
                  <span
                    className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-md border ${
                      it.done ? "bg-emerald-400 text-slate-950 border-emerald-300" : "border-slate-700 text-slate-400"
                    }`}
                  >
                    {it.done ? "✓" : ""}
                  </span>

                  <span className={it.done ? "line-through opacity-80" : ""}>{it.text}</span>
                </button>
              </li>
            ))}
          </ul>

          <Link
            href={`/journal/${rollingTodayStr}`}
            className="inline-flex mt-4 px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-[14px] font-semibold hover:bg-emerald-300 transition"
          >
            {L("Open today's journal", "Abrir el journal de hoy")}
          </Link>
        </>
      );
    }

    // ✅ Daily Target (remaining + above goal)
    if (id === "daily-target") {
      return (
        <>
          <p className={widgetTitleClass}>
            <span className={widgetTitleTextClass}>
              {L("Daily Target (Today)", "Meta diaria (hoy)")}
            </span>
            <span className={widgetDragHintClass}>⠿</span>
          </p>

          <div className="mt-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
            {plan && dailyCalcs.isTradingDay && dailyCalcs.dailyTargetPct !== 0 ? (
              <>
                <p className="text-[13px] text-emerald-300 font-medium">
                  {L("Goal:", "Meta:")} {dailyCalcs.dailyTargetPct.toFixed(2)}%{" "}
                  {L("of start-of-day balance", "del balance al inicio del día")}
                </p>

                <p className="text-[12px] text-slate-400 mt-1">
                  {L("Session date:", "Fecha de sesión:")}{" "}
                  <span className="text-slate-100 font-medium">{sessionDateStr}</span>
                </p>

                <p className="text-[14px] text-slate-300 mt-1">
                  {L("Start-of-day:", "Inicio del día:")}{" "}
                  <span className="font-semibold text-slate-50">${dailyCalcs.startOfSessionBalance.toFixed(2)}</span>
                </p>

                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[12px] text-slate-400">{L("Expected", "Esperado")}</p>
                    <p className="text-emerald-300 font-semibold">${dailyCalcs.expectedSessionUSD.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-slate-400">{L("Realized", "Realizado")}</p>
                    <p className={dailyCalcs.actualSessionUSD >= 0 ? "text-emerald-300 font-semibold" : "text-sky-300 font-semibold"}>
                      {dailyCalcs.actualSessionUSD >= 0 ? "+" : "-"}${Math.abs(dailyCalcs.actualSessionUSD).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] text-slate-400">{L("Delta", "Delta")}</p>
                    <p className={dailyCalcs.diffSessionVsGoal >= 0 ? "text-emerald-400 font-semibold" : "text-sky-400 font-semibold"}>
                      {dailyCalcs.diffSessionVsGoal >= 0 ? "+" : "-"}${Math.abs(dailyCalcs.diffSessionVsGoal).toFixed(2)}
                    </p>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-2 bg-linear-to-r from-emerald-400 via-emerald-300 to-sky-400"
                      style={{ width: `${dailyCalcs.progressToGoal}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {dailyCalcs.progressToGoal.toFixed(1)}%{" "}
                    {L("of today's goal", "de la meta de hoy")}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                    <p className="text-[11px] text-slate-500">{L("Remaining to goal", "Falta para la meta")}</p>
                    <p className="text-[14px] font-semibold text-slate-100">${dailyCalcs.remainingToGoal.toFixed(2)}</p>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                    <p className="text-[11px] text-slate-500">{L("Above goal", "Por encima de la meta")}</p>
                    <p className="text-[14px] font-semibold text-emerald-300">${dailyCalcs.aboveGoal.toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-3 text-[13px]">
                  {dailyCalcs.goalMet ? (
                    <span className="px-2 py-1 rounded-lg bg-emerald-400 text-slate-950 font-semibold">
                      {L("Goal met ✅", "Meta cumplida ✅")}
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700">
                      {L("Goal not met ❌", "Meta no cumplida ❌")}
                    </span>
                  )}
                </div>

                <Link
                  href={`/journal/${sessionDateStr}`}
                  className="inline-flex mt-3 px-3 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-[13px] font-semibold hover:bg-emerald-300 transition"
                >
                  {L("Open today's journal", "Abrir el journal de hoy")}
                </Link>
              </>
            ) : plan ? (
              <div className="space-y-2">
                <p className="text-[13px] text-emerald-200 font-medium">
                  {dailyCalcs.holidayLabel
                    ? L("Market holiday", "Feriado de mercado")
                    : L("Non-trading day", "Día sin mercado")}
                </p>
                <p className="text-[12px] text-slate-400">
                  {dailyCalcs.holidayLabel
                    ? `${dailyCalcs.holidayLabel} • ${sessionDateStr}`
                    : sessionDateStr}
                </p>
                <p className="text-[12px] text-slate-500">
                  {L(
                    "Market closed. Daily targets are paused.",
                    "Mercado cerrado. Las metas diarias se pausan."
                  )}
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-slate-400">
                {L(
                  "Set a daily % target in your growth plan to enable this widget.",
                  "Configura un % diario en tu plan de crecimiento para activar este widget."
                )}
              </p>
            )}
          </div>
        </>
      );
    }


    // --- rest unchanged (placeholders / your original widgets) ---
    if (id === "trading-days") {
      const { stock, futures, crypto } = tradingStats;
      return (
        <>
          <p className={widgetTitleClass}>
            <span className={widgetTitleTextClass}>
              {L("Trading Days", "Días de trading")} – {new Date().getFullYear()}
            </span>
            <span className={widgetDragHintClass}>⠿</span>
          </p>
          <div className="mt-3 space-y-2 text-[14px] text-slate-300">
            <div className="flex items-center justify-between">
              <span>{L("Stock market total", "Total stock market")}</span>
              <span className="font-semibold">{stock.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{L("Stock days remaining", "Stock restantes")}</span>
              <span className="font-semibold text-emerald-400">{stock.remaining}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{L("Futures total (Sun–Fri)", "Futuros total (Dom–Vie)")}</span>
              <span className="font-semibold">{futures.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{L("Futures remaining", "Futuros restantes")}</span>
              <span className="font-semibold text-emerald-400">{futures.remaining}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{L("Crypto total (24/7)", "Cripto total (24/7)")}</span>
              <span className="font-semibold">{crypto.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{L("Crypto remaining", "Cripto restantes")}</span>
              <span className="font-semibold text-emerald-400">{crypto.remaining}</span>
            </div>
            <div className="pt-2 border-t border-slate-800/60 space-y-1 text-[13px] text-slate-400">
              <div className="flex items-center justify-between">
                <span>{L("Days traded (stock)", "Días operados (stock)")}</span>
                <span className="font-semibold text-emerald-300">{stock.tradedDays}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>{L("Days not traded (stock)", "Días sin operar (stock)")}</span>
                <span className="font-semibold text-sky-300">{stock.missedDays}</span>
              </div>
            </div>
          </div>
        </>
      );
    }

    if (id === "economic-news") {
      const countries = [
        { code: "US", label: L("United States", "Estados Unidos") },
        { code: "EU", label: L("Eurozone", "Eurozona") },
        { code: "UK", label: L("United Kingdom", "Reino Unido") },
        { code: "JP", label: L("Japan", "Japón") },
        { code: "CA", label: L("Canada", "Canadá") },
      ];
      return (
        <>
          <p className={widgetTitleClass}>
            <span className={widgetTitleTextClass}>
              {L("Economic News Calendar", "Calendario de noticias económicas")}
            </span>
            <span className={widgetDragHintClass}>⠿</span>
          </p>
          <p className="text-[12px] text-slate-500 mt-1">
            {L(
              "Choose a country to focus your macro events.",
              "Elige un país para enfocar tus eventos macro."
            )}
          </p>
          <div className="mt-3">
            <select
              value={ecoNewsCountry}
              onChange={(e) => setEcoNewsCountry(e.target.value)}
              className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-[13px] text-slate-100"
            >
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </>
      );
    }

    if (id === "calendar") {
      const selectedEntry =
        selectedDate && entries.length
          ? entries.find((e) => String((e as any).date).slice(0, 10) === selectedDate)
          : null;
      const selectedTrades = selectedDate ? monthTrades[selectedDate] : null;
      const selectedNotes = parseNotes(selectedEntry?.notes ?? "");
      const premarketText = stripHtml(String(selectedNotes?.premarket ?? ""));
      const insideText = stripHtml(String(selectedNotes?.live ?? ""));
      const afterText = stripHtml(String(selectedNotes?.post ?? ""));

      return (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className={widgetTitleClass}>
                <span className={widgetTitleTextClass}>
                  {L("P&L Calendar", "Calendario P&L")}
                </span>
                <span className={widgetDragHintClass}>⠿</span>
              </p>
              <h2 className="text-2xl font-semibold text-slate-50">{monthLabel}</h2>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={goPrevMonth} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs hover:bg-slate-700">
                {L("← Prev", "← Ant")}
              </button>
              <button onClick={goNextMonth} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs hover:bg-slate-700">
                {L("Next →", "Sig →")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-2 mb-2 text-[12px] text-slate-500">
            <div className="text-left">{L("Week", "Semana")}</div>
            <div className="text-center">{L("Sun", "Dom")}</div>
            <div className="text-center">{L("Mon", "Lun")}</div>
            <div className="text-center">{L("Tue", "Mar")}</div>
            <div className="text-center">{L("Wed", "Mié")}</div>
            <div className="text-center">{L("Thu", "Jue")}</div>
            <div className="text-center">{L("Fri", "Vie")}</div>
          </div>

          <div className="space-y-2 text-[14px]">
            {Array.from({ length: 6 }).map((_, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-[auto_repeat(6,minmax(0,1fr))] gap-2">
                <div className="flex items-center pl-1 text-[12px] text-emerald-300 font-semibold">
                  {weekRowNumbers[rowIdx] ? `W${weekRowNumbers[rowIdx]}` : ""}
                </div>

                {[0, 1, 2, 3, 4, 5].map((dow) => {
                  const idx = rowIdx * 7 + dow;
                  const cell = calendarCells[idx];
                  if (!cell) return <div key={dow} className="min-h-24" />;

                  const hasDate = cell.dateStr !== null && cell.dayNumber !== null;
                  const rawPnl = (cell.entry as any)?.pnl ?? 0;
                  const pnl = typeof rawPnl === "number" ? rawPnl : Number(rawPnl) || 0;
                  const isHolidayCell = !!cell.holiday;
                  const holidayLabel = cell.holiday?.label ?? null;

                  let bg = "bg-slate-950/90 border-slate-800 text-slate-600";
                  if (hasDate && cell.entry) {
                    if (pnl > 0) bg = "bg-emerald-400/90 border-emerald-300 text-slate-950";
                    else if (pnl < 0) bg = "bg-sky-500/90 border-sky-300 text-slate-950";
                    else bg = "bg-slate-800/90 border-slate-700 text-slate-200";
                  } else if (hasDate && isHolidayCell) {
                    bg = "bg-amber-400/10 border-amber-300/50 text-amber-200";
                  }

                  const isTodayRing = cell.isToday && hasDate ? "ring-2 ring-emerald-400/90" : "";
                  const isSelected = hasDate && selectedDate === cell.dateStr ? "ring-2 ring-sky-300/90" : "";

                  return (
                    <div
                      key={dow}
                      onClick={() => hasDate && onDayClick(cell.dateStr)}
                      title={cell.holiday ? cell.holiday.label : undefined}
                      className={`${bg} ${isTodayRing} ${isSelected} border rounded-2xl px-2 py-2 min-h-24 flex flex-col items-start justify-between hover:scale-[1.02] hover:shadow-lg transition ${
                        hasDate ? "cursor-pointer" : "cursor-default opacity-30"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold">{hasDate ? cell.dayNumber : ""}</span>
                        {isHolidayCell ? (
                          <span className="text-[10px] uppercase tracking-wide text-amber-200">
                            {L("Holiday", "Feriado")}
                          </span>
                        ) : null}
                      </div>

                      {cell.entry ? (
                        <div className="mt-1">
                          <p className="text-[16px] font-semibold leading-none">
                            {pnl > 0 ? `+$${pnl.toFixed(0)}` : pnl < 0 ? `-$${Math.abs(pnl).toFixed(0)}` : "$0"}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenJournal(cell.dateStr);
                            }}
                            className="text-[11px] mt-1 opacity-85 underline decoration-dotted"
                          >
                            {L("Open journal ↗", "Abrir journal ↗")}
                          </button>
                        </div>
                      ) : hasDate ? (
                        <div className="mt-auto space-y-1">
                          {isHolidayCell ? (
                            <>
                              <p className="text-[11px] text-amber-200">
                                {holidayLabel}
                              </p>
                              <p className="text-[10px] uppercase tracking-wide text-amber-200/80">
                                {L("Market closed", "Mercado cerrado")}
                              </p>
                            </>
                          ) : (
                            <p className="text-[11px] text-slate-500">
                              {L("Add journal", "Agregar journal")}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {L("Day summary", "Resumen del día")}
                </p>
                <h3 className="text-lg font-semibold text-slate-50">
                  {selectedDate ? selectedDate : L("Select a day", "Selecciona un día")}
                </h3>
              </div>
              {selectedDate ? (
                <button
                  type="button"
                  onClick={() => onOpenJournal(selectedDate)}
                  className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
                >
                  {L("Open journal", "Abrir journal")}
                </button>
              ) : null}
            </div>

            {!selectedDate ? (
              <p className="text-xs text-slate-400 mt-3">
                {L(
                  "Click any day in the calendar to preview notes and entries/exits.",
                  "Haz clic en un día del calendario para ver notas y entradas/salidas."
                )}
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-200">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {L("Premarket", "Premarket")}
                  </p>
                  <p className="mt-2 text-slate-300">
                    {premarketText ? premarketText.slice(0, 180) : L("No notes.", "Sin notas.")}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {L("Inside trade", "Inside trade")}
                  </p>
                  <p className="mt-2 text-slate-300">
                    {insideText ? insideText.slice(0, 180) : L("No notes.", "Sin notas.")}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {L("After trade", "After trade")}
                  </p>
                  <p className="mt-2 text-slate-300">
                    {afterText ? afterText.slice(0, 180) : L("No notes.", "Sin notas.")}
                  </p>
                </div>
              </div>
            )}

            {selectedDate ? (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-200">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {L("Entries", "Entradas")}
                  </p>
                  {selectedTrades?.entries?.length ? (
                    <ul className="mt-2 space-y-1">
                      {selectedTrades.entries.slice(0, 5).map((row, idx) => (
                        <li key={row.id || idx} className="flex items-center justify-between">
                          <span>{row.symbol} · {row.side ?? "—"}</span>
                          <span>{row.quantity} @ {row.price}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-slate-400">{L("No entries logged.", "Sin entradas registradas.")}</p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    {L("Exits", "Salidas")}
                  </p>
                  {selectedTrades?.exits?.length ? (
                    <ul className="mt-2 space-y-1">
                      {selectedTrades.exits.slice(0, 5).map((row, idx) => (
                        <li key={row.id || idx} className="flex items-center justify-between">
                          <span>{row.symbol} · {row.side ?? "—"}</span>
                          <span>{row.quantity} @ {row.price}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-slate-400">{L("No exits logged.", "Sin salidas registradas.")}</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      );
    }

    if (id === "weekly") {
      return (
        <>
          <p className={widgetTitleClass}>
            <span className={widgetTitleTextClass}>
              {L("Weekly Summary", "Resumen semanal")}
            </span>
            <span className={widgetDragHintClass}>⠿</span>
          </p>
          <p className="text-[12px] text-emerald-300 mb-3">
            {L(
              `You are currently in week ${currentWeekOfYear} of ${new Date().getFullYear()}.`,
              `Actualmente estás en la semana ${currentWeekOfYear} de ${new Date().getFullYear()}.`
            )}
          </p>

          {weeks.map((w) => {
            const weekNumber = weekRowNumbers[w.index] ?? w.index + 1;
            const label = `${L("Week", "Semana")} ${weekNumber}`;
            const isCurrentWeek = weekNumber === currentWeekOfYear;

            if (w.daysWithTrades === 0 && w.pnl === 0) {
              return (
                <div key={w.index} className="flex items-center justify-between text-[14px] text-slate-600">
                  <span className="text-slate-500">{label}</span>
                  <span>$0 · 0 {L("days", "días")}</span>
                </div>
              );
            }

            const positive = w.pnl > 0;
            return (
              <div key={w.index} className="flex items-center justify-between text-[14px]">
                <span className={isCurrentWeek ? "text-emerald-300 font-semibold" : "text-emerald-200"}>{label}</span>
                <span className={positive ? "text-emerald-400 font-semibold" : "text-sky-400 font-semibold"}>
                  {positive ? "+" : "-"}${Math.abs(w.pnl).toFixed(2)} · {w.daysWithTrades}{" "}
                  {L(w.daysWithTrades !== 1 ? "days" : "day", w.daysWithTrades !== 1 ? "días" : "día")}
                </span>
              </div>
            );
          })}
        </>
      );
    }

    return (
      <p className="text-[14px] text-slate-400">
        {L("Unknown widget:", "Widget desconocido:")} <span className="font-mono">{id}</span>
      </p>
    );
  };

  /* ========== Render Page ========== */
  if (loading || !viewDate) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">
          {L("Loading your dashboard...", "Cargando tu dashboard...")}
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">
          {L("Redirecting to sign in...", "Redirigiendo para iniciar sesión...")}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-6 md:px-10 py-8">
        <header className="flex flex-col md:flex-row justify-between gap-4 mb-8">
          <div>
            <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">
              {L("Trading Journal Pro", "Trading Journal Pro")}
            </p>
            <h1 className="text-4xl font-semibold mt-1">
              {L("Dashboard overview", "Resumen del dashboard")}
            </h1>
            <p className="text-[14px] md:text-[16px] text-slate-400 mt-2 max-w-3xl">
              {L(
                `Welcome back, ${name}. Structured like a pro journal, built to compete with any premium platform.`,
                `Bienvenido de nuevo, ${name}. Estructurado como un journal pro, listo para competir con cualquier plataforma premium.`
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/growth-plan"
              data-tour="dash-edit-growth-plan"
              className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-[14px] font-semibold hover:bg-emerald-300 transition"
            >
              {L("Edit growth plan", "Editar plan de crecimiento")}
            </Link>

            {accounts.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAccountMenuOpen((v) => !v)}
                  className="rounded-full border border-slate-700/70 bg-slate-950/50 px-3 py-2 text-[12px] text-slate-200 hover:border-emerald-400/70 hover:text-emerald-200 transition"
                >
                  {L("Account:", "Cuenta:")}{" "}
                  <span className="font-semibold">
                    {accounts.find((a) => a.id === activeAccountId)?.name ?? accounts[0]?.name ?? "—"}
                  </span>
                  <span className="ml-2 text-slate-500">▾</span>
                </button>

                {accountMenuOpen && (
                  <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-800 bg-slate-950/95 p-2 shadow-xl z-20">
                    <p className="px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                      {L("Switch account", "Cambiar cuenta")}
                    </p>
                    <div className="mt-1 space-y-1">
                      {accounts.map((acc) => {
                        const isActive = acc.id === activeAccountId;
                        return (
                          <button
                            key={acc.id}
                            type="button"
                            onClick={() => {
                              setActiveAccount(acc.id);
                              setAccountMenuOpen(false);
                            }}
                            className={`w-full text-left rounded-lg px-3 py-2 text-[12px] transition ${
                              isActive
                                ? "bg-emerald-500/15 text-emerald-200"
                                : "text-slate-200 hover:bg-slate-800/70"
                            }`}
                          >
                            <div className="font-medium">{acc.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {acc.broker || L("Broker not set", "Broker no definido")}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 border-t border-slate-800 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAccountCreate(true);
                          setAccountMenuOpen(false);
                        }}
                        className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-200 hover:border-emerald-400/60 transition"
                      >
                        {L("Create new account", "Crear nueva cuenta")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {showAccountCreate && (
          <section className="mb-6 rounded-xl border border-slate-800 bg-slate-950/70 p-4 max-w-md">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-2">
              {L("New account", "Nueva cuenta")}
            </p>
            <div className="space-y-2">
              <input
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                placeholder={L("Account name", "Nombre de cuenta")}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[12px] text-slate-200"
              />
              <input
                value={newAccountBroker}
                onChange={(e) => setNewAccountBroker(e.target.value)}
                placeholder={L("Broker (optional)", "Broker (opcional)")}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[12px] text-slate-200"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={creatingAccount || !newAccountName.trim()}
                  onClick={async () => {
                    try {
                      setCreatingAccount(true);
                      setAccountMessage(null);
                      await createAccount(newAccountName.trim(), newAccountBroker.trim() || undefined);
                      setNewAccountName("");
                      setNewAccountBroker("");
                      setShowAccountCreate(false);
                    } catch (err: any) {
                      setAccountMessage(err?.message || L("Could not create account.", "No se pudo crear la cuenta."));
                    } finally {
                      setCreatingAccount(false);
                    }
                  }}
                  className="rounded-lg bg-emerald-400 px-3 py-1.5 text-[12px] font-semibold text-slate-950 hover:bg-emerald-300 transition disabled:opacity-60"
                >
                  {creatingAccount ? L("Creating…", "Creando…") : L("Create", "Crear")}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAccountCreate(false)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-[12px] text-slate-300 hover:border-slate-500 transition"
                >
                  {L("Cancel", "Cancelar")}
                </button>
              </div>
              {accountMessage && <p className="text-[11px] text-emerald-300">{accountMessage}</p>}
              {accountsError && <p className="text-[11px] text-red-400">{accountsError}</p>}
            </div>
          </section>
        )}

        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-[13px] text-slate-400 mb-2">
            {L(
              "Customize your dashboard: toggle widgets on/off.",
              "Personaliza tu dashboard: activa o desactiva los widgets."
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            {ALL_WIDGETS.map((w) => {
              const isActive = activeWidgets.includes(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setActiveWidgets((prev) => (prev.includes(w.id) ? prev.filter((x) => x !== w.id) : [...prev, w.id]));
                  }}
                  className={`px-3 py-1.5 rounded-full text-[12px] border transition ${
                    isActive
                      ? "bg-emerald-400 text-slate-950 border-emerald-300"
                      : "bg-slate-950 text-slate-300 border-slate-700 hover:border-emerald-400 hover:text-emerald-300"
                  }`}
                >
                  {isActive ? "✓ " : "+ "}
                  {w.label}
                </button>
              );
            })}
          </div>
        </section>

        <DynamicDashboardGrid items={activeWidgets} renderItem={renderItem} storageKey={layoutStorageKey} />
      </div>
    </main>
  );
}
