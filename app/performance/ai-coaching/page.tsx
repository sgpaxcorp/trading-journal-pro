// app/performance/ai-coaching/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

import { useAuth } from "@/context/AuthContext";
import TopNav from "@/app/components/TopNav";
import {
  getAllJournalEntries,
  type JournalEntry,
} from "@/lib/journalLocal";
import {
  getGrowthPlan,
  type GrowthPlan,
} from "@/lib/growthPlanLocal";

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

/* =========================
   Helpers
========================= */

const QUICK_PROMPTS: string[] = [
  "Based on my last sessions, what is the main thing I should change?",
  "Looking only at recent data, what is my biggest psychological leak?",
  "How am I doing vs my plan, and what should I adjust this week?",
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

    if (result === "green" || result === "win" || result === "profit") {
      greenSessions++;
    } else if (result === "blue" || result === "lesson learned" || result === "lesson learned") {
      redSessions++;
    }
  }

  const totalLabeled = greenSessions + redSessions;
  const winRate =
    totalLabeled > 0 ? (greenSessions / totalLabeled) * 100 : 0;

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

/* =========================
   Page component
========================= */

export default function AiCoachingPage() {
  const router = useRouter();
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

  /* ---------- Protección de ruta ---------- */
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/signin");
    }
  }, [authLoading, user, router]);

  /* ---------- Cargar journal entries + plan ---------- */
  useEffect(() => {
    const all = getAllJournalEntries();
    setEntries(all);
    const p = getGrowthPlan();
    setPlan(p || null);
  }, []);

  const snapshot = useMemo(() => {
    if (!entries.length) return null;
    return buildSnapshot(entries);
  }, [entries]);

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

    const totalPnl = filtered.reduce(
      (sum, e) => sum + (e.pnl ?? 0),
      0
    );

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
    if (!snapshot || !recentSessions.length || coachState.loading) return;
    if (!question.trim() && !screenshotFile) return;

    try {
      const finalQuestion = question.trim();

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
          snapshot,
          recentSessions,
          planSnapshot,
          question: finalQuestion,
          screenshotBase64,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          data?.details ||
          data?.error ||
          "There was an error contacting the AI coach.";
        throw new Error(msg);
      }

      const coachMsg: ChatMessage = {
        id: makeId(),
        role: "coach",
        text: data.text || "No response text received.",
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, coachMsg]);
      setCoachState({ loading: false, error: null });
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
  ========================= */

  const isDisabled =
    !snapshot ||
    !recentSessions.length ||
    coachState.loading ||
    (!question.trim() && !screenshotFile);

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
              <h1 className="text-2xl font-semibold">
                Your AI Trading Coach
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Get practical coaching on risk, psychology and process,
                using your own journal statistics and growth plan.
              </p>
            </div>
          </div>

          <Link
            href="/performance/analytics-statistics"
            className="text-xs rounded-full border border-slate-700 px-3 py-1 hover:bg-slate-800"
          >
            ← Back to Analytics
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-4">
          {/* Chat panel */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 flex flex-col max-h-[70vh]">
            {/* Chat header */}
            <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-100">
                  Live coaching
                </p>
                <p className="text-xs text-slate-400">
                  Ask specific questions, share screenshots, and get
                  short, focused feedback.
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
                    “How am I doing vs my growth plan?”
                  </span>
                  ). You can also attach a screenshot of a trade.
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
                  <div className="text-xs text-sky-300">
                    {coachState.error}
                  </div>
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
                    placeholder="Ask your coach about your last trades, emotions, or how you're doing vs your plan..."
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
                    {coachState.loading
                      ? "Coaching..."
                      : "Send to AI coach"}
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
              {/* AQUÍ CAMBIÉ EL ROJO A AZUL */}
              <div className="rounded-xl border border-sky-800/60 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">Red</p>
                <p className="text-xl font-semibold">
                  {snapshot?.redSessions ?? 0}
                </p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">
                  Win rate (est.)
                </p>
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
                    {Object.entries(snapshot.byDayOfWeek).map(
                      ([dow, count]) => (
                        <span
                          key={dow}
                          className="px-2 py-1 rounded-full bg-slate-800/80 text-[11px]"
                        >
                          {formatDayLabel(dow)} · {count}
                        </span>
                      )
                    )}
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
                  Progress vs plan:{" "}
                  {planSnapshot.progressPct.toFixed(1)}%
                </p>
              </div>
            )}

            {!snapshot && (
              <p className="text-xs text-amber-300">
                You need at least one journal session saved before the coach
                can analyze your data.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
