import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet, apiPost } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { parseNotes, type StoredTradeRow, type TradesPayload } from "../lib/journalNotes";
import { supabaseMobile } from "../lib/supabase";
import { useTheme } from "../lib/ThemeContext";
import { DARK_COLORS, type ThemeColors } from "../theme";

type DashboardScreenProps = {
  onOpenModule: (title: string, description: string) => void;
  onOpenJournalDate: (date: string) => void;
};

const coachBrain = require("../../assets/neurotrader-logo-icon.png");

type SeriesPoint = { date: string; value: number };

type TradingSystemItem = {
  id?: string;
  text?: string;
};

type GrowthPlanSteps = {
  execution_and_journal?: {
    system?: {
      doList?: TradingSystemItem[];
      dontList?: TradingSystemItem[];
    };
  };
};

type GrowthPlanSummary = {
  startingBalance: number;
  targetBalance: number;
  adjustedTargetBalance?: number;
  dailyTargetPct?: number;
  planStartIso?: string;
  targetDate?: string;
  planMode?: string;
  planPhases?: unknown;
  lossDaysPerWeek?: number;
  tradingDays?: number;
  maxDailyLossPercent?: number;
  steps?: GrowthPlanSteps | null;
};

type AccountSeriesResponse = {
  plan?: GrowthPlanSummary;
  totals: { tradingPnl: number; cashflowNet: number; currentBalance: number };
  daily: SeriesPoint[];
  series?: SeriesPoint[];
};

type JournalEntry = {
  date?: string | null;
  notes?: string | null;
};

type JournalListResponse = {
  entries: JournalEntry[];
};

type MotivationMessageRow = {
  id: string;
  locale: string;
  title: string | null;
  body: string;
  weekday: string | null;
  day_of_year: number | null;
};

type UiChecklistItem = {
  text: string;
  done: boolean;
};

type TodayChecklistResponse = {
  date: string;
  items: UiChecklistItem[];
  notes?: string | null;
};

type NormalizedPhase = {
  id: string;
  title?: string | null;
  targetEquity: number;
  targetDate?: string | null;
};

type PlanRow = {
  day: number;
  endBalance: number;
};

