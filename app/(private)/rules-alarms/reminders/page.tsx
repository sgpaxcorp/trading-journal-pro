// app/rules-alarms/reminders/page.tsx
"use client";

/**
 * Neuro Trader Journal — Reminders (Important Alerts) v0.3
 * -------------------------------------------------------
 * Purpose:
 *  - User-configurable reminders that can trigger in-app pop-ups (behavioral coaching).
 *  - Examples: "Daily goal achieved", "Daily max loss hit", "Emotions missing", "Checklist missing", etc.
 *
 * Storage:
 *  - NO localStorage.
 *  - Uses Supabase tables (recommended) with RLS (user_id = auth.uid()).
 *
 * Recommended Supabase schema (run as migration in your DB):
 *
 * 1) ntj_alert_rules
 *    - id uuid primary key default gen_random_uuid()
 *    - user_id uuid not null
 *    - key text not null  -- stable identifier (template key or user-defined)
 *    - title text not null
 *    - message text not null
 *    - trigger_type text not null
 *    - severity text not null default 'info'  -- info|warning|critical|success
 *    - enabled boolean not null default true
 *    - channels text[] not null default '{popup,inapp}'
 *    - config jsonb not null default '{}'::jsonb
 *    - created_at timestamptz not null default now()
 *    - updated_at timestamptz not null default now()
 *
 *    Unique index:
 *      create unique index if not exists ntj_alert_rules_user_key_ux
 *      on ntj_alert_rules(user_id, key);
 *
 * 2) ntj_alert_events
 *    - id uuid primary key default gen_random_uuid()
 *    - user_id uuid not null
 *    - rule_id uuid not null references ntj_alert_rules(id) on delete cascade
 *    - date text null  -- YYYY-MM-DD for day-scoped events
 *    - status text not null default 'active' -- active|ack
 *    - triggered_at timestamptz not null default now()
 *    - acknowledged_at timestamptz null
 *    - dismissed_until timestamptz null
 *    - payload jsonb not null default '{}'::jsonb
 *
 *    Unique index (for day-scoped rules so pop-ups don't spam):
 *      create unique index if not exists ntj_alert_events_day_ux
 *      on ntj_alert_events(user_id, rule_id, date);
 *
 * Notes:
 *  - This page includes a "listener" that can show pop-ups while you're on this page.
 *  - For GLOBAL pop-ups across the app, mount <ReminderPopupListener /> in your private layout
 *    (e.g., app/(private)/layout.tsx) so it runs on every route.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

import { supabaseBrowser } from "@/lib/supaBaseClient";
import { getJournalEntryByDate } from "@/lib/journalSupabase";

/* =========================
   Constants / types
========================= */

type Severity = "info" | "warning" | "critical" | "success";

type TriggerType =
  | "DAILY_GOAL_HIT"
  | "DAILY_MAX_LOSS_HIT"
  | "MISSING_EMOTIONS"
  | "MISSING_CHECKLIST"
  | "MISSING_PREMARKET"
  | "OVERTRADING"
  | "REVENGE_OR_FOMO"
  | "TIME_OF_DAY";

type Channel = "popup" | "inapp" | "voice";

type AlertRuleRow = {
  id: string;
  user_id: string;
  key: string;
  title: string;
  message: string;
  trigger_type: TriggerType;
  severity: Severity;
  enabled: boolean;
  channels: Channel[] | null;
  config: any;
  created_at?: string;
  updated_at?: string;
};

type AlertEventRow = {
  id: string;
  user_id: string;
  rule_id: string;
  date: string | null;
  status: "active" | "ack";
  triggered_at: string;
  acknowledged_at: string | null;
  dismissed_until: string | null;
  payload: any;
};

const RULES_TABLE = "ntj_alert_rules";
const EVENTS_TABLE = "ntj_alert_events";

const EMOTION_TAGS = [
  "Calm",
  "Greedy",
  "Desperate",
  "FOMO",
  "Revenge trade",
  "Focus",
  "Patience",
  "Discipline",
  "Anxiety",
  "Overconfident",
];

const CHECKLIST_TAGS = [
  "Respect Strategy",
  "Not follow my plan",
  "No respect my plan",
  "Planned stop was in place",
  "Used planned position sizing",
  "Risk-to-reward ≥ 2R (planned)",
  "Risk-to-reward < 1.5R (tight)",
  "Earnings play",
  "News-driven trade",
  "Momentum trade",
  "Trend Follow Trade",
  "Reversal trade",
  "Scalping trade",
  "swing trade",
  "Options trade",
  "Stock trade",
  "Futures Trade",
  "Forex Trade",
  "Crypto Trade",
];

type TemplateDef = {
  key: string;
  title: string;
  message: string;
  trigger_type: TriggerType;
  severity: Severity;
  channels: Channel[];
  config: any;
  why: string;
};

