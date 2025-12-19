// app/performance/ai-coaching/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";

import { useAuth } from "@/context/AuthContext";
import TopNav from "@/app/components/TopNav";

import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";

import { getGrowthPlan, type GrowthPlan } from "@/lib/growthPlanLocal";
import {
  buildAiCoachSnapshot,
  type AiCoachSnapshot,
} from "@/lib/aiCoachSnapshotSupabase";
import {
  getProfileGamification,
  type ProfileGamification,
} from "@/lib/profileGamificationSupabase";

/* =========================
   Tipos
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

type Snapshot = {
  totalSessions: number;
  greenSessions: number;
  redSessions: number;
  winRate: number;
  byDayOfWeek: Record<string, number>;
  byInstrument: Record<string, number>;
};

type PlanSnapshot = {
  startingBalance: number;
  targetBalance: number;
  currentBalance: number;
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

function buildSnapshot(entries: JournalEntry[]): Snapshot {
  const totalSessions = entries.length;

  const byDayOfWeek: Record<string, number> = {};
  const byInstrument: Record<string, number> = {};

  let greenSessions = 0;
  let redSessions = 0;

  for (const entry of entries as any[]) {
    const d = entry.date ? new Date(entry.date) : null;
    if (d && !isNaN(d.getTime())) {
      const dow = d.getDay().toString();
      byDayOfWeek[dow] = (byDayOfWeek[dow] || 0) + 1;
    }

    if (entry.mainInstrument) {
      const key = String(entry.mainInstrument);
      byInstrument[key] = (byInstrument[key] || 0) + 1;
    }

    const result =
      (entry as any).dayResult ||
      (entry as any).summaryResult ||
      (entry as any).dailyLabel;

    if (
      result === "green" ||
      result === "win" ||
      result === "profit" ||
      result === "ganancia" ||
      result === "verde"
    ) {
      greenSessions++;
    } else if (
      result === "blue" ||
      result === "lesson learned" ||
      result === "lesson" ||
      result === "aprendizaje" ||
      result === "lección"
    ) {
      redSessions++;
    }
  }

  const totalLabeled = greenSessions + redSessions;
  const winRate = totalLabeled > 0 ? (greenSessions / totalLabeled) * 100 : 0;

  return {
    totalSessions,
    greenSessions,
    redSessions,
    winRate,
    byDayOfWeek,
    byInstrument,
  };
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

function safeUpper(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

/* Detectar idioma aproximado de la pregunta (hint para el backend) */
function detectLanguage(q: string): "es" | "en" | "auto" {
  const s = q.toLowerCase();
  if (!s.trim()) return "auto";
  if (
    /[áéíóúñü¿¡]/.test(s) ||
    /\b(qué|como|cómo|porque|por qué|cuál|días|semanas|meses|ganancia|pérdida|plan|riesgo)\b/.test(
      s
    )
  ) {
    return "es";
  }
  return "en";
}

/* Construir un perfil de usuario para que el coach pueda usar el nombre */
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
    meta.first_name ||
    fullNameOrHandle.split(" ")[0] ||
    "Trader";

  // displayName = solo el nombre para que no repita apellidos
  const displayName = firstName;

  const locale: string | null = rawUser.locale || meta.locale || null;

  return {
    id,
    email,
    displayName,
    firstName,
    locale,
  };
}

/* Analytics simple a partir de TODOS los JournalEntry (para el coach) */
function buildAnalyticsSummaryFromEntries(
  entries: JournalEntry[]
): AnalyticsSummary {
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
    const pnl = Number(e.pnl ?? 0);
    const dateStr: string = e.date || "";
    base.totalSessions += 1;
    base.sumPnl += pnl;

    if (pnl > 0) base.greenSessions += 1;
    else if (pnl < 0) base.learningSessions += 1;
    else base.flatSessions += 1;

    if (!base.bestDay || pnl > base.bestDay.pnl) {
      base.bestDay = { date: dateStr, pnl };
    }
    if (!base.toughestDay || pnl < base.toughestDay.pnl) {
      base.toughestDay = { date: dateStr, pnl };
    }

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
    const instrument: string = (e as any).instrument || (e as any).symbol || "";
    const instKey = safeUpper(instrument);
    if (instKey) {
      if (!byInstrument[instKey]) {
        byInstrument[instKey] = {
          sessions: 0,
          netPnl: 0,
          avgPnl: 0,
        };
      }
      const bucket = byInstrument[instKey];
      bucket.sessions += 1;
      bucket.netPnl += pnl;
    }

    // Tags de psicología / reglas
    const tagsRaw = (e as any).tags;
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
    if (bucket.sessions > 0) {
      bucket.avgPnl = bucket.netPnl / bucket.sessions;
    }
  }

  return {
    base,
    byDayOfWeek,
    byInstrument,
    tagCounts,
  };
}

