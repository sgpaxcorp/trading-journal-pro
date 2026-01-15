// app/performance/ai-coaching/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";

import { useAuth } from "@/context/AuthContext";
import TopNav from "@/app/components/TopNav";

import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";

import { supabaseBrowser } from "@/lib/supaBaseClient";

import {
  buildAiCoachSnapshot,
  type AiCoachSnapshot,
} from "@/lib/aiCoachSnapshotSupabase";
import {
  getProfileGamification,
  type ProfileGamification,
} from "@/lib/profileGamificationSupabase";

import {
  listCashflows,
  signedCashflowAmount,
  type Cashflow,
} from "@/lib/cashflowsSupabase";

import {
  createAiCoachThread,
  getOrCreateMostRecentAiCoachThread,
  insertAiCoachMessage,
  listAiCoachMessages,
  listAiCoachThreads,
  type AiCoachMessageRow,
  type AiCoachThreadRow,
} from "@/lib/aiCoachChatSupabase";

/* =========================
   Types
========================= */

type AiCoachState = {
  loading: boolean;
  error: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "coach";
  text: string;
  createdAt: string;
};

type GrowthPlanRow = {
  id: string;
  user_id: string;
  starting_balance: number | string | null;
  target_balance: number | string | null;
  daily_target_pct: number | string | null;
  daily_goal_percent: number | string | null;
  max_daily_loss_percent: number | string | null;
  max_risk_per_trade_usd: number | string | null;
  created_at: string | null;
  updated_at: string | null;
};

type Snapshot = {
  totalSessions: number;
  greenSessions: number;
  redSessions: number;
  winRate: number;
  byDayOfWeek: Record<string, number>;
  byInstrument: Record<string, number>;
};

type PlanSnapshot = {
  // Raw plan
  startingBalance: number;
  targetBalance: number;
  baselineProfitTarget: number;

  // Cashflows (since plan start)
  netCashflows: number;
  effectiveStartingBalance: number;
  effectiveTargetBalance: number;

  // Trading performance (since plan start)
  tradingPnlSincePlan: number;
  currentBalance: number;

  // Progress excluding deposits/withdrawals
  progressPct: number;

  sessionsSincePlan: number;
  winsSincePlan: number;
  lossesSincePlan: number;
  flatsSincePlan: number;

  planStartDate: string | null;
};

