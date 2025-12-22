// app/(private)/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { useAuth } from "@/context/AuthContext";

// ✅ Growth plan from Supabase (and type from same file to avoid TS mismatch)
import { getGrowthPlanSupabase, type GrowthPlan } from "@/lib/growthPlanSupabase";

// ✅ Journal types + supabase loader
import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";

// ✅ Snapshot Supabase (NOTE: your file is snapshotSupabase.ts, not snapshotsSupabase.ts)
import { upsertDailySnapshot } from "@/lib/snapshotSupabase";

// ✅ Checklist Supabase
import { getDailyChecklist, type ChecklistItem } from "@/lib/checklistSupabase";

import TopNav from "@/app/components/TopNav";
import DashboardGrid, { type GridItemId } from "@/app/components/DashboardGrid";

// Grid without SSR
const DynamicDashboardGrid = dynamic(() => Promise.resolve(DashboardGrid), {
  ssr: false,
});

/* =========================
   Utils
========================= */
function formatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ISO week of year (Week 1..52/53)
function getWeekOfYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 1 (Mon) - 7 (Sun)
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // go to Thursday of this week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
}

type CalendarCell = {
  dateStr: string | null;
  dayNumber: number | null;
  entry?: JournalEntry;
  isToday: boolean;
  isCurrentMonth: boolean;
};

type WeekSummary = {
  index: number;
  pnl: number;
  daysWithTrades: number;
};

// Widget IDs = same as Grid IDs
type WidgetId = GridItemId;

const ALL_WIDGETS: { id: WidgetId; label: string }[] = [
  { id: "progress", label: "Account Progress" },
  { id: "daily-target", label: "Daily Target" },
  { id: "calendar", label: "P&L Calendar" },
  { id: "weekly", label: "Weekly Summary" },
  { id: "streak", label: "Green Streak" },
  { id: "mindset-ratio", label: "Mindset Ratio" },
  { id: "actions", label: "Checklist" },
  { id: "trading-days", label: "Trading Days (Year)" },
  { id: "economic-news", label: "Economic News" },
];

// ===== Trading calendar / holidays =====
const TRADING_HOLIDAYS: string[] = [
  // "2025-01-01",
  // "2025-07-04",
];

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function isHoliday(dateStr: string): boolean {
  return TRADING_HOLIDAYS.includes(dateStr);
}

function isTradingDay(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return !isWeekend(d) && !isHoliday(dateStr);
}

function buildMonthCalendar(
  entries: JournalEntry[],
  baseDate: Date
): { cells: CalendarCell[]; weeks: WeekSummary[]; monthLabel: string } {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay(); // 0 = Sun

  const totalCells = 42; // 6 rows * 7 days
  const todayStr = formatDateYYYYMMDD(new Date());

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

    if (dayNumber !== null) {
      const d = new Date(year, month, dayNumber);
      dateStr = formatDateYYYYMMDD(d);
      isCurrentMonth = true;
      entry = entryMap.get(dateStr);
      isToday = dateStr === todayStr;

      if (entry) {
        const rawPnl = (entry as any).pnl;
        const pnl = typeof rawPnl === "number" ? rawPnl : Number(rawPnl) || 0;
        weeks[weekIndex].pnl += pnl;
        weeks[weekIndex].daysWithTrades += 1;
      }
    }

    cells.push({ dateStr, dayNumber, entry, isToday, isCurrentMonth });
  }

  const monthLabel = baseDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { cells, weeks, monthLabel };
}

