import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet, apiPost } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { supabaseMobile } from "../lib/supabase";
import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";
import { parseNotes, type StoredTradeRow, type TradesPayload } from "../lib/journalNotes";

type AICoachScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

type CoachThread = {
  id: string;
  title: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

type CoachMessage = {
  id: string;
  thread_id: string;
  role: "user" | "coach" | "system";
  content: string;
  created_at: string;
};

type JournalEntryRow = {
  date?: string | null;
  pnl?: number | null;
  instrument?: string | null;
  direction?: string | null;
  size?: number | string | null;
  notes?: string | null;
  emotion?: string | null;
  tags?: string[] | string | null;
  respected_plan?: boolean | null;
  entry_price?: number | string | null;
  exit_price?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type JournalListResponse = {
  entries: JournalEntryRow[];
};

type AccountSeriesResponse = {
  plan?: {
    startingBalance?: number;
    targetBalance?: number;
    adjustedTargetBalance?: number;
    dailyTargetPct?: number;
    planStartIso?: string;
    targetDate?: string;
    maxDailyLossPercent?: number;
    steps?: {
      prepare?: {
        checklist?: Array<{ id?: string; text?: string; isActive?: boolean }>;
      };
      strategy?: {
        strategies?: Array<{
          name?: string;
          setup?: string;
          entryRules?: string;
          exitRules?: string;
          managementRules?: string;
          invalidation?: string;
          timeframe?: string;
          instruments?: string[];
        }>;
        notes?: string;
      };
      execution_and_journal?: {
        system?: {
          doList?: Array<{ id?: string; text?: string }>;
          dontList?: Array<{ id?: string; text?: string }>;
          orderList?: Array<{ id?: string; text?: string }>;
        };
      };
    };
  } | null;
  totals?: {
    tradingPnl?: number;
    cashflowNet?: number;
    currentBalance?: number;
  } | null;
};

type AnalyticsSnapshot = {
  updatedAtIso?: string;
  totalSessions?: number;
  totalTrades?: number;
  wins?: number;
  losses?: number;
  breakevens?: number;
  winRate?: number;
  grossPnl?: number;
  netPnl?: number;
  totalFees?: number;
  avgNetPerSession?: number;
  profitFactor?: number | null;
  expectancy?: number | null;
  avgWin?: number;
  avgLoss?: number;
  maxWin?: number;
  maxLoss?: number;
  maxDrawdown?: number;
  maxDrawdownPct?: number;
  longestWinStreak?: number;
  longestLossStreak?: number;
  byDOW?: Array<{ dow: string; pnl: number; trades: number; winRate: number }>;
  byHour?: Array<{ hour: string; pnl: number; trades: number; winRate: number }>;
  bySymbol?: Array<{ symbol: string; pnl: number; trades: number; winRate: number }>;
};

type AnalyticsSnapshotResponse = {
  snapshot: AnalyticsSnapshot | null;
};

type CoachSnapshot = {
  totalSessions: number;
  greenSessions: number;
  redSessions: number;
  winRate: number;
  byDayOfWeek: Record<string, number>;
  byInstrument: Record<string, number>;
};

type CoachAnalyticsSummary = {
  base: {
    totalSessions: number;
    greenSessions: number;
    learningSessions: number;
    flatSessions: number;
    sumPnl: number;
    avgPnl: number;
    winRate: number;
    avgWin: number;
    avgLesson: number;
    profitFactor: number | null;
    expectancy: number | null;
    breakevenRate: number;
    bestDay: { date: string; pnl: number } | null;
    toughestDay: { date: string; pnl: number } | null;
  };
  byInstrument: Record<
    string,
    {
      sessions: number;
      netPnl: number;
      avgPnl: number;
    }
  >;
  tagCounts: Record<string, number>;
};

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function looksLikeYYYYMMDD(value?: string | null): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function safeUpper(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function stripHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampText(value: unknown, max = 320): string {
  const text = stripHtml(value);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizeTags(tags: JournalEntryRow["tags"]): string[] {
  if (Array.isArray(tags)) {
    return tags.map((tag) => safeUpper(tag)).filter(Boolean);
  }
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((tag) => safeUpper(tag))
      .filter(Boolean);
  }
  return [];
}

function normalizeTradeForCoach(raw: StoredTradeRow) {
  return {
    time: clampText(raw?.time, 12),
    symbol: safeUpper(raw?.symbol),
    kind: String(raw?.kind ?? "").trim(),
    side: String(raw?.side ?? "").trim(),
    premium: String(raw?.premium ?? "").trim(),
    strategy: String(raw?.strategy ?? "").trim(),
    price: Number.isFinite(Number(raw?.price)) ? Number(Number(raw.price).toFixed(2)) : null,
    quantity: Number.isFinite(Number(raw?.quantity)) ? Number(raw.quantity) : null,
  };
}

function compactSessionForAi(entry: JournalEntryRow) {
  const parsed: TradesPayload = parseNotes(entry?.notes ?? null);
  const premarket = clampText(parsed?.premarket, 260);
  const live = clampText(parsed?.live, 320);
  const post = clampText(parsed?.post, 320);
  const notes = clampText(entry?.notes, 420);
  const entryTrades = Array.isArray(parsed?.entries) ? parsed.entries.slice(0, 8).map(normalizeTradeForCoach) : [];
  const exitTrades = Array.isArray(parsed?.exits) ? parsed.exits.slice(0, 8).map(normalizeTradeForCoach) : [];

  return {
    date: String(entry?.date ?? "").slice(0, 10),
    pnl: toNum(entry?.pnl, 0),
    instrument: safeUpper(entry?.instrument || entryTrades[0]?.symbol || ""),
    direction: String(entry?.direction ?? "").trim(),
    emotion: clampText(entry?.emotion, 180),
    tags: normalizeTags(entry?.tags).slice(0, 12),
    respectedPlan: Boolean(entry?.respected_plan),
    premarket: {
      notes: premarket,
    },
    live: {
      notes: live,
    },
    post: {
      notes: post,
    },
    notes,
    trades: {
      entries: entryTrades,
      exits: exitTrades,
      entryCount: entryTrades.length,
      exitCount: exitTrades.length,
    },
  };
}

function buildSnapshot(entries: JournalEntryRow[]): CoachSnapshot | null {
  if (!entries.length) return null;

  let greenSessions = 0;
  let redSessions = 0;
  const byDayOfWeek: Record<string, number> = {};
  const byInstrument: Record<string, number> = {};

  for (const entry of entries) {
    const pnl = toNum(entry?.pnl, 0);
    if (pnl > 0) greenSessions += 1;
    else if (pnl < 0) redSessions += 1;

    const date = String(entry?.date ?? "").slice(0, 10);
    if (looksLikeYYYYMMDD(date)) {
      const dow = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short" });
      byDayOfWeek[dow] = (byDayOfWeek[dow] || 0) + 1;
    }

    const instrument = safeUpper(entry?.instrument);
    if (instrument) {
      byInstrument[instrument] = (byInstrument[instrument] || 0) + 1;
    }
  }

  const labeled = greenSessions + redSessions;
  return {
    totalSessions: entries.length,
    greenSessions,
    redSessions,
    winRate: labeled > 0 ? (greenSessions / labeled) * 100 : 0,
    byDayOfWeek,
    byInstrument,
  };
}

function buildAnalyticsSummaryFromEntries(entries: JournalEntryRow[]): CoachAnalyticsSummary | null {
  if (!entries.length) return null;

  let sumPnl = 0;
  let wins = 0;
  let losses = 0;
  let flats = 0;
  let grossWins = 0;
  let grossLossesAbs = 0;
  let bestDay: { date: string; pnl: number } | null = null;
  let toughestDay: { date: string; pnl: number } | null = null;
  const byInstrument: CoachAnalyticsSummary["byInstrument"] = {};
  const tagCounts: Record<string, number> = {};

  for (const entry of entries) {
    const pnl = toNum(entry?.pnl, 0);
    const date = String(entry?.date ?? "").slice(0, 10);
    const instrument = safeUpper(entry?.instrument || "OTHER");

    sumPnl += pnl;
    if (pnl > 0) {
      wins += 1;
      grossWins += pnl;
    } else if (pnl < 0) {
      losses += 1;
      grossLossesAbs += Math.abs(pnl);
    } else {
      flats += 1;
    }

    if (!bestDay || pnl > bestDay.pnl) bestDay = { date, pnl };
    if (!toughestDay || pnl < toughestDay.pnl) toughestDay = { date, pnl };

    if (!byInstrument[instrument]) {
      byInstrument[instrument] = { sessions: 0, netPnl: 0, avgPnl: 0 };
    }
    byInstrument[instrument].sessions += 1;
    byInstrument[instrument].netPnl += pnl;

    for (const tag of normalizeTags(entry?.tags)) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }

  for (const key of Object.keys(byInstrument)) {
    const row = byInstrument[key];
    row.avgPnl = row.sessions > 0 ? row.netPnl / row.sessions : 0;
  }

  const labeled = wins + losses;
  const avgWin = wins > 0 ? grossWins / wins : 0;
  const avgLesson = losses > 0 ? grossLossesAbs / losses : 0;
  const winRate = labeled > 0 ? (wins / labeled) * 100 : 0;

  return {
    base: {
      totalSessions: entries.length,
      greenSessions: wins,
      learningSessions: losses,
      flatSessions: flats,
      sumPnl,
      avgPnl: entries.length > 0 ? sumPnl / entries.length : 0,
      winRate,
      avgWin,
      avgLesson,
      profitFactor: grossLossesAbs > 0 ? grossWins / grossLossesAbs : null,
      expectancy: entries.length > 0 ? sumPnl / entries.length : null,
      breakevenRate: entries.length > 0 ? (flats / entries.length) * 100 : 0,
      bestDay,
      toughestDay,
    },
    byInstrument,
    tagCounts,
  };
}

function findRelevantSessions(entries: JournalEntryRow[], query: string, k = 8) {
  const normalized = String(query ?? "").toLowerCase().trim();
  if (!normalized) return [];

  const tokens = normalized
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 12);

  if (!tokens.length) return [];

  return [...entries]
    .map((entry) => {
      const parsed = parseNotes(entry?.notes ?? null);
      const haystack = [
        entry?.date,
        entry?.instrument,
        entry?.direction,
        entry?.emotion,
        entry?.notes,
        parsed?.premarket,
        parsed?.live,
        parsed?.post,
        ...normalizeTags(entry?.tags),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let score = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 1;
      }
      return { entry, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((row) => row.entry);
}

export function AICoachScreen({}: AICoachScreenProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useSupabaseUser();
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [activeThread, setActiveThread] = useState<CoachThread | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntryRow[]>([]);
  const [accountSeries, setAccountSeries] = useState<AccountSeriesResponse | null>(null);
  const [analyticsSnapshot, setAnalyticsSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const listRef = useRef<FlatList<CoachMessage>>(null);

  const createNewThread = useCallback(async () => {
    if (!supabaseMobile || !user?.id) return null;
    const sb = supabaseMobile;
    const { data, error } = await sb
      .from("ai_coach_threads")
      .insert({ user_id: user.id, title: "AI Coaching", summary: null })
      .select("id,title,summary,created_at,updated_at")
      .single();
    if (error) throw error;
    return data as CoachThread;
  }, [user?.id]);

  const fetchThreads = useCallback(async () => {
    if (!supabaseMobile || !user?.id) return null;
    const { data, error } = await supabaseMobile
      .from("ai_coach_threads")
      .select("id,title,summary,created_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data || []) as CoachThread[];
  }, [user?.id]);

  const fetchMessages = useCallback(async (threadId: string) => {
    if (!supabaseMobile) return null;
    const { data, error } = await supabaseMobile
      .from("ai_coach_messages")
      .select("id,thread_id,role,content,created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    return (data || []) as CoachMessage[];
  }, []);

  const ensureActiveThread = useCallback(async () => {
    if (activeThread?.id) return activeThread;
    const created = await createNewThread();
    if (created) {
      setThreads((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setActiveThread(created);
      return created;
    }
    return null;
  }, [activeThread, createNewThread]);

  const loadCoachContext = useCallback(async () => {
    if (!user?.id) {
      setJournalEntries([]);
      setAccountSeries(null);
      setAnalyticsSnapshot(null);
      return;
    }

    setLoadingContext(true);
    try {
      const today = new Date();
      const fallbackFrom = new Date(today);
      fallbackFrom.setDate(today.getDate() - 365);
      const fallbackFromIso = isoDate(fallbackFrom);
      const toDate = isoDate(today);

      const [seriesRes, analyticsRes] = await Promise.all([
        apiGet<AccountSeriesResponse>("/api/account/series"),
        apiGet<AnalyticsSnapshotResponse>("/api/analytics/snapshot"),
      ]);

      const planStartIso = String(seriesRes?.plan?.planStartIso ?? "").slice(0, 10);
      const fromDate = looksLikeYYYYMMDD(planStartIso) ? planStartIso : fallbackFromIso;
      const journalRes = await apiGet<JournalListResponse>(`/api/journal/list?fromDate=${fromDate}&toDate=${toDate}`);

      const entries = [...(journalRes?.entries ?? [])].sort((a, b) =>
        String(a?.date ?? "").localeCompare(String(b?.date ?? ""))
      );

      setJournalEntries(entries);
      setAccountSeries(seriesRes ?? null);
      setAnalyticsSnapshot(analyticsRes?.snapshot ?? null);
    } catch (err: any) {
      setScreenError(err?.message ?? t(language, "Could not load coach context.", "No se pudo cargar el contexto del coach."));
    } finally {
      setLoadingContext(false);
    }
  }, [language, user?.id]);

  useEffect(() => {
    let active = true;
    async function loadThreads() {
      try {
        setScreenError(null);
        setLoadingThreads(true);
        let rows = await fetchThreads();
        if (!active) return;
        if (!rows || !rows.length) {
          const created = await createNewThread();
          if (created) {
            rows = [created];
          }
        }
        setThreads(rows ?? []);
        setActiveThread(rows?.[0] ?? null);
      } catch (err: any) {
        if (!active) return;
        setScreenError(err?.message ?? t(language, "Could not load AI Coach.", "No se pudo cargar AI Coach."));
      } finally {
        if (!active) return;
        setLoadingThreads(false);
      }
    }

    loadThreads();
    return () => {
      active = false;
    };
  }, [createNewThread, fetchThreads, language]);

  useEffect(() => {
    void loadCoachContext();
  }, [loadCoachContext]);

  useEffect(() => {
    if (!activeThread?.id) return;
    const threadId = activeThread.id;
    let active = true;

    async function loadMessages() {
      try {
        setScreenError(null);
        setLoadingMessages(true);
        const data = await fetchMessages(threadId);
        if (!active) return;
        setMessages(data ?? []);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
      } catch (err: any) {
        if (!active) return;
        setScreenError(err?.message ?? t(language, "Could not load messages.", "No se pudieron cargar los mensajes."));
      } finally {
        if (!active) return;
        setLoadingMessages(false);
      }
    }

    loadMessages();
    return () => {
      active = false;
    };
  }, [activeThread?.id, fetchMessages, language]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      setScreenError(null);
      const [rowsRaw] = await Promise.all([fetchThreads(), loadCoachContext()]);
      let rows = rowsRaw;
      if (!rows || !rows.length) {
        const created = await createNewThread();
        if (created) {
          rows = [created];
        }
      }
      const nextThreads = rows ?? [];
      const preserved =
        (activeThread && nextThreads.find((t) => t.id === activeThread.id)) ?? nextThreads[0] ?? null;
      setThreads(nextThreads);
      setActiveThread(preserved);
      if (preserved?.id) {
        const data = await fetchMessages(preserved.id);
        setMessages(data ?? []);
      } else {
        setMessages([]);
      }
    } catch (err: any) {
      setScreenError(err?.message ?? t(language, "Could not refresh AI Coach.", "No se pudo refrescar AI Coach."));
    } finally {
      setRefreshing(false);
    }
  }, [activeThread, createNewThread, fetchMessages, fetchThreads, language, loadCoachContext]);

  async function handleNewThread() {
    try {
      setScreenError(null);
      const created = await createNewThread();
      if (created) {
        setThreads((prev) => [created, ...prev]);
        setActiveThread(created);
        setMessages([]);
      }
    } catch (err: any) {
      setScreenError(err?.message ?? t(language, "Could not start a new session.", "No se pudo crear una nueva sesión."));
      setActiveThread(null);
      setMessages([]);
    }
  }

  const chatHistory = useMemo(() => {
    const tail = messages.slice(-12);
    return tail.map((m) => ({
      role: m.role === "coach" ? "coach" : "user",
      text: m.content,
      createdAt: m.created_at,
    }));
  }, [messages]);

  const coachSnapshot = useMemo(() => buildSnapshot(journalEntries), [journalEntries]);
  const analyticsSummary = useMemo(() => buildAnalyticsSummaryFromEntries(journalEntries), [journalEntries]);
  const recentSessions = useMemo(
    () => [...journalEntries].slice(Math.max(0, journalEntries.length - 25)).reverse().map(compactSessionForAi),
    [journalEntries]
  );

  const planSnapshot = useMemo(() => {
    const plan = accountSeries?.plan;
    const totals = accountSeries?.totals;
    if (!plan || !totals) return null;

    const startingBalance = toNum(plan.startingBalance, 0);
    const targetBalance = toNum(plan.adjustedTargetBalance ?? plan.targetBalance, 0);
    const netCashflows = toNum(totals.cashflowNet, 0);
    const tradingPnlSincePlan = toNum(totals.tradingPnl, 0);
    const currentBalance = toNum(totals.currentBalance, 0);
    const baselineProfitTarget = targetBalance - startingBalance;
    const effectiveStartingBalance = startingBalance + netCashflows;
    const effectiveTargetBalance = effectiveStartingBalance + baselineProfitTarget;

    return {
      startingBalance,
      targetBalance,
      baselineProfitTarget,
      netCashflows,
      effectiveStartingBalance,
      effectiveTargetBalance,
      tradingPnlSincePlan,
      currentBalance,
      progressPct:
        baselineProfitTarget > 0
          ? ((currentBalance - effectiveStartingBalance) / baselineProfitTarget) * 100
          : 0,
      sessionsSincePlan: journalEntries.length,
      winsSincePlan: journalEntries.filter((entry) => toNum(entry?.pnl, 0) > 0).length,
      lossesSincePlan: journalEntries.filter((entry) => toNum(entry?.pnl, 0) < 0).length,
      flatsSincePlan: journalEntries.filter((entry) => toNum(entry?.pnl, 0) === 0).length,
      planStartDate: plan.planStartIso ?? null,
    };
  }, [accountSeries, journalEntries]);

  async function handleSend() {
    if (!input.trim() || sending || !supabaseMobile) return;
    const sb = supabaseMobile;
    const userId = user?.id ?? (await sb.auth.getUser()).data.user?.id ?? null;
    if (!userId) {
      setScreenError(t(language, "Your session expired. Please sign in again.", "Tu sesión expiró. Vuelve a iniciar sesión."));
      return;
    }
    const text = input.trim();
    setInput("");
    setSending(true);
    setScreenError(null);

    if (!coachSnapshot && !analyticsSnapshot && !journalEntries.length && !loadingContext) {
      await loadCoachContext();
    }

    let thread = activeThread;
    try {
      thread = await ensureActiveThread();
    } catch {
      thread = activeThread;
    }

    const optimistic: CoachMessage = {
      id: `local-${Date.now()}`,
      thread_id: thread?.id ?? "ephemeral",
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

    try {
      const relevantSessions = findRelevantSessions(journalEntries, text, 8).map(compactSessionForAi);
      const userProfile = {
        id: userId,
        email: user?.email ?? null,
        firstName:
          user?.user_metadata?.first_name ??
          user?.user_metadata?.full_name ??
          user?.email?.split("@")[0] ??
          "Trader",
        displayName:
          user?.user_metadata?.full_name ??
          user?.user_metadata?.name ??
          user?.email?.split("@")[0] ??
          "Trader",
      };

      if (thread?.id) {
        const { data } = await sb
          .from("ai_coach_messages")
          .insert({
            thread_id: thread.id,
            user_id: userId,
            role: "user",
            content: text,
          })
          .select("id,thread_id,role,content,created_at")
          .single();

        if (data) {
          setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? (data as CoachMessage) : m)));
        }

        await sb
          .from("ai_coach_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", thread.id);
      }

      const res = await apiPost<{ text: string }>("/api/ai-coach", {
        threadId: thread?.id ?? null,
        chatHistory: [...chatHistory, { role: "user", text }],
        question: text,
        language,
        snapshot: coachSnapshot,
        analyticsSummary,
        analyticsSnapshot,
        recentSessions,
        relevantSessions,
        planSnapshot,
        growthPlan: accountSeries?.plan
          ? {
              startingBalance: toNum(accountSeries.plan.startingBalance, 0),
              targetBalance: toNum(accountSeries.plan.adjustedTargetBalance ?? accountSeries.plan.targetBalance, 0),
              dailyTargetPct: toNum(accountSeries.plan.dailyTargetPct, 0),
              maxDailyLossPercent: toNum(accountSeries.plan.maxDailyLossPercent, 0),
              planStartDate: accountSeries.plan.planStartIso ?? null,
              executionSystem: accountSeries.plan.steps?.execution_and_journal?.system
                ? {
                    doList: Array.isArray(accountSeries.plan.steps.execution_and_journal.system?.doList)
                      ? accountSeries.plan.steps.execution_and_journal.system.doList.slice(0, 6)
                      : [],
                    dontList: Array.isArray(accountSeries.plan.steps.execution_and_journal.system?.dontList)
                      ? accountSeries.plan.steps.execution_and_journal.system.dontList.slice(0, 6)
                      : [],
                    orderList: Array.isArray(accountSeries.plan.steps.execution_and_journal.system?.orderList)
                      ? accountSeries.plan.steps.execution_and_journal.system.orderList.slice(0, 6)
                      : [],
                  }
                : null,
              prepareChecklist: Array.isArray(accountSeries.plan.steps?.prepare?.checklist)
                ? accountSeries.plan.steps.prepare.checklist
                    .filter((item) => item && item.isActive !== false && String(item.text ?? "").trim().length > 0)
                    .slice(0, 8)
                    .map((item) => ({
                      id: item.id ?? "",
                      text: String(item.text ?? "").trim(),
                    }))
                : [],
              strategies: Array.isArray(accountSeries.plan.steps?.strategy?.strategies)
                ? accountSeries.plan.steps.strategy.strategies
                    .slice(0, 4)
                    .map((strategy) => ({
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
                    .filter((strategy) => strategy.name || strategy.setup || strategy.entryRules || strategy.managementRules || strategy.invalidation)
                : [],
              strategyNotes: String(accountSeries.plan.steps?.strategy?.notes ?? "").trim(),
            }
          : null,
        cashflowsSummary: {
          netCashflows: toNum(accountSeries?.totals?.cashflowNet, 0),
          count: 0,
        },
        userProfile,
        stylePreset: {
          mode: "conversational-trading-coach",
          askFollowupQuestion: true,
          shortSegments: true,
          strictEvidenceMode: Boolean(coachSnapshot || analyticsSnapshot || recentSessions.length),
        },
        coachingFocus: {
          useAnalyticsSummary: true,
          useRelevantSessions: relevantSessions.length > 0,
          useChallengesAndGamification: false,
        },
      });

      const coachText = res?.text || t(language, "No response from coach.", "Sin respuesta del coach.");
      let coachMessage: CoachMessage | null = null;

      if (thread?.id) {
        const { data: coachRow } = await sb
          .from("ai_coach_messages")
          .insert({
            thread_id: thread.id,
            user_id: userId,
            role: "coach",
            content: coachText,
          })
          .select("id,thread_id,role,content,created_at")
          .single();

        if (coachRow) {
          coachMessage = coachRow as CoachMessage;
        }

        await sb
          .from("ai_coach_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", thread.id);
      }

      setMessages((prev) => [
        ...prev,
        coachMessage ?? {
          id: `coach-${Date.now()}`,
          thread_id: thread?.id ?? "ephemeral",
          role: "coach",
          content: coachText,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          thread_id: thread?.id ?? "ephemeral",
          role: "coach",
          content:
            err?.message && typeof err.message === "string"
              ? err.message
              : t(language, "There was an error talking to the AI coach.", "Hubo un error con el coach AI."),
          created_at: new Date().toISOString(),
        },
      ]);
      setScreenError(
        err?.message && typeof err.message === "string"
          ? err.message
          : t(language, "There was an error talking to the AI coach.", "Hubo un error con el coach AI.")
      );
    } finally {
      setSending(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <ScreenScaffold
      title={t(language, "AI Coach", "AI Coach")}
      subtitle={t(
        language,
        "Live coaching based on your journal, plan, and performance.",
        "Coaching en vivo basado en tu journal, plan y desempeño."
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      <View style={styles.headerRow}>
        <Text style={styles.kicker}>{t(language, "Sessions", "Sesiones")}</Text>
        <Pressable style={styles.newButton} onPress={handleNewThread}>
          <Text style={styles.newButtonText}>{t(language, "New session", "Nueva sesión")}</Text>
        </Pressable>
      </View>

      {loadingThreads ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading sessions…", "Cargando sesiones…")}</Text>
        </View>
      ) : (
        <View style={styles.threadList}>
          {threads.map((thread) => {
            const isActive = thread.id === activeThread?.id;
            return (
              <Pressable
                key={thread.id}
                onPress={() => setActiveThread(thread)}
                style={[styles.threadCard, isActive && styles.threadCardActive]}
              >
                <Text style={styles.threadTitle}>{thread.title || "AI Coaching"}</Text>
                <Text style={styles.threadDate}>{(thread.updated_at || thread.created_at).slice(0, 10)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {screenError ? <Text style={styles.errorText}>{screenError}</Text> : null}
      {loadingContext ? (
        <Text style={styles.contextText}>
          {t(language, "Syncing journal, analytics, and plan for the coach…", "Sincronizando journal, analíticas y plan para el coach…")}
        </Text>
      ) : null}

      <View style={styles.chatCard}>
        <Text style={styles.cardTitle}>{t(language, "Conversation", "Conversación")}</Text>
        {loadingMessages ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>{t(language, "Loading messages…", "Cargando mensajes…")}</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              const isUser = item.role === "user";
              return (
                <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleCoach]}>
                  <Text style={styles.bubbleText}>{item.content}</Text>
                  <Text style={styles.bubbleMeta}>{item.created_at.slice(11, 16)}</Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {t(
                  language,
                  "Ask your coach about your last trades, emotions, or discipline.",
                  "Pregunta al coach sobre tus trades, emociones o disciplina."
                )}
              </Text>
            }
          />
        )}
      </View>

      <KeyboardAvoidingView behavior="padding">
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder={t(language, "Ask your coach…", "Pregunta al coach…")}
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <Pressable style={[styles.sendButton, sending && styles.sendButtonDisabled]} onPress={handleSend}>
            <Text style={styles.sendButtonText}>{sending ? "..." : t(language, "Send", "Enviar")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    kicker: {
      color: colors.textMuted,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    newButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    newButtonText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    threadList: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    threadCard: {
      flexBasis: "48%",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 4,
    },
    threadCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
    },
    threadTitle: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
    threadDate: {
      color: colors.textMuted,
      fontSize: 10,
    },
    chatCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 6,
      minHeight: 280,
    },
    cardTitle: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    bubble: {
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 6,
      maxWidth: "85%",
    },
    bubbleUser: {
      alignSelf: "flex-end",
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.success,
    },
    bubbleCoach: {
      alignSelf: "flex-start",
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    bubbleText: {
      color: colors.textPrimary,
      fontSize: 12,
      lineHeight: 18,
    },
    bubbleMeta: {
      marginTop: 4,
      color: colors.textMuted,
      fontSize: 9,
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
    },
    input: {
      flex: 1,
      minHeight: 48,
      maxHeight: 140,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
    },
    sendButton: {
      borderRadius: 10,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    sendButtonDisabled: {
      opacity: 0.6,
    },
    sendButtonText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: "700",
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
      lineHeight: 18,
    },
    contextText: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
  });
