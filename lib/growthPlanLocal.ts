export type GrowthPlan = {
  startingBalance: number;
  targetBalance: number;
  // Alias: cualquiera de los dos puede existir
  dailyTargetPct?: number;     // nuevo nombre
  dailyGoalPercent?: number;   // nombre antiguo
  maxDailyLossPercent: number;
  tradingDays: number;
  maxOnePercentLossDays?: number;
  createdAt: string; // ISO
};

const KEY = "tjp_growth_plan_v1";

export function getGrowthPlan(): GrowthPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GrowthPlan) : null;
  } catch {
    return null;
  }
}

export function saveGrowthPlan(p: GrowthPlan) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(p));
}