type AnalyticsSummary = {
  base: {
    totalSessions: number;
    greenSessions: number;
    learningSessions: number;
    flatSessions: number;
    sumPnl: number;
    avgPnl: number;
    winRate: number;
    bestDay: { date: string; pnl: number } | null;
    toughestDay: { date: string; pnl: number } | null;
  };
  byDayOfWeek: Record<
    string,
    {
      label: string;
      sessions: number;
      green: number;
      learning: number;
      flat: number;
      sumPnl: number;
      avgPnl: number;
      winRate: number;
    }
  >;
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

type UserProfileForCoach = {
  id: string;
  email: string | null;
  displayName: string;
  firstName: string;
  locale?: string | null;
};

type BackStudyParams = {
  symbol: string;
  date: string;
  entryTime?: string | null;
  exitTime?: string | null;
  tf?: string | null;
  range?: string | null;
};

/* =========================
   Helpers
========================= */

const QUICK_PROMPTS: string[] = [
  "Based on my last sessions, what is the main thing I should change?",
  "Looking only at recent data, what is my biggest psychological leak?",
  "How am I doing vs my plan and challenges this week?",
  "What should I improve in my risk management during losing days?",
];

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function safeUpper(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}

function clampText(s: any, max = 900): string {
  const t = (s ?? "").toString();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function toNum(x: any, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

function dateIsoFromAny(v: any): string | null {
  if (!v) return null;
  if (typeof v === "string") {
    // Accept: "YYYY-MM-DD..." or ISO
    const s = v.trim();
    if (!s) return null;
    if (s.length >= 10) return s.slice(0, 10);
    return null;
  }
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  return null;
}

function planStartIsoFromPlan(plan: GrowthPlanRow | null): string | null {
  if (!plan) return null;
  // Use the newest of created_at / updated_at as "effective plan start".
  // This avoids stale rows or migrations that keep an old created_at.
  const c = dateIsoFromAny(plan.created_at);
  const u = dateIsoFromAny(plan.updated_at);
  if (c && u) return c > u ? c : u;
  return u || c || null;
}

function formatDayLabel(dow: string) {
  const n = Number(dow);
  const map: Record<number, string> = {
    0: "Sunday",
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
  };
  return map[n] ?? dow;
}

/* Detect approximate language of the question (hint for backend) */
function detectLanguage(q: string): "es" | "en" | "auto" {
  const s = q.toLowerCase();
  if (!s.trim()) return "auto";
  if (
    /[áéíóúñü¿¡]/.test(s) ||
    /\b(qué|como|cómo|porque|por qué|cuál|días|semanas|meses|ganancia|pérdida|plan|riesgo|psicología|diario)\b/.test(
      s
    )
  ) {
    return "es";
  }
  return "en";
}

/* Build a user profile for the coach so it can use the name */
function buildUserProfileForCoach(rawUser: any): UserProfileForCoach | null {
  if (!rawUser) return null;

  const id =
    rawUser.id ||
    rawUser.uid ||
    rawUser.user_id ||
    rawUser.sub ||
    rawUser.email ||
    "";

  if (!id) return null;

  const email: string | null = rawUser.email ?? null;
  const meta = rawUser.user_metadata || rawUser.metadata || {};

  const fullNameOrHandle =
    meta.full_name ||
    meta.name ||
    rawUser.displayName ||
    rawUser.username ||
    (email ? email.split("@")[0] : "Trader");

  const firstName =
    meta.first_name || fullNameOrHandle.split(" ")[0] || "Trader";

  const locale: string | null = rawUser.locale || meta.locale || null;

  return {
    id,
    email,
    displayName: firstName,
    firstName,
    locale,
  };
}

/* Journal entry → best guess net P&L */
function sessionNetPnl(entry: any): number {
  const net =
    entry?.pnlNet ??
    entry?.netPnl ??
    entry?.pnl ??
    0;
  return toNum(net, 0);
}

/* A compact session object to send to the backend (keeps tokens reasonable) */
function compactSessionForAi(entry: any) {
  const date = String(entry?.date || "");
  const pnl = sessionNetPnl(entry);

  const instrument =
    entry?.mainInstrument ||
    entry?.instrument ||
    entry?.symbol ||
    entry?.ticker ||
    "";

  const tags = Array.isArray(entry?.tags) ? entry.tags.slice(0, 20) : [];

  // Common note fields across variations (you can extend later)
  const premarket =
    entry?.premarket ||
    {
      bias: entry?.premarketBias,
      plan: entry?.premarketPlan,
      levels: entry?.premarketLevels,
      catalyst: entry?.premarketCatalyst,
      notes: entry?.premarketNotes,
    };

  const live =
    entry?.live ||
    {
      emotions: entry?.liveEmotions,
      mistakes: entry?.liveMistakes,
      notes: entry?.liveNotes,
    };

  const post =
    entry?.postmarket ||
    entry?.post ||
    {
      lessons: entry?.lessons,
      whatWorked: entry?.whatWorked,
      whatFailed: entry?.whatFailed,
      notes: entry?.postNotes,
    };

  const notes = entry?.notes ?? entry?.summary ?? entry?.reflection ?? "";

  return {
    date,
    pnl,
    instrument: safeUpper(String(instrument)),
    tags: tags.map((t: any) => safeUpper(String(t))).filter(Boolean),
    respectedPlan: Boolean(entry?.respectedPlan ?? entry?.followedPlan ?? entry?.planRespected),
    premarket: {
      bias: clampText(premarket?.bias, 220),
      plan: clampText(premarket?.plan, 400),
      levels: clampText(premarket?.levels, 260),
      catalyst: clampText(premarket?.catalyst, 220),
      notes: clampText(premarket?.notes, 260),
    },
    live: {
      emotions: clampText(live?.emotions, 260),
      mistakes: clampText(live?.mistakes, 260),
      notes: clampText(live?.notes, 320),
    },
    post: {
      lessons: clampText(post?.lessons, 340),
      whatWorked: clampText(post?.whatWorked, 280),
      whatFailed: clampText(post?.whatFailed, 280),
      notes: clampText(post?.notes, 340),
    },
    notes: clampText(notes, 520),
  };
}

/* Simple analytics from ALL journal entries (for the coach) */
function buildAnalyticsSummaryFromEntries(entries: JournalEntry[]): AnalyticsSummary {
  const base = {
    totalSessions: 0,
    greenSessions: 0,
    learningSessions: 0,
    flatSessions: 0,
    sumPnl: 0,
    avgPnl: 0,
    winRate: 0,
    bestDay: null as { date: string; pnl: number } | null,
    toughestDay: null as { date: string; pnl: number } | null,
  };

  const byDayOfWeek: AnalyticsSummary["byDayOfWeek"] = {};
  const byInstrument: AnalyticsSummary["byInstrument"] = {};
  const tagCounts: Record<string, number> = {};

  for (const e of entries as any[]) {
    const pnl = sessionNetPnl(e);
    const dateStr: string = e.date || "";

    base.totalSessions += 1;
    base.sumPnl += pnl;

    if (pnl > 0) base.greenSessions += 1;
    else if (pnl < 0) base.learningSessions += 1;
    else base.flatSessions += 1;

    if (!base.bestDay || pnl > base.bestDay.pnl) base.bestDay = { date: dateStr, pnl };
    if (!base.toughestDay || pnl < base.toughestDay.pnl) base.toughestDay = { date: dateStr, pnl };

    // Day-of-week
    if (dateStr) {
      const d = new Date(dateStr + "T00:00:00");
      if (!Number.isNaN(d.getTime())) {
        const dow = d.getDay();
        const key = String(dow);
        if (!byDayOfWeek[key]) {
          byDayOfWeek[key] = {
            label: formatDayLabel(key),
            sessions: 0,
            green: 0,
            learning: 0,
            flat: 0,
            sumPnl: 0,
            avgPnl: 0,
            winRate: 0,
          };
        }
        const bucket = byDayOfWeek[key];
        bucket.sessions += 1;
        bucket.sumPnl += pnl;
        if (pnl > 0) bucket.green += 1;
        else if (pnl < 0) bucket.learning += 1;
        else bucket.flat += 1;
      }
    }

    // Instrument-level
    const instrument: string = e.mainInstrument || e.instrument || e.symbol || "";
    const instKey = safeUpper(instrument);
    if (instKey) {
      if (!byInstrument[instKey]) byInstrument[instKey] = { sessions: 0, netPnl: 0, avgPnl: 0 };
      const bucket = byInstrument[instKey];
      bucket.sessions += 1;
      bucket.netPnl += pnl;
    }

    // Tags
    const tagsRaw = e.tags;
    if (Array.isArray(tagsRaw)) {
      for (const t of tagsRaw) {
        const key = safeUpper(String(t));
        if (!key) continue;
        tagCounts[key] = (tagCounts[key] || 0) + 1;
      }
    }
  }

  if (base.totalSessions > 0) {
    base.avgPnl = base.sumPnl / base.totalSessions;
    base.winRate = (base.greenSessions / base.totalSessions) * 100;
  }

  for (const key of Object.keys(byDayOfWeek)) {
    const bucket = byDayOfWeek[key];
    if (bucket.sessions > 0) {
      bucket.avgPnl = bucket.sumPnl / bucket.sessions;
      bucket.winRate = (bucket.green / bucket.sessions) * 100;
    }
  }

  for (const key of Object.keys(byInstrument)) {
    const bucket = byInstrument[key];
    if (bucket.sessions > 0) bucket.avgPnl = bucket.netPnl / bucket.sessions;
  }

  return { base, byDayOfWeek, byInstrument, tagCounts };
}

/* Build a lightweight snapshot used for quick UI cards */
function buildSnapshot(entries: JournalEntry[]): Snapshot {
  const totalSessions = entries.length;

  const byDayOfWeek: Record<string, number> = {};
  const byInstrument: Record<string, number> = {};

  let greenSessions = 0;
  let redSessions = 0;

  for (const entry of entries as any[]) {
    const dateStr = entry.date ? String(entry.date) : "";
    if (dateStr) {
      const d = new Date(dateStr + "T00:00:00");
      if (!Number.isNaN(d.getTime())) {
        const dow = d.getDay().toString();
        byDayOfWeek[dow] = (byDayOfWeek[dow] || 0) + 1;
      }
    }

    const inst = entry.mainInstrument || entry.instrument || entry.symbol || "";
    if (inst) {
      const key = safeUpper(String(inst));
      byInstrument[key] = (byInstrument[key] || 0) + 1;
    }

    // Use P&L if no explicit label exists
    const pnl = sessionNetPnl(entry);
    if (pnl > 0) greenSessions++;
    else if (pnl < 0) redSessions++;
  }

  const totalLabeled = greenSessions + redSessions;
  const winRate = totalLabeled > 0 ? (greenSessions / totalLabeled) * 100 : 0;

  return { totalSessions, greenSessions, redSessions, winRate, byDayOfWeek, byInstrument };
}

/* Keyword-based retrieval (no embeddings yet) */
function findRelevantSessions(entries: JournalEntry[], query: string, k = 8) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];

  const tokens = q
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 12);

  if (!tokens.length) return [];

  const scored = (entries as any[]).map((e) => {
    const hay = [
      e.date,
      e.mainInstrument,
      e.instrument,
      e.symbol,
      ...(Array.isArray(e.tags) ? e.tags : []),
      e.premarketBias,
      e.premarketPlan,
      e.premarketLevels,
      e.premarketCatalyst,
      e.premarketNotes,
      e.liveEmotions,
      e.liveMistakes,
      e.liveNotes,
      e.lessons,
      e.whatWorked,
      e.whatFailed,
      e.postNotes,
      e.notes,
      e.summary,
      e.reflection,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const t of tokens) {
      if (hay.includes(t)) score += 1;
    }
    return { e, score };
  });

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((x) => x.e);
}

