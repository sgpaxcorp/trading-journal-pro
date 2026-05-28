/*
  NeuroTrader Journal — Challenges Supabase helper

  What this file provides:
  - Static CHALLENGES definitions (display + XP rules)
  - startChallenge(): creates a new challenge run (archives any active run as "restarted")
  - getChallengeProgress(): returns the most recent run as "progress"
  - getAllChallengeProgress(): returns latest run for each challenge
  - listChallengeRuns(): returns run history for a given challenge
  - listChallengeDayLogs(): returns the daily check-in history for a run
  - logChallengeDay(): upserts a daily check-in, recalculates run totals, awards XP + badges

  Tables required (see supabase_challenges_schema.sql):
  - public.challenge_runs
  - public.challenge_run_days
  - public.profile_gamification
*/

"use client";

import { supabaseBrowser } from "@/lib/supaBaseClient";

/* =========================
   Types
========================= */

export type ChallengeId =
  | "process-consistency"
  | "max-loss-discipline"
  | "journal-streak"
  | "no-revenge";

export type ChallengeTier = "Bronze" | "Silver" | "Gold" | "Platinum" | "Diamond";

export type ChallengeStatus =
  | "active"
  | "completed"
  | "failed"
  | "restarted";

export type ChallengeDefinition = {
  id: ChallengeId;
  title: string;
  shortDescription: string;
  highlight: string;
  durationDays: number; // interpreted as "tracked days" (not calendar days)
  requiredGreenPct: number; // 0..1
  benefits: string[];

  // XP rules (simple + predictable)
  xp: {
    journal: number;
    respectedMaxLoss: number;
    followedPlan: number;
    processGreenBonus: number;
    completionBonus: number;
  };

  // Badge key (added when completed)
  completionBadge: string;
};

export type ChallengeProgress = {
  runId: string;
  userId: string;
  challengeId: ChallengeId;

  status: ChallengeStatus;

  startedAt: string;
  endedAt: string | null;

  durationDays: number;
  requiredGreenDays: number;

  daysTracked: number;
  processGreenDays: number;
  maxLossBreaks: number;

  xpEarned: number;

  currentStreak: number;
  bestStreak: number;
  lastTrackedDate: string | null;
};

