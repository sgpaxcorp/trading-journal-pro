export type TrophyTier = "Bronze" | "Silver" | "Gold" | "Elite";
export type TrophyRuleOp = "gte" | "eq" | "lte";

export type TrophySeedDefinition = {
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

export const TROPHY_COUNTER_ALIASES: Record<string, string[]> = {
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
  daily_goal_reached: [
    "daily_goals_reached",
    "daily_goal_hits",
    "goal_days_hit",
  ],
  weekly_goal_reached: [
    "weekly_goals_reached",
    "weekly_goal_hits",
  ],
  monthly_goal_reached: [
    "monthly_goals_reached",
    "monthly_goal_hits",
  ],
  quarterly_goal_reached: [
    "quarter_goals_reached",
    "quarterly_goals_reached",
    "quarterly_goal_hits",
  ],
};

export const BASE_TROPHY_DEFINITIONS: TrophySeedDefinition[] = [
  {
    id: "0d6bd35f-cae7-4b67-a79b-41fd77f30ff1",
    title: "Blueprint Initiated",
    description: "Create your first Growth Plan.",
    tier: "Bronze",
    xp: 100,
    category: "Growth Plan",
    rule_key: "plan_created",
    rule_op: "gte",
    rule_value: 1,
    icon: "/Bronze_Trophy.svg",
  },
  {
    id: "6494a0bd-cd53-4166-968e-19bcdd0efe38",
    title: "First Log",
    description: "Log your first trading day in the journal.",
    tier: "Bronze",
    xp: 50,
    category: "Journal",
    rule_key: "days_logged",
    rule_op: "gte",
    rule_value: 1,
    icon: "/Bronze_Trophy.svg",
  },
  {
    id: "ab33d291-ef9f-48ff-8ab2-c3e19de4b07b",
    title: "Five-Day Tape",
    description: "Log 5 trading days.",
    tier: "Bronze",
    xp: 120,
    category: "Journal",
    rule_key: "days_logged",
    rule_op: "gte",
    rule_value: 5,
    icon: "/Bronze_Trophy.svg",
  },
  {
    id: "d6517b9a-d5d5-4164-a8b1-ec38fe91c52a",
    title: "Desk Habit",
    description: "Log 20 trading days.",
    tier: "Silver",
    xp: 300,
    category: "Journal",
    rule_key: "days_logged",
    rule_op: "gte",
    rule_value: 20,
    icon: "/Silver_Trophy.svg",
  },
  {
    id: "a357a1bf-45d4-46d5-bcae-8bc2fcd5d146",
    title: "Three-Day Rhythm",
    description: "Reach a journaling streak of 3 days.",
    tier: "Bronze",
    xp: 140,
    category: "Consistency",
    rule_key: "best_streak",
    rule_op: "gte",
    rule_value: 3,
    icon: "/Bronze_Trophy.svg",
  },
  {
    id: "d18ebc31-7f89-4bc8-b005-562806ea6b47",
    title: "Locked-In Week",
    description: "Reach a journaling streak of 7 days.",
    tier: "Silver",
    xp: 320,
    category: "Consistency",
    rule_key: "best_streak",
    rule_op: "gte",
    rule_value: 7,
    icon: "/Silver_Trophy.svg",
  },
  {
    id: "f6576119-d0cd-43b4-a3d3-94d52d880a0d",
    title: "Process Fortnight",
    description: "Reach a journaling streak of 14 days.",
    tier: "Gold",
    xp: 650,
    category: "Consistency",
    rule_key: "best_streak",
    rule_op: "gte",
    rule_value: 14,
    icon: "/Gold_Trophy.svg",
  },
  {
    id: "d9be2c17-3cab-42b5-a0cb-f33f7dc7446f",
    title: "Challenge Finisher",
    description: "Complete your first challenge run.",
    tier: "Silver",
    xp: 350,
    category: "Challenges",
    rule_key: "challenges_completed",
    rule_op: "gte",
    rule_value: 1,
    icon: "/Silver_Trophy.svg",
  },
  {
    id: "6145d7d8-c021-4275-a5b8-73898e3890b1",
    title: "Challenge Closer",
    description: "Complete 3 challenge runs.",
    tier: "Gold",
    xp: 900,
    category: "Challenges",
    rule_key: "challenges_completed",
    rule_op: "gte",
    rule_value: 3,
    icon: "/Gold_Trophy.svg",
  },
  {
    id: "6637b8f4-a7da-40d1-a053-e0f9d6ccbe89",
    title: "Daily Objective Hit",
    description: "Reach your daily goal once.",
    tier: "Bronze",
    xp: 120,
    category: "Goals",
    rule_key: "daily_goal_reached",
    rule_op: "gte",
    rule_value: 1,
    icon: "/Bronze_Trophy.svg",
  },
  {
    id: "3a27e367-b313-40e7-a54c-cdf0f28258e6",
    title: "Daily Closer",
    description: "Reach your daily goal 5 times.",
    tier: "Silver",
    xp: 280,
    category: "Goals",
    rule_key: "daily_goal_reached",
    rule_op: "gte",
    rule_value: 5,
    icon: "/Silver_Trophy.svg",
  },
  {
    id: "a0ef5fb1-2dc8-4244-bca0-9f52d4cc9aca",
    title: "Weekly Checkpoint Cleared",
    description: "Reach your weekly goal once.",
    tier: "Silver",
    xp: 400,
    category: "Goals",
    rule_key: "weekly_goal_reached",
    rule_op: "gte",
    rule_value: 1,
    icon: "/Silver_Trophy.svg",
  },
  {
    id: "16719ba4-f6a4-4dc6-b716-8dbdadd29759",
    title: "Monthly Pace Keeper",
    description: "Reach your weekly goal 4 times.",
    tier: "Gold",
    xp: 900,
    category: "Goals",
    rule_key: "weekly_goal_reached",
    rule_op: "gte",
    rule_value: 4,
    icon: "/Gold_Trophy.svg",
  },
  {
    id: "385fb89c-ad97-4d68-b780-e8d86d4d4530",
    title: "Monthly Target Locked",
    description: "Reach your monthly goal once.",
    tier: "Gold",
    xp: 1200,
    category: "Goals",
    rule_key: "monthly_goal_reached",
    rule_op: "gte",
    rule_value: 1,
    icon: "/Gold_Trophy.svg",
  },
  {
    id: "b8f299b0-c175-462e-8f6f-a96a4b2b7e5f",
    title: "Quarter Architect",
    description: "Reach your quarter goal once.",
    tier: "Elite",
    xp: 2500,
    category: "Goals",
    rule_key: "quarterly_goal_reached",
    rule_op: "gte",
    rule_value: 1,
    icon: "/Elite_Trophy.svg",
  },
];

export function normalizeRuleKey(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function normalizeRuleOp(raw: unknown): TrophyRuleOp {
  const op = String(raw ?? "").trim().toLowerCase();
  if (op === "eq" || op === "=") return "eq";
  if (op === "lte" || op === "<=") return "lte";
  return "gte";
}

export function applyCounterAliases(input: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...input };

  for (const [base, aliases] of Object.entries(TROPHY_COUNTER_ALIASES)) {
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

export function computeBestStreak(sortedDates: string[]): number {
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

export function describeTrophyUnlock(ruleKey: string, ruleValue: number, fallback: string): string {
  const value = Number(ruleValue || 0);

  switch (normalizeRuleKey(ruleKey)) {
    case "days_logged":
      return `Log ${value} trading day${value === 1 ? "" : "s"} in your journal.`;
    case "best_streak":
      return `Reach a journaling streak of ${value} day${value === 1 ? "" : "s"}.`;
    case "plan_created":
      return "Create your Growth Plan.";
    case "challenges_completed":
      return `Complete ${value} challenge run${value === 1 ? "" : "s"}.`;
    case "daily_goal_reached":
      return `Reach your daily goal ${value} time${value === 1 ? "" : "s"}.`;
    case "weekly_goal_reached":
      return `Reach your weekly goal ${value} time${value === 1 ? "" : "s"}.`;
    case "monthly_goal_reached":
      return `Reach your monthly goal ${value} time${value === 1 ? "" : "s"}.`;
    case "quarterly_goal_reached":
      return `Reach your quarter goal ${value} time${value === 1 ? "" : "s"}.`;
    default:
      return fallback;
  }
}

export async function ensureBaseTrophyDefinitions(supabase: any): Promise<void> {
  const payload = BASE_TROPHY_DEFINITIONS.map((def) => ({
    id: def.id,
    title: def.title,
    description: def.description,
    tier: def.tier,
    xp: def.xp,
    category: def.category,
    rule_key: def.rule_key,
    rule_op: def.rule_op,
    rule_value: def.rule_value,
    icon: def.icon ?? null,
  }));

  const { error } = await supabase.from("trophy_definitions").upsert(payload, {
    onConflict: "id",
    ignoreDuplicates: false,
  });

  if (error) {
    throw error;
  }
}
