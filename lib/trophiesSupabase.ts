import { supabaseBrowser } from "@/lib/supaBaseClient";

const LOG = "[trophiesSupabase]";

export type TrophyTier = "Bronze" | "Silver" | "Gold" | "Elite";
export type TrophyRuleOp = "gte" | "eq" | "lte";

export type TrophyDefinition = {
  id: string;
  title: string;
  description: string;
  tier: TrophyTier;
  xp: number;
  category: string;

  // Rule engine (evaluated in syncMyTrophies)
  rule_key: string;
  rule_op: TrophyRuleOp;
  rule_value: number;

  // Optional metadata
  tags?: string[] | null;
  icon?: string | null;

  /**
   * Optional: if true, locked trophies should hide the real requirement/description
   * until earned (you can still show a generic hint).
   */
  secret?: boolean | null;
};

export type PublicUserTrophy = {
  trophy_id: string;
  title: string;
  description: string;
  tier: TrophyTier;
  xp: number;
  category: string;
  icon?: string | null;
  earned_at: string | null;
};

// Back-compat alias (older code referred to earned trophies as "EarnedTrophy")
type EarnedTrophy = PublicUserTrophy;

export type PublicLeaderboardRow = {
  rank?: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  tier: TrophyTier;
  xp_total: number;
  trophies_count: number;
};

export type PublicUserProfile = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  tier: TrophyTier;
  xp_total: number;
  trophies_count: number;
  level: number;
};

export type TrophySyncResult = {
  inserted: number;
  newTrophies?: PublicUserTrophy[];
};

let _trophyDefsCache: { at: number; items: TrophyDefinition[] } | null = null;

export function getTierFromXp(xp: number): TrophyTier {
  if (xp >= 5000) return "Elite";
  if (xp >= 2500) return "Gold";
  if (xp >= 1000) return "Silver";
  return "Bronze";
}

export function getLevelFromXp(xp: number): number {
  // Simple, predictable leveling curve (adjust later)
  return Math.max(1, Math.floor(xp / 500) + 1);
}

export function describeUnlock(def: TrophyDefinition): string {
  const v = Number(def.rule_value || 0);

  switch (def.rule_key) {
    case "days_logged":
      return `Log ${v} trading day${v === 1 ? "" : "s"} in your journal.`;
    case "best_streak":
      return `Reach a journaling streak of ${v} day${v === 1 ? "" : "s"}.`;
    case "plan_created":
      return "Create your Growth Plan.";
    case "challenges_completed":
      return `Complete ${v} challenge${v === 1 ? "" : "s"}.`;
    default:
      return def.description;
  }
}

/**
 * Load all trophy definitions.
 * NOTE: trophy_definitions should be seeded by service-role/admin tools (RLS).
 */
export async function listTrophyDefinitions(opts?: {
  includeSecret?: boolean;
  useCache?: boolean;
  cacheTtlMs?: number;
}): Promise<TrophyDefinition[]> {
  const includeSecret = opts?.includeSecret ?? true;
  const useCache = opts?.useCache ?? true;
  const cacheTtlMs = opts?.cacheTtlMs ?? 10 * 60 * 1000;

  if (useCache && _trophyDefsCache && Date.now() - _trophyDefsCache.at < cacheTtlMs) {
    const cached = _trophyDefsCache.items;
    return includeSecret ? cached : cached.filter((d) => !d.secret);
  }

    // Some deployments may not yet have optional columns (tags/secret). We try the superset
  // first and fall back gracefully if Postgres reports undefined_column (42703).
  const selectFull =
    "id, title, description, tier, xp, category, rule_key, rule_op, rule_value, tags, icon, secret";
  const selectMinimal =
    "id, title, description, tier, xp, category, rule_key, rule_op, rule_value, icon";

  let data: any[] | null = null;
  let error: any = null;

  // First attempt: full select
  {
    const res = await supabaseBrowser
      .from("trophy_definitions")
      .select(selectFull)
      .order("xp", { ascending: true });
    data = res.data as any[] | null;
    error = res.error;
  }

  // Fallback attempt: minimal select if undefined_column
  if (
    error &&
    (error.code === "42703" ||
      String(error.message || "").toLowerCase().includes("does not exist"))
  ) {
    const res2 = await supabaseBrowser
      .from("trophy_definitions")
      .select(selectMinimal)
      .order("xp", { ascending: true });
    data = res2.data as any[] | null;
    error = res2.error;
  }

  if (error) throw error;


  const items: TrophyDefinition[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    title: String(r.title),
    description: String(r.description ?? ""),
    tier: r.tier as TrophyTier,
    xp: Number(r.xp ?? 0),
    category: String(r.category ?? "General"),
    rule_key: String(r.rule_key ?? ""),
    rule_op: (r.rule_op ?? "gte") as TrophyRuleOp,
    rule_value: Number(r.rule_value ?? 0),
    tags: (r.tags ?? null) as string[] | null,
    icon: (r.icon ?? null) as string | null,
    secret: (r.secret ?? null) as boolean | null,
  }));

  if (useCache) _trophyDefsCache = { at: Date.now(), items };

  return includeSecret ? items : items.filter((d) => !d.secret);
}

