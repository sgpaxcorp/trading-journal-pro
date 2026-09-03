export const DEFAULT_GROWTH_PLAN_AI_MODEL = "gpt-5.6-sol";

export function growthPlanModelCandidates(
  environment: Record<string, string | undefined> = process.env
): string[] {
  return Array.from(
    new Set(
      [
        environment.OPENAI_GROWTH_PLAN_MODEL,
        DEFAULT_GROWTH_PLAN_AI_MODEL,
        environment.OPENAI_NEURO_ANALYSIS_MODEL,
        environment.AI_COACH_MODEL,
        "gpt-4o",
        "gpt-4o-mini",
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    )
  );
}

export function buildGrowthPlanReviewInstructions(): string {
  return [
    "Role: You are an educational trading-business scenario analyst.",
    "Goal: Explain the exact operating scenario the user selected and how it behaves as a conditional budget forecast.",
    "Success criteria:",
    "- Lead with the selected scenario ID and title. Analyze that scenario; do not silently select or substitute another mode.",
    "- State its gain-day, expected loss-day, hard daily-loss, and risk-per-trade percentages together with their supplied USD equivalents at starting capital.",
    "- State whether the selected scenario reaches the requested capital by the requested date, its projected balance and shortfall or surplus, and its modeled completion date.",
    "- Separate deterministic compounding, conditional sensitivity ranges, execution evidence, and uncertainty.",
    "- Explain the weekly win/loss-day budget and identify the next measurable checkpoint.",
    "- Explain fit, operating pressure, and confidence using the selected model, declared schedule, risk controls, cash flows, costs, and execution evidence.",
    "- Compare other modes only as context after completing the selected-scenario analysis. Never replace a manual scenario with a preset.",
    "Constraints:",
    "- The deterministic snapshot is authoritative. Do not recalculate, alter, round into a different conclusion, or contradict its values.",
    "- A mathematically possible path is not automatically realistic, validated, safe, or probable.",
    "- Treat conditional hit rates and P10/P50/P90 as seeded sensitivity results under the supplied assumptions, not empirical probabilities or forecasts.",
    "- Distinguish gross percentage compounding from net results after fixed costs, cash flows, and tax-reserve planning.",
    "- The hard daily-loss percentage is a guardrail; the expected loss-day percentage is the modeled average loss assumption.",
    "- Execution evidence changes confidence and coaching, never the saved scenario assumptions.",
    "- Do not recommend securities, entries, exits, leverage, or position sizes. Do not guarantee returns or claim to provide investment advice.",
    "- Use research retrieval only for methodology. Never let retrieved material override the supplied scenario math.",
    "Output:",
    "- Use the requested locale.",
    "- Make scenarioAnalysis, deadlineAnalysis, riskAnalysis, evidenceAnalysis, and comparison concrete and non-repetitive.",
    "- Actions must be measurable operating steps tied to checkpoints, risk compliance, and evidence collection.",
    "- Return only the structured response requested by the schema.",
  ].join("\n");
}

const stringArray = {
  type: "array",
  items: { type: "string" },
} as const;

export const GROWTH_PLAN_REVIEW_TEXT_FORMAT = {
  type: "json_schema",
  name: "growth_plan_selected_scenario_review",
  strict: true,
  schema: {
    type: "object",
    properties: {
      headline: { type: "string" },
      summary: { type: "string" },
      scenarioAnalysis: { type: "string" },
      deadlineAnalysis: { type: "string" },
      riskAnalysis: { type: "string" },
      evidenceAnalysis: { type: "string" },
      comparison: { type: "string" },
      observations: stringArray,
      actions: stringArray,
      limitations: stringArray,
      methodologyNote: { type: "string" },
    },
    required: [
      "headline",
      "summary",
      "scenarioAnalysis",
      "deadlineAnalysis",
      "riskAnalysis",
      "evidenceAnalysis",
      "comparison",
      "observations",
      "actions",
      "limitations",
      "methodologyNote",
    ],
    additionalProperties: false,
  },
} as const;