const TEMPLATES: TemplateDef[] = [
  {
    key: "tpl_daily_goal_hit",
    title: "Daily goal achieved",
    message:
      "You hit your daily goal. Lock the win. Close the platform and protect decision quality.",
    trigger_type: "DAILY_GOAL_HIT",
    severity: "success",
    channels: ["voice", "popup", "inapp"],
    config: { goalUsd: 200 },
    why:
      "Positive reinforcement + stopping rules prevent give-back and overtrading.",
  },
  {
    key: "tpl_daily_max_loss_hit",
    title: "Daily max loss hit",
    message:
      "Daily loss limit reached. Stop trading for the day. Capital protection is the job.",
    trigger_type: "DAILY_MAX_LOSS_HIT",
    severity: "critical",
    channels: ["voice", "popup", "inapp"],
    config: { maxLossUsd: 150 },
    why:
      "Hard stop reduces revenge loops and protects your psychological capital.",
  },
  {
    key: "tpl_missing_emotions",
    title: "Emotions not logged",
    message:
      "You traded today, but you didn't log emotions. Tag your state to reduce impulsive repetition.",
    trigger_type: "MISSING_EMOTIONS",
    severity: "warning",
    channels: ["voice", "popup", "inapp"],
    config: { requiresTrades: true },
    why:
      "Emotion labeling increases self-awareness and reduces system-1 hijacks.",
  },
  {
    key: "tpl_missing_checklist",
    title: "Checklist not completed",
    message:
      "You traded today, but you didn't complete your strategy checklist. Process precedes results.",
    trigger_type: "MISSING_CHECKLIST",
    severity: "warning",
    channels: ["voice", "popup", "inapp"],
    config: { requiresTrades: true },
    why:
      "Process compliance is the edge multiplier. Missing checklist often predicts drawdowns.",
  },
  {
    key: "tpl_missing_premarket",
    title: "Premarket not filled",
    message:
      "Premarket prep is empty. Your plan is your risk control. Fill it before trading.",
    trigger_type: "MISSING_PREMARKET",
    severity: "info",
    channels: ["inapp"],
    config: { requiresTrades: false },
    why:
      "Prep reduces noise-trading and anchors your decision framework.",
  },
  {
    key: "tpl_overtrading",
    title: "Overtrading risk",
    message:
      "Trade count is above your threshold. Reduce frequency to protect your edge.",
    trigger_type: "OVERTRADING",
    severity: "warning",
    channels: ["voice", "popup", "inapp"],
    config: { maxTrades: 8 },
    why:
      "Quality setups degrade when you chase frequency; fatigue increases errors.",
  },
  {
    key: "tpl_revenge_or_fomo",
    title: "Impulse tags detected",
    message:
      "FOMO/Revenge tags detected. Pause. Reset. No immediate re-entry without a clean setup.",
    trigger_type: "REVENGE_OR_FOMO",
    severity: "critical",
    channels: ["voice", "popup", "inapp"],
    config: {},
    why:
      "Impulse trading is a known negative expectancy regime. A forced reset preserves capital.",
  },
  {
    key: "tpl_time_of_day_stop",
    title: "Time-based stop",
    message:
      "Time stop reached. If you're not in a planned position, step away and stop trading.",
    trigger_type: "TIME_OF_DAY",
    severity: "info",
    channels: ["voice", "popup", "inapp"],
    config: { timeLocal: "15:45" },
    why:
      "Late-session decision quality often degrades; time stops reduce forced trades.",
  },
  // Two extra templates (same engine; optional)
  {
    key: "tpl_time_of_day_break",
    title: "Mid-session break",
    message:
      "Take a 10-minute reset. Hydrate and breathe. Protect focus before the next decision.",
    trigger_type: "TIME_OF_DAY",
    severity: "info",
    channels: ["popup"],
    config: { timeLocal: "11:30" },
    why:
      "Micro-breaks reduce decision fatigue and execution slippage.",
  },
  {
    key: "tpl_daily_goal_small",
    title: "Small daily goal",
    message:
      "You reached your baseline daily goal. Consider stopping to protect consistency.",
    trigger_type: "DAILY_GOAL_HIT",
    severity: "success",
    channels: ["inapp"],
    config: { goalUsd: 100 },
    why:
      "Consistency beats hero days. Small wins compound with discipline.",
  },
];

/* =========================
   UI helpers
========================= */

const CHART_COLORS = {
  emerald: "#34d399",
  emeraldDim: "rgba(52, 211, 153, 0.14)",
  sky: "#38bdf8",
  skyDim: "rgba(56, 189, 248, 0.14)",
  danger: "#fb7185",
  dangerDim: "rgba(251, 113, 133, 0.14)",
  grid: "rgba(148, 163, 184, 0.12)",
  axis: "rgba(148, 163, 184, 0.55)",
  text: "rgba(226, 232, 240, 0.92)",
};

function wrapCard() {
  return "rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-[0_0_30px_rgba(15,23,42,0.55)]";
}

function pillTone(sev: Severity) {
  if (sev === "success")
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (sev === "critical")
    return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  if (sev === "warning")
    return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  return "border-slate-600 bg-slate-950/40 text-slate-200";
}

function sevColor(sev: Severity) {
  if (sev === "success") return CHART_COLORS.emerald;
  if (sev === "critical") return CHART_COLORS.danger;
  if (sev === "warning") return "rgba(251,191,36,0.90)";
  return CHART_COLORS.sky;
}

function safeUpper(s: any) {
  return String(s ?? "").trim().toUpperCase();
}

function formatLocalIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function safeJsonParse<T = any>(raw: unknown): T | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/* =========================
   Neuro voice (Speech Synthesis)
========================= */

type NeuroSpeakConfig = {
  enabled?: boolean;
  lang?: string; // e.g. "en-US"
  voiceName?: string | null; // exact SpeechSynthesisVoice.name
  rate?: number; // 0.1 - 10 (browser dependent)
  pitch?: number; // 0 - 2
  volume?: number; // 0 - 1
};

function pickNeuroVoice(voices: SpeechSynthesisVoice[], cfg?: NeuroSpeakConfig): SpeechSynthesisVoice | null {
  const preferred = String(cfg?.voiceName ?? "").trim();
  if (preferred) {
    const exact = voices.find((v) => v?.name === preferred);
    if (exact) return exact;
  }

  const lang = (cfg?.lang ?? "en-US").toLowerCase();

  // Prefer an English voice if available.
  const byLang = voices.filter((v) => String(v?.lang ?? "").toLowerCase().startsWith(lang.split("-")[0]));
  if (byLang.length) return byLang[0];

  // Otherwise fall back to the first available voice.
  return voices[0] ?? null;
}

function speakNeuro(text: string, cfg?: NeuroSpeakConfig): { ok: boolean; reason?: string } {
  try {
    if (cfg?.enabled === false) return { ok: false, reason: "disabled" };
    if (typeof window === "undefined") return { ok: false, reason: "no-window" };

    const synth = window.speechSynthesis;
    if (!synth) return { ok: false, reason: "no-speech-synthesis" };

    const safeText = String(text ?? "").trim();
    if (!safeText) return { ok: false, reason: "empty" };

    const u = new SpeechSynthesisUtterance(safeText);
    u.lang = cfg?.lang ?? "en-US";
    if (typeof cfg?.rate === "number") u.rate = cfg.rate;
    if (typeof cfg?.pitch === "number") u.pitch = cfg.pitch;
    if (typeof cfg?.volume === "number") u.volume = cfg.volume;

    const voices = synth.getVoices?.() ?? [];
    const voice = pickNeuroVoice(voices, cfg);
    if (voice) u.voice = voice;

    // Avoid stacking announcements.
    try {
      synth.cancel();
    } catch {
      // ignore
    }

    synth.speak(u);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: String(e?.message ?? e) };
  }
}

function countTradesFromNotes(notesRaw: unknown): number {
  const parsed = safeJsonParse<any>(notesRaw);
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const exits = Array.isArray(parsed?.exits) ? parsed.exits : [];
  return entries.length + exits.length;
}

function hasPremarket(notesRaw: unknown): boolean {
  const parsed = safeJsonParse<any>(notesRaw);
  const pre = String(parsed?.premarket ?? "").trim();
  // HTML editor can store "<br>" etc; treat very short as empty
  return pre.replace(/<[^>]*>/g, "").trim().length >= 6;
}