/**
 * Optional back-compat helper for older pages.
 */
export async function getPublicLeaderboardTop(limit = 25) {
  return listPublicLeaderboard(limit);
}

/**
 * Compute and insert newly earned trophies for a user. Returns list of newly earned trophies
 * (for notifications/toasts).
 */
export async function syncMyTrophies(userId: string): Promise<TrophySyncResult> {
  if (!userId) return { inserted: 0 };

  // Load definitions (include secrets so they can be earned)
  const defs = await listTrophyDefinitions({ includeSecret: true });

  // Read existing earned trophy ids
  const { data: earnedRows, error: earnedErr } = await supabaseBrowser
    .from("user_trophies")
    .select("trophy_id")
    .eq("user_id", userId);

  if (earnedErr) throw earnedErr;

  const earnedSet = new Set<string>((earnedRows ?? []).map((r: any) => String(r.trophy_id)));

  // Compute counters for rule evaluation
  const counters = await getUserTrophyCounters(userId);

  const newlyEarned = defs.filter((d) => {
    if (earnedSet.has(d.id)) return false;
    const current = Number((counters as any)[d.rule_key] ?? 0);
    switch (d.rule_op) {
      case "eq":
        return current === d.rule_value;
      case "lte":
        return current <= d.rule_value;
      case "gte":
      default:
        return current >= d.rule_value;
    }
  });

  if (!newlyEarned.length) return { inserted: 0, newTrophies: [] };

  const insertPayload = newlyEarned.map((d) => ({
    user_id: userId,
    trophy_id: d.id,
    earned_at: new Date().toISOString(),
  }));

  const { error: insErr } = await supabaseBrowser
    .from("user_trophies")
    .insert(insertPayload, { defaultToNull: false });

  // If duplicates happen, we ignore (another tab already inserted)
  if (insErr && !String(insErr.message || "").toLowerCase().includes("duplicate")) {
    throw insErr;
  }

  // Re-fetch the newly inserted trophies joined with definition fields for UI
  const { data: joined, error: joinedErr } = await supabaseBrowser
    .from("user_trophies")
    .select(
      "trophy_id, earned_at, trophy_definitions(id, title, description, tier, xp, category, icon)"
    )
    .eq("user_id", userId)
    .in(
      "trophy_id",
      newlyEarned.map((d) => d.id)
    );

  if (joinedErr) throw joinedErr;

  const newTrophies: PublicUserTrophy[] = (joined ?? []).map((row: any) => ({
    trophy_id: String(row.trophy_id),
    earned_at: row.earned_at ? String(row.earned_at) : null,
    title: String(row.trophy_definitions?.title ?? "Trophy"),
    description: String(row.trophy_definitions?.description ?? ""),
    tier: (row.trophy_definitions?.tier ?? "Bronze") as TrophyTier,
    xp: Number(row.trophy_definitions?.xp ?? 0),
    category: String(row.trophy_definitions?.category ?? "General"),
    icon: (row.trophy_definitions?.icon ?? null) as string | null,
  }));

  return { inserted: newlyEarned.length, newTrophies };
}

/**
 * Public leaderboard (top N traders).
 * Requires an RPC called `nt_public_leaderboard(limit)` that returns the fields in PublicLeaderboardRow.
 */
