import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export const runtime = "nodejs";

type TrophyTier = "Bronze" | "Silver" | "Gold" | "Elite";
type TrophyRuleOp = "gte" | "eq" | "lte";

type TrophyDefinition = {
  id: string;
  title: string;
  description: string;
  tier: TrophyTier;
  xp: number;
  category: string;
  rule_key: string;
  rule_op: TrophyRuleOp;
  rule_value: number;
  icon?: string | null;
};

function normalizeRuleKey(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function normalizeRuleOp(raw: unknown): TrophyRuleOp {
  const op = String(raw ?? "").trim().toLowerCase();
  if (op === "eq" || op === "=") return "eq";
  if (op === "lte" || op === "<=") return "lte";
  return "gte";
}

const COUNTER_ALIASES: Record<string, string[]> = {
  plan_created: [
    "growth_plan_created",
    "growth_plan_saved",
    "growth_plan_complete",
    "growth_plan_completed",
    "growth_plan_uploaded",
    "growth_plan_upload",
    "growth_plan_done",
    "plan_created",
    "plan_saved",
    "plan_complete",
    "plan_completed",
    "plan_uploaded",
    "plan_upload",
    "plan_done",
  ],
  days_logged: [
    "journal_days",
    "journaling_days",
    "days_in_journal",
    "days_traded",
    "trading_days",
    "trading_days_logged",
    "journal_entries",
    "journal_days_logged",
    "days_journaled",
  ],
  best_streak: [
    "journal_streak",
    "streak",
    "streak_best",
    "best_streak_days",
    "longest_streak",
    "streak_days",
  ],
  challenges_completed: [
    "challenge_completed",
    "completed_challenges",
    "challenges_done",
    "challenges_finished",
  ],
};

function applyCounterAliases(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...input };

  for (const [base, aliases] of Object.entries(COUNTER_ALIASES)) {
    const baseKey = normalizeRuleKey(base);
    const baseValue = Number(out[baseKey] ?? out[base] ?? 0);

    out[baseKey] = baseValue;
    out[base] = baseValue;

    for (const alias of aliases) {
      const key = normalizeRuleKey(alias);
      if (out[key] == null) out[key] = baseValue;
      if (out[alias] == null) out[alias] = baseValue;
    }
  }

  return out;
}

function getTierFromXp(xp: number): TrophyTier {
  if (xp >= 5000) return "Elite";
  if (xp >= 2500) return "Gold";
  if (xp >= 1000) return "Silver";
  return "Bronze";
}

function getLevelFromXp(xp: number): number {
  return Math.max(1, Math.floor(xp / 500) + 1);
}

function computeBestStreak(sortedDates: string[]): number {
  if (!sortedDates.length) return 0;

  const toDay = (s: string) => {
    const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
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
      continue;
    } else {
      cur = 1;
    }
  }

  return best;
}

async function listTrophyDefinitions(): Promise<TrophyDefinition[]> {
  const selectFull =
    "id, title, description, tier, xp, category, rule_key, rule_op, rule_value, icon, secret";
  const selectMinimal =
    "id, title, description, tier, xp, category, rule_key, rule_op, rule_value, icon";

  let data: any[] | null = null;
  let error: any = null;

  {
    const res = await supabaseAdmin.from("trophy_definitions").select(selectFull).order("xp", { ascending: true });
    data = res.data as any[] | null;
    error = res.error;
  }

  if (
    error &&
    (error.code === "42703" ||
      String(error.message || "").toLowerCase().includes("does not exist"))
  ) {
    const res2 = await supabaseAdmin.from("trophy_definitions").select(selectMinimal).order("xp", { ascending: true });
    data = res2.data as any[] | null;
    error = res2.error;
  }

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: String(r.id),
    title: String(r.title ?? "Trophy"),
    description: String(r.description ?? ""),
    tier: (r.tier ?? "Bronze") as TrophyTier,
    xp: Number(r.xp ?? 0),
    category: String(r.category ?? "General"),
    rule_key: normalizeRuleKey(r.rule_key ?? ""),
    rule_op: normalizeRuleOp(r.rule_op ?? "gte"),
    rule_value: Number(r.rule_value ?? 0),
    icon: (r.icon ?? null) as string | null,
  }));
}

