import "server-only";

import {
  addCalendarDays,
  type OptionFlowCandle,
  zonedDateTimeToUtc,
} from "@/lib/optionFlowLearning";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_CANDLES = 5_000;

const SYMBOL_MAP: Record<string, string> = {
  SPX: "^SPX",
  SPXW: "^SPX",
  NDX: "^NDX",
  NDXW: "^NDX",
  RUT: "^RUT",
  VIX: "^VIX",
  ES: "ES=F",
  NQ: "NQ=F",
  YM: "YM=F",
  RTY: "RTY=F",
};

export function optionFlowYahooSymbol(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9.^=-]/g, "").slice(0, 24);
  return SYMBOL_MAP[normalized] ?? normalized;
}

export async function fetchOptionFlowIntradayCandles(input: {
  underlying: string;
  startDate: string;
  endDate: string;
}): Promise<OptionFlowCandle[]> {
  const symbol = optionFlowYahooSymbol(input.underlying);
  if (!symbol) throw new Error("A valid underlying is required for market validation.");

  const period1 = Math.floor(zonedDateTimeToUtc(input.startDate, 0).getTime() / 1000);
  const period2 = Math.floor(
    zonedDateTimeToUtc(addCalendarDays(input.endDate, 1), 0).getTime() / 1000
  );
  if (!Number.isFinite(period1) || !Number.isFinite(period2) || period2 <= period1) {
    throw new Error("Invalid market-data period.");
  }

  const query = new URLSearchParams({
    interval: "5m",
    period1: String(period1),
    period2: String(period2),
    includePrePost: "false",
    events: "history",
  });
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Underlying market-data request failed with ${response.status}.`);
    }
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error("No underlying chart data was returned.");

    const timestamps: number[] = Array.isArray(result.timestamp) ? result.timestamp : [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const opens: unknown[] = Array.isArray(quote.open) ? quote.open : [];
    const highs: unknown[] = Array.isArray(quote.high) ? quote.high : [];
    const lows: unknown[] = Array.isArray(quote.low) ? quote.low : [];
    const closes: unknown[] = Array.isArray(quote.close) ? quote.close : [];

    return timestamps
      .map((timestamp, index) => ({
        time: Number(timestamp) * 1000,
        open: Number(opens[index]),
        high: Number(highs[index]),
        low: Number(lows[index]),
        close: Number(closes[index]),
      }))
      .filter(
        (candle) =>
          Number.isFinite(candle.time) &&
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close)
      )
      .slice(-MAX_CANDLES);
  } finally {
    clearTimeout(timer);
  }
}