/**
 * Public leaderboard (Top traders) — secure via RPC `nt_public_leaderboard`.
 * Accepts either:
 *   - `listPublicLeaderboard(25)`
 *   - `listPublicLeaderboard({ limit: 25, offset: 0 })`
 */
/**
 * Public leaderboard (Top traders) — secure via RPC `nt_public_leaderboard`.
 * Accepts either:
 *   - `listPublicLeaderboard(25)`
 *   - `listPublicLeaderboard({ limit: 25, offset: 0 })`
 */
export async function listPublicLeaderboard(
  arg: number | { limit?: number; offset?: number } = 25
): Promise<PublicLeaderboardRow[]> {
  const limit = typeof arg === "number" ? arg : Number(arg.limit ?? 25);
  const offset = typeof arg === "number" ? 0 : Number(arg.offset ?? 0);

  // Prefer the SQL signature: (limit_num int, offset_num int)
  let { data, error } = await supabaseBrowser.rpc("nt_public_leaderboard", {
    limit_num: limit,
    offset_num: offset,
  });

  // Backwards-compat fallback (older signature used `p_limit` / `p_offset`)
  if (error) {
    const alt = await supabaseBrowser.rpc("nt_public_leaderboard", {
      p_limit: limit,
      p_offset: offset,
    });
    data = alt.data;
    error = alt.error;
  }

  if (error) throw error;

  return (data ?? []).map((r: any, idx: number) => ({
    rank:
      typeof r.rank === "number"
        ? r.rank
        : Number.isFinite(r.rank)
        ? Number(r.rank)
        : idx + 1 + offset,
    user_id: String(r.user_id),
    display_name: String(r.display_name ?? "Trader"),
    avatar_url: (r.avatar_url ?? null) as string | null,
    tier: (r.tier ?? "Bronze") as TrophyTier,
    xp_total: Number(r.xp_total ?? 0),
    trophies_total: Number(r.trophies_total ?? 0),
  }));
}

export async function getPublicUserProfile(
  userId: string
): Promise<PublicUserProfile | null> {
  // Prefer SQL signature: (target_user uuid)
  let { data, error } = await supabaseBrowser.rpc("nt_public_user_profile", {
    target_user: userId,
  });

  // Backwards-compat fallback (older signature used `p_user_id`)
  if (error) {
    const alt = await supabaseBrowser.rpc("nt_public_user_profile", {
      p_user_id: userId,
    });
    data = alt.data;
    error = alt.error;
  }

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const xp = Number((row as any).xp_total ?? 0);

  return {
    user_id: String((row as any).user_id),
    display_name: String((row as any).display_name ?? "Trader"),
    avatar_url: ((row as any).avatar_url ?? null) as string | null,
    tier: ((row as any).tier ?? getTierFromXp(xp)) as TrophyTier,
    xp_total: xp,
    trophies_count: Number((row as any).trophies_count ?? 0),
    level: Number((row as any).level ?? getLevelFromXp(xp)),
  };
}

/**
 * Public user trophies — secure via RPC `nt_public_user_trophies`.
 * This returns *earned* trophies only (no locked/secret definitions).
 */
