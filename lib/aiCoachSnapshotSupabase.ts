// lib/aiCoachSnapshotSupabase.ts
import { supabaseBrowser } from "@/lib/supaBaseClient";
import type { JournalEntry } from "@/lib/journalTypes";

/**
 * Ajusta estos tipos si ya tienes archivos types para cada feature.
 * Si no, esto funciona igual (porque el snapshot se usa mostly para AI payload).
 */
export type ChallengeProgress = {
  id?: string;
  user_id: string;
  challenge_id?: string | null;
  status?: string | null;
  progress?: number | null;
  current_streak?: number | null;
  best_streak?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
};

export type ChallengeDefinition = {
  id: string;
  name?: string | null;
  description?: string | null;
  category?: string | null;
  points?: number | null;
  created_at?: string | null;
  [key: string]: any;
};

export type ProfileGamification = {
  id?: string;
  user_id: string;
  level?: number | null;
  xp?: number | null;
  rank?: string | null;
  badges?: any[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
};

export type AiCoachSnapshot = {
  journalEntries: JournalEntry[];
  challenges: ChallengeProgress[];
  challengeDefinitions: ChallengeDefinition[]; // opcional, pero útil
  profileGamification: ProfileGamification | null;
};

const TABLE_JOURNAL = "journal_entries";
const TABLE_CHALLENGE_PROGRESS = "challenge_progress";
const TABLE_CHALLENGE_DEFINITIONS = "challenge_definitions";
const TABLE_PROFILE_GAMIFICATION = "profile_gamification";

function safeUserId(raw: unknown): string {
  const s = String(raw ?? "").trim();
  return s;
}

function logErr(scope: string, err: any) {
  console.error(`[aiCoachSnapshotSupabase] ${scope}`, err);
}

/* =========================
   Fetchers (Supabase)
========================= */

export async function getAllJournalEntriesSupabase(
  userId: string
): Promise<JournalEntry[]> {
  const uid = safeUserId(userId);
  if (!uid) return [];

  // Si tu tabla usa otra columna para ordenar (ej: created_at),
  // cambia .order("date", ...) por .order("created_at", ...)
  const { data, error } = await supabaseBrowser
    .from(TABLE_JOURNAL)
    .select("*")
    .eq("user_id", uid)
    .order("date", { ascending: true });

  if (error) {
    logErr("getAllJournalEntriesSupabase", error);
    return [];
  }

  return (data ?? []) as JournalEntry[];
}

export async function getAllChallengeProgressSupabase(
  userId: string
): Promise<ChallengeProgress[]> {
  const uid = safeUserId(userId);
  if (!uid) return [];

  const { data, error } = await supabaseBrowser
    .from(TABLE_CHALLENGE_PROGRESS)
    .select("*")
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });

  if (error) {
    logErr("getAllChallengeProgressSupabase", error);
    return [];
  }

  return (data ?? []) as ChallengeProgress[];
}

/**
 * Definitions NO son por usuario normalmente, son globales.
 * Si las quieres “filtradas” por algo, me dices la columna.
 */
export async function getChallengeDefinitionsSupabase(): Promise<
  ChallengeDefinition[]
> {
  const { data, error } = await supabaseBrowser
    .from(TABLE_CHALLENGE_DEFINITIONS)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    logErr("getChallengeDefinitionsSupabase", error);
    return [];
  }

  return (data ?? []) as ChallengeDefinition[];
}

export async function getProfileGamificationSupabase(
  userId: string
): Promise<ProfileGamification | null> {
  const uid = safeUserId(userId);
  if (!uid) return null;

  const { data, error } = await supabaseBrowser
    .from(TABLE_PROFILE_GAMIFICATION)
    .select("*")
    .eq("user_id", uid)
    .maybeSingle();

  if (error) {
    logErr("getProfileGamificationSupabase", error);
    return null;
  }

  return (data ?? null) as ProfileGamification | null;
}

/* =========================
   Snapshot Builder (async)
========================= */

export async function buildAiCoachSnapshotSupabase(
  userId: string
): Promise<AiCoachSnapshot> {
  const uid = safeUserId(userId);

  if (!uid) {
    return {
      journalEntries: [],
      challenges: [],
      challengeDefinitions: [],
      profileGamification: null,
    };
  }

  const [journalEntries, challenges, challengeDefinitions, profileGamification] =
    await Promise.all([
      getAllJournalEntriesSupabase(uid),
      getAllChallengeProgressSupabase(uid),
      getChallengeDefinitionsSupabase(),
      getProfileGamificationSupabase(uid),
    ]);

  return {
    journalEntries,
    challenges,
    challengeDefinitions,
    profileGamification,
  };
}
