export const GPT_6_ASTRA_MODEL = "gpt-6-astra";

export type OpenAiChatReasoningEffort = "low" | "medium" | "high" | "xhigh";

export function isGpt6AstraModel(model: string) {
  const normalized = String(model ?? "").trim().toLowerCase();
  return normalized === GPT_6_ASTRA_MODEL || normalized.startsWith(`${GPT_6_ASTRA_MODEL}-`);
}

export function openAiChatTuning(
  model: string,
  temperature: number,
  reasoningEffort: OpenAiChatReasoningEffort = "low"
): { temperature?: number; reasoning_effort?: OpenAiChatReasoningEffort } {
  if (isGpt6AstraModel(model)) {
    return { reasoning_effort: reasoningEffort };
  }
  return { temperature };
}
