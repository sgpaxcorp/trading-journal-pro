// lib/aiCoachSnapshotSupabase.ts

import type { JournalEntry } from "@/lib/journalTypes";
import { getAllJournalEntries } from "@/lib/journalSupabase";

/**
 * Mantengo el mismo shape que tu snapshot local:
 * - journalEntries
 * - growthPlan (por ahora null porque aún lo lees local en la page)
 */
export type AiCoachSnapshot = {
  journalEntries: JournalEntry[];
  growthPlan: null;
};

/**
 * ✅ ESTE NOMBRE ES EL QUE TU PAGE IMPORTA.
 * Si no existe este export, sale el error ts(2724).
 */
export async function buildAiCoachSnapshot(userId: string, accountId?: string | null): Promise<AiCoachSnapshot> {
  if (!userId) {
    return {
      journalEntries: [],
      growthPlan: null,
    };
  }

  const journalEntries = await getAllJournalEntries(userId, accountId);

  return {
    journalEntries,
    growthPlan: null,
  };
}

/**
 * (Opcional) Export extra por si en algún sitio viejo llamas el nombre anterior.
 * No rompe nada, solo ayuda.
 */
export const buildAiCoachSnapshotSupabase = buildAiCoachSnapshot;
