import "server-only";

import { Agent, run } from "@openai/agents";
import { z } from "zod";

import type { OptionFlowAnalysisMode, OptionFlowHorizon } from "@/lib/optionFlowIntelligence";
import { GPT_6_ASTRA_MODEL } from "@/lib/openAiModelConfig";

const EvidenceItemSchema = z.object({
  statement: z.string(),
  evidenceType: z.enum(["FACT", "CALCULATION", "ASSUMPTION", "ESTIMATE", "AI_INTERPRETATION"]),
  support: z.array(z.string()),
  contradictoryEvidence: z.array(z.string()),
  uncertainty: z.string(),
});

const ScenarioSchema = z.object({
  label: z.string(),
  conditions: z.array(z.string()),
  priceZone: z.string().nullable(),
  timing: z.string(),
  invalidation: z.string(),
});

const KeyContractSchema = z.object({
  contract: z.string(),
  observedPrice: z.number().nullable(),
  expiry: z.string().nullable(),
  reason: z.string(),
  limitations: z.string(),
});

export const OptionFlowAgentOutputSchema = z.object({
  summary: z.string(),
  flowBias: z.enum(["bullish", "bearish", "mixed", "neutral", "insufficient_data"]),
  evidenceStrength: z.enum(["strong", "moderate", "limited", "insufficient"]),
  horizonRead: z.object({
    analysisMode: z.enum(["today", "forward_positioning"]),
    horizon: z.string(),
    targetDate: z.string().nullable(),
    interpretation: z.string(),
  }),
  observations: z.array(EvidenceItemSchema),
  interpretations: z.array(EvidenceItemSchema),
  scenarios: z.object({
    bullish: ScenarioSchema,
    base: ScenarioSchema,
    bearish: ScenarioSchema,
  }),
  accumulation: z.object({
    classification: z.enum([
      "evidence_consistent_with_accumulation",
      "evidence_consistent_with_distribution",
      "mixed_evidence",
      "insufficient_evidence",
    ]),
    supportingEvidence: z.array(z.string()),
    contradictoryEvidence: z.array(z.string()),
    missingData: z.array(z.string()),
  }),
  contradiction: z.object({
    strongestAlternativeExplanation: z.string(),
    supportingEvidence: z.array(z.string()),
    whatWouldResolveIt: z.array(z.string()),
  }),
  thesisUpdate: z.object({
    classification: z.enum([
      "STRENGTHENED",
      "WEAKENED",
      "UNCHANGED",
      "INSUFFICIENT_EVIDENCE",
    ]),
    previousRead: z.string(),
    currentRead: z.string(),
    whatChanged: z.array(z.string()),
    supportingEvidence: z.array(z.string()),
    contradictoryEvidence: z.array(z.string()),
    uncertainty: z.array(z.string()),
  }),
  keyContracts: z.array(KeyContractSchema),
  riskNotes: z.array(z.string()),
  suggestedFocus: z.array(z.string()),
});

const DailyMaterialReviewSchema = z.object({
  headline: z.string(),
  whatChanged: z.array(z.string()),
  whyItCouldMatter: z.array(z.string()),
  affectedPriorEvidence: z.array(z.string()),
  contradictoryEvidence: z.array(z.string()),
  uncertainty: z.array(z.string()),
  humanReviewAppearsNecessary: z.boolean(),
});

const OpenInterestReviewSchema = z.object({
  classification: z.enum(["STRENGTHENED", "WEAKENED", "UNCHANGED", "INSUFFICIENT_EVIDENCE"]),
  headline: z.string(),
  currentRead: z.string(),
  whatChanged: z.array(z.string()),
  supportingEvidence: z.array(z.string()),
  contradictoryEvidence: z.array(z.string()),
  uncertainty: z.array(z.string()),
  humanReviewAppearsNecessary: z.boolean(),
});

export type OptionFlowAgentOutput = z.infer<typeof OptionFlowAgentOutputSchema>;

export type RunOptionFlowAgentsInput = {
  userId: string;
  language: "en" | "es";
  analysisMode: OptionFlowAnalysisMode;
  horizon: OptionFlowHorizon;
  targetDate: string;
  payload: Record<string, unknown>;
};

