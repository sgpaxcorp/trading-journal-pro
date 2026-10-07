import { describe, expect, it } from "vitest";

import {
  buildOptionFlowMarketEvidence,
  classifyOptionFlowCheckpoint,
  computeOptionFlowTrend,
  detectOptionFlowMaterialChange,
  enforceOptionFlowThesisStatus,
  normalizeOptionFlowSymbol,
  optionFlowTargetDate,
  summarizeOptionFlowEvidenceWindow,
  type OptionFlowDailyBar,
} from "@/lib/optionFlowIntelligence";

function dateKey(offset: number) {
  const date = new Date("2026-01-05T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function bar(offset: number, close: number, volume = 1_000_000): OptionFlowDailyBar {
  return {
    symbol: "PLTR",
    sessionDate: dateKey(offset),
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  };
}

describe("Option Flow intelligence", () => {
  it("normalizes a symbol and creates deterministic horizon dates", () => {
    expect(normalizeOptionFlowSymbol(" pltr $ ")).toBe("PLTR");
    expect(optionFlowTargetDate({ sourceSessionDate: "2026-10-02", horizon: "next_session" })).toBe("2026-10-05");
    expect(optionFlowTargetDate({ sourceSessionDate: "2026-10-02", horizon: "one_month" })).toBe("2026-11-02");
    expect(optionFlowTargetDate({
      sourceSessionDate: "2026-10-02",
      horizon: "custom",
      customTargetDate: "2026-10-04",
    })).toBe("2026-10-05");
  });

  it("uses the real evidence date range and only falls back when dates are unavailable", () => {
    expect(summarizeOptionFlowEvidenceWindow({
      sessionDates: ["2026-09-30", "2026-09-01", "2026-09-30", null],
      fallbackDate: "2026-10-06",
    })).toEqual({
      sessionDates: ["2026-09-01", "2026-09-30"],
      startDate: "2026-09-01",
      endDate: "2026-09-30",
      sessionCount: 2,
    });
    expect(summarizeOptionFlowEvidenceWindow({
      sessionDates: [null, undefined],
      fallbackDate: "2026-10-06",
    })).toMatchObject({ startDate: "2026-10-06", endDate: "2026-10-06", sessionCount: 1 });
  });

  it("matches uploaded flow dates to deterministic OHLC without filling missing sessions", () => {
    const result = buildOptionFlowMarketEvidence({
      bars: [
        {
          symbol: "PLTR",
          sessionDate: "2026-10-02",
          open: 170,
          high: 175,
          low: 168,
          close: 174,
          volume: 10_000_000,
          currency: "USD",
          availableAt: "2026-10-03T01:00:00.000Z",
          sourceId: "test_provider",
          sourceReference: "test:PLTR:2026-10-02",
        },
        {
          symbol: "PLTR",
          sessionDate: "2026-10-05",
          open: 175,
          high: 180,
          low: 173,
          close: 179,
          volume: 12_000_000,
          currency: "USD",
          availableAt: "2026-10-06T01:00:00.000Z",
          sourceId: "test_provider",
          sourceReference: "test:PLTR:2026-10-05",
        },
      ],
      requestedSessionDates: ["2026-10-05", "2026-10-06"],
      startDate: "2026-10-05",
      endDate: "2026-10-06",
    });

    expect(result.status).toBe("partial");
    expect(result.sessions).toEqual([
      expect.objectContaining({ sessionDate: "2026-10-05", open: 175, high: 180, low: 173, close: 179 }),
    ]);
    expect(result.previousSession).toEqual({ sessionDate: "2026-10-02", close: 174 });
    expect(result.missingRequestedDates).toEqual(["2026-10-06"]);
    expect(result.sourceManifest[0]).toMatchObject({ sourceId: "test_provider", currency: "USD" });
  });

  it("marks OHLC unavailable when the market source returns no verified bars", () => {
    const result = buildOptionFlowMarketEvidence({
      bars: [],
      requestedSessionDates: ["2026-10-05"],
      startDate: "2026-10-05",
      endDate: "2026-10-05",
      providerError: "source unavailable",
    });

    expect(result.status).toBe("unavailable");
    expect(result.sessions).toEqual([]);
    expect(result.missingRequestedDates).toEqual(["2026-10-05"]);
    expect(result.limitations.at(-1)).toContain("source unavailable");
  });

  it("does not let repeated uploads strengthen or weaken a thesis", () => {
    expect(enforceOptionFlowThesisStatus({
      hasPriorAnalysis: true,
      newUniqueRows: 0,
      candidate: "STRENGTHENED",
    })).toBe("UNCHANGED");
    expect(enforceOptionFlowThesisStatus({
      hasPriorAnalysis: false,
      newUniqueRows: 12,
      candidate: "STRENGTHENED",
    })).toBe("INSUFFICIENT_EVIDENCE");
    expect(enforceOptionFlowThesisStatus({
      hasPriorAnalysis: true,
      newUniqueRows: 3,
      candidate: "WEAKENED",
    })).toBe("WEAKENED");
  });

  it("calculates price trend metrics without silently replacing missing data", () => {
    const bars = Array.from({ length: 65 }, (_, index) => bar(index, 100 + index, 1_000_000 + index * 5_000));
    const trend = computeOptionFlowTrend(bars);

    expect(trend.sessionCount).toBe(65);
    expect(trend.close).toBe(164);
    expect(trend.sma5).toBe(162);
    expect(trend.trendState).toBe("uptrend");
    expect(trend.sixtySessionReturnPct).toBe(57.6923);
    expect(trend.formulas.atr14).toContain("prev_close");

    const missing = computeOptionFlowTrend([]);
    expect(missing.close).toBeNull();
    expect(missing.dailyReturnPct).toBeNull();
    expect(missing.trendState).toBe("insufficient_data");
  });

  it("flags only deterministic material price or volume changes", () => {
    const bars = Array.from({ length: 21 }, (_, index) => bar(index, 100 + index * 0.1));
    bars.push(bar(21, 130, 4_000_000));
    const trend = computeOptionFlowTrend(bars);
    const material = detectOptionFlowMaterialChange(bars, trend);

    expect(material.material).toBe(true);
    expect(material.reasons.some((reason) => reason.includes("daily return"))).toBe(true);
    expect(material.reasons.some((reason) => reason.includes("20-session high"))).toBe(true);
  });

  it("evaluates the frozen horizon without converting it into a trade decision", () => {
    expect(classifyOptionFlowCheckpoint({
      flowBias: "bullish",
      sourceClose: 100,
      checkpointClose: 104,
      targetDate: "2026-10-09",
      evaluatedSessionDate: "2026-10-09",
    })).toMatchObject({ classification: "price_confirms_flow", rawReturnPct: 4, directionalReturnPct: 4 });

    expect(classifyOptionFlowCheckpoint({
      flowBias: "bearish",
      sourceClose: 100,
      checkpointClose: 104,
      targetDate: "2026-10-09",
      evaluatedSessionDate: "2026-10-09",
    }).classification).toBe("price_diverges_from_flow");

    expect(classifyOptionFlowCheckpoint({
      flowBias: "bullish",
      sourceClose: 100,
      checkpointClose: 104,
      targetDate: "2026-10-09",
      evaluatedSessionDate: "2026-10-08",
    }).classification).toBe("horizon_still_open");

    expect(classifyOptionFlowCheckpoint({
      flowBias: "mixed",
      sourceClose: 100,
      checkpointClose: 104,
      targetDate: "2026-10-09",
      evaluatedSessionDate: "2026-10-09",
    }).classification).toBe("insufficient_evidence");
  });
});
