import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { fetchNeuroMarketData, mapWithConcurrency, sanitizeNeuroTicker } from "@/lib/neuroMarketData";
import { checkNeuroQuota, recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

function parseTickers(url: URL) {
  const raw = url.searchParams.get("tickers") || url.searchParams.get("ticker") || "";
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => sanitizeNeuroTicker(value))
        .filter(Boolean)
    )
  ).slice(0, 25);
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const limiter = await rateLimit(`neuro-analysis:market:${authUser.userId}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limiter.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(retryAfter), ...rateLimitHeaders(limiter) } }
      );
    }

    const quota = await checkNeuroQuota(authUser.userId, "market_data");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "Monthly market data quota exceeded.", quota },
        { status: 429, headers: rateLimitHeaders({ ...limiter, remaining: 0 }) }
      );
    }

    const url = new URL(req.url);
    const tickers = parseTickers(url);
    if (!tickers.length) {
      return NextResponse.json({ error: "Ticker is required." }, { status: 400 });
    }

    const results = await mapWithConcurrency(tickers, 4, async (ticker) => {
      try {
        return [ticker, await fetchNeuroMarketData(ticker)] as const;
      } catch (error: any) {
        return [
          ticker,
          {
            source: "Market Data (unavailable)",
            ticker,
            company: { name: ticker },
            market: {},
            annualFundamentals: [],
            priceHistory: [],
            yearlyPrice: [],
            dataQuality: {
              degraded: true,
              profileSource: null,
              priceSource: null,
              fundamentalsSource: null,
              messages: [error?.message || "Market request failed."],
            },
            errors: { request: error?.message || "Market request failed." },
          },
        ] as const;
      }
    });

    await recordNeuroUsage({
      userId: authUser.userId,
      eventType: "market_data",
      units: tickers.length,
      metadata: { tickers },
    });

    const items = Object.fromEntries(results);
    if (tickers.length === 1 && !url.searchParams.get("tickers")) {
      return NextResponse.json(items[tickers[0]]);
    }

    return NextResponse.json({
      source: "Market Data",
      tickers,
      items,
      quota: { remaining: quota.remaining, limit: quota.limit },
    });
  } catch (error: any) {
    console.error("[neuro-analysis/market-data] error:", error);
    return NextResponse.json(
      { error: error?.message || "Market data failed." },
      { status: 500 }
    );
  }
}