function calcGreenStreak(entries: JournalEntry[]): number {
  const sorted = [...entries].sort((a, b) => String((a as any).date).localeCompare(String((b as any).date)));
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

// ===== Stats de días de trading del año =====
function calcTradingDayStats(entries: JournalEntry[]) {
  const today = new Date();
  const year = today.getFullYear();
  const todayStr = formatDateYYYYMMDD(today);

  const tradedDatesSet = new Set(
    entries
      .filter((e) => new Date(String((e as any).date)).getFullYear() === year)
      .map((e) => String((e as any).date).slice(0, 10))
  );

  const allTradingDays: string[] = [];
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);

  for (let d = new Date(jan1); d <= dec31; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const ds = formatDateYYYYMMDD(d);
    if (isTradingDay(ds)) allTradingDays.push(ds);
  }

  const pastTradingDays = allTradingDays.filter((d) => d < todayStr);
  const remainingTradingDays = allTradingDays.filter((d) => d >= todayStr);

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
   Dashboard
========================= */
export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Core state
  const [plan, setPlan] = useState<GrowthPlan | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [viewDate, setViewDate] = useState<Date | null>(new Date());

  const [calendarCells, setCalendarCells] = useState<CalendarCell[]>([]);
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [monthLabel, setMonthLabel] = useState("");

  // Widget library state
  const [activeWidgets, setActiveWidgets] = useState<WidgetId[]>([
    "progress",
    "daily-target",
    "calendar",
    "weekly",
    "streak",
    "mindset-ratio",
    "actions",
    "trading-days",
    "economic-news",
  ]);

  const [ecoNewsCountry, setEcoNewsCountry] = useState("US");
  const [widgetsLoaded, setWidgetsLoaded] = useState(false);

  // ✅ Checklist state (today)
  const [todayChecklist, setTodayChecklist] = useState<ChecklistItem[]>([]);
  const [todayChecklistNotes, setTodayChecklistNotes] = useState<string | null>(null);

  // Freeze today + current week number
  const [todayStr] = useState(() => formatDateYYYYMMDD(new Date()));
  const [currentWeekOfYear] = useState(() => getWeekOfYear(new Date()));

  // ===== Persistencia de widgets por usuario =====
  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined") return;

    const storageKey =
      (user as any).uid ? `tjpro_dashboard_widgets_${(user as any).uid}` : "tjpro_dashboard_widgets_default";

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
      (user as any).uid ? `tjpro_dashboard_widgets_${(user as any).uid}` : "tjpro_dashboard_widgets_default";

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

  // ✅ Load growth plan + journal + today checklist (Supabase)
  useEffect(() => {
    if (loading || !user) return;

    const userId = (user as any)?.uid || (user as any)?.id || "";
    if (!userId) {
      setPlan(null);
      setEntries([]);
      setTodayChecklist([]);
      setTodayChecklistNotes(null);
      return;
    }

    let cancelled = false;

    const loadAll = async () => {
      try {
        // ✅ Growth plan from Supabase (NO args)
        const dbPlan = await getGrowthPlanSupabase();
        if (!cancelled) setPlan(dbPlan ?? null);

        // ✅ Journal entries from Supabase
        const dbEntries = await getAllJournalEntries(userId);
        if (!cancelled) setEntries(dbEntries);

        // ✅ Today checklist from Supabase
        const checklistRow = await getDailyChecklist(userId, todayStr);
        if (!cancelled) {
          setTodayChecklist(checklistRow?.items ?? []);
          setTodayChecklistNotes(checklistRow?.notes ?? null);
        }
      } catch (err) {
        console.error("[dashboard] error loading data:", err);
        if (!cancelled) {
          setPlan(null);
          setEntries([]);
          setTodayChecklist([]);
          setTodayChecklistNotes(null);
        }
      }
    };

    loadAll();

    return () => {
      cancelled = true;
    };
  }, [loading, user, todayStr]);

  // Rebuild calendar when entries or month changes
  useEffect(() => {
    if (!viewDate) return;
    const { cells, weeks, monthLabel } = buildMonthCalendar(entries, viewDate);
    setCalendarCells(cells);
    setWeeks(weeks);
    setMonthLabel(monthLabel);
  }, [entries, viewDate]);

  // Week number per calendar row (based on Monday)
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
        const dow = cellDate.getDay(); // 0=Sun..6=Sat

        if (fallback === null) fallback = getWeekOfYear(cellDate);

        if (dow === 1) {
          weekNo = getWeekOfYear(cellDate);
          break;
        }
      }

      rows.push(weekNo ?? fallback);
    }
    return rows;
  }, [calendarCells]);

  // Trading day stats (year)
  const tradingStats = useMemo(() => calcTradingDayStats(entries), [entries]);

  // Filter entries from plan start date (createdAt)
  const filteredEntries = useMemo(() => {
    if (!plan || !(plan as any).createdAt) return entries;

    const planDateObj = new Date((plan as any).createdAt as any);
    if (Number.isNaN(planDateObj.getTime())) return entries;

    const planStartStr = formatDateYYYYMMDD(planDateObj);

    const filtered = entries.filter((e) => {
      const raw = (e as any).date;
      if (!raw) return false;
      const entryStr = String(raw).slice(0, 10);
      return entryStr >= planStartStr;
    });

    return filtered.length > 0 ? filtered : entries;
  }, [plan, entries]);

  // Session date = last journal day
  const sessionDateStr = useMemo(() => {
    if (!filteredEntries.length) return todayStr;

    const dated = filteredEntries.filter((e) => !!(e as any).date);
    if (!dated.length) return todayStr;

    const sorted = [...dated].sort((a, b) => String((a as any).date).localeCompare(String((b as any).date)));
    const last = sorted[sorted.length - 1];

    try {
      const d = new Date(String((last as any).date));
      if (!Number.isNaN(d.getTime())) return formatDateYYYYMMDD(d);
    } catch {}
    return String((last as any).date).slice(0, 10);
  }, [filteredEntries, todayStr]);

  // Daily Target calculations (for sessionDateStr)
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
      };
    }

    const dailyTargetPct = getDailyTargetPct(plan);
    const starting = (plan as any).startingBalance ?? 0;

    const sumUpTo = (dateStr: string) =>
      filteredEntries
        .filter((e) => String((e as any).date).slice(0, 10) < dateStr)
        .reduce((s, e) => {
          const pnlRaw = (e as any).pnl;
          const entryPnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
          return s + entryPnl;
        }, 0);

    const startOfSessionBalance = starting + sumUpTo(sessionDateStr);

    const expectedSessionUSD =
      dailyTargetPct !== 0 ? startOfSessionBalance * (dailyTargetPct / 100) : 0;

    const sessionEntry =
      filteredEntries.find((e) => String((e as any).date).slice(0, 10) === sessionDateStr) ?? null;

    const actualSessionUSD = sessionEntry
      ? (() => {
          const pnlRaw = (sessionEntry as any).pnl;
          return typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
        })()
      : 0;

    const diffSessionVsGoal = actualSessionUSD - expectedSessionUSD;

    const goalMet = expectedSessionUSD > 0 && actualSessionUSD >= expectedSessionUSD;

    const progressToGoal =
      expectedSessionUSD > 0
        ? Math.min(150, Math.max(0, (actualSessionUSD / expectedSessionUSD) * 100))
        : 0;

    return {
      dailyTargetPct,
      startOfSessionBalance,
      expectedSessionUSD,
      actualSessionUSD,
      diffSessionVsGoal,
      goalMet,
      progressToGoal,
    };
  }, [plan, filteredEntries, sessionDateStr]);
  // ✅ Save snapshot for that journal day (Supabase)
  useEffect(() => {
    const userId = (user as any)?.uid || (user as any)?.id || "";
    if (!userId) return;

    if (!plan) return;
    if (dailyCalcs.dailyTargetPct === 0) return;

    let cancelled = false;

    const save = async () => {
      try {
        await upsertDailySnapshot({
          user_id: userId,
          date: sessionDateStr,
          start_of_day_balance: dailyCalcs.startOfSessionBalance,
          expected_usd: dailyCalcs.expectedSessionUSD,
          realized_usd: dailyCalcs.actualSessionUSD,
          delta_usd: dailyCalcs.diffSessionVsGoal,
          goal_met: dailyCalcs.goalMet,
        });
      } catch (e) {
        if (!cancelled) console.warn("[snapshotSupabase] upsert error:", e);
      }
    };

    save();

    return () => {
      cancelled = true;
    };
  }, [user, plan, sessionDateStr, dailyCalcs]);

  // Derived metrics
  const name = (user as any)?.name || "Trader";

  const { starting, target, currentBalance, progressPct, clampedProgress } = useMemo(() => {
    const startingLocal = (plan as any)?.startingBalance ?? 0;
    const targetLocal = (plan as any)?.targetBalance ?? 0;

    const totalPnlLocal = filteredEntries.reduce((sum, e) => {
      const pnlRaw = (e as any).pnl;
      const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
      return sum + pnl;
    }, 0);

    const currentBalanceLocal =
      plan && filteredEntries.length > 0 ? startingLocal + totalPnlLocal : startingLocal;

    const progressPctLocal =
      plan && targetLocal > startingLocal
        ? ((currentBalanceLocal - startingLocal) / (targetLocal - startingLocal)) * 100
        : 0;

    const clampedProgressLocal = Math.max(
      0,
      Math.min(Number.isFinite(progressPctLocal) ? progressPctLocal : 0, 150)
    );

    return {
      starting: startingLocal,
      target: targetLocal,
      currentBalance: currentBalanceLocal,
      progressPct: progressPctLocal,
      clampedProgress: clampedProgressLocal,
    };
  }, [plan, filteredEntries]);

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

  // Day click → journal page
  const onDayClick = (dateStr: string | null) => {
    if (!dateStr) return;
    router.push(`/journal/${dateStr}`);
  };

  // Layout storage key (per user)
  const layoutStorageKey =
    user && (user as any).uid
      ? `tjpro_dashboard_layout_${(user as any).uid}`
      : "tjpro_dashboard_layout_default";

  // Checklist rendering helpers (no UI changes, only data source)
  const defaultChecklist: string[] = [
    "Respect your max daily loss limit.",
    "Take only planned setups from your playbook.",
    "Log your session inside 3 minutes.",
  ];

  const normalizedChecklist = useMemo(() => {
    const items = Array.isArray(todayChecklist) ? todayChecklist : [];
    if (!items.length) return [];

    return items
      .map((it) => {
        if (typeof it === "string") return { text: it, done: false };
        return { text: it?.text ?? "", done: !!it?.done };
      })
      .filter((x) => x.text.trim().length > 0);
  }, [todayChecklist]);

  // ===== Render widgets =====
  const renderItem = (id: WidgetId) => {
    if (id === "progress") {
      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">Account Progress</p>

          {plan ? (
            <>
              <p className="text-[16px] text-slate-300 mt-2">
                Start:{" "}
                <span className="text-slate-50 font-semibold">${starting.toFixed(2)}</span> · Target:{" "}
                <span className="text-emerald-400 font-semibold">${target.toFixed(2)}</span>
              </p>

              <p className="text-[16px] text-slate-300 mt-1">
                Current balance:{" "}
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
                  ? "You are at 0% of this plan. Let the first sessions set the tone."
                  : clampedProgress < 100
                  ? `You have completed ${progressPct.toFixed(
                      1
                    )}% of your target based on data since this plan started.`
                  : `You have exceeded this target. Time to define the next structured goal.`}
              </p>
            </>
          ) : (
            <p className="text-[14px] text-slate-500 mt-2">
              No growth plan set yet.{" "}
              <Link href="/growth-plan" className="text-emerald-400 underline">
                Create your plan now.
              </Link>
            </p>
          )}
        </>
      );
    }

    if (id === "streak") {
      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">Green Streak & Performance</p>

          <p className="text-5xl font-semibold text-emerald-400 mt-1">
            {greenStreak}{" "}
            <span className="text-[16px] text-slate-400 font-normal">days</span>
          </p>

          <p className="text-[14px] text-slate-400 mt-2">
            Green days:{" "}
            <span className="text-emerald-300 font-semibold">{greenDays}</span> · Blue days:{" "}
            <span className="text-sky-300 font-semibold">{blueDays}</span>
          </p>

          <p className="text-[14px] text-slate-500 mt-2">
            The goal is consistency: protect your streak by respecting your max loss, not by forcing trades.
          </p>
        </>
      );
    }

    if (id === "actions") {
      const itemsToRender = normalizedChecklist.length ? normalizedChecklist : null;

      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">Today&apos;s Checklist</p>

          {itemsToRender ? (
            <ul className="mt-2 space-y-1 text-[14px] text-slate-300">
              {itemsToRender.slice(0, 8).map((it, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className={it.done ? "text-emerald-400" : "text-slate-500"}>
                    {it.done ? "✔" : "•"}
                  </span>
                  <span className={it.done ? "opacity-90 line-through" : ""}>{it.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-2 space-y-1 text-[14px] text-slate-300">
              {defaultChecklist.map((t, idx) => (
                <li key={idx}>✔ {t}</li>
              ))}
            </ul>
          )}

          {todayChecklistNotes ? (
            <p className="text-[12px] text-slate-500 mt-3 leading-snug">
              Notes: <span className="text-slate-300">{todayChecklistNotes}</span>
            </p>
          ) : null}

          <Link
            href={`/journal/${todayStr}`}
            className="inline-flex mt-4 px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-[14px] font-semibold hover:bg-emerald-300 transition"
          >
            Open today&apos;s journal
          </Link>
        </>
      );
    }

    if (id === "daily-target") {
      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">Daily Target (Last Journal Day)</p>

          <div className="mt-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
            {plan && dailyCalcs.dailyTargetPct !== 0 ? (
              <>
                <p className="text-[13px] text-emerald-300 font-medium">
                  Goal: {dailyCalcs.dailyTargetPct.toFixed(2)}% of start-of-day balance
                </p>

                <p className="text-[12px] text-slate-400 mt-1">
                  Session date: <span className="text-slate-100 font-medium">{sessionDateStr}</span>
                </p>

                <p className="text-[14px] text-slate-300 mt-1">
                  Start-of-day:{" "}
                  <span className="font-semibold text-slate-50">
                    ${dailyCalcs.startOfSessionBalance.toFixed(2)}
                  </span>
                </p>

                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[12px] text-slate-400">Expected (goal)</p>
                    <p className="text-emerald-300 font-semibold">${dailyCalcs.expectedSessionUSD.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-slate-400">Realized this day</p>
                    <p
                      className={
                        dailyCalcs.actualSessionUSD >= 0
                          ? "text-emerald-300 font-semibold"
                          : "text-sky-300 font-semibold"
                      }
                    >
                      {dailyCalcs.actualSessionUSD >= 0 ? "+" : "-"}$
                      {Math.abs(dailyCalcs.actualSessionUSD).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] text-slate-400">Delta vs goal</p>
                    <p
                      className={
                        dailyCalcs.diffSessionVsGoal >= 0
                          ? "text-emerald-400 font-semibold"
                          : "text-sky-400 font-semibold"
                      }
                    >
                      {dailyCalcs.diffSessionVsGoal >= 0 ? "+" : "-"}$
                      {Math.abs(dailyCalcs.diffSessionVsGoal).toFixed(2)}
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
                    {dailyCalcs.progressToGoal.toFixed(1)}% of that day&apos;s goal
                  </p>
                </div>

                <div className="mt-3 text-[13px]">
                  {dailyCalcs.goalMet ? (
                    <span className="px-2 py-1 rounded-lg bg-emerald-400 text-slate-950 font-semibold">
                      Goal met ✅
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700">
                      Goal not met ❌
                    </span>
                  )}
                </div>

                <Link
                  href={`/journal/${sessionDateStr}`}
                  className="inline-flex mt-3 px-3 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-[13px] font-semibold hover:bg-emerald-300 transition"
                >
                  Open that journal day
                </Link>
              </>
            ) : (
              <p className="text-[13px] text-slate-400">
                Set a daily % target in your growth plan to enable this widget.
              </p>
            )}
          </div>
        </>
      );
    }

    if (id === "mindset-ratio") {
      const lastN = 30;
      const recent = [...filteredEntries]
        .sort((a, b) => String((b as any).date).localeCompare(String((a as any).date)))
        .slice(0, lastN);

      const aligned = recent.filter((e) => {
        const pnlRaw = (e as any).pnl;
        const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
        return pnl > 0;
      }).length;

      const learning = recent.filter((e) => {
        const pnlRaw = (e as any).pnl;
        const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
        return pnl <= 0;
      }).length;

      const total = recent.length || 1;
      const ratioPct = (aligned / total) * 100;

      const avg = (arr: number[]) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);

      const alignedAvg = avg(
        recent
          .filter((e) => {
            const pnlRaw = (e as any).pnl;
            const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
            return pnl > 0;
          })
          .map((e) => {
            const pnlRaw = (e as any).pnl;
            return typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
          })
      );

      const learningAvg = avg(
        recent
          .filter((e) => {
            const pnlRaw = (e as any).pnl;
            const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
            return pnl <= 0;
          })
          .map((e) => {
            const pnlRaw = (e as any).pnl;
            return typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
          })
      );

      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">Mindset Ratio</p>

          <p className="text-[12px] text-slate-500 mt-1">
            Alignment to your plan over the last {recent.length} sessions.
          </p>

          <div className="mt-4 flex items-end gap-4">
            <div>
              <div className="text-5xl font-semibold text-emerald-400">{ratioPct.toFixed(0)}%</div>
              <div className="text-[12px] text-slate-400 mt-1">Aligned sessions</div>
            </div>

            <div className="flex-1">
              <div className="h-3 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-3 bg-linear-to-r from-emerald-400 via-emerald-300 to-sky-400"
                  style={{ width: `${Math.min(100, Math.max(0, ratioPct))}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-[12px] text-slate-400 mt-2">
                <span>
                  Aligned: <span className="text-emerald-300 font-semibold">{aligned}</span>
                  <span className="ml-2 opacity-80">
                    (avg {alignedAvg >= 0 ? "+" : "-"}${Math.abs(alignedAvg).toFixed(2)})
                  </span>
                </span>

                <span className="text-right">
                  Learning: <span className="text-sky-300 font-semibold">{learning}</span>
                  <span className="ml-2 opacity-80">
                    (avg {learningAvg >= 0 ? "+" : "-"}${Math.abs(learningAvg).toFixed(2)})
                  </span>
                </span>
              </div>
            </div>
          </div>

          <p className="text-[12px] text-slate-500 mt-4 leading-snug">
            Goal: increase alignment without chasing results. Protect your process: respect your max loss and take only
            setups from your playbook.
          </p>
        </>
      );
    }

    if (id === "trading-days") {
      const { totalTradingDays, remainingTradingDays, tradedDays, missedDays } = tradingStats;

      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">Trading Days – {new Date().getFullYear()}</p>

          <div className="mt-3 space-y-2 text-[14px] text-slate-300">
            <div className="flex items-center justify-between">
              <span>Total trading days</span>
              <span className="font-semibold">{totalTradingDays}</span>
            </div>

            <div className="flex items-center justify-between">
              <span>Days traded</span>
              <span className="font-semibold text-emerald-300">{tradedDays}</span>
            </div>

            <div className="flex items-center justify-between">
              <span>Days not traded (so far)</span>
              <span className="font-semibold text-sky-300">{missedDays}</span>
            </div>

            <div className="flex items-center justify-between">
              <span>Trading days remaining</span>
              <span className="font-semibold text-emerald-400">{remainingTradingDays}</span>
            </div>
          </div>

          <p className="text-[12px] text-slate-500 mt-3 leading-snug">
            Weekends and configured holidays are excluded. Use this to align your yearly trading plan with actual screen
            time.
          </p>
        </>
      );
    }

    if (id === "economic-news") {
      const countries = [
        { code: "US", label: "United States" },
        { code: "EU", label: "Eurozone" },
        { code: "UK", label: "United Kingdom" },
        { code: "JP", label: "Japan" },
        { code: "CA", label: "Canada" },
      ];

      const selectedCountry = countries.find((c) => c.code === ecoNewsCountry);

      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">Economic News Calendar</p>

          <p className="text-[12px] text-slate-500 mt-1">Choose a country to focus your macro events.</p>

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

          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-[13px] text-slate-300">
            <p className="mb-1">
              Here you can display today&apos;s and upcoming events for{" "}
              <span className="text-emerald-300 font-semibold">{selectedCountry?.label ?? ecoNewsCountry}</span>.
            </p>
            <p className="text-[12px] text-slate-500">
              Connect this widget to your preferred economic calendar API (Forex Factory, Trading Economics, etc.) in
              your backend and render the events list here (time, impact, event name).
            </p>
          </div>
        </>
      );
    }

    if (id === "calendar") {
      return (
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-slate-400">P&amp;L Calendar</p>
              <h2 className="text-2xl font-semibold text-slate-50">{monthLabel}</h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={goPrevMonth}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs hover:bg-slate-700"
              >
                ← Prev
              </button>
              <button
                onClick={goNextMonth}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs hover:bg-slate-700"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-2 mb-2 text-[12px] text-slate-500">
            <div className="text-left">Week</div>
            <div className="text-center">Mon</div>
            <div className="text-center">Tue</div>
            <div className="text-center">Wed</div>
            <div className="text-center">Thu</div>
            <div className="text-center">Fri</div>
          </div>

          <div className="space-y-2 text-[14px]">
            {Array.from({ length: 6 }).map((_, rowIdx) => (
              <div key={rowIdx} className="grid grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-2">
                <div className="flex items-center pl-1 text-[12px] text-emerald-300 font-semibold">
                  {weekRowNumbers[rowIdx] ? `W${weekRowNumbers[rowIdx]}` : ""}
                </div>

                {[1, 2, 3, 4, 5].map((dow) => {
                  const idx = rowIdx * 7 + dow;
                  const cell = calendarCells[idx];

                  if (!cell) return <div key={dow} className="min-h-24" />;

                  const hasDate = cell.dateStr !== null && cell.dayNumber !== null;
                  const rawPnl = (cell.entry as any)?.pnl ?? 0;
                  const pnl = typeof rawPnl === "number" ? rawPnl : Number(rawPnl) || 0;

                  let bg = "bg-slate-950/90 border-slate-800 text-slate-600";
                  if (hasDate && cell.entry) {
                    if (pnl > 0) bg = "bg-emerald-400/90 border-emerald-300 text-slate-950";
                    else if (pnl < 0) bg = "bg-sky-500/90 border-sky-300 text-slate-950";
                    else bg = "bg-slate-800/90 border-slate-700 text-slate-200";
                  }

                  const isTodayRing = cell.isToday && hasDate ? "ring-2 ring-emerald-400/90" : "";

                  return (
                    <div
                      key={dow}
                      onClick={() => hasDate && onDayClick(cell.dateStr)}
                      className={`${bg} ${isTodayRing} border rounded-2xl px-2 py-2 min-h-24 flex flex-col items-start justify-between hover:scale-[1.02] hover:shadow-lg transition ${
                        hasDate ? "cursor-pointer" : "cursor-default opacity-30"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold">{hasDate ? cell.dayNumber : ""}</span>
                        {cell.entry && (
                          <span className="text-[11px] opacity-80">
                            {pnl > 0 ? "Green" : pnl < 0 ? "Blue" : "Flat"}
                          </span>
                        )}
                      </div>

                      {cell.entry ? (
                        <div className="mt-1">
                          <p className="text-[16px] font-semibold leading-none">
                            {pnl > 0 ? `+$${pnl.toFixed(0)}` : pnl < 0 ? `-$${Math.abs(pnl).toFixed(0)}` : "$0"}
                          </p>
                          <p className="text-[11px] mt-1 opacity-85">Open journal ↗</p>
                        </div>
                      ) : hasDate ? (
                        <p className="mt-auto text-[11px] text-slate-500">Add journal</p>
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
          <h3 className="text-xl font-semibold text-slate-50 mb-1">Weekly Summary</h3>

          <p className="text-[12px] text-emerald-300 mb-3">
            You are currently in week {currentWeekOfYear} of {new Date().getFullYear()}.
          </p>

          {weeks.map((w) => {
            const weekNumber = weekRowNumbers[w.index] ?? w.index + 1;
            const label = `Week ${weekNumber}`;
            const isCurrentWeek = weekNumber === currentWeekOfYear;

            if (w.daysWithTrades === 0 && w.pnl === 0) {
              return (
                <div key={w.index} className="flex items-center justify-between text-[14px] text-slate-600">
                  <span className="text-slate-500">{label}</span>
                  <span>$0 · 0 days</span>
                </div>
              );
            }

            const positive = w.pnl > 0;

            return (
              <div key={w.index} className="flex items-center justify-between text-[14px]">
                <span className={isCurrentWeek ? "text-emerald-300 font-semibold" : "text-emerald-200"}>
                  {label}
                </span>
                <span className={positive ? "text-emerald-400 font-semibold" : "text-sky-400 font-semibold"}>
                  {positive ? "+" : "-"}${Math.abs(w.pnl).toFixed(2)} · {w.daysWithTrades} day
                  {w.daysWithTrades !== 1 ? "s" : ""}
                </span>
              </div>
            );
          })}

          <p className="text-[12px] text-slate-500 mt-3 leading-snug">
            Use weekly stats to zoom out: if a bad week breaks your rules or your -1% tolerance, pause and review
            instead of pushing harder.
          </p>
        </>
      );
    }

    return (
      <p className="text-[14px] text-slate-400">
        Unknown widget: <span className="font-mono">{id}</span>
      </p>
    );
  };

  /* ========== Render Page ========== */
  if (loading || !viewDate) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">Loading your dashboard...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-base text-slate-400">Redirecting to sign in...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-6 md:px-10 py-8">
        <header className="flex flex-col md:flex-row justify-between gap-4 mb-8">
          <div>
            <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">Trading Journal Pro</p>
            <h1 className="text-4xl font-semibold mt-1">Dashboard overview</h1>
            <p className="text-[14px] md:text-[16px] text-slate-400 mt-2 max-w-3xl">
              Welcome back, {name}. Structured like a pro journal, built to compete with any premium platform.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 items-start md:items-end">
            <Link
              href="/growth-plan"
              className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-[14px] font-semibold hover:bg-emerald-300 transition"
            >
              Edit growth plan
            </Link>

            <Link
              href="/growthaccountsimulator"
              className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-[14px] hover:border-emerald-400 hover:text-emerald-300 transition"
            >
              Growth simulator
            </Link>
          </div>
        </header>

        {/* Widget Library / Picker */}
        <section className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-[13px] text-slate-400 mb-2">Customize your dashboard: toggle widgets on/off.</p>

          <div className="flex flex-wrap gap-2">
            {ALL_WIDGETS.map((w) => {
              const isActive = activeWidgets.includes(w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setActiveWidgets((prev) =>
                      prev.includes(w.id) ? prev.filter((x) => x !== w.id) : [...prev, w.id]
                    );
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