function extractPnl(entry: any): number {
  const v = Number(entry?.pnl ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function tagsArr(entry: any): string[] {
  const t = entry?.tags;
  if (Array.isArray(t)) return t.map((x: any) => String(x ?? "").trim()).filter(Boolean);
  return [];
}

function hasAnyTag(entry: any, tagList: string[]) {
  const set = new Set(tagsArr(entry).map((x) => safeUpper(x)));
  return tagList.some((t) => set.has(safeUpper(t)));
}

function hasImpulseTags(entry: any) {
  const set = new Set(tagsArr(entry).map((x) => safeUpper(x)));
  return set.has("FOMO") || set.has("REVENGE TRADE") || set.has("REVENGE");
}

function parseTimeLocalToMinutes(t: string): number | null {
  const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function nowLocalMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/* =========================
   Reusable UI atoms
========================= */

function Stat({
  label,
  value,
  right,
}: {
  label: string;
  value: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
          {label}
        </p>
        {right}
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "neutral" | "primary" | "danger";
  className?: string;
}) {
  const base =
    "px-3 py-2 rounded-xl text-xs md:text-sm border transition disabled:opacity-50 disabled:cursor-not-allowed";
  const cls =
    tone === "primary"
      ? "bg-emerald-400 text-slate-950 border-emerald-300 hover:bg-emerald-300"
      : tone === "danger"
      ? "bg-rose-500/15 text-rose-200 border-rose-500/30 hover:bg-rose-500/20"
      : "bg-slate-950 text-slate-200 border-slate-700 hover:border-emerald-400 hover:text-emerald-300";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!!disabled}
      className={`${base} ${cls} ${className}`}
    >
      {children}
    </button>
  );
}

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full border transition ${
        on
          ? "bg-emerald-500/25 border-emerald-400/40"
          : "bg-slate-950 border-slate-700"
      } disabled:opacity-50`}
      aria-pressed={on}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full transition ${
          on ? "translate-x-6 bg-emerald-300" : "translate-x-1 bg-slate-400"
        }`}
      />
    </button>
  );
}

