import { describe, expect, it } from "vitest";

import {
  buildNeuroMemory,
  type NeuroLayer,
  type NeuroMemorySession,
} from "@/lib/neuroLayer";

function session(
  date: string,
  overrides: Partial<NeuroLayer> & { pnl?: number } = {}
): NeuroMemorySession {
  return {
    date,
    pnl: overrides.pnl ?? 0,
    neuro: {
      premarket: overrides.premarket ?? {
        thesis: ["breakout"],
        confirmation: ["level_holds"],
        invalidation: ["lose_level"],
      },
      inside: overrides.inside ?? {
        changed: ["nothing_changed"],
        state: ["calm"],
        plan_followed: "yes",
      },
      after: overrides.after ?? {
        exit_reason: ["manual_close"],
        take_again: "yes",
        truth: ["managed_well"],
        one_line_truth: "Executed the documented process.",
        custom_tags: [],
      },
    },
  };
}

describe("Neuro Memory coaching", () => {
  it("turns repeated plan drift into evidence, an instruction, and a measurement", () => {
    const memory = buildNeuroMemory(
      [
        session("2026-09-16", {
          inside: { changed: ["chased"], state: ["urgent"], plan_followed: "no" },
          after: {
            exit_reason: ["emotional_exit"],
            take_again: "no",
            truth: ["broke_plan"],
            one_line_truth: "I forced it.",
            custom_tags: [],
          },
        }),
        session("2026-09-15", {
          inside: { changed: ["entered_early"], state: ["urgent"], plan_followed: "partial" },
        }),
      ],
      "es"
    );

    expect(memory?.kind).toBe("risk");
    expect(memory?.evidence).toContain("2 de 2");
    expect(memory?.evidence).toContain("2026-09-16");
    expect(memory?.nextAction).toContain("riesgo en dólares");
    expect(memory?.successCheck).toContain("Próximas 3 sesiones");
    expect(memory?.generatedBy).toBe("rules");
  });

  it("protects calm plan-following even when individual sessions lose money", () => {
    const memory = buildNeuroMemory(
      [session("2026-09-16", { pnl: -125 }), session("2026-09-15", { pnl: -40 })],
      "en"
    );

    expect(memory?.kind).toBe("strength");
    expect(memory?.body).toContain("independent of one session's P&L");
    expect(memory?.evidence).toContain("2 of 2");
    expect(memory?.nextAction).toBeTruthy();
    expect(memory?.successCheck).toContain("Next 3 sessions");
  });

  it("returns a concrete next-session correction for a single scored session", () => {
    const memory = buildNeuroMemory(
      [
        session("2026-09-16", {
          inside: { changed: ["entered_early"], state: ["urgent"], plan_followed: "yes" },
        }),
      ],
      "en"
    );

    expect(memory?.evidence).toContain("2026-09-16");
    expect(memory?.nextAction).toContain("planned confirmation");
    expect(memory?.successCheck).toContain("next session");
  });
});
