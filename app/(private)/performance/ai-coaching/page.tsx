// app/performance/ai-coaching/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useAuth } from "@/context/AuthContext";
import { useTradingAccounts } from "@/hooks/useTradingAccounts";
import { useUserPlan } from "@/hooks/useUserPlan";
import TopNav from "@/app/components/TopNav";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries, getJournalEntryByDate } from "@/lib/journalSupabase";
import { getJournalTradesForDay } from "@/lib/journalTradesSupabase";
import type { TradesPayload } from "@/lib/journalNotes";
import { computeAllKPIs, type KPIResult } from "@/lib/kpiLibrary";
import { buildCashflowAdjustedDailyReturns } from "@/lib/performanceReturns";
import {
  buildKpiTrades,
  computeTradeAnalytics,
  type JournalTradeRow,
  type TradeAnalytics,
} from "@/lib/tradeAnalytics";

import { supabaseBrowser } from "@/lib/supaBaseClient";

import {
  buildAiCoachSnapshot,
  type AiCoachSnapshot,
} from "@/lib/aiCoachSnapshotSupabase";
import {
  getDefaultExecutionSystem,
  upsertGrowthPlanSupabase,
  type GrowthPlanChecklistItem,
} from "@/lib/growthPlanSupabase";
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
  listAiCoachFeedbackForThread,
  listAiCoachMessages,
  listAiCoachThreads,
  type AiCoachThreadRow,
} from "@/lib/aiCoachChatSupabase";
import {
  computeNeuroSummary,
  getNeuroInsightText,
  normalizeNeuroLayer,
} from "@/lib/neuroLayer";

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
  meta?: {
    actionPlan?: CoachActionPlanMeta | null;
    autoAudit?: CoachAutoAuditMeta | null;
  } | null;
};

type CoachActionPlanMeta = {
  summary?: string;
  nextAction?: string;
  ruleToAdd?: string;
  ruleToRemove?: string;
  checkpointFocus?: string;
};

type CoachAutoAuditMeta = {
  attached?: boolean;
  date?: string | null;
  instrument?: string | null;
  summary?: string;
  processScore?: number | null;
  disciplineScore?: number | null;
  eventCount?: number;
};

type PlanRuleActionState = {
  kind: "success" | "info" | "error";
  message: string;
} | null;

type CoachMemoryView = {
  global?: string;
  weekly?: string;
  daily?: string;
  dailyKey?: string;
  weeklyKey?: string;
  updatedAt?: string;
  disabled?: boolean;
};

type GrowthPlanRow = {
  id: string;
  user_id: string;
  starting_balance: number | string | null;
  target_balance: number | string | null;
  target_date?: string | null;
  plan_start_date?: string | null;
  plan_mode?: "auto" | "manual" | string | null;
  daily_target_pct: number | string | null;
  daily_goal_percent: number | string | null;
  max_daily_loss_percent: number | string | null;
  max_risk_per_trade_percent?: number | string | null;
  max_risk_per_trade_usd: number | string | null;
  trading_days?: number | string | null;
  loss_days_per_week?: number | string | null;
  rules?: Array<{
    id?: string;
    label?: string;
    description?: string;
    isActive?: boolean;
  }> | null;
  steps?: Record<string, any> | null;
  plan_phases?: Array<Record<string, any>> | null;
  planned_withdrawal_settings?: Record<string, any> | null;
  planned_withdrawals?: Array<Record<string, any>> | null;
  created_at: string | null;
  updated_at: string | null;
};

type CoachMode =
  | "plan-rescue"
  | "weekly-review"
  | "risk-discipline"
  | "execution-truth"
  | "psychology-patterns";

type CoachRangePreset = "plan" | "last30" | "last90" | "all";
type CoachConversationLanguage = "auto" | "es" | "en";