const CORE_POLICY = `
You analyze options-flow evidence. You do not predict prices, approve investments, recommend trades,
or infer a person's actual cost basis from a public print. A print price is an observed contract price,
not proof of who opened or closed a position.

Financial data integrity rules:
- Use only numbers present in the supplied payload.
- Never silently replace missing data with zero.
- Use the exact text "DATA NOT AVAILABLE" when a required value cannot be verified.
- Keep FACT, CALCULATION, ASSUMPTION, ESTIMATE, and AI_INTERPRETATION distinct.
- LLM certainty is not investment probability. Never emit a probability of market success.
- Accumulation requires repeated evidence across sessions, OI change, or another supplied confirmation.
  A single print or screenshot is insufficient.
- The evidenceDelta object is deterministic. Treat repeated rows and an exact duplicate file as already-known
  evidence, never as additional confirmation. Repetition across uploads is not repetition across market sessions.
- Compare genuinely new evidence with priorAnalysis. Classify the flow thesis as STRENGTHENED, WEAKENED,
  UNCHANGED, or INSUFFICIENT_EVIDENCE. If newUniqueRows is zero, use UNCHANGED when a prior analysis exists
  and INSUFFICIENT_EVIDENCE when it does not.
- Do not claim that a thesis changed unless the supplied new evidence identifies what changed. Preserve
  uncertainty when dates, opening/closing status, premium, OI, or contract identity cannot be verified.
- ASK/BID identifies the aggressor side but does not prove opening versus closing.
- Open interest is an overnight consolidated position count, not an intraday counter. Use only the supplied
  openInterestEvidence comparisons between distinct effective OI sessions or an explicitly source-reported change.
  Never compare two prints from the same session to manufacture an OI change.
- marketEvidence contains deterministic underlying OHLC for the dates detected in the uploaded evidence. Use only
  matched sessions, preserve each stated date, and treat missingRequestedDates as unavailable rather than zero.
  Underlying OHLC is context for the flow; it is not an option-contract price and cannot prove trade direction.
- An OI increase does not identify who is long or short and cannot establish direction by itself. Reconcile it
  with dated contract price, volume, option type, aggressor side, prior evidence, and contradictory explanations.
- Target prices must be scenario zones grounded in supplied calculations, not invented point forecasts.
- State contradictory evidence and uncertainty plainly.
`.trim();

function languageInstruction(language: "en" | "es") {
  return language === "es"
    ? "Write every narrative field in Spanish. Preserve contract symbols and standardized evidence labels."
    : "Write every narrative field in English. Preserve contract symbols and standardized evidence labels.";
}

function buildAgents(input: RunOptionFlowAgentsInput) {
  const model = process.env.OPENAI_OPTIONFLOW_AGENT_MODEL || process.env.OPENAI_OPTIONFLOW_MODEL || GPT_6_ASTRA_MODEL;
  const intraday = new Agent({
    name: "Intraday Flow Analyst",
    model,
    instructions: `${CORE_POLICY}\n${languageInstruction(input.language)}
Focus only on same-session and next-session structure. Examine expiration proximity, strike concentration,
aggressor side, time buckets, spot context, and whether a late-session move appears completed or unresolved.
Do not produce a trading plan. Return a concise evidence memo for the director.`,
  });
  const positioning = new Agent({
    name: "Forward Positioning Analyst",
    model,
    instructions: `${CORE_POLICY}\n${languageInstruction(input.language)}
Focus on positioning that can plausibly remain relevant through the supplied horizon. Compare expirations to
the target date, repeated activity, OI evidence, observed contract prices, strike concentration, and term
structure only when supplied. Distinguish persistent positioning from one-session noise. Return a concise
evidence memo for the director.`,
  });
  const contradiction = new Agent({
    name: "Option Flow Contradiction Analyst",
    model,
    instructions: `${CORE_POLICY}\n${languageInstruction(input.language)}
Independently inspect the raw supplied evidence. Identify the strongest non-directional, hedging, closing,
spread, stale-data, liquidity, or selection-bias explanation. Do not manufacture a bear or bull argument when
evidence is weak. Return the strongest contradiction and what evidence would resolve it.`,
  });
  const primary = input.analysisMode === "today" ? intraday : positioning;
  const director = new Agent({
    name: "Option Flow Intelligence Director",
    model,
    instructions: `${CORE_POLICY}\n${languageInstruction(input.language)}
You own the final research brief. Call the horizon specialist and the contradiction specialist before writing
the final output. Reconcile their memos with the deterministic payload. Do not merely repeat either memo.
The output is market intelligence for a persistent symbol profile, never a premarket plan, journal entry,
trade instruction, or investment approval. The thesisUpdate must compare only genuinely new evidence with the
prior frozen read supplied in the payload. Keep the summary compact and place detail in evidence arrays.`,
    tools: [
      primary.asTool({
        toolName: input.analysisMode === "today" ? "analyze_intraday_flow" : "analyze_forward_positioning",
        toolDescription: "Analyze the supplied deterministic flow evidence for the selected horizon.",
      }),
      contradiction.asTool({
        toolName: "challenge_flow_interpretation",
        toolDescription: "Independently identify contradictory evidence and alternative explanations.",
      }),
    ],
    outputType: OptionFlowAgentOutputSchema,
  });
  return { director, model };
}

