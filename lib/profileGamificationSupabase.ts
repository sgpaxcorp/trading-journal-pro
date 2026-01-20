// lib/profileGamificationSupabase.ts

import {
  CHALLENGES,
  getAllChallengeProgress,
  type ChallengeProgress,
} from "@/lib/challengesSupabase";
import { supabaseBrowser } from "@/lib/supaBaseClient";

/**
 * IMPORTANT
 * - This module tracks profile-level gamification (XP / Level / Tier / Badges).
 * - It intentionally does NOT import any ChallengeTier type.
 *   Challenge tiers and profile tiers are different concepts.
 */

export type ProfileTier = "Bronze" | "Silver" | "Gold" | "Elite";

export type ProfileGamification = {
  xp: number;
  level: number;
  tier: ProfileTier;
  badges: string[];
};

const TABLE = "profile_gamification";
const LOG = "[profileGamificationSupabase]";

const PROFILE_TIERS: ProfileTier[] = ["Bronze", "Silver", "Gold", "Elite"];

function isProfileTier(v: unknown): v is ProfileTier {
  return PROFILE_TIERS.includes(v as ProfileTier);
}

function toNum(x: unknown, fb = 0): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : fb;
}

function computeLevelFromXp(xp: number): number {
  // Simple and stable thresholds (tweak later if you want more levels).
  if (xp < 1000) return 1;
  if (xp < 3000) return 2;
  if (xp < 7000) return 3;
  return 4;
}

function computeTierFromLevel(level: number): ProfileTier {
  if (level <= 1) return "Bronze";
  if (level === 2) return "Silver";
  if (level === 3) return "Gold";
  return "Elite";
}

function computeBadges(progress: ChallengeProgress[]): string[] {
  const badges = new Set<string>();

  // 1) Challenge completion badges (no hard-coded ChallengeId comparisons).
  for (const p of progress) {
    if ((p as any)?.status !== "completed") continue;

    const def = CHALLENGES.find((c: any) => c.id === (p as any).challengeId);

    // If your ChallengeDefinition includes a completion badge ID/name, use it.
    // Otherwise use a readable fallback.
    const completionBadge: string =
      String((def as any)?.completionBadge || "") ||
      (def ? `Completed: ${String((def as any).title || def.id)}` : `Completed challenge: ${String((p as any).challengeId)}`);

    badges.add(completionBadge);
  }

  // 2) Global streak badges (based on process-green days inside each challenge).
  for (const p of progress) {
    const greenDays = toNum((p as any)?.processGreenDays, 0);
    if (greenDays >= 7) badges.add("Process Streak: 7+ green days");
    if (greenDays >= 15) badges.add("Process Streak: 15+ green days");
    if (greenDays >= 30) badges.add("Process Streak: 30+ green days");
  }

  return Array.from(badges);
}

/**
 * Reads cached snapshot from profile_gamification (if exists).
 * Useful when challenge_progress is empty (e.g., new user, migrations).
 */
async function readCachedGamificationFromDb(userId: string): Promise<ProfileGamification | null> {
  try {
    if (!userId) return null;

    const { data, error } = await supabaseBrowser
      .from(TABLE)
      .select("xp, level, tier, badges")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(LOG, "readCachedGamificationFromDb error:", error);
      return null;
    }

    if (!data) return null;

    const xp = toNum((data as any).xp, 0);
    const level = toNum((data as any).level, computeLevelFromXp(xp)) || 1;

    const tierRaw = (data as any).tier;
    const tier: ProfileTier = isProfileTier(tierRaw) ? tierRaw : computeTierFromLevel(level);

    const badges = Array.isArray((data as any).badges)
      ? (data as any).badges.map((b: any) => String(b)).filter(Boolean)
      : [];

    return { xp, level, tier, badges };
  } catch (e) {
    console.error(LOG, "readCachedGamificationFromDb exception:", e);
    return null;
  }
}

/**
 * Read-only gamification snapshot for the profile.
 * ✅ Derived from challenge_progress (Supabase).
 * ✅ Optional: sync cached snapshot into profile_gamification.
 * ✅ Optional: fallback to cached snapshot if challenge_progress is empty.
 */
export async function getProfileGamification(
  userId: string,
  opts?: { syncToDb?: boolean; fallbackToDbCache?: boolean }
): Promise<ProfileGamification> {
  if (!userId) return { xp: 0, level: 1, tier: "Bronze", badges: [] };

  const progress = await getAllChallengeProgress(userId).catch((e) => {
    console.error(LOG, "getAllChallengeProgress failed:", e);
    return [] as ChallengeProgress[];
  });

  // If no progress rows exist yet, optionally fallback to cached snapshot.
  if ((!progress || progress.length === 0) && opts?.fallbackToDbCache) {
    const cached = await readCachedGamificationFromDb(userId);
    if (cached) return cached;
  }

  const xp = (progress || []).reduce((sum, p) => sum + toNum((p as any)?.xpEarned, 0), 0);
  const level = computeLevelFromXp(xp);
  const tier = computeTierFromLevel(level);
  const badges = computeBadges(progress || []);

  const snapshot: ProfileGamification = { xp, level, tier, badges };

  // Optional cache to DB (fast UI reads).
  if (opts?.syncToDb) {
    try {
      const { error } = await supabaseBrowser
        .from(TABLE)
        .upsert(
          {
            user_id: userId,
            xp,
            level,
            tier,
            badges,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) console.error(LOG, "syncToDb upsert error:", error);
    } catch (e) {
      console.error(LOG, "syncToDb exception:", e);
    }
  }

  return snapshot;
}
