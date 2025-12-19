// lib/profileGamificationSupabase.ts
import {
  getAllChallengeProgress,
  type ChallengeTier,
  type ChallengeProgress,
} from "@/lib/challengesSupabase";
import { supabaseBrowser } from "@/lib/supaBaseClient";

export type ProfileGamification = {
  xp: number;
  level: number;
  tier: ChallengeTier;
  badges: string[];
};

const TABLE = "profile_gamification";
const LOG = "[profileGamificationSupabase]";

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
 * Lee la “cache” desde profile_gamification si existe.
 * Útil si por alguna razón aún no hay rows en challenge_progress.
 */
async function readCachedGamificationFromDb(
  userId: string
): Promise<ProfileGamification | null> {
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

    const xp = Number(data.xp ?? 0);
    const level =
      Number(data.level ?? 0) || computeLevelFromXp(Number.isFinite(xp) ? xp : 0);

    const tier = (data.tier as ChallengeTier) ?? computeTierFromLevel(level);
    const badges = Array.isArray(data.badges) ? data.badges.map(String) : [];

    return {
      xp: Number.isFinite(xp) ? xp : 0,
      level: Number.isFinite(level) ? level : 1,
      tier,
      badges,
    };
  } catch (e) {
    console.error(LOG, "readCachedGamificationFromDb exception:", e);
    return null;
  }
}

/**
 * Read-only gamification snapshot for the profile.
 * ✅ Todo se deriva de challenge_progress (Supabase).
 * ✅ Opcional: sincroniza profile_gamification en DB (upsert).
 * ✅ Opcional: fallback a la cache DB si challenge_progress está vacío.
 */
export async function getProfileGamification(
  userId: string,
  opts?: { syncToDb?: boolean; fallbackToDbCache?: boolean }
): Promise<ProfileGamification> {
  if (!userId) {
    return { xp: 0, level: 1, tier: "Bronze", badges: [] };
  }

  const progress = await getAllChallengeProgress(userId);

  // Si no hay progress aún, opcionalmente usa cache DB
  if ((!progress || progress.length === 0) && opts?.fallbackToDbCache) {
    const cached = await readCachedGamificationFromDb(userId);
    if (cached) return cached;
  }

  const xp = (progress ?? []).reduce((sum, p) => sum + (p.xpEarned || 0), 0);
  const level = computeLevelFromXp(xp);
  const tier = computeTierFromLevel(level);
  const badges = computeBadges(progress ?? []);

  const snapshot: ProfileGamification = { xp, level, tier, badges };

  // cache opcional en DB
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
