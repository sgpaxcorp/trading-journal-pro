import { describe, expect, it } from "vitest";
import {
  findContainingCandleIndex,
  getReplayPeriodWindow,
  inferCandleIntervalMs,
  timeframeIntervalMs,
} from "@/lib/backStudy/chartTimeline";

describe("back-study chart timeline", () => {
  it("keeps one-minute replay requests inside a precise six-day window", () => {
    const window = getReplayPeriodWindow("2026-09-08", 365, "1m");
    expect(window).not.toBeNull();
    expect((window!.period2 - window!.period1) / 86_400).toBe(6);
  });

  it("keeps other intraday replay requests below the provider's 60-day limit", () => {
    const window = getReplayPeriodWindow("2026-09-08", 365, "5m");
    expect(window).not.toBeNull();
    expect((window!.period2 - window!.period1) / 86_400).toBe(58);
  });

  it("preserves the requested context for daily candles", () => {
    const window = getReplayPeriodWindow("2026-09-08", 365, "1d");
    expect(window).not.toBeNull();
    expect((window!.period2 - window!.period1) / 86_400).toBe(730);
  });

  it("places an event inside its current candle instead of the nearer future candle", () => {
    const start = Date.parse("2026-09-08T13:45:00Z");
    const candles = [
      { time: start },
      { time: start + 5 * 60_000 },
      { time: start + 10 * 60_000 },
    ];
    const event = Date.parse("2026-09-08T13:49:44Z");

    expect(findContainingCandleIndex(candles, event, timeframeIntervalMs("5m"))).toBe(0);
  });

  it("does not attach an event to a candle across a market-data gap", () => {
    const start = Date.parse("2026-09-08T13:45:00Z");
    const candles = [{ time: start }, { time: start + 10 * 60_000 }];
    const event = start + 7 * 60_000;

    expect(findContainingCandleIndex(candles, event, timeframeIntervalMs("5m"))).toBeNull();
  });

  it("infers the normal bar duration without being distorted by an overnight gap", () => {
    const start = Date.parse("2026-09-08T13:45:00Z");
    const candles = [
      { time: start },
      { time: start + 60_000 },
      { time: start + 2 * 60_000 },
      { time: start + 18 * 60 * 60_000 },
    ];

    expect(inferCandleIntervalMs(candles, timeframeIntervalMs("5m"))).toBe(60_000);
  });
});
