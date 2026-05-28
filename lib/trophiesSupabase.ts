import { supabaseBrowser } from "@/lib/supaBaseClient";
import {
  describeTrophyUnlock,
  normalizeRuleKey,
  normalizeRuleOp,
  type TrophyRuleOp,
} from "@/lib/trophyCatalog";

const LOG = "[trophiesSupabase]";

export type TrophyTier = "Bronze" | "Silver" | "Gold" | "Elite";

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
  rank?: number | null;
  show_in_ranking?: boolean;
};

export type TrophySyncResult = {
  inserted: number;
  newTrophies?: PublicUserTrophy[];
};

const TIER_ICON_MAP: Record<string, string> = {
  elite: "/Elite_Trophy.svg",
  gold: "/Gold_Trophy.svg",
  silver: "/Silver_Trophy.svg",
  bronze: "/Bronze_Trophy.svg",
};

export function tierIconPath(tier?: TrophyTier | string | null): string {
  const t = String(tier ?? "bronze").toLowerCase();
  return TIER_ICON_MAP[t] ?? "/Bronze_Trophy.svg";
}

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
  return describeTrophyUnlock(def.rule_key, def.rule_value, def.description);
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
    rule_key: normalizeRuleKey(r.rule_key ?? ""),
    rule_op: normalizeRuleOp(r.rule_op ?? "gte"),
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

  // Prefer server-side sync to bypass RLS in production.
  if (typeof window !== "undefined") {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { inserted: 0, newTrophies: [] };

    const res = await fetch("/api/trophies/sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(String((body as any)?.error || "Trophy sync failed"));
    }

    return {
      inserted: Number((body as any)?.inserted ?? 0),
      newTrophies: Array.isArray((body as any)?.newTrophies)
        ? (body as any).newTrophies
        : [],
    };
  }

  return { inserted: 0, newTrophies: [] };
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

  return (data ?? []).map((r: any, idx: number) => {
    const rawRank = Number(r.rank);
    return {
      rank: Number.isFinite(rawRank) && rawRank > 0 ? rawRank : idx + 1 + offset,
      user_id: String(r.user_id),
      display_name: String(r.display_name ?? "Trader"),
      avatar_url: (r.avatar_url ?? null) as string | null,
      tier: (r.tier ?? "Bronze") as TrophyTier,
      xp_total: Number(r.xp_total ?? 0),
      trophies_count: Number(
        r.trophies_count ?? r.trophies_total ?? r.trophies ?? 0
      ),
    };
  });
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
    trophies_count: Number((row as any).trophies_count ?? (row as any).trophies_total ?? 0),
    level: Number((row as any).level ?? getLevelFromXp(xp)),
    rank: Number.isFinite(Number((row as any).rank)) && Number((row as any).rank) > 0
      ? Number((row as any).rank)
      : null,
    show_in_ranking: Boolean((row as any).show_in_ranking ?? false),
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
