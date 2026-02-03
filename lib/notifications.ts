"use client";

import { supabaseBrowser } from "@/lib/supaBaseClient";
import { tierIconPath } from "@/lib/trophiesSupabase";

/**
 * Trophy sync request (client).
 *
 * Calls Postgres function `public.nt_award_trophies()` which:
 * - Computes trophies for the current user
 * - Inserts into user_trophies (upsert)
 * - Updates profile_gamification (xp, level, tier)
 * - Returns how many NEW trophies were awarded
 */
export async function requestTrophySync(): Promise<{
  ok: boolean;
  newTrophies?: number;
  error?: string;
}> {
  const { data, error } = await supabaseBrowser.rpc("nt_award_trophies");
  if (error) return { ok: false, error: error.message };
  const count = Number((data as any)?.new_trophies ?? 0);
  return { ok: true, newTrophies: count };
}

export type EarnedTrophyNotification = {
  /** unique id for client de-dupe */
  id: string;
  user_id: string;
  trophy_id: string;
  title: string;
  description: string;
  tier: string;
  xp: number;
  icon?: string | null;
  category?: string | null;
  earned_at: string;
};

async function fetchTrophyDefinition(trophyId: string): Promise<{
  title?: string | null;
  description?: string | null;
  tier?: string | null;
  xp?: number | null;
  icon?: string | null;
  category?: string | null;
} | null> {
  const { data, error } = await supabaseBrowser
    .from("trophy_definitions")
    .select("id,title,description,tier,xp,icon,category")
    .eq("id", trophyId)
    .maybeSingle();

  if (error) return null;
  return (data as any) ?? null;
}

function toNotification(userId: string, trophyId: string, earnedAt: string | null | undefined, def: any): EarnedTrophyNotification {
  const tier = String(def?.tier ?? "Bronze");
  return {
    id: `${userId}:${trophyId}`,
    user_id: userId,
    trophy_id: trophyId,
    title: String(def?.title ?? trophyId),
    description: String(def?.description ?? ""),
    tier,
    xp: Number(def?.xp ?? 0),
    icon: tierIconPath(tier),
    category: (def?.category ?? null) as any,
    earned_at: String(earnedAt ?? new Date().toISOString()),
  };
}

/**
 * Fetch recently earned trophies for a user.
 *
 * Used by GlobalRealtimeNotifications to:
 * - show a small backlog (e.g., trophies awarded while the user was offline)
 * - avoid missing awards when trophy sync inserts multiple rows at once
 */
export async function fetchRecentEarnedTrophies(
  userId: string,
  opts?: { limit?: number; since?: string }
): Promise<{ ok: boolean; trophies: EarnedTrophyNotification[]; error?: string }> {
  const limit = Math.max(1, Math.min(50, opts?.limit ?? 12));

  // Prefer the public RPC if present (it already joins trophy_definitions)
  // but fall back to a join query if the RPC isn't available.
  try {
    let { data, error } = await supabaseBrowser.rpc("nt_public_user_trophies", {
      target_user: userId,
    });

    if (error) {
      const alt = await supabaseBrowser.rpc("nt_public_user_trophies", {
        p_user_id: userId,
      });
      data = alt.data;
      error = alt.error;
    }

    if (!error && Array.isArray(data)) {
      const rows = data as any[];
      const filtered = opts?.since
        ? rows.filter((r) => String(r.earned_at ?? "") > String(opts.since))
        : rows;

      const sorted = filtered.sort((a, b) => String(b.earned_at ?? "").localeCompare(String(a.earned_at ?? "")));
      const sliced = sorted.slice(0, limit);

      return {
        ok: true,
        trophies: sliced.map((r) =>
          toNotification(userId, String(r.trophy_id), r.earned_at, r)
        ),
      };
    }
  } catch {
    // ignore and try join query
  }

  // Fallback: join user_trophies -> trophy_definitions
  const q = supabaseBrowser
    .from("user_trophies")
    .select(
      "trophy_id,earned_at,trophy_definitions(id,title,description,tier,xp,icon,category)"
    )
    .eq("user_id", userId)
    .order("earned_at", { ascending: false })
    .limit(limit);

  if (opts?.since) {
    q.gt("earned_at", opts.since);
  }

  const { data, error } = await q;

  if (error) {
    return { ok: false, trophies: [], error: error.message };
  }

  const trophies: EarnedTrophyNotification[] = (data ?? []).map((row: any) => {
    const def = row?.trophy_definitions ?? {};
    return toNotification(userId, String(row.trophy_id), row.earned_at, def);
  });

  return { ok: true, trophies };
}

/**
 * Subscribe to new trophy awards (INSERT into `public.user_trophies`) for the current user.
 *
 * NOTE: Supabase Realtime requires the table to be enabled for replication. If not,
 * GlobalRealtimeNotifications still works because it periodically calls fetchRecentEarnedTrophies.
 */
export function subscribeToTrophyNotifications(
  userId: string,
  onEarned: (trophy: EarnedTrophyNotification) => void
): { unsubscribe: () => void } {
  if (!userId) {
    return { unsubscribe: () => {} };
  }

  const channel = supabaseBrowser
    .channel(`ntj-trophies-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "user_trophies",
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        try {
          const trophyId = String((payload as any)?.new?.trophy_id ?? "");
          const earnedAt = (payload as any)?.new?.earned_at as string | undefined;
          if (!trophyId) return;

          const def = (await fetchTrophyDefinition(trophyId)) ?? {
            title: trophyId,
            description: "",
            tier: "Bronze",
            xp: 0,
            icon: null,
            category: null,
          };

          onEarned(toNotification(userId, trophyId, earnedAt, def));
        } catch {
          // ignore
        }
      }
    )
    .subscribe();

  return {
    unsubscribe: () => {
      try {
        supabaseBrowser.removeChannel(channel);
      } catch {
        // ignore
      }
    },
  };
}