async function getUserTrophyCounters(userId: string, email?: string | null) {
  let journalDays: any[] | null = null;
  let journalErr: any = null;

  {
    const res = await supabaseAdmin
      .from("journal_entries")
      .select("date")
      .eq("user_id", userId);
    journalDays = res.data as any[] | null;
    journalErr = res.error;
  }

  if ((!journalDays || journalDays.length === 0) && email) {
    try {
      const alt = await supabaseAdmin
        .from("journal_entries")
        .select("date")
        .eq("user_id", email);
      if (!alt.error && alt.data) {
        journalDays = alt.data as any[];
        journalErr = null;
      }
    } catch {
      // ignore
    }
  }

  if (journalErr) {
    console.warn("[trophies/sync] journal_entries query failed:", journalErr);
  }

  const dates = (journalDays ?? [])
    .map((r: any) => String(r.date))
    .filter(Boolean);

  const uniqueDates = Array.from(new Set(dates)).sort();
  const days_logged = uniqueDates.length;
  const best_streak = computeBestStreak(uniqueDates);

  const plan_created = await (async () => {
    const tables = [
      "ntj_growth_plans",
      "growth_plans",
      "growth_plan",
      "cash_flow_plans",
      "cash_flow_plan",
      "plan",
    ];
    const userCols = ["user_id", "userId", "uid", "user_uid"];
    const ids = [userId, email || ""].filter(Boolean);

    for (const table of tables) {
      for (const col of userCols) {
        for (const id of ids) {
          try {
            const { data, error } = await supabaseAdmin
              .from(table)
              .select("id")
              .eq(col, id)
              .limit(1);
            if (error) continue;
            if (data && data.length > 0) return 1;
          } catch {
            // ignore
          }
        }
      }
    }
    return 0;
  })();

  const { data: completedChallenges, error: chErr } = await supabaseAdmin
    .from("challenge_progress")
    .select("challenge_id")
    .eq("user_id", userId)
    .eq("status", "completed");

  if (chErr) {
    console.warn("[trophies/sync] challenge_progress query failed:", chErr);
  }

  const challenges_completed = (completedChallenges ?? []).length;

  const counters = {
    days_logged,
    best_streak,
    plan_created,
    challenges_completed,
    // aliases for compatibility
    growth_plan_created: plan_created,
    growth_plan: plan_created,
    plan_saved: plan_created,
    journal_days: days_logged,
    trading_days_logged: days_logged,
    streak_best: best_streak,
  };

  return applyCounterAliases(counters);
}

function createUserClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

async function computeUserTotals(userId: string) {
  let trophyXp = 0;
  let trophyCount = 0;

  try {
    const { data, error } = await supabaseAdmin
      .from("user_trophies")
      .select("trophy_id, trophy_definitions(xp)")
      .eq("user_id", userId);

    if (!error && Array.isArray(data)) {
      const unique = new Set<string>();
      for (const row of data) {
        const id = String((row as any)?.trophy_id ?? "");
        if (!id) continue;
        if (!unique.has(id)) {
          unique.add(id);
          trophyCount += 1;
        }
        const xp = Number((row as any)?.trophy_definitions?.xp ?? 0);
        if (Number.isFinite(xp)) trophyXp += xp;
      }
    }
  } catch {
    // ignore
  }

  let challengeXp = 0;
  try {
    const { data, error } = await supabaseAdmin
      .from("challenge_runs")
      .select("xp_earned")
      .eq("user_id", userId);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const xp = Number((row as any)?.xp_earned ?? 0);
        if (Number.isFinite(xp)) challengeXp += xp;
      }
    }
  } catch {
    // ignore
  }

  const xp_total = trophyXp + challengeXp;
  const level = getLevelFromXp(xp_total);
  const tier = getTierFromXp(xp_total);

  return { xp_total, trophyXp, challengeXp, trophyCount, level, tier };
}