export type ChallengeRunRow = {
  id: string;
  user_id: string;
  challenge_id: string;
  status: string;
  duration_days: number;
  required_green_days: number;
  days_tracked: number;
  process_green_days: number;
  max_loss_breaks: number;
  xp_earned: number;
  current_streak: number;
  best_streak: number;
  last_tracked_date: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChallengeDayLog = {
  id: string;
  runId: string;
  userId: string;
  challengeId: ChallengeId;
  day: string; // YYYY-MM-DD

  journalCompleted: boolean;
  respectedMaxLoss: boolean;
  followedPlan: boolean;

  processGreen: boolean;
  maxLossBreak: boolean;

  xpAwarded: number;
  note: string | null;

  createdAt: string;
  updatedAt: string;
};

export type ChallengeDayInput = {
  day: string; // YYYY-MM-DD
  journalCompleted: boolean;
  respectedMaxLoss: boolean;
  followedPlan: boolean;
  note?: string;
};

/* =========================
   Static challenge catalog
========================= */

export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: "process-consistency",
    title: "Process Consistency (14 sessions)",
    shortDescription:
      "Build a repeatable process by stacking rule-respecting, well-journaled sessions.",
    highlight:
      "Your only job: show up, execute the plan, journal it. Consistency beats intensity.",
    durationDays: 14,
    requiredGreenPct: 0.67,
    benefits: [
      "Build a reliable trading routine you can repeat",
      "Reduce emotional variance by focusing on process",
      "Create clean data for analytics and coaching",
    ],
    xp: {
      journal: 10,
      respectedMaxLoss: 10,
      followedPlan: 5,
      processGreenBonus: 10,
      completionBonus: 200,
    },
    completionBadge: "CHALLENGE_PROCESS_CONSISTENCY_COMPLETED",
  },
  {
    id: "max-loss-discipline",
    title: "Max Loss Discipline (10 sessions)",
    shortDescription:
      "Train the habit that keeps you alive: obey your daily max loss and stop digging.",
    highlight:
      "One max-loss break can wipe out a week of good trading. This challenge makes it non-negotiable.",
    durationDays: 10,
    requiredGreenPct: 0.8,
    benefits: [
      "Reduce tail-risk and protect your equity curve",
      "Eliminate revenge trading loops",
      "Strengthen confidence through rule integrity",
    ],
    xp: {
      journal: 10,
      respectedMaxLoss: 15,
      followedPlan: 5,
      processGreenBonus: 10,
      completionBonus: 250,
    },
    completionBadge: "CHALLENGE_MAX_LOSS_DISCIPLINE_COMPLETED",
  },
  {
    id: "journal-streak",
    title: "Journaling Streak (21 sessions)",
    shortDescription:
      "No matter the PnL, you journal. The goal is identity: you are a professional.",
    highlight:
      "If you can journal consistently, you can improve consistently. This is the foundation.",
    durationDays: 21,
    requiredGreenPct: 0.7,
    benefits: [
      "Higher-quality notes → better coaching feedback",
      "Faster pattern recognition",
      "Clearer risk/psychology review",
    ],
    xp: {
      journal: 15,
      respectedMaxLoss: 5,
      followedPlan: 5,
      processGreenBonus: 5,
      completionBonus: 300,
    },
    completionBadge: "CHALLENGE_JOURNAL_STREAK_COMPLETED",
  },
  {
    id: "no-revenge",
    title: "No Revenge Trading (12 sessions)",
    shortDescription:
      "After a loss, your job is to reset—not to win it back. Train the reset habit.",
    highlight:
      "Revenge trading is usually a state problem, not a strategy problem. This builds state control.",
    durationDays: 12,
    requiredGreenPct: 0.67,
    benefits: [
      "Fewer impulse trades after losses",
      "More stable daily performance",
      "Better emotional regulation under pressure",
    ],
    xp: {
      journal: 10,
      respectedMaxLoss: 10,
      followedPlan: 10,
      processGreenBonus: 10,
      completionBonus: 220,
    },
    completionBadge: "CHALLENGE_NO_REVENGE_COMPLETED",
  },
];

/* =========================
   Small utilities
========================= */

function mapRunToProgress(run: ChallengeRunRow): ChallengeProgress {
  return {
    runId: run.id,
    userId: run.user_id,
    challengeId: run.challenge_id as ChallengeId,
    status: run.status as ChallengeStatus,
    startedAt: run.started_at,
    endedAt: run.ended_at,
    durationDays: run.duration_days,
    requiredGreenDays: run.required_green_days,
    daysTracked: run.days_tracked,
    processGreenDays: run.process_green_days,
    maxLossBreaks: run.max_loss_breaks,
    xpEarned: run.xp_earned,
    currentStreak: run.current_streak,
    bestStreak: run.best_streak,
    lastTrackedDate: run.last_tracked_date,
  };
}

async function postChallengeApi<T>(path: string, body: unknown): Promise<T> {
  const { data: sessionData } = await supabaseBrowser.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Missing session");

  const res = await fetch(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String((payload as any)?.error || "Challenge request failed"));
  }

  return payload as T;
}

/* =========================
   Public API
========================= */

export async function getChallengeProgress(
  userId: string,
  challengeId: ChallengeId
): Promise<ChallengeProgress | null> {
  if (!userId) return null;

  const { data, error } = await supabaseBrowser
    .from("challenge_runs")
    .select(
      "id,user_id,challenge_id,status,duration_days,required_green_days,days_tracked,process_green_days,max_loss_breaks,xp_earned,current_streak,best_streak,last_tracked_date,started_at,ended_at,created_at,updated_at"
    )
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapRunToProgress(data as unknown as ChallengeRunRow);
}

