import "server-only";

import {
  addCalendarDays,
  marketDateKey,
  type OptionFlowCandle,
  zonedDateTimeToUtc,
} from "@/lib/optionFlowLearning";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_CANDLES = 5_000;
const MAX_OPTION_CANDLES = 10_000;
const MAX_DAILY_BARS = 800;

export type OptionFlowDailyMarketBar = {
  symbol: string;
  sessionDate: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number | null;
  volume: number | null;
  currency: string | null;
  exchange: string | null;
  sourceId: "yahoo";
  sourceReference: string;
  availableAt: string;
  raw: Record<string, unknown>;
};

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

export function optionFlowYahooContractSymbol(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{1,8}\d{6}[CP]\d{8}$/.test(normalized) ? normalized : "";
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

export async function fetchOptionFlowContractCandles(input: {
  contract: string;
  startDate: string;
  endDate: string;
}): Promise<OptionFlowCandle[]> {
  const symbol = optionFlowYahooContractSymbol(input.contract);
  if (!symbol) return [];
  const period1 = Math.floor(zonedDateTimeToUtc(input.startDate, 0).getTime() / 1000);
  const period2 = Math.floor(
    zonedDateTimeToUtc(addCalendarDays(input.endDate, 1), 0).getTime() / 1000
  );
  if (!Number.isFinite(period1) || !Number.isFinite(period2) || period2 <= period1) return [];

  const query = new URLSearchParams({
    interval: "1m",
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
    if (!response.ok) return [];
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    const timestamps: number[] = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const quote = result?.indicators?.quote?.[0] ?? {};
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
      .slice(-MAX_OPTION_CANDLES);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOptionFlowDailyBars(input: {
  underlying: string;
  startDate: string;
  endDate: string;
}): Promise<OptionFlowDailyMarketBar[]> {
  const symbol = optionFlowYahooSymbol(input.underlying);
  if (!symbol) throw new Error("A valid underlying is required for daily market data.");

  const period1 = Math.floor(zonedDateTimeToUtc(input.startDate, 0).getTime() / 1000);
  const period2 = Math.floor(
    zonedDateTimeToUtc(addCalendarDays(input.endDate, 2), 0).getTime() / 1000
  );
  if (!Number.isFinite(period1) || !Number.isFinite(period2) || period2 <= period1) {
    throw new Error("Invalid daily market-data period.");
  }

  const query = new URLSearchParams({
    interval: "1d",
    period1: String(period1),
    period2: String(period2),
    includePrePost: "false",
    events: "div,splits",
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
      throw new Error(`Daily market-data request failed with ${response.status}.`);
    }
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    if (!result) throw new Error("No daily market data was returned.");

    const timestamps: number[] = Array.isArray(result.timestamp) ? result.timestamp : [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const adjusted = result.indicators?.adjclose?.[0]?.adjclose ?? [];
    const meta = result.meta ?? {};
    const sourceReference = url;
    const availableAt = new Date().toISOString();

    return timestamps
      .map((timestamp, index) => {
        const open = Number(quote.open?.[index]);
        const high = Number(quote.high?.[index]);
        const low = Number(quote.low?.[index]);
        const close = Number(quote.close?.[index]);
        const adjustedClose = Number(adjusted?.[index]);
        const volume = Number(quote.volume?.[index]);
        return {
          symbol: input.underlying.trim().toUpperCase(),
          sessionDate: marketDateKey(Number(timestamp) * 1000),
          time: Number(timestamp) * 1000,
          open,
          high,
          low,
          close,
          adjustedClose: Number.isFinite(adjustedClose) ? adjustedClose : null,
          volume: Number.isFinite(volume) ? volume : null,
          currency: typeof meta.currency === "string" ? meta.currency : null,
          exchange:
            typeof meta.fullExchangeName === "string"
              ? meta.fullExchangeName
              : typeof meta.exchangeName === "string"
                ? meta.exchangeName
                : null,
          sourceId: "yahoo" as const,
          sourceReference,
          availableAt,
          raw: {
            timestamp,
            exchangeTimezoneName: meta.exchangeTimezoneName ?? null,
            gmtoffset: meta.gmtoffset ?? null,
          },
        };
      })
      .filter(
        (bar) =>
          /^\d{4}-\d{2}-\d{2}$/.test(bar.sessionDate) &&
          [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) &&
          bar.high >= Math.max(bar.open, bar.close, bar.low) &&
          bar.low <= Math.min(bar.open, bar.close, bar.high)
      )
      .slice(-MAX_DAILY_BARS);
  } finally {
    clearTimeout(timer);
  }
}