function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  accent,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  accent?: Severity;
}) {
  if (!open) return null;
  const c = accent ? sevColor(accent) : CHART_COLORS.sky;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl rounded-3xl border border-slate-700 bg-slate-950 shadow-[0_0_60px_rgba(0,0,0,0.7)] overflow-hidden">
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, ${c}, rgba(148,163,184,0.25))`,
          }}
        />
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                Reminder
              </p>
              <h3 className="text-xl font-semibold text-slate-100 mt-1">
                {title}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-200 hover:border-emerald-400"
            >
              Close
            </button>
          </div>

          <div className="mt-4">{children}</div>

          {footer ? <div className="mt-5">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

/* =========================
   Supabase utilities
========================= */

function isTableMissingError(e: any) {
  const msg = String(e?.message ?? "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("relation") || msg.includes("404");
}

async function safeSelect<T>(query: PromiseLike<any>): Promise<{ data: T[]; error: any | null }> {
  try {
    const res = await query;
    return { data: (res?.data || []) as T[], error: res?.error ?? null };
  } catch (e: any) {
    return { data: [], error: e };
  }
}

async function safeSingle<T>(query: PromiseLike<any>): Promise<{ data: T | null; error: any | null }> {
  try {
    const res = await query;
    return { data: (res?.data || null) as T | null, error: res?.error ?? null };
  } catch (e: any) {
    return { data: null, error: e };
  }
}

/* =========================
   Engine
========================= */

type EvalContext = {
  todayIso: string;
  entryToday: any | null;
  tradesCountToday: number;
  pnlToday: number;
};

async function buildEvalContext(userId: string): Promise<EvalContext> {
  const todayIso = formatLocalIsoDate(new Date());
  const entryToday = await getJournalEntryByDate(userId, todayIso).catch(() => null);
  const tradesCountToday = entryToday ? countTradesFromNotes((entryToday as any).notes) : 0;
  const pnlToday = entryToday ? extractPnl(entryToday) : 0;
  return { todayIso, entryToday, tradesCountToday, pnlToday };
}

function ruleWantsPopup(rule: AlertRuleRow) {
  const ch = Array.isArray(rule.channels) ? rule.channels : [];
  return ch.map((x) => String(x).toLowerCase()).includes("popup");
}

function ruleWantsVoice(rule: AlertRuleRow) {
  const ch = Array.isArray(rule.channels) ? rule.channels : [];
  return ch.map((x) => String(x).toLowerCase()).includes("voice");
}

function ruleWantsInApp(rule: AlertRuleRow) {
  const ch = Array.isArray(rule.channels) ? rule.channels : [];
  return ch.map((x) => String(x).toLowerCase()).includes("inapp");
}

function normalizePayload(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw === "string") return safeJsonParse<Record<string, any>>(raw) || {};
  return {};
}

function eventDelivered(ev: AlertEventRow) {
  const p = normalizePayload(ev.payload);
  return Boolean(p?.delivered_at || p?.deliveredAt);
}



function normalizeSeverity(raw: unknown): Severity {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "critical" || s.includes("crit")) return "critical";
  if (s === "warning" || s.includes("warn")) return "warning";
  if (s === "success" || s.includes("success") || s.includes("celebr") || s.includes("goal")) return "success";
  return "info";
}

function severityRank(s: Severity) {
  switch (s) {
    case "critical":
      return 4;
    case "warning":
      return 3;
    case "success":
      return 2;
    case "info":
    default:
      return 1;
  }
}

function setChannelValue(channelsAny: any, channel: Channel, on: boolean): Channel[] {
  const arr = Array.isArray(channelsAny) ? channelsAny.map((x) => String(x).toLowerCase()) : [];
  const set = new Set<string>(arr);
  const key = String(channel).toLowerCase();

  if (on) set.add(key);
  else set.delete(key);

  const ordered: Channel[] = ["voice", "popup", "inapp"];
  const out: Channel[] = [];
  for (const c of ordered) {
    if (set.has(String(c))) out.push(c);
  }
  // If any unknown channel sneaks in, keep it at the end (forward compatible).
  for (const c of Array.from(set.values())) {
    if (!ordered.includes(c as Channel)) out.push(c as Channel);
  }
  return out;
}

function eventDismissedNow(ev: AlertEventRow) {

  if (!ev.dismissed_until) return false;
  const t = new Date(ev.dismissed_until).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() < t;
}

function shouldTriggerRule(rule: AlertRuleRow, ctx: EvalContext): { ok: boolean; payload?: any; date?: string } {
  if (!rule.enabled) return { ok: false };

  const entry = ctx.entryToday;
  const trades = ctx.tradesCountToday;
  const pnl = ctx.pnlToday;

  const cfg = rule.config || {};
  const requiresTrades = cfg?.requiresTrades === true;

  if (requiresTrades && trades <= 0) return { ok: false };

  if (rule.trigger_type === "DAILY_GOAL_HIT") {
    const goalUsd = Number(cfg?.goalUsd ?? 0);
    if (!Number.isFinite(goalUsd) || goalUsd <= 0) return { ok: false };
    const ok = pnl >= goalUsd;
    return ok
      ? {
          ok: true,
          date: ctx.todayIso,
          payload: { pnl, goalUsd },
        }
      : { ok: false };
  }

  if (rule.trigger_type === "DAILY_MAX_LOSS_HIT") {
    const maxLossUsd = Number(cfg?.maxLossUsd ?? 0);
    if (!Number.isFinite(maxLossUsd) || maxLossUsd <= 0) return { ok: false };
    const ok = pnl <= -Math.abs(maxLossUsd);
    return ok
      ? { ok: true, date: ctx.todayIso, payload: { pnl, maxLossUsd } }
      : { ok: false };
  }

  if (rule.trigger_type === "MISSING_EMOTIONS") {
    const ok = entry ? !hasAnyTag(entry, EMOTION_TAGS) : false;
    return ok ? { ok: true, date: ctx.todayIso, payload: { trades } } : { ok: false };
  }

  if (rule.trigger_type === "MISSING_CHECKLIST") {
    const ok = entry ? !hasAnyTag(entry, CHECKLIST_TAGS) : false;
    return ok ? { ok: true, date: ctx.todayIso, payload: { trades } } : { ok: false };
  }

  if (rule.trigger_type === "MISSING_PREMARKET") {
    const ok = entry ? !hasPremarket((entry as any).notes) : false;
    const wantsTrades = cfg?.requiresTrades === true;
    if (wantsTrades && trades <= 0) return { ok: false };
    return ok ? { ok: true, date: ctx.todayIso, payload: { trades } } : { ok: false };
  }

  if (rule.trigger_type === "OVERTRADING") {
    const maxTrades = Number(cfg?.maxTrades ?? 0);
    if (!Number.isFinite(maxTrades) || maxTrades <= 0) return { ok: false };
    const ok = trades > maxTrades;
    return ok ? { ok: true, date: ctx.todayIso, payload: { trades, maxTrades } } : { ok: false };
  }

  if (rule.trigger_type === "REVENGE_OR_FOMO") {
    const ok = entry ? hasImpulseTags(entry) : false;
    return ok ? { ok: true, date: ctx.todayIso, payload: { tags: tagsArr(entry) } } : { ok: false };
  }

  if (rule.trigger_type === "TIME_OF_DAY") {
    const t = String(cfg?.timeLocal ?? "").trim();
    const min = parseTimeLocalToMinutes(t);
    if (min == null) return { ok: false };
    const nowMin = nowLocalMinutes();
    const ok = nowMin >= min;
    return ok ? { ok: true, date: ctx.todayIso, payload: { timeLocal: t } } : { ok: false };
  }

  return { ok: false };
}

async function upsertEventForDay(userId: string, rule: AlertRuleRow, dateIso: string, payload: any) {
  // IMPORTANT:
  // We intentionally treat "upsert for day" as "insert-once per (user, rule, date)".
  // This prevents re-trigger spam and preserves delivery markers (e.g., payload.delivered_at)
  // across repeated evaluation cycles.
  try {
    const { data: existing, error: selErr } = await safeSingle<Pick<AlertEventRow, "id" | "status" | "payload">>(
      supabaseBrowser
        .from(EVENTS_TABLE)
        .select("id,status,payload")
        .eq("user_id", userId)
        .eq("rule_id", rule.id)
        .eq("date", dateIso)
        .limit(1)
        .maybeSingle()
    );

    if (selErr) return selErr;
    if (existing?.id) return null;

    const { error: insErr } = await safeSingle<AlertEventRow>(
      supabaseBrowser
        .from(EVENTS_TABLE)
        .insert({
          user_id: userId,
          rule_id: rule.id,
          date: dateIso,
          status: "active",
          triggered_at: new Date().toISOString(),
          payload: payload ?? {},
        })
        .select("*")
        .maybeSingle()
    );

    if (insErr) {
      const msg = String(insErr?.message ?? "").toLowerCase();
      const code = String(insErr?.code ?? "");
      // ignore duplicate key races (unique index user_id,rule_id,date)
      if (code === "23505" || msg.includes("duplicate") || msg.includes("unique")) return null;
      return insErr;
    }
    return null;
  } catch (e: any) {
    return e;
  }
}

/* =========================
   Listener component (mount globally for pop-ups)
========================= */

export function ReminderPopupListener({
  userId,
  className,
}: {
  userId: string;
  className?: string;
}) {
  const [backendOk, setBackendOk] = useState(true);
  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [events, setEvents] = useState<AlertEventRow[]>([]);
  const [checking, setChecking] = useState(false);
  const [popupEventId, setPopupEventId] = useState<string | null>(null);
  const deliveringRef = useRef(false);

  const popupEvent = useMemo(() => {
    if (!popupEventId) return null;
    return events.find((e) => e.id === popupEventId) || null;
  }, [events, popupEventId]);

  const popupRule = useMemo(() => {
    if (!popupEvent) return null;
    return rules.find((r) => r.id === popupEvent.rule_id) || null;
  }, [popupEvent, rules]);

  const activeEvents = useMemo(() => {
    return (events || [])
      .filter((e) => e.status === "active")
      .filter((e) => !eventDismissedNow(e))
      .sort((a, b) => (a.triggered_at < b.triggered_at ? 1 : -1));
  }, [events]);

  const loadRules = async () => {
    const { data, error } = await safeSelect<AlertRuleRow>(
      supabaseBrowser.from(RULES_TABLE).select("*").eq("user_id", userId).order("created_at", { ascending: true })
    );
    if (error) {
      if (isTableMissingError(error)) setBackendOk(false);
      setRules([]);
      return;
    }
    setBackendOk(true);
    setRules(data || []);
  };

  const loadEvents = async () => {
    const { data, error } = await safeSelect<AlertEventRow>(
      supabaseBrowser
        .from(EVENTS_TABLE)
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("triggered_at", { ascending: false })
        .limit(50)
    );
    if (error) {
      if (isTableMissingError(error)) setBackendOk(false);
      setEvents([]);
      return;
    }
    setBackendOk(true);
    setEvents(data || []);
  };

  const runChecks = async () => {
    if (checking) return;
    setChecking(true);
    try {
      // Fetch rules fresh (avoid stale state during first hydration)
      const { data: freshRules, error: rulesErr } = await safeSelect<AlertRuleRow>(
        supabaseBrowser
          .from(RULES_TABLE)
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true })
      );

      if (rulesErr) {
        if (isTableMissingError(rulesErr)) setBackendOk(false);
        setRules([]);
        return;
      }

      setBackendOk(true);
      setRules(freshRules || []);

      const ctx = await buildEvalContext(userId);

      // Evaluate enabled rules
      const enabled = (freshRules || []).filter((r) => r.enabled);
      for (const r of enabled) {
        const res = shouldTriggerRule(r, ctx);
        if (!res.ok || !res.date) continue;

        // Only create events if rules want in-app signals (popup or inapp)
        const channels = Array.isArray(r.channels) ? r.channels : [];
        if (!channels.length) continue;

        await upsertEventForDay(userId, r, res.date, res.payload || {});
      }

      await loadEvents();
    } finally {
      setChecking(false);
    }
  };

  // initial load + checks
  useEffect(() => {
    if (!userId) return;

    loadRules();
    loadEvents();

    // Run checks once shortly after load (gives auth time to hydrate)
    const t = setTimeout(() => {
      runChecks();
    }, 350);

    // Keep checks fresh (light polling) + refresh on tab focus.
    // This avoids needing to couple to every "journal save" action across the app.
    const interval = setInterval(() => {
      runChecks();
    }, 45_000);

    const onVis = () => {
      if (document.visibilityState === "visible") runChecks();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  
const markDelivered = async (ev: AlertEventRow, deliveredChannels: Channel[]) => {
  if (!userId) return;
  const prev = normalizePayload(ev.payload);
  const nextPayload = {
    ...prev,
    delivered_at: new Date().toISOString(),
    delivered_channels: deliveredChannels,
  };

  // Persist delivery markers so we don't re-announce after refresh.
  await safeSingle(
    supabaseBrowser
      .from(EVENTS_TABLE)
      .update({ payload: nextPayload })
      .eq("user_id", userId)
      .eq("id", ev.id)
      .select("*")
      .maybeSingle()
  );

  setEvents((cur) => cur.map((x) => (x.id === ev.id ? { ...x, payload: nextPayload } : x)));
};

// Delivery queue: announce once (Neuro voice) and/or show a popup based on rule channels.
useEffect(() => {
  if (!backendOk) return;
  if (!userId) return;
  if (popupEventId) return;
  if (deliveringRef.current) return;

  const candidates = activeEvents
    .filter((ev) => !eventDelivered(ev))
    .map((ev) => {
      const r = rules.find((x) => x.id === ev.rule_id);
      if (!r) return null;
      if (!r.enabled) return null;

      const wantsVoice = ruleWantsVoice(r);
      const wantsPopup = ruleWantsPopup(r);
      if (!wantsVoice && !wantsPopup) return null;

      return { ev, r, wantsVoice, wantsPopup };
    })
    .filter(Boolean) as Array<{
    ev: AlertEventRow;
    r: AlertRuleRow;
    wantsVoice: boolean;
    wantsPopup: boolean;
  }>;

  if (!candidates.length) return;

  candidates.sort((a, b) => {
    const sa = normalizeSeverity(a.r.severity);
    const sb = normalizeSeverity(b.r.severity);
    const ds = severityRank(sb) - severityRank(sa);
    if (ds !== 0) return ds;
    return a.ev.triggered_at < b.ev.triggered_at ? 1 : -1;
  });

  const next = candidates[0];
  deliveringRef.current = true;

  (async () => {
    try {
      const delivered: Channel[] = [];

      if (next.wantsVoice) {
        speakNeuro(`${next.r.title}. ${next.r.message}`, { lang: "en-US" });
        delivered.push("voice");
      }

      if (next.wantsPopup) {
        setPopupEventId(next.ev.id);
        delivered.push("popup");
      }

      if (delivered.length) {
        await markDelivered(next.ev, delivered);
      }
    } finally {
      deliveringRef.current = false;
    }
  })();
}, [backendOk, userId, activeEvents, popupEventId, rules]);

  const acknowledgeEvent = async (evId: string) => {
    await supabaseBrowser
      .from(EVENTS_TABLE)
      .update({
        status: "ack",
        acknowledged_at: new Date().toISOString(),
        dismissed_until: null,
      } as any)
      .eq("id", evId)
      .eq("user_id", userId);

    // update local state
    setEvents((prev) => prev.filter((e) => e.id !== evId));
    if (popupEventId === evId) setPopupEventId(null);
  };

  const snoozeEvent = async (evId: string, minutes: number) => {
    const until = new Date(Date.now() + minutes * 60_000).toISOString();
    await supabaseBrowser
      .from(EVENTS_TABLE)
      .update({ dismissed_until: until } as any)
      .eq("id", evId)
      .eq("user_id", userId);

    setEvents((prev) =>
      prev.map((e) => (e.id === evId ? { ...e, dismissed_until: until } : e))
    );
    if (popupEventId === evId) setPopupEventId(null);
  };

  return (
    <div className={className}>
      {!backendOk ? (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          Reminder backend tables not found. Create <span className="font-mono">{RULES_TABLE}</span> and{" "}
          <span className="font-mono">{EVENTS_TABLE}</span> in Supabase to enable pop-ups.
        </div>
      ) : null}

      <Modal
        open={!!popupEvent && !!popupRule}
        title={popupRule?.title ?? "Reminder"}
        accent={popupRule?.severity ?? "info"}
        onClose={() => {
          // Don't auto-ack by closing; just hide. User can ack from list later.
          setPopupEventId(null);
        }}
        footer={
          popupEvent ? (
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <Button tone="primary" onClick={() => acknowledgeEvent(popupEvent.id)}>
                  Acknowledge
                </Button>
                <Button onClick={() => snoozeEvent(popupEvent.id, 60)}>Snooze 1h</Button>
            <Button
              onClick={() => speakNeuro(String(popupRule?.title ?? "") + ". " + String(popupRule?.message ?? ""), { lang: "en-US" })}
            >
              Speak again
            </Button>
                <Button onClick={() => snoozeEvent(popupEvent.id, 24 * 60)}>Snooze 24h</Button>
              </div>
              <span className="text-[11px] text-slate-500">
                Triggered:{" "}
                <span className="text-slate-300">
                  {new Date(popupEvent.triggered_at).toLocaleString()}
                </span>
              </span>
            </div>
          ) : null
        }
      >
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${pillTone(popupRule?.severity ?? "info")}`}>
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: sevColor(popupRule?.severity ?? "info") }}
              />
              {popupRule?.severity?.toUpperCase() ?? "INFO"}
            </span>

            {popupEvent?.date ? (
              <span className="text-xs text-slate-400 font-mono">{popupEvent.date}</span>
            ) : null}
          </div>

          <p className="mt-3 text-slate-100 text-sm leading-relaxed">
            {popupRule?.message ?? ""}
          </p>

          {popupRule?.trigger_type === "DAILY_GOAL_HIT" ? (
            <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
              <p className="text-emerald-200 text-sm font-semibold">
                Momentum locked.
              </p>
              <p className="text-[13px] text-slate-200 mt-1">
                Today&apos;s P&amp;L:{" "}
                <span className="font-mono text-emerald-200">
                  ${Number(popupEvent?.payload?.pnl ?? 0).toFixed(2)}
                </span>{" "}
                · Goal:{" "}
                <span className="font-mono text-emerald-200">
                  ${Number(popupEvent?.payload?.goalUsd ?? 0).toFixed(2)}
                </span>
              </p>
            </div>
          ) : null}

          {popupRule?.trigger_type === "DAILY_MAX_LOSS_HIT" ? (
            <div className="mt-4 rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4">
              <p className="text-rose-200 text-sm font-semibold">
                Risk control triggered.
              </p>
              <p className="text-[13px] text-slate-200 mt-1">
                Today&apos;s P&amp;L:{" "}
                <span className="font-mono text-rose-200">
                  ${Number(popupEvent?.payload?.pnl ?? 0).toFixed(2)}
                </span>{" "}
                · Max loss:{" "}
                <span className="font-mono text-rose-200">
                  ${Number(popupEvent?.payload?.maxLossUsd ?? 0).toFixed(2)}
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Light control surface for global listener */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-[11px] text-slate-500">
          Reminders engine (client) ·{" "}
          <span className="text-slate-300 font-mono">
            {activeEvents.length}
          </span>{" "}
          active events
        </div>
<div className="flex items-center gap-2">
  <Button
    tone="neutral"
    onClick={() =>
      speakNeuro("Neuro voice is armed. Reminders will speak when triggered.", { lang: "en-US" })
    }
  >
    Test Neuro voice
  </Button>
  <Button onClick={runChecks} disabled={checking}>
    {checking ? "Checking…" : "Run checks now"}
  </Button>
</div>
      </div>
    </div>
  );
}