/* File → data URL */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* Currency formatter */
function usd(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/* =========================
   Inner page (with hooks)
========================= */

function AiCoachingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  // Platform data
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [growthPlan, setGrowthPlan] = useState<GrowthPlanRow | null>(null);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [fullSnapshot, setFullSnapshot] = useState<AiCoachSnapshot | null>(null);
  const [gamification, setGamification] = useState<ProfileGamification | null>(null);

  // Chat persistence
  const [threads, setThreads] = useState<AiCoachThreadRow[]>([]);
  const [activeThread, setActiveThread] = useState<AiCoachThreadRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // UI state
  const [question, setQuestion] = useState("");
  const [coachState, setCoachState] = useState<AiCoachState>({ loading: false, error: null });

  // Screenshot
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  // Profile (name, locale)
  const [coachUserProfile, setCoachUserProfile] = useState<UserProfileForCoach | null>(null);

  const [dataLoading, setDataLoading] = useState<boolean>(true);

  // Scroll to bottom
  const endRef = useRef<HTMLDivElement | null>(null);

  /* ---------- Back-study params from URL ---------- */
  const backStudyParams: BackStudyParams | null = useMemo(() => {
    if (!searchParams) return null;
    const symbol = searchParams.get("symbol");
    const date = searchParams.get("date");
    if (!symbol || !date) return null;

    return {
      symbol,
      date,
      entryTime: searchParams.get("entryTime"),
      exitTime: searchParams.get("exitTime"),
      tf: searchParams.get("tf"),
      range: searchParams.get("range"),
    };
  }, [searchParams]);

  const backStudyContext: string | null = useMemo(() => {
    if (!backStudyParams) return null;

    const lines: (string | null)[] = [
      "Back-study trade context:",
      `- Underlying symbol: ${backStudyParams.symbol}`,
      `- Session date (local calendar): ${backStudyParams.date}`,
      backStudyParams.entryTime && backStudyParams.exitTime
        ? `- Intraday window: ${backStudyParams.entryTime} → ${backStudyParams.exitTime} (local time)`
        : backStudyParams.entryTime
        ? `- Entry time: ${backStudyParams.entryTime} (local time)`
        : null,
      backStudyParams.tf ? `- Chart timeframe selected: ${backStudyParams.tf}` : null,
      backStudyParams.range ? `- Historical range loaded: ${backStudyParams.range}` : null,
      "If an image is attached, it is a screenshot of this back-study chart with green/blue arrows marking entry and exit.",
    ];

    return lines.filter(Boolean).join("\n");
  }, [backStudyParams]);

  /* ---------- Protect route ---------- */
  useEffect(() => {
    if (!authLoading && !user) router.push("/signin");
  }, [authLoading, user, router]);

  /* ---------- Load everything (ALL from Supabase) ---------- */
  useEffect(() => {
    if (authLoading || !user) return;

    let alive = true;

    const loadAll = async () => {
      try {
        setDataLoading(true);

        const profile = buildUserProfileForCoach(user);
        if (!alive) return;
        setCoachUserProfile(profile);

        const userId = profile?.id || "";

        // 1) Threads (create if none)
        const initialThreads = await listAiCoachThreads(userId, { limit: 20 });
        if (!alive) return;

        let threadToUse: AiCoachThreadRow | null = null;

        const qsThread = searchParams?.get("thread") || null;
        if (qsThread && initialThreads.some((t) => t.id === qsThread)) {
          threadToUse = initialThreads.find((t) => t.id === qsThread) || null;
        } else {
          threadToUse = await getOrCreateMostRecentAiCoachThread({ userId, defaultTitle: "AI Coaching" });
        }

        const refreshedThreads = threadToUse
          ? [threadToUse, ...initialThreads.filter((t) => t.id !== threadToUse!.id)]
          : initialThreads;

        setThreads(refreshedThreads);
        setActiveThread(threadToUse);

        if (threadToUse && qsThread !== threadToUse.id) {
          // Keep URL in sync without full navigation
          const url = new URL(window.location.href);
          url.searchParams.set("thread", threadToUse.id);
          window.history.replaceState({}, "", url.toString());
        }

        // 2) Messages (persisted)
        if (threadToUse) {
          const msgRows = await listAiCoachMessages(threadToUse.id, { limit: 200, ascending: true });
          if (!alive) return;
          const mapped: ChatMessage[] = msgRows.map((m) => ({
            id: m.id,
            role: m.role === "coach" ? "coach" : "user",
            text: m.content,
            createdAt: m.created_at,
          }));
          setMessages(mapped);
        } else {
          setMessages([]);
        }

        // 3) Journal
        const all = userId ? await getAllJournalEntries(userId) : [];
        if (!alive) return;
        setEntries(all || []);

        // 4) Growth plan (Supabase table: growth_plans)
        const { data: gp, error: gpErr } = await supabaseBrowser
          .from("growth_plans")
          .select(
            "id,user_id,starting_balance,target_balance,daily_target_pct,daily_goal_percent,max_daily_loss_percent,max_risk_per_trade_usd,created_at,updated_at"
          )
          .eq("user_id", userId)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (gpErr) {
          console.error("[AI Coaching] growth_plans load error:", gpErr);
        }
        if (!alive) return;
        setGrowthPlan((gp as any) || null);

        const planStartIso = planStartIsoFromPlan((gp as any) || null);
        // 5) Cashflows (since plan start if possible)
        const cfs = userId
          ? await listCashflows(userId, {
              fromDate: planStartIso || undefined,
              toDate: undefined,
              throwOnError: false,
            })
          : [];
        if (!alive) return;
        setCashflows(cfs || []);

        // 6) Full snapshot (platform-wide)
        const full = userId ? await buildAiCoachSnapshot(userId) : null;
        if (!alive) return;
        setFullSnapshot(full);

        // 7) Gamification
        const g = userId ? await getProfileGamification(userId) : null;
        if (!alive) return;
        setGamification(g);
      } catch (err) {
        console.error("[AI Coaching] load error:", err);
        if (!alive) return;
        setEntries([]);
        setGrowthPlan(null);
        setCashflows([]);
        setFullSnapshot(null);
        setGamification(null);
      } finally {
        if (alive) setDataLoading(false);
      }
    };

    void loadAll();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

  /* ---------- Derived stats ---------- */

  const snapshot = useMemo(() => (entries.length ? buildSnapshot(entries) : null), [entries]);

  const analyticsSummary = useMemo(
    () => buildAnalyticsSummaryFromEntries(entries),
    [entries]
  );

  const recentSessions = useMemo(() => {
    if (!entries.length) return [];
    const sorted = [...entries].sort((a: any, b: any) =>
      String(a.date || "").localeCompare(String(b.date || ""))
    );
    return sorted.slice(-25).reverse();
  }, [entries]);

  const planSnapshot: PlanSnapshot | null = useMemo(() => {
    if (!growthPlan) return null;

    const startingBalance = toNum(growthPlan.starting_balance, 0);
    const targetBalance = toNum(growthPlan.target_balance, 0);

    const planStart = planStartIsoFromPlan(growthPlan);
    const planStartDate = planStart || null;

    const filtered = planStartDate ? entries.filter((e: any) => String(e.date || "") >= planStartDate) : entries;

    const tradingPnlSincePlan = filtered.reduce((sum, e: any) => sum + sessionNetPnl(e), 0);

    const netCashflows = (cashflows || []).reduce((sum, cf) => sum + signedCashflowAmount(cf), 0);

    const baselineProfitTarget = targetBalance - startingBalance;

    // Rebase the plan with cashflows so deposits/withdrawals do NOT inflate "progress".
    const effectiveStartingBalance = startingBalance + netCashflows;
    const effectiveTargetBalance = effectiveStartingBalance + baselineProfitTarget;

    const currentBalance = effectiveStartingBalance + tradingPnlSincePlan;

    const progressPct =
      baselineProfitTarget > 0
        ? ((currentBalance - effectiveStartingBalance) / baselineProfitTarget) * 100
        : 0;

    const wins = filtered.filter((e: any) => sessionNetPnl(e) > 0).length;
    const losses = filtered.filter((e: any) => sessionNetPnl(e) < 0).length;
    const flats = filtered.length - wins - losses;

    return {
      startingBalance,
      targetBalance,
      baselineProfitTarget,

      netCashflows,
      effectiveStartingBalance,
      effectiveTargetBalance,

      tradingPnlSincePlan,
      currentBalance,

      progressPct,

      sessionsSincePlan: filtered.length,
      winsSincePlan: wins,
      lossesSincePlan: losses,
      flatsSincePlan: flats,

      planStartDate,
    };
  }, [growthPlan, entries, cashflows]);

  /* ---------- Keep chat scrolled to bottom ---------- */
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [messages, coachState.loading]);

  /* ---------- Screenshot handlers ---------- */

  function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setScreenshotFile(null);
      setScreenshotPreview(null);
      return;
    }
    setScreenshotFile(file);
    const url = URL.createObjectURL(file);
    setScreenshotPreview(url);
  }

  function clearScreenshot() {
    setScreenshotFile(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
  }

  /* ---------- Thread controls ---------- */

  async function createNewThread() {
    if (!coachUserProfile?.id) return;

    const t = await createAiCoachThread({
      userId: coachUserProfile.id,
      title: "AI Coaching",
      metadata: backStudyParams ? { backStudyParams } : null,
    });

    if (!t) return;

    // Refresh thread list
    const refreshed = await listAiCoachThreads(coachUserProfile.id, { limit: 20 });
    setThreads(refreshed);
    setActiveThread(t);
    setMessages([]);

    const url = new URL(window.location.href);
    url.searchParams.set("thread", t.id);
    window.history.replaceState({}, "", url.toString());
  }

  async function switchThread(threadId: string) {
    if (!coachUserProfile?.id) return;
    const t = threads.find((x) => x.id === threadId) || null;
    setActiveThread(t);

    const url = new URL(window.location.href);
    url.searchParams.set("thread", threadId);
    window.history.replaceState({}, "", url.toString());

    const msgRows = await listAiCoachMessages(threadId, { limit: 200, ascending: true });
    const mapped: ChatMessage[] = msgRows.map((m) => ({
      id: m.id,
      role: m.role === "coach" ? "coach" : "user",
      text: m.content,
      createdAt: m.created_at,
    }));
    setMessages(mapped);
  }

  /* ---------- Call the API ---------- */

  async function handleAskCoach() {
    if (coachState.loading) return;
    if (!activeThread || !coachUserProfile?.id) return;

    // Hard requirements: must have at least some platform data
    if (!snapshot || !fullSnapshot) return;

    if (!question.trim() && !screenshotFile) return;

    try {
      const finalQuestion = question.trim();
      const languageHint = detectLanguage(finalQuestion);

      const userText =
        finalQuestion ||
        "(No specific question. Please analyze the attached screenshot and my data.)";

      // 1) Persist the user message first (Supabase)
      const userRow = await insertAiCoachMessage({
        threadId: activeThread.id,
        userId: coachUserProfile.id,
        role: "user",
        content: userText,
        meta: {
          source: "ui",
          backStudyParams: backStudyParams || null,
          hasScreenshot: Boolean(screenshotFile),
        },
      });

      const userMsg: ChatMessage = {
        id: userRow?.id || makeId(),
        role: "user",
        text: userText,
        createdAt: userRow?.created_at || new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setQuestion("");
      setCoachState({ loading: true, error: null });

      // 2) Screenshot (optional)
      let screenshotBase64: string | undefined;
      if (screenshotFile) screenshotBase64 = await fileToDataUrl(screenshotFile);

      // 3) Compact sessions for tokens
      const compactRecent = recentSessions.map((s: any) => compactSessionForAi(s));
      const relevant = findRelevantSessions(entries, finalQuestion, 8).map((s: any) =>
        compactSessionForAi(s)
      );

      // 4) Include short chat history for continuity
      const chatHistory = messages
        .slice(-12)
        .map((m) => ({
          role: m.role,
          text: clampText(m.text, 700),
          createdAt: m.createdAt,
        }));

      const res = await fetch("/api/ai-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Conversation
          threadId: activeThread.id,
          chatHistory,

          // Question
          question: finalQuestion,
          language: languageHint,
          screenshotBase64: screenshotBase64 || null,
          backStudyContext,

          // Core context
          snapshot,
          analyticsSummary,
          recentSessions: compactRecent,
          relevantSessions: relevant,

          // Platform context
          planSnapshot,
          growthPlan: growthPlan
            ? {
                startingBalance: toNum(growthPlan.starting_balance, 0),
                targetBalance: toNum(growthPlan.target_balance, 0),
                dailyTargetPct: toNum(growthPlan.daily_target_pct ?? growthPlan.daily_goal_percent, 0),
                maxDailyLossPercent: toNum(growthPlan.max_daily_loss_percent, 0),
                planStartDate: planStartIsoFromPlan(growthPlan),
              }
            : null,
          cashflowsSummary: {
            netCashflows: (cashflows || []).reduce((sum, cf) => sum + signedCashflowAmount(cf), 0),
            count: cashflows?.length || 0,
          },
          fullSnapshot,
          gamification,
          userProfile: coachUserProfile,

          // Style hints
          stylePreset: {
            mode: "conversational-trading-coach",
            askFollowupQuestion: true,
            shortSegments: true,
          },
          coachingFocus: {
            useChallengesAndGamification: true,
            useAnalyticsSummary: true,
            useRelevantSessions: true,
            evaluateExitTimingFromChart: true,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.details || data?.error || "There was an error contacting the AI coach.";
        throw new Error(msg);
      }

      const coachText = String(data.text || "").trim() || "No response text received.";

      // 5) Persist coach message (Supabase)
      const coachRow = await insertAiCoachMessage({
        threadId: activeThread.id,
        userId: coachUserProfile.id,
        role: "coach",
        content: coachText,
        meta: {
          model: data?.model || null,
          usage: data?.usage || null,
        },
      });

      const coachMsg: ChatMessage = {
        id: coachRow?.id || makeId(),
        role: "coach",
        text: coachText,
        createdAt: coachRow?.created_at || new Date().toISOString(),
      };

      setMessages((prev) => [...prev, coachMsg]);
      setCoachState({ loading: false, error: null });

      // Optional: clear screenshot after send
      clearScreenshot();
    } catch (err: any) {
      console.error("[AI Coaching] request error:", err);
      setCoachState({ loading: false, error: err?.message || "Unknown error" });
    }
  }

  /* =========================
     Render
  ========================== */

  const isDisabled =
    dataLoading ||
    coachState.loading ||
    !activeThread ||
    !snapshot ||
    !fullSnapshot ||
    (!question.trim() && !screenshotFile);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading coach…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <TopNav />

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-xs font-semibold">
              AI
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Your AI Trading Coach</h1>
              <p className="text-sm text-slate-400 mt-1">
                Practical coaching on risk, psychology and process, using your journal, analytics, challenges and growth plan.
              </p>
              {coachUserProfile && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Coaching for{" "}
                  <span className="font-semibold text-emerald-300">
                    {coachUserProfile.firstName}
                  </span>
                  .
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {gamification && (
              <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-200">
                Level{" "}
                <span className="font-semibold text-emerald-100">
                  {gamification.level}
                </span>{" "}
                · Tier{" "}
                <span className="font-semibold text-emerald-100">
                  {gamification.tier}
                </span>{" "}
                · {gamification.xp.toLocaleString()} XP
              </div>
            )}
            <Link
              href="/performance/analytics-statistics"
              className="text-xs rounded-full border border-slate-700 px-3 py-1 hover:bg-slate-800"
            >
              ← Back to Analytics
            </Link>
          </div>
        </div>

        {/* Back-study context pill */}
        {backStudyParams && (
          <div className="rounded-2xl border border-sky-700/60 bg-sky-900/30 px-3 py-2 text-[11px] text-sky-100 flex flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-[0.18em] text-sky-300">
              Back-study trade linked
            </span>
            <span>
              Symbol:{" "}
              <span className="font-mono font-semibold">
                {backStudyParams.symbol}
              </span>
            </span>
            <span>· Date: {backStudyParams.date}</span>
            {backStudyParams.entryTime && backStudyParams.exitTime && (
              <span>
                · Window: {backStudyParams.entryTime} → {backStudyParams.exitTime}
              </span>
            )}
            {backStudyParams.tf && <span>· TF: {backStudyParams.tf}</span>}
            {backStudyParams.range && <span>· Range: {backStudyParams.range}</span>}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
          {/* Chat panel */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 flex flex-col max-h-[72vh]">
            {/* Chat header */}
            <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-100">Live coaching</p>
                <p className="text-xs text-slate-400">
                  Ask questions, attach a chart screenshot, and get short, focused feedback. Puedes escribir en español o inglés.
                </p>
              </div>

              {/* Thread controls */}
              <div className="flex items-center gap-2">
                <select
                  value={activeThread?.id || ""}
                  onChange={(e) => switchThread(e.target.value)}
                  className="text-xs rounded-xl border border-slate-700 bg-slate-950/60 px-2 py-1"
                >
                  {threads.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title || "AI Coaching"} · {String(t.updated_at || "").slice(0, 10)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={createNewThread}
                  className="text-xs rounded-xl border border-slate-700 px-3 py-1 hover:bg-slate-800"
                >
                  New chat
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {!messages.length && !coachState.error && (
                <p className="text-xs text-slate-500">
                  Start by typing a question (example:{" "}
                  <span className="italic">
                    “What do I need to improve in my last 5 sessions?”
                  </span>
                  ). You can also attach a screenshot of a trade chart with entry/exit arrows.
                </p>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-emerald-500 text-slate-950 rounded-br-sm"
                        : "bg-slate-800 text-slate-100 rounded-bl-sm"
                    }`}
                  >
                    {msg.role === "coach" ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
                  </div>
                </div>
              ))}

              {coachState.loading && (
                <div className="flex justify-start">
                  <div className="text-xs text-slate-400 italic">
                    The coach is analyzing your data…
                  </div>
                </div>
              )}

              {coachState.error && (
                <div className="flex justify-start">
                  <div className="text-xs text-sky-300">{coachState.error}</div>
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Input area */}
            <div className="border-t border-slate-800 px-4 py-3 space-y-3">
              {/* Quick prompts */}
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="text-[11px] px-3 py-1 rounded-full border border-slate-700 hover:border-emerald-400 hover:text-emerald-200 bg-slate-900/80"
                    onClick={() => setQuestion(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Text + screenshot */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <textarea
                    className="flex-1 min-h-[60px] max-h-[140px] rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                    placeholder="Ask your coach about your last trades, emotions, challenges, or plan adherence... (puedes escribir en español)"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                  <div className="w-32 flex flex-col items-center gap-2">
                    <label className="w-full text-[11px] text-center rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-2 py-2 cursor-pointer hover:border-emerald-400 hover:text-emerald-200">
                      <span className="block mb-1">Screenshot</span>
                      <span className="text-[10px] text-slate-400">Chart / PnL / platform</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleScreenshotChange}
                      />
                    </label>
                    {screenshotPreview && (
                      <div className="relative w-full">
                        <img
                          src={screenshotPreview}
                          alt="Screenshot preview"
                          className="rounded-lg border border-slate-700 max-h-24 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={clearScreenshot}
                          className="absolute -top-2 -right-2 text-[10px] bg-slate-900 border border-slate-600 rounded-full px-1"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAskCoach}
                    disabled={isDisabled}
                    className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition ${
                      isDisabled
                        ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                        : "bg-emerald-500 hover:bg-emerald-400 text-slate-900"
                    }`}
                  >
                    {coachState.loading ? "Coaching..." : "Send to AI coach"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Side panel */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
            <h2 className="text-sm font-medium text-slate-200 flex items-center justify-between">
              Snapshot
              <span className="text-[10px] text-slate-400">Last {recentSessions.length} sessions</span>
            </h2>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Total sessions</p>
                <p className="text-xl font-semibold">{snapshot?.totalSessions ?? 0}</p>
              </div>
              <div className="rounded-xl border border-emerald-800/60 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Green</p>
                <p className="text-xl font-semibold">{snapshot?.greenSessions ?? 0}</p>
              </div>
              <div className="rounded-xl border border-sky-800/60 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Red</p>
                <p className="text-xl font-semibold">{snapshot?.redSessions ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Win rate (est.)</p>
                <p className="text-xl font-semibold">{snapshot ? `${snapshot.winRate.toFixed(1)}%` : "—"}</p>
              </div>
            </div>

            {planSnapshot && (
              <div className="rounded-xl border border-emerald-700 bg-slate-950/70 p-3 space-y-1">
                <p className="text-[11px] text-emerald-300 font-semibold">Plan vs current (cashflows-neutral)</p>

                <p className="text-[12px] text-slate-300">
                  Start: <span className="font-semibold">{usd(planSnapshot.effectiveStartingBalance)}</span>{" "}
                  · Target: <span className="font-semibold text-emerald-300">{usd(planSnapshot.effectiveTargetBalance)}</span>
                </p>

                <p className="text-[12px] text-slate-300">
                  Current balance: <span className="font-semibold">{usd(planSnapshot.currentBalance)}</span>
                </p>

                <p className="text-[11px] text-slate-400">
                  Progress vs plan: {planSnapshot.progressPct.toFixed(1)}% · Sessions since plan: {planSnapshot.sessionsSincePlan}
                </p>

                <p className="text-[11px] text-slate-400">
                  Trading P&amp;L: {usd(planSnapshot.tradingPnlSincePlan)} · Net cashflow: {usd(planSnapshot.netCashflows)}
                </p>
              </div>
            )}

            {/* Top tags */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[11px] text-slate-400 mb-2">Most common tags</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(analyticsSummary.tagCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([tag, count]) => (
                    <span key={tag} className="px-2 py-1 rounded-full bg-slate-800/80 text-[11px]">
                      {tag} · {count}
                    </span>
                  ))}
                {!Object.keys(analyticsSummary.tagCounts).length && (
                  <p className="text-[11px] text-slate-500">No tags yet.</p>
                )}
              </div>
            </div>

            {!snapshot && !dataLoading && (
              <p className="text-xs text-amber-300">
                You need at least one journal session saved before the coach can analyze your data.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/* =========================
   Default export with Suspense
========================= */

export default function AiCoachingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <p className="text-sm text-slate-400">Loading coach…</p>
        </div>
      }
    >
      <AiCoachingPageInner />
    </Suspense>
  );
}