export async function getAllChallengeProgress(
  userId: string
): Promise<ChallengeProgress[]> {
  if (!userId) return [];

  const { data, error } = await supabaseBrowser
    .from("challenge_runs")
    .select(
      "id,user_id,challenge_id,status,duration_days,required_green_days,days_tracked,process_green_days,max_loss_breaks,xp_earned,current_streak,best_streak,last_tracked_date,started_at,ended_at,created_at,updated_at"
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const latestByChallenge: Record<string, ChallengeRunRow> = {};

  for (const row of (data as any[]) || []) {
    const cid = String(row.challenge_id);
    if (!latestByChallenge[cid]) {
      latestByChallenge[cid] = row as ChallengeRunRow;
    }
  }

  return Object.values(latestByChallenge).map(mapRunToProgress);
}

export async function listChallengeRuns(params: {
  userId: string;
  challengeId: ChallengeId;
  limit?: number;
}): Promise<ChallengeProgress[]> {
  const { userId, challengeId, limit = 10 } = params;
  if (!userId) return [];

  const { data, error } = await supabaseBrowser
    .from("challenge_runs")
    .select(
      "id,user_id,challenge_id,status,duration_days,required_green_days,days_tracked,process_green_days,max_loss_breaks,xp_earned,current_streak,best_streak,last_tracked_date,started_at,ended_at,created_at,updated_at"
    )
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data as any[]) || []).map((r) => mapRunToProgress(r as ChallengeRunRow));
}

export async function listChallengeDayLogs(params: {
  userId: string;
  runId: string;
  limit?: number;
  ascending?: boolean;
}): Promise<ChallengeDayLog[]> {
  const { userId, runId, limit = 200, ascending = true } = params;
  if (!userId || !runId) return [];

  const { data, error } = await supabaseBrowser
    .from("challenge_run_days")
    .select(
      "id,run_id,user_id,challenge_id,day,journal_completed,respected_max_loss,followed_plan,process_green,max_loss_break,xp_awarded,note,created_at,updated_at"
    )
    .eq("user_id", userId)
    .eq("run_id", runId)
    .order("day", { ascending })
    .limit(limit);

  if (error) throw error;

  return ((data as any[]) || []).map((r) => ({
    id: String(r.id),
    runId: String(r.run_id),
    userId: String(r.user_id),
    challengeId: String(r.challenge_id) as ChallengeId,
    day: String(r.day),
    journalCompleted: Boolean(r.journal_completed),
    respectedMaxLoss: Boolean(r.respected_max_loss),
    followedPlan: Boolean(r.followed_plan),
    processGreen: Boolean(r.process_green),
    maxLossBreak: Boolean(r.max_loss_break),
    xpAwarded: Number(r.xp_awarded) || 0,
    note: r.note != null ? String(r.note) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

export async function startChallenge(
  userId: string,
  challengeId: ChallengeId
): Promise<ChallengeProgress> {
  if (!userId) throw new Error("Missing userId");

  const result = await postChallengeApi<{ progress: ChallengeProgress }>(
    "/api/challenges/start",
    { challengeId }
  );
  return result.progress;
}

export async function logChallengeDay(params: {
  userId: string;
  challengeId: ChallengeId;
  runId: string;
  input: ChallengeDayInput;
}): Promise<{ progress: ChallengeProgress; dayLog: ChallengeDayLog | null }> {
  const { userId, challengeId, runId, input } = params;

  if (!userId) throw new Error("Missing userId");
  if (!runId) throw new Error("Missing runId");

  return postChallengeApi<{ progress: ChallengeProgress; dayLog: ChallengeDayLog | null }>(
    "/api/challenges/check-in",
    { runId, challengeId, input }
  );
}
