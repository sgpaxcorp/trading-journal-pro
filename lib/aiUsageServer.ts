import "server-only";

import { estimateAiUsageCost } from "@/lib/aiCost";
import { supabaseAdmin } from "@/lib/supaBaseAdmin";

export type AiCostCategory =
  | "shared"
  | "advanced"
  | "support"
  | "sales"
  | "market_intelligence";

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function requireAiBudget(params: {
  userId?: string | null;
  category: AiCostCategory;
}) {
  const enabled = process.env.AI_BUDGETS_ENABLED !== "false" && (
    process.env.NODE_ENV === "production" || process.env.AI_BUDGETS_ENABLED === "true"
  );
  if (!enabled) return null;

  const userDailyLimit = positiveNumber(process.env.AI_BUDGET_USER_DAILY_USD, 3);
  const globalDailyLimit = positiveNumber(process.env.AI_BUDGET_GLOBAL_DAILY_USD, 75);
  const globalMonthlyLimit = positiveNumber(process.env.AI_BUDGET_GLOBAL_MONTHLY_USD, 1_500);
  const categoryDailyLimit = params.category === "sales"
    ? positiveNumber(process.env.AI_BUDGET_SALES_DAILY_USD, 10)
    : 0;

  const { data, error } = await supabaseAdmin.rpc("check_ai_usage_budget", {
    p_user_id: params.userId ?? null,
    p_category: params.category,
    p_user_daily_limit: userDailyLimit,
    p_global_daily_limit: globalDailyLimit,
    p_global_monthly_limit: globalMonthlyLimit,
    p_category_daily_limit: categoryDailyLimit,
  });

  if (error) {
    console.error("[ai-budget] Budget check failed:", error.message);
    return Response.json(
      { error: "AI service is temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "60" } }
    );
  }

  if ((data as { allowed?: boolean } | null)?.allowed === false) {
    return Response.json(
      { error: "AI usage limit reached. Please try again later." },
      { status: 429, headers: { "Retry-After": "3600" } }
    );
  }

  return null;
}

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
