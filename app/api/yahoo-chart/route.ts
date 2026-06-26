// app/api/yahoo-chart/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rateLimit";

const DEFAULT_INTERVAL = "5m";
const DEFAULT_RANGE = "5d";
const FETCH_TIMEOUT_MS = 5_000;
const MAX_CANDLES = 5_000;
const MAX_DAILY_RANGE_DAYS = 730;
const MAX_INTRADAY_RANGE_DAYS = 60;
const ALLOWED_INTERVALS = new Set([
  "1m",
  "2m",
  "5m",
  "15m",
  "30m",
  "60m",
  "90m",
  "1h",
  "1d",
  "5d",
  "1wk",
  "1mo",
  "3mo",
]);
const ALLOWED_RANGES = new Set(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y"]);

function isIntradayInterval(interval: string) {
  return ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"].includes(interval);
}

function maxPeriodDays(interval: string) {
  return isIntradayInterval(interval) ? MAX_INTRADAY_RANGE_DAYS : MAX_DAILY_RANGE_DAYS;
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      cache: "force-cache",
      next: { revalidate: 30 },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(req: NextRequest) {
  const limiter = await rateLimit(`yahoo-chart:ip:${getClientIp(req)}`, {
    limit: 120,
    windowMs: 60_000,
  });
  if (!limiter.allowed) {
    const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          ...rateLimitHeaders(limiter),
        },
      }
    );
  }

  const { searchParams } = new URL(req.url);

  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const interval = searchParams.get("interval") || DEFAULT_INTERVAL;
  const range = searchParams.get("range") || DEFAULT_RANGE;
  const period1Raw = searchParams.get("period1");
  const period2Raw = searchParams.get("period2");

  const period1 = period1Raw ? Number(period1Raw) : null;
  const period2 = period2Raw ? Number(period2Raw) : null;
  const hasPeriodRange =
    Number.isFinite(period1) &&
    Number.isFinite(period2) &&
    period1 !== null &&
    period2 !== null &&
    period2 > period1;

  if (!symbol || !/^[A-Z0-9.^=-]{1,24}$/.test(symbol)) {
    return NextResponse.json(
      { error: "Invalid symbol" },
      { status: 400 }
    );
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: "Invalid interval" }, { status: 400 });
  }
  if (!hasPeriodRange && !ALLOWED_RANGES.has(range)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }
  if (hasPeriodRange) {
    const periodDays = ((period2 as number) - (period1 as number)) / 86_400;
    if (periodDays <= 0 || periodDays > maxPeriodDays(interval)) {
      return NextResponse.json(
        { error: `Requested period is too large for interval ${interval}.` },
        { status: 400 }
      );
    }
  }

  const query = new URLSearchParams();
  query.set("interval", interval);
  if (hasPeriodRange) {
    query.set("period1", String(Math.floor(period1 as number)));
    query.set("period2", String(Math.floor(period2 as number)));
  } else {
    query.set("range", range);
  }

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?${query.toString()}`;

  try {
    const res = await fetchWithTimeout(yahooUrl);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Yahoo Finance request failed" },
        { status: res.status }
      );
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];

    if (!result) {
      return NextResponse.json(
        { error: "No chart data available" },
        { status: 500 }
      );
    }

    const timestamps: number[] = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const opens: number[] = quote.open || [];
    const highs: number[] = quote.high || [];
    const lows: number[] = quote.low || [];
    const closes: number[] = quote.close || [];

    const candles = timestamps
      .map((ts, idx) => ({
        time: ts * 1000, // ms
        open: opens[idx],
        high: highs[idx],
        low: lows[idx],
        close: closes[idx],
      }))
      .filter(
        (c) =>
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close)
      )
      .slice(-MAX_CANDLES);

    return NextResponse.json(
      { candles },
      {
        headers: {
          ...rateLimitHeaders(limiter),
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      }
    );
  } catch (err) {
    console.error("Yahoo Finance API error", err);
    return NextResponse.json(
      { error: "Unexpected error calling Yahoo" },
      { status: 500 }
    );
  }
}
