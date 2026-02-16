// app/api/yahoo-chart/route.ts
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_INTERVAL = "5m";
const DEFAULT_RANGE = "5d";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const symbol = searchParams.get("symbol");
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

  if (!symbol) {
    return NextResponse.json(
      { error: "Missing symbol" },
      { status: 400 }
    );
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
    const res = await fetch(yahooUrl, {
      cache: "no-store",
    });

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
      );

    return NextResponse.json({ candles });
  } catch (err) {
    console.error("Yahoo Finance API error", err);
    return NextResponse.json(
      { error: "Unexpected error calling Yahoo" },
      { status: 500 }
    );
  }
}
