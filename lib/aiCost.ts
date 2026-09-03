export type NormalizedAiUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

type ModelPricing = {
  input: number;
  cachedInput: number;
  output: number;
};

const MODEL_PRICING_USD_PER_MILLION: Record<string, ModelPricing> = {
  "gpt-5.6-sol": { input: 4, cachedInput: 0.4, output: 20 },
  "gpt-5.6-terra": { input: 2, cachedInput: 0.2, output: 12 },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.5 },
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2 },
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
};

const FILE_SEARCH_CALL_USD = 2.5 / 1000;

function finiteNonNegative(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const number = finiteNonNegative(value);
    if (number > 0) return number;
  }
  return 0;
}

function normalizeModel(model: string) {
  const value = String(model || "unknown").trim().toLowerCase();
  const keys = Object.keys(MODEL_PRICING_USD_PER_MILLION).sort((a, b) => b.length - a.length);
  return keys.find((key) => value === key || value.startsWith(`${key}-`)) ?? null;
}

export function normalizeAiUsage(usage: any): NormalizedAiUsage {
  const inputTokens = firstNumber(usage?.input_tokens, usage?.prompt_tokens, usage?.inputTokens);
  const cachedInputTokens = Math.min(
    inputTokens,
    firstNumber(
      usage?.input_tokens_details?.cached_tokens,
      usage?.prompt_tokens_details?.cached_tokens
    )
  );
  const outputTokens = firstNumber(usage?.output_tokens, usage?.completion_tokens, usage?.outputTokens);
  const reasoningTokens = Math.min(
    outputTokens,
    firstNumber(
      usage?.output_tokens_details?.reasoning_tokens,
      usage?.completion_tokens_details?.reasoning_tokens
    )
  );
  const totalTokens = firstNumber(usage?.total_tokens, usage?.totalTokens) || inputTokens + outputTokens;

  return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens };
}

export function estimateAiUsageCost(params: {
  model: string;
  usage: any;
  fileSearchCalls?: number;
}) {
  const normalized = normalizeAiUsage(params.usage);
  const pricingKey = normalizeModel(params.model);
  const pricing = pricingKey ? MODEL_PRICING_USD_PER_MILLION[pricingKey] : null;
  const fileSearchCalls = finiteNonNegative(params.fileSearchCalls);
  const uncachedInputTokens = Math.max(0, normalized.inputTokens - normalized.cachedInputTokens);
  const tokenCost = pricing
    ? (uncachedInputTokens * pricing.input +
        normalized.cachedInputTokens * pricing.cachedInput +
        normalized.outputTokens * pricing.output) /
      1_000_000
    : 0;
  const fileSearchCost = fileSearchCalls * FILE_SEARCH_CALL_USD;

  return {
    ...normalized,
    fileSearchCalls,
    estimatedCostUsd: Number((tokenCost + fileSearchCost).toFixed(8)),
    pricingSnapshot: {
      matched: Boolean(pricing),
      pricingKey,
      unit: "usd_per_1m_tokens",
      input: pricing?.input ?? null,
      cachedInput: pricing?.cachedInput ?? null,
      output: pricing?.output ?? null,
      fileSearchCallUsd: FILE_SEARCH_CALL_USD,
      sourceVersion: "2026-09-03",
    },
  };
}