export async function listPublicUserTrophies(
  userId: string,
  limit: number = 200
): Promise<PublicUserTrophy[]> {
  if (!userId) return [];

  // Prefer SQL signature: (target_user uuid)
  let { data, error } = await supabaseBrowser.rpc("nt_public_user_trophies", {
    target_user: userId,
  });

  // Backwards-compat fallback (older signature used `p_user_id`)
  if (error) {
    const alt = await supabaseBrowser.rpc("nt_public_user_trophies", {
      p_user_id: userId,
    });
    data = alt.data;
    error = alt.error;
  }

  if (!error && data) {
    return (data ?? [])
      .map((r: any) => ({
      trophy_id: String(r.trophy_id),
      title: String(r.title ?? "Trophy"),
      description: String(r.description ?? ""),
      tier: (r.tier ?? "Bronze") as TrophyTier,
      xp: Number(r.xp ?? 0),
      category: String(r.category ?? "General"),
      icon: (r.icon ?? undefined) as string | undefined,
      earned_at: (r.earned_at ?? null) as string | null,
      }))
      .slice(0, Math.max(0, limit));
  }

  if (error) {
    console.warn(LOG, "listPublicUserTrophies rpc error (falling back):", error);
  }

  // Fallback: direct join (may fail if RLS is strict).
  try {
    const { data: rows, error: qErr } = await supabaseBrowser
      .from("user_trophies")
      .select(
        "trophy_id, earned_at, trophy_definitions ( id, title, description, tier, xp, category, icon )"
      )
      .eq("user_id", userId)
      .order("earned_at", { ascending: false });

    if (qErr) throw qErr;

    return (rows ?? [])
      .map((r: any) => {
      const def = r.trophy_definitions ?? {};
      return {
        trophy_id: String(r.trophy_id),
        title: String(def.title ?? "Trophy"),
        description: String(def.description ?? ""),
        tier: (def.tier ?? "Bronze") as TrophyTier,
        xp: Number(def.xp ?? 0),
        category: String(def.category ?? "General"),
        icon: (def.icon ?? undefined) as string | undefined,
        earned_at: (r.earned_at ?? null) as string | null,
      };
      })
      .slice(0, Math.max(0, limit));
  } catch (e) {
    console.error(LOG, "listPublicUserTrophies fallback error:", e);
    return [];
  }
}


export async function listMyTrophies(
  userId: string,
  limit = 200
): Promise<PublicUserTrophy[]> {
  return listPublicUserTrophies(userId, limit);
}

/* ===========================
   Rule counters (extend later)
   =========================== */

async function getUserTrophyCounters(userId: string): Promise<Record<string, number>> {
  // Journal entries: count distinct dates + compute best streak
  const { data: journalDays, error: journalErr } = await supabaseBrowser
    .from("journal_entries")
    .select("date")
    .eq("user_id", userId);

  if (journalErr) {
    // If table is not present in some environments, return safe defaults
    console.warn("[Trophies] journal_entries query failed:", journalErr);
  }

  const dates = (journalDays ?? [])
    .map((r: any) => String(r.date))
    .filter(Boolean);

  const uniqueDates = Array.from(new Set(dates)).sort(); // YYYY-MM-DD lex sort is ok

  const days_logged = uniqueDates.length;
  const best_streak = computeBestStreak(uniqueDates);

  // Growth plan created?
  // Support multiple table names used across NeuroTraderJournal versions.
  const plan_created = await (async () => {
    const candidates: Array<{ table: string; userCol: string }> = [
      { table: "ntj_growth_plans", userCol: "user_id" },
      { table: "growth_plans", userCol: "user_id" },
      { table: "growth_plan", userCol: "user_id" },
      { table: "cash_flow_plans", userCol: "user_id" },
      { table: "cash_flow_plan", userCol: "user_id" },
      { table: "plan", userCol: "user_id" },
    ];

    for (const c of candidates) {
      try {
        const { data, error } = await supabaseBrowser
          .from(c.table)
          .select("id")
          .eq(c.userCol, userId)
          .limit(1);

        if (error) continue;
        if (data && data.length > 0) return 1;
      } catch {
        // ignore
      }
    }

    return 0;
  })();

  // Challenges completed
  const { data: completedChallenges, error: chErr } = await supabaseBrowser
    .from("challenge_progress")
    .select("challenge_id")
    .eq("user_id", userId)
    .eq("status", "completed");

  if (chErr) {
    console.warn("[Trophies] challenge_progress query failed:", chErr);
  }

  const challenges_completed = (completedChallenges ?? []).length;

  return {
    days_logged,
    best_streak,
    plan_created,
    challenges_completed,
  };
}

function computeBestStreak(sortedDates: string[]): number {
  if (!sortedDates.length) return 0;

  const toDay = (s: string) => {
    // s is YYYY-MM-DD
    const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
    // Use UTC to avoid timezone drift
    return Date.UTC(y, (m || 1) - 1, d || 1) / 86400000;
  };

  const days = sortedDates.map(toDay);

  let best = 1;
  let cur = 1;

  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) {
      cur += 1;
      best = Math.max(best, cur);
    } else if (days[i] === days[i - 1]) {
      // same day (duplicate) — ignore
      continue;
    } else {
      cur = 1;
    }
  }

  return best;
}
