import "server-only";

import { estimateAiUsageCost } from "@/lib/aiCost";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export type AiCostCategory =
  | "shared"
  | "advanced"
  | "support"
  | "sales"
  | "market_intelligence";

export async function recordAiUsage(params: {
  userId?: string | null;
  requestId?: string | null;
  feature: string;
  category: AiCostCategory;
  operation: string;
  model: string;
  usage: any;
  apiKind?: "chat_completions" | "responses";
  fileSearchCalls?: number;
  metadata?: Record<string, unknown>;
}) {
  try {
    const cost = estimateAiUsageCost(params);
    const { error } = await supabaseAdmin.from("ai_usage_events").insert({
      user_id: params.userId ?? null,
      request_id: params.requestId ?? null,
      feature: params.feature,
      category: params.category,
      operation: params.operation,
      provider: "openai",
      api_kind: params.apiKind ?? "chat_completions",
      model: params.model || "unknown",
      input_tokens: cost.inputTokens,
      cached_input_tokens: cost.cachedInputTokens,
      output_tokens: cost.outputTokens,
      reasoning_tokens: cost.reasoningTokens,
      total_tokens: cost.totalTokens,
      file_search_calls: cost.fileSearchCalls,
      estimated_cost_usd: cost.estimatedCostUsd,
      pricing_snapshot: cost.pricingSnapshot,
      metadata: params.metadata ?? {},
    });

    if (error) {
      console.warn("[ai-usage] Could not persist usage event:", error.message);
    }
  } catch (error: any) {
    // Cost accounting must never break the customer-facing AI response.
    console.warn("[ai-usage] Unexpected persistence error:", error?.message ?? error);
  }
}

export function countResponseFileSearchCalls(response: any) {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.filter((item: any) => item?.type === "file_search_call").length;
}
