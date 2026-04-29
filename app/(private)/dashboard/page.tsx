// app/(private)/dashboard/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import {
  getGrowthPlanSupabaseByAccount,
  upsertGrowthPlanSupabase,
  type GrowthPlan,
  type GrowthPlanStrategy,
} from "@/lib/growthPlanSupabase";
import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import { upsertDailySnapshot } from "@/lib/snapshotSupabase";
import { getJournalTradesForDates } from "@/lib/journalTradesSupabase";
import { parseNotes, type TradesPayload } from "@/lib/journalNotes";
import { createAlertRule } from "@/lib/alertsSupabase";
import { buildNeuroMemory, computeNeuroSummary, normalizeNeuroLayer, type NeuroMemory } from "@/lib/neuroLayer";

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

/* =========================
   Types (UI only)
========================= */
type UiChecklistItem = { text: string; done: boolean };
type MotivationMessageRow = {
  id: string;
  locale: string;
  title: string | null;
  body: string;
  weekday: string | null;
  day_of_year: number | null;
};

type DashboardCoachActionPlan = {
  summary?: string;
  whatISee?: string;
  whatIsDrifting?: string;
  whatToProtect?: string;
  whatChangesNextSession?: string;
  nextAction?: string;
  ruleToAdd?: string;
  ruleToRemove?: string;
  checkpointFocus?: string;
};

type DashboardCoachAudit = {
  attached?: boolean;
  date?: string | null;
  instrument?: string | null;
  summary?: string;
  processScore?: number | null;
  disciplineScore?: number | null;
  eventCount?: number;
};

type DashboardCoachReminder = {
  summary: string | null;
  updatedAt: string | null;
  actionPlan: DashboardCoachActionPlan | null;
  audit: DashboardCoachAudit | null;
};

type CoachMoment = "morning" | "afternoon" | "evening";

const NEW_YORK_TZ = "America/New_York";

function getNewYorkDayParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "9");
  const weekdayRaw = (parts.find((p) => p.type === "weekday")?.value ?? "Mon").toLowerCase();
  const weekdayMap: Record<string, string> = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  };
  return {
    year,
    month,
    day,
    hour,
    weekday: weekdayMap[weekdayRaw.slice(0, 3)] ?? "mon",
  };
}

function getNewYorkDayOfYear(now = new Date()) {
  const { year, month, day } = getNewYorkDayParts(now);
  const startUtc = Date.UTC(year, 0, 1);
  const currentUtc = Date.UTC(year, month - 1, day);
  return Math.floor((currentUtc - startUtc) / 86400000) + 1;
}

function fallbackCoachMessage(weekday: string, lang: "en" | "es") {
  const t = (en: string, es: string) => (lang === "es" ? es : en);
  if (weekday === "fri") {
    return {
      title: t("Neuro Trader Friday", "Neuro Trader viernes"),
      body: t(
        "Close the week with emotional neutrality. Your edge grows when review is honest and ego stays quiet.",
        "Cierra la semana con neutralidad emocional. Tu edge crece cuando la revisión es honesta y el ego se queda en silencio."
      ),
    };
  }
  if (weekday === "sat") {
    return {
      title: t("Neuro Trader reset", "Reset Neuro Trader"),
      body: t(
        "Rest is part of execution. Reset your nervous system today so you do not trade next week from fatigue.",
        "Descansar también es parte de la ejecución. Resetea tu sistema nervioso hoy para no operar la próxima semana desde el cansancio."
      ),
    };
  }
  if (weekday === "sun") {
    return {
      title: t("Neuro Trader preparation", "Preparación Neuro Trader"),
      body: t(
        "Prepare your levels, calendar, and scenarios. Confidence tomorrow comes from clarity tonight.",
        "Prepara niveles, calendario y escenarios. La confianza de mañana nace de la claridad de esta noche."
      ),
    };
  }
  return {
    title: t("Neuro Trader focus", "Enfoque Neuro Trader"),
    body: t(
      "Trade from process, not from impulse. The mind you bring to the screen determines the quality of every decision.",
      "Opera desde el proceso, no desde el impulso. La mente con la que llegas a la pantalla determina la calidad de cada decisión."
    ),
  };
}

function buildFallbackCoachRow(lang: "en" | "es", now = new Date()): MotivationMessageRow {
  const dayParts = getNewYorkDayParts(now);
  const fallback = fallbackCoachMessage(dayParts.weekday, lang);
  return {
    id: `fallback-${lang}-${getNewYorkDayOfYear(now)}`,
    locale: lang,
    title: fallback.title,
    body: fallback.body,
    weekday: dayParts.weekday,
    day_of_year: getNewYorkDayOfYear(now),
  };
}

function pickMotivationMessage(rows: MotivationMessageRow[], lang: "en" | "es", now = new Date()) {
  const localeCode = lang === "es" ? "es" : "en";
  const dayOfYear = getNewYorkDayOfYear(now);
  const weekday = getNewYorkDayParts(now).weekday;
  const localeRows = rows.filter((row) => row.locale === localeCode);
  const fallbackRows = rows.filter((row) => row.locale === "en");
  const pool = localeRows.length ? localeRows : fallbackRows;

  const exactDay = pool.find((row) => row.day_of_year === dayOfYear);
  if (exactDay) return exactDay;

  const weekdaySpecific = pool.find((row) => row.weekday === weekday);
  if (weekdaySpecific) return weekdaySpecific;

  const generic = pool.find((row) => !row.weekday && row.day_of_year == null);
  if (generic) return generic;

  return buildFallbackCoachRow(lang, now);
}