/* =========================
   Page
========================= */

export default function RemindersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const userId = (user as any)?.id as string | undefined;

  const [backendOk, setBackendOk] = useState(true);
  const [rules, setRules] = useState<AlertRuleRow[]>([]);
  const [events, setEvents] = useState<AlertEventRow[]>([]);
  const [activeTab, setActiveTab] = useState<"active" | "catalog">("active");

  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string>("");

  // auth gate
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return events.find((e) => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  const activeEvents = useMemo(() => {
    return (events || [])
      .filter((e) => e.status === "active")
      .filter((e) => !eventDismissedNow(e))
      .sort((a, b) => (a.triggered_at < b.triggered_at ? 1 : -1));
  }, [events]);

  const ruleById = useMemo(() => {
    const m = new Map<string, AlertRuleRow>();
    for (const r of rules) m.set(r.id, r);
    return m;
  }, [rules]);

  const loadRules = async () => {
    if (!userId) return;
    const { data, error } = await safeSelect<AlertRuleRow>(
      supabaseBrowser.from(RULES_TABLE).select("*").eq("user_id", userId).order("created_at", { ascending: true })
    );
    if (error) {
      setRules([]);
      if (isTableMissingError(error)) setBackendOk(false);
      return;
    }
    setBackendOk(true);
    setRules(data || []);
  };

  const loadEvents = async () => {
    if (!userId) return;
    const { data, error } = await safeSelect<AlertEventRow>(
      supabaseBrowser
        .from(EVENTS_TABLE)
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("triggered_at", { ascending: false })
        .limit(80)
    );
    if (error) {
      setEvents([]);
      if (isTableMissingError(error)) setBackendOk(false);
      return;
    }
    setBackendOk(true);
    setEvents(data || []);
  };

  useEffect(() => {
    if (!userId) return;
    loadRules();
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const createFromTemplate = async (tpl: TemplateDef) => {
    if (!userId) return;
    setBusy(true);
    try {
      // If exists (user_id, key) unique, this is safe to upsert
      const row = {
        user_id: userId,
        key: tpl.key,
        title: tpl.title,
        message: tpl.message,
        trigger_type: tpl.trigger_type,
        severity: tpl.severity,
        enabled: true,
        channels: tpl.channels,
        config: tpl.config ?? {},
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabaseBrowser
        .from(RULES_TABLE)
        .upsert(row as any, { onConflict: "user_id,key" })
        .select("id")
        .maybeSingle();

      if (error) {
        if (isTableMissingError(error)) setBackendOk(false);
        throw error;
      }

      setToast("Template added.");
      await loadRules();
      setActiveTab("catalog");
    } catch (e: any) {
      console.error("[RemindersPage] createFromTemplate error", e);
      setToast("Could not add template (backend missing?).");
    } finally {
      setBusy(false);
    }
  };

  const updateRule = async (ruleId: string, patch: Partial<AlertRuleRow>) => {
    if (!userId) return;
    setBusy(true);
    try {
      const { error } = await supabaseBrowser
        .from(RULES_TABLE)
        .update({ ...patch, updated_at: new Date().toISOString() } as any)
        .eq("id", ruleId)
        .eq("user_id", userId);

      if (error) throw error;

      setRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)));
      setToast("Saved.");
    } catch (e: any) {
      console.error("[RemindersPage] updateRule error", e);
      setToast("Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!userId) return;
    setBusy(true);
    try {
      const { error } = await supabaseBrowser
        .from(RULES_TABLE)
        .delete()
        .eq("id", ruleId)
        .eq("user_id", userId);

      if (error) throw error;
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
      if (selectedRuleId === ruleId) setSelectedRuleId(null);
      setToast("Deleted.");
    } catch (e: any) {
      console.error("[RemindersPage] deleteRule error", e);
      setToast("Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const ackEvent = async (eventId: string) => {
    if (!userId) return;
    setBusy(true);
    try {
      const { error } = await supabaseBrowser
        .from(EVENTS_TABLE)
        .update({
          status: "ack",
          acknowledged_at: new Date().toISOString(),
          dismissed_until: null,
        } as any)
        .eq("id", eventId)
        .eq("user_id", userId);

      if (error) throw error;
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      if (selectedEventId === eventId) setSelectedEventId(null);
      setToast("Acknowledged.");
    } catch (e: any) {
      console.error("[RemindersPage] ackEvent error", e);
      setToast("Action failed.");
    } finally {
      setBusy(false);
    }
  };

  const snoozeEvent = async (eventId: string, minutes: number) => {
    if (!userId) return;
    setBusy(true);
    try {
      const until = new Date(Date.now() + minutes * 60_000).toISOString();
      const { error } = await supabaseBrowser
        .from(EVENTS_TABLE)
        .update({ dismissed_until: until } as any)
        .eq("id", eventId)
        .eq("user_id", userId);

      if (error) throw error;

      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, dismissed_until: until } : e)));
      if (selectedEventId === eventId) setSelectedEventId(null);
      setToast(`Snoozed ${minutes}m.`);
    } catch (e: any) {
      console.error("[RemindersPage] snoozeEvent error", e);
      setToast("Action failed.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="px-4 md:px-8 py-6">
        <div className="max-w-6xl mx-auto">
          <header className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <p className="text-emerald-400 text-xs uppercase tracking-[0.25em]">
                  Rules &amp; Alarms · Reminders
                </p>
                <h1 className="text-3xl md:text-4xl font-semibold mt-1">
                  Reminders &amp; Pop-ups
                </h1>
                <p className="text-sm md:text-base text-slate-400 mt-2 max-w-2xl">
                  Behavioral reminders that trigger pop-ups and in-app alerts. Designed to enforce stop rules
                  and protect your decision quality.
                </p>
              </div>

              <div className="flex flex-col items-start md:items-end gap-2">
                <Link
                  href="/dashboard"
                  className="px-3 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs md:text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
                >
                  ← Back to dashboard
                </Link>
                <p className="text-[11px] text-slate-500">
                  Backend:{" "}
                  <span className={backendOk ? "text-emerald-300" : "text-amber-300"}>
                    {backendOk ? "OK" : "Tables missing"}
                  </span>
                </p>
              </div>
            </div>

            {toast ? (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {toast}
              </div>
            ) : null}

            {!backendOk ? (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
                Supabase tables for reminders are not provisioned yet. Create{" "}
                <span className="font-mono">{RULES_TABLE}</span> and{" "}
                <span className="font-mono">{EVENTS_TABLE}</span> (see SQL at the top of this file).
              </div>
            ) : null}

            {/* Listener (shows pop-ups while on this page) */}
            {userId ? (
              <div className={wrapCard()}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
                      Live Neuro engine (voice + popup)
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      This component can be mounted globally in your private layout for app-wide voice + pop-ups.
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <ReminderPopupListener userId={userId} />
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Stat label="Active reminders" value={activeEvents.length} />
              <Stat label="Rules enabled" value={rules.filter((r) => r.enabled).length} />
              <Stat
                label="Templates available"
                value={TEMPLATES.length}
                right={
                  <span className="text-[11px] text-slate-500 font-mono">
                    POPUP+INAPP
                  </span>
                }
              />
            </div>

            {/* Tabs */}
            <section className="flex flex-wrap items-center gap-2">
              <Button
                tone={activeTab === "active" ? "primary" : "neutral"}
                onClick={() => setActiveTab("active")}
              >
                Active alerts
              </Button>
              <Button
                tone={activeTab === "catalog" ? "primary" : "neutral"}
                onClick={() => setActiveTab("catalog")}
              >
                Rules catalog
              </Button>
              <div className="ml-auto flex items-center gap-2">
                <Link
                  href="/rules-alarms/alarms"
                  className="px-3 py-2 rounded-xl border border-slate-700 text-slate-200 text-xs md:text-sm hover:border-emerald-400 hover:text-emerald-300 transition"
                >
                  Open Alarms →
                </Link>
              </div>
            </section>
          </header>

          {/* Two-column layout: Active Alerts | Catalog/Detail */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* LEFT: Active alerts */}
            <section className={wrapCard()}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
                    Active alerts
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    These can show as pop-ups (if enabled) and/or persist as in-app alerts.
                  </p>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  {activeEvents.length} ACTIVE
                </span>
              </div>

              <div className="mt-4 space-y-2">
                {activeEvents.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/45 px-4 py-6">
                    <p className="text-slate-200 text-sm font-medium">No active alerts</p>
                    <p className="text-sm text-slate-500 mt-1">
                      When a rule triggers, it will appear here and may also fire a pop-up.
                    </p>
                  </div>
                ) : (
                  activeEvents.map((ev) => {
                    const r = ruleById.get(ev.rule_id);
                    const sev = r?.severity ?? "info";
                    const selected = selectedEventId === ev.id;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => setSelectedEventId(ev.id)}
                        className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
                          selected
                            ? "border-emerald-400/40 bg-emerald-500/10"
                            : "border-slate-800 bg-slate-950/45 hover:bg-slate-950/70"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-slate-100 font-semibold">
                              {r?.title ?? "Reminder"}
                            </p>
                            <p className="text-[12px] text-slate-400 mt-1 line-clamp-2">
                              {r?.message ?? ""}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] ${pillTone(sev)}`}>
                              {sev.toUpperCase()}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(ev.triggered_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            {/* RIGHT: Detail panel or catalog */}
            <section className={wrapCard()}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
                    {activeTab === "active" ? "Alert detail" : "Rules catalog"}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {activeTab === "active"
                      ? "Inspect and act on the selected alert."
                      : "Enable templates or tune your active reminder rules."}
                  </p>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  {activeTab === "active" ? "DETAIL" : "RULES"}
                </span>
              </div>

              {activeTab === "active" ? (
                <div className="mt-4">
                  {!selectedEvent ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/45 px-4 py-6">
                      <p className="text-slate-200 text-sm font-medium">Select an alert</p>
                      <p className="text-sm text-slate-500 mt-1">
                        Click an alert on the left to see detail and actions.
                      </p>
                    </div>
                  ) : (
                    (() => {
                      const r = ruleById.get(selectedEvent.rule_id);
                      const sev = r?.severity ?? "info";
                      return (
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-semibold text-slate-100">
                                {r?.title ?? "Reminder"}
                              </p>
                              <p className="text-[12px] text-slate-500 mt-1 font-mono">
                                {selectedEvent.id}
                              </p>
                            </div>
                            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${pillTone(sev)}`}>
                              {sev.toUpperCase()}
                            </span>
                          </div>

                          <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                            <p className="text-sm text-slate-100 leading-relaxed">
                              {r?.message ?? ""}
                            </p>
                            {selectedEvent?.date ? (
                              <p className="mt-3 text-[11px] text-slate-500">
                                Date: <span className="text-slate-300 font-mono">{selectedEvent.date}</span>
                              </p>
                            ) : null}
                          </div>

                          <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                            <div className="flex gap-2">
                              <Button tone="primary" onClick={() => ackEvent(selectedEvent.id)} disabled={busy}>
                                Acknowledge
                              </Button>
                              <Button onClick={() => snoozeEvent(selectedEvent.id, 60)} disabled={busy}>
                                Snooze 1h
                              </Button>
                              <Button onClick={() => snoozeEvent(selectedEvent.id, 24 * 60)} disabled={busy}>
                                Snooze 24h
                              </Button>
                            </div>
                            <span className="text-[11px] text-slate-500">
                              Triggered:{" "}
                              <span className="text-slate-300">
                                {new Date(selectedEvent.triggered_at).toLocaleString()}
                              </span>
                            </span>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              ) : (
                <div className="mt-4 space-y-6">
                  {/* Templates */}
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Templates
                    </p>
                    <div className="mt-3 space-y-2">
                      {TEMPLATES.map((tpl) => {
                        const existing = rules.some((r) => r.key === tpl.key);
                        return (
                          <div
                            key={tpl.key}
                            className="rounded-2xl border border-slate-800 bg-slate-950/45 p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-slate-100 font-semibold">{tpl.title}</p>
                                <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">
                                  {tpl.message}
                                </p>
                                <p className="text-[11px] text-slate-600 mt-2">
                                  {tpl.why}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] ${pillTone(tpl.severity)}`}>
                                  {tpl.severity.toUpperCase()}
                                </span>
                                <Button
                                  tone={existing ? "neutral" : "primary"}
                                  disabled={busy || existing || !backendOk}
                                  onClick={() => createFromTemplate(tpl)}
                                >
                                  {existing ? "Added" : "Add"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* My rules */}
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Your rules
                    </p>

                    {rules.length === 0 ? (
                      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950/45 px-4 py-6">
                        <p className="text-slate-200 text-sm font-medium">No rules yet</p>
                        <p className="text-sm text-slate-500 mt-1">
                          Add a template above to start.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
	                        {rules.map((r) => {
	                          const selected = selectedRuleId === r.id;
	                          const toggleSelect = () =>
	                            setSelectedRuleId((prev) => (prev === r.id ? null : r.id));
	                          return (
	                            <div
	                              key={r.id}
	                              role="button"
	                              tabIndex={0}
	                              onClick={toggleSelect}
	                              onKeyDown={(e) => {
	                                if (e.key === "Enter" || e.key === " ") {
	                                  e.preventDefault();
	                                  toggleSelect();
	                                }
	                              }}
	                              className={`rounded-2xl border p-4 transition outline-none focus:ring-2 focus:ring-emerald-400/40 ${
	                                selected
	                                  ? "border-emerald-400/40 bg-emerald-500/10"
	                                  : "border-slate-800 bg-slate-950/45 hover:bg-slate-950/70"
	                              }`}
	                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-slate-100 font-semibold truncate">
                                      {r.title}
                                    </p>
                                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] ${pillTone(r.severity)}`}>
                                      {r.severity.toUpperCase()}
                                    </span>
                                  </div>
                                  <p className="text-[12px] text-slate-400 mt-1 line-clamp-2">
                                    {r.message}
                                  </p>
                                  <p className="text-[11px] text-slate-600 mt-2 font-mono">
                                    {r.trigger_type}
                                  </p>
                                </div>

	                                <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                                  <Toggle
                                    on={!!r.enabled}
                                    disabled={busy || !backendOk}
                                    onChange={(v) => updateRule(r.id, { enabled: v })}
                                  />
	                                  <Button onClick={toggleSelect}>{selected ? "Close" : "Edit"}</Button>
                                </div>
                              </div>

                              {selected ? (
                                <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

<div className="md:col-span-2 rounded-xl border border-slate-200/10 bg-white/5 p-4">
  <div className="flex items-start justify-between gap-4">
    <div>
      <div className="text-sm font-semibold text-slate-100">Delivery</div>
      <div className="mt-1 text-xs text-slate-400">
        Choose how Neuro notifies you when this reminder triggers.
      </div>
    </div>
  </div>

  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
    <div className="flex items-center justify-between rounded-lg border border-slate-200/10 bg-black/20 px-3 py-2">
      <div>
        <div className="text-sm text-slate-100">Neuro voice</div>
        <div className="text-[11px] text-slate-400">Spoken alert (TTS).</div>
      </div>
	      <Toggle
	        on={ruleWantsVoice(r)}
	        onChange={(v) =>
	          updateRule(r.id, { channels: setChannelValue(r.channels, "voice", v) })
	        }
	      />
    </div>

    <div className="flex items-center justify-between rounded-lg border border-slate-200/10 bg-black/20 px-3 py-2">
      <div>
        <div className="text-sm text-slate-100">Popup</div>
        <div className="text-[11px] text-slate-400">One-time modal.</div>
      </div>
	      <Toggle
	        on={ruleWantsPopup(r)}
	        onChange={(v) =>
	          updateRule(r.id, { channels: setChannelValue(r.channels, "popup", v) })
	        }
	      />
    </div>

    <div className="flex items-center justify-between rounded-lg border border-slate-200/10 bg-black/20 px-3 py-2">
      <div>
        <div className="text-sm text-slate-100">In-app</div>
        <div className="text-[11px] text-slate-400">Shows in Active Reminders.</div>
      </div>
	      <Toggle
	        on={ruleWantsInApp(r)}
	        onChange={(v) =>
	          updateRule(r.id, { channels: setChannelValue(r.channels, "inapp", v) })
	        }
	      />
    </div>
  </div>

  <div className="mt-3 text-[11px] text-slate-500">
    Voice delivery uses your browser&apos;s Speech Synthesis. Some devices require a user interaction to
    enable audio.
  </div>
</div>
                                    {r.trigger_type === "DAILY_GOAL_HIT" ? (
                                      <label className="text-sm text-slate-200">
                                        Goal (USD)
                                        <input
                                          type="number"
                                          value={Number(r.config?.goalUsd ?? 0)}
                                          onChange={(e) =>
                                            updateRule(r.id, {
                                              config: { ...(r.config || {}), goalUsd: Number(e.target.value || 0) },
                                            })
                                          }
                                          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                                        />
                                      </label>
                                    ) : null}

                                    {r.trigger_type === "DAILY_MAX_LOSS_HIT" ? (
                                      <label className="text-sm text-slate-200">
                                        Max loss (USD)
                                        <input
                                          type="number"
                                          value={Number(r.config?.maxLossUsd ?? 0)}
                                          onChange={(e) =>
                                            updateRule(r.id, {
                                              config: { ...(r.config || {}), maxLossUsd: Number(e.target.value || 0) },
                                            })
                                          }
                                          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                                        />
                                      </label>
                                    ) : null}

                                    {r.trigger_type === "OVERTRADING" ? (
                                      <label className="text-sm text-slate-200">
                                        Max trades (entries + exits)
                                        <input
                                          type="number"
                                          value={Number(r.config?.maxTrades ?? 0)}
                                          onChange={(e) =>
                                            updateRule(r.id, {
                                              config: { ...(r.config || {}), maxTrades: Number(e.target.value || 0) },
                                            })
                                          }
                                          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                                        />
                                      </label>
                                    ) : null}

                                    {r.trigger_type === "TIME_OF_DAY" ? (
                                      <label className="text-sm text-slate-200">
                                        Time (local)
                                        <input
                                          type="text"
                                          value={String(r.config?.timeLocal ?? "")}
                                          onChange={(e) =>
                                            updateRule(r.id, {
                                              config: { ...(r.config || {}), timeLocal: String(e.target.value || "") },
                                            })
                                          }
                                          placeholder="15:45"
                                          className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                                        />
                                        <p className="text-[11px] text-slate-500 mt-1">
                                          Format: HH:MM (24h)
                                        </p>
                                      </label>
                                    ) : null}

                                    <label className="text-sm text-slate-200 md:col-span-2">
                                      Message
                                      <textarea
                                        rows={3}
                                        value={r.message}
                                        onChange={(e) => updateRule(r.id, { message: e.target.value })}
                                        className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                                      />
                                    </label>
                                  </div>

                                  <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                                    <div className="flex gap-2">
                                      <Button tone="danger" disabled={busy || !backendOk} onClick={() => deleteRule(r.id)}>
                                        Delete rule
                                      </Button>
                                    </div>

                                    <span className="text-[11px] text-slate-500">
                                      Key: <span className="text-slate-300 font-mono">{r.key}</span>
                                    </span>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          <footer className="mt-6 text-[11px] text-slate-500">
            For a professional trading workflow, treat reminders as <span className="text-slate-300">behavioral circuit breakers</span>.
            They should reduce variance in execution, not increase noise.
          </footer>
        </div>
      </div>
    </main>
  );
}
