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

function requireDef(id: ChallengeId): ChallengeDefinition {
  const d = CHALLENGES.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown challenge id: ${id}`);
  return d;
}

function requiredGreenDays(def: ChallengeDefinition): number {
  return Math.max(1, Math.ceil(def.durationDays * def.requiredGreenPct));
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function computeXp(def: ChallengeDefinition, input: ChallengeDayInput) {
  const journal = input.journalCompleted ? def.xp.journal : 0;
  const maxLoss = input.respectedMaxLoss ? def.xp.respectedMaxLoss : 0;
  const plan = input.followedPlan ? def.xp.followedPlan : 0;

  const processGreen =
    Boolean(input.journalCompleted) &&
    Boolean(input.respectedMaxLoss) &&
    Boolean(input.followedPlan);

  const bonus = processGreen ? def.xp.processGreenBonus : 0;

  const xpAwarded = clampInt(journal + maxLoss + plan + bonus, 0, 1000);

  return {
    xpAwarded,
    processGreen,
    maxLossBreak: !input.respectedMaxLoss,
  };
}

function computeStreaks(days: { day: string; process_green: boolean }[]) {
  // Streak logic: consecutive logged days (by date) where process_green = true.
  // If a user skips days, the streak breaks (simple + predictable).
  const sorted = [...days]
    .filter((d) => isIsoDate(d.day))
    .sort((a, b) => a.day.localeCompare(b.day));

  let best = 0;
  let current = 0;

  let prevDate: Date | null = null;

  for (const row of sorted) {
    const d = new Date(row.day + "T00:00:00");
    if (Number.isNaN(d.getTime())) continue;

    const isConsecutive =
      prevDate &&
      (d.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000) === 1;

    if (!row.process_green) {
      current = 0;
    } else {
      if (!prevDate || isConsecutive) current += 1;
      else current = 1;

      if (current > best) best = current;
    }

    prevDate = d;
  }

  return { currentStreak: current, bestStreak: best };
}

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

/* =========================
   Profile gamification helpers (XP + badges)
========================= */

type ProfileGamificationRow = {
  user_id: string;
  xp: number;
  level: number;
  tier: string;
  badges: any; // jsonb array
  created_at: string;
  updated_at: string;
};

function computeLevelFromXp(xp: number): number {
  // Simple curve: 500 XP per level.
  const safe = Math.max(0, Math.floor(xp));
  return Math.max(1, Math.floor(safe / 500) + 1);
}

function computeTierFromLevel(level: number): string {
  if (level >= 30) return "Diamond";
  if (level >= 20) return "Platinum";
  if (level >= 12) return "Gold";
  if (level >= 6) return "Silver";
  return "Bronze";
}

async function applyXpAndBadge(params: {
  userId: string;
  xpDelta: number;
  badgeToAdd?: string | null;
}) {
  const { userId, xpDelta, badgeToAdd } = params;
  if (!userId) return;

  const delta = Math.floor(xpDelta || 0);
  const badge = (badgeToAdd || "").trim();

  if (delta === 0 && !badge) return;

  const { data: existing, error: selErr } = await supabaseBrowser
    .from("profile_gamification")
    .select("user_id,xp,level,tier,badges")
    .eq("user_id", userId)
    .maybeSingle();

  if (selErr) {
    // If the table doesn't exist yet in a dev environment, avoid crashing the app.
    console.warn("[challenges] profile_gamification select failed:", selErr);
    return;
  }

  const curXp = Number((existing as any)?.xp ?? 0) || 0;

  const curBadgesRaw = (existing as any)?.badges;
  const curBadges: string[] = Array.isArray(curBadgesRaw)
    ? curBadgesRaw.map((x: any) => String(x))
    : [];

  const nextXp = Math.max(0, curXp + delta);
  const nextLevel = computeLevelFromXp(nextXp);
  const nextTier = computeTierFromLevel(nextLevel);

  let nextBadges = curBadges;
  if (badge && !curBadges.includes(badge)) {
    nextBadges = [...curBadges, badge];
  }

  const payload = {
    user_id: userId,
    xp: nextXp,
    level: nextLevel,
    tier: nextTier,
    badges: nextBadges,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabaseBrowser
    .from("profile_gamification")
    .upsert(payload as any, { onConflict: "user_id" });

  if (upErr) {
    console.warn("[challenges] profile_gamification upsert failed:", upErr);
  }
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

  const def = requireDef(challengeId);
  const req = requiredGreenDays(def);

  // Archive any current active run as "restarted" (single active run guarantee)
  await supabaseBrowser
    .from("challenge_runs")
    .update({ status: "restarted", ended_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .eq("status", "active");

  const { data, error } = await supabaseBrowser
    .from("challenge_runs")
    .insert({
      user_id: userId,
      challenge_id: challengeId,
      status: "active",
      duration_days: def.durationDays,
      required_green_days: req,
      days_tracked: 0,
      process_green_days: 0,
      max_loss_breaks: 0,
      xp_earned: 0,
      current_streak: 0,
      best_streak: 0,
      last_tracked_date: null,
      started_at: new Date().toISOString(),
    })
    .select(
      "id,user_id,challenge_id,status,duration_days,required_green_days,days_tracked,process_green_days,max_loss_breaks,xp_earned,current_streak,best_streak,last_tracked_date,started_at,ended_at,created_at,updated_at"
    )
    .single();

  if (error) throw error;

  return mapRunToProgress(data as unknown as ChallengeRunRow);
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

  const def = requireDef(challengeId);

  const dayIso = (input.day || "").trim() || isoToday();
  if (!isIsoDate(dayIso)) throw new Error("Invalid day (expected YYYY-MM-DD)");

  // Load current run (for duration + required greens + status)
  const { data: runRow, error: runErr } = await supabaseBrowser
    .from("challenge_runs")
    .select(
      "id,user_id,challenge_id,status,duration_days,required_green_days,days_tracked,process_green_days,max_loss_breaks,xp_earned,current_streak,best_streak,last_tracked_date,started_at,ended_at,created_at,updated_at"
    )
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();

  if (runErr) throw runErr;
  if (!runRow) throw new Error("Challenge run not found");

  const run = runRow as unknown as ChallengeRunRow;

  if (String(run.challenge_id) !== String(challengeId)) {
    throw new Error("Run does not match challenge");
  }

  // Only allow check-ins when active
  if (run.status !== "active") {
    throw new Error("This challenge run is not active.");
  }

  // Read existing day log (for XP delta)
  const { data: existingDay, error: exErr } = await supabaseBrowser
    .from("challenge_run_days")
    .select(
      "id,xp_awarded,day,run_id,user_id,challenge_id,journal_completed,respected_max_loss,followed_plan,process_green,max_loss_break,note,created_at,updated_at"
    )
    .eq("run_id", runId)
    .eq("day", dayIso)
    .eq("user_id", userId)
    .maybeSingle();

  if (exErr) throw exErr;

  const prevXp = existingDay ? Number((existingDay as any).xp_awarded) || 0 : 0;

  const { xpAwarded, processGreen, maxLossBreak } = computeXp(def, {
    ...input,
    day: dayIso,
  });

  const payload = {
    run_id: runId,
    user_id: userId,
    challenge_id: challengeId,
    day: dayIso,
    journal_completed: Boolean(input.journalCompleted),
    respected_max_loss: Boolean(input.respectedMaxLoss),
    followed_plan: Boolean(input.followedPlan),
    process_green: processGreen,
    max_loss_break: maxLossBreak,
    xp_awarded: xpAwarded,
    note: (input.note || "").trim() || null,
  };

  // Insert/update
  let savedRow: any = null;

  if (existingDay?.id) {
    const { data: upd, error: updErr } = await supabaseBrowser
      .from("challenge_run_days")
      .update(payload)
      .eq("id", existingDay.id)
      .select(
        "id,run_id,user_id,challenge_id,day,journal_completed,respected_max_loss,followed_plan,process_green,max_loss_break,xp_awarded,note,created_at,updated_at"
      )
      .single();

    if (updErr) throw updErr;
    savedRow = upd;
  } else {
    const { data: ins, error: insErr } = await supabaseBrowser
      .from("challenge_run_days")
      .insert(payload)
      .select(
        "id,run_id,user_id,challenge_id,day,journal_completed,respected_max_loss,followed_plan,process_green,max_loss_break,xp_awarded,note,created_at,updated_at"
      )
      .single();

    if (insErr) throw insErr;
    savedRow = ins;
  }

  const newXp = xpAwarded;
  let xpDelta = newXp - prevXp;

  // Recompute aggregates from all days (small N, safe)
  const { data: allDaysRaw, error: listErr } = await supabaseBrowser
    .from("challenge_run_days")
    .select("day,process_green,max_loss_break,xp_awarded")
    .eq("run_id", runId)
    .eq("user_id", userId);

  if (listErr) throw listErr;

  const allDays = (allDaysRaw as any[]) || [];

  const daysTracked = allDays.length;
  const processGreenDays = allDays.filter((d) => Boolean(d.process_green)).length;
  const maxLossBreaks = allDays.filter((d) => Boolean(d.max_loss_break)).length;
  const xpEarnedBase = allDays.reduce(
    (sum, d) => sum + (Number(d.xp_awarded) || 0),
    0
  );

  const lastTracked =
    allDays
      .map((d) => String(d.day || ""))
      .filter((s) => isIsoDate(s))
      .sort()
      .slice(-1)[0] || null;

  const { currentStreak, bestStreak } = computeStreaks(
    allDays.map((d) => ({
      day: String(d.day || ""),
      process_green: Boolean(d.process_green),
    }))
  );

  // Finalize run if duration reached
  let nextStatus: ChallengeStatus = run.status as ChallengeStatus;
  let endedAt: string | null = run.ended_at;

  let completionBonus = 0;
  let badgeToAdd: string | null = null;

  if (run.status === "active" && daysTracked >= run.duration_days) {
    const completed = processGreenDays >= run.required_green_days;
    nextStatus = completed ? "completed" : "failed";
    endedAt = new Date().toISOString();

    if (completed) {
      completionBonus = def.xp.completionBonus;
      badgeToAdd = def.completionBadge;
    }
  }

  const xpEarned = xpEarnedBase + completionBonus;

  // If we are transitioning to completed, award completion bonus to profile XP.
  // (Only when the run transitions from active → completed.)
  if (run.status === "active" && nextStatus === "completed" && completionBonus > 0) {
    xpDelta += completionBonus;
  }

  // Update run summary
  const { data: updatedRun, error: updRunErr } = await supabaseBrowser
    .from("challenge_runs")
    .update({
      status: nextStatus,
      ended_at: endedAt,
      days_tracked: daysTracked,
      process_green_days: processGreenDays,
      max_loss_breaks: maxLossBreaks,
      xp_earned: xpEarned,
      current_streak: currentStreak,
      best_streak: bestStreak,
      last_tracked_date: lastTracked,
    })
    .eq("id", runId)
    .eq("user_id", userId)
    .select(
      "id,user_id,challenge_id,status,duration_days,required_green_days,days_tracked,process_green_days,max_loss_breaks,xp_earned,current_streak,best_streak,last_tracked_date,started_at,ended_at,created_at,updated_at"
    )
    .single();

  if (updRunErr) throw updRunErr;

  // Apply XP + badge (best-effort — does not block challenge logging)
  await applyXpAndBadge({
    userId,
    xpDelta,
    badgeToAdd,
  });

  const dayLog: ChallengeDayLog | null = savedRow
    ? {
        id: String(savedRow.id),
        runId: String(savedRow.run_id),
        userId: String(savedRow.user_id),
        challengeId: String(savedRow.challenge_id) as ChallengeId,
        day: String(savedRow.day),
        journalCompleted: Boolean(savedRow.journal_completed),
        respectedMaxLoss: Boolean(savedRow.respected_max_loss),
        followedPlan: Boolean(savedRow.followed_plan),
        processGreen: Boolean(savedRow.process_green),
        maxLossBreak: Boolean(savedRow.max_loss_break),
        xpAwarded: Number(savedRow.xp_awarded) || 0,
        note: savedRow.note != null ? String(savedRow.note) : null,
        createdAt: String(savedRow.created_at),
        updatedAt: String(savedRow.updated_at),
      }
    : null;

  return {
    progress: mapRunToProgress(updatedRun as unknown as ChallengeRunRow),
    dayLog,
  };
}

