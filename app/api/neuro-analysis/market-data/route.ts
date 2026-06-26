import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { checkNeuroQuota, recordNeuroUsage } from "@/lib/neuroAnalysisQuota";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";

const MARKET_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};
const MARKET_FETCH_TIMEOUT_MS = 8_000;

const FUNDAMENTAL_TYPES = [
  "annualTotalRevenue",
  "annualOperatingIncome",
  "annualNetIncome",
  "annualOperatingCashFlow",
  "annualFreeCashFlow",
  "annualDilutedEPS",
  "annualTotalDebt",
  "annualStockholdersEquity",
].join(",");

function sanitizeTicker(value: string | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function parseTickers(url: URL) {
  const raw = url.searchParams.get("tickers") || url.searchParams.get("ticker") || "";
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => sanitizeTicker(value))
        .filter(Boolean)
    )
  ).slice(0, 25);
}

function rawNumber(value: any) {
  const raw = value?.reportedValue?.raw ?? value?.raw ?? value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MARKET_FETCH_TIMEOUT_MS);
  const res = await fetch(url, {
    headers: MARKET_HEADERS,
    cache: "force-cache",
    next: { revalidate: 300 },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 240) || `Market data request failed with ${res.status}`);
  }
  return JSON.parse(text);
}

function buildAnnualRows(timeseries: any) {
  const rows = new Map<string, any>();
  for (const result of timeseries?.timeseries?.result ?? []) {
    const type = String(result?.meta?.type?.[0] ?? "");
    const points = Array.isArray(result?.[type]) ? result[type] : [];
    const metric = type.replace(/^annual/, "");
    const key = metric.charAt(0).toLowerCase() + metric.slice(1);

    for (const point of points) {
      const asOfDate = String(point?.asOfDate ?? "");
      const year = Number(asOfDate.slice(0, 4));
      if (!year) continue;
      const existing = rows.get(String(year)) ?? { year, asOfDate };
      existing[key] = rawNumber(point);
      rows.set(String(year), existing);
    }
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      operatingMargin:
        row.totalRevenue && row.operatingIncome != null ? row.operatingIncome / row.totalRevenue : null,
      netMargin: row.totalRevenue && row.netIncome != null ? row.netIncome / row.totalRevenue : null,
      fcfMargin: row.totalRevenue && row.freeCashFlow != null ? row.freeCashFlow / row.totalRevenue : null,
      debtToEquity:
        row.stockholdersEquity && row.totalDebt != null ? row.totalDebt / row.stockholdersEquity : null,
    }))
    .sort((a, b) => a.year - b.year);
}

function buildPriceRows(chart: any) {
  const result = chart?.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0] ?? {};
  const closes = quote.close ?? [];

  return timestamps
    .map((timestamp: number, index: number) => {
      const close = Number(closes[index]);
      if (!Number.isFinite(close)) return null;
      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        close,
      };
    })
    .filter(Boolean);
}

function buildYearlyPriceRows(priceRows: Array<{ date: string; close: number }>) {
  const byYear = new Map<number, { year: number; firstClose: number; lastClose: number }>();
  for (const row of priceRows) {
    const year = Number(row.date.slice(0, 4));
    if (!year) continue;
    const existing = byYear.get(year);
    if (!existing) byYear.set(year, { year, firstClose: row.close, lastClose: row.close });
    else existing.lastClose = row.close;
  }

  return Array.from(byYear.values()).map((row) => ({
    ...row,
    returnPct: row.firstClose > 0 ? row.lastClose / row.firstClose - 1 : null,
  }));
}

async function fetchMarketData(ticker: string) {
  const now = Math.floor(Date.now() / 1000);
  const tenYearsAgo = now - 60 * 60 * 24 * 365 * 10;
  const [search, quote, chart, fundamentals] = await Promise.all([
    fetchJson(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
        ticker
      )}&quotesCount=1&newsCount=0`
    ).catch((error) => ({ error: error.message })),
    fetchJson(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
    ).catch((error) => ({ error: error.message })),
    fetchJson(
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        ticker
      )}?range=5y&interval=1mo`
    ).catch((error) => ({ error: error.message })),
    fetchJson(
      `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(
        ticker
      )}?symbol=${encodeURIComponent(ticker)}&type=${FUNDAMENTAL_TYPES}&merge=false&period1=${tenYearsAgo}&period2=${now}`
    ).catch((error) => ({ error: error.message })),
  ]);

  const searchQuote = Array.isArray(search?.quotes) ? search.quotes[0] ?? null : null;
  const quoteRow = quote?.quoteResponse?.result?.[0] ?? null;
  const chartResult = chart?.chart?.result?.[0] ?? null;
  const priceRows = buildPriceRows(chart);
  const annualFundamentals = buildAnnualRows(fundamentals);

  return {
    source: "Market Data",
    ticker,
    company: {
      name: searchQuote?.longname ?? chartResult?.meta?.longName ?? quoteRow?.longName ?? searchQuote?.shortname ?? ticker,
      shortName: searchQuote?.shortname ?? chartResult?.meta?.shortName ?? quoteRow?.shortName ?? null,
      exchange: searchQuote?.exchDisp ?? chartResult?.meta?.fullExchangeName ?? chartResult?.meta?.exchangeName ?? quoteRow?.fullExchangeName ?? null,
      sector: searchQuote?.sector ?? null,
      industry: searchQuote?.industry ?? null,
      quoteType: searchQuote?.quoteType ?? chartResult?.meta?.instrumentType ?? quoteRow?.quoteType ?? null,
      currency: chartResult?.meta?.currency ?? quoteRow?.currency ?? null,
    },
    market: {
      regularMarketPrice: chartResult?.meta?.regularMarketPrice ?? quoteRow?.regularMarketPrice ?? null,
      fiftyTwoWeekHigh: chartResult?.meta?.fiftyTwoWeekHigh ?? quoteRow?.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: chartResult?.meta?.fiftyTwoWeekLow ?? quoteRow?.fiftyTwoWeekLow ?? null,
      regularMarketVolume: chartResult?.meta?.regularMarketVolume ?? quoteRow?.regularMarketVolume ?? null,
      previousClose: chartResult?.meta?.chartPreviousClose ?? quoteRow?.regularMarketPreviousClose ?? null,
      marketCap: quoteRow?.marketCap ?? searchQuote?.marketCap ?? null,
      trailingPE: quoteRow?.trailingPE ?? null,
      forwardPE: quoteRow?.forwardPE ?? null,
      priceToBook: quoteRow?.priceToBook ?? null,
      dividendYield: quoteRow?.dividendYield ?? null,
    },
    annualFundamentals,
    priceHistory: priceRows,
    yearlyPrice: buildYearlyPriceRows(priceRows),
    errors: {
      search: search?.error ?? null,
      quote: quote?.error ?? quote?.quoteResponse?.error ?? null,
      chart: chart?.error ?? chart?.chart?.error ?? null,
      fundamentals: fundamentals?.error ?? fundamentals?.timeseries?.error ?? null,
    },
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
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

    const results = await mapLimit(tickers, 4, async (ticker) => {
      try {
        return [ticker, await fetchMarketData(ticker)] as const;
      } catch (error: any) {
        return [
          ticker,
          {
            source: "Market Data",
            ticker,
            company: { name: ticker },
            market: {},
            annualFundamentals: [],
            priceHistory: [],
            yearlyPrice: [],
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
