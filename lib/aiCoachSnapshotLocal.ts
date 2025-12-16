// lib/aiCoachSnapshotLocal.ts

import {
  getAllJournalEntries,
  type JournalEntry,
} from "./journalLocal";
import {
  getGrowthPlan,
  type GrowthPlan,
} from "./growthPlanLocal";
import {
  getAllChallengeProgress,
  type ChallengeProgress,
} from "./challengesLocal";
import {
  getProfileGamification,
  type ProfileGamification,
} from "./profileGamificationLocal";

export type AiCoachSnapshot = {
  journalEntries: JournalEntry[];
  growthPlan: GrowthPlan | null;
  challenges: ChallengeProgress[];
  profileGamification: ProfileGamification;
};

/**
 * Single helper to build all the data the AI coach needs.
 * Luego en el API simplemente recibes este objeto y ya.
 */
export function buildAiCoachSnapshot(): AiCoachSnapshot {
  const journalEntries = getAllJournalEntries();
  const growthPlan = getGrowthPlan();
  const challenges = getAllChallengeProgress();
  const profileGamification = getProfileGamification();

  return {
    journalEntries,
    growthPlan,
    challenges,
    profileGamification,
  };
}
