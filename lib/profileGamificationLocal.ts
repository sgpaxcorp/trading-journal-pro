// lib/profileGamificationLocal.ts

import {
  getAllChallengeProgress,
  type ChallengeTier,
  type ChallengeProgress,
} from "./challengesLocal";

export type ProfileGamification = {
  xp: number;
  level: number;
  tier: ChallengeTier;
  badges: string[];
};

function computeLevelFromXp(xp: number): number {
  if (xp < 1000) return 1;
  if (xp < 3000) return 2;
  if (xp < 7000) return 3;
  return 4;
}

function computeTierFromLevel(level: number): ChallengeTier {
  if (level <= 1) return "Bronze";
  if (level === 2) return "Silver";
  if (level === 3) return "Gold";
  return "Elite";
}

function computeBadges(progress: ChallengeProgress[]): string[] {
  const badges = new Set<string>();

  for (const p of progress) {
    if (p.challengeId === "consistency-30" && p.status === "completed") {
      badges.add("Consistency Ninja");
    }
    if (p.challengeId === "ninety-day" && p.status === "completed") {
      badges.add("90-Day Finisher");
    }

    if (p.processGreenDays >= 15) badges.add("Process Streak 15+");
    if (p.processGreenDays >= 30) badges.add("Process Streak 30+");
  }

  return Array.from(badges);
}

/**
 * Read-only gamification snapshot for the profile.
 * No guarda nada nuevo; todo se deriva de los challenges.
 */
export function getProfileGamification(): ProfileGamification {
  const progress = getAllChallengeProgress();
  const xp = progress.reduce((sum, p) => sum + (p.xpEarned || 0), 0);
  const level = computeLevelFromXp(xp);
  const tier = computeTierFromLevel(level);
  const badges = computeBadges(progress);

  return {
    xp,
    level,
    tier,
    badges,
  };
}
