// lib/aiCoachSnapshotSupabase.ts

import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";

import {
  getAllChallengeProgress,
  type ChallengeProgress,
} from "@/lib/challengesSupabase";

import {
  getProfileGamification,
  type ProfileGamification,
} from "@/lib/profileGamificationSupabase";

/**
 * Mantengo el mismo shape que tu snapshot local:
 * - journalEntries
 * - growthPlan (por ahora null porque aún lo lees local en la page)
 * - challenges
 * - profileGamification
 */
export type AiCoachSnapshot = {
  journalEntries: JournalEntry[];
  growthPlan: null;
  challenges: ChallengeProgress[];
  profileGamification: ProfileGamification;
};

/**
 * ✅ ESTE NOMBRE ES EL QUE TU PAGE IMPORTA.
 * Si no existe este export, sale el error ts(2724).
 */
export async function buildAiCoachSnapshot(userId: string): Promise<AiCoachSnapshot> {
  if (!userId) {
    return {
      journalEntries: [],
      growthPlan: null,
      challenges: [],
      profileGamification: { xp: 0, level: 1, tier: "Bronze", badges: [] },
    };
  }

  const [journalEntries, challenges, profileGamification] = await Promise.all([
    getAllJournalEntries(userId),
    getAllChallengeProgress(userId),
    getProfileGamification(userId),
  ]);

  return {
    journalEntries,
    growthPlan: null,
    challenges,
    profileGamification,
  };
}

/**
 * (Opcional) Export extra por si en algún sitio viejo llamas el nombre anterior.
 * No rompe nada, solo ayuda.
 */
export const buildAiCoachSnapshotSupabase = buildAiCoachSnapshot;