type CadenceTarget = {
  targetEquity: number;
  targetDate: string | null;
  monthIndex?: number;
  weekIndex?: number;
  weeksInMonth?: number;
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

type AccountProgressMetrics = {
  referenceBalance: number;
  referenceDate: string;
  netChange: number;
  returnPct: number;
  tradingPnl: number;
  netCashflow: number;
  peakBalance: number;
  peakDate: string;
  fromPeak: number;
  fromPeakPct: number;
  peakCoveragePct: number;
  isAtHigh: boolean;
  referenceMode: "plan-start" | "tracked";
};

type PlanProgressCard = {
  phaseLabel: string;
  targetDate: string | null;
  startLabel: string;
  targetLabel: string;
  startBalance: number;
  targetBalance: number;
  gap: number;
  progress: number;
  overallTargetBalance: number;
  periods: Array<{
    key: "week" | "month" | "quarter";
    title: string;
    data: CadenceProgressPeriod;
  }>;
};

const DASHBOARD_TITLE_STOPS = ["#7CF7CF", "#63D6FF", "#9A7CFF", "#2BE3A7"] as const;

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function mixHex(a: string, b: string, t: number) {
  const start = hexToRgb(a);
  const end = hexToRgb(b);
  const mix = (from: number, to: number) => Math.round(from + (to - from) * t);
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(mix(start.r, end.r))}${toHex(mix(start.g, end.g))}${toHex(mix(start.b, end.b))}`;
}

function gradientColorAt(index: number, total: number) {
  if (total <= 1) return DASHBOARD_TITLE_STOPS[0];
  const progress = index / (total - 1);
  const segments = DASHBOARD_TITLE_STOPS.length - 1;
  const scaled = progress * segments;
  const segmentIndex = Math.min(segments - 1, Math.floor(scaled));
  const localT = scaled - segmentIndex;
  return mixHex(DASHBOARD_TITLE_STOPS[segmentIndex], DASHBOARD_TITLE_STOPS[segmentIndex + 1], localT);
}

function GradientTitleText({ text, style }: { text: string; style: any }) {
  const chars = Array.from(text);
  return (
    <Text style={style}>
      {chars.map((char, index) => (
        <Text key={`${char}-${index}`} style={{ color: gradientColorAt(index, chars.length) }}>
          {char}
        </Text>
      ))}
    </Text>
  );
}

const WEB_GROWTH_PLAN_URL = "https://www.neurotrader-journal.com/growth-plan";

const NEW_YORK_TZ = "America/New_York";

function getNewYorkDayParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NEW_YORK_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "1");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
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
  const tx = (en: string, es: string) => (lang === "es" ? es : en);
  if (weekday === "fri") {
    return {
      title: tx("Neuro Trader Friday", "Neuro Trader viernes"),
      body: tx(
        "Close the week with emotional neutrality. Your edge grows when review is honest and ego stays quiet.",
        "Cierra la semana con neutralidad emocional. Tu edge crece cuando la revisión es honesta y el ego se queda en silencio."
      ),
    };
  }
  if (weekday === "sat") {
    return {
      title: tx("Neuro Trader reset", "Reset Neuro Trader"),
      body: tx(
        "Rest is part of execution. Reset your nervous system today so you do not trade next week from fatigue.",
        "Descansar también es parte de la ejecución. Resetea tu sistema nervioso hoy para no operar la próxima semana desde el cansancio."
      ),
    };
  }
  if (weekday === "sun") {
    return {
      title: tx("Neuro Trader preparation", "Preparación Neuro Trader"),
      body: tx(
        "Prepare your levels, calendar, and scenarios. Confidence tomorrow comes from clarity tonight.",
        "Prepara niveles, calendario y escenarios. La confianza de mañana nace de la claridad de esta noche."
      ),
    };
  }
  return {
    title: tx("Neuro Trader focus", "Enfoque Neuro Trader"),
    body: tx(
      "Trade from process, not from impulse. The mind you bring to the screen determines the quality of every decision.",
      "Opera desde el proceso, no desde el impulso. La mente con la que llegas a la pantalla determina la calidad de cada decisión."
    ),
  };
}

function buildFallbackCoachRow(lang: "en" | "es"): MotivationMessageRow {
  const dayParts = getNewYorkDayParts();
  const fallback = fallbackCoachMessage(dayParts.weekday, lang);
  return {
    id: `fallback-${lang}-${getNewYorkDayOfYear()}`,
    locale: lang,
    title: fallback.title,
    body: fallback.body,
    weekday: dayParts.weekday,
    day_of_year: getNewYorkDayOfYear(),
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

  return buildFallbackCoachRow(lang);
}

function formatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateOnlyStr(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") {
    const direct = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  }
  const parsed = new Date(value as any);
  if (Number.isNaN(parsed.getTime())) return null;
  return formatDateYYYYMMDD(parsed);
}

function getPlanStartDateStr(plan: GrowthPlanSummary | null | undefined): string {
  return toDateOnlyStr(plan?.planStartIso) || formatDateYYYYMMDD(new Date());
}

function normalizePhases(raw: unknown): NormalizedPhase[] {
  const phases = Array.isArray(raw) ? raw : [];
  return phases.map((item: any, index) => ({
    id: String(item?.id ?? `phase-${index + 1}`),
    title: item?.title ?? null,
    targetEquity: Math.max(0, Number(item?.targetEquity) || 0),
    targetDate: item?.targetDate ? String(item.targetDate).slice(0, 10) : null,
  }));
}

function clampInt(value: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Math.max(min, Math.min(max, Math.floor(Number.isFinite(value) ? value : 0)));
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function observedDate(date: Date): Date {
  const day = date.getDay();
  if (day === 6) return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
  if (day === 0) return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return date;
}

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
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

function getEasterDate(year: number): Date {
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

function getUsMarketHolidayDates(year: number): string[] {
  const holidays: string[] = [];
  holidays.push(toYMD(observedDate(new Date(year, 0, 1))));
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 0, 1, 3)));
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 1, 1, 3)));
  const easter = getEasterDate(year);
  holidays.push(toYMD(new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2)));
  holidays.push(toYMD(getLastWeekdayOfMonth(year, 4, 1)));
  holidays.push(toYMD(observedDate(new Date(year, 5, 19))));
  holidays.push(toYMD(observedDate(new Date(year, 6, 4))));
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 8, 1, 1)));
  holidays.push(toYMD(getNthWeekdayOfMonth(year, 10, 4, 4)));
  holidays.push(toYMD(observedDate(new Date(year, 11, 25))));
  return holidays;
}

function listTradingDaysBetween(startIso: string, endIso: string): string[] {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  const first = start <= end ? start : end;
  const last = start <= end ? end : start;
  const years: number[] = [];
  for (let year = first.getFullYear(); year <= last.getFullYear(); year++) years.push(year);
  const holidaySet = new Set(years.flatMap(getUsMarketHolidayDates));

  const days: string[] = [];
  for (let d = new Date(first); d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const dateStr = toYMD(d);
    const weekday = d.getDay();
    if (weekday !== 0 && weekday !== 6 && !holidaySet.has(dateStr)) {
      days.push(dateStr);
    }
  }
  return days;
}

function computeRequiredGoalPct(
  starting: number,
  target: number,
  totalDays: number,
  lossDaysPerWeek: number,
  lossPct: number
) {
  const total = clampInt(totalDays, 0);
  if (total === 0 || starting <= 0 || target <= 0) return { goalPctDecimal: 0 };

  const perWeek = clampInt(lossDaysPerWeek, 0, 5);
  let totalLossDays = 0;
  let prodLoss = 1;

  for (let day = 1; day <= total; day++) {
    const dayInWeek = (day - 1) % 5;
    const isLoss = perWeek > 0 && dayInWeek < perWeek;
    if (isLoss) {
      totalLossDays += 1;
      prodLoss *= 1 - lossPct / 100;
    }
  }

  const goalDays = total - totalLossDays;
  const ratio = target / (starting * (prodLoss || 1));
  let goalPctDecimal = 0;
  if (goalDays > 0 && ratio > 0) goalPctDecimal = Math.pow(ratio, 1 / goalDays) - 1;
  if (!Number.isFinite(goalPctDecimal) || goalPctDecimal < 0) goalPctDecimal = 0;

  return { goalPctDecimal };
}

function buildBalancedPlanSuggested(
  starting: number,
  target: number,
  totalDays: number,
  lossDaysPerWeek: number,
  lossPct: number
) {
  const { goalPctDecimal } = computeRequiredGoalPct(starting, target, totalDays, lossDaysPerWeek, lossPct);
  let balance = starting;
  const rows: PlanRow[] = [];
  const perWeek = clampInt(lossDaysPerWeek, 0, 5);

  for (let day = 1; day <= totalDays; day++) {
    const dayInWeek = (day - 1) % 5;
    const isLoss = perWeek > 0 && dayInWeek < perWeek;
    const pct = isLoss ? -lossPct : goalPctDecimal * 100;
    const expectedUsd = balance * (pct / 100);
    balance += expectedUsd;
    rows.push({ day, endBalance: balance });
  }

  if (rows.length > 0) {
    rows[rows.length - 1] = {
      day: rows[rows.length - 1].day,
      endBalance: target,
    };
  }

  return rows;
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

  const planRows = buildBalancedPlanSuggested(
    starting,
    target,
    tradingDays.length,
    lossDaysPerWeek,
    Math.max(0, maxDailyLossPercent)
  );
  if (!planRows.length) return [];

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
  for (const indices of monthMap.values()) {
    if (!indices.length) continue;
    monthIndex += 1;
    const startIndex = indices[0];
    const endIndex = indices[indices.length - 1];
    const monthStartBalance = startIndex > 0 ? planRows[startIndex - 1]?.endBalance ?? starting : starting;
    const monthEndBalance = planRows[endIndex]?.endBalance ?? target;
    const weeksInMonth = Math.max(1, Math.ceil(indices.length / 5));

    for (let week = 1; week <= weeksInMonth; week++) {
      const weekEndIndex = Math.min(endIndex, startIndex + week * 5 - 1);
      const fraction = week / weeksInMonth;
      milestones.push({
        targetEquity: monthStartBalance + (monthEndBalance - monthStartBalance) * fraction,
        targetDate: tradingDays[weekEndIndex] ?? targetIso,
        monthIndex,
        weekIndex: week,
        weeksInMonth,
        monthStartBalance,
        monthEndBalance,
      });
    }
  }

  return milestones;
}

function normalizeChecklistItems(items: unknown): UiChecklistItem[] {
  return (Array.isArray(items) ? items : [])
    .map((item: any): UiChecklistItem | null => {
      if (typeof item === "string") {
        const text = item.trim();
        return text ? { text, done: false } : null;
      }
      if (item && typeof item === "object") {
        const text = String(item?.text ?? "").trim();
        if (!text) return null;
        return { text, done: !!item?.done };
      }
      return null;
    })
    .filter((value): value is UiChecklistItem => !!value);
}

function extractChecklistTextsFromGrowthPlan(plan: GrowthPlanSummary | null, fallbackTexts: string[]): string[] {
  if (!plan) return fallbackTexts;
  const prepareChecklist = (plan as any)?.steps?.prepare?.checklist;
  const texts: string[] = [];

  const pushFromString = (raw: string) => {
    texts.push(
      ...raw
        .split(/\r?\n|•|\-|\*|\u2022/g)
        .map((item) => item.trim())
        .filter(Boolean)
    );
  };

  const pushFromArray = (items: any[]) => {
    for (const item of items) {
      if (!item) continue;
      if (typeof item === "string") {
        const text = item.trim();
        if (text) texts.push(text);
        continue;
      }
      if (typeof item === "object") {
        if ((item as any).isActive === false) continue;
        const text = typeof (item as any).text === "string" ? String((item as any).text).trim() : "";
        if (text) texts.push(text);
      }
    }
  };

  if (typeof prepareChecklist === "string") pushFromString(prepareChecklist);
  else if (Array.isArray(prepareChecklist)) pushFromArray(prepareChecklist);

  const seen = new Set<string>();
  const deduped = texts.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return deduped.length ? deduped : fallbackTexts;
}

function mergeChecklistBaseWithSaved(baseTexts: string[], saved: UiChecklistItem[]): UiChecklistItem[] {
  const base = baseTexts.map((text) => ({ text, done: false }));
  const byKey = new Map<string, UiChecklistItem>();
  for (const savedItem of normalizeChecklistItems(saved)) {
    byKey.set(savedItem.text.trim().toLowerCase(), savedItem);
  }

  const merged = base.map((item) => {
    const hit = byKey.get(item.text.trim().toLowerCase());
    return hit ? { text: item.text, done: !!hit.done } : item;
  });

  for (const savedItem of normalizeChecklistItems(saved)) {
    const key = savedItem.text.trim().toLowerCase();
    if (!base.some((item) => item.text.trim().toLowerCase() === key)) merged.push(savedItem);
  }

  return merged;
}

export function DashboardScreen({ onOpenModule: _onOpenModule, onOpenJournalDate }: DashboardScreenProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [series, setSeries] = useState<AccountSeriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dailyCoachMessage, setDailyCoachMessage] = useState<MotivationMessageRow | null>(null);
  const [todayChecklist, setTodayChecklist] = useState<UiChecklistItem[]>([]);
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [checklistSaveError, setChecklistSaveError] = useState<string | null>(null);
  const lastChecklistPayloadRef = useRef("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isWideProgressLayout = width >= 980;
  const isWideTopRow = width >= 920;
  const isCompactTopCards = width < 700;
  const todayStr = useMemo(() => formatDateYYYYMMDD(new Date()), []);
  const coachFallback = useMemo(
    () => buildFallbackCoachRow(language === "es" ? "es" : "en"),
    [language]
  );

  useEffect(() => {
    let active = true;

    async function load(isRefresh = false) {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);
        const seriesRes = await apiGet<AccountSeriesResponse>("/api/account/series");
        if (!active) return;
        setSeries(seriesRes ?? null);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load data.");
      } finally {
        if (!active) return;
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadDailyCoachMessage() {
      const localeCode = language === "es" ? "es" : "en";
      if (!supabaseMobile) {
        if (active) setDailyCoachMessage(buildFallbackCoachRow(localeCode));
        return;
      }

      try {
        const { data, error } = await supabaseMobile
          .from("motivational_messages")
          .select("id, locale, title, body, weekday, day_of_year")
          .eq("active", true)
          .in("locale", [localeCode, "en"]);

        if (!active) return;
        if (error) {
          console.warn("[mobile dashboard] motivational_messages fetch error:", error);
          setDailyCoachMessage(buildFallbackCoachRow(localeCode));
          return;
        }

        const picked = pickMotivationMessage(
          ((data ?? []) as MotivationMessageRow[]).filter((row) => !!row.body),
          localeCode
        );
        setDailyCoachMessage(picked);
      } catch (err) {
        if (!active) return;
        console.warn("[mobile dashboard] daily coach message load exception:", err);
        setDailyCoachMessage(buildFallbackCoachRow(localeCode));
      }
    }

    void loadDailyCoachMessage();
    return () => {
      active = false;
    };
  }, [language]);

  useEffect(() => {
    const fallbackChecklist = [
      t(language, "Respect your max daily loss limit.", "Respeta tu pérdida máxima diaria."),
      t(language, "Take only planned setups from your playbook.", "Toma solo setups planificados de tu playbook."),
      t(language, "Log your session inside 3 minutes.", "Registra tu sesión dentro de 3 minutos."),
    ];

    let active = true;

    async function loadTodayChecklist() {
      try {
        const res = await apiGet<TodayChecklistResponse>(`/api/checklist/today?date=${todayStr}`);
        if (!active) return;
        const base = extractChecklistTextsFromGrowthPlan(series?.plan ?? null, fallbackChecklist);
        setTodayChecklist(mergeChecklistBaseWithSaved(base, res?.items ?? []));
        setChecklistSaveError(null);
        lastChecklistPayloadRef.current = "";
      } catch {
        if (!active) return;
        const base = extractChecklistTextsFromGrowthPlan(series?.plan ?? null, fallbackChecklist);
        setTodayChecklist(base.map((text) => ({ text, done: false })));
      }
    }

    void loadTodayChecklist();

    return () => {
      active = false;
    };
  }, [language, series?.plan, todayStr]);

  useEffect(() => {
    let active = true;

    async function loadJournalEntries(isRefresh = false) {
      try {
        if (!isRefresh) setJournalLoading(true);
        const today = new Date();
        const toDate = today.toISOString().slice(0, 10);
        const from = new Date(today);
        from.setDate(today.getDate() - 45);
        const fromDate = from.toISOString().slice(0, 10);
        const res = await apiGet<JournalListResponse>(`/api/journal/list?fromDate=${fromDate}&toDate=${toDate}`);
        if (!active) return;
        const entries = res?.entries ?? [];
        setJournalEntries(entries);

        const availableDates = entries
          .map((entry) => String(entry?.date ?? "").slice(0, 10))
          .filter((value) => value.length === 10)
          .sort();

        const todayStr = today.toISOString().slice(0, 10);
        if (!selectedDate || !availableDates.includes(selectedDate)) {
          if (availableDates.includes(todayStr)) setSelectedDate(todayStr);
          else setSelectedDate(availableDates[availableDates.length - 1] ?? null);
        }
      } catch {
        if (!active) return;
        setJournalEntries([]);
      } finally {
        if (!active) return;
        if (!isRefresh) setJournalLoading(false);
      }
    }

    void loadJournalEntries();
    return () => {
      active = false;
    };
  }, []);

  const dailyMap = useMemo(() => new Map(series?.daily?.map((d) => [d.date, d.value]) ?? []), [series]);
  const accountSeries = useMemo(
    () => [...(series?.series ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    [series?.series]
  );

  const currentBalance = Number(series?.totals?.currentBalance ?? 0);
  const plan = series?.plan ?? null;
  const adjustedTargetBalance = Number(plan?.adjustedTargetBalance ?? plan?.targetBalance ?? 0);
  const targetDateStr = toDateOnlyStr(plan?.targetDate);

  const weeklySummary = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);

    const days = Array.from({ length: 6 }, (_, idx) => {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + idx);
      const iso = date.toISOString().slice(0, 10);
      const pnl = dailyMap.has(iso) ? Number(dailyMap.get(iso)) || 0 : null;
      return { iso, pnl };
    });

    const total = days.reduce((acc, day) => acc + (day.pnl ?? 0), 0);
    return { total, days };
  }, [dailyMap]);

  const tradingSystem = useMemo(() => {
    const system = plan?.steps?.execution_and_journal?.system ?? {};
    const doList = Array.isArray(system.doList)
      ? system.doList.filter((item) => String(item?.text ?? "").trim().length > 0)
      : [];
    const dontList = Array.isArray(system.dontList)
      ? system.dontList.filter((item) => String(item?.text ?? "").trim().length > 0)
      : [];
    return { doList, dontList };
  }, [plan]);

  const accountProgress = useMemo<AccountProgressMetrics | null>(() => {
    if (!series) return null;
    const firstPoint = accountSeries[0] ?? null;
    const peakPoint =
      accountSeries.reduce<SeriesPoint | null>((best, point) => {
        if (!best || point.value > best.value) return point;
        return best;
      }, null) ?? null;

    const referenceBalance =
      plan && Number.isFinite(plan.startingBalance) && plan.startingBalance > 0
        ? plan.startingBalance
        : firstPoint?.value ?? currentBalance;
    const referenceDate = getPlanStartDateStr(plan) || firstPoint?.date || formatDateYYYYMMDD(new Date());
    const peakBalance = Math.max(peakPoint?.value ?? currentBalance, currentBalance);
    const peakDate =
      currentBalance >= (peakPoint?.value ?? Number.NEGATIVE_INFINITY)
        ? formatDateYYYYMMDD(new Date())
        : peakPoint?.date || formatDateYYYYMMDD(new Date());
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
      tradingPnl: Number(series.totals?.tradingPnl ?? 0),
      netCashflow: Number(series.totals?.cashflowNet ?? 0),
      peakBalance,
      peakDate,
      fromPeak,
      fromPeakPct,
      peakCoveragePct,
      isAtHigh: Math.abs(fromPeak) < 0.01,
      referenceMode: plan?.planStartIso ? "plan-start" : "tracked",
    };
  }, [accountSeries, currentBalance, plan, series]);

  const manualPhaseMetrics = useMemo(() => {
    if (!plan || String(plan.planMode ?? "").toLowerCase() !== "manual") return null;
    const phases = normalizePhases(plan.planPhases);
    if (!phases.length) return null;

    const sorted = [...phases].sort((a, b) => a.targetEquity - b.targetEquity);
    const current = sorted.find((phase) => currentBalance < phase.targetEquity) || sorted[sorted.length - 1];
    const currentIndex = sorted.findIndex((phase) => phase.id === current.id);
    const prevTarget = currentIndex > 0 ? sorted[currentIndex - 1].targetEquity : plan.startingBalance ?? 0;
    const span = Math.max(1, current.targetEquity - prevTarget);
    const progress = Math.max(0, Math.min(1.25, (currentBalance - prevTarget) / span));

    return {
      current,
      prevTarget,
      progress,
    };
  }, [currentBalance, plan]);

  const cadenceProgress = useMemo<CadenceProgressSummary | null>(() => {
    if (!plan || String(plan.planMode ?? "").toLowerCase() !== "auto") return null;
    const startIso = getPlanStartDateStr(plan);
    const targetIso = targetDateStr;
    if (!startIso || !targetIso || plan.startingBalance <= 0 || adjustedTargetBalance <= 0) return null;

    const milestones = buildWeeklyMilestonesFromMonthlyGoals(
      plan.startingBalance,
      adjustedTargetBalance,
      startIso,
      targetIso,
      Number(plan.lossDaysPerWeek ?? 0),
      Number(plan.maxDailyLossPercent ?? 0)
    );
    if (!milestones.length) return null;

    const todayStr = formatDateYYYYMMDD(new Date());
    const current =
      milestones.find((milestone) => (milestone.targetDate ?? targetIso) >= todayStr) ?? milestones[milestones.length - 1];
    const monthIndex = current.monthIndex ?? 1;
    const weekIndex = current.weekIndex ?? 1;
    const weeksInMonth = current.weeksInMonth ?? 1;
    const quarterIndex = Math.ceil(monthIndex / 3);

    const monthMilestones = milestones.filter((milestone) => (milestone.monthIndex ?? 1) === monthIndex);
    const quarterMilestones = milestones.filter((milestone) => {
      const index = milestone.monthIndex ?? 1;
      return index >= (quarterIndex - 1) * 3 + 1 && index <= quarterIndex * 3;
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
      return { startBalance, targetBalance, goalAmount, actualAmount, progress, targetDate };
    };

    const previousWeek = weekIndex > 1 ? monthMilestones[weekIndex - 2] : null;
    const weekStartBalance = previousWeek?.targetEquity ?? current.monthStartBalance ?? plan.startingBalance;
    const monthStartBalance = current.monthStartBalance ?? monthMilestones[0]?.monthStartBalance ?? plan.startingBalance;
    const monthTargetBalance = current.monthEndBalance ?? monthMilestones[monthMilestones.length - 1]?.targetEquity ?? adjustedTargetBalance;
    const quarterStartBalance =
      quarterMilestones[0]?.monthStartBalance ??
      (quarterMilestones[0]?.monthIndex === 1 ? plan.startingBalance : quarterMilestones[0]?.targetEquity ?? plan.startingBalance);
    const quarterTargetBalance =
      quarterMilestones[quarterMilestones.length - 1]?.monthEndBalance ??
      quarterMilestones[quarterMilestones.length - 1]?.targetEquity ??
      adjustedTargetBalance;

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
  }, [adjustedTargetBalance, currentBalance, plan, targetDateStr]);

  const planProgress = useMemo<PlanProgressCard | null>(() => {
    if (!plan || adjustedTargetBalance <= 0) return null;

    if (cadenceProgress) {
      return {
        phaseLabel:
          language === "es"
            ? `Trimestre ${cadenceProgress.quarterIndex} · Mes ${cadenceProgress.monthIndex} · Semana ${cadenceProgress.weekIndex}/${cadenceProgress.weeksInMonth}`
            : `Quarter ${cadenceProgress.quarterIndex} · Month ${cadenceProgress.monthIndex} · Week ${cadenceProgress.weekIndex}/${cadenceProgress.weeksInMonth}`,
        targetDate: cadenceProgress.week.targetDate ?? targetDateStr,
        startLabel: t(language, "Checkpoint start", "Inicio checkpoint"),
        targetLabel: t(language, "Checkpoint target", "Meta checkpoint"),
        startBalance: cadenceProgress.week.startBalance,
        targetBalance: cadenceProgress.week.targetBalance,
        gap: currentBalance - cadenceProgress.week.targetBalance,
        progress: cadenceProgress.week.progress,
        overallTargetBalance: adjustedTargetBalance,
        periods: [
          { key: "week", title: t(language, "Week checkpoint", "Checkpoint semanal"), data: cadenceProgress.week },
          { key: "month", title: t(language, "Month checkpoint", "Checkpoint mensual"), data: cadenceProgress.month },
          { key: "quarter", title: t(language, "Quarter checkpoint", "Checkpoint trimestral"), data: cadenceProgress.quarter },
        ],
      };
    }

    if (manualPhaseMetrics) {
      return {
        phaseLabel: manualPhaseMetrics.current.title || t(language, "Phase", "Fase"),
        targetDate: manualPhaseMetrics.current.targetDate ?? targetDateStr,
        startLabel: t(language, "Phase start", "Inicio fase"),
        targetLabel: t(language, "Phase target", "Meta fase"),
        startBalance: manualPhaseMetrics.prevTarget,
        targetBalance: manualPhaseMetrics.current.targetEquity,
        gap: currentBalance - manualPhaseMetrics.current.targetEquity,
        progress: manualPhaseMetrics.progress,
        overallTargetBalance: adjustedTargetBalance,
        periods: [],
      };
    }

    const startBalance = Number(plan.startingBalance ?? 0);
    const span = Math.max(1, adjustedTargetBalance - startBalance);
    return {
      phaseLabel: t(language, "Full plan", "Plan completo"),
      targetDate: targetDateStr,
      startLabel: t(language, "Plan start", "Inicio plan"),
      targetLabel: t(language, "Plan target", "Meta plan"),
      startBalance,
      targetBalance: adjustedTargetBalance,
      gap: currentBalance - adjustedTargetBalance,
      progress: Math.max(0, Math.min(1.25, (currentBalance - startBalance) / span)),
      overallTargetBalance: adjustedTargetBalance,
      periods: [],
    };
  }, [adjustedTargetBalance, cadenceProgress, currentBalance, language, manualPhaseMetrics, plan, targetDateStr]);

  const daySummaryDates = useMemo(
    () =>
      journalEntries
        .map((entry) => String(entry?.date ?? "").slice(0, 10))
        .filter((value) => value.length === 10)
        .sort(),
    [journalEntries]
  );

  const selectedEntry = selectedDate
    ? journalEntries.find((entry) => String(entry?.date ?? "").slice(0, 10) === selectedDate) ?? null
    : null;
  const selectedNotes: TradesPayload = parseNotes(selectedEntry?.notes ?? null);
  const premarketText = String(selectedNotes?.premarket ?? "").trim();
  const insideText = String(selectedNotes?.live ?? "").trim();
  const afterText = String(selectedNotes?.post ?? "").trim();
  const entryRows: StoredTradeRow[] = Array.isArray(selectedNotes?.entries) ? selectedNotes.entries : [];
  const exitRows: StoredTradeRow[] = Array.isArray(selectedNotes?.exits) ? selectedNotes.exits : [];

  const daySummaryIndex = selectedDate ? daySummaryDates.indexOf(selectedDate) : -1;
  const prevSummaryDate = daySummaryIndex > 0 ? daySummaryDates[daySummaryIndex - 1] : null;
  const nextSummaryDate =
    daySummaryIndex >= 0 && daySummaryIndex < daySummaryDates.length - 1
      ? daySummaryDates[daySummaryIndex + 1]
      : null;

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }),
    [language]
  );

  const formatCurrency = (value: number) => currencyFormatter.format(Number.isFinite(value) ? value : 0);

  const formatSigned = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}${formatCurrency(Math.abs(value))}`;
  };

  const formatSignedShort = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}$${Math.abs(value).toFixed(0)}`;
  };

  const formatPercent = (value: number, digits = 1) => `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;

  async function handleRefresh() {
    setError(null);
    setRefreshing(true);
    try {
      const today = new Date();
      const toDate = today.toISOString().slice(0, 10);
      const from = new Date(today);
      from.setDate(today.getDate() - 45);
      const fromDate = from.toISOString().slice(0, 10);

      const [seriesRes, journalRes] = await Promise.all([
        apiGet<AccountSeriesResponse>("/api/account/series"),
        apiGet<JournalListResponse>(`/api/journal/list?fromDate=${fromDate}&toDate=${toDate}`),
      ]);

      setSeries(seriesRes ?? null);
      const entries = journalRes?.entries ?? [];
      setJournalEntries(entries);

      const availableDates = entries
        .map((entry) => String(entry?.date ?? "").slice(0, 10))
        .filter((value) => value.length === 10)
        .sort();

      const todayStr = today.toISOString().slice(0, 10);
      if (!selectedDate || !availableDates.includes(selectedDate)) {
        if (availableDates.includes(todayStr)) setSelectedDate(todayStr);
        else setSelectedDate(availableDates[availableDates.length - 1] ?? null);
      }
    } catch (err: any) {
      setError(err?.message ?? "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }

  async function saveChecklist(items: UiChecklistItem[]) {
    const payload = JSON.stringify({ date: todayStr, items });
    if (payload === lastChecklistPayloadRef.current) return;
    lastChecklistPayloadRef.current = payload;
    setChecklistSaving(true);
    setChecklistSaveError(null);
    try {
      await apiPost("/api/checklist/upsert", {
        date: todayStr,
        items,
        notes: null,
      });
    } catch {
      setChecklistSaveError(
        t(
          language,
          "Could not save Trading System.",
          "No se pudo guardar el sistema de trading."
        )
      );
      lastChecklistPayloadRef.current = "";
    } finally {
      setChecklistSaving(false);
    }
  }

  function queueChecklistSave(items: UiChecklistItem[]) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveChecklist(items);
    }, 400);
  }

  function toggleChecklistItem(index: number) {
    setTodayChecklist((current) => {
      const next = current.map((item, idx) => (idx === index ? { ...item, done: !item.done } : item));
      queueChecklistSave(next);
      return next;
    });
  }

  const accountMetricCards = accountProgress
    ? [
        {
          key: "net-change",
          label: t(language, "Net account change", "Cambio neto de cuenta"),
          value: formatSigned(accountProgress.netChange),
          tone: accountProgress.netChange >= 0 ? styles.metricTonePositive : styles.metricToneNegative,
          sublabel: t(language, "Current balance vs reference", "Balance actual vs referencia"),
        },
        {
          key: "return",
          label: t(language, "Return on reference", "Retorno sobre referencia"),
          value: formatPercent(accountProgress.returnPct),
          tone: accountProgress.returnPct >= 0 ? styles.metricToneInfo : styles.metricToneNegative,
          sublabel: t(language, "Percent change in equity", "Cambio porcentual del equity"),
        },
        {
          key: "trading-pnl",
          label: t(language, "Trading P&L", "P&L de trading"),
          value: formatSigned(accountProgress.tradingPnl),
          tone: accountProgress.tradingPnl >= 0 ? styles.metricTonePositive : styles.metricToneNegative,
          sublabel: t(language, "Execution result", "Resultado de ejecución"),
        },
        {
          key: "cashflow",
          label: t(language, "Net cashflow", "Flujo neto"),
          value: formatSigned(accountProgress.netCashflow),
          tone:
            Math.abs(accountProgress.netCashflow) < 0.005
              ? styles.metricToneNeutral
              : accountProgress.netCashflow >= 0
                ? styles.metricToneWarning
                : styles.metricToneNegative,
          sublabel: t(language, "Deposits and withdrawals", "Depósitos y retiros"),
        },
      ]
    : [];

  const renderDaySummary = () => (
    <View style={styles.daySummaryCard}>
      <View style={styles.daySummaryHeader}>
        <View>
          <Text style={styles.daySummaryEyebrow}>{t(language, "Day summary", "Resumen del día")}</Text>
          <Text style={styles.daySummaryTitle}>
            {selectedDate ?? t(language, "Select a day", "Selecciona un día")}
          </Text>
        </View>
        <View style={styles.daySummaryNav}>
          <Pressable
            style={[styles.dayNavButton, !prevSummaryDate && styles.dayNavDisabled]}
            onPress={() => prevSummaryDate && setSelectedDate(prevSummaryDate)}
            disabled={!prevSummaryDate}
          >
            <Text style={styles.dayNavText}>‹</Text>
          </Pressable>
          <Pressable
            style={[styles.dayNavButton, !nextSummaryDate && styles.dayNavDisabled]}
            onPress={() => nextSummaryDate && setSelectedDate(nextSummaryDate)}
            disabled={!nextSummaryDate}
          >
            <Text style={styles.dayNavText}>›</Text>
          </Pressable>
        </View>
      </View>

      {!selectedDate ? (
        <Text style={styles.daySummaryHint}>
          {t(
            language,
            "No journal days found in the last 45 days.",
            "No hay días de journal en los últimos 45 días."
          )}
        </Text>
      ) : (
        <>
          <View style={styles.daySummaryRow}>
            <View style={styles.daySummaryNote}>
              <Text style={styles.daySummaryLabel}>{t(language, "Premarket", "Premarket")}</Text>
              <Text style={styles.daySummaryBody}>
                {premarketText ? premarketText.slice(0, 160) : t(language, "No notes.", "Sin notas.")}
              </Text>
            </View>
            <View style={styles.daySummaryNote}>
              <Text style={styles.daySummaryLabel}>{t(language, "Inside trade", "Inside trade")}</Text>
              <Text style={styles.daySummaryBody}>
                {insideText ? insideText.slice(0, 160) : t(language, "No notes.", "Sin notas.")}
              </Text>
            </View>
          </View>
          <View style={styles.daySummaryRow}>
            <View style={styles.daySummaryNote}>
              <Text style={styles.daySummaryLabel}>{t(language, "After trade", "After trade")}</Text>
              <Text style={styles.daySummaryBody}>
                {afterText ? afterText.slice(0, 160) : t(language, "No notes.", "Sin notas.")}
              </Text>
            </View>
          </View>
          <View style={styles.daySummaryTrades}>
            <View style={styles.daySummaryTradeCard}>
              <Text style={styles.daySummaryLabel}>{t(language, "Entries", "Entradas")}</Text>
              {entryRows.length ? (
                entryRows.slice(0, 5).map((row, idx) => (
                  <Text key={`entry-${idx}`} style={styles.daySummaryBody}>
                    {row.symbol} · {row.side ?? "—"} · {row.quantity ?? "—"} @ {row.price ?? "—"}
                  </Text>
                ))
              ) : (
                <Text style={styles.daySummaryBody}>{t(language, "No entries logged.", "Sin entradas.")}</Text>
              )}
            </View>
            <View style={styles.daySummaryTradeCard}>
              <Text style={styles.daySummaryLabel}>{t(language, "Exits", "Salidas")}</Text>
              {exitRows.length ? (
                exitRows.slice(0, 5).map((row, idx) => (
                  <Text key={`exit-${idx}`} style={styles.daySummaryBody}>
                    {row.symbol} · {row.side ?? "—"} · {row.quantity ?? "—"} @ {row.price ?? "—"}
                  </Text>
                ))
              ) : (
                <Text style={styles.daySummaryBody}>{t(language, "No exits logged.", "Sin salidas.")}</Text>
              )}
            </View>
          </View>
        </>
      )}

      {journalLoading ? (
        <Text style={styles.loadingText}>{t(language, "Syncing journal…", "Sincronizando journal…")}</Text>
      ) : null}
    </View>
  );

  return (
    <ScreenScaffold
      title={t(language, "Dashboard", "Dashboard")}
      subtitle={t(
        language,
        "Your daily overview: progress, streaks, and key actions.",
        "Tu resumen diario: progreso, rachas y acciones clave."
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading data…", "Cargando datos…")}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.panelCard, styles.coachBannerCard, isCompactTopCards && styles.coachBannerCardCompact]}>
            <Image source={coachBrain} resizeMode="contain" style={styles.coachBrainA} />
            <Image source={coachBrain} resizeMode="contain" style={styles.coachBrainB} />
            <View style={styles.coachAccentRail} />
            <View style={styles.coachBannerHeader}>
              <View style={styles.coachHeaderMeta}>
                <Text style={styles.heroEyebrow}>{t(language, "Daily coach message", "Mensaje diario del coach")}</Text>
                <GradientTitleText
                  text={dailyCoachMessage?.title || coachFallback.title || t(language, "Coach note for today", "Nota del coach para hoy")}
                  style={styles.coachTitle}
                />
              </View>
              <View style={styles.coachPill}>
                <Text style={styles.coachPillText}>{t(language, "Today", "Hoy")}</Text>
              </View>
            </View>
            <View style={styles.coachMessageRow}>
              <Text style={styles.coachQuoteMark}>“</Text>
              <Text style={styles.coachBody}>
                {dailyCoachMessage?.body || coachFallback.body}
              </Text>
            </View>
          </View>

          <View style={[styles.panelCard, styles.systemPanel, styles.systemPanelStandalone, isCompactTopCards && styles.systemPanelCompact]}>
            <View style={[styles.systemHeaderRow, isCompactTopCards && styles.systemHeaderRowCompact]}>
              <View style={styles.systemHeaderMeta}>
                <GradientTitleText text={t(language, "Trading System", "Sistema de trading")} style={styles.systemTitle} />
                <Text style={styles.systemDate}>
                  {todayStr}
                  {checklistSaving
                    ? `  ${t(language, "Saving…", "Guardando…")}`
                    : checklistSaveError
                      ? `  ${t(language, "Error", "Error")}`
                      : `  ${t(language, "Saved", "Guardado")}`}
                </Text>
              </View>
            </View>

            <View style={[styles.systemWorkspace, !isWideTopRow && styles.systemWorkspaceStack, isCompactTopCards && styles.systemWorkspaceCompact]}>
              <View style={[styles.systemStepsColumn, isCompactTopCards && styles.systemStepsColumnCompact]}>
                <Text style={styles.systemHeaderHint}>{t(language, "Steps (daily)", "Pasos (diarios)")}</Text>

                {todayChecklist.length ? (
                  <View style={styles.systemChecklistList}>
                    {todayChecklist.slice(0, isCompactTopCards ? 4 : 12).map((item, index) => (
                      <Pressable
                        key={`${item.text}-${index}`}
                        onPress={() => toggleChecklistItem(index)}
                        style={[styles.systemChecklistItem, isCompactTopCards && styles.systemChecklistItemCompact]}
                      >
                        <View style={[styles.systemCheckbox, item.done && styles.systemCheckboxDone]}>
                          {item.done ? <Text style={styles.systemCheckboxMark}>✓</Text> : null}
                        </View>
                        <Text style={[styles.systemItem, item.done && styles.systemItemDone]}>{item.text}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.systemHint}>
                    {t(
                      language,
                      "Add your Trading System steps in Growth Plan.",
                      "Agrega tus pasos del Sistema de Trading en el Growth Plan."
                    )}{" "}
                    <Text style={styles.systemLink} onPress={() => Linking.openURL(WEB_GROWTH_PLAN_URL)}>
                      {t(language, "Edit Growth Plan", "Editar Growth Plan")}
                    </Text>
                  </Text>
                )}

                <Pressable style={[styles.systemJournalButton, isCompactTopCards && styles.systemJournalButtonCompact]} onPress={() => onOpenJournalDate(todayStr)}>
                  <Text style={styles.systemJournalButtonText}>
                    {t(language, "Open today's journal", "Abrir el journal de hoy")}
                  </Text>
                </Pressable>
              </View>

              <View style={[styles.systemRulesColumn, isCompactTopCards && styles.systemRulesColumnCompact]}>
                <View style={[styles.systemSectionCard, isCompactTopCards && styles.systemSectionCardCompact]}>
                  <Text style={styles.systemLabel}>{t(language, "Do", "Hacer")}</Text>
                  {(tradingSystem.doList.length ? tradingSystem.doList : [{ text: "—" }]).slice(0, isCompactTopCards ? 2 : 4).map((item, idx) => (
                    <View key={`do-${idx}`} style={styles.systemBulletRow}>
                      <View style={[styles.systemBullet, styles.systemBulletDo]} />
                      <Text style={styles.systemItem}>{item.text}</Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.systemSectionCard, isCompactTopCards && styles.systemSectionCardCompact]}>
                  <Text style={styles.systemLabelDont}>{t(language, "Don't", "No hacer")}</Text>
                  {(tradingSystem.dontList.length ? tradingSystem.dontList : [{ text: "—" }]).slice(0, isCompactTopCards ? 2 : 4).map((item, idx) => (
                    <View key={`dont-${idx}`} style={styles.systemBulletRow}>
                      <View style={[styles.systemBullet, styles.systemBulletDont]} />
                      <Text style={styles.systemItem}>{item.text}</Text>
                    </View>
                  ))}
                </View>

                {tradingSystem.doList.length + tradingSystem.dontList.length === 0 ? (
                  <Text style={styles.systemHint}>
                    {t(
                      language,
                      "Add your Do/Don't rules in Growth Plan.",
                      "Agrega tus reglas Hacer/No hacer en Growth Plan."
                    )}{" "}
                    <Text style={styles.systemLink} onPress={() => Linking.openURL(WEB_GROWTH_PLAN_URL)}>
                      {t(language, "Edit Growth Plan", "Editar Growth Plan")}
                    </Text>
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={[styles.panelCard, styles.weeklyCard]}>
              <GradientTitleText text={t(language, "Weekly P&L", "P&L semanal")} style={styles.summaryLabel} />
              <Text style={styles.summaryValue}>{formatSigned(weeklySummary.total)}</Text>
              <Text style={styles.summaryHint}>
                {t(language, "Current week (Sun–Fri).", "Semana actual (Dom–Vie).")}
              </Text>
              <View style={styles.weeklyRow}>
                {weeklySummary.days.map((day, idx) => {
                  const isPositive = day.pnl != null && day.pnl > 0;
                  const isNegative = day.pnl != null && day.pnl < 0;
                  return (
                    <Pressable
                      key={`weekly-${day.iso}-${idx}`}
                      accessibilityRole="button"
                      onPress={() => onOpenJournalDate(day.iso)}
                      style={[
                        styles.weekCell,
                        isPositive && styles.weekCellWin,
                        isNegative && styles.weekCellLoss,
                        day.pnl === 0 && styles.weekCellFlat,
                      ]}
                    >
                      <Text style={styles.weekCellLabel}>
                        {language === "es"
                          ? ["D", "L", "M", "X", "J", "V"][idx]
                          : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][idx]}
                      </Text>
                      <Text style={styles.weekCellValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {day.pnl == null ? "—" : day.pnl === 0 ? "$0" : formatSignedShort(day.pnl)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={[styles.progressRow, !isWideProgressLayout && styles.progressRowStack]}>
            <View style={[styles.progressColumn, !isWideProgressLayout && styles.progressColumnFull]}>
              <View style={styles.progressCard}>
                <GradientTitleText text={t(language, "Account Progress", "Progreso de cuenta")} style={styles.progressTitle} />

                {accountProgress ? (
                  <>
                    <View style={styles.snapshotCard}>
                      <View style={styles.snapshotMain}>
                        <Text style={styles.snapshotEyebrow}>{t(language, "Equity snapshot", "Snapshot de equity")}</Text>
                        <Text style={styles.snapshotValue}>{formatCurrency(currentBalance)}</Text>
                        <Text style={styles.snapshotHint}>
                          {accountProgress.referenceMode === "plan-start"
                            ? t(language, "Reference locked to plan start", "Referencia fijada al inicio del plan")
                            : t(language, "Reference from first tracked point", "Referencia desde el primer punto registrado")}{" "}
                          · <Text style={styles.snapshotHintStrong}>{accountProgress.referenceDate}</Text>
                        </Text>
                      </View>

                      <View style={styles.snapshotBadge}>
                        <Text style={styles.snapshotBadgeLabel}>{t(language, "Reference balance", "Balance de referencia")}</Text>
                        <Text style={styles.snapshotBadgeValue}>{formatCurrency(accountProgress.referenceBalance)}</Text>
                      </View>
                    </View>

                    <View style={styles.metricGrid}>
                      {accountMetricCards.map((card) => (
                        <View key={card.key} style={styles.metricCard}>
                          <Text style={styles.metricLabel}>{card.label}</Text>
                          <Text style={[styles.metricValue, card.tone]}>{card.value}</Text>
                          <Text style={styles.metricSublabel}>{card.sublabel}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.highWaterCard}>
                      <View style={styles.highWaterHeader}>
                        <View style={styles.highWaterMeta}>
                          <Text style={styles.metricLabel}>{t(language, "High-water mark", "Máximo de equity")}</Text>
                          <Text style={styles.highWaterValue}>{formatCurrency(accountProgress.peakBalance)}</Text>
                          <Text style={styles.metricSublabel}>{accountProgress.peakDate}</Text>
                        </View>

                        <View style={styles.highWaterStatus}>
                          <Text style={styles.metricLabel}>
                            {accountProgress.isAtHigh
                              ? t(language, "Status", "Estado")
                              : t(language, "From peak", "Desde el máximo")}
                          </Text>
                          <Text style={[styles.highWaterStatusValue, accountProgress.isAtHigh ? styles.metricTonePositive : styles.metricToneWarning]}>
                            {accountProgress.isAtHigh
                              ? t(language, "New high", "Nuevo máximo")
                              : formatSigned(accountProgress.fromPeak)}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.max(accountProgress.isAtHigh ? 100 : 6, accountProgress.peakCoveragePct)}%` },
                          ]}
                        />
                      </View>

                      <Text style={styles.progressNote}>
                        {accountProgress.isAtHigh
                          ? t(
                              language,
                              "The account is printing a new equity high.",
                              "La cuenta está marcando un nuevo máximo de equity."
                            )
                          : t(
                              language,
                              `The account is ${formatCurrency(Math.abs(accountProgress.fromPeak))} below its high-water mark.`,
                              `La cuenta está ${formatCurrency(Math.abs(accountProgress.fromPeak))} por debajo de su máximo de equity.`
                            )}
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.progressNote}>{t(language, "No account progress yet.", "Aún no hay progreso de cuenta.")}</Text>
                )}
              </View>

              {renderDaySummary()}
            </View>

            <View style={[styles.progressCard, !isWideProgressLayout && styles.progressCardFull]}>
              <GradientTitleText text={t(language, "Plan Progress", "Progreso del plan")} style={styles.progressTitle} />

              {!planProgress ? (
                <Text style={styles.progressNote}>
                  {t(language, "No growth plan set yet.", "Aún no tienes un Growth Plan.")}{" "}
                  <Text style={styles.systemLink} onPress={() => Linking.openURL(WEB_GROWTH_PLAN_URL)}>
                    {t(language, "Open Growth Plan →", "Abrir Growth Plan →")}
                  </Text>
                </Text>
              ) : (
                <>
                  <View style={[styles.snapshotCard, styles.planSnapshotCard]}>
                    <View style={styles.snapshotMain}>
                      <Text style={styles.planPhaseLabel}>{t(language, "Current phase", "Fase actual")}</Text>
                      <Text style={styles.planPhaseValue}>{planProgress.phaseLabel}</Text>
                    </View>
                    {planProgress.targetDate ? (
                      <View style={styles.deadlinePill}>
                        <Text style={styles.deadlineText}>
                          {t(language, "By", "Para")} {planProgress.targetDate}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.metricGrid}>
                    {[
                      { key: "start", label: planProgress.startLabel, value: formatCurrency(planProgress.startBalance) },
                      { key: "current", label: t(language, "Balance now", "Balance actual"), value: formatCurrency(currentBalance) },
                      { key: "target", label: planProgress.targetLabel, value: formatCurrency(planProgress.targetBalance) },
                      {
                        key: "status",
                        label: planProgress.gap >= 0 ? t(language, "Ahead of target", "Adelantado vs meta") : t(language, "Remaining", "Falta"),
                        value: formatCurrency(Math.abs(planProgress.gap)),
                        tone: planProgress.gap >= 0 ? styles.metricTonePositive : styles.metricToneWarning,
                      },
                    ].map((card) => (
                      <View key={card.key} style={styles.metricCard}>
                        <Text style={styles.metricLabel}>{card.label}</Text>
                        <Text style={[styles.metricValue, card.tone ?? styles.metricToneNeutral]}>{card.value}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFillPlan,
                        { width: `${Math.max(0, Math.min(100, planProgress.progress * 100))}%` },
                      ]}
                    />
                  </View>

                  <Text style={styles.progressNote}>
                    {t(
                      language,
                      "This compares balance now against the current target. Overall plan target:",
                      "Esto compara el balance actual contra la meta actual. Meta total del plan:"
                    )}{" "}
                    <Text style={styles.snapshotHintStrong}>{formatCurrency(planProgress.overallTargetBalance)}</Text>
                  </Text>

                  {planProgress.periods.map((period) => {
                    const checkpointGap = currentBalance - period.data.targetBalance;
                    return (
                      <View key={period.key} style={styles.checkpointCard}>
                        <View style={styles.checkpointHeader}>
                          <Text style={styles.checkpointTitle}>{period.title}</Text>
                          {period.data.targetDate ? (
                            <Text style={styles.checkpointDate}>
                              {t(language, "By", "Para")} {period.data.targetDate}
                            </Text>
                          ) : null}
                        </View>

                        <Text style={[styles.checkpointValue, checkpointGap >= 0 ? styles.metricTonePositive : styles.metricToneWarning]}>
                          {checkpointGap >= 0 ? t(language, "Ahead by", "Adelantado por") : t(language, "Remaining", "Falta")}{" "}
                          {formatCurrency(Math.abs(checkpointGap))}
                        </Text>

                        <View style={styles.checkpointMeta}>
                          <Text style={styles.checkpointMetaLine}>
                            {t(language, "Checkpoint start", "Inicio checkpoint")}{" "}
                            <Text style={styles.snapshotHintStrong}>{formatCurrency(period.data.startBalance)}</Text>
                          </Text>
                          <Text style={styles.checkpointMetaLine}>
                            {t(language, "Balance now", "Balance actual")}{" "}
                            <Text style={styles.snapshotHintStrong}>{formatCurrency(currentBalance)}</Text>
                          </Text>
                          <Text style={styles.checkpointMetaLine}>
                            {t(language, "Checkpoint target", "Meta checkpoint")}{" "}
                            <Text style={styles.metricTonePositive}>{formatCurrency(period.data.targetBalance)}</Text>
                          </Text>
                          <Text style={styles.checkpointMetaLine}>
                            {t(language, "Required move", "Movimiento requerido")}{" "}
                            <Text style={styles.snapshotHintStrong}>{formatCurrency(period.data.goalAmount)}</Text> ·{" "}
                            {t(language, "Moved", "Movido")}{" "}
                            <Text style={period.data.actualAmount >= 0 ? styles.metricTonePositive : styles.metricToneNegative}>
                              {formatSigned(period.data.actualAmount)}
                            </Text>
                          </Text>
                        </View>

                        <View style={styles.progressTrack}>
                          <View
                            style={[
                              styles.progressFillPlan,
                              { width: `${Math.max(0, Math.min(100, period.data.progress * 100))}%` },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </>
      )}
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) => {
  const isDark = colors.background === DARK_COLORS.background;
  const widgetTitleBase = {
    color: isDark ? "#94F1E4" : colors.primary,
    fontSize: 14,
    fontWeight: "800" as const,
    letterSpacing: 0.35,
    textShadowColor: isDark ? "rgba(46, 144, 255, 0.18)" : "rgba(15, 157, 122, 0.12)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: isDark ? 12 : 6,
  };

  return StyleSheet.create({
    topInsightRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "stretch",
    },
    topInsightRowStack: {
      flexDirection: "column",
    },
    panelCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
    },
    coachBannerCard: {
      position: "relative",
      overflow: "hidden",
      borderColor: isDark ? "#24517E" : "#D5E8F5",
      backgroundColor: isDark ? "#091732" : "#F8FBFF",
      marginBottom: 10,
      paddingTop: 12,
      paddingBottom: 12,
    },
    coachBannerCardCompact: {
      paddingTop: 11,
      paddingBottom: 11,
    },
    coachBrainA: {
      position: "absolute",
      top: -28,
      right: -8,
      width: 148,
      height: 148,
      opacity: isDark ? 0.12 : 0.08,
      transform: [{ rotate: "8deg" }],
    },
    coachBrainB: {
      position: "absolute",
      bottom: -36,
      left: 56,
      width: 132,
      height: 132,
      opacity: isDark ? 0.08 : 0.05,
      transform: [{ scaleX: -1 }, { rotate: "-10deg" }],
    },
    coachAccentRail: {
      position: "absolute",
      left: 0,
      top: 16,
      bottom: 16,
      width: 3,
      borderRadius: 999,
      backgroundColor: isDark ? "#63D6FF" : "#2E6BFF",
    },
    focusPanel: {
      flex: 1,
      justifyContent: "space-between",
      gap: 8,
    },
    coachPanel: {
      borderColor: isDark ? "#21456B" : "#D8E8F2",
      backgroundColor: isDark ? "#0C1737" : "#F7FBFF",
      gap: 10,
    },
    coachPanelCompact: {
      padding: 12,
      gap: 8,
    },
    systemPanel: {
      flex: 1.08,
      gap: 10,
    },
    systemPanelCompact: {
      padding: 12,
      gap: 8,
    },
    systemPanelStandalone: {
      marginBottom: 0,
    },
    heroEyebrow: {
      color: colors.textMuted,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    coachHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    coachHeaderMeta: {
      flex: 1,
      gap: 4,
    },
    coachBannerHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
    },
    coachTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "900",
      lineHeight: 23,
    },
    coachMessageRow: {
      marginTop: 7,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      paddingRight: 2,
    },
    coachQuoteMark: {
      color: isDark ? "#7CF7CF" : colors.primary,
      fontSize: 32,
      lineHeight: 32,
      fontWeight: "900",
      marginTop: -2,
    },
    coachBody: {
      flex: 1,
      color: isDark ? "#DCEAFF" : colors.textPrimary,
      fontSize: 13,
      lineHeight: 20,
      fontWeight: "600",
    },
    coachPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? "#2B6C65" : "#B8DCD0",
      backgroundColor: isDark ? "#0F2D2A" : "#E7F8F1",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    coachPillText: {
      color: isDark ? "#B8F4E2" : colors.primary,
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },
    systemHeaderRow: {
      gap: 4,
    },
    systemHeaderRowCompact: {
      gap: 2,
    },
    systemHeaderMeta: {
      gap: 4,
    },
    systemHeaderHint: {
      color: colors.textMuted,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: "uppercase",
      fontWeight: "700",
    },
    systemTitle: {
      ...widgetTitleBase,
    },
    systemDate: {
      color: colors.textMuted,
      fontSize: 11,
    },
    systemWorkspace: {
      flexDirection: "row",
      gap: 10,
      alignItems: "stretch",
    },
    systemWorkspaceStack: {
      flexDirection: "column",
    },
    systemWorkspaceCompact: {
      gap: 8,
    },
    systemStepsColumn: {
      flex: 1.45,
      gap: 10,
    },
    systemStepsColumnCompact: {
      gap: 8,
    },
    systemRulesColumn: {
      flex: 0.78,
      gap: 10,
    },
    systemRulesColumnCompact: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: 8,
    },
    systemChecklistList: {
      gap: 8,
    },
    systemChecklistItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    systemChecklistItemCompact: {
      paddingHorizontal: 10,
      paddingVertical: 9,
      gap: 8,
    },
    systemCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    systemCheckboxDone: {
      borderColor: colors.success,
      backgroundColor: colors.success,
    },
    systemCheckboxMark: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: "900",
    },
    systemSectionCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      gap: 6,
    },
    systemSectionCardCompact: {
      flex: 1,
      padding: 9,
      gap: 5,
    },
    systemLabel: {
      color: colors.success,
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1.1,
    },
    systemLabelDont: {
      color: colors.danger,
      fontSize: 10,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1.1,
    },
    systemBulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
    },
    systemBullet: {
      width: 7,
      height: 7,
      borderRadius: 999,
      marginTop: 5,
    },
    systemBulletDo: {
      backgroundColor: colors.success,
    },
    systemBulletDont: {
      backgroundColor: colors.danger,
    },
    systemItem: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: "600",
    },
    systemItemDone: {
      textDecorationLine: "line-through",
      color: colors.textMuted,
    },
    systemHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    systemLink: {
      color: colors.primary,
      fontWeight: "800",
    },
    systemJournalButton: {
      alignSelf: "flex-start",
      borderRadius: 14,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 11,
      marginTop: 2,
    },
    systemJournalButtonCompact: {
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    systemJournalButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: "800",
    },
    summaryRow: {
      flexDirection: "row",
      gap: 8,
      alignItems: "stretch",
      marginTop: 10,
    },
    weeklyCard: {
      flex: 1,
      gap: 4,
    },
    summaryLabel: {
      ...widgetTitleBase,
    },
    summaryValue: {
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: "800",
    },
    summaryHint: {
      color: colors.textMuted,
      fontSize: 12,
    },
    weeklyRow: {
      marginTop: 6,
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 6,
    },
    weekCell: {
      width: "15%",
      minWidth: 48,
      height: 58,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingVertical: 5,
      paddingHorizontal: 4,
      gap: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    weekCellWin: {
      borderColor: colors.success,
      backgroundColor: colors.successSoft,
    },
    weekCellLoss: {
      borderColor: colors.info,
      backgroundColor: colors.infoSoft,
    },
    weekCellFlat: {
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    weekCellLabel: {
      color: colors.textMuted,
      fontSize: 8,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      fontWeight: "700",
    },
    weekCellValue: {
      color: colors.textPrimary,
      fontSize: 10,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
      textAlign: "center",
    },
    progressRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 10,
      alignItems: "flex-start",
    },
    progressRowStack: {
      flexDirection: "column",
    },
    progressColumn: {
      flex: 1,
      gap: 12,
    },
    progressColumnFull: {
      width: "100%",
    },
    progressCard: {
      flex: 1,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 12,
    },
    progressCardFull: {
      width: "100%",
    },
    progressTitle: {
      ...widgetTitleBase,
    },
    snapshotCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10,
    },
    planSnapshotCard: {
      alignItems: "center",
    },
    snapshotMain: {
      flex: 1,
      gap: 4,
    },
    snapshotEyebrow: {
      color: colors.textMuted,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 2.2,
      fontWeight: "700",
    },
    snapshotValue: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: "800",
    },
    snapshotHint: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    snapshotHintStrong: {
      color: colors.textPrimary,
      fontWeight: "700",
    },
    snapshotBadge: {
      minWidth: 128,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 4,
    },
    snapshotBadgeLabel: {
      color: colors.textMuted,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 1.4,
      fontWeight: "700",
    },
    snapshotBadgeValue: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "800",
    },
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    metricCard: {
      width: "48%",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      gap: 5,
    },
    metricLabel: {
      color: colors.textMuted,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 1.4,
      fontWeight: "700",
    },
    metricValue: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "800",
    },
    metricSublabel: {
      color: colors.textMuted,
      fontSize: 10,
      lineHeight: 14,
    },
    metricTonePositive: {
      color: colors.success,
    },
    metricToneNegative: {
      color: colors.danger,
    },
    metricToneInfo: {
      color: "#5BD3FF",
    },
    metricToneWarning: {
      color: "#F6C768",
    },
    metricToneNeutral: {
      color: colors.textPrimary,
    },
    highWaterCard: {
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 10,
    },
    highWaterHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10,
    },
    highWaterMeta: {
      flex: 1,
      gap: 4,
    },
    highWaterValue: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "800",
    },
    highWaterStatus: {
      alignItems: "flex-end",
      gap: 4,
    },
    highWaterStatusValue: {
      fontSize: 15,
      fontWeight: "800",
    },
    progressTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: colors.success,
    },
    progressFillPlan: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: colors.info,
    },
    progressNote: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    planPhaseLabel: {
      color: colors.textMuted,
      fontSize: 11,
    },
    planPhaseValue: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "800",
      lineHeight: 24,
    },
    deadlinePill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    deadlineText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    checkpointCard: {
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 8,
    },
    checkpointHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 8,
    },
    checkpointTitle: {
      color: colors.textMuted,
      fontSize: 12,
    },
    checkpointDate: {
      color: colors.textMuted,
      fontSize: 10,
    },
    checkpointValue: {
      fontSize: 18,
      fontWeight: "800",
    },
    checkpointMeta: {
      gap: 3,
    },
    checkpointMetaLine: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    daySummaryCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 10,
    },
    daySummaryHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    daySummaryEyebrow: {
      color: colors.textMuted,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      fontWeight: "700",
    },
    daySummaryTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    daySummaryNav: {
      flexDirection: "row",
      gap: 8,
    },
    dayNavButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
    },
    dayNavDisabled: {
      opacity: 0.4,
    },
    dayNavText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700",
    },
    daySummaryHint: {
      color: colors.textMuted,
      fontSize: 12,
    },
    daySummaryRow: {
      flexDirection: "row",
      gap: 10,
    },
    daySummaryNote: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      gap: 6,
    },
    daySummaryTrades: {
      flexDirection: "row",
      gap: 10,
    },
    daySummaryTradeCard: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      gap: 6,
    },
    daySummaryLabel: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1.1,
    },
    daySummaryBody: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
    },
  });
};
