export type ReplayTimeframeId = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

const DAY_MS = 86_400_000;

const TIMEFRAME_INTERVAL_MS: Record<ReplayTimeframeId, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  // The provider supplies 60-minute candles for the current 4h view.
  "4h": 60 * 60_000,
  "1d": DAY_MS,
};

export function timeframeIntervalMs(timeframe: ReplayTimeframeId): number {
  return TIMEFRAME_INTERVAL_MS[timeframe];
}

/**
 * Keep historical requests inside the provider's intraday limits. The window
 * remains centered on the reviewed session, regardless of the broader context
 * range selected by the user.
 */
export function getReplayPeriodWindow(
  anchorDate: string,
  requestedSpanDays: number,
  timeframe: ReplayTimeframeId
): { period1: number; period2: number } | null {
  const anchorMs = Date.parse(`${anchorDate}T00:00:00Z`);
  if (!Number.isFinite(anchorMs)) return null;

  const requested = Math.max(1, Math.floor(requestedSpanDays || 1));
  const maxHalfSpan = timeframe === "1m" ? 3 : timeframe === "1d" ? requested : 29;
  const halfSpanDays = Math.min(requested, maxHalfSpan);

  return {
    period1: Math.floor((anchorMs - halfSpanDays * DAY_MS) / 1000),
    period2: Math.floor((anchorMs + halfSpanDays * DAY_MS) / 1000),
  };
}

export function inferCandleIntervalMs(
  candles: ReadonlyArray<{ time: number }>,
  fallbackMs: number
): number {
  const differences: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const difference = candles[index].time - candles[index - 1].time;
    if (Number.isFinite(difference) && difference > 0) differences.push(difference);
  }
  if (!differences.length) return fallbackMs;

  differences.sort((a, b) => a - b);
  return differences[Math.floor(differences.length / 2)] ?? fallbackMs;
}

/**
 * Candle timestamps represent the start of each interval. Map an execution to
 * the candle that contains it, never to a future candle merely because that
 * candle is mathematically closer.
 */
export function findContainingCandleIndex(
  candles: ReadonlyArray<{ time: number }>,
  targetMs: number,
  intervalMs: number
): number | null {
  if (!candles.length || !Number.isFinite(targetMs) || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return null;
  }

  let low = 0;
  let high = candles.length - 1;
  let candidate = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (candles[middle].time <= targetMs) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  if (candidate < 0) return null;
  const candleStart = candles[candidate].time;
  return targetMs - candleStart < intervalMs ? candidate : null;
}
