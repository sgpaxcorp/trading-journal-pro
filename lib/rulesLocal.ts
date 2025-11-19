export type Rule = {
  id: string;
  name: string;
  trigger: "daily_checkpoint" | "trade_closed";
  condition: { kind: "dd_pct" | "gap_to_goal_pct"; threshold: number }; // MVP
  action: "alert";               // MVP
  enabled: boolean;
};

const KEY = "tjp_rules_v1";

export function getRules(): Rule[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(KEY) || "[]");
}
export function saveRules(r: Rule[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(r));
}