export async function runOptionFlowIntelligenceAgents(input: RunOptionFlowAgentsInput) {
  const { director, model } = buildAgents(input);
  const result = await run(
    director,
    JSON.stringify(
      {
        analysisMode: input.analysisMode,
        horizon: input.horizon,
        targetDate: input.targetDate,
        payload: input.payload,
      },
      null,
      2
    ),
    { maxTurns: 7 }
  );
  if (!result.finalOutput) throw new Error("Option Flow agents returned no structured output.");
  const usage = result.runContext.usage;
  return {
    output: result.finalOutput,
    model,
    traceId: result.lastResponseId ?? null,
    usage: {
      requests: usage.requests,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
      input_tokens_details: usage.inputTokensDetails,
      output_tokens_details: usage.outputTokensDetails,
    },
  };
}

export async function runOptionFlowDailyMaterialAgent(input: {
  language: "en" | "es";
  symbol: string;
  trend: Record<string, unknown>;
  materialReasons: string[];
  latestAnalysis: Record<string, unknown> | null;
}) {
  const model = process.env.OPENAI_OPTIONFLOW_DAILY_AGENT_MODEL || process.env.OPENAI_OPTIONFLOW_AGENT_MODEL || GPT_6_ASTRA_MODEL;
  const agent = new Agent({
    name: "Option Flow Daily Material Review",
    model,
    instructions: `${CORE_POLICY}\n${languageInstruction(input.language)}
Explain only the supplied material market change and how it relates to the most recent frozen flow analysis.
Do not create a new thesis from OHLC alone. If no prior evidence is affected, say so. This is workflow triage,
not a trading recommendation.`,
    outputType: DailyMaterialReviewSchema,
  });
  const result = await run(
    agent,
    JSON.stringify({
      symbol: input.symbol,
      deterministicTrend: input.trend,
      materialReasons: input.materialReasons,
      latestFrozenAnalysis: input.latestAnalysis,
    }),
    { maxTurns: 3 }
  );
  if (!result.finalOutput) throw new Error("Daily material review agent returned no output.");
  const usage = result.runContext.usage;
  return {
    output: result.finalOutput,
    model,
    traceId: result.lastResponseId ?? null,
    usage: {
      requests: usage.requests,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
    },
  };
}

export async function runOptionFlowOpenInterestReviewAgent(input: {
  language: "en" | "es";
  symbol: string;
  openInterestIntelligence: Record<string, unknown>;
  latestAnalysis: Record<string, unknown> | null;
}) {
  const model = process.env.OPENAI_OPTIONFLOW_OI_AGENT_MODEL || process.env.OPENAI_OPTIONFLOW_AGENT_MODEL || GPT_6_ASTRA_MODEL;
  const agent = new Agent({
    name: "Option Flow Open Interest Reconciliation",
    model,
    instructions: `${CORE_POLICY}\n${languageInstruction(input.language)}
Compare the deterministic overnight open-interest reconciliation with the latest frozen flow analysis.
Classify only whether the supplied OI and contract-price evidence strengthens, weakens, leaves unchanged,
or is insufficient to assess that prior read. An OI increase is not inherently bullish or bearish and cannot
identify long versus short ownership. Do not infer opening/closing for a specific print. Cite exact supplied
contract values and effective dates, preserve contradictions, and never issue a trade recommendation.`,
    outputType: OpenInterestReviewSchema,
  });
  const result = await run(
    agent,
    JSON.stringify({
      symbol: input.symbol,
      deterministicOpenInterestEvidence: input.openInterestIntelligence,
      latestFrozenAnalysis: input.latestAnalysis,
    }),
    { maxTurns: 3 }
  );
  if (!result.finalOutput) throw new Error("Open-interest reconciliation agent returned no output.");
  const usage = result.runContext.usage;
  return {
    output: result.finalOutput,
    model,
    traceId: result.lastResponseId ?? null,
    usage: {
      requests: usage.requests,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
    },
  };
}
