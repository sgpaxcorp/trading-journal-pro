import { describe, expect, it } from "vitest";

import {
  GPT_6_ASTRA_MODEL,
  isGpt6AstraModel,
  openAiChatTuning,
} from "@/lib/openAiModelConfig";

describe("OpenAI model configuration", () => {
  it("uses reasoning effort and omits custom temperature for GPT-6 Astra", () => {
    expect(GPT_6_ASTRA_MODEL).toBe("gpt-6-astra");
    expect(isGpt6AstraModel("gpt-6-astra")).toBe(true);
    expect(openAiChatTuning("gpt-6-astra", 0.2)).toEqual({ reasoning_effort: "low" });
  });

  it("preserves temperature for compatible non-Astra fallbacks", () => {
    expect(openAiChatTuning("gpt-4.1", 0.2)).toEqual({ temperature: 0.2 });
  });
});