function resolveCoachFirstName(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const source = value.includes("@") ? value.split("@")[0] : value;
  const normalized = source.replace(/[._-]+/g, " ").trim();
  const first = normalized.split(/\s+/).find(Boolean) ?? "";
  const clean = first.replace(/[^A-Za-zÀ-ÿ'’-]/g, "").trim();
  if (!clean || /^trader$/i.test(clean)) return "";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function resolveCoachMoment(hour: number): CoachMoment {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function personalizeCoachMessage(
  row: MotivationMessageRow,
  options: { lang: "en" | "es"; firstName?: string; now?: Date }
) {
  const { lang, firstName = "", now = new Date() } = options;
  const tx = (en: string, es: string) => (lang === "es" ? es : en);
  const dayParts = getNewYorkDayParts(now);
  const dayOfYear = getNewYorkDayOfYear(now);
  const moment = resolveCoachMoment(dayParts.hour);
  const greetingBase =
    moment === "morning"
      ? tx("Good morning", "Buenos días")
      : moment === "afternoon"
        ? tx("Good afternoon", "Buenas tardes")
        : tx("Good evening", "Buenas noches");
  const pillLabel =
    moment === "morning"
      ? tx("Morning", "Mañana")
      : moment === "afternoon"
        ? tx("Afternoon", "Tarde")
        : tx("Evening", "Noche");
  const title = firstName ? `${greetingBase}, ${firstName}.` : `${greetingBase}.`;
  const intros =
    lang === "es"
      ? {
          morning: [
            "Hoy quiero que empieces con calma, enfoque y una sola intención clara.",
            "Antes de abrir el mercado, vuelve a tu proceso y baja el ruido.",
            "Arranca liviano: claridad primero, velocidad después.",
            "Que tu primera decisión hoy nazca del plan, no de la urgencia.",
          ],
          afternoon: [
            "Haz una pausa corta y revisa si sigues operando desde el plan.",
            "A esta hora la disciplina vale más que la energía.",
            "Vuelve al centro antes de la próxima ejecución.",
            "Si el ritmo sube, responde con más proceso, no con más prisa.",
          ],
          evening: [
            "Cierra con honestidad: lo que aprendes hoy protege tu mañana.",
            "Esta noche vale más la claridad que el juicio duro.",
            "Baja revoluciones y quédate con la lección más útil del día.",
            "Termina el día cuidando tu mente igual que cuidas tu riesgo.",
          ],
        }
      : {
          morning: [
            "Start today with calm, focus, and one clear intention.",
            "Before the market opens, come back to your process and lower the noise.",
            "Begin light: clarity first, speed second.",
            "Let your first decision today come from the plan, not urgency.",
          ],
          afternoon: [
            "Take a short pause and check whether you are still trading from plan.",
            "At this hour, discipline matters more than energy.",
            "Come back to center before the next execution.",
            "If the tempo rises, answer with more process, not more rush.",
          ],
          evening: [
            "Close with honesty: what you learn today protects tomorrow.",
            "Tonight, clarity is worth more than harsh self-judgment.",
            "Lower the noise and keep the most useful lesson from the day.",
            "End the day protecting your mind the same way you protect risk.",
          ],
        };
  const introPool = intros[moment];
  const intro = introPool[dayOfYear % introPool.length] || "";
  const baseBody = String(row.body ?? "").trim();
  return {
    title,
    body: [intro, baseBody].filter(Boolean).join(" "),
    pillLabel,
  };
}

function buildSparklinePath(values: number[], width: number, height: number) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y =
        range === 0
          ? height / 2
          : height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildSparklineDots(values: number[], width: number, height: number) {
  if (!values.length) return [] as Array<{ x: number; y: number; value: number; index: number }>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y =
      range === 0
        ? height / 2
        : height - ((value - min) / range) * height;
    return { x, y, value, index };
  });
}

function formatCompactDateLabel(isoDate: string, locale?: string) {
  if (!isoDate) return "—";
  const date = new Date(`${isoDate}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(locale || undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

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

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return usdFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatSignedCurrency(value: number): string {
  return `${value >= 0 ? "+" : "-"}${formatCurrency(Math.abs(value))}`;
}

function formatPercent(value: number, digits = 1): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${safeValue.toFixed(digits)}%`;
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
  // ISO week number (Monday-based, week 1 contains first Thursday).
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7; // 1..7 (Mon..Sun)
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((d.getTime() - yearStart.getTime()) / 86400000) + 1;
  return Math.ceil(diffDays / 7);
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

const clampInt = (n: number, lo = 0, hi = Number.MAX_SAFE_INTEGER) =>
  Math.max(lo, Math.min(hi, Math.floor(n)));

type PlanRow = {
  day: number;
  type: "goal" | "loss";
  pct: number;
  expectedUSD: number;
  endBalance: number;
};

type CadenceTarget = {
  targetEquity: number;
  targetDate: string | null;
  monthIndex?: number;
  weekIndex?: number;
  weeksInMonth?: number;
  monthGoal?: number;
  monthLabel?: string;
  monthStartBalance?: number;
  monthEndBalance?: number;
};

type CadenceProgressPeriod = {
  startBalance: number;
  targetBalance: number;
  goalAmount: number;
  actualAmount: number;
  progress: number;
  targetDate: string | null;
};

type CadenceProgressSummary = {
  quarterIndex: number;
  monthIndex: number;
  weekIndex: number;
  weeksInMonth: number;
  week: CadenceProgressPeriod;
  month: CadenceProgressPeriod;
  quarter: CadenceProgressPeriod;
};

function computeRequiredGoalPct(
  starting: number,
  target: number,
  totalDays: number,
  lossDaysPerWeek: number,
  lossPct: number
): { goalPctDecimal: number } {
  const D = clampInt(totalDays, 0);
  if (D === 0 || starting <= 0 || target <= 0) {
    return { goalPctDecimal: 0 };
  }

  const perWeek = clampInt(lossDaysPerWeek, 0, 5);
  let totalLossDays = 0;
  let prodLoss = 1;

  for (let d = 1; d <= D; d++) {
    const dayInWeek = (d - 1) % 5;
    const isLoss = perWeek > 0 && dayInWeek < perWeek;
    if (isLoss) {
      totalLossDays++;
      prodLoss *= 1 - lossPct / 100;
    }
  }

  const goalDays = D - totalLossDays;
  const ratio = target / (starting * (prodLoss || 1));

  let g = 0;
  if (goalDays > 0 && ratio > 0) g = Math.pow(ratio, 1 / goalDays) - 1;
  if (!Number.isFinite(g) || g < 0) g = 0;

  return { goalPctDecimal: g };
}

function buildBalancedPlanSuggested(
  starting: number,
  target: number,
  totalDays: number,
  lossDaysPerWeek: number,
  lossPct: number
): { rows: PlanRow[]; requiredGoalPct: number } {
  const { goalPctDecimal } = computeRequiredGoalPct(starting, target, totalDays, lossDaysPerWeek, lossPct);
  const goalPct = goalPctDecimal * 100;

  let bal = starting;
  const rows: PlanRow[] = [];
  const perWeek = clampInt(lossDaysPerWeek, 0, 5);

  for (let d = 1; d <= totalDays; d++) {
    const dayInWeek = (d - 1) % 5;
    const isLoss = perWeek > 0 && dayInWeek < perWeek;
    const pct = isLoss ? -lossPct : goalPct;
    const expectedUSD = bal * (pct / 100);
    const endBalance = bal + expectedUSD;
    rows.push({ day: d, type: isLoss ? "loss" : "goal", pct, expectedUSD, endBalance });
    bal = endBalance;
  }

  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    const drift = target - last.endBalance;
    if (Math.abs(drift) > 0.01) {
      last.expectedUSD += drift;
      const prevBalance = rows.length > 1 ? rows[rows.length - 2].endBalance : starting;
      last.pct = prevBalance > 0 ? (last.expectedUSD / prevBalance) * 100 : last.pct;
      last.endBalance = target;
    }
  }

  return { rows, requiredGoalPct: goalPct };
}

function buildWeeklyMilestonesFromMonthlyGoals(
  starting: number,
  target: number,
  startIso: string,
  targetIso: string,
  lossDaysPerWeek: number,
  maxDailyLossPercent: number
): CadenceTarget[] {
  if (starting <= 0 || target <= 0) return [];
  const tradingDays = listTradingDaysBetween(startIso, targetIso);
  if (tradingDays.length === 0) return [];
  const totalTradingDays = tradingDays.length;

  const plan = buildBalancedPlanSuggested(
    starting,
    target,
    totalTradingDays,
    lossDaysPerWeek,
    Math.max(0, maxDailyLossPercent)
  );
  const planRows = plan.rows;
  if (planRows.length === 0) return [];

  const monthMap = new Map<string, number[]>();
  for (let i = 0; i < tradingDays.length; i++) {
    const monthKey = tradingDays[i]?.slice(0, 7) ?? "";
    if (!monthKey) continue;
    const list = monthMap.get(monthKey) ?? [];
    list.push(i);
    monthMap.set(monthKey, list);
  }

  const milestones: CadenceTarget[] = [];
  let monthIndex = 0;
  for (const [monthKey, indices] of monthMap.entries()) {
    if (!indices.length) continue;
    monthIndex += 1;
    const startIndex = indices[0];
    const endIndex = indices[indices.length - 1];
    const monthStartBalance = startIndex > 0 ? planRows[startIndex - 1]?.endBalance ?? starting : starting;
    const monthEndBalance = planRows[endIndex]?.endBalance ?? planRows[planRows.length - 1]?.endBalance ?? target;
    const monthGoalProfit = monthEndBalance - monthStartBalance;
    const weeksInMonth = Math.max(1, Math.ceil(indices.length / 5));

    for (let w = 1; w <= weeksInMonth; w++) {
      const weekEndIndex = Math.min(endIndex, startIndex + w * 5 - 1);
      const fraction = w / weeksInMonth;
      const targetEquity = monthStartBalance + (monthEndBalance - monthStartBalance) * fraction;
      const targetDate = tradingDays[weekEndIndex] ?? tradingDays[tradingDays.length - 1] ?? targetIso;
      milestones.push({
        targetEquity,
        targetDate,
        monthIndex,
        weekIndex: w,
        weeksInMonth,
        monthGoal: monthGoalProfit,
        monthLabel: monthKey,
        monthStartBalance,
        monthEndBalance,
      });
    }
  }

  return milestones;
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

type WidgetId =
  | "progress"
  | "plan-progress"
  | "streak"
  | "actions"
  | "calendar"
  | "weekly"
  | "daily-target"
  | "mindset-ratio"
  | "trading-days"
  | "economic-news";

type SystemPanelTab = "focus" | "rules" | "ai";


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

  const [ecoNewsCountry, setEcoNewsCountry] = useState("US");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showAccountCreate, setShowAccountCreate] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBroker, setNewAccountBroker] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [dailyCoachMessage, setDailyCoachMessage] = useState<MotivationMessageRow | null>(null);
  const [coachReminder, setCoachReminder] = useState<DashboardCoachReminder | null>(null);
  const [systemPanelTab, setSystemPanelTab] = useState<SystemPanelTab>("focus");
  const [coachNow, setCoachNow] = useState(() => new Date());
  const coachDayKey = useMemo(() => {
    const parts = getNewYorkDayParts(coachNow);
    return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
  }, [coachNow]);
  const coachFirstName = useMemo(() => resolveCoachFirstName((user as any)?.name), [user]);
  const personalizedCoachMessage = useMemo(
    () =>
      personalizeCoachMessage(
        dailyCoachMessage ?? buildFallbackCoachRow(isEs ? "es" : "en", coachNow),
        { lang: isEs ? "es" : "en", firstName: coachFirstName, now: coachNow }
      ),
    [coachFirstName, coachNow, dailyCoachMessage, isEs]
  );
  const phaseAlertBusyRef = useRef(false);
  const phaseRuleIdRef = useRef<string | null>(null);
  const goalNotificationAttemptedRef = useRef<Set<string>>(new Set());

  const widgetTitleClass =
    "widget-title select-none text-[14px] font-semibold tracking-wide flex items-center gap-2 group";
  const widgetTitleTextClass =
    "text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-cyan-300 to-emerald-400";
  const widgetDragHintClass =
    "hidden";

  // ✅ Checklist (today) — UI type ONLY
  const [todayChecklist, setTodayChecklist] = useState<UiChecklistItem[]>([]);
  const [todayChecklistNotes, setTodayChecklistNotes] = useState<string | null>(null);

  // Autosave UX
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [checklistSaveError, setChecklistSaveError] = useState<string | null>(null);

  const neuroMemory = useMemo<NeuroMemory | null>(() => {
    const sessions = entries
      .map((entry) => {
        const parsed = parseNotes((entry as any)?.notes ?? "");
        const neuroLayer = normalizeNeuroLayer((parsed as any)?.neuro_layer ?? (parsed as any)?.neuroLayer ?? {});
        const neuroSummary = computeNeuroSummary(neuroLayer);
        if (neuroSummary.score == null && !neuroLayer.after.one_line_truth && !neuroLayer.after.custom_tags.length) {
          return null;
        }
        return {
          date: String((entry as any)?.date || "").slice(0, 10),
          pnl: typeof (entry as any)?.pnl === "number" ? (entry as any).pnl : Number((entry as any)?.pnl ?? 0),
          neuro: neuroLayer,
        };
      })
      .filter(Boolean) as Array<{ date: string; pnl: number; neuro: any }>;
    return buildNeuroMemory(sessions, isEs ? "es" : "en");
  }, [entries, isEs]);
  const dashboardNeuroMemory: NeuroMemory = neuroMemory ?? {
    title: L("Latest Neuro read", "Última lectura Neuro"),
    body: L(
      "Your latest AI behavior read will appear here after a Neuro-tagged journal entry.",
      "Tu lectura de comportamiento con IA aparecerá aquí después de una entrada con Neuro Layer."
    ),
    kind: "strength",
  };

  // Rolling day for actions and internal daily-goal calculations
  const [rollingTodayStr, setRollingTodayStr] = useState(() => formatDateYYYYMMDD(new Date()));

  const systemRules = useMemo(() => {
    const system = plan?.steps?.execution_and_journal?.system;
    const clean = (arr: any[] | undefined) =>
      (arr ?? []).filter((i) => (i?.text ?? "").toString().trim().length > 0);
    return {
      title: String(system?.title ?? "").trim(),
      doList: clean(system?.doList as any[]),
      dontList: clean(system?.dontList as any[]),
      orderList: clean(system?.orderList as any[]),
      notes: String(system?.notes ?? "").trim(),
    };
  }, [plan]);

  const strategyCards = useMemo(() => {
    const rawStrategies = plan?.steps?.strategy?.strategies;
    if (!Array.isArray(rawStrategies)) return [];

    return rawStrategies
      .map((strategy: GrowthPlanStrategy) => ({
        name: String(strategy?.name ?? "").trim(),
        setup: String(strategy?.setup ?? "").trim(),
        entryRules: String(strategy?.entryRules ?? "").trim(),
        exitRules: String(strategy?.exitRules ?? "").trim(),
        managementRules: String(strategy?.managementRules ?? "").trim(),
        invalidation: String(strategy?.invalidation ?? "").trim(),
        timeframe: String(strategy?.timeframe ?? "").trim(),
        instruments: Array.isArray(strategy?.instruments)
          ? strategy.instruments.map((item) => String(item).trim()).filter(Boolean)
          : [],
      }))
      .filter(
        (strategy) =>
          strategy.name ||
          strategy.setup ||
          strategy.entryRules ||
          strategy.exitRules ||
          strategy.managementRules ||
          strategy.invalidation ||
          strategy.timeframe ||
          strategy.instruments.length
      )
      .slice(0, 3);
  }, [plan]);

  const strategyNotes = useMemo(() => String(plan?.steps?.strategy?.notes ?? "").trim(), [plan]);

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

  useEffect(() => {
    const interval = setInterval(() => setCoachNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Protect route
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/signin");
  }, [loading, user, router]);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;

    const loadDailyCoachMessage = async () => {
      try {
        const localeCode = isEs ? "es" : "en";
        const { data, error } = await supabaseBrowser
          .from("motivational_messages")
          .select("id, locale, title, body, weekday, day_of_year")
          .eq("active", true)
          .in("locale", [localeCode, "en"]);

        if (cancelled) return;
        if (error) {
          console.warn("[dashboard] motivational_messages fetch error:", error);
          setDailyCoachMessage(buildFallbackCoachRow(isEs ? "es" : "en"));
          return;
        }

        const picked = pickMotivationMessage(
          ((data ?? []) as MotivationMessageRow[]).filter((row) => !!row.body),
          isEs ? "es" : "en"
        );
        setDailyCoachMessage(picked);
      } catch (err) {
        if (cancelled) return;
        console.warn("[dashboard] daily coach message load exception:", err);
        setDailyCoachMessage(buildFallbackCoachRow(isEs ? "es" : "en"));
      }
    };

    loadDailyCoachMessage();
    return () => {
      cancelled = true;
    };
  }, [coachDayKey, loading, user, isEs]);

  useEffect(() => {
    if (loading || !user) return;
    let cancelled = false;

    const loadLatestCoachReminder = async () => {
      try {
        const userId = (user as any)?.uid || (user as any)?.id || "";
        if (!userId) {
          setCoachReminder(null);
          return;
        }

        const { data, error } = await supabaseBrowser
          .from("ai_coach_threads")
          .select("summary, metadata, updated_at")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.warn("[dashboard] latest ai coach thread fetch error:", error);
          setCoachReminder(null);
          return;
        }

        const metadata = data?.metadata && typeof data.metadata === "object" ? (data.metadata as any) : {};
        const actionPlan = metadata?.latestActionPlan ?? null;
        const audit = metadata?.latestAudit ?? null;
        const hasReminder =
          String(data?.summary || "").trim() ||
          String(actionPlan?.whatISee || "").trim() ||
          String(actionPlan?.whatIsDrifting || "").trim() ||
          String(actionPlan?.whatToProtect || "").trim() ||
          String(actionPlan?.whatChangesNextSession || "").trim() ||
          String(actionPlan?.nextAction || "").trim() ||
          String(actionPlan?.ruleToAdd || "").trim() ||
          String(actionPlan?.ruleToRemove || "").trim() ||
          String(actionPlan?.checkpointFocus || "").trim();

        if (!hasReminder) {
          setCoachReminder(null);
          return;
        }

        setCoachReminder({
          summary:
            typeof data?.summary === "string" && data.summary.trim()
              ? data.summary.trim()
              : typeof actionPlan?.summary === "string" && actionPlan.summary.trim()
                ? actionPlan.summary.trim()
                : null,
          updatedAt: typeof data?.updated_at === "string" ? data.updated_at : null,
          actionPlan,
          audit,
        });
      } catch (err) {
        if (cancelled) return;
        console.warn("[dashboard] latest ai coach thread exception:", err);
        setCoachReminder(null);
      }
    };

    loadLatestCoachReminder();
    return () => {
      cancelled = true;
    };
  }, [loading, user, activeAccountId]);

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
          setChecklistSaveError(L("Failed to load Trading System.", "No se pudo cargar el sistema de trading."));
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

  const weekRows = useMemo(() => {
    const rows: Array<{ rowIndex: number; weekOfYear: number }> = [];
    for (let row = 0; row < 6; row++) {
      const rowCells = calendarCells.slice(row * 7, row * 7 + 7);
      const firstCell = rowCells.find((c) => c?.dateStr && c.dayNumber !== null);
      if (!firstCell?.dateStr) continue;
      const d = new Date(firstCell.dateStr + "T00:00:00");
      rows.push({ rowIndex: row, weekOfYear: getWeekOfYear(d) });
    }
    return rows;
  }, [calendarCells]);

  const currentWeekOfYear = useMemo(() => getWeekOfYear(new Date()), []);

  const weekRowLabelByIndex = useMemo(() => {
    const map = new Map<number, number>();
    weekRows.forEach((row) => map.set(row.rowIndex, row.weekOfYear));
    return map;
  }, [weekRows]);

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

  const notifyGoalAchievementClient = useCallback(async (payload: {
    goalScope: "day" | "week" | "month" | "quarter";
    periodKey: string;
    accountId?: string | null;
    goalAmount?: number;
    actualAmount?: number;
    targetBalance?: number;
    progress?: number;
    metadata?: Record<string, unknown>;
  }) => {
    const dedupeKey = `${payload.goalScope}:${payload.periodKey}:${payload.accountId ?? "user"}`;
    if (goalNotificationAttemptedRef.current.has(dedupeKey)) return;
    goalNotificationAttemptedRef.current.add(dedupeKey);

    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Unauthorized");

      const res = await fetch("/api/notifications/goal-achievement", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          goalScope: payload.goalScope,
          periodKey: payload.periodKey,
          accountId: payload.goalScope === "day" ? null : payload.accountId ?? null,
          locale: lang,
          goalAmount: payload.goalAmount ?? null,
          actualAmount: payload.actualAmount ?? null,
          targetBalance: payload.targetBalance ?? null,
          progress: payload.progress ?? null,
          metadata: payload.metadata ?? {},
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }

      const body = await res.json().catch(() => ({}));
      if (body?.inAppInserted) {
        try {
          window.dispatchEvent(new Event("ntj_alert_force_pull"));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      goalNotificationAttemptedRef.current.delete(dedupeKey);
      console.warn("[dashboard] goal achievement notify failed:", err);
    }
  }, [lang]);

  useEffect(() => {
    const userId = (user as any)?.uid || (user as any)?.id || "";
    if (!userId) return;
    if (!dailyCalcs.goalMet || dailyCalcs.expectedSessionUSD <= 0) return;

    void notifyGoalAchievementClient({
      goalScope: "day",
      periodKey: sessionDateStr,
      goalAmount: dailyCalcs.expectedSessionUSD,
      actualAmount: dailyCalcs.actualSessionUSD,
      targetBalance: dailyCalcs.startOfSessionBalance + dailyCalcs.expectedSessionUSD,
      progress: dailyCalcs.progressToGoal / 100,
      metadata: {
        source: "dashboard",
        goal_date: sessionDateStr,
      },
    });
  }, [user, sessionDateStr, dailyCalcs.goalMet, dailyCalcs.expectedSessionUSD, dailyCalcs.actualSessionUSD, dailyCalcs.startOfSessionBalance, dailyCalcs.progressToGoal, notifyGoalAchievementClient]);

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
          "Could not save Trading System (retrying on next change).",
          "No se pudo guardar el sistema de trading (reintentando en el próximo cambio)."
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

  const totalTradingPnl = useMemo(() => {
    return filteredEntries.reduce((sum, e) => {
      const pnlRaw = (e as any).pnl;
      const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
      return sum + pnl;
    }, 0);
  }, [filteredEntries]);

  const sortedServerSeries = useMemo(() => {
    if (!serverSeries || serverSeries.length === 0) return [];
    return serverSeries
      .map((point) => ({
        date: String(point.date).slice(0, 10),
        value: Number(point.value),
      }))
      .filter((point) => point.date && Number.isFinite(point.value))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [serverSeries]);

  const { starting, target, currentBalance, progressPct } = useMemo(() => {
    const startingLocal = (plan as any)?.startingBalance ?? 0;
    const adjustedStart = plan ? startingLocal + (cashflowNet ?? 0) : startingLocal;
    const targetLocal = plan ? Number((plan as any)?.targetBalance ?? 0) : 0;

    const latestSeriesValue = sortedServerSeries.length > 0 ? sortedServerSeries[sortedServerSeries.length - 1]?.value ?? null : null;

    // ✅ Current account balance prefers authoritative equity series (if present)
    const fallbackBalance = plan ? adjustedStart + totalTradingPnl : startingLocal;
    const currentBalanceLocal = latestSeriesValue ?? fallbackBalance;

    const progressPctLocal =
      plan && targetLocal > adjustedStart
        ? ((currentBalanceLocal - adjustedStart) / (targetLocal - adjustedStart)) * 100
        : 0;

    return {
      starting: adjustedStart,
      target: targetLocal,
      currentBalance: currentBalanceLocal,
      progressPct: progressPctLocal,
    };
  }, [plan, cashflowNet, sortedServerSeries, totalTradingPnl]);

  const planStartStr = useMemo(() => getPlanStartDateStr(plan) || "", [plan]);
  const targetDateStr = useMemo(
    () => String((plan as any)?.targetDate ?? (plan as any)?.target_date ?? "").slice(0, 10),
    [plan]
  );

  const accountProgressMetrics = useMemo(() => {
    const firstPoint = sortedServerSeries[0] ?? null;
    const peakPoint =
      sortedServerSeries.reduce<{ date: string; value: number } | null>(
        (best, point) => {
          if (!best || point.value > best.value) return point;
          return best;
        },
        null
      ) ?? {
        date: sessionDateStr,
        value: currentBalance,
      };
    const rawPlanStartBalance = Number((plan as any)?.startingBalance ?? 0);
    const referenceBalance =
      plan && Number.isFinite(rawPlanStartBalance) && rawPlanStartBalance > 0
        ? rawPlanStartBalance
        : firstPoint?.value ?? currentBalance;
    const referenceDate = planStartStr || firstPoint?.date || sessionDateStr;
    const peakBalance = Math.max(peakPoint?.value ?? currentBalance, currentBalance);
    const peakDate =
      currentBalance >= (peakPoint?.value ?? Number.NEGATIVE_INFINITY)
        ? sessionDateStr
        : peakPoint?.date || sessionDateStr;
    const netChange = currentBalance - referenceBalance;
    const returnPct = referenceBalance > 0 ? (netChange / referenceBalance) * 100 : 0;
    const fromPeak = currentBalance - peakBalance;
    const fromPeakPct = peakBalance > 0 ? (fromPeak / peakBalance) * 100 : 0;
    const peakCoveragePct = peakBalance > 0 ? Math.max(0, Math.min(100, (currentBalance / peakBalance) * 100)) : 0;

    return {
      referenceBalance,
      referenceDate,
      netChange,
      returnPct,
      tradingPnl: totalTradingPnl,
      netCashflow: cashflowNet ?? 0,
      peakBalance,
      peakDate,
      fromPeak,
      fromPeakPct,
      peakCoveragePct,
      isAtHigh: Math.abs(fromPeak) < 0.01,
      referenceMode: planStartStr ? "plan-start" : "tracked",
    };
  }, [sortedServerSeries, sessionDateStr, currentBalance, totalTradingPnl, cashflowNet, plan, planStartStr]);

  const accountProgressSparkline = useMemo(() => {
    const endDate = new Date(`${sessionDateStr}T00:00:00`);
    const endDateValid = Number.isFinite(endDate.getTime());
    const dailyPnl = new Map<string, number>();
    const dailyCashflow = new Map<string, number>();

    for (const entry of filteredEntries) {
      const ds = String((entry as any)?.date ?? "").slice(0, 10);
      if (!ds) continue;
      const pnlRaw = (entry as any)?.pnl;
      const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
      dailyPnl.set(ds, (dailyPnl.get(ds) ?? 0) + pnl);
    }

    for (const cf of filteredCashflows) {
      const ds = String((cf as any)?.date ?? "").slice(0, 10);
      if (!ds) continue;
      dailyCashflow.set(ds, (dailyCashflow.get(ds) ?? 0) + signedCashflowAmount(cf));
    }

    const recent: Array<{ date: string; value: number }> = [];

    if (endDateValid) {
      let carry = Number(currentBalance);
      const cursor = new Date(endDate);

      for (let i = 0; i < 14; i += 1) {
        const iso = formatDateYYYYMMDD(cursor);
        recent.push({ date: iso, value: carry });
        const impact = (dailyPnl.get(iso) ?? 0) + (dailyCashflow.get(iso) ?? 0);
        carry -= impact;
        cursor.setDate(cursor.getDate() - 1);
      }

      recent.reverse();
    } else {
      recent.push(
        { date: accountProgressMetrics.referenceDate, value: Number(accountProgressMetrics.referenceBalance) },
        { date: sessionDateStr, value: Number(currentBalance) }
      );
    }

    const values = recent.map((point) => Number(point.value ?? 0));
    const path = buildSparklinePath(values, 220, 52);
    const dots = buildSparklineDots(values, 220, 52);
    const first = values[0] ?? currentBalance;
    const last = values[values.length - 1] ?? currentBalance;
    const min = values.length ? Math.min(...values) : currentBalance;
    const max = values.length ? Math.max(...values) : currentBalance;
    const mid = min + (max - min) / 2;
    const middlePoint = recent[Math.floor((recent.length - 1) / 2)] ?? recent[recent.length - 1];
    return {
      path,
      dots,
      points: recent,
      start: first,
      end: last,
      min,
      max,
      mid,
      delta: last - first,
      isPositive: last >= first,
      startDateLabel: formatCompactDateLabel(recent[0]?.date ?? sessionDateStr, localeTag),
      midDateLabel: formatCompactDateLabel(middlePoint?.date ?? sessionDateStr, localeTag),
      endDateLabel: formatCompactDateLabel(recent[recent.length - 1]?.date ?? sessionDateStr, localeTag),
    };
  }, [
    accountProgressMetrics.referenceBalance,
    accountProgressMetrics.referenceDate,
    currentBalance,
    filteredCashflows,
    filteredEntries,
    localeTag,
    sessionDateStr,
  ]);

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
      monthStartTarget: prevTarget,
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

  const cadenceProgress = useMemo<CadenceProgressSummary | null>(() => {
    if (!plan || (plan as any)?.planMode !== "auto") return null;
    if (!planStartStr || !targetDateStr || starting <= 0 || target <= 0) return null;

    const lossDaysPerWeek = Number(
      (plan as any)?.lossDaysPerWeek ?? (plan as any)?.loss_days_per_week ?? 0
    ) || 0;
    const maxDailyLossPercent = Number(
      (plan as any)?.maxDailyLossPercent ?? (plan as any)?.max_daily_loss_percent ?? 0
    ) || 0;

    const milestones = buildWeeklyMilestonesFromMonthlyGoals(
      starting,
      target,
      planStartStr,
      targetDateStr,
      lossDaysPerWeek,
      maxDailyLossPercent
    );
    if (!milestones.length) return null;

    const todayStr = formatDateYYYYMMDD(new Date());
    const current =
      milestones.find((m) => (m.targetDate ?? targetDateStr) >= todayStr) ?? milestones[milestones.length - 1];
    const monthIndex = current.monthIndex ?? 1;
    const weekIndex = current.weekIndex ?? 1;
    const weeksInMonth = current.weeksInMonth ?? 1;
    const quarterIndex = Math.ceil(monthIndex / 3);

    const monthMilestones = milestones.filter((m) => (m.monthIndex ?? 1) === monthIndex);
    const quarterMilestones = milestones.filter((m) => {
      const idx = m.monthIndex ?? 1;
      return idx >= (quarterIndex - 1) * 3 + 1 && idx <= quarterIndex * 3;
    });

    if (!monthMilestones.length || !quarterMilestones.length) return null;

    const buildPeriod = (
      startBalance: number,
      targetBalance: number,
      targetDate: string | null
    ): CadenceProgressPeriod => {
      const goalAmount = Math.max(0, targetBalance - startBalance);
      const actualAmount = currentBalance - startBalance;
      const progress = goalAmount > 0 ? Math.max(0, Math.min(1.5, actualAmount / goalAmount)) : 0;
      return {
        startBalance,
        targetBalance,
        goalAmount,
        actualAmount,
        progress,
        targetDate,
      };
    };

    const previousWeek = weekIndex > 1 ? monthMilestones[weekIndex - 2] : null;
    const weekStartBalance = previousWeek?.targetEquity ?? current.monthStartBalance ?? starting;
    const monthStartBalance = current.monthStartBalance ?? monthMilestones[0]?.monthStartBalance ?? starting;
    const monthTargetBalance = current.monthEndBalance ?? monthMilestones[monthMilestones.length - 1]?.targetEquity ?? target;
    const quarterStartBalance =
      quarterMilestones[0]?.monthStartBalance ??
      (quarterMilestones[0]?.monthIndex === 1 ? starting : quarterMilestones[0]?.targetEquity ?? starting);
    const quarterTargetBalance =
      quarterMilestones[quarterMilestones.length - 1]?.monthEndBalance ??
      quarterMilestones[quarterMilestones.length - 1]?.targetEquity ??
      target;

    return {
      quarterIndex,
      monthIndex,
      weekIndex,
      weeksInMonth,
      week: buildPeriod(weekStartBalance, current.targetEquity, current.targetDate ?? null),
      month: buildPeriod(
        monthStartBalance,
        monthTargetBalance,
        monthMilestones[monthMilestones.length - 1]?.targetDate ?? null
      ),
      quarter: buildPeriod(
        quarterStartBalance,
        quarterTargetBalance,
        quarterMilestones[quarterMilestones.length - 1]?.targetDate ?? null
      ),
    };
  }, [plan, planStartStr, targetDateStr, starting, target, currentBalance]);

  useEffect(() => {
    const userId = (user as any)?.uid || (user as any)?.id || "";
    if (!userId || !activeAccountId || !cadenceProgress) return;

    const candidates = [
      {
        goalScope: "week" as const,
        periodKey: `q${cadenceProgress.quarterIndex}:m${cadenceProgress.monthIndex}:w${cadenceProgress.weekIndex}:${cadenceProgress.week.targetDate ?? "na"}`,
        data: cadenceProgress.week,
        metadata: {
          source: "dashboard",
          quarter_index: cadenceProgress.quarterIndex,
          month_index: cadenceProgress.monthIndex,
          week_index: cadenceProgress.weekIndex,
          target_date: cadenceProgress.week.targetDate ?? null,
        },
      },
      {
        goalScope: "month" as const,
        periodKey: `q${cadenceProgress.quarterIndex}:m${cadenceProgress.monthIndex}:${cadenceProgress.month.targetDate ?? "na"}`,
        data: cadenceProgress.month,
        metadata: {
          source: "dashboard",
          quarter_index: cadenceProgress.quarterIndex,
          month_index: cadenceProgress.monthIndex,
          target_date: cadenceProgress.month.targetDate ?? null,
        },
      },
      {
        goalScope: "quarter" as const,
        periodKey: `q${cadenceProgress.quarterIndex}:${cadenceProgress.quarter.targetDate ?? "na"}`,
        data: cadenceProgress.quarter,
        metadata: {
          source: "dashboard",
          quarter_index: cadenceProgress.quarterIndex,
          target_date: cadenceProgress.quarter.targetDate ?? null,
        },
      },
    ];

    for (const candidate of candidates) {
      if (candidate.data.goalAmount <= 0) continue;
      if (candidate.data.actualAmount < candidate.data.goalAmount) continue;
      void notifyGoalAchievementClient({
        goalScope: candidate.goalScope,
        periodKey: candidate.periodKey,
        accountId: activeAccountId,
        goalAmount: candidate.data.goalAmount,
        actualAmount: candidate.data.actualAmount,
        targetBalance: candidate.data.targetBalance,
        progress: candidate.data.progress,
        metadata: candidate.metadata,
      });
    }
  }, [user, activeAccountId, cadenceProgress, notifyGoalAchievementClient]);

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

  const accountStage = useMemo(() => {
    const planMode = String((plan as any)?.planMode ?? (plan as any)?.plan_mode ?? "").toLowerCase();

    if (cadenceProgress) {
      return {
        mode: "cadence",
        label: `${L("Week", "Semana")} ${cadenceProgress.weekIndex}/${cadenceProgress.weeksInMonth}`,
        phaseLabel: `${L("Quarter", "Trimestre")} ${cadenceProgress.quarterIndex} · ${L("Month", "Mes")} ${cadenceProgress.monthIndex} · ${L("Week", "Semana")} ${cadenceProgress.weekIndex}/${cadenceProgress.weeksInMonth}`,
        start: cadenceProgress.week.startBalance,
        target: cadenceProgress.week.targetBalance,
        progress: cadenceProgress.week.progress,
        remaining: Math.max(0, cadenceProgress.week.goalAmount - Math.max(0, cadenceProgress.week.actualAmount)),
      };
    }
    if (planMode === "manual" && manualPhaseMetrics) {
      return {
        mode: "manual",
        label: manualPhaseMetrics.current.title || L("Phase", "Fase"),
        phaseLabel: manualPhaseMetrics.current.title || L("Phase", "Fase"),
        start: manualPhaseMetrics.prevTarget,
        target: manualPhaseMetrics.current.targetEquity,
        progress: manualPhaseMetrics.progress,
        remaining: manualPhaseMetrics.remaining,
      };
    }
    if (phaseMetrics) {
      return {
        mode: "monthly",
        label: `${L("Month", "Mes")} ${phaseMetrics.currentMonthIndex}/${phaseMetrics.totalMonths}`,
        phaseLabel: `${L("Month", "Mes")} ${phaseMetrics.currentMonthIndex}/${phaseMetrics.totalMonths}`,
        start: phaseMetrics.monthStartTarget,
        target: phaseMetrics.monthTarget,
        progress: phaseMetrics.monthProgress,
        remaining: phaseMetrics.remainingToMonth,
      };
    }
    if (autoPhaseMetrics) {
      return {
        mode: "auto",
        label: `${autoCadenceUnit} ${autoPhaseMetrics.index}/${autoPhaseMetrics.total}`,
        phaseLabel: `${autoCadenceUnit} ${autoPhaseMetrics.index}/${autoPhaseMetrics.total}`,
        start: autoPhaseMetrics.prevTarget,
        target: autoPhaseMetrics.current.targetEquity,
        progress: autoPhaseMetrics.progress,
        remaining: autoPhaseMetrics.remaining,
      };
    }
    return {
      mode: "overall",
      label: L("Full plan", "Plan completo"),
      phaseLabel: L("Full plan", "Plan completo"),
      start: starting,
      target,
      progress: progressPct / 100,
      remaining: Math.max(0, target - currentBalance),
    };
  }, [
    L,
    plan,
    manualPhaseMetrics,
    cadenceProgress,
    autoPhaseMetrics,
    autoCadenceUnit,
    phaseMetrics,
    starting,
    target,
    progressPct,
    currentBalance,
  ]);

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

  // ===== Render widgets =====
  const renderItem = (id: WidgetId) => {
    if (id === "progress") {
      const accountMetricCards = [
        {
          key: "net-change",
          label: L("Net account change", "Cambio neto de cuenta"),
          value: formatSignedCurrency(accountProgressMetrics.netChange),
          tone: accountProgressMetrics.netChange >= 0 ? "text-emerald-300" : "text-rose-300",
          sublabel: L("Current balance vs reference balance", "Balance actual vs balance de referencia"),
        },
        {
          key: "return",
          label: L("Return on reference", "Retorno sobre referencia"),
          value: formatPercent(accountProgressMetrics.returnPct),
          tone: accountProgressMetrics.returnPct >= 0 ? "text-cyan-300" : "text-rose-300",
          sublabel: L("Percent change in account equity", "Cambio porcentual del equity"),
        },
        {
          key: "trading-pnl",
          label: L("Trading P&L", "P&L de trading"),
          value: formatSignedCurrency(accountProgressMetrics.tradingPnl),
          tone: accountProgressMetrics.tradingPnl >= 0 ? "text-emerald-300" : "text-rose-300",
          sublabel: L("Execution result across tracked sessions", "Resultado de ejecucion en sesiones registradas"),
        },
        {
          key: "cashflow",
          label: L("Net cashflow", "Flujo neto"),
          value: formatSignedCurrency(accountProgressMetrics.netCashflow),
          tone:
            Math.abs(accountProgressMetrics.netCashflow) < 0.005
              ? "text-slate-200"
              : accountProgressMetrics.netCashflow >= 0
                ? "text-amber-300"
                : "text-rose-300",
          sublabel: L("Deposits and withdrawals", "Depositos y retiros"),
        },
      ];
      const referenceContext =
        accountProgressMetrics.referenceMode === "plan-start"
          ? L("Reference locked to plan start", "Referencia fijada al inicio del plan")
          : L("Reference from first tracked equity point", "Referencia desde el primer punto de equity registrado");
      return (
        <>
          <p className={widgetTitleClass}>
            <span className={widgetTitleTextClass}>
              {L("Account Progress", "Progreso de cuenta")}
            </span>
            <span className={widgetDragHintClass}>⠿</span>
          </p>

          <div className="mt-2 rounded-2xl border border-cyan-400/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_42%),linear-gradient(180deg,_rgba(15,23,42,0.92),_rgba(2,6,23,0.96))] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/70">
                  {L("Equity snapshot", "Snapshot de equity")}
                </p>
                <p className="mt-2 text-[28px] font-semibold text-slate-50">
                  {formatCurrency(currentBalance)}
                </p>
                <p className="mt-2 text-[12px] text-slate-400">
                  {referenceContext} ·{" "}
                  <span className="text-slate-200">{accountProgressMetrics.referenceDate}</span>
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-3 lg:min-w-[220px]">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  {L("Reference balance", "Balance de referencia")}
                </p>
                <p className="mt-1 text-[15px] font-semibold text-slate-100">
                  {formatCurrency(accountProgressMetrics.referenceBalance)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {accountMetricCards.map((card) => (
                <div key={card.key} className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    {card.label}
                  </p>
                  <p className={`mt-2 text-[17px] font-semibold ${card.tone}`}>
                    {card.value}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {card.sublabel}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/45 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                    {L("Progress curve", "Curva de progreso")}
                  </p>
                  <p className="mt-1 text-[12px] text-slate-400">
                    {L(
                      "X-axis shows date. Y-axis shows account balance. The line uses your latest 14 calendar days and carries forward the last known balance.",
                      "El eje X muestra la fecha. El eje Y muestra el balance de la cuenta. La línea usa tus últimos 14 días calendario y arrastra el último balance conocido."
                    )}
                  </p>
                </div>
                <span className={`text-[12px] font-semibold ${accountProgressSparkline.isPositive ? "text-emerald-300" : "text-amber-300"}`}>
                  {formatSignedCurrency(accountProgressSparkline.delta)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-[72px_minmax(0,1fr)] gap-3">
                <div className="flex h-[72px] flex-col justify-between text-[10px] text-slate-500">
                  <span>{formatCurrency(accountProgressSparkline.max)}</span>
                  <span>{formatCurrency(accountProgressSparkline.mid)}</span>
                  <span>{formatCurrency(accountProgressSparkline.min)}</span>
                </div>

                <div>
                  <div className="rounded-lg border border-slate-800/80 bg-slate-950/70 px-3 py-3">
                    <svg viewBox="0 0 220 60" preserveAspectRatio="none" className="h-[60px] w-full">
                      <g transform="translate(0 4)">
                        <path
                          d={accountProgressSparkline.path}
                          fill="none"
                          stroke={accountProgressSparkline.isPositive ? "#34d399" : "#f59e0b"}
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        {accountProgressSparkline.dots.map((dot) => (
                          <circle
                            key={`${dot.index}-${dot.x}-${dot.y}`}
                            cx={dot.x}
                            cy={dot.y}
                            r="2.2"
                            fill={accountProgressSparkline.isPositive ? "#34d399" : "#f59e0b"}
                            stroke="rgba(2,6,23,0.95)"
                            strokeWidth="1"
                          />
                        ))}
                      </g>
                    </svg>
                  </div>

                  <div className="mt-2 grid grid-cols-3 text-[10px] text-slate-500">
                    <span>{accountProgressSparkline.startDateLabel}</span>
                    <span className="text-center">{accountProgressSparkline.midDateLabel}</span>
                    <span className="text-right">{accountProgressSparkline.endDateLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      );
    }

    if (id === "plan-progress") {
      const currentTargetGap = currentBalance - accountStage.target;
      const currentTargetProgress = Math.max(0, Math.min(100, accountStage.progress * 100));
      const currentTargetLabel =
        currentTargetGap >= 0
          ? L("Ahead of current target", "Adelantado vs meta actual")
          : L("Remaining to current target", "Falta para la meta actual");
      const currentTargetDate =
        (cadenceProgress?.week.targetDate ??
          manualPhaseMetrics?.current.targetDate ??
          autoPhaseMetrics?.current.targetDate ??
          targetDateStr) ||
        null;
      const startMetricLabel =
        accountStage.mode === "manual"
          ? L("Phase start", "Inicio fase")
          : accountStage.mode === "overall"
            ? L("Plan start", "Inicio plan")
            : L("Checkpoint start", "Inicio checkpoint");
      const targetMetricLabel =
        accountStage.mode === "manual"
          ? L("Phase target", "Meta fase")
          : accountStage.mode === "overall"
            ? L("Plan target", "Meta plan")
            : L("Checkpoint target", "Meta checkpoint");
      const renderPlanSummary = (phaseLabel: string, note: string) => (
        <div className="rounded-2xl border border-emerald-500/10 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_44%),linear-gradient(180deg,_rgba(15,23,42,0.92),_rgba(2,6,23,0.96))] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] text-slate-500">
                {L("Current phase", "Fase actual")}
              </p>
              <p className="text-[17px] font-semibold text-slate-100">
                {phaseLabel}
              </p>
            </div>
            {currentTargetDate ? (
              <span className="rounded-full border border-slate-800 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-400">
                {L("By", "Para")} {currentTargetDate}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {[
              { key: "start", label: startMetricLabel, value: formatCurrency(accountStage.start) },
              { key: "current", label: L("Balance now", "Balance actual"), value: formatCurrency(currentBalance) },
              { key: "target", label: targetMetricLabel, value: formatCurrency(accountStage.target) },
              {
                key: "status",
                label: currentTargetLabel,
                value: formatCurrency(Math.abs(currentTargetGap)),
                tone: currentTargetGap >= 0 ? "text-emerald-300" : "text-amber-300",
              },
            ].map((card) => (
              <div key={card.key} className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                  {card.label}
                </p>
                <p className={`mt-2 text-[16px] font-semibold ${card.tone ?? "text-slate-100"}`}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-2 bg-linear-to-r from-emerald-400 via-cyan-300 to-sky-400"
              style={{ width: `${currentTargetProgress}%` }}
            />
          </div>

          <p className="mt-2 text-[12px] leading-snug text-slate-400">{note}</p>
        </div>
      );
      return (
        <>
          <p className={widgetTitleClass}>
            <span className={widgetTitleTextClass}>
              {L("Plan Progress", "Progreso del plan")}
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
                {renderPlanSummary(
                  manualPhaseMetrics.current.title || L("Phase", "Fase"),
                  L(
                    "Manual phases compare the live account balance against direct equity targets. Weekly Summary stays on realized weekly performance only.",
                    "Las fases manuales comparan el balance real contra metas directas de equity. Weekly Summary se mantiene solo en el rendimiento real semanal."
                  )
                )}

                <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                  <p className="text-[12px] text-slate-500">
                    {L("Manual phase rule", "Regla de fase manual")}
                  </p>
                  <p className="mt-1 text-[15px] font-semibold text-slate-100">
                    {L("Move the account to the target equity of this phase.", "Lleva la cuenta al equity objetivo de esta fase.")}
                  </p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    {L("Progress", "Progreso")}{" "}
                    <span className="text-slate-200">{formatPercent(manualPhaseMetrics.progress * 100)}</span>
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
          ) : cadenceProgress ? (
            <div className="mt-3 space-y-3">
              {renderPlanSummary(
                accountStage.phaseLabel,
                `${L(
                  "This widget compares balance now against checkpoint start and checkpoint target. Weekly Summary stays focused on what you actually made this week.",
                  "Este widget compara el balance actual contra el inicio y la meta de cada checkpoint. Weekly Summary se mantiene enfocado en lo que realmente hiciste esta semana."
                )} ${L("Overall plan target:", "Meta total del plan:")} ${formatCurrency(target)}`
              )}

              {[
                { key: "week", title: L("Week checkpoint", "Checkpoint semanal"), data: cadenceProgress.week },
                { key: "month", title: L("Month checkpoint", "Checkpoint mensual"), data: cadenceProgress.month },
                { key: "quarter", title: L("Quarter checkpoint", "Checkpoint trimestral"), data: cadenceProgress.quarter },
              ].map((period) => {
                const checkpointGap = currentBalance - period.data.targetBalance;
                const checkpointProgress = Math.max(0, Math.min(100, period.data.progress * 100));
                return (
                  <div key={period.key} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[12px] text-slate-500">{period.title}</p>
                      {period.data.targetDate ? (
                        <span className="text-[11px] text-slate-500">
                          {L("By", "Para")} {period.data.targetDate}
                        </span>
                      ) : null}
                    </div>

                    <p className={`mt-2 text-[17px] font-semibold ${checkpointGap >= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                      {checkpointGap >= 0 ? L("Ahead by", "Adelantado por") : L("Remaining", "Falta")}{" "}
                      {formatCurrency(Math.abs(checkpointGap))}
                    </p>

                    <div className="mt-2 grid gap-1 text-[12px] text-slate-500">
                      <p>
                        {L("Checkpoint start", "Inicio checkpoint")}{" "}
                        <span className="text-slate-200">{formatCurrency(period.data.startBalance)}</span>
                      </p>
                      <p>
                        {L("Balance now", "Balance actual")}{" "}
                        <span className="text-slate-200">{formatCurrency(currentBalance)}</span>
                      </p>
                      <p>
                        {L("Checkpoint target", "Meta checkpoint")}{" "}
                        <span className="text-emerald-300">{formatCurrency(period.data.targetBalance)}</span>
                      </p>
                      <p>
                        {L("Required move from start", "Movimiento requerido desde el inicio")}{" "}
                        <span className="text-slate-200">{formatCurrency(period.data.goalAmount)}</span> ·{" "}
                        {L("Moved from start", "Movimiento desde el inicio")}{" "}
                        <span className={period.data.actualAmount >= 0 ? "text-emerald-300" : "text-rose-300"}>
                          {formatSignedCurrency(period.data.actualAmount)}
                        </span>
                      </p>
                    </div>

                    <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-2 bg-linear-to-r from-emerald-400 via-emerald-300 to-sky-400"
                        style={{ width: `${checkpointProgress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : autoPhaseMetrics ? (
            <div className="mt-3 space-y-3">
              {renderPlanSummary(
                `${L("Milestone", "Hito")} ${autoPhaseMetrics.index}/${autoPhaseMetrics.total}`,
                `${L("Cadence:", "Cadencia:")} ${autoCadenceLabel}. ${L(
                  "This widget keeps the account on pace against the next milestone, not against weekly realized P&L.",
                  "Este widget mantiene la cuenta en ritmo contra el siguiente hito, no contra el P&L realizado de la semana."
                )}`
              )}

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Milestone target", "Meta del hito")}
                </p>
                <p className="mt-1 text-[16px] font-semibold text-slate-100">
                  {formatCurrency(autoPhaseMetrics.current.targetEquity)}
                </p>
                {autoPhaseMetrics.current.targetDate ? (
                  <p className="mt-1 text-[12px] text-slate-500">
                    {L("Target date", "Fecha objetivo")}{" "}
                    <span className="text-slate-200">{autoPhaseMetrics.current.targetDate}</span>
                  </p>
                ) : null}
              </div>
            </div>
          ) : phaseMetrics ? (
            <div className="mt-3 space-y-3">
              {renderPlanSummary(
                accountStage.phaseLabel,
                L(
                  "This view is plan pacing only. Weekly Summary stays on realized weekly execution.",
                  "Esta vista es solo de ritmo contra el plan. Weekly Summary se queda en la ejecucion real semanal."
                )
              )}

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Long‑term target", "Meta largo plazo")}
                </p>
                <p className="text-[16px] text-emerald-300 font-semibold">
                  {formatCurrency(target)}
                </p>
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Target date", "Fecha meta")}{" "}
                  <span className="text-slate-200">{targetDateStr}</span>
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Monthly milestone", "Meta mensual")} · {L("Month", "Mes")} {phaseMetrics.currentMonthIndex}/{phaseMetrics.totalMonths}
                </p>
                <p className="text-[16px] text-slate-100 font-semibold">
                  {formatCurrency(phaseMetrics.monthTarget)}
                </p>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-2 bg-linear-to-r from-emerald-400 via-emerald-300 to-sky-400"
                    style={{ width: `${Math.min(100, phaseMetrics.monthProgress * 100)}%` }}
                  />
                </div>
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Remaining this month", "Falta este mes")}{" "}
                  <span className="text-slate-200">{formatCurrency(phaseMetrics.remainingToMonth)}</span>
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                <p className="text-[12px] text-slate-500">
                  {L("Mid‑term milestone", "Meta mediano plazo")} · {L("Month", "Mes")} {phaseMetrics.midIndex}
                </p>
                <p className="text-[16px] text-slate-100 font-semibold">
                  {formatCurrency(phaseMetrics.midTarget)}
                </p>
                <p className="text-[12px] text-slate-500 mt-1">
                  {L("Compounded pacing", "Ritmo compuesto")}{" "}
                  <span className="text-slate-200">
                    {formatPercent(phaseMetrics.monthlyRate * 100, 2)}/{L("month", "mes")}
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
      const { doList, dontList, orderList } = systemRules;
      const hasRules = doList.length + dontList.length + orderList.length > 0;
      const systemTabs: Array<{ id: SystemPanelTab; label: string }> = [
        { id: "focus", label: L("Focus", "Focus") },
        { id: "rules", label: L("Rules", "Reglas") },
        { id: "ai", label: L("AI plan", "Plan AI") },
      ];
      const normalizeText = (value: unknown) => String(value ?? "").trim();
      const equalsText = (a: unknown, b: unknown) => normalizeText(a).toLowerCase() === normalizeText(b).toLowerCase();
      const dedupeRows = (rows: Array<{ label: string; value: string }>) => {
        const seen = new Set<string>();
        return rows.filter((row) => {
          const value = normalizeText(row.value);
          if (!value) return false;
          const key = value.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          row.value = value;
          return true;
        });
      };
      const primaryStrategy = strategyCards[0] ?? null;
      const primaryStrategyMeta = [primaryStrategy?.timeframe, primaryStrategy?.instruments.join(", ")].filter(Boolean).join(" · ");
      const primaryStrategyBody = normalizeText(
        primaryStrategy?.setup ||
          primaryStrategy?.entryRules ||
          primaryStrategy?.managementRules ||
          primaryStrategy?.exitRules ||
          strategyNotes
      );
      const strategyGuardrail = normalizeText(primaryStrategy?.invalidation || systemRules.notes);
      const strategySupportNote =
        strategyNotes && !equalsText(strategyNotes, primaryStrategyBody) ? strategyNotes : "";
      const hasRuleMatch = (value: unknown, items: any[]) => {
        const target = normalizeText(value);
        if (!target) return false;
        return items.some((item) => equalsText(item?.text, target));
      };
      const aiCoachRead = normalizeText(
        coachReminder?.actionPlan?.whatISee || coachReminder?.summary || primaryStrategyBody || strategyNotes
      );
      const aiCoachDrift = normalizeText(
        coachReminder?.actionPlan?.whatIsDrifting || coachReminder?.actionPlan?.ruleToRemove
      );
      const aiCoachProtect = normalizeText(
        coachReminder?.actionPlan?.whatToProtect ||
          coachReminder?.actionPlan?.checkpointFocus ||
          strategyGuardrail ||
          orderList[0]?.text ||
          doList[0]?.text
      );
      const aiCoachNextSession = normalizeText(
        coachReminder?.actionPlan?.whatChangesNextSession ||
          coachReminder?.actionPlan?.nextAction ||
          todayChecklist[0]?.text ||
          doList[0]?.text ||
          primaryStrategyBody
      );
      const aiPlanTitle =
        normalizeText(coachReminder?.summary) ||
        aiCoachRead ||
        aiCoachProtect ||
        aiCoachNextSession ||
        normalizeText(primaryStrategy?.name) ||
        L("Latest coaching guidance", "Última guía del coach");
      const aiPlanAlignedTo = normalizeText(primaryStrategy?.name || primaryStrategyBody || strategyNotes);
      const aiPlanLead =
        aiCoachRead && !equalsText(aiCoachRead, aiPlanTitle)
          ? aiCoachRead
          : coachReminder
            ? ""
            : L(
                "No AI session yet. This tab stays anchored to your Growth Plan so the next coaching pass lands on something real.",
                "Todavía no hay sesión AI. Esta pestaña se ancla a tu Growth Plan para que el próximo coaching aterrice sobre algo real."
              );
      const aiCoachReadoutRows = dedupeRows([
        { label: L("What I see", "Lo que veo"), value: equalsText(aiCoachRead, aiPlanTitle) ? "" : aiCoachRead },
        { label: L("What is drifting", "Lo que se está desviando"), value: aiCoachDrift },
        { label: L("What to protect", "Lo que debes proteger"), value: aiCoachProtect },
        { label: L("What changes next session", "Qué cambia la próxima sesión"), value: aiCoachNextSession },
      ]).filter((row) => !equalsText(row.value, aiPlanAlignedTo));
      const aiCoachSystemRows = dedupeRows([
        {
          label: L("Add to system", "Agregar al sistema"),
          value: hasRuleMatch(coachReminder?.actionPlan?.ruleToAdd, [...doList, ...orderList])
            ? ""
            : normalizeText(coachReminder?.actionPlan?.ruleToAdd),
        },
        {
          label: L("Stop doing", "Dejar de hacer"),
          value:
            hasRuleMatch(coachReminder?.actionPlan?.ruleToRemove, dontList) ||
            equalsText(coachReminder?.actionPlan?.ruleToRemove, primaryStrategy?.invalidation)
              ? ""
              : normalizeText(coachReminder?.actionPlan?.ruleToRemove),
        },
      ]).filter(
        (row) =>
          !equalsText(row.value, aiPlanTitle) &&
          !equalsText(row.value, aiPlanAlignedTo) &&
          !aiCoachReadoutRows.some((item) => equalsText(item.value, row.value))
      );

      const renderRuleCard = (label: string, items: any[], accentClass: string, bulletClass: string) => (
        <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-3">
          <p className={`text-[11px] uppercase tracking-[0.2em] ${accentClass}`}>{label}</p>
          <div className="mt-2 space-y-1.5 text-[13px] text-slate-200">
            {items.length ? (
              <>
                {items.slice(0, 5).map((item, idx) => (
                  <div key={item.id ?? `${item.text}-${idx}`} className="flex items-start gap-2">
                    <span className={bulletClass}>•</span>
                    <span>{item.text}</span>
                  </div>
                ))}
                {items.length > 5 ? (
                  <p className="pt-1 text-[12px] text-slate-500">
                    +{items.length - 5} {L("more in Growth Plan", "más en Growth Plan")}
                  </p>
                ) : null}
              </>
            ) : (
              <div className="text-slate-500">{L("No items yet.", "Sin elementos todavía.")}</div>
            )}
          </div>
        </div>
      );

      return (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className={widgetTitleClass}>
                <span className={widgetTitleTextClass}>
                  {L("Trading System", "Sistema de trading")}
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

            <div className="inline-flex w-full rounded-full border border-slate-800 bg-slate-950/70 p-1 sm:w-auto">
              {systemTabs.map((tab) => {
                const active = systemPanelTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSystemPanelTab(tab.id)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition sm:flex-none ${
                      active
                        ? "bg-emerald-300 text-slate-950 shadow-[0_0_18px_rgba(52,211,153,0.16)]"
                        : "text-slate-400 hover:text-slate-100"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {checklistSaveError ? (
            <p className="text-[12px] text-rose-300 mt-2">{checklistSaveError}</p>
          ) : null}

          {systemPanelTab === "focus" ? (
            <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="rounded-xl border border-slate-800 bg-slate-950/35 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                  {L("Steps (daily)", "Pasos (diarios)")}
                </p>
                {todayChecklist.length ? (
                  <ul className="mt-2 space-y-2 text-[14px] text-slate-200">
                    {todayChecklist.slice(0, 5).map((it, idx) => (
                      <li key={idx}>
                        <button
                          type="button"
                          onClick={() => toggleChecklistItem(idx)}
                          className="w-full flex items-start gap-3 text-left rounded-xl border border-slate-800 bg-slate-900/45 px-3 py-2 transition hover:bg-slate-900/75"
                        >
                          <span
                            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                              it.done
                                ? "border-emerald-300 bg-emerald-400 text-slate-950"
                                : "border-slate-700 text-slate-400"
                            }`}
                          >
                            {it.done ? "✓" : ""}
                          </span>
                          <span className={it.done ? "line-through opacity-80" : ""}>{it.text}</span>
                        </button>
                      </li>
                    ))}
                    {todayChecklist.length > 5 ? (
                      <li className="px-1 text-[12px] text-slate-500">
                        +{todayChecklist.length - 5} {L("more in today's journal", "más en el journal de hoy")}
                      </li>
                    ) : null}
                  </ul>
                ) : (
                  <p className="mt-2 text-[13px] text-slate-500">
                    {L("Add your Trading System steps in Growth Plan.", "Agrega tus pasos del Sistema de Trading en el Growth Plan.")}{" "}
                    <Link href="/growth-plan" data-tour="dash-edit-growth-plan" className="text-emerald-400 underline">
                      {L("Edit Growth Plan", "Editar Growth Plan")}
                    </Link>
                  </p>
                )}

                <Link
                  href={`/journal/${rollingTodayStr}`}
                  className="mt-3 inline-flex rounded-xl bg-emerald-400 px-4 py-2 text-[13px] font-semibold text-slate-950 transition hover:bg-emerald-300"
                >
                  {L("Open today's journal", "Abrir el journal de hoy")}
                </Link>
              </div>

              <div className="rounded-xl border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.10),rgba(15,23,42,0.78))] p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-200">
                  {L("Strategy snapshot", "Snapshot de estrategia")}
                </p>
                {primaryStrategy || primaryStrategyBody || strategyGuardrail || strategySupportNote ? (
                  <>
                    {primaryStrategy ? (
                      <div className="mt-2 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[13px] font-semibold text-slate-50">
                            {primaryStrategy.name || L("Primary strategy", "Estrategia principal")}
                          </p>
                          {primaryStrategyMeta ? <span className="text-[11px] text-slate-500">{primaryStrategyMeta}</span> : null}
                        </div>
                        {primaryStrategyBody ? (
                          <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{primaryStrategyBody}</p>
                        ) : null}
                        {primaryStrategy.invalidation ? (
                          <p className="mt-2 text-[12px] leading-relaxed text-amber-200/90">
                            {L("Invalidation:", "Invalidación:")} {primaryStrategy.invalidation}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {strategyGuardrail ? (
                      <div className="mt-2 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/90">
                          {L("Risk guardrail", "Guardrail de riesgo")}
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-slate-100">{strategyGuardrail}</p>
                      </div>
                    ) : null}

                    {strategySupportNote ? (
                      <div className="mt-2 rounded-xl border border-slate-800/80 bg-slate-950/35 p-3">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-cyan-200/90">
                          {L("Plan note", "Nota del plan")}
                        </p>
                        <p className="mt-1 text-[12px] leading-relaxed text-slate-100">{strategySupportNote}</p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2 text-[13px] text-slate-500">
                    {L("Add your strategy and rules in Growth Plan.", "Agrega tu estrategia y reglas en Growth Plan.")}{" "}
                    <Link href="/growth-plan" data-tour="dash-edit-growth-plan" className="text-emerald-400 underline">
                      {L("Edit Growth Plan", "Editar Growth Plan")}
                    </Link>
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {systemPanelTab === "rules" ? (
            <div className={`mt-3 grid gap-3 ${orderList.length ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
              {renderRuleCard(L("Do", "Hacer"), doList, "text-emerald-300", "text-emerald-400")}
              {renderRuleCard(L("Don't", "No hacer"), dontList, "text-rose-300", "text-rose-400")}
              {orderList.length ? renderRuleCard(L("Order", "Orden"), orderList, "text-cyan-200", "text-cyan-300") : null}
              {!hasRules && plan ? (
                <p className="text-[12px] text-slate-500 lg:col-span-full">
                  {L("Add your Do/Don't rules in Growth Plan.", "Agrega tus reglas de Hacer/No hacer en el Growth Plan.")}{" "}
                  <Link href="/growth-plan" data-tour="dash-edit-growth-plan" className="text-emerald-400 underline">
                    {L("Edit Growth Plan", "Editar Growth Plan")}
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}

          {systemPanelTab === "ai" ? (
            <div className="mt-3 rounded-xl border border-violet-300/20 bg-[linear-gradient(135deg,rgba(139,92,246,0.14),rgba(15,23,42,0.88))] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-violet-200">
                  {L("Latest AI coaching plan", "Último plan AI Coaching")}
                </p>
                {coachReminder?.updatedAt ? (
                  <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-2.5 py-1 text-[10px] text-violet-100">
                    {new Date(coachReminder.updatedAt).toLocaleDateString(localeTag, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                ) : null}
              </div>

              <p className="mt-2 text-[15px] font-semibold leading-snug text-slate-50">{aiPlanTitle}</p>
              {aiPlanLead ? <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{aiPlanLead}</p> : null}
              {aiPlanAlignedTo ? (
                <p className="mt-2 text-[12px] text-violet-100/70">
                  {L("Aligned to:", "Alineado a:")} {aiPlanAlignedTo}
                </p>
              ) : null}

              {aiCoachReadoutRows.length ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {aiCoachReadoutRows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{row.label}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-slate-100">{row.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {aiCoachSystemRows.length ? (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {aiCoachSystemRows.map((row) => (
                    <div key={row.label} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{row.label}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-slate-100">{row.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/performance/ai-coaching"
                  className="rounded-full bg-violet-300 px-4 py-2 text-[12px] font-semibold text-slate-950 transition hover:bg-violet-200"
                >
                  {L("Open AI Coaching", "Abrir AI Coaching")}
                </Link>
                <Link
                  href="/growth-plan"
                  className="rounded-full border border-violet-300/30 px-4 py-2 text-[12px] font-semibold text-violet-100 transition hover:border-violet-200 hover:text-white"
                >
                  {L("Open Growth Plan", "Abrir Growth Plan")}
                </Link>
              </div>
            </div>
          ) : null}
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
                  {weekRowLabelByIndex.get(rowIdx) ? `W${weekRowLabelByIndex.get(rowIdx)}` : ""}
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
      const isCurrentMonthView =
        viewDate &&
        viewDate.getFullYear() === new Date().getFullYear() &&
        viewDate.getMonth() === new Date().getMonth();
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

          {weekRows.map((row) => {
            const w = weeks[row.rowIndex];
            const weekNumber = row.weekOfYear;
            const label = `${L("Week", "Semana")} ${weekNumber}`;
            const isCurrentWeek = isCurrentMonthView && weekNumber === currentWeekOfYear;

            if (w.daysWithTrades === 0 && w.pnl === 0) {
              return (
                <div key={row.rowIndex} className="flex items-center justify-between text-[14px] text-slate-600">
                  <span className="text-slate-500">{label}</span>
                  <span>$0 · 0 {L("days", "días")}</span>
                </div>
              );
            }

            const positive = w.pnl > 0;
            return (
              <div key={row.rowIndex} className="flex items-center justify-between text-[14px]">
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

  const renderDashboardCard = (id: WidgetId, className = "") => (
    <section
      key={id}
      data-tour={`dash-widget-${id}`}
      className={`rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-[0_18px_70px_rgba(2,6,23,0.22)] ${className}`}
    >
      <div className="h-full min-h-0 text-[14px]">
        {renderItem(id)}
      </div>
    </section>
  );

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

        {(dailyCoachMessage || dashboardNeuroMemory) ? (
          <section className="mb-5 grid gap-3 lg:grid-cols-2">
            <div className="h-full rounded-xl border border-emerald-300/30 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(6,182,212,0.12),rgba(15,23,42,0.9))] px-4 py-3 shadow-[0_0_28px_rgba(16,185,129,0.14)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.26em] text-emerald-200/90">
                    {L("Daily coach message", "Mensaje diario del coach")}
                  </p>
                  <p className="mt-1 text-[15px] font-semibold leading-tight text-slate-50">
                    {personalizedCoachMessage.title || L("Coach note for today", "Nota del coach para hoy")}
                  </p>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-100/90">
                    {personalizedCoachMessage.body}
                  </p>
                </div>
                <div className="mt-0.5 rounded-full border border-emerald-300/40 bg-emerald-400/12 px-2.5 py-1 text-[10px] font-semibold text-emerald-100 shadow-[0_0_12px_rgba(16,185,129,0.18)]">
                  {personalizedCoachMessage.pillLabel}
                </div>
              </div>
            </div>

            {dashboardNeuroMemory ? (
              <div
                className={`h-full rounded-xl border px-4 py-3 ${
                  dashboardNeuroMemory.kind === "risk"
                    ? "border-amber-300/30 bg-[linear-gradient(135deg,rgba(251,191,36,0.14),rgba(15,23,42,0.92))]"
                    : dashboardNeuroMemory.kind === "strength"
                      ? "border-cyan-300/30 bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(15,23,42,0.92))]"
                      : "border-slate-700 bg-slate-950/80"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.26em] text-slate-300/90">
                      {L("Neuro Memory", "Neuro Memory")}
                    </p>
                    <p className="mt-1 text-[14px] font-semibold leading-tight text-slate-50">
                      {dashboardNeuroMemory.title}
                    </p>
                    <p className="mt-2 text-[12px] leading-relaxed text-slate-200/90">
                      {dashboardNeuroMemory.body}
                    </p>
                  </div>
                  <div
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                      dashboardNeuroMemory.kind === "risk"
                        ? "border border-amber-300/40 bg-amber-400/10 text-amber-100"
                        : dashboardNeuroMemory.kind === "strength"
                          ? "border border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                          : "border border-slate-600 bg-slate-800 text-slate-200"
                    }`}
                  >
                    {dashboardNeuroMemory.kind === "risk"
                      ? L("Pattern", "Patrón")
                      : dashboardNeuroMemory.kind === "strength"
                        ? L("Strength", "Fortaleza")
                        : L("Memory", "Memoria")}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        <section>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(340px,0.9fr)] xl:items-start">
            <div className="grid gap-4">
              {renderDashboardCard("progress")}
              {renderDashboardCard("calendar")}
              {renderDashboardCard("actions")}
            </div>

            <aside className="grid gap-4">
              {renderDashboardCard("plan-progress")}
              {renderDashboardCard("weekly")}
              {renderDashboardCard("streak")}
              {renderDashboardCard("trading-days")}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
