import { describe, expect, it } from "vitest";

import { estimateAiUsageCost, normalizeAiUsage } from "../../lib/aiCost";

describe("AI cost accounting", () => {
  it("normalizes both Chat Completions and Responses usage", () => {
    expect(
      normalizeAiUsage({
        prompt_tokens: 1_000,
        completion_tokens: 200,
        total_tokens: 1_200,
        prompt_tokens_details: { cached_tokens: 400 },
      })
    ).toMatchObject({
      inputTokens: 1_000,
      cachedInputTokens: 400,
      outputTokens: 200,
      totalTokens: 1_200,
    });

    expect(normalizeAiUsage({ input_tokens: 500, output_tokens: 50 })).toMatchObject({
      inputTokens: 500,
      outputTokens: 50,
      totalTokens: 550,
    });
  });

  it("prices uncached, cached, output, and file-search usage without double counting", () => {
    const result = estimateAiUsageCost({
      model: "gpt-4.1-mini-2025-04-14",
      usage: {
        prompt_tokens: 1_000_000,
        completion_tokens: 100_000,
        prompt_tokens_details: { cached_tokens: 250_000 },
      },
      fileSearchCalls: 2,
    });

    expect(result.pricingSnapshot.matched).toBe(true);
    expect(result.estimatedCostUsd).toBeCloseTo(0.49, 8);
  });

  it("flags unknown model rates instead of inventing a token price", () => {
    const result = estimateAiUsageCost({
      model: "provider-model-not-in-catalog",
      usage: { input_tokens: 10_000, output_tokens: 1_000 },
    });

    expect(result.pricingSnapshot.matched).toBe(false);
    expect(result.estimatedCostUsd).toBe(0);
  });
});
