import { describe, expect, it } from "vitest";
import {
  buildStrategyReview,
  createStrategySnapshot,
  normalizeStrategyAssignment,
  strategyTradeKey,
} from "@/lib/strategyReview";

describe("strategy review", () => {
  const snapshot = createStrategySnapshot(
    {
      id: "opening-range",
      name: "Opening range breakout",
      setup: "Opening range is defined\nTrend agrees with the breakout",
      entryRules: "Enter only after candle close",
      exitRules: "Place protective stop immediately; use an OCO bracket",
      managementRules: "Do not widen the stop",
      invalidation: "No trade if price returns inside the range",
      instruments: ["option"],
      timeframe: "5m",
    },
    {
      capturedAt: "2026-09-08T12:00:00.000Z",
      planVersion: 3,
    }
  );

  it("keeps a durable strategy snapshot and trade key", () => {
    expect(snapshot.id).toBe("opening-range");
    expect(snapshot.fingerprint).toBeTruthy();
    expect(
      strategyTradeKey({
        date: "2026-09-08",
        symbol: "spx",
        kind: "OPTION",
        entryTime: "09:41",
        exitTime: "10:03",
        sequence: 2,
      })
    ).toBe("2026-09-08|SPX|option|09:41|10:03|2");

    const assignment = normalizeStrategyAssignment({
      strategyId: snapshot.id,
      snapshot,
      assignedAt: "2026-09-08T12:01:00.000Z",
      assignmentTiming: "pre_trade",
    });
    expect(assignment?.snapshot.fingerprint).toBe(snapshot.fingerprint);
    expect(assignment?.assignmentTiming).toBe("pre_trade");
  });

  it("uses broker evidence for stop and OCO without guessing manual rules", () => {
    const result = buildStrategyReview({
      strategy: snapshot,
      evidence: {
        symbol: "SPX",
        kind: "option",
        stopPresent: true,
        ocoUsed: false,
        timeToFirstStopSec: 18,
      },
    });

    expect(result.criteria.find((item) => item.label === "Protective stop")?.status).toBe("pass");
    expect(result.criteria.find((item) => item.label === "OCO / bracket protection")?.status).toBe("fail");
    expect(result.unverified).toBeGreaterThan(0);
    expect(result.evidenceCoverage).toBeLessThan(100);
  });

  it("scores only verified criteria and accepts explicit trader assessments", () => {
    const initial = buildStrategyReview({
      strategy: createStrategySnapshot({
        id: "one-rule",
        name: "One rule",
        entryRules: "Wait for confirmation",
      }),
      evidence: { kind: "stock", symbol: "AAPL" },
    });
    expect(initial.score).toBeNull();
    expect(initial.evidenceCoverage).toBe(0);

    const criterionId = initial.criteria[0].id;
    const reviewed = buildStrategyReview({
      strategy: createStrategySnapshot({
        id: "one-rule",
        name: "One rule",
        entryRules: "Wait for confirmation",
      }),
      evidence: { kind: "stock", symbol: "AAPL" },
      assessments: {
        [criterionId]: { status: "pass", note: "Confirmed on chart replay." },
      },
    });
    expect(reviewed.score).toBe(100);
    expect(reviewed.evidenceCoverage).toBe(100);
    expect(reviewed.criteria[0].source).toBe("trader");
  });
});
