// lib/challengesLocal.ts

export type ChallengeId = "consistency-30" | "ninety-day";

export type ChallengeStatus = "not_started" | "active" | "completed" | "failed";

export type ChallengeTier = "Bronze" | "Silver" | "Gold" | "Elite";

export type ChallengeDefinition = {
  id: ChallengeId;
  title: string;
  shortDescription: string;
  durationDays: number;
  highlight: string;
  benefits: string[];
};

export type ChallengeProgress = {
  challengeId: ChallengeId;
  status: ChallengeStatus;
  startedAt: string | null; // ISO date
  completedAt: string | null;
  failedAt: string | null;
  daysTracked: number;
  processGreenDays: number;
  maxLossBreaks: number;
  xpEarned: number;
};

const STORAGE_KEY = "tj_challenges_v1";

/* ========== Static challenge definitions ========== */

export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: "consistency-30",
    title: "Consistency Challenge",
    shortDescription: "30 days focused on process, not P&L.",
    durationDays: 30,
    highlight: "Win by respecting your rules and journaling every day.",
    benefits: [
      "Unlock the 'Consistency Ninja' badge.",
      "Earn 1,000 XP for your profile.",
      "Download a completion certificate.",
    ],
  },
  {
    id: "ninety-day",
    title: "90 Day Transformation",
    shortDescription: "Three phases: Stabilize, Build, Scale.",
    durationDays: 90,
    highlight: "Turn your trading into a structured, 3-phase transformation.",
    benefits: [
      "Unlock phase badges (Stabilizer, Builder, Scaler).",
      "Earn up to 3,000 XP on completion.",
      "Qualify for higher global tiers.",
    ],
  },
];

/* ========== Storage helpers ========== */

function loadProgressMap(): Record<ChallengeId, ChallengeProgress> {
  if (typeof window === "undefined") return {} as any;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {} as any;
    return JSON.parse(raw) as Record<ChallengeId, ChallengeProgress>;
  } catch {
    return {} as any;
  }
}

function saveProgressMap(map: Record<ChallengeId, ChallengeProgress>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/* ========== Public API ========== */

export function getAllChallengeProgress(): ChallengeProgress[] {
  const map = loadProgressMap();
  return (Object.values(map) ?? []) as ChallengeProgress[];
}

export function getChallengeProgress(id: ChallengeId): ChallengeProgress | null {
  const map = loadProgressMap();
  return (map[id] as ChallengeProgress) ?? null;
}

export function startChallenge(id: ChallengeId): ChallengeProgress {
  const map = loadProgressMap();
  const now = new Date().toISOString();

  const existing = map[id];
  const base: ChallengeProgress =
    existing ?? {
      challengeId: id,
      status: "not_started",
      startedAt: null,
      completedAt: null,
      failedAt: null,
      daysTracked: 0,
      processGreenDays: 0,
      maxLossBreaks: 0,
      xpEarned: 0,
    };

  const updated: ChallengeProgress = {
    ...base,
    status: "active",
    startedAt: base.startedAt ?? now,
  };

  map[id] = updated;
  saveProgressMap(map);
  return updated;
}

/**
 * Register daily result for a challenge.
 * You puedes llamar esto desde tu analytics cuando calcules el processScore del día.
 */
export function updateChallengeDayResult(params: {
  id: ChallengeId;
  processScore: number; // 0–100
  brokeMaxLoss: boolean;
}): ChallengeProgress {
  const map = loadProgressMap();
  const current = map[params.id];

  if (!current) {
    throw new Error("Challenge not started yet.");
  }

  const xpFromDay = params.processScore >= 80 ? 20 : 0;

  const updated: ChallengeProgress = {
    ...current,
    daysTracked: current.daysTracked + 1,
    processGreenDays:
      current.processGreenDays + (params.processScore >= 80 ? 1 : 0),
    maxLossBreaks:
      current.maxLossBreaks + (params.brokeMaxLoss ? 1 : 0),
    xpEarned: current.xpEarned + xpFromDay,
  };

  map[params.id] = updated;
  saveProgressMap(map);

  return evaluateChallengeCompletion(updated);
}

/**
 * Check if a challenge should become completed or failed.
 * Simple reglas para que tengas algo funcional desde ya.
 */
export function evaluateChallengeCompletion(
  progress: ChallengeProgress
): ChallengeProgress {
  const defs = CHALLENGES.find((c) => c.id === progress.challengeId);
  if (!defs) return progress;

  const map = loadProgressMap();
  const nowIso = new Date().toISOString();

  const minGreenDays = Math.round(defs.durationDays * 0.66);
  const maxAllowedLossBreaks = 2;

  let status: ChallengeStatus = progress.status;
  let completedAt = progress.completedAt;
  let failedAt = progress.failedAt;

  if (
    progress.status === "active" &&
    progress.processGreenDays >= minGreenDays &&
    progress.maxLossBreaks <= maxAllowedLossBreaks
  ) {
    status = "completed";
    completedAt = completedAt ?? nowIso;

    // bonus XP on completion
    const bonus =
      progress.challengeId === "consistency-30" ? 1000 : 3000;

    progress = {
      ...progress,
      status,
      completedAt,
      xpEarned: progress.xpEarned + bonus,
    };
  }

  // opcional: marcar como failed si se pasa demasiado de la duración
  if (
    progress.status === "active" &&
    progress.daysTracked > defs.durationDays * 2
  ) {
    status = "failed";
    failedAt = failedAt ?? nowIso;
    progress = { ...progress, status, failedAt };
  }

  map[progress.challengeId] = progress;
  saveProgressMap(map);
  return progress;
}
