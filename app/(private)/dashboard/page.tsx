// app/(private)/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { useAuth } from "@/context/AuthContext";
import { getGrowthPlanSupabaseByAccount, type GrowthPlan } from "@/lib/growthPlanSupabase";
import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import { upsertDailySnapshot } from "@/lib/snapshotSupabase";

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

function getPlanStartDateStr(plan: unknown): string | null {
  const p: any = plan ?? null;
  if (!p) return null;

  return (
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
  // Treat Sunday as a trading day (futures); only Saturdays are non-trading weekends.
  const day = d.getDay();
  return day === 6;
}

function isTradingDay(dateStr: string, holidaySet: Set<string>): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return !isWeekend(d) && !holidaySet.has(dateStr);
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
    date: toYMD(getNthWeekdayOfMonth(year, 9, 1, 2)),
    label: label("Columbus / Indigenous Peoples' Day", "Día de Colón / Pueblos Indígenas"),
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

  const allTradingDays: string[] = [];
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);

  for (
    let d = new Date(jan1);
    d <= dec31;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const ds = formatDateYYYYMMDD(d);
    if (isTradingDay(ds, holidaySet)) allTradingDays.push(ds);
  }

  const pastTradingDays = allTradingDays.filter((d) => d < todayStrLocal);
  const remainingTradingDays = allTradingDays.filter((d) => d >= todayStrLocal);

  const tradedDaysSoFar = pastTradingDays.filter((d) => tradedDatesSet.has(d));
  const missedDaysSoFar = pastTradingDays.filter((d) => !tradedDatesSet.has(d));

  return {
    totalTradingDays: allTradingDays.length,
    remainingTradingDays: remainingTradingDays.length,
    tradedDays: tradedDaysSoFar.length,
    missedDays: missedDaysSoFar.length,
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
          if (valid.length > 0) setActiveWidgets(valid);
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
    const targetLocal = (plan as any)?.targetBalance ?? 0;

    const totalPnlLocal = filteredEntries.reduce((sum, e) => {
      const pnlRaw = (e as any).pnl;
      const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
      return sum + pnl;
    }, 0);

    // ✅ Current account balance = starting balance + trading P&L + net cashflows (deposits/withdrawals)
    const currentBalanceLocal = plan ? startingLocal + totalPnlLocal + (cashflowNet ?? 0) : startingLocal;

    const progressPctLocal =
      plan && targetLocal > startingLocal
        ? ((currentBalanceLocal - startingLocal) / (targetLocal - startingLocal)) * 100
        : 0;

    const clampedProgressLocal = Math.max(0, Math.min(Number.isFinite(progressPctLocal) ? progressPctLocal : 0, 150));

    return {
      starting: startingLocal,
      target: targetLocal,
      currentBalance: currentBalanceLocal,
      progressPct: progressPctLocal,
      clampedProgress: clampedProgressLocal,
    };
  }, [plan, filteredEntries, cashflowNet]);

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
    router.push(`/journal/${dateStr}`);
  };

  const layoutStorageKey =
    user && (user as any).uid ? `tjpro_dashboard_layout_${(user as any).uid}` : "tjpro_dashboard_layout_default";

  // ===== Render widgets =====
  const renderItem = (id: WidgetId) => {
    if (id === "progress") {
      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">
            {L("Account Progress", "Progreso de cuenta")}
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
              <Link href="/growth-plan" className="text-emerald-400 underline">
                {L("Create your plan now.", "Crea tu plan ahora.")}
              </Link>
            </p>
          )}
        </>
      );
    }

    if (id === "streak") {
      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">
            {L("Green Streak & Performance", "Racha verde y rendimiento")}
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
              <p className="text-slate-400 text-[14px] font-medium">
                {L("Today's Checklist", "Checklist de hoy")}
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
          <p className="text-slate-400 text-[14px] font-medium">
            {L("Daily Target (Today)", "Meta diaria (hoy)")}
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
      const { totalTradingDays, remainingTradingDays, tradedDays, missedDays } = tradingStats;
      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">
            {L("Trading Days", "Días de trading")} – {new Date().getFullYear()}
          </p>
          <div className="mt-3 space-y-2 text-[14px] text-slate-300">
            <div className="flex items-center justify-between">
              <span>{L("Total trading days", "Total de días de trading")}</span>
              <span className="font-semibold">{totalTradingDays}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{L("Days traded", "Días operados")}</span>
              <span className="font-semibold text-emerald-300">{tradedDays}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{L("Days not traded (so far)", "Días sin operar (hasta ahora)")}</span>
              <span className="font-semibold text-sky-300">{missedDays}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{L("Trading days remaining", "Días de trading restantes")}</span>
              <span className="font-semibold text-emerald-400">{remainingTradingDays}</span>
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
          <p className="text-slate-400 text-[14px] font-medium">
            {L("Economic News Calendar", "Calendario de noticias económicas")}
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
      return (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-slate-400">{L("P&L Calendar", "Calendario P&L")}</p>
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

                  return (
                    <div
                      key={dow}
                      onClick={() => hasDate && onDayClick(cell.dateStr)}
                      title={cell.holiday ? cell.holiday.label : undefined}
                      className={`${bg} ${isTodayRing} border rounded-2xl px-2 py-2 min-h-24 flex flex-col items-start justify-between hover:scale-[1.02] hover:shadow-lg transition ${
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
                          <p className="text-[11px] mt-1 opacity-85">{L("Open journal ↗", "Abrir journal ↗")}</p>
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
        </div>
      );
    }

    if (id === "weekly") {
      return (
        <>
          <h3 className="text-xl font-semibold text-slate-50 mb-1">
            {L("Weekly Summary", "Resumen semanal")}
          </h3>
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