async function updateProfileSnapshots(userId: string) {
  if (!userId) return;

  const totals = await computeUserTotals(userId);

  // Update profile_gamification (best-effort; may not exist or have different columns)
  try {
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("profile_gamification")
      .select("badges")
      .eq("user_id", userId)
      .maybeSingle();

    if (!selErr) {
      const badges = Array.isArray((existing as any)?.badges)
        ? (existing as any).badges
        : [];

      await supabaseAdmin
        .from("profile_gamification")
        .upsert(
          {
            user_id: userId,
            xp: totals.xp_total,
            level: totals.level,
            tier: totals.tier,
            badges,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
    }
  } catch {
    // ignore
  }

  // Update profiles snapshot (best-effort; columns may vary by deployment)
  const profilePayloads = [
    {
      xp_total: totals.xp_total,
      trophies_count: totals.trophyCount,
      level: totals.level,
      tier: totals.tier,
    },
    {
      xp_total: totals.xp_total,
      trophies_total: totals.trophyCount,
      level: totals.level,
      tier: totals.tier,
    },
    {
      xp: totals.xp_total,
      trophies_count: totals.trophyCount,
      level: totals.level,
      tier: totals.tier,
    },
  ];

  for (const payload of profilePayloads) {
    try {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(payload as any)
        .eq("id", userId);
      if (!error) break;
    } catch {
      // ignore and try next payload
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ inserted: 0, newTrophies: [] }, { status: 401 });

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return NextResponse.json({ inserted: 0, newTrophies: [] }, { status: 401 });
    }

    const userId = authData.user.id;
    const email = authData.user.email || null;

    const newTrophies: any[] = [];
    const seen = new Set<string>();

    let rpcWorked = false;
    let rpcInserted = 0;

    // 1) Try the native RPC (if present). It also updates profile snapshots in some deployments.
    try {
      const supabaseUser = createUserClient(token);
      const { data: rpcData, error: rpcErr } = await supabaseUser.rpc("nt_award_trophies");
      if (!rpcErr) {
        rpcWorked = true;
        rpcInserted = Number((rpcData as any)?.new_trophies ?? 0);

        if (rpcInserted > 0) {
          const { data: recent } = await supabaseAdmin
            .from("user_trophies")
            .select(
              "trophy_id, earned_at, trophy_definitions(id, title, description, tier, xp, category, icon)"
            )
            .eq("user_id", userId)
            .order("earned_at", { ascending: false })
            .limit(rpcInserted);

          for (const row of recent || []) {
            const def = (row as any).trophy_definitions ?? {};
            const tid = String((row as any).trophy_id ?? "");
            if (!tid || seen.has(tid)) continue;
            seen.add(tid);
            newTrophies.push({
              trophy_id: tid,
              title: String(def.title ?? "Trophy"),
              description: String(def.description ?? ""),
              tier: (def.tier ?? "Bronze") as TrophyTier,
              xp: Number(def.xp ?? 0),
              category: String(def.category ?? "General"),
              icon: (def.icon ?? null) as string | null,
              earned_at: (row as any).earned_at ? String((row as any).earned_at) : null,
            });
          }
        }
      }
    } catch {
      // ignore and fall back to manual sync
    }

    // 2) Manual fallback if RPC is missing or returns nothing.
    if (!rpcWorked || rpcInserted === 0) {
      const defs = await listTrophyDefinitions();

      const { data: earnedRows, error: earnedErr } = await supabaseAdmin
        .from("user_trophies")
        .select("trophy_id")
        .eq("user_id", userId);

      if (earnedErr) throw earnedErr;

      const earnedSet = new Set<string>(
        (earnedRows ?? []).map((r: any) => String(r.trophy_id))
      );
      const counters = await getUserTrophyCounters(userId, email);

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

      if (newlyEarned.length) {
        const insertPayload = newlyEarned.map((d) => ({
          user_id: userId,
          trophy_id: d.id,
          earned_at: new Date().toISOString(),
        }));

        const { error: insErr } = await supabaseAdmin
          .from("user_trophies")
          .insert(insertPayload, { defaultToNull: false });

        if (insErr && !String(insErr.message || "").toLowerCase().includes("duplicate")) {
          throw insErr;
        }

        const { data: joined, error: joinedErr } = await supabaseAdmin
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

        for (const row of joined || []) {
          const def = (row as any).trophy_definitions ?? {};
          const tid = String((row as any).trophy_id ?? "");
          if (!tid || seen.has(tid)) continue;
          seen.add(tid);
          newTrophies.push({
            trophy_id: tid,
            title: String(def.title ?? "Trophy"),
            description: String(def.description ?? ""),
            tier: (def.tier ?? "Bronze") as TrophyTier,
            xp: Number(def.xp ?? 0),
            category: String(def.category ?? "General"),
            icon: (def.icon ?? null) as string | null,
            earned_at: (row as any).earned_at ? String((row as any).earned_at) : null,
          });
        }
      }
    }

    // 3) Refresh profile snapshots for ranking/XP totals.
    await updateProfileSnapshots(userId);

    return NextResponse.json({ inserted: newTrophies.length, newTrophies });
  } catch (err: any) {
    console.error("[trophies/sync] error:", err);
    return NextResponse.json(
      { inserted: 0, newTrophies: [], error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
