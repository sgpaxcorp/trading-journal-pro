// app/(private)/dashboard/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import { useAuth } from "@/context/AuthContext";
import { getGrowthPlanSupabase, type GrowthPlan } from "@/lib/growthPlanSupabase";
import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";
import { upsertDailySnapshot } from "@/lib/snapshotSupabase";

// IMPORTANT: do NOT import ChecklistItem type from your lib because it may be string/union.
// We only import the function and normalize its output.
import { getDailyChecklist } from "@/lib/checklistSupabase";

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

function getWeekOfYear(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
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

type WidgetId = GridItemId;

const ALL_WIDGETS: { id: WidgetId; label: string }[] = [
  { id: "progress", label: "Account Progress" },
  { id: "daily-target", label: "Daily Target" },
  { id: "calendar", label: "P&L Calendar" },
  { id: "weekly", label: "Weekly Summary" },
  { id: "streak", label: "Green Streak" },
  { id: "actions", label: "Checklist" },
  { id: "trading-days", label: "Trading Days (Year)" },
];

// ===== Trading calendar / holidays =====
const TRADING_HOLIDAYS: string[] = [];

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

    if (dayNumber !== null) {
      const d = new Date(year, month, dayNumber);
      dateStr = formatDateYYYYMMDD(d);
      isCurrentMonth = true;
      entry = entryMap.get(dateStr);
      isToday = dateStr === todayStrLocal;

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

function calcTradingDayStats(entries: JournalEntry[]) {
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
    if (isTradingDay(ds)) allTradingDays.push(ds);
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
  const router = useRouter();

  const [plan, setPlan] = useState<GrowthPlan | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [viewDate, setViewDate] = useState<Date | null>(new Date());

  const [calendarCells, setCalendarCells] = useState<CalendarCell[]>([]);
  const [weeks, setWeeks] = useState<WeekSummary[]>([]);
  const [monthLabel, setMonthLabel] = useState("");

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

  // Load plan + journal + checklist (rolling day for checklist)
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
        const dbPlan = await getGrowthPlanSupabase();
        if (!cancelled) setPlan(dbPlan ?? null);

        const dbEntries = await getAllJournalEntries(userId);
        if (!cancelled) setEntries(dbEntries);

        // this can return ANY shape → normalize
        const checklistRow: any = await getDailyChecklist(userId, rollingTodayStr);

        const defaultChecklist: string[] = [
          "Respect your max daily loss limit.",
          "Take only planned setups from your playbook.",
          "Log your session inside 3 minutes.",
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
          setTodayChecklist([]);
          setTodayChecklistNotes(null);
          setChecklistSaving(false);
          setChecklistSaveError("Failed to load checklist.");
        }
      }
    };

    loadAll();
    return () => {
      cancelled = true;
    };
  }, [loading, user, rollingTodayStr]);

  // Rebuild calendar
  useEffect(() => {
    if (!viewDate) return;
    const { cells, weeks, monthLabel } = buildMonthCalendar(entries, viewDate);
    setCalendarCells(cells);
    setWeeks(weeks);
    setMonthLabel(monthLabel);
  }, [entries, viewDate]);

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
        if (dow === 1) {
          weekNo = getWeekOfYear(cellDate);
          break;
        }
      }
      rows.push(weekNo ?? fallback);
    }
    return rows;
  }, [calendarCells]);

  const tradingStats = useMemo(() => calcTradingDayStats(entries), [entries]);

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
    const expectedSessionUSD = dailyTargetPct !== 0 ? startOfSessionBalance * (dailyTargetPct / 100) : 0;

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
    };
  }, [plan, filteredEntries, sessionDateStr]);

  // Snapshot upsert
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
      const res = await fetch("/api/checklist/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
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
      setChecklistSaveError("Could not save checklist (retrying on next change).");
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
  const name = (user as any)?.name || "Trader";

  const { starting, target, currentBalance, progressPct, clampedProgress } = useMemo(() => {
    const startingLocal = (plan as any)?.startingBalance ?? 0;
    const targetLocal = (plan as any)?.targetBalance ?? 0;

    const totalPnlLocal = filteredEntries.reduce((sum, e) => {
      const pnlRaw = (e as any).pnl;
      const pnl = typeof pnlRaw === "number" ? pnlRaw : Number(pnlRaw) || 0;
      return sum + pnl;
    }, 0);

    const currentBalanceLocal = plan && filteredEntries.length > 0 ? startingLocal + totalPnlLocal : startingLocal;

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
          <p className="text-slate-400 text-[14px] font-medium">Account Progress</p>

          {plan ? (
            <>
              <p className="text-[16px] text-slate-300 mt-2">
                Start: <span className="text-slate-50 font-semibold">${starting.toFixed(2)}</span> · Target:{" "}
                <span className="text-emerald-400 font-semibold">${target.toFixed(2)}</span>
              </p>

              <p className="text-[16px] text-slate-300 mt-1">
                Current balance: <span className="text-slate-50 font-semibold">${currentBalance.toFixed(2)}</span>
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
                  ? `You have completed ${progressPct.toFixed(1)}% of your target based on data since this plan started.`
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
            {greenStreak} <span className="text-[16px] text-slate-400 font-normal">days</span>
          </p>

          <p className="text-[14px] text-slate-400 mt-2">
            Green days: <span className="text-emerald-300 font-semibold">{greenDays}</span> · Blue days:{" "}
            <span className="text-sky-300 font-semibold">{blueDays}</span>
          </p>

          <p className="text-[14px] text-slate-500 mt-2">
            The goal is consistency: protect your streak by respecting your max loss, not by forcing trades.
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
              <p className="text-slate-400 text-[14px] font-medium">Today&apos;s Checklist</p>
              <p className="text-[12px] text-slate-500 mt-1">
                {rollingTodayStr}
                {checklistSaving ? <span className="ml-2 text-emerald-300">Saving…</span> : null}
                {!checklistSaving && !checklistSaveError ? <span className="ml-2 text-slate-600">Saved</span> : null}
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
            Open today&apos;s journal
          </Link>
        </>
      );
    }

    // ✅ Daily Target (remaining + above goal)
    if (id === "daily-target") {
      return (
        <>
          <p className="text-slate-400 text-[14px] font-medium">Daily Target (Today)</p>

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
                  <span className="font-semibold text-slate-50">${dailyCalcs.startOfSessionBalance.toFixed(2)}</span>
                </p>

                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[12px] text-slate-400">Expected</p>
                    <p className="text-emerald-300 font-semibold">${dailyCalcs.expectedSessionUSD.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-slate-400">Realized</p>
                    <p className={dailyCalcs.actualSessionUSD >= 0 ? "text-emerald-300 font-semibold" : "text-sky-300 font-semibold"}>
                      {dailyCalcs.actualSessionUSD >= 0 ? "+" : "-"}${Math.abs(dailyCalcs.actualSessionUSD).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] text-slate-400">Delta</p>
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
                  <p className="text-[11px] text-slate-400 mt-1">{dailyCalcs.progressToGoal.toFixed(1)}% of today&apos;s goal</p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                    <p className="text-[11px] text-slate-500">Remaining to goal</p>
                    <p className="text-[14px] font-semibold text-slate-100">${dailyCalcs.remainingToGoal.toFixed(2)}</p>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-2">
                    <p className="text-[11px] text-slate-500">Above goal</p>
                    <p className="text-[14px] font-semibold text-emerald-300">${dailyCalcs.aboveGoal.toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-3 text-[13px]">
                  {dailyCalcs.goalMet ? (
                    <span className="px-2 py-1 rounded-lg bg-emerald-400 text-slate-950 font-semibold">Goal met ✅</span>
                  ) : (
                    <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 border border-slate-700">Goal not met ❌</span>
                  )}
                </div>

                <Link
                  href={`/journal/${sessionDateStr}`}
                  className="inline-flex mt-3 px-3 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-[13px] font-semibold hover:bg-emerald-300 transition"
                >
                  Open today&apos;s journal
                </Link>
              </>
            ) : (
              <p className="text-[13px] text-slate-400">Set a daily % target in your growth plan to enable this widget.</p>
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
              <button onClick={goPrevMonth} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs hover:bg-slate-700">
                ← Prev
              </button>
              <button onClick={goNextMonth} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs hover:bg-slate-700">
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
                <span className={isCurrentWeek ? "text-emerald-300 font-semibold" : "text-emerald-200"}>{label}</span>
                <span className={positive ? "text-emerald-400 font-semibold" : "text-sky-400 font-semibold"}>
                  {positive ? "+" : "-"}${Math.abs(w.pnl).toFixed(2)} · {w.daysWithTrades} day{w.daysWithTrades !== 1 ? "s" : ""}
                </span>
              </div>
            );
          })}
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
