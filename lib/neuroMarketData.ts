import "server-only";

export type NeuroMarketData = {
  source: string;
  ticker: string;
  company: {
    name?: string | null;
    shortName?: string | null;
    exchange?: string | null;
    sector?: string | null;
    industry?: string | null;
    quoteType?: string | null;
    currency?: string | null;
  };
  market: {
    regularMarketPrice?: number | null;
    fiftyTwoWeekHigh?: number | null;
    fiftyTwoWeekLow?: number | null;
    regularMarketVolume?: number | null;
    previousClose?: number | null;
    marketCap?: number | null;
    trailingPE?: number | null;
    forwardPE?: number | null;
    priceToBook?: number | null;
    dividendYield?: number | null;
  };
  annualFundamentals: Array<{
    year: number;
    totalRevenue?: number | null;
    operatingIncome?: number | null;
    netIncome?: number | null;
    operatingCashFlow?: number | null;
    freeCashFlow?: number | null;
    dilutedEPS?: number | null;
    totalDebt?: number | null;
    stockholdersEquity?: number | null;
    operatingMargin?: number | null;
    netMargin?: number | null;
    fcfMargin?: number | null;
    debtToEquity?: number | null;
  }>;
  priceHistory: Array<{ date: string; close: number }>;
  yearlyPrice: Array<{ year: number; firstClose: number; lastClose: number; returnPct?: number | null }>;
  errors?: Record<string, string | null>;
};

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

export function sanitizeNeuroTicker(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
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
    .filter(Boolean) as Array<{ date: string; close: number }>;
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

export async function fetchNeuroMarketData(tickerInput: string): Promise<NeuroMarketData> {
  const ticker = sanitizeNeuroTicker(tickerInput);
  if (!ticker) throw new Error("Ticker is required.");

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

export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}