/* =========================
   Inner page (con hooks)
========================= */

function AiCoachingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [plan, setPlan] = useState<GrowthPlan | null>(null);

  const [question, setQuestion] = useState("");
  const [coachState, setCoachState] = useState<AiCoachState>({
    loading: false,
    error: null,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Screenshot
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(
    null
  );

  // AI context snapshots
  const [fullSnapshot, setFullSnapshot] = useState<AiCoachSnapshot | null>(
    null
  );
  const [gamification, setGamification] = useState<ProfileGamification | null>(
    null
  );

  const [dataLoading, setDataLoading] = useState<boolean>(true);

  const [coachUserProfile, setCoachUserProfile] =
    useState<UserProfileForCoach | null>(null);

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
      backStudyParams.tf
        ? `- Chart timeframe selected: ${backStudyParams.tf}`
        : null,
      backStudyParams.range
        ? `- Historical range loaded: ${backStudyParams.range}`
        : null,
      "If an image is attached, it is a screenshot of this back-study chart with green/blue arrows marking entry and exit.",
    ];

    return lines.filter(Boolean).join("\n");
  }, [backStudyParams]);

  /* ---------- Protección de ruta ---------- */
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/signin");
    }
  }, [authLoading, user, router]);

  /* ---------- Cargar journal entries (Supabase) + plan + snapshots ---------- */
  useEffect(() => {
    if (authLoading || !user) return;

    const loadAll = async () => {
      try {
        setDataLoading(true);

        const profile = buildUserProfileForCoach(user);
        setCoachUserProfile(profile);

        const userId =
          (user as any)?.uid || (user as any)?.id || (user as any)?.email || "";

        if (!userId) {
          setEntries([]);
        } else {
          const all = await getAllJournalEntries(userId);
          setEntries(all);
        }

        const p = getGrowthPlan();
        setPlan(p || null);

        // ✅ Snapshot completo desde Supabase (ANTES era local)
        const full = await buildAiCoachSnapshot(userId);
        setFullSnapshot(full);

        // ✅ Gamificación desde Supabase (ANTES era local)
        const g = await getProfileGamification(userId);
        setGamification(g);
      } catch (err) {
        console.error("[AI Coaching] Error loading data:", err);
        setEntries([]);
      } finally {
        setDataLoading(false);
      }
    };

    void loadAll();
  }, [authLoading, user]);

  const snapshot = useMemo(() => {
    if (!entries.length) return null;
    return buildSnapshot(entries);
  }, [entries]);

  // Últimas 15 sesiones completas
  const recentSessions = useMemo(() => {
    if (!entries.length) return [];
    const sorted = [...entries].sort((a: any, b: any) =>
      String(a.date || "").localeCompare(String(b.date || ""))
    );
    return sorted.slice(-15).reverse();
  }, [entries]);

  const planSnapshot: PlanSnapshot | null = useMemo(() => {
    if (!plan) return null;
    const startingBalance = Number((plan as any).startingBalance || 0);
    const targetBalance = Number((plan as any).targetBalance || 0);

    const planStartDate =
      typeof (plan as any).createdAt === "string"
        ? (plan as any).createdAt.slice(0, 10)
        : null;

    const filtered = planStartDate
      ? entries.filter((e) => e.date >= planStartDate)
      : entries;

    const totalPnl = filtered.reduce((sum, e) => sum + (e.pnl ?? 0), 0);

    const currentBalance = startingBalance + totalPnl;

    const progressPct =
      targetBalance > startingBalance
        ? ((currentBalance - startingBalance) /
            (targetBalance - startingBalance)) *
          100
        : 0;

    const winsSincePlan = filtered.filter((e) => (e.pnl ?? 0) > 0).length;
    const lossesSincePlan = filtered.filter((e) => (e.pnl ?? 0) < 0).length;
    const flatsSincePlan = filtered.length - winsSincePlan - lossesSincePlan;

    return {
      startingBalance,
      targetBalance,
      currentBalance,
      progressPct,
      sessionsSincePlan: filtered.length,
      winsSincePlan,
      lossesSincePlan,
      flatsSincePlan,
      planStartDate,
    };
  }, [plan, entries]);

  // Analytics globales para el coach (toda la data de journal)
  const analyticsSummary: AnalyticsSummary = useMemo(
    () => buildAnalyticsSummaryFromEntries(entries),
    [entries]
  );

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
    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
    }
    setScreenshotPreview(null);
  }

  /* ---------- Handler para llamar al API ---------- */

  async function handleAskCoach() {
    if (!snapshot || !recentSessions.length || !fullSnapshot || coachState.loading) {
      return;
    }
    if (!question.trim() && !screenshotFile) return;

    try {
      const finalQuestion = question.trim();
      const languageHint = detectLanguage(finalQuestion);

      const userMsg: ChatMessage = {
        id: makeId(),
        role: "user",
        text:
          finalQuestion ||
          "(No specific question, just analyze the attached screenshot and my recent data.)",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setQuestion("");
      setCoachState({ loading: true, error: null });

      let screenshotBase64: string | undefined;
      if (screenshotFile) {
        screenshotBase64 = await fileToDataUrl(screenshotFile);
      }

      const res = await fetch("/api/ai-coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          // mini snapshot estadístico simple
          snapshot,
          // snapshot completo de tu plataforma (journal + analytics + widgets + challenges + rules/alarms + resources)
          fullSnapshot,
          // sesiones recientes completas
          recentSessions,
          // growth plan
          planSnapshot,
          // gamificación (niveles, badges, retos, progreso de challenges)
          gamification,
          // analytics globales
          analyticsSummary,
          // perfil del usuario (usar solo el nombre)
          userProfile: coachUserProfile,
          // contexto de back-study (symbol, date, timeframe, rango, ventana de trade)
          backStudyContext,
          // pregunta escrita
          question: finalQuestion,
          // screenshot opcional (idealmente la gráfica de back-study)
          screenshotBase64,
          // idioma (hint)
          language: languageHint,
          // Hints de estilo para el modelo (útil en el system prompt del backend)
          stylePreset: {
            mode: "conversational-trading-coach",
            // Responder paso a paso y cerrar con una pregunta abierta
            askFollowupQuestion: true,
            shortSegments: true,
          },
          // Enfoque de coaching: usar challenges, analytics y el back-study
          coachingFocus: {
            useChallengesAndGamification: true,
            useAnalyticsSummary: true,
            evaluateExitTimingFromChart: true,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          data?.details || data?.error || "There was an error contacting the AI coach.";
        throw new Error(msg);
      }

      const coachMsg: ChatMessage = {
        id: makeId(),
        role: "coach",
        text: data.text || "No response text received.",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, coachMsg]);
      setCoachState({
        loading: false,
        error: null,
      });
    } catch (err: any) {
      console.error("AI coach request error:", err);
      setCoachState({
        loading: false,
        error: err?.message || "Unknown error",
      });
    }
  }

  /* =========================
     Render
  ========================== */

  const isDisabled =
    dataLoading ||
    !snapshot ||
    !recentSessions.length ||
    !fullSnapshot ||
    coachState.loading ||
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
                Get practical coaching on risk, psychology and process, using your own
                journal statistics, challenges and growth plan.
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

        {/* Pill con contexto del back-study, si viene de esa página */}
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
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 flex flex-col max-h-[70vh]">
            {/* Chat header */}
            <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-100">Live coaching</p>
                <p className="text-xs text-slate-400">
                  Ask specific questions, share screenshots, and get short, focused
                  feedback. Puedes escribir en español o inglés.
                </p>
              </div>
              <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
                Online
              </span>
            </div>

            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {!messages.length && !coachState.error && (
                <p className="text-xs text-slate-500">
                  Start by typing a question (for example:{" "}
                  <span className="italic">
                    “What do I need to improve in my last 5 sessions?”
                  </span>{" "}
                  or{" "}
                  <span className="italic">
                    “How am I doing vs my growth plan, challenges and the latest
                    back-study trade?”
                  </span>
                  ). You can also attach a screenshot of a trade (idealmente la
                  gráfica con las flechas de entrada/salida). Puedes escribir en
                  español sin problema.
                </p>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-emerald-500 text-slate-950 rounded-br-sm"
                        : "bg-slate-800 text-slate-100 rounded-bl-sm"
                    }`}
                  >
                    {msg.role === "coach" ? (
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    ) : (
                      msg.text
                    )}
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
                    placeholder="Ask your coach about your last trades, emotions, challenges, or how you're doing vs your plan and the latest back-study trade... (puedes escribir en español)"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                  <div className="w-32 flex flex-col items-center gap-2">
                    <label className="w-full text-[11px] text-center rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-2 py-2 cursor-pointer hover:border-emerald-400 hover:text-emerald-200">
                      <span className="block mb-1">Screenshot</span>
                      <span className="text-[10px] text-slate-400">
                        Chart, PnL, platform
                      </span>
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

          {/* Side panel con stats y contexto */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4">
            <h2 className="text-sm font-medium text-slate-200 flex items-center justify-between">
              Session snapshot
              <span className="text-[10px] text-slate-400">
                Last {recentSessions.length} sessions
              </span>
            </h2>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Total sessions</p>
                <p className="text-xl font-semibold">
                  {snapshot?.totalSessions ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-800/60 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Green</p>
                <p className="text-xl font-semibold">
                  {snapshot?.greenSessions ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-sky-800/60 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Blue</p>
                <p className="text-xl font-semibold">
                  {snapshot?.redSessions ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Win rate (est.)</p>
                <p className="text-xl font-semibold">
                  {snapshot ? `${snapshot.winRate.toFixed(1)}%` : "—"}
                </p>
              </div>
            </div>

            {snapshot && (
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] text-slate-400 mb-1">
                    Sessions by weekday
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(snapshot.byDayOfWeek).map(([dow, count]) => (
                      <span
                        key={dow}
                        className="px-2 py-1 rounded-full bg-slate-800/80 text-[11px]"
                      >
                        {formatDayLabel(dow)} · {count}
                      </span>
                    ))}
                    {!Object.keys(snapshot.byDayOfWeek).length && (
                      <p className="text-[11px] text-slate-500">
                        No day-of-week data yet.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-slate-400 mb-1">
                    Most used instruments
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(snapshot.byInstrument)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([inst, count]) => (
                        <span
                          key={inst}
                          className="px-2 py-1 rounded-full bg-slate-800/80 text-[11px]"
                        >
                          {inst} · {count}
                        </span>
                      ))}
                    {!Object.keys(snapshot.byInstrument).length && (
                      <p className="text-[11px] text-slate-500">
                        No instrument data detected.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {planSnapshot && (
              <div className="mt-2 rounded-xl border border-emerald-700 bg-slate-950/70 p-3 space-y-1">
                <p className="text-[11px] text-emerald-300 font-semibold">
                  Plan vs current
                </p>
                <p className="text-[12px] text-slate-300">
                  Start:{" "}
                  <span className="font-semibold">
                    ${planSnapshot.startingBalance.toFixed(2)}
                  </span>{" "}
                  · Target:{" "}
                  <span className="font-semibold text-emerald-300">
                    ${planSnapshot.targetBalance.toFixed(2)}
                  </span>
                </p>
                <p className="text-[12px] text-slate-300">
                  Current balance:{" "}
                  <span className="font-semibold">
                    ${planSnapshot.currentBalance.toFixed(2)}
                  </span>
                </p>
                <p className="text-[11px] text-slate-400">
                  Progress vs plan: {planSnapshot.progressPct.toFixed(1)}%
                </p>
              </div>
            )}

            {gamification && (
              <div className="mt-2 rounded-xl border border-emerald-700/60 bg-slate-950/70 p-3 space-y-1">
                <p className="text-[11px] text-emerald-300 font-semibold">
                  Challenges & rewards
                </p>
                <p className="text-[12px] text-slate-300">
                  Level{" "}
                  <span className="font-semibold">{gamification.level}</span> ·
                  Tier <span className="font-semibold">{gamification.tier}</span>
                </p>
                <p className="text-[11px] text-slate-400">
                  Total XP: {gamification.xp.toLocaleString()}
                </p>
                {Array.isArray(gamification.badges) && gamification.badges.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {gamification.badges.map((b) => (
                      <span
                        key={b}
                        className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!snapshot && !dataLoading && (
              <p className="text-xs text-amber-300">
                You need at least one journal session saved before the coach can
                analyze your data.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/* =========================
   Default export con Suspense
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
