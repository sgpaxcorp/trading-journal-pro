import { describe, expect, it } from "vitest";

import {
  buildLateSessionTrackedFlows,
  buildLateSessionTape,
  buildLearningSchedule,
  directionFromOptionPrint,
  evaluateOptionFlowMarketResponse,
  evaluateOptionFlowContractResponse,
  flowRowSessionDate,
  nextWeekdayDateKey,
  optionFlowUnderlyingsMatch,
  parseFlowClockMinutes,
  resolveFlowSessionDateForRows,
  zonedDateTimeToUtc,
  type OptionFlowCandle,
} from "@/lib/optionFlowLearning";

function candle(
  date: string,
  hour: number,
  minute: number,
  prices: { open: number; high: number; low: number; close: number }
): OptionFlowCandle {
  return {
    time: zonedDateTimeToUtc(date, hour, minute).getTime(),
    ...prices,
  };
}

describe("Option Flow learning", () => {
  it("maps aggressive option prints to their expected underlying direction", () => {
    expect(directionFromOptionPrint("C", "ASK")).toBe("bullish");
    expect(directionFromOptionPrint("P", "ASK")).toBe("bearish");
    expect(directionFromOptionPrint("C", "BID")).toBe("bearish");
    expect(directionFromOptionPrint("P", "BID")).toBe("bullish");
    expect(directionFromOptionPrint("C", "MID")).toBe("unknown");
  });

  it("recognizes the 1:30 PM through 4:15 PM market-time window", () => {
    expect(parseFlowClockMinutes("12:59 PM")).toBe(12 * 60 + 59);
    expect(parseFlowClockMinutes("1:00 PM")).toBe(13 * 60);
    expect(parseFlowClockMinutes("15:42:10")).toBe(15 * 60 + 42);
    expect(parseFlowClockMinutes("16:00:00.000")).toBe(16 * 60);
    expect(parseFlowClockMinutes("0.625")).toBe(15 * 60);
    expect(parseFlowClockMinutes("4:00 PM")).toBe(16 * 60);

    const tracked = buildLateSessionTrackedFlows(
      [
        { underlying: "SPX", type: "C", side: "ASK", time: "1:29 PM", premium: 900_000 },
        { underlying: "SPX", type: "C", side: "ASK", time: "1:30 PM", premium: 500_000 },
        { underlying: "SPX", type: "P", side: "ASK", time: "3:58 PM", premium: 700_000 },
        { underlying: "SPX", type: "C", side: "ASK", time: "4:15 PM", premium: 600_000 },
        { underlying: "SPX", type: "C", side: "ASK", time: "4:16 PM", premium: 800_000 },
      ],
      "SPX"
    );

    expect(tracked).toHaveLength(3);
    expect(tracked.map((flow) => flow.time)).toEqual(["3:58 PM", "4:15 PM", "1:30 PM"]);
  });

  it("accepts the SPXW weekly root when the requested underlying is SPX", () => {
    expect(optionFlowUnderlyingsMatch("SPXW", "SPX")).toBe(true);
    const tracked = buildLateSessionTrackedFlows(
      [
        {
          symbol: "SPXW260915C07600000",
          underlying: "SPXW",
          type: "C",
          side: "ASK",
          time: "4:00:00 PM",
          premium: 78_000,
        },
        {
          symbol: "SPXW260915C07625000",
          underlying: "SPXW",
          type: "C",
          side: "BID",
          time: "4:00:35 PM",
          premium: 78_260,
        },
      ],
      "SPX"
    );

    expect(tracked).toHaveLength(2);
    expect(tracked.map((flow) => flow.contract)).toEqual([
      "SPXW260915C07625000",
      "SPXW260915C07600000",
    ]);
  });

  it("keeps afternoon phases separate and carries the closing regime into the next session", () => {
    const tape = buildLateSessionTape(
      [
        {
          sourceSessionDate: "2026-09-15",
          symbol: "SPXW260916P07550000",
          underlying: "SPXW",
          type: "P",
          side: "ASK",
          time: "2:45 PM",
          premium: 500_000,
          tradePrice: 18,
          underlyingPrice: 7560,
        },
        {
          sourceSessionDate: "2026-09-15",
          symbol: "SPXW260916C07575000",
          underlying: "SPXW",
          type: "C",
          side: "ASK",
          time: "3:36 PM",
          premium: 750_000,
          tradePrice: 18,
          underlyingPrice: 7555,
        },
        {
          sourceSessionDate: "2026-09-14",
          symbol: "SPXW260915P07550000",
          underlying: "SPXW",
          type: "P",
          side: "ASK",
          time: "3:50 PM",
          premium: 5_000_000,
          tradePrice: 10,
          underlyingPrice: 7500,
        },
      ],
      "SPX",
      "2026-09-15"
    );

    expect(tape.totalPrints).toBe(2);
    expect(tape.buckets.map((bucket) => bucket.bias)).toEqual(["bearish", "neutral", "bullish"]);
    expect(tape.regimeShift).toMatchObject({ detected: true, from: "bearish", to: "bullish" });
    expect(tape.carryForwardBias).toBe("bullish");
    expect(tape.closingContracts[0]).toMatchObject({
      contract: "SPXW260916C07575000",
      entryOptionPrice: 18,
      time: "3:36 PM",
    });
  });

  it("measures a contract entered at 18 that reaches 40 and records when it happened", () => {
    const targetDate = "2026-09-16";
    const result = evaluateOptionFlowContractResponse(
      {
        contract: "SPXW260916C07575000",
        underlying: "SPX",
        expiry: targetDate,
        strike: 7575,
        type: "C",
        side: "ASK",
        direction: "bullish",
        time: "3:36 PM",
        clockMinutes: 15 * 60 + 36,
        timestamp: null,
        referenceUnderlyingPrice: 7555,
        entryOptionPrice: 18,
        premium: 750_000,
        size: 100,
        oi: 50,
      },
      [
        candle(targetDate, 9, 30, { open: 20, high: 22, low: 17, close: 21 }),
        candle(targetDate, 10, 15, { open: 35, high: 40, low: 34, close: 39 }),
        candle(targetDate, 15, 55, { open: 30, high: 32, low: 29, close: 31 }),
      ]
    );

    expect(result.status).toBe("available");
    expect(result.entryPrice).toBe(18);
    expect(result.maxPrice).toBe(40);
    expect(result.maxPriceReturnPct).toBeCloseTo(122.2222, 4);
    expect(result.maxPriceAt).toBe("2026-09-16T14:15:00.000Z");
    expect(result.first100PctAt).toBe("2026-09-16T14:15:00.000Z");
    expect(result.minutesToMaxPrice).toBe(45);
  });

  it("detects and preserves the selected trading date in mixed-session CSV rows", () => {
    const rows = [
      { date: "09/14/2026", time: "3:55:00 PM" },
      { date: "09/15/2026", time: "3:59:21 PM" },
    ];
    expect(flowRowSessionDate(rows[0])).toBe("2026-09-14");
    expect(resolveFlowSessionDateForRows(rows, "2026-09-14")).toBe("2026-09-14");
    expect(resolveFlowSessionDateForRows(rows, "2026-09-13")).toBe("2026-09-15");
  });

  it("schedules Friday flow for Monday at 5 PM New York time", () => {
    expect(nextWeekdayDateKey("2026-09-18")).toBe("2026-09-21");
    expect(buildLearningSchedule("2026-09-18")).toEqual({
      sourceSessionDate: "2026-09-18",
      targetSessionDate: "2026-09-21",
      evaluationDueAt: "2026-09-21T21:00:00.000Z",
    });
    expect(buildLearningSchedule("2026-12-18").evaluationDueAt).toBe(
      "2026-12-21T22:00:00.000Z"
    );
  });

  it("records when a late call purchase first receives next-session confirmation", () => {
    const sourceDate = "2026-09-14";
    const targetDate = "2026-09-15";
    const validation = evaluateOptionFlowMarketResponse({
      sourceSessionDate: sourceDate,
      targetSessionDate: targetDate,
      candles: [
        candle(sourceDate, 15, 55, { open: 99.9, high: 100.1, low: 99.8, close: 100 }),
        candle(targetDate, 9, 30, { open: 99.8, high: 100.1, low: 99.7, close: 100 }),
        candle(targetDate, 10, 0, { open: 100, high: 100.4, low: 99.95, close: 100.3 }),
        candle(targetDate, 15, 55, { open: 100.8, high: 101.1, low: 100.7, close: 101 }),
      ],
      trackedFlows: [
        {
          contract: "SPX 2026-09-18 6600C",
          underlying: "SPX",
          expiry: "2026-09-18",
          strike: 6600,
          type: "C",
          side: "ASK",
          direction: "bullish",
          time: "4:00 PM",
          clockMinutes: 16 * 60,
          timestamp: null,
          referenceUnderlyingPrice: 100,
          premium: 500_000,
          size: 100,
          oi: 50,
        },
      ],
      analysisBias: "bullish",
      evaluatedAt: new Date("2026-09-15T21:05:00.000Z"),
    });

    expect(validation?.thesis.verdict).toBe("supports");
    expect(validation?.thesis.firstConfirmedAt).toBe("2026-09-15T14:00:00.000Z");
    expect(validation?.thesis.minutesFromOpen).toBe(30);
    expect(validation?.thesis.maxFavorablePct).toBe(1.1);
    expect(validation?.thesis.closeDirectionalPct).toBe(1);
    expect(validation?.flows[0].evaluation?.verdict).toBe("supports");
  });

  it("distinguishes an intraday confirmation that reversed by the close", () => {
    const sourceDate = "2026-09-14";
    const targetDate = "2026-09-15";
    const validation = evaluateOptionFlowMarketResponse({
      sourceSessionDate: sourceDate,
      targetSessionDate: targetDate,
      candles: [
        candle(sourceDate, 15, 55, { open: 100, high: 100, low: 100, close: 100 }),
        candle(targetDate, 9, 30, { open: 100, high: 100.3, low: 99.9, close: 100.2 }),
        candle(targetDate, 15, 55, { open: 99.8, high: 99.9, low: 99.4, close: 99.5 }),
      ],
      trackedFlows: [],
      analysisBias: "bullish",
    });

    expect(validation?.thesis.verdict).toBe("partially_supports");
    expect(validation?.thesis.closeDirectionalPct).toBe(-0.5);
  });
});