type CoachPromptTemplate = {
  id: string;
  label: string;
  prompt: string;
  mode: CoachMode;
  range: CoachRangePreset;
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

type AccountSeriesTotals = {
  tradingPnl: number;
  cashflowNet: number;
  currentBalance: number;
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
    avgWin: number;
    avgLesson: number;
    profitFactor: number | null;
    expectancy: number | null;
    breakevenRate: number;
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

type CoachAnalyticsSnapshot = {
  updatedAtIso: string;
  range: {
    startIso: string;
    endIso: string;
    source: "ALL" | "PLAN" | "CUSTOM";
  };
  totals: {
    sessions: number;
    wins: number;
    losses: number;
    breakevens: number;
    winRate: number;
    grossPnl: number;
    netPnl: number;
    totalFees: number;
    avgNetPerSession: number;
  };
  performance: {
    avgWin: number;
    avgLoss: number;
    profitFactor: number | null;
    expectancy: number | null;
    bestDay: { date: string; pnl: number } | null;
    worstDay: { date: string; pnl: number } | null;
  };
  risk: {
    maxDrawdown: number;
    maxDrawdownPct: number;
    longestWinStreak: number;
    longestLossStreak: number;
    maxWin: number;
    maxLoss: number;
  };
  time: {
    byDayOfWeek: Array<{ dow: string; sessions: number; pnl: number; winRate: number }>;
    byHour: Array<{ hour: string; sessions: number; pnl: number; winRate: number }>;
  };
  instruments: {
    byInstrument: Array<{ instrument: string; sessions: number; netPnl: number; avgPnl: number }>;
  };
  dataQuality: {
    hasCashflows: boolean;
    hasEntryTimestamps: boolean;
  };
};

type PeriodWindowStats = {
  startIso: string;
  endIso: string;
  sessions: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  netPnl: number;
  avgNet: number;
  tradeCount?: number | null;
  avgHoldMins?: number | null;
  avgHoldWinMins?: number | null;
  avgHoldLossMins?: number | null;
  pnlPerHour?: number | null;
  tradesWithTime?: number | null;
  tradesWithoutTime?: number | null;
  kpis?: Record<string, KPIResult>;
};

type PeriodComparison = {
  label: string;
  current: PeriodWindowStats;
  previous: PeriodWindowStats;
  delta: {
    sessions: number;
    winRate: number;
    netPnl: number;
    avgNet: number;
    avgHoldWinMins?: number | null;
    avgHoldLossMins?: number | null;
    pnlPerHour?: number | null;
  };
  kpiDeltas?: Array<{
    id: string;
    name: string;
    dataType: string;
    unit: string;
    current: number;
    previous: number;
    delta: number;
  }>;
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

type YahooCandle = {
  time: number; // ms since epoch (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
};

function parseNotesJson(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}

function toShortList(raw: any, max = 6): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean).slice(0, max);
  if (typeof raw === "string") return raw.split(",").map((x) => x.trim()).filter(Boolean).slice(0, max);
  return [];
}

function clampRating(raw: any): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function timeToMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const match = s.match(/(\d{1,2}):(\d{2})(?:\s*([APap][Mm]))?/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const ampm = match[3]?.toUpperCase();
  let hour = h;
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return hour * 60 + m;
}

function fmtTradeLine(t: any, prefix: string) {
  const time = t.time ? String(t.time) : "—";
  const symbol = String(t.symbol ?? "").trim() || "—";
  const kind = t.kind ? String(t.kind) : "—";
  const side = t.side ? String(t.side) : "—";
  const premium = t.premiumSide ? String(t.premiumSide) : "—";
  const strategy = t.optionStrategy ? String(t.optionStrategy) : "—";
  const price = Number.isFinite(Number(t.price)) ? Number(t.price).toFixed(2) : "—";
  const qty = Number.isFinite(Number(t.quantity)) ? Number(t.quantity) : "—";
  return `${prefix} ${time} | ${symbol} | ${kind} | ${side} | ${premium} | ${strategy} | ${price} x ${qty}`;
}

function safeUpper(s: string | null | undefined) {
  return (s || "").trim().toUpperCase();
}

function normalizeUnderlyingForYahoo(symbol: string): string {
  const raw = safeUpper(symbol).replace(/\s+/g, "");
  if (!raw) return raw;

  let s = raw.replace(/^[\.\-]/, "").replace(/^\//, "");

  // Common index mappings
  if (s === "SPX" || s === "SPXW") return "^SPX";
  if (s === "NDX") return "^NDX";
  if (s === "RUT") return "^RUT";
  if (s === "DJI" || s === "DOW" || s === "DJX") return "^DJI";

  const FUT_ROOTS = [
    "ES",
    "MES",
    "NQ",
    "MNQ",
    "YM",
    "MYM",
    "RTY",
    "M2K",
    "CL",
    "MCL",
    "GC",
    "MGC",
    "SI",
  ];

  if (FUT_ROOTS.some((r) => s.startsWith(r))) {
    if (!s.endsWith("=F")) return `${s}=F`;
  }

  return s;
}

const LOCAL_TZ_OFFSET_MIN = new Date().getTimezoneOffset();

function shiftMsToLocal(ms: number): number {
  return ms - LOCAL_TZ_OFFSET_MIN * 60 * 1000;
}

function minutesFromMsLocal(ms: number): number {
  const d = new Date(shiftMsToLocal(ms));
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function minutesToClock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function mapTfToInterval(tf?: string | null): string {
  if (!tf) return "5m";
  if (tf === "1m") return "1m";
  if (tf === "5m") return "5m";
  if (tf === "15m") return "15m";
  if (tf === "1h" || tf === "4h") return "60m";
  if (tf === "1d") return "1d";
  return "5m";
}

function getLocalDayRangeSeconds(dateStr: string): { period1: number; period2: number } | null {
  const start = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    period1: Math.floor(start.getTime() / 1000),
    period2: Math.floor(end.getTime() / 1000),
  };
}

function findClosestCandle(
  candles: YahooCandle[],
  targetMinutes: number
): { candle: YahooCandle; minutes: number; delta: number } | null {
  let best: { candle: YahooCandle; minutes: number; delta: number } | null = null;
  for (const c of candles) {
    const mins = minutesFromMsLocal(c.time);
    const delta = mins - targetMinutes;
    const abs = Math.abs(delta);
    if (!best || abs < Math.abs(best.delta)) {
      best = { candle: c, minutes: mins, delta };
    }
  }
  return best;
}

/* =========================
   Helpers
========================= */

function getSmartPromptGroups(isEs: boolean): {
  primary: CoachPromptTemplate[];
  neuro: CoachPromptTemplate[];
} {
  if (isEs) {
    return {
      primary: [
        {
          id: "checkpoint-rescue",
          label: "Rescatar el checkpoint",
          prompt:
            "Analiza mi journal y mi Growth Plan para decirme qué amenaza más mi próximo checkpoint. Quiero el patrón principal, la evidencia del journal y la acción concreta para la próxima sesión.",
          mode: "plan-rescue",
          range: "plan",
        },
        {
          id: "costly-behavior",
          label: "Conducta más costosa",
          prompt:
            "Tomando los últimos 30 días, ¿cuál es la conducta que más me está costando probabilidad de cumplir el Growth Plan? Dímelo con evidencia y con una regla operativa concreta.",
          mode: "plan-rescue",
          range: "last30",
        },
        {
          id: "risk-vs-plan",
          label: "Riesgo vs plan",
          prompt:
            "Compara mi ejecución reciente con los risk rails de mi Growth Plan. Quiero saber dónde estoy filtrando edge en size, pérdida diaria, frecuencia o disciplina.",
          mode: "risk-discipline",
          range: "last30",
        },
        {
          id: "tomorrow-protection",
          label: "Plan para mañana",
          prompt:
            "Usando mis sesiones recientes, dime qué debe proteger mi plan de trading de mañana para evitar repetir mis errores más costosos.",
          mode: "weekly-review",
          range: "last30",
        },
        {
          id: "rule-swap",
          label: "Regla para añadir y quitar",
          prompt:
            "Si fueras mi performance coach, ¿qué regla exacta agregarías hoy a mi sistema y qué regla quitarías o endurecerías para mejorar mi cumplimiento del plan?",
          mode: "plan-rescue",
          range: "last90",
        },
      ],
      neuro: [
        {
          id: "execution-truth-gap",
          label: "Verdad de ejecución",
          prompt:
            "Usa execution truth sobre mis sesiones recientes y dime dónde más se separó mi plan de mi comportamiento real.",
          mode: "execution-truth",
          range: "last30",
        },
        {
          id: "emotion-drift",
          label: "Patrón emocional",
          prompt:
            "Lee el drift emocional en mi journal y dime qué patrón psicológico aparece antes de mis peores decisiones.",
          mode: "psychology-patterns",
          range: "last90",
        },
        {
          id: "red-day-diagnosis",
          label: "Diagnóstico de días rojos",
          prompt:
            "Audita mis sesiones perdedoras y dime si el problema dominante es entradas, salidas, size, manejo o estado mental.",
          mode: "execution-truth",
          range: "last90",
        },
        {
          id: "premarket-focus",
          label: "Foco pre-market",
          prompt:
            "Sintetiza mi journal, mi capa Neuro y mis resultados en un foco concreto de pre-market para mañana.",
          mode: "psychology-patterns",
          range: "last30",
        },
      ],
    };
  }

  return {
    primary: [
      {
        id: "checkpoint-rescue",
        label: "Rescue the checkpoint",
        prompt:
          "Analyze my journal and Growth Plan to tell me what is threatening my next checkpoint most. I want the main pattern, the journal evidence, and the one action I should take next session.",
        mode: "plan-rescue",
        range: "plan",
      },
      {
        id: "costly-behavior",
        label: "Most expensive behavior",
        prompt:
          "Using the last 30 days, what behavior is costing me the most probability of hitting my Growth Plan? Show me the evidence and turn it into one concrete operating rule.",
        mode: "plan-rescue",
        range: "last30",
      },
      {
        id: "risk-vs-plan",
        label: "Risk vs plan",
        prompt:
          "Compare my recent execution with the risk rails in my Growth Plan. I want to know where I am leaking edge in size, daily loss discipline, frequency, or rule adherence.",
        mode: "risk-discipline",
        range: "last30",
      },
      {
        id: "tomorrow-protection",
        label: "Tomorrow protection plan",
        prompt:
          "Use my recent sessions to tell me what tomorrow's trading plan needs to protect me from so I stop repeating my most expensive mistakes.",
        mode: "weekly-review",
        range: "last30",
      },
      {
        id: "rule-swap",
        label: "Rule to add and remove",
        prompt:
          "If you were my performance coach, what exact rule would you add to my system today and what rule would you remove or tighten to improve plan adherence?",
        mode: "plan-rescue",
        range: "last90",
      },
    ],
    neuro: [
      {
        id: "execution-truth-gap",
        label: "Execution truth",
        prompt:
          "Use execution truth across my recent sessions and tell me where my plan and my real behavior diverged the most.",
        mode: "execution-truth",
        range: "last30",
      },
      {
        id: "emotion-drift",
        label: "Emotional drift pattern",
        prompt:
          "Read the emotional drift in my journal and tell me which psychological pattern appears before my worst decisions.",
        mode: "psychology-patterns",
        range: "last90",
      },
      {
        id: "red-day-diagnosis",
        label: "Red-day diagnosis",
        prompt:
          "Audit my losing sessions and tell me whether the dominant problem is entries, exits, sizing, management, or state of mind.",
        mode: "execution-truth",
        range: "last90",
      },
      {
        id: "premarket-focus",
        label: "Pre-market focus",
        prompt:
          "Synthesize my journal, Neuro layer, and results into one concrete pre-market focus for tomorrow.",
        mode: "psychology-patterns",
        range: "last30",
      },
    ],
  };
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function normalizePlanRuleText(raw: string | null | undefined): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
}


/* =========================
   Markdown rendering (coach output)
   - Styled bullets + tables (GFM) + code blocks
   - Keeps output clean and "Wall Street terminal" readable
========================= */

const COACH_MD_COMPONENTS: any = {
  h1: (props: any) => <h2 className="text-base font-semibold text-slate-100 mt-3 mb-2" {...props} />,
  h2: (props: any) => <h3 className="text-sm font-semibold text-slate-100 mt-3 mb-2" {...props} />,
  h3: (props: any) => <h4 className="text-sm font-semibold text-slate-100 mt-3 mb-2" {...props} />,
  p: (props: any) => <p className="text-sm leading-relaxed my-2 text-slate-100" {...props} />,
  ul: (props: any) => <ul className="list-disc pl-5 my-2 space-y-1 text-slate-100" {...props} />,
  ol: (props: any) => <ol className="list-decimal pl-5 my-2 space-y-1 text-slate-100" {...props} />,
  li: (props: any) => <li className="leading-relaxed" {...props} />,
  strong: (props: any) => <strong className="text-slate-50 font-semibold" {...props} />,
  em: (props: any) => <em className="text-slate-200" {...props} />,
  a: (props: any) => (
    <a
      className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  code: ({ inline, className, children, ...props }: any) => {
    if (inline) {
      return (
        <code className="rounded bg-slate-950/70 px-1 py-0.5 text-[12px] text-emerald-200" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  pre: (props: any) => (
    <pre className="my-3 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-[12px] leading-relaxed text-slate-100" {...props} />
  ),
  table: ({ children, ...props }: any) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-slate-700 bg-slate-950/40">
      <table className="w-full border-collapse text-[12px]" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: (props: any) => <thead className="bg-slate-950/60" {...props} />,
  tbody: (props: any) => <tbody {...props} />,
  tr: (props: any) => <tr className="border-t border-slate-700/70" {...props} />,
  th: (props: any) => <th className="px-3 py-2 text-left text-[11px] uppercase tracking-[0.18em] text-slate-300" {...props} />,
  td: (props: any) => <td className="px-3 py-2 text-slate-100 align-top" {...props} />,
  hr: (props: any) => <hr className="my-3 border-slate-700/70" {...props} />,
  blockquote: (props: any) => (
    <blockquote className="my-3 border-l-2 border-emerald-500/60 pl-3 text-slate-200" {...props} />
  ),
};

function CoachMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COACH_MD_COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
}
function clampText(s: any, max = 900): string {
  const t = (s ?? "").toString();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function startOfMonthIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(1);
  return isoDate(d);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function shiftMonthsIso(iso: string, deltaMonths: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setMonth(d.getMonth() + deltaMonths);
  return isoDate(d);
}

function stripHtml(input?: string | null): string {
  if (!input) return "";
  return String(input).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseCostsFromNotes(notes: Record<string, any> | null) {
  const fees = Number(notes?.costs?.fees ?? notes?.fees ?? 0);
  const commissions = Number(notes?.costs?.commissions ?? notes?.commissions ?? 0);
  return {
    fees: Number.isFinite(fees) ? fees : 0,
    commissions: Number.isFinite(commissions) ? commissions : 0,
  };
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
  // Keep this consistent with /api/account/series and Balance Chart.
  // Plan start is anchored to created_at; fallback to updated_at only if needed.
  const c = dateIsoFromAny(plan.created_at);
  const u = dateIsoFromAny(plan.updated_at);
  return c || u || null;
}

function formatDayLabel(dow: string) {
  const n = Number(dow);
  if (!Number.isFinite(n)) return dow;
  const locale =
    typeof document !== "undefined"
      ? document.documentElement.lang || "en"
      : "en";
  try {
    const d = new Date();
    const shift = (d.getDay() - n + 7) % 7;
    d.setDate(d.getDate() - shift);
    return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(d);
  } catch {
    const fallback: Record<number, string> = {
      0: "Sunday",
      1: "Monday",
      2: "Tuesday",
      3: "Wednesday",
      4: "Thursday",
      5: "Friday",
      6: "Saturday",
    };
    return fallback[n] ?? dow;
  }
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
  const direct =
    entry?.pnlNet ??
    entry?.netPnl ??
    entry?.pnl ??
    null;
  const directNum = Number(direct);
  if (Number.isFinite(directNum)) return directNum;

  const notes = parseNotesJson(entry?.notes);
  const noteNet = Number(notes?.pnl?.net ?? notes?.pnl_net);
  if (Number.isFinite(noteNet)) return noteNet;

  const noteGross = Number(notes?.pnl?.gross ?? notes?.pnl_gross);
  if (Number.isFinite(noteGross)) {
    const costs = parseCostsFromNotes(notes);
    return noteGross - (costs.fees + costs.commissions);
  }

  return 0;
}

/* A compact session object to send to the backend (keeps tokens reasonable) */
function normalizeTradeForCoach(raw: any) {
  const priceNum = Number(raw?.price);
  const qtyNum = Number(raw?.quantity);
  const dteNum = Number(raw?.dte);

  return {
    time: clampText(raw?.time, 12),
    symbol: safeUpper(String(raw?.symbol ?? "")),
    kind: String(raw?.kind ?? "").trim(),
    side: String(raw?.side ?? "").trim(),
    premium: String(raw?.premiumSide ?? raw?.premium ?? "").trim(),
    strategy: String(raw?.optionStrategy ?? raw?.strategy ?? "").trim(),
    price: Number.isFinite(priceNum) ? Number(priceNum.toFixed(2)) : null,
    quantity: Number.isFinite(qtyNum) ? qtyNum : null,
    dte: Number.isFinite(dteNum) ? dteNum : null,
    emotions: Array.isArray(raw?.emotions) ? raw.emotions.slice(0, 6) : [],
    checklist: Array.isArray(raw?.strategyChecklist) ? raw.strategyChecklist.slice(0, 6) : [],
  };
}

function compactSessionForAi(entry: any, tradesForDate?: TradesPayload | null) {
  const date = String(entry?.date || "");
  const pnl = sessionNetPnl(entry);

  const instrument =
    entry?.mainInstrument ||
    entry?.instrument ||
    entry?.symbol ||
    entry?.ticker ||
    "";

  const tags = Array.isArray(entry?.tags) ? entry.tags.slice(0, 20) : [];

  const parsedNotes = parseNotesJson(entry?.notes);
  const premarketFromNotes =
    typeof parsedNotes?.premarket === "string" ? stripHtml(parsedNotes.premarket) : "";
  const liveFromNotes =
    typeof parsedNotes?.live === "string" ? stripHtml(parsedNotes.live) : "";
  const postFromNotes =
    typeof parsedNotes?.post === "string" ? stripHtml(parsedNotes.post) : "";

  const rawChecklists =
    parsedNotes?.checklists ||
    parsedNotes?.journal_checklists ||
    parsedNotes?.journalChecklists ||
    parsedNotes?.checklist ||
    {};
  const rawMindset =
    parsedNotes?.mindset ||
    parsedNotes?.journal_mindset ||
    parsedNotes?.journalMindset ||
    {};
  const rawNeuroLayer =
    parsedNotes?.neuro_layer ||
    parsedNotes?.neuroLayer ||
    {};

  const checklist = {
    premarket: toShortList(rawChecklists?.premarket, 6),
    inside: toShortList(rawChecklists?.inside, 6),
    after: toShortList(rawChecklists?.after, 6),
    strategy: toShortList(rawChecklists?.strategy, 6),
    impulses: toShortList(rawChecklists?.impulses, 6),
    states: toShortList(rawChecklists?.states, 6),
  };

  const mindset = {
    emotional_balance: clampRating(rawMindset?.emotional_balance),
    impulse_control: clampRating(rawMindset?.impulse_control),
    setup_quality: clampRating(rawMindset?.setup_quality),
    probability: clampRating(rawMindset?.probability),
  };
  const neuro = normalizeNeuroLayer(rawNeuroLayer);
  const neuroSummary = computeNeuroSummary(neuro);

  // Common note fields across variations (you can extend later)
  const premarket =
    entry?.premarket ||
    {
      bias: entry?.premarketBias,
      plan: entry?.premarketPlan,
      levels: entry?.premarketLevels,
      catalyst: entry?.premarketCatalyst,
      notes: entry?.premarketNotes || premarketFromNotes,
    };

  const live =
    entry?.live ||
    {
      emotions: entry?.liveEmotions,
      mistakes: entry?.liveMistakes,
      notes: entry?.liveNotes || liveFromNotes,
    };

  const post =
    entry?.postmarket ||
    entry?.post ||
    {
      lessons: entry?.lessons,
      whatWorked: entry?.whatWorked,
      whatFailed: entry?.whatFailed,
      notes: entry?.postNotes || postFromNotes,
    };

  const notes = stripHtml(entry?.notes ?? entry?.summary ?? entry?.reflection ?? "");

  const notesEntries = Array.isArray(parsedNotes?.entries) ? parsedNotes?.entries : [];
  const notesExits = Array.isArray(parsedNotes?.exits) ? parsedNotes?.exits : [];
  const tradesEntries = Array.isArray(tradesForDate?.entries) && tradesForDate?.entries?.length
    ? tradesForDate.entries
    : notesEntries;
  const tradesExits = Array.isArray(tradesForDate?.exits) && tradesForDate?.exits?.length
    ? tradesForDate.exits
    : notesExits;

  const normalizedEntries = (tradesEntries || []).slice(0, 8).map(normalizeTradeForCoach);
  const normalizedExits = (tradesExits || []).slice(0, 8).map(normalizeTradeForCoach);

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
    checklists: checklist,
    mindset,
    neuro: {
      premarket: neuro.premarket,
      inside: neuro.inside,
      after: neuro.after,
      summary: {
        score: neuroSummary.score,
        level: neuroSummary.level,
        insight: getNeuroInsightText(neuroSummary.insight_key, "en"),
        flags: neuroSummary.flags,
        strengths: neuroSummary.strengths,
        risks: neuroSummary.risks,
      },
    },
    trades: {
      entries: normalizedEntries,
      exits: normalizedExits,
      entryCount: Array.isArray(tradesEntries) ? tradesEntries.length : 0,
      exitCount: Array.isArray(tradesExits) ? tradesExits.length : 0,
    },
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
    avgWin: 0,
    avgLesson: 0,
    profitFactor: null as number | null,
    expectancy: null as number | null,
    breakevenRate: 0,
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
    const denom = base.greenSessions + base.learningSessions;
    base.winRate = denom > 0 ? (base.greenSessions / denom) * 100 : 0;
    base.breakevenRate = (base.flatSessions / base.totalSessions) * 100;
  }

  const wins = (entries as any[]).map(sessionNetPnl).filter((p) => p > 0);
  const lessons = (entries as any[]).map(sessionNetPnl).filter((p) => p < 0).map((p) => Math.abs(p));
  base.avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
  base.avgLesson = lessons.length ? lessons.reduce((a, b) => a + b, 0) / lessons.length : 0;
  const sumWins = wins.reduce((a, b) => a + b, 0);
  const sumLessons = lessons.reduce((a, b) => a + b, 0);
  base.profitFactor = sumLessons > 0 ? sumWins / sumLessons : null;
  if (base.winRate != null) {
    const pWin = (base.winRate ?? 0) / 100;
    base.expectancy = pWin * base.avgWin - (1 - pWin) * base.avgLesson;
  }

  for (const key of Object.keys(byDayOfWeek)) {
    const bucket = byDayOfWeek[key];
    if (bucket.sessions > 0) {
      bucket.avgPnl = bucket.sumPnl / bucket.sessions;
      const denom = bucket.green + bucket.learning;
      bucket.winRate = denom > 0 ? (bucket.green / denom) * 100 : 0;
    }
  }

  for (const key of Object.keys(byInstrument)) {
    const bucket = byInstrument[key];
    if (bucket.sessions > 0) bucket.avgPnl = bucket.netPnl / bucket.sessions;
  }

  return { base, byDayOfWeek, byInstrument, tagCounts };
}

function looksLikeYYYYMMDD(raw: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(raw);
}

function sessionGrossPnl(entry: any): number {
  const notes = parseNotesJson(entry?.notes);
  const noteGross = Number(notes?.pnl?.gross ?? notes?.pnl_gross);
  if (Number.isFinite(noteGross)) return noteGross;

  const directGross = Number(entry?.pnlGross ?? entry?.pnl_gross ?? entry?.pnlUsd);
  if (Number.isFinite(directGross)) return directGross;

  const directNet = Number(entry?.pnlNet ?? entry?.netPnl ?? entry?.pnl);
  if (Number.isFinite(directNet)) return directNet;

  return 0;
}

function sessionFeesUsd(entry: any): number {
  const notes = parseNotesJson(entry?.notes);
  const costs = parseCostsFromNotes(notes);
  const directFees = Number(entry?.feesUsd ?? entry?.fees ?? 0);
  const fees = Number.isFinite(directFees) ? directFees : 0;
  return fees + costs.fees + costs.commissions;
}

function computeStreaksFromSessions(sessions: Array<{ pnlNet: number }>): { win: number; loss: number } {
  let bestWin = 0;
  let bestLoss = 0;
  let curWin = 0;
  let curLoss = 0;

  for (const s of sessions) {
    if (s.pnlNet > 0) {
      curWin += 1;
      curLoss = 0;
      bestWin = Math.max(bestWin, curWin);
    } else if (s.pnlNet < 0) {
      curLoss += 1;
      curWin = 0;
      bestLoss = Math.max(bestLoss, curLoss);
    } else {
      curWin = 0;
      curLoss = 0;
    }
  }

  return { win: bestWin, loss: bestLoss };
}

function computeEquityCurveFromSessions(
  sessions: Array<{ date: string; pnlNet: number }>,
  cashflows: Cashflow[],
  startingBalance: number,
  planStartIso?: string | null
) {
  const start = planStartIso && looksLikeYYYYMMDD(planStartIso) ? planStartIso : "";

  const tradeByDate: Record<string, number> = {};
  for (const s of sessions) {
    if (!looksLikeYYYYMMDD(s.date)) continue;
    if (start && s.date < start) continue;
    tradeByDate[s.date] = (tradeByDate[s.date] || 0) + (Number.isFinite(s.pnlNet) ? s.pnlNet : 0);
  }

  const cashByDate: Record<string, number> = {};
  for (const cf of cashflows ?? []) {
    const d = String(cf?.date || "").slice(0, 10);
    if (!looksLikeYYYYMMDD(d)) continue;
    if (start && d < start) continue;
    const net = signedCashflowAmount(cf);
    if (!net) continue;
    cashByDate[d] = (cashByDate[d] || 0) + net;
  }

  const dates = Array.from(new Set([...Object.keys(tradeByDate), ...Object.keys(cashByDate)])).sort();
  let equity = startingBalance;

  return dates.map((d) => {
    equity += (tradeByDate[d] || 0) + (cashByDate[d] || 0);
    return { date: d, value: Number(equity.toFixed(2)) };
  });
}

function computeMaxDrawdown(equity: Array<{ value: number }>) {
  let peak = -Infinity;
  let maxDd = 0;
  let maxDdPct = 0;

  for (const p of equity) {
    const v = Number(p.value);
    if (!Number.isFinite(v)) continue;
    if (v > peak) peak = v;
    const dd = peak - v;
    if (dd > maxDd) maxDd = dd;
    if (peak > 0) {
      const ddPct = (dd / peak) * 100;
      if (ddPct > maxDdPct) maxDdPct = ddPct;
    }
  }

  return { maxDd, maxDdPct };
}

function computeWindowStats(
  sessions: Array<{ date: string; pnlNet: number }>,
  tradeRows: JournalTradeRow[],
  startIso: string,
  endIso: string
): PeriodWindowStats {
  const filtered = sessions.filter((s) => s.date >= startIso && s.date <= endIso);

  const winsArr = filtered.map((s) => s.pnlNet).filter((p) => p > 0);
  const lossArr = filtered.map((s) => s.pnlNet).filter((p) => p < 0).map((p) => Math.abs(p));

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const netPnl = sum(filtered.map((s) => s.pnlNet));
  const wins = winsArr.length;
  const losses = lossArr.length;
  const breakevens = Math.max(0, filtered.length - wins - losses);
  const denom = wins + losses;
  const winRate = denom > 0 ? (wins / denom) * 100 : 0;
  const avgNet = filtered.length ? netPnl / filtered.length : 0;

  let tradeCount: number | null = null;
  let avgHoldMins: number | null = null;
  let avgHoldWinMins: number | null = null;
  let avgHoldLossMins: number | null = null;
  let pnlPerHour: number | null = null;
  let tradesWithTime: number | null = null;
  let tradesWithoutTime: number | null = null;
  let kpis: Record<string, KPIResult> | undefined;

  if (tradeRows.length) {
    const tradesInRange = tradeRows.filter((r) => {
      const d = String(r.journal_date || "").slice(0, 10);
      return d >= startIso && d <= endIso;
    });

    if (tradesInRange.length) {
      const tradeStats = computeTradeAnalytics(tradesInRange, filtered);
      tradeCount = tradeStats.tradeCount;
      avgHoldMins = tradeStats.hold.avgHoldMins;
      avgHoldWinMins = tradeStats.hold.avgHoldWinMins;
      avgHoldLossMins = tradeStats.hold.avgHoldLossMins;
      pnlPerHour = tradeStats.pnlPerHour;

      tradesWithTime = tradeStats.matchedTrades.filter(
        (t) => t.entryTimeMin != null && t.exitTimeMin != null
      ).length;
      tradesWithoutTime = tradeStats.tradeCount - tradesWithTime;

      const kpiTrades = buildKpiTrades(tradeStats);
      if (kpiTrades.length) {
        const results = computeAllKPIs(kpiTrades, [], undefined, { annualizationDays: 252 });
        const focusIds = new Set([
          "profit_factor",
          "expectancy",
          "payoff_ratio",
          "profit_per_trade",
          "avg_trade_duration_minutes",
        ]);
        kpis = {};
        for (const r of results) {
          if (!focusIds.has(r.id)) continue;
          if (r.value == null) continue;
          kpis[r.id] = r;
        }
      }
    }
  }

  return {
    startIso,
    endIso,
    sessions: filtered.length,
    wins,
    losses,
    breakevens,
    winRate,
    netPnl,
    avgNet,
    tradeCount,
    avgHoldMins,
    avgHoldWinMins,
    avgHoldLossMins,
    pnlPerHour,
    tradesWithTime,
    tradesWithoutTime,
    kpis,
  };
}

function buildCoachAnalyticsSnapshot(
  entries: JournalEntry[],
  cashflows: Cashflow[],
  range: { startIso?: string | null; endIso?: string | null; preset?: CoachRangePreset },
  startingBalance: number
): CoachAnalyticsSnapshot {
  const sessions = (entries as any[])
    .map((e) => {
      const date = String(e?.date ?? e?.trade_date ?? e?.created_at ?? "").slice(0, 10);
      if (!looksLikeYYYYMMDD(date)) return null;
      return {
        date,
        pnlNet: sessionNetPnl(e),
        pnlGross: sessionGrossPnl(e),
        feesUsd: sessionFeesUsd(e),
        instrument: safeUpper(String(e?.mainInstrument ?? e?.instrument ?? e?.symbol ?? "")),
        createdAt: String(e?.created_at ?? e?.createdAt ?? ""),
      };
    })
    .filter(Boolean) as Array<{
    date: string;
    pnlNet: number;
    pnlGross: number;
    feesUsd: number;
    instrument: string;
    createdAt: string;
  }>;

  const startIso = range?.startIso && looksLikeYYYYMMDD(range.startIso) ? range.startIso : "";
  const endIso = range?.endIso && looksLikeYYYYMMDD(range.endIso) ? range.endIso : "";
  const rangeSource =
    range?.preset === "plan" ? "PLAN" : startIso || endIso ? "CUSTOM" : "ALL";
  const filtered = sessions.filter((s) => {
    if (startIso && s.date < startIso) return false;
    if (endIso && s.date > endIso) return false;
    return true;
  });

  const winsArr = filtered.map((s) => s.pnlNet).filter((p) => p > 0);
  const lossArr = filtered.map((s) => s.pnlNet).filter((p) => p < 0).map((p) => Math.abs(p));

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const netPnl = sum(filtered.map((s) => s.pnlNet));
  const grossPnl = sum(filtered.map((s) => s.pnlGross));
  const totalFees = sum(filtered.map((s) => s.feesUsd));

  const wins = winsArr.length;
  const losses = lossArr.length;
  const breakevens = Math.max(0, filtered.length - wins - losses);
  const denom = wins + losses;
  const winRate = denom > 0 ? (wins / denom) * 100 : 0;

  const avgWin = winsArr.length ? sum(winsArr) / winsArr.length : 0;
  const avgLoss = lossArr.length ? sum(lossArr) / lossArr.length : 0;
  const profitFactor = lossArr.length ? sum(winsArr) / sum(lossArr) : null;
  const pWin = denom > 0 ? wins / denom : 0;
  const expectancy = avgWin || avgLoss ? pWin * avgWin - (1 - pWin) * avgLoss : null;

  let bestDay: { date: string; pnl: number } | null = null;
  let worstDay: { date: string; pnl: number } | null = null;
  for (const s of filtered) {
    if (!bestDay || s.pnlNet > bestDay.pnl) bestDay = { date: s.date, pnl: s.pnlNet };
    if (!worstDay || s.pnlNet < worstDay.pnl) worstDay = { date: s.date, pnl: s.pnlNet };
  }

  const streaks = computeStreaksFromSessions(filtered);
  const maxWin = winsArr.length ? Math.max(...winsArr) : 0;
  const maxLoss = lossArr.length ? Math.max(...lossArr) : 0;

  const equityCurve = computeEquityCurveFromSessions(filtered, cashflows, startingBalance, startIso || null);
  const dd = computeMaxDrawdown(equityCurve);

  const byInstrumentMap: Record<string, { sessions: number; netPnl: number }> = {};
  for (const s of filtered) {
    const key = s.instrument || "(none)";
    if (!byInstrumentMap[key]) byInstrumentMap[key] = { sessions: 0, netPnl: 0 };
    byInstrumentMap[key].sessions += 1;
    byInstrumentMap[key].netPnl += s.pnlNet;
  }
  const byInstrument = Object.entries(byInstrumentMap)
    .map(([instrument, v]) => ({
      instrument,
      sessions: v.sessions,
      netPnl: v.netPnl,
      avgPnl: v.sessions ? v.netPnl / v.sessions : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byDowMap: Record<string, { sessions: number; pnl: number; wins: number }> = {};
  for (const s of filtered) {
    const d = new Date(`${s.date}T00:00:00`);
    if (Number.isNaN(d.getTime())) continue;
    const dow = dowLabels[d.getDay()];
    if (!byDowMap[dow]) byDowMap[dow] = { sessions: 0, pnl: 0, wins: 0 };
    const bucket = byDowMap[dow];
    bucket.sessions += 1;
    bucket.pnl += s.pnlNet;
    if (s.pnlNet > 0) bucket.wins += 1;
  }
  const byDayOfWeek = Object.entries(byDowMap).map(([dow, b]) => {
    const lossesCount = Math.max(0, b.sessions - b.wins);
    const denom = b.wins + lossesCount;
    const winRate = denom ? (b.wins / denom) * 100 : 0;
    return { dow, sessions: b.sessions, pnl: b.pnl, winRate };
  });

  const byHourMap: Record<string, { sessions: number; pnl: number; wins: number }> = {};
  for (const s of filtered) {
    if (!s.createdAt) continue;
    const d = new Date(s.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const hour = `${String(d.getHours()).padStart(2, "0")}:00`;
    if (!byHourMap[hour]) byHourMap[hour] = { sessions: 0, pnl: 0, wins: 0 };
    const bucket = byHourMap[hour];
    bucket.sessions += 1;
    bucket.pnl += s.pnlNet;
    if (s.pnlNet > 0) bucket.wins += 1;
  }
  const byHour = Object.entries(byHourMap)
    .map(([hour, b]) => {
      const lossesCount = Math.max(0, b.sessions - b.wins);
      const denom = b.wins + lossesCount;
      const winRate = denom ? (b.wins / denom) * 100 : 0;
      return { hour, sessions: b.sessions, pnl: b.pnl, winRate };
    })
    .sort((a, b) => (a.hour < b.hour ? -1 : a.hour > b.hour ? 1 : 0));

  return {
    updatedAtIso: new Date().toISOString(),
    range: {
      startIso,
      endIso: endIso || new Date().toISOString().slice(0, 10),
      source: rangeSource,
    },
    totals: {
      sessions: filtered.length,
      wins,
      losses,
      breakevens,
      winRate,
      grossPnl,
      netPnl,
      totalFees,
      avgNetPerSession: filtered.length ? netPnl / filtered.length : 0,
    },
    performance: {
      avgWin,
      avgLoss,
      profitFactor,
      expectancy,
      bestDay,
      worstDay,
    },
    risk: {
      maxDrawdown: dd.maxDd,
      maxDrawdownPct: dd.maxDdPct,
      longestWinStreak: streaks.win,
      longestLossStreak: streaks.loss,
      maxWin,
      maxLoss,
    },
    time: {
      byDayOfWeek,
      byHour,
    },
    instruments: {
      byInstrument,
    },
    dataQuality: {
      hasCashflows: (cashflows ?? []).length > 0,
      hasEntryTimestamps: byHour.length > 0,
    },
  };
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
  const locale =
    typeof document !== "undefined"
      ? document.documentElement.lang || undefined
      : undefined;
  return v.toLocaleString(locale, { style: "currency", currency: "USD" });
}

/* =========================
   Inner page (with hooks)
========================= */

function AiCoachingPageInner() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { activeAccountId, loading: accountsLoading } = useTradingAccounts();
  const { plan, loading: planLoading } = useUserPlan();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const coachModeOptions = useMemo<Array<{ value: CoachMode; label: string }>>(
    () =>
      isEs
        ? [
            { value: "plan-rescue", label: "Rescate del plan" },
            { value: "weekly-review", label: "Revisión semanal" },
            { value: "risk-discipline", label: "Disciplina de riesgo" },
            { value: "execution-truth", label: "Verdad de ejecución" },
            { value: "psychology-patterns", label: "Patrones psicológicos" },
          ]
        : [
            { value: "plan-rescue", label: "Plan rescue" },
            { value: "weekly-review", label: "Weekly review" },
            { value: "risk-discipline", label: "Risk discipline" },
            { value: "execution-truth", label: "Execution truth" },
            { value: "psychology-patterns", label: "Psychology patterns" },
          ],
    [isEs]
  );
  const coachRangeOptions = useMemo<Array<{ value: CoachRangePreset; label: string }>>(
    () =>
      isEs
        ? [
            { value: "plan", label: "Desde el plan" },
            { value: "last30", label: "Últimos 30 días" },
            { value: "last90", label: "Últimos 90 días" },
            { value: "all", label: "Todo el journal" },
          ]
        : [
            { value: "plan", label: "Since plan start" },
            { value: "last30", label: "Last 30 days" },
            { value: "last90", label: "Last 90 days" },
            { value: "all", label: "All journal history" },
          ],
    [isEs]
  );
  const coachModeLabels = useMemo(
    () =>
      Object.fromEntries(coachModeOptions.map((option) => [option.value, option.label])) as Record<
        CoachMode,
        string
      >,
    [coachModeOptions]
  );
  const coachRangeLabels = useMemo(
    () =>
      Object.fromEntries(coachRangeOptions.map((option) => [option.value, option.label])) as Record<
        CoachRangePreset,
        string
      >,
    [coachRangeOptions]
  );
  const coachConversationLanguageOptions: Array<{ value: CoachConversationLanguage; label: string }> = [
    { value: "auto", label: L("Auto", "Auto") },
    { value: "en", label: "English" },
    { value: "es", label: "Español" },
  ];

  // Platform data
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [growthPlan, setGrowthPlan] = useState<GrowthPlanRow | null>(null);
  const [cashflows, setCashflows] = useState<Cashflow[]>([]);
  const [accountSeriesTotals, setAccountSeriesTotals] = useState<AccountSeriesTotals | null>(null);
  const [tradesByDate, setTradesByDate] = useState<Record<string, TradesPayload>>({});
  const [tradeRows, setTradeRows] = useState<JournalTradeRow[]>([]);
  const [fullSnapshot, setFullSnapshot] = useState<AiCoachSnapshot | null>(null);
  const [gamification, setGamification] = useState<ProfileGamification | null>(null);

  // Chat persistence
  const [threads, setThreads] = useState<AiCoachThreadRow[]>([]);
  const [activeThread, setActiveThread] = useState<AiCoachThreadRow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [coachMemory, setCoachMemory] = useState<CoachMemoryView | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [feedbackByMessage, setFeedbackByMessage] = useState<Record<string, number>>({});
  const [feedbackSending, setFeedbackSending] = useState<Record<string, boolean>>({});

  // UI state
  const [question, setQuestion] = useState("");
  const [coachState, setCoachState] = useState<AiCoachState>({ loading: false, error: null });
  const [coachMode, setCoachMode] = useState<CoachMode>("plan-rescue");
  const [coachRangePreset, setCoachRangePreset] = useState<CoachRangePreset>("plan");
  const [coachConversationLanguage, setCoachConversationLanguage] = useState<CoachConversationLanguage>("auto");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [planRuleSaving, setPlanRuleSaving] = useState<"doList" | "dontList" | null>(null);
  const [planRuleAction, setPlanRuleAction] = useState<PlanRuleActionState>(null);

  // URL params (avoid hook-order issues from useSearchParams)
  const [searchParams, setSearchParams] = useState<URLSearchParams | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSearchParams(new URLSearchParams(window.location.search));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("tjpro_ai_coach_language");
    if (saved === "auto" || saved === "es" || saved === "en") {
      setCoachConversationLanguage(saved);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("tjpro_ai_coach_language", coachConversationLanguage);
  }, [coachConversationLanguage]);

  // Screenshot
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  // Profile (name, locale)
  const [coachUserProfile, setCoachUserProfile] = useState<UserProfileForCoach | null>(null);
  const [backStudyTradeContext, setBackStudyTradeContext] = useState<string | null>(null);
  const [backStudyUnderlyingContext, setBackStudyUnderlyingContext] = useState<string | null>(null);

  const [dataLoading, setDataLoading] = useState<boolean>(true);

  // Scroll to bottom
  const endRef = useRef<HTMLDivElement | null>(null);
  const coachUiLang = coachConversationLanguage === "auto" ? (isEs ? "es" : "en") : coachConversationLanguage;
  const coachUiIsEs = coachUiLang === "es";
  const promptGroups = useMemo(() => getSmartPromptGroups(coachUiIsEs), [coachUiIsEs]);
  const growthPlanSystemRules = useMemo(() => {
    const system = growthPlan?.steps?.execution_and_journal?.system;
    const normalizeRule = (value: unknown): string => {
      if (typeof value === "string") return value.trim();
      if (value && typeof value === "object" && "text" in value && typeof value.text === "string") {
        return value.text.trim();
      }
      return "";
    };
    const doList: string[] = (Array.isArray(system?.doList) ? (system.doList as unknown[]) : [])
      .map((rule: unknown) => normalizeRule(rule))
      .filter(Boolean)
      .slice(0, 4);
    const dontList: string[] = (Array.isArray(system?.dontList) ? (system.dontList as unknown[]) : [])
      .map((rule: unknown) => normalizeRule(rule))
      .filter(Boolean)
      .slice(0, 4);
    return { doList, dontList };
  }, [growthPlan]);
  const allPromptTemplates = useMemo(
    () => [...promptGroups.primary, ...promptGroups.neuro],
    [promptGroups]
  );
  const selectedPromptTemplate = useMemo(
    () => allPromptTemplates.find((template) => template.id === selectedPromptId) ?? null,
    [allPromptTemplates, selectedPromptId]
  );

  const applyPromptTemplate = (template: CoachPromptTemplate) => {
    setCoachMode(template.mode);
    setCoachRangePreset(template.range);
    setQuestion(template.prompt);
  };

  const handlePromptSelection = (promptId: string) => {
    setSelectedPromptId(promptId);
    const template = allPromptTemplates.find((item) => item.id === promptId);
    if (template) applyPromptTemplate(template);
  };

  const applyRuleToGrowthPlan = async (listKey: "doList" | "dontList", rawRule: string | undefined) => {
    const text = normalizePlanRuleText(rawRule);
    if (!text) return;
    if (!growthPlan || !activeAccountId) {
      setPlanRuleAction({
        kind: "error",
        message: L(
          "Load an active Growth Plan before applying coach rules.",
          "Carga un Growth Plan activo antes de aplicar reglas del coach."
        ),
      });
      return;
    }

    const system = growthPlan.steps?.execution_and_journal?.system ?? getDefaultExecutionSystem();
    const targetList = Array.isArray(system[listKey]) ? [...system[listKey]] : [];
    const oppositeKey = listKey === "doList" ? "dontList" : "doList";
    const oppositeList = Array.isArray(system[oppositeKey]) ? system[oppositeKey] : [];
    const normalizedTarget = targetList.map((item) => normalizePlanRuleText(item?.text).toLowerCase());
    const normalizedOpposite = oppositeList.map((item) => normalizePlanRuleText(item?.text).toLowerCase());
    const normalizedText = text.toLowerCase();

    if (normalizedTarget.includes(normalizedText)) {
      setPlanRuleAction({
        kind: "info",
        message:
          listKey === "doList"
            ? L("That rule is already in your Do list.", "Esa regla ya está en tu lista Do.")
            : L("That rule is already in your Don't list.", "Esa regla ya está en tu lista Don't."),
      });
      return;
    }

    if (normalizedOpposite.includes(normalizedText)) {
      setPlanRuleAction({
        kind: "info",
        message:
          listKey === "doList"
            ? L("That rule already exists in your Don't list. Review it before adding it to Do.", "Esa regla ya existe en tu lista Don't. Revísala antes de agregarla a Do.")
            : L("That rule already exists in your Do list. Review it before adding it to Don't.", "Esa regla ya existe en tu lista Do. Revísala antes de agregarla a Don't."),
      });
      return;
    }

    const nextItem: GrowthPlanChecklistItem = {
      id: `coach-${listKey}-${makeId()}`,
      text,
      isActive: true,
      isSuggested: false,
    };

    try {
      setPlanRuleSaving(listKey);
      setPlanRuleAction(null);

      const saved = await upsertGrowthPlanSupabase(
        {
          steps: {
            ...(growthPlan.steps ?? {}),
            execution_and_journal: {
              ...(growthPlan.steps?.execution_and_journal ?? {}),
              system: {
                ...system,
                [listKey]: [...targetList, nextItem],
              },
            },
          } as any,
        },
        activeAccountId
      );

      setGrowthPlan((prev) =>
        prev
          ? {
              ...prev,
              steps: saved.steps as Record<string, any>,
              updated_at: saved.updatedAt ?? prev.updated_at,
            }
          : prev
      );
      setPlanRuleAction({
        kind: "success",
        message:
          listKey === "doList"
            ? L("Rule added to your Do list.", "Regla agregada a tu lista Do.")
            : L("Rule added to your Don't list.", "Regla agregada a tu lista Don't."),
      });
    } catch (err: any) {
      setPlanRuleAction({
        kind: "error",
        message:
          err?.message ||
          L("Could not update the Growth Plan rules.", "No se pudo actualizar las reglas del Growth Plan."),
      });
    } finally {
      setPlanRuleSaving(null);
    }
  };

  const renderMemoryList = (text?: string) => {
    const clean = String(text || "").trim();
    if (!clean) return <p className="text-xs text-slate-500">{L("No memory yet.", "Aún no hay memoria.")}</p>;
    const rows = clean
      .split("\n")
      .map((l) => l.replace(/^[-•]\s*/, "").trim())
      .filter(Boolean);
    return (
      <ul className="space-y-1 text-xs text-slate-200">
        {rows.map((line, idx) => (
          <li key={idx} className="leading-relaxed">
            • {line}
          </li>
        ))}
      </ul>
    );
  };

  const renderActionPlan = (plan?: CoachActionPlanMeta | null) => {
    if (!plan) return null;
    const rows = [
      { label: L("Next action", "Próxima acción"), value: plan.nextAction },
      { label: L("Rule to add", "Regla para agregar"), value: plan.ruleToAdd },
      { label: L("Rule to remove", "Regla para remover"), value: plan.ruleToRemove },
      { label: L("Checkpoint focus", "Foco del checkpoint"), value: plan.checkpointFocus },
    ].filter((row) => String(row.value || "").trim());

    if (!rows.length && !String(plan.summary || "").trim()) return null;

    return (
      <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-[12px] text-slate-100">
        <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-300">
          {L("Action plan", "Plan de acción")}
        </p>
        {plan.summary ? <p className="mt-2 text-slate-200">{plan.summary}</p> : null}
        <div className="mt-2 space-y-1.5">
          {rows.map((row) => (
            <div key={row.label}>
              <span className="text-slate-400">{row.label}: </span>
              <span className="text-slate-100">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAutoAudit = (audit?: CoachAutoAuditMeta | null) => {
    if (!audit?.attached) return null;
    return (
      <div className="mt-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3 text-[12px] text-slate-100">
        <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">
          {L("Auto audit attached", "Auto audit adjuntado")}
        </p>
        <p className="mt-2 text-slate-200">
          {[audit.date, audit.instrument].filter(Boolean).join(" · ")}
          {typeof audit.eventCount === "number" ? ` · ${audit.eventCount} ${L("events", "eventos")}` : ""}
        </p>
        {audit.summary ? <p className="mt-2 text-slate-300">{audit.summary}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {typeof audit.disciplineScore === "number" ? (
            <span className="rounded-full border border-cyan-500/30 px-2 py-1">
              {L("Discipline", "Disciplina")}: {audit.disciplineScore}%
            </span>
          ) : null}
          {typeof audit.processScore === "number" ? (
            <span className="rounded-full border border-cyan-500/30 px-2 py-1">
              {L("Process", "Proceso")}: {audit.processScore}%
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const renderGrowthPlanSuggestions = (plan?: CoachActionPlanMeta | null) => {
    const ruleToAdd = String(plan?.ruleToAdd || "").trim();
    const ruleToRemove = String(plan?.ruleToRemove || "").trim();
    if (!ruleToAdd && !ruleToRemove) return null;

    return (
      <div className="rounded-xl border border-violet-400/20 bg-violet-500/10 p-3 text-[12px] text-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-violet-200">
              {L("Growth Plan suggestions", "Sugerencias para el Growth Plan")}
            </p>
            <p className="mt-1 text-slate-300">
              {L(
                "Turn the coach output into cleaner operating rules for your Do / Don't system.",
                "Convierte el output del coach en reglas operativas más limpias para tu sistema de Do / Don't."
              )}
            </p>
          </div>
          <Link
            href="/growth-plan"
            className="shrink-0 rounded-full border border-violet-300/30 px-3 py-1 text-[11px] text-violet-100 transition hover:border-violet-200 hover:text-white"
          >
            {L("Open plan", "Abrir plan")}
          </Link>
        </div>

        <div className="mt-3 grid gap-2">
          {ruleToAdd ? (
            <div className="rounded-lg border border-emerald-400/20 bg-slate-950/40 p-2.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-emerald-300">
                {L("Suggested Do", "Do sugerido")}
              </p>
              <p className="mt-1 text-slate-100">{ruleToAdd}</p>
              <button
                type="button"
                onClick={() => applyRuleToGrowthPlan("doList", ruleToAdd)}
                disabled={planRuleSaving === "doList" || !growthPlan || !activeAccountId}
                className="mt-2 rounded-full border border-emerald-300/30 px-3 py-1 text-[11px] text-emerald-100 transition hover:border-emerald-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {planRuleSaving === "doList"
                  ? L("Adding to Do...", "Agregando a Do...")
                  : L("Add to Do", "Agregar a Do")}
              </button>
            </div>
          ) : null}
          {ruleToRemove ? (
            <div className="rounded-lg border border-rose-400/20 bg-slate-950/40 p-2.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-rose-300">
                {L("Suggested Don't", "Don't sugerido")}
              </p>
              <p className="mt-1 text-slate-100">{ruleToRemove}</p>
              <button
                type="button"
                onClick={() => applyRuleToGrowthPlan("dontList", ruleToRemove)}
                disabled={planRuleSaving === "dontList" || !growthPlan || !activeAccountId}
                className="mt-2 rounded-full border border-rose-300/30 px-3 py-1 text-[11px] text-rose-100 transition hover:border-rose-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {planRuleSaving === "dontList"
                  ? L("Adding to Don't...", "Agregando a Don't...")
                  : L("Add to Don't", "Agregar a Don't")}
              </button>
            </div>
          ) : null}
        </div>

        {planRuleAction ? (
          <div
            className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${
              planRuleAction.kind === "success"
                ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                : planRuleAction.kind === "info"
                  ? "border-slate-600 bg-slate-900/60 text-slate-200"
                  : "border-rose-400/20 bg-rose-500/10 text-rose-100"
            }`}
          >
            {planRuleAction.message}
          </div>
        ) : null}

        {(growthPlanSystemRules.doList.length || growthPlanSystemRules.dontList.length) && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                {L("Current Do list", "Do actual")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {growthPlanSystemRules.doList.length ? (
                  growthPlanSystemRules.doList.map((rule) => (
                    <span key={rule} className="rounded-full border border-emerald-500/20 px-2 py-1 text-[10px] text-emerald-100">
                      {rule}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-500">{L("No Do rules yet.", "Aún no hay reglas Do.")}</span>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-950/40 p-2.5">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                {L("Current Don't list", "Don't actual")}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {growthPlanSystemRules.dontList.length ? (
                  growthPlanSystemRules.dontList.map((rule) => (
                    <span key={rule} className="rounded-full border border-rose-500/20 px-2 py-1 text-[10px] text-rose-100">
                      {rule}
                    </span>
                  ))
                ) : (
                  <span className="text-[11px] text-slate-500">{L("No Don't rules yet.", "Aún no hay reglas Don't.")}</span>
                )}
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            applyPromptTemplate({
              id: "refine-growth-plan-rules",
              label: "",
              mode: "plan-rescue",
              range: "last30",
              prompt: L(
                "Rewrite the suggested rule changes as clean Do and Don't rules for my Growth Plan. Keep them short, operational, and realistic for my next sessions.",
                "Reescribe los cambios de reglas sugeridos como reglas Do y Don't limpias para mi Growth Plan. Mantenlas cortas, operativas y realistas para mis próximas sesiones."
              ),
            })
          }
          className="mt-3 rounded-full border border-violet-300/30 px-3 py-1.5 text-[11px] text-violet-100 transition hover:border-violet-200 hover:text-white"
        >
          {L("Refine into plan rules", "Refinar como reglas del plan")}
        </button>
      </div>
    );
  };

  const fetchCoachMemory = async () => {
    const session = await supabaseBrowser.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/ai-coach/memory", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (!data || data?.disabled) {
      setCoachMemory(null);
      return;
    }
    setCoachMemory(data);
  };

  const loadFeedbackState = async (threadId: string) => {
    if (!threadId) {
      setFeedbackByMessage({});
      return;
    }
    const rows = await listAiCoachFeedbackForThread(threadId);
    const next = rows.reduce<Record<string, number>>((acc, row) => {
      if (row.message_id && (row.rating === 1 || row.rating === -1)) acc[row.message_id] = row.rating;
      return acc;
    }, {});
    setFeedbackByMessage(next);
  };

  const sendFeedback = async (messageId: string, rating: number) => {
    if (!messageId || !activeThread) return;
    setFeedbackSending((prev) => ({ ...prev, [messageId]: true }));
    try {
      const session = await supabaseBrowser.auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) return;
      const res = await fetch("/api/ai-coach/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          threadId: activeThread.id,
          messageId,
          rating,
        }),
      });
      const data = await res.json().catch(() => null);
      if (data?.disabled) {
        setFeedbackEnabled(false);
        return;
      }
      if (res.ok && data?.ok !== false) {
        setFeedbackByMessage((prev) => ({ ...prev, [messageId]: rating }));
        await fetchCoachMemory();
      } else {
        console.warn("[AI Coaching] feedback save error:", data?.error || res.status);
      }
    } finally {
      setFeedbackSending((prev) => ({ ...prev, [messageId]: false }));
    }
  };

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

  useEffect(() => {
    if (!backStudyParams || !coachUserProfile?.id || !activeAccountId) {
      setBackStudyTradeContext(null);
      return;
    }

    let alive = true;
    const userId = coachUserProfile.id;

    (async () => {
      try {
        const [trades, journalEntry] = await Promise.all([
          getJournalTradesForDay(userId, backStudyParams.date, activeAccountId),
          getJournalEntryByDate(userId, backStudyParams.date, activeAccountId),
        ]);
        if (!alive) return;

        const entries = Array.isArray(trades?.entries) ? trades.entries : [];
        const exits = Array.isArray(trades?.exits) ? trades.exits : [];

        const timeline = [
          ...entries.map((t) => ({ ...t, leg: "ENTRY" })),
          ...exits.map((t) => ({ ...t, leg: "EXIT" })),
        ].sort((a, b) => {
          const ta = timeToMinutes(a.time);
          const tb = timeToMinutes(b.time);
          if (ta == null && tb == null) return 0;
          if (ta == null) return 1;
          if (tb == null) return -1;
          return ta - tb;
        });

        const notes = parseNotesJson(journalEntry?.notes);
        const premarket = String(notes?.premarket ?? "").trim();
        const inside = String(notes?.live ?? "").trim();
        const after = String(notes?.post ?? "").trim();
        const netPnlRaw = journalEntry?.pnl;
        const netPnl = Number.isFinite(Number(netPnlRaw)) ? Number(netPnlRaw) : null;

        const lines: string[] = [];
        lines.push(L("Back-study trade details (from journal_trades):", "Detalle de back-study (desde journal_trades):"));
        if (netPnl != null) {
          lines.push(`${L("Session net P&L", "P&L neto de la sesión")}: ${netPnl.toFixed(2)} USD`);
        }
        if (entries.length) {
          lines.push(L("Entries:", "Entradas:"));
          entries.forEach((t) => lines.push(fmtTradeLine(t, "•")));
        }
        if (exits.length) {
          lines.push(L("Exits:", "Salidas:"));
          exits.forEach((t) => lines.push(fmtTradeLine(t, "•")));
        }
        if (timeline.length) {
          lines.push(L("Chronological sequence:", "Secuencia cronológica:"));
          timeline.forEach((t) => lines.push(fmtTradeLine(t, t.leg === "ENTRY" ? "→ ENTRY" : "→ EXIT")));
        }
        if (premarket) {
          lines.push(L("Premarket notes:", "Notas premarket:"));
          lines.push(premarket);
        }
        if (inside) {
          lines.push(L("Inside-trade notes:", "Notas dentro del trade:"));
          lines.push(inside);
        }
        if (after) {
          lines.push(L("After-trade notes:", "Notas post-trade:"));
          lines.push(after);
        }

        setBackStudyTradeContext(lines.filter(Boolean).join("\n"));
      } catch (err) {
        console.warn("[AI Coaching] back-study trade context error:", err);
        if (alive) setBackStudyTradeContext(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, [backStudyParams, coachUserProfile?.id, activeAccountId, lang]);

  useEffect(() => {
    if (!backStudyParams?.symbol || !backStudyParams?.date) {
      setBackStudyUnderlyingContext(null);
      return;
    }

    let alive = true;

    (async () => {
      const range = getLocalDayRangeSeconds(backStudyParams.date);
      if (!range) {
        if (alive) setBackStudyUnderlyingContext(null);
        return;
      }

      const yfSymbol = normalizeUnderlyingForYahoo(backStudyParams.symbol);
      const interval = mapTfToInterval(backStudyParams.tf);
      const url = `/api/yahoo-chart?symbol=${encodeURIComponent(
        yfSymbol
      )}&interval=${encodeURIComponent(interval)}&period1=${range.period1}&period2=${range.period2}`;

      let candles: YahooCandle[] = [];
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          candles = Array.isArray(data?.candles) ? data.candles : [];
        }
      } catch (err) {
        console.warn("[AI Coaching] yahoo intraday error:", err);
      }

      if (!alive) return;

      const ordered = candles
        .filter((c) => Number.isFinite(c?.close))
        .sort((a, b) => a.time - b.time);

      if (!ordered.length) {
        setBackStudyUnderlyingContext(
          L(
            "Underlying intraday data unavailable for that date.",
            "Datos intradía del subyacente no disponibles para esa fecha."
          )
        );
        return;
      }

      const entryMins = timeToMinutes(backStudyParams.entryTime ?? null);
      const exitMins = timeToMinutes(backStudyParams.exitTime ?? null);
      const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—");

      const lines: string[] = [];
      lines.push(
        L(
          "Underlying intraday snapshot (underlying only — not option prices):",
          "Snapshot intradía del subyacente (solo subyacente — no precios de opciones):"
        )
      );
      lines.push(
        L(
          "Use this only for underlying context; option prices may diverge.",
          "Usa esto solo como contexto del subyacente; los precios de opciones pueden divergir."
        )
      );

      const pushCheckpoint = (label: string, minutes: number) => {
        const match = findClosestCandle(ordered, minutes);
        if (!match || !Number.isFinite(match.candle.close)) return null;
        const delta =
          match.delta === 0
            ? ""
            : ` (${L("closest", "más cercana")} ${minutesToClock(match.minutes)}, Δ${
                match.delta > 0 ? "+" : ""
              }${match.delta}m)`;
        lines.push(
          `- ${label} ${minutesToClock(minutes)} → ${fmt(match.candle.close)}${delta}`
        );
        return match;
      };

      let entryMatch: ReturnType<typeof findClosestCandle> | null = null;
      let exitMatch: ReturnType<typeof findClosestCandle> | null = null;

      if (entryMins != null) {
        entryMatch = pushCheckpoint(L("Entry", "Entrada"), entryMins);
        [15, 30, 60].forEach((delta) => {
          const m = entryMins + delta;
          if (m < 24 * 60) {
            pushCheckpoint(L(`+${delta}m after entry`, `+${delta}m tras entrada`), m);
          }
        });
      }

      if (exitMins != null) {
        exitMatch = pushCheckpoint(L("Exit", "Salida"), exitMins);
      }

      const first = ordered[0];
      const last = ordered[ordered.length - 1];
      lines.push(
        `${L("First candle", "Primera vela")}: ${minutesToClock(
          minutesFromMsLocal(first.time)
        )} → ${fmt(first.close)}`
      );
      lines.push(
        `${L("Last candle", "Última vela")}: ${minutesToClock(
          minutesFromMsLocal(last.time)
        )} → ${fmt(last.close)}`
      );

      if (entryMatch && exitMatch && Number.isFinite(entryMatch.candle.close)) {
        const diff = exitMatch.candle.close - entryMatch.candle.close;
        const pct = entryMatch.candle.close
          ? (diff / entryMatch.candle.close) * 100
          : null;
        lines.push(
          `${L("Entry → Exit change", "Cambio Entrada → Salida")}: ${
            diff >= 0 ? "+" : ""
          }${fmt(diff)}${pct != null ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)` : ""}`
        );
      }

      setBackStudyUnderlyingContext(lines.join("\n"));
    })();

    return () => {
      alive = false;
    };
  }, [backStudyParams, lang]);

  const backStudyContext: string | null = useMemo(() => {
    if (!backStudyParams) return null;

    const lines: (string | null)[] = [
      L("Back-study trade context:", "Contexto de back-study:"),
      `- ${L("Underlying symbol", "Símbolo subyacente")}: ${backStudyParams.symbol}`,
      `- ${L("Session date (local calendar)", "Fecha de sesión (calendario local)")}: ${backStudyParams.date}`,
      backStudyParams.entryTime && backStudyParams.exitTime
        ? `- ${L("Intraday window", "Ventana intradía")}: ${backStudyParams.entryTime} → ${backStudyParams.exitTime} (${L("local time", "hora local")})`
        : backStudyParams.entryTime
        ? `- ${L("Entry time", "Hora de entrada")}: ${backStudyParams.entryTime} (${L("local time", "hora local")})`
        : null,
      backStudyParams.tf ? `- ${L("Chart timeframe selected", "Timeframe seleccionado")}: ${backStudyParams.tf}` : null,
      backStudyParams.range ? `- ${L("Historical range loaded", "Rango histórico cargado")}: ${backStudyParams.range}` : null,
      L(
        "If an image is attached, it is a screenshot of this back-study chart with green/blue arrows marking entry and exit.",
        "Si hay una imagen adjunta, es un screenshot del chart con flechas verde/azul marcando entrada y salida."
      ),
    ];

    if (backStudyTradeContext) {
      lines.push("");
      lines.push(L("Journal trade details:", "Detalle de trades del journal:"));
      lines.push(backStudyTradeContext);
    }

    if (backStudyUnderlyingContext) {
      lines.push("");
      lines.push(L("Underlying intraday context:", "Contexto intradía del subyacente:"));
      lines.push(backStudyUnderlyingContext);
    }

    return lines.filter(Boolean).join("\n");
  }, [backStudyParams, backStudyTradeContext, backStudyUnderlyingContext, lang]);

  /* ---------- Protect route ---------- */
  useEffect(() => {
    if (!authLoading && !user) router.push("/signin");
  }, [authLoading, user, router]);

  /* ---------- Load everything (ALL from Supabase) ---------- */
  useEffect(() => {
    if (planLoading || plan !== "advanced") return;
    if (authLoading || !user || accountsLoading || !activeAccountId) return;

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
          threadToUse = await getOrCreateMostRecentAiCoachThread({ userId, defaultTitle: L("AI Coaching", "Coaching AI") });
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
            meta: (m.meta as ChatMessage["meta"]) ?? null,
          }));
          setMessages(mapped);
          await loadFeedbackState(threadToUse.id);
        } else {
          setMessages([]);
          setFeedbackByMessage({});
        }

        // 3) Journal
        const all = userId && activeAccountId ? await getAllJournalEntries(userId, activeAccountId) : [];
        if (!alive) return;
        setEntries(all || []);

        // 4) Growth plan (Supabase table: growth_plans)
        const { data: gp, error: gpErr } = await supabaseBrowser
          .from("growth_plans")
          .select(
            "id,user_id,starting_balance,target_balance,target_date,plan_start_date,plan_mode,daily_target_pct,daily_goal_percent,max_daily_loss_percent,max_risk_per_trade_percent,max_risk_per_trade_usd,trading_days,loss_days_per_week,rules,steps,plan_phases,planned_withdrawal_settings,planned_withdrawals,created_at,updated_at"
          )
          .eq("user_id", userId)
          .eq("account_id", activeAccountId)
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
        const cfs = userId && activeAccountId
          ? await listCashflows(userId, {
              fromDate: planStartIso || undefined,
              toDate: undefined,
              throwOnError: false,
              accountId: activeAccountId,
            })
          : [];
        if (!alive) return;
        setCashflows(cfs || []);

        // 5.1) Authoritative account totals (same source as Balance Chart)
        try {
          const { data: sessionData } = await supabaseBrowser.auth.getSession();
          const token = sessionData?.session?.access_token;
          if (token && activeAccountId) {
            const res = await fetch(`/api/account/series?accountId=${encodeURIComponent(activeAccountId)}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const body = await res.json();
              const totals = body?.totals;
              if (totals) {
                setAccountSeriesTotals({
                  tradingPnl: toNum(totals.tradingPnl, 0),
                  cashflowNet: toNum(totals.cashflowNet, 0),
                  currentBalance: toNum(totals.currentBalance, 0),
                });
              } else {
                setAccountSeriesTotals(null);
              }
            } else {
              setAccountSeriesTotals(null);
            }
          } else {
            setAccountSeriesTotals(null);
          }
        } catch {
          setAccountSeriesTotals(null);
        }

        // 6) Full snapshot (platform-wide)
        const full = userId ? await buildAiCoachSnapshot(userId, activeAccountId) : null;
        if (!alive) return;
        setFullSnapshot(full);

        // 7) Gamification
        const g = userId ? await getProfileGamification(userId) : null;
        if (!alive) return;
        setGamification(g);

        // 8) Coach memory snapshot
        if (!alive) return;
        await fetchCoachMemory();
      } catch (err) {
        console.error("[AI Coaching] load error:", err);
        if (!alive) return;
        setEntries([]);
        setGrowthPlan(null);
        setCashflows([]);
        setAccountSeriesTotals(null);
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
  }, [authLoading, user, accountsLoading, activeAccountId]);

  /* ---------- Derived stats ---------- */

  const planStartIso = useMemo(() => planStartIsoFromPlan(growthPlan), [growthPlan]);
  const coachRangeBounds = useMemo(() => {
    const dated = entries
      .map((entry) => String(entry?.date || "").slice(0, 10))
      .filter(looksLikeYYYYMMDD)
      .sort();

    const earliestIso = dated[0] || "";
    const latestIso = dated[dated.length - 1] || isoDate(new Date());
    const endIso = latestIso || isoDate(new Date());

    if (coachRangePreset === "plan") {
      return {
        preset: coachRangePreset,
        startIso: planStartIso && looksLikeYYYYMMDD(planStartIso) ? planStartIso : earliestIso,
        endIso,
        label: planStartIso
          ? isEs
            ? "Desde el inicio del plan hasta hoy"
            : "From plan start to today"
          : isEs
            ? "Todo el journal"
            : "All journal history",
      };
    }

    if (coachRangePreset === "last30") {
      return {
        preset: coachRangePreset,
        startIso: addDaysIso(isoDate(new Date()), -29),
        endIso: isoDate(new Date()),
        label: isEs ? "Últimos 30 días calendario" : "Last 30 calendar days",
      };
    }

    if (coachRangePreset === "last90") {
      return {
        preset: coachRangePreset,
        startIso: addDaysIso(isoDate(new Date()), -89),
        endIso: isoDate(new Date()),
        label: isEs ? "Últimos 90 días calendario" : "Last 90 calendar days",
      };
    }

    return {
      preset: coachRangePreset,
      startIso: earliestIso,
      endIso,
      label: isEs ? "Todo el journal" : "All journal history",
    };
  }, [coachRangePreset, entries, planStartIso, isEs]);

  const entriesForCoach = useMemo(() => {
    const { startIso, endIso } = coachRangeBounds;
    return entries.filter((entry) => {
      const date = String(entry?.date || "").slice(0, 10);
      if (!looksLikeYYYYMMDD(date)) return false;
      if (startIso && looksLikeYYYYMMDD(startIso) && date < startIso) return false;
      if (endIso && looksLikeYYYYMMDD(endIso) && date > endIso) return false;
      return true;
    });
  }, [coachRangeBounds, entries]);

  const snapshot = useMemo(() => (entriesForCoach.length ? buildSnapshot(entriesForCoach) : null), [entriesForCoach]);

  const analyticsSummary = useMemo(
    () => buildAnalyticsSummaryFromEntries(entriesForCoach),
    [entriesForCoach]
  );

  const recentSessions = useMemo(() => {
    if (!entriesForCoach.length) return [];
    const sorted = [...entriesForCoach].sort((a: any, b: any) =>
      String(a.date || "").localeCompare(String(b.date || ""))
    );
    return sorted.slice(-25).reverse();
  }, [entriesForCoach]);

  useEffect(() => {
    if (!coachUserProfile?.id || !activeAccountId) {
      setTradeRows([]);
      return;
    }

    let alive = true;
    (async () => {
      try {
        let q = supabaseBrowser
          .from("journal_trades")
          .select("journal_date, leg, symbol, kind, side, premium, strategy, price, quantity, time")
          .eq("user_id", coachUserProfile.id)
          .order("journal_date", { ascending: true });

        if (activeAccountId) q = q.eq("account_id", activeAccountId);
        if (coachRangeBounds.startIso && looksLikeYYYYMMDD(coachRangeBounds.startIso)) {
          q = q.gte("journal_date", coachRangeBounds.startIso);
        }
        if (coachRangeBounds.endIso && looksLikeYYYYMMDD(coachRangeBounds.endIso)) {
          q = q.lte("journal_date", coachRangeBounds.endIso);
        }

        const { data, error } = await q;
        if (error) throw error;
        if (!alive) return;
        setTradeRows((data ?? []) as JournalTradeRow[]);
      } catch (err) {
        console.error("[AI Coaching] journal_trades load error:", err);
        if (!alive) return;
        setTradeRows([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [coachUserProfile?.id, activeAccountId, coachRangeBounds.endIso, coachRangeBounds.startIso]);

  useEffect(() => {
    if (!recentSessions.length || !tradeRows.length) {
      setTradesByDate({});
      return;
    }

    const recentDates = new Set(
      recentSessions.map((s: any) => String(s?.date || "").slice(0, 10)).filter(looksLikeYYYYMMDD)
    );
    const map: Record<string, TradesPayload> = {};

    for (const row of tradeRows) {
      const date = String(row.journal_date || "").slice(0, 10);
      if (!recentDates.has(date)) continue;
      if (!map[date]) map[date] = { entries: [], exits: [] };
      const payload = map[date];
      const out: any = {
        id: `${row.journal_date}-${row.symbol}-${row.leg}-${row.time || ""}`,
        symbol: row.symbol ?? "",
        kind: (row.kind ?? "other") as any,
        side: row.side ?? undefined,
        premiumSide: row.premium ?? undefined,
        optionStrategy: row.strategy ?? undefined,
        price: row.price != null ? Number(row.price) : 0,
        quantity: row.quantity != null ? Number(row.quantity) : 0,
        time: row.time ?? "",
      };
      if (String(row.leg ?? "").toLowerCase().includes("exit")) payload.exits!.push(out);
      else payload.entries!.push(out);
    }

    setTradesByDate(map);
  }, [recentSessions, tradeRows]);

  const planSnapshot: PlanSnapshot | null = useMemo(() => {
    if (!growthPlan) return null;

    const startingBalance = toNum(growthPlan.starting_balance, 0);
    const targetBalance = toNum(growthPlan.target_balance, 0);

    const planStartDate = planStartIso || null;

    const filtered = planStartDate ? entries.filter((e: any) => String(e.date || "") >= planStartDate) : entries;

    const tradingPnlFromEntries = filtered.reduce((sum, e: any) => sum + sessionNetPnl(e), 0);
    const netCashflowsFromRows = (cashflows || []).reduce((sum, cf) => sum + signedCashflowAmount(cf), 0);

    // Prefer account-series totals so this card matches Balance Chart exactly.
    const tradingPnlSincePlan = accountSeriesTotals?.tradingPnl ?? tradingPnlFromEntries;
    const netCashflows = accountSeriesTotals?.cashflowNet ?? netCashflowsFromRows;

    const baselineProfitTarget = targetBalance - startingBalance;

    // Rebase the plan with cashflows so deposits/withdrawals do NOT inflate "progress".
    const effectiveStartingBalance = startingBalance + netCashflows;
    const effectiveTargetBalance = effectiveStartingBalance + baselineProfitTarget;

    const currentBalance = accountSeriesTotals?.currentBalance ?? (effectiveStartingBalance + tradingPnlSincePlan);

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
  }, [growthPlan, entries, cashflows, planStartIso, accountSeriesTotals]);

  const rangeCashflows = useMemo(() => {
    const { startIso, endIso } = coachRangeBounds;
    return (cashflows ?? []).filter((cf) => {
      const date = String(cf?.date ?? "").slice(0, 10);
      if (!looksLikeYYYYMMDD(date)) return false;
      if (startIso && looksLikeYYYYMMDD(startIso) && date < startIso) return false;
      if (endIso && looksLikeYYYYMMDD(endIso) && date > endIso) return false;
      return true;
    });
  }, [cashflows, coachRangeBounds]);

  const analyticsSnapshot = useMemo(() => {
    const currentBalance = planSnapshot?.currentBalance ?? accountSeriesTotals?.currentBalance ?? 0;
    const contextPnl = entriesForCoach.reduce((sum, entry) => sum + sessionNetPnl(entry), 0);
    const contextCashflows = rangeCashflows.reduce((sum, cf) => sum + signedCashflowAmount(cf), 0);
    const startingBalance =
      currentBalance && (contextPnl !== 0 || contextCashflows !== 0)
        ? currentBalance - contextPnl - contextCashflows
        : planSnapshot?.effectiveStartingBalance ?? toNum(growthPlan?.starting_balance, 0);

    return buildCoachAnalyticsSnapshot(entriesForCoach, rangeCashflows, coachRangeBounds, startingBalance);
  }, [
    accountSeriesTotals?.currentBalance,
    coachRangeBounds,
    entriesForCoach,
    growthPlan,
    planSnapshot?.currentBalance,
    planSnapshot?.effectiveStartingBalance,
    rangeCashflows,
  ]);

  const sessionsForTradeAnalytics = useMemo(() => {
    return (entriesForCoach as any[])
      .map((e) => {
        const date = String(e?.date ?? e?.trade_date ?? e?.created_at ?? "").slice(0, 10);
        if (!looksLikeYYYYMMDD(date)) return null;
        return { date, pnlNet: sessionNetPnl(e) };
      })
      .filter(Boolean) as Array<{ date: string; pnlNet: number }>;
  }, [entriesForCoach]);

  const tradeStats = useMemo<TradeAnalytics | null>(() => {
    if (!tradeRows.length) return null;
    return computeTradeAnalytics(tradeRows, sessionsForTradeAnalytics);
  }, [tradeRows, sessionsForTradeAnalytics]);

  const effectiveStartingBalance = useMemo(
    () => planSnapshot?.effectiveStartingBalance ?? toNum(growthPlan?.starting_balance, 0),
    [planSnapshot?.effectiveStartingBalance, growthPlan]
  );
  const coachContextStartingBalance = useMemo(() => {
    const currentBalance = planSnapshot?.currentBalance ?? accountSeriesTotals?.currentBalance ?? 0;
    const contextPnl = sessionsForTradeAnalytics.reduce((sum, session) => sum + session.pnlNet, 0);
    const contextCashflows = rangeCashflows.reduce((sum, cf) => sum + signedCashflowAmount(cf), 0);
    if (currentBalance && (contextPnl !== 0 || contextCashflows !== 0)) {
      return currentBalance - contextPnl - contextCashflows;
    }
    return effectiveStartingBalance;
  }, [
    accountSeriesTotals?.currentBalance,
    effectiveStartingBalance,
    planSnapshot?.currentBalance,
    rangeCashflows,
    sessionsForTradeAnalytics,
  ]);

  const equityCurve = useMemo(() => {
    return computeEquityCurveFromSessions(
      sessionsForTradeAnalytics,
      rangeCashflows,
      coachContextStartingBalance,
      coachRangeBounds.startIso || null
    );
  }, [sessionsForTradeAnalytics, rangeCashflows, coachContextStartingBalance, coachRangeBounds.startIso]);

  const performanceReturns = useMemo(() => {
    if (!equityCurve.length) return [];
    const rangeStartCandidate = coachRangeBounds.startIso ?? "";
    const rangeStart = looksLikeYYYYMMDD(rangeStartCandidate) ? rangeStartCandidate : "";
    const startIso = rangeStart || equityCurve[0].date;
    const endIso = equityCurve[equityCurve.length - 1]?.date ?? startIso;
    const dailyPnl = sessionsForTradeAnalytics.map((s) => ({ date: s.date, pnl: s.pnlNet }));
    const cashflowPoints = (rangeCashflows ?? []).map((cf) => ({
      date: String(cf?.date ?? "").slice(0, 10),
      net: signedCashflowAmount(cf),
    }));
    return buildCashflowAdjustedDailyReturns({
      startIso,
      endIso,
      startingBalance: coachContextStartingBalance,
      dailyPnl,
      cashflows: cashflowPoints,
    });
  }, [equityCurve, sessionsForTradeAnalytics, rangeCashflows, coachRangeBounds.startIso, coachContextStartingBalance]);

  const kpiResults = useMemo<KPIResult[]>(() => {
    if (!tradeStats) return [];
    const kpiTrades = buildKpiTrades(tradeStats);
    if (!kpiTrades.length) return [];
    const equityPoints = equityCurve.map((p) => ({ time: p.date, equity_value: p.value }));
    return computeAllKPIs(kpiTrades, equityPoints, undefined, {
      annualizationDays: 252,
      returnsSeries: performanceReturns,
    });
  }, [tradeStats, equityCurve, performanceReturns]);

  const kpiResultsForCoach = useMemo(() => {
    if (!kpiResults.length) return [];
    const priority: string[] = [
      "net_pnl",
      "win_rate",
      "avg_win",
      "avg_loss",
      "profit_factor",
      "expectancy",
      "payoff_ratio",
      "profit_per_trade",
      "max_drawdown_percent",
      "max_consecutive_losses",
      "avg_trade_duration_minutes",
      "best_trade_pnl",
      "worst_trade_pnl",
      "sharpe_ratio",
      "sortino_ratio",
    ];

    const byId = new Map(kpiResults.map((k) => [String(k.id), k]));
    const picked: KPIResult[] = [];

    for (const id of priority) {
      const k = byId.get(id);
      if (k && k.value != null) picked.push(k);
    }

    if (picked.length < 20) {
      for (const k of kpiResults) {
        if (k.value == null) continue;
        if (picked.some((p) => p.id === k.id)) continue;
        picked.push(k);
        if (picked.length >= 20) break;
      }
    }

    return picked;
  }, [kpiResults]);

  const tradeStatsSummary = useMemo(() => {
    if (!tradeStats || tradeStats.tradeCount === 0) return null;
    const tradesWithTime = tradeStats.matchedTrades.filter(
      (t) => t.entryTimeMin != null && t.exitTimeMin != null
    ).length;
    const tradesWithoutTime = tradeStats.tradeCount - tradesWithTime;
    return {
      tradeCount: tradeStats.tradeCount,
      tradeDays: tradeStats.tradeDays,
      avgPnlPerTrade: tradeStats.avgPnlPerTrade,
      pnlPerHour: tradeStats.pnlPerHour,
      hold: tradeStats.hold,
      tradesWithTime,
      tradesWithoutTime,
    };
  }, [tradeStats]);

  const periodComparisons = useMemo<PeriodComparison[]>(() => {
    if (!sessionsForTradeAnalytics.length) return [];

    const todayIso = isoDate(new Date());

    const last7Start = addDaysIso(todayIso, -6);
    const prev7Start = addDaysIso(todayIso, -13);
    const prev7End = addDaysIso(todayIso, -7);

    const last30Start = addDaysIso(todayIso, -29);
    const prev30Start = addDaysIso(todayIso, -59);
    const prev30End = addDaysIso(todayIso, -30);

    const currentMonthStart = startOfMonthIso(todayIso);
    const prevMonthAnchor = shiftMonthsIso(todayIso, -1);
    const prevMonthStart = startOfMonthIso(prevMonthAnchor);
    const d = new Date(`${todayIso}T00:00:00`);
    const prevMonth = new Date(`${prevMonthAnchor}T00:00:00`);
    const maxPrevDay = daysInMonth(prevMonth.getFullYear(), prevMonth.getMonth());
    const dayOfMonth = d.getDate();
    const prevMonthEnd = addDaysIso(prevMonthStart, Math.max(0, Math.min(dayOfMonth, maxPrevDay) - 1));

    const mkDelta = (cur: PeriodWindowStats, prev: PeriodWindowStats) => ({
      sessions: cur.sessions - prev.sessions,
      winRate: cur.winRate - prev.winRate,
      netPnl: cur.netPnl - prev.netPnl,
      avgNet: cur.avgNet - prev.avgNet,
      avgHoldWinMins:
        cur.avgHoldWinMins != null && prev.avgHoldWinMins != null ? cur.avgHoldWinMins - prev.avgHoldWinMins : null,
      avgHoldLossMins:
        cur.avgHoldLossMins != null && prev.avgHoldLossMins != null ? cur.avgHoldLossMins - prev.avgHoldLossMins : null,
      pnlPerHour:
        cur.pnlPerHour != null && prev.pnlPerHour != null ? cur.pnlPerHour - prev.pnlPerHour : null,
    });

    const mkKpiDeltas = (cur: PeriodWindowStats, prev: PeriodWindowStats) => {
      const out: Array<{
        id: string;
        name: string;
        dataType: string;
        unit: string;
        current: number;
        previous: number;
        delta: number;
      }> = [];

      const ids = ["profit_factor", "expectancy", "payoff_ratio", "profit_per_trade", "avg_trade_duration_minutes"];
      for (const id of ids) {
        const c = cur.kpis?.[id];
        const p = prev.kpis?.[id];
        if (!c || !p) continue;
        if (c.value == null || p.value == null) continue;
        out.push({
          id,
          name: c.name,
          dataType: c.dataType,
          unit: c.unit,
          current: c.value,
          previous: p.value,
          delta: c.value - p.value,
        });
      }

      // Keep it small: top 3 by absolute delta
      return out
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3);
    };

    const last7 = computeWindowStats(sessionsForTradeAnalytics, tradeRows, last7Start, todayIso);
    const prev7 = computeWindowStats(sessionsForTradeAnalytics, tradeRows, prev7Start, prev7End);

    const last30 = computeWindowStats(sessionsForTradeAnalytics, tradeRows, last30Start, todayIso);
    const prev30 = computeWindowStats(sessionsForTradeAnalytics, tradeRows, prev30Start, prev30End);

    const mtd = computeWindowStats(sessionsForTradeAnalytics, tradeRows, currentMonthStart, todayIso);
    const prevMtd = computeWindowStats(sessionsForTradeAnalytics, tradeRows, prevMonthStart, prevMonthEnd);

    return [
      {
        label: "Last 7D vs previous 7D",
        current: last7,
        previous: prev7,
        delta: mkDelta(last7, prev7),
        kpiDeltas: mkKpiDeltas(last7, prev7),
      },
      {
        label: "Last 30D vs previous 30D",
        current: last30,
        previous: prev30,
        delta: mkDelta(last30, prev30),
        kpiDeltas: mkKpiDeltas(last30, prev30),
      },
      {
        label: "Month-to-date vs previous month-to-date",
        current: mtd,
        previous: prevMtd,
        delta: mkDelta(mtd, prevMtd),
        kpiDeltas: mkKpiDeltas(mtd, prevMtd),
      },
    ];
  }, [sessionsForTradeAnalytics, tradeRows]);

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
      title: L("AI Coaching", "Coaching AI"),
      metadata: backStudyParams ? { backStudyParams } : null,
    });

    if (!t) return;

    // Refresh thread list
    const refreshed = await listAiCoachThreads(coachUserProfile.id, { limit: 20 });
    setThreads(refreshed);
    setActiveThread(t);
    setMessages([]);
    setFeedbackByMessage({});

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
      meta: (m.meta as ChatMessage["meta"]) ?? null,
    }));
    setMessages(mapped);
    await loadFeedbackState(threadId);
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
      const languageHint =
        coachConversationLanguage === "auto" ? detectLanguage(finalQuestion) : coachConversationLanguage;

      const userText =
        finalQuestion ||
        L(
          "(No specific question. Please analyze the attached screenshot and my data.)",
          "(Sin pregunta específica. Analiza el screenshot adjunto y mis datos.)"
        );

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
      const compactRecent = recentSessions.map((s: any) =>
        compactSessionForAi(s, tradesByDate[String(s?.date || "").slice(0, 10)] || null)
      );
      const relevant = findRelevantSessions(entriesForCoach, finalQuestion, 8).map((s: any) =>
        compactSessionForAi(s, tradesByDate[String(s?.date || "").slice(0, 10)] || null)
      );

      // 4) Include short chat history for continuity
      const chatHistory = messages
        .slice(-12)
        .map((m) => ({
          role: m.role,
          text: clampText(m.text, 700),
          createdAt: m.createdAt,
        }));

      const session = await supabaseBrowser.auth.getSession();
      const token = session?.data?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/ai-coach", {
        method: "POST",
        headers,
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
          analyticsSnapshot,
          kpiResults: kpiResultsForCoach,
          tradeStatsSummary,
          periodComparisons,
          recentSessions: compactRecent,
          relevantSessions: relevant,

          // Platform context
          planSnapshot,
          growthPlan: growthPlan
            ? {
                startingBalance: toNum(growthPlan.starting_balance, 0),
                targetBalance: toNum(growthPlan.target_balance, 0),
                targetDate: growthPlan.target_date ?? null,
                planMode: growthPlan.plan_mode ?? null,
                dailyTargetPct: toNum(growthPlan.daily_target_pct ?? growthPlan.daily_goal_percent, 0),
                maxDailyLossPercent: toNum(growthPlan.max_daily_loss_percent, 0),
                maxRiskPerTradePercent: toNum(growthPlan.max_risk_per_trade_percent, 0),
                maxRiskPerTradeUsd: toNum(growthPlan.max_risk_per_trade_usd, 0),
                tradingDays: toNum(growthPlan.trading_days, 0),
                lossDaysPerWeek: toNum(growthPlan.loss_days_per_week, 0),
                planStartDate: planStartIsoFromPlan(growthPlan),
                rules: Array.isArray(growthPlan.rules)
                  ? growthPlan.rules
                      .filter((rule) => rule && rule.isActive !== false)
                      .slice(0, 8)
                      .map((rule) => ({
                        id: rule.id ?? "",
                        label: String(rule.label ?? "").trim(),
                        description: String(rule.description ?? "").trim(),
                      }))
                  : [],
                executionSystem: growthPlan.steps?.execution_and_journal?.system
                  ? {
                      doList: Array.isArray(growthPlan.steps.execution_and_journal.system?.doList)
                        ? growthPlan.steps.execution_and_journal.system.doList.slice(0, 6)
                        : [],
                      dontList: Array.isArray(growthPlan.steps.execution_and_journal.system?.dontList)
                        ? growthPlan.steps.execution_and_journal.system.dontList.slice(0, 6)
                        : [],
                      orderList: Array.isArray(growthPlan.steps.execution_and_journal.system?.orderList)
                        ? growthPlan.steps.execution_and_journal.system.orderList.slice(0, 6)
                        : [],
                    }
                  : null,
                planPhases: Array.isArray(growthPlan.plan_phases)
                  ? growthPlan.plan_phases.slice(0, 24).map((phase) => ({
                      id: String(phase?.id ?? ""),
                      title: String(phase?.title ?? ""),
                      targetEquity: toNum(phase?.targetEquity ?? phase?.target_equity, 0),
                      targetDate: phase?.targetDate ?? phase?.target_date ?? null,
                      status: phase?.status ?? null,
                      monthIndex: phase?.monthIndex ?? phase?.month_index ?? null,
                      weekIndex: phase?.weekIndex ?? phase?.week_index ?? null,
                    }))
                  : [],
              }
            : null,
          cashflowsSummary: {
            netCashflows: rangeCashflows.reduce((sum, cf) => sum + signedCashflowAmount(cf), 0),
            count: rangeCashflows.length || 0,
            rangeStartIso: coachRangeBounds.startIso || null,
            rangeEndIso: coachRangeBounds.endIso || null,
          },
          fullSnapshot,
          gamification,
          userProfile: coachUserProfile,

          // Style hints
          stylePreset: {
            mode: "conversational-trading-coach",
            askFollowupQuestion: true,
            shortSegments: true,
            strictEvidenceMode: true,
          },
          coachingFocus: {
            mode: coachMode,
            rangePreset: coachRangePreset,
            rangeStartIso: coachRangeBounds.startIso || null,
            rangeEndIso: coachRangeBounds.endIso || null,
            useChallengesAndGamification: true,
            useAnalyticsSummary: true,
            useRelevantSessions: true,
            evaluateExitTimingFromChart: true,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          data?.details ||
          data?.error ||
          L("There was an error contacting the AI coach.", "Hubo un error contactando al coach AI.");
        throw new Error(msg);
      }

      const coachText =
        String(data.text || "").trim() ||
        L("No response text received.", "No se recibió texto de respuesta.");
      const coachMeta: ChatMessage["meta"] = {
        actionPlan: data?.actionPlan ?? null,
        autoAudit: data?.autoAudit ?? null,
      };

      // 5) Persist coach message (Supabase)
      const coachRow = await insertAiCoachMessage({
        threadId: activeThread.id,
        userId: coachUserProfile.id,
        role: "coach",
        content: coachText,
        meta: {
          model: data?.model || null,
          usage: data?.usage || null,
          actionPlan: coachMeta?.actionPlan ?? null,
          autoAudit: coachMeta?.autoAudit ?? null,
        },
      });

      const coachMsg: ChatMessage = {
        id: coachRow?.id || makeId(),
        role: "coach",
        text: coachText,
        createdAt: coachRow?.created_at || new Date().toISOString(),
        meta: coachMeta,
      };

      setMessages((prev) => [...prev, coachMsg]);
      setCoachState({ loading: false, error: null });

      // Refresh memory snapshot after response
      await fetchCoachMemory();

      // Optional: clear screenshot after send
      clearScreenshot();
    } catch (err: any) {
      console.error("[AI Coaching] request error:", err);
      setCoachState({ loading: false, error: err?.message || L("Unknown error", "Error desconocido") });
    }
  }

  /* =========================
     Render
  ========================== */

  const latestCoachArtifacts = [...messages]
    .reverse()
    .find((msg) => msg.role === "coach" && (msg.meta?.actionPlan || msg.meta?.autoAudit));

  const selectedCoachModeMeta =
    coachMode === "weekly-review"
      ? {
          label: L("Weekly review", "Revisión semanal"),
          description: L(
            "Use the selected range to identify what is improving, what is slipping, and the one adjustment that most affects next week.",
            "Usa el rango seleccionado para identificar qué mejora, qué se está desviando y el ajuste único que más impacta la próxima semana."
          ),
        }
      : coachMode === "risk-discipline"
        ? {
            label: L("Risk discipline", "Disciplina de riesgo"),
            description: L(
              "Prioritize loss containment, position sizing, daily loss breaches, and rule enforcement against the plan.",
              "Prioriza contención de pérdidas, size, violaciones de pérdida diaria y cumplimiento de reglas contra el plan."
            ),
          }
        : coachMode === "execution-truth"
          ? {
              label: L("Execution truth", "Verdad de ejecución"),
              description: L(
                "Focus on entries, exits, management, and whether the execution matched the original plan and the audit trail.",
                "Enfócate en entradas, salidas, manejo y si la ejecución realmente coincidió con el plan original y el audit trail."
              ),
            }
          : coachMode === "psychology-patterns"
            ? {
                label: L("Psychology patterns", "Patrones psicológicos"),
                description: L(
                  "Look for emotional drift, repeated cognitive flags, and the pattern most likely to sabotage the next checkpoint.",
                  "Busca drift emocional, flags cognitivos repetidos y el patrón más probable de sabotear el próximo checkpoint."
                ),
              }
            : {
                label: L("Plan rescue", "Rescate del plan"),
                description: L(
                  "Anchor the conversation to the Growth Plan, the next checkpoint, and the highest-leverage behavior to improve plan attainment.",
                  "Ancla la conversación al Growth Plan, al próximo checkpoint y a la conducta de mayor leverage para mejorar el cumplimiento del plan."
                ),
              };

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
        <p className="text-sm text-slate-400">{L("Loading coach…", "Cargando coach…")}</p>
      </div>
    );
  }

  if (planLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-16">
          <p className="text-sm text-slate-400">{L("Loading…", "Cargando…")}</p>
        </div>
      </main>
    );
  }

  if (plan !== "advanced") {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50">
        <TopNav />
        <div className="max-w-4xl mx-auto px-6 py-16">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <p className="text-emerald-300 text-[11px] uppercase tracking-[0.3em]">
              {L("Advanced feature", "Función Advanced")}
            </p>
            <h1 className="text-xl font-semibold mt-2">
              {L(
                "AI Coaching is included in Advanced",
                "AI Coaching está incluido en Advanced"
              )}
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              {L(
                "Upgrade to Advanced to unlock action plans, deep analytics insights, and AI-driven coaching.",
                "Actualiza a Advanced para desbloquear planes de acción, insights avanzados y coaching con IA."
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/billing"
                className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition"
              >
                {L("Upgrade to Advanced", "Actualizar a Advanced")}
              </Link>
              <Link
                href="/plans-comparison"
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs hover:border-emerald-400 transition"
              >
                {L("Compare plans", "Comparar planes")}
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <TopNav />

      <main className="flex-1 min-h-0 w-full px-4 md:px-8 py-6 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500/20 border border-emerald-400/60 flex items-center justify-center text-xs font-semibold">
              AI
            </div>
            <div>
              <h1 className="text-2xl font-semibold">
                {L("Your AI Trading Coach", "Tu coach de trading con IA")}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {L(
                  "Practical coaching on risk, psychology and process, using your journal, analytics, challenges and growth plan.",
                  "Coaching práctico de riesgo, psicología y proceso usando tu journal, analytics, retos y plan de crecimiento."
                )}
              </p>
              {coachUserProfile && (
                <p className="text-[11px] text-slate-500 mt-1">
                  {L("Coaching for", "Coaching para")}{" "}
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
                {L("Level", "Nivel")}{" "}
                <span className="font-semibold text-emerald-100">
                  {gamification.level}
                </span>{" "}
                · {L("Tier", "Rango")}{" "}
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
              ← {L("Back to Analytics", "Volver a Analytics")}
            </Link>
          </div>
        </div>

        {/* Back-study context pill */}
        {backStudyParams && (
          <div className="rounded-2xl border border-sky-700/60 bg-sky-900/30 px-3 py-2 text-[11px] text-sky-100 flex flex-wrap items-center gap-2">
            <span className="font-semibold uppercase tracking-[0.18em] text-sky-300">
              {L("Back-study trade linked", "Back-study vinculado")}
            </span>
            <span>
              {L("Symbol", "Símbolo")}:{" "}
              <span className="font-mono font-semibold">
                {backStudyParams.symbol}
              </span>
            </span>
            <span>· {L("Date", "Fecha")}: {backStudyParams.date}</span>
            {backStudyParams.entryTime && backStudyParams.exitTime && (
              <span>
                · {L("Window", "Ventana")}: {backStudyParams.entryTime} → {backStudyParams.exitTime}
              </span>
            )}
            {backStudyParams.tf && <span>· {L("TF", "TF")}: {backStudyParams.tf}</span>}
            {backStudyParams.range && <span>· {L("Range", "Rango")}: {backStudyParams.range}</span>}
          </div>
        )}

        <section className="rounded-2xl border border-emerald-500/20 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_48%),rgba(15,23,42,0.92)] p-4 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300">
                {L("Coaching objective", "Objetivo del coaching")}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-100">
                {selectedCoachModeMeta.label}
              </h2>
              <p className="mt-1 text-sm text-slate-300">
                {selectedCoachModeMeta.description}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {L(
                  "The coach searches all sessions inside this range, then retrieves the journal evidence most relevant to your question and your Growth Plan.",
                  "El coach busca todas las sesiones dentro de este rango y luego recupera la evidencia del journal más relevante para tu pregunta y tu Growth Plan."
                )}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[620px]">
              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  {L("Coaching lens", "Lente del coach")}
                </span>
                <select
                  value={coachMode}
                  onChange={(e) => setCoachMode(e.target.value as CoachMode)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                >
                  {coachModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  {L("Context range", "Rango de contexto")}
                </span>
                <select
                  value={coachRangePreset}
                  onChange={(e) => setCoachRangePreset(e.target.value as CoachRangePreset)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                >
                  {coachRangeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  {L("Coach language", "Idioma del coach")}
                </span>
                <select
                  value={coachConversationLanguage}
                  onChange={(e) => setCoachConversationLanguage(e.target.value as CoachConversationLanguage)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                >
                  {coachConversationLanguageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1">
              {L("Range", "Rango")}: <span className="font-semibold text-slate-100">{coachRangeBounds.label}</span>
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1">
              {L("Sessions in context", "Sesiones en contexto")}: <span className="font-semibold text-slate-100">{entriesForCoach.length}</span>
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1">
              {L("Coach language", "Idioma del coach")}:{" "}
              <span className="font-semibold text-slate-100">
                {coachConversationLanguage === "auto"
                  ? L("Auto-detect", "Auto-detect")
                  : coachConversationLanguage === "es"
                    ? "Español"
                    : "English"}
              </span>
            </span>
            {coachRangeBounds.startIso && (
              <span className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1">
                {L("Window", "Ventana")}: <span className="font-semibold text-slate-100">{coachRangeBounds.startIso}</span>
                {" "}→{" "}
                <span className="font-semibold text-slate-100">{coachRangeBounds.endIso || isoDate(new Date())}</span>
              </span>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4 flex-1 min-h-0">
          {/* Chat panel */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 flex flex-col min-h-0">
            {/* Chat header */}
            <div className="border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-100">
                  {L("Live coaching", "Coaching en vivo")}
                </p>
                <p className="text-xs text-slate-400">
                  {L(
                    "Ask questions, attach a chart screenshot, and get focused feedback anchored to the selected journal range and Growth Plan.",
                    "Haz preguntas, adjunta un screenshot y recibe feedback enfocado, anclado al rango del journal seleccionado y al Growth Plan."
                  )}{" "}
                  {L("You can write in English or Spanish.", "Puedes escribir en español o inglés.")}
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
                      {t.title || L("AI Coaching", "AI Coaching")} · {String(t.updated_at || "").slice(0, 10)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={createNewThread}
                  className="text-xs rounded-xl border border-slate-700 px-3 py-1 hover:bg-slate-800"
                >
                  {L("New chat", "Nuevo chat")}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
              {coachMemory && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-[0_0_30px_rgba(16,185,129,0.12)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-emerald-300">
                        {L("Coach memory snapshot", "Memoria del coach")}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {L("What the coach has learned about you so far.", "Lo que el coach ha aprendido sobre ti.")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMemoryOpen((prev) => !prev)}
                      className="text-[11px] rounded-full border border-slate-700 px-3 py-1 hover:border-emerald-400 hover:text-emerald-200"
                    >
                      {memoryOpen ? L("Hide", "Ocultar") : L("Show", "Ver")}
                    </button>
                  </div>

                  {memoryOpen && (
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400 mb-2">
                          {L("Daily", "Diario")} {coachMemory.dailyKey ? `· ${coachMemory.dailyKey}` : ""}
                        </p>
                        {renderMemoryList(coachMemory.daily)}
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400 mb-2">
                          {L("Weekly", "Semanal")} {coachMemory.weeklyKey ? `· ${coachMemory.weeklyKey}` : ""}
                        </p>
                        {renderMemoryList(coachMemory.weekly)}
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-slate-400 mb-2">
                          {L("Global", "Global")}
                        </p>
                        {renderMemoryList(coachMemory.global)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!messages.length && !coachState.error && (
                <p className="text-xs text-slate-500">
                  {coachUiIsEs ? "Empieza escribiendo una pregunta (ejemplo:" : "Start by typing a question (example:"}{" "}
                  <span className="italic">
                    {coachUiIsEs ? "“¿Qué debo mejorar en mis últimas 5 sesiones?”" : "“What do I need to improve in my last 5 sessions?”"}
                  </span>
                  {coachUiIsEs
                    ? "). También puedes adjuntar un screenshot de un chart con flechas de entrada/salida."
                    : "). You can also attach a screenshot of a trade chart with entry/exit arrows."}
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
                    {msg.role === "coach" ? <CoachMarkdown text={msg.text} /> : msg.text}
                    {msg.role === "coach" && renderActionPlan(msg.meta?.actionPlan)}
                    {msg.role === "coach" && renderAutoAudit(msg.meta?.autoAudit)}
                    {msg.role === "coach" && feedbackEnabled && (
                      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                        <span>{L("Helpful?", "¿Útil?")}</span>
                        <button
                          type="button"
                          disabled={feedbackSending[msg.id]}
                          onClick={() => sendFeedback(msg.id, 1)}
                          className={`rounded-full border px-2 py-0.5 transition ${
                            feedbackByMessage[msg.id] === 1
                              ? "border-emerald-400 text-emerald-200"
                              : "border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
                          }`}
                        >
                          👍
                        </button>
                        <button
                          type="button"
                          disabled={feedbackSending[msg.id]}
                          onClick={() => sendFeedback(msg.id, -1)}
                          className={`rounded-full border px-2 py-0.5 transition ${
                            feedbackByMessage[msg.id] === -1
                              ? "border-rose-400 text-rose-200"
                              : "border-slate-700 hover:border-rose-400 hover:text-rose-200"
                          }`}
                        >
                          👎
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {coachState.loading && (
                <div className="flex justify-start">
                  <div className="text-xs text-slate-400 italic">
                    {L("The coach is analyzing your data…", "El coach está analizando tus datos…")}
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
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                      {L("Prompt library", "Biblioteca de prompts")}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {L("Selecting one loads lens + range + question.", "Al seleccionar uno carga lente + rango + pregunta.")}
                    </p>
                  </div>

                  <select
                    value={selectedPromptId}
                    onChange={(e) => handlePromptSelection(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                  >
                    <option value="">
                      {L("Choose a smart prompt...", "Elige un prompt inteligente...")}
                    </option>
                    <optgroup label={L("Growth Plan plays", "Prompts de Growth Plan")}>
                      {promptGroups.primary.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label={L("Neuro + execution plays", "Prompts Neuro + ejecución")}>
                      {promptGroups.neuro.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  {selectedPromptTemplate ? (
                    <div className="mt-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                          {coachModeLabels[selectedPromptTemplate.mode]}
                        </span>
                        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                          {coachRangeLabels[selectedPromptTemplate.range]}
                        </span>
                        <span className="rounded-full border border-cyan-400/20 px-2 py-0.5 text-[10px] text-cyan-100">
                          {L("Loaded into composer", "Cargado al composer")}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] font-semibold text-slate-100">
                        {selectedPromptTemplate.label}
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-300">
                        {selectedPromptTemplate.prompt}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Text + screenshot */}
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <textarea
                    className="flex-1 min-h-[60px] max-h-[140px] rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/40"
                    placeholder={
                      coachUiIsEs
                        ? "Pregunta al coach sobre tus últimas operaciones, emociones, retos o disciplina del plan..."
                        : "Ask your coach about your last trades, emotions, challenges, or plan adherence..."
                    }
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                  <div className="w-32 flex flex-col items-center gap-2">
                    <label className="w-full text-[11px] text-center rounded-xl border border-dashed border-slate-700 bg-slate-950/60 px-2 py-2 cursor-pointer hover:border-emerald-400 hover:text-emerald-200">
                      <span className="block mb-1">{L("Screenshot", "Screenshot")}</span>
                      <span className="text-[10px] text-slate-400">{L("Chart / P&L / platform", "Chart / P&L / plataforma")}</span>
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
                          alt={L("Screenshot preview", "Vista previa")}
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
                    {coachState.loading ? L("Coaching...", "Analizando...") : L("Send to AI coach", "Enviar al coach AI")}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Side panel */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-4 min-h-0 overflow-y-auto">
            <h2 className="text-sm font-medium text-slate-200 flex items-center justify-between">
              {L("Snapshot", "Resumen")}
              <span className="text-[10px] text-slate-400">
                {coachRangeBounds.label} · {recentSessions.length} {L("sessions", "sesiones")}
              </span>
            </h2>

            {latestCoachArtifacts && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                  {L("Latest coach output", "Último output del coach")}
                </p>
                {renderActionPlan(latestCoachArtifacts.meta?.actionPlan)}
                {renderAutoAudit(latestCoachArtifacts.meta?.autoAudit)}
              </div>
            )}

            {latestCoachArtifacts?.meta?.actionPlan &&
              renderGrowthPlanSuggestions(latestCoachArtifacts.meta.actionPlan)}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">{L("Total sessions", "Sesiones totales")}</p>
                <p className="text-xl font-semibold">{snapshot?.totalSessions ?? 0}</p>
              </div>
              <div className="rounded-xl border border-emerald-800/60 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">{L("Wins", "Ganadas")}</p>
                <p className="text-xl font-semibold">{snapshot?.greenSessions ?? 0}</p>
              </div>
              <div className="rounded-xl border border-sky-800/60 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">{L("Lessons", "Aprendizajes")}</p>
                <p className="text-xl font-semibold">{snapshot?.redSessions ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-[11px] text-slate-400">{L("Win rate (est.)", "Win rate (est.)")}</p>
                <p className="text-xl font-semibold">{snapshot ? `${snapshot.winRate.toFixed(1)}%` : "—"}</p>
              </div>
            </div>

            {planSnapshot && (
              <div className="rounded-xl border border-emerald-700 bg-slate-950/70 p-3 space-y-1">
                <p className="text-[11px] text-emerald-300 font-semibold">
                  {L("Plan vs current (cashflows-neutral)", "Plan vs actual (neutral a cashflows)")}
                </p>

                <p className="text-[12px] text-slate-300">
                  {L("Start", "Inicio")}: <span className="font-semibold">{usd(planSnapshot.effectiveStartingBalance)}</span>{" "}
                  · {L("Target", "Meta")}: <span className="font-semibold text-emerald-300">{usd(planSnapshot.effectiveTargetBalance)}</span>
                </p>

                <p className="text-[12px] text-slate-300">
                  {L("Current balance", "Balance actual")}: <span className="font-semibold">{usd(planSnapshot.currentBalance)}</span>
                </p>

                <p className="text-[11px] text-slate-400">
                  {L("Progress vs plan", "Progreso vs plan")}: {planSnapshot.progressPct.toFixed(1)}% · {L("Sessions since plan", "Sesiones desde el plan")}: {planSnapshot.sessionsSincePlan}
                </p>

                <p className="text-[11px] text-slate-400">
                  {L("Trading P&L", "P&L trading")}: {usd(planSnapshot.tradingPnlSincePlan)} · {L("Net cashflow", "Cashflow neto")}: {usd(planSnapshot.netCashflows)}
                </p>
              </div>
            )}

            {/* Top tags */}
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[11px] text-slate-400 mb-2">{L("Most common tags", "Tags más comunes")}</p>
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
                  <p className="text-[11px] text-slate-500">{L("No tags yet.", "Aún no hay tags.")}</p>
                )}
              </div>
            </div>

            {!snapshot && !dataLoading && (
              <p className="text-xs text-amber-300">
                {L(
                  "You need at least one journal session saved before the coach can analyze your data.",
                  "Necesitas al menos una sesión en el journal para que el coach pueda analizar tus datos."
                )}
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
  const loadingLabel =
    typeof document !== "undefined" && document.documentElement.lang.toLowerCase().startsWith("es")
      ? "Cargando coach…"
      : "Loading coach…";
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
          <p className="text-sm text-slate-400">{loadingLabel}</p>
        </div>
      }
    >
      <AiCoachingPageInner />
    </Suspense>
  );
}
