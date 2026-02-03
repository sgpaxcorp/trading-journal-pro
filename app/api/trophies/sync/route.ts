import { NextRequest, NextResponse } from "next/server";
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

  return {
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
    const defs = await listTrophyDefinitions();

    const { data: earnedRows, error: earnedErr } = await supabaseAdmin
      .from("user_trophies")
      .select("trophy_id")
      .eq("user_id", userId);

    if (earnedErr) throw earnedErr;

    const earnedSet = new Set<string>((earnedRows ?? []).map((r: any) => String(r.trophy_id)));
    const counters = await getUserTrophyCounters(userId, authData.user.email);

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

    if (!newlyEarned.length) {
      return NextResponse.json({ inserted: 0, newTrophies: [] });
    }

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
      .select("trophy_id, earned_at, trophy_definitions(id, title, description, tier, xp, category, icon)")
      .eq("user_id", userId)
      .in("trophy_id", newlyEarned.map((d) => d.id));

    if (joinedErr) throw joinedErr;

    const newTrophies = (joined ?? []).map((row: any) => {
      const def = row.trophy_definitions ?? {};
      return {
        trophy_id: String(row.trophy_id),
        title: String(def.title ?? "Trophy"),
        description: String(def.description ?? ""),
        tier: (def.tier ?? "Bronze") as TrophyTier,
        xp: Number(def.xp ?? 0),
        category: String(def.category ?? "General"),
        icon: (def.icon ?? null) as string | null,
        earned_at: (row.earned_at ?? null) as string | null,
      };
    });

    return NextResponse.json({ inserted: newTrophies.length, newTrophies });
  } catch (err: any) {
    console.error("[trophies/sync] error:", err);
    return NextResponse.json(
      { inserted: 0, newTrophies: [], error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
