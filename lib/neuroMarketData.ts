import "server-only";

import {
  fetchNeuroExternalProviderSnapshot,
  type NeuroExternalProviderSnapshot,
  type NeuroExternalProviderStatus,
} from "@/lib/neuroDataProviders";

export type NeuroMarketData = {
  source: string;
  ticker: string;
  instrumentType?: "equity" | "etf" | "fund" | "unknown";
  symbol?: NeuroExternalProviderSnapshot["symbol"];
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
  fund?: {
    categoryName?: string | null;
    family?: string | null;
    legalType?: string | null;
    fundInceptionDate?: string | null;
    annualReportExpenseRatio?: number | null;
    netAssets?: number | null;
    yield?: number | null;
    ytdReturn?: number | null;
    threeYearAverageReturn?: number | null;
    fiveYearAverageReturn?: number | null;
    beta3Year?: number | null;
    topHoldings?: Array<{
      symbol?: string | null;
      holdingName?: string | null;
      holdingPercent?: number | null;
    }>;
    sectorWeightings?: Record<string, number | null>;
  } | null;
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
  macro?: NeuroExternalProviderSnapshot["macro"];
  dataQuality?: {
    degraded?: boolean;
    profileSource?: string | null;
    priceSource?: string | null;
    fundamentalsSource?: string | null;
    providerStatuses?: NeuroExternalProviderStatus[];
    messages?: string[];
  };
  errors?: Record<string, string | null>;
};

const MARKET_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};
const MARKET_FETCH_TIMEOUT_MS = 8_000;
const NASDAQ_HEADERS = {
  ...MARKET_HEADERS,
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
  "Accept-Language": "en-US,en;q=0.9",
};
const SEC_HEADERS = {
  "User-Agent": process.env.SEC_USER_AGENT || "NeuroTrader research platform contact@example.com",
  Accept: "application/json,text/plain,*/*",
};

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
  const raw = value?.reportedValue?.raw ?? value?.raw ?? value?.fmt ?? value;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const parsed = Number(trimmed.replace(/[$,\s]/g, "").replace(/%$/, ""));
    if (!Number.isFinite(parsed)) return null;
    return trimmed.endsWith("%") ? parsed / 100 : parsed;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchJson(url: string, headers: Record<string, string> = MARKET_HEADERS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MARKET_FETCH_TIMEOUT_MS);
  const res = await fetch(url, {
    headers,
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

function instrumentTypeFromQuoteType(value: unknown): NeuroMarketData["instrumentType"] {
  const quoteType = String(value ?? "").toUpperCase();
  if (quoteType.includes("ETF")) return "etf";
  if (quoteType.includes("MUTUALFUND") || quoteType === "FUND" || quoteType.includes("FUND")) return "fund";
  if (quoteType.includes("EQUITY") || quoteType.includes("STOCK") || quoteType.includes("COMMON")) return "equity";
  return "unknown";
}

export function isNeuroFundLikeMarketData(item?: Pick<NeuroMarketData, "instrumentType" | "company"> | null) {
  const instrumentType = String(item?.instrumentType ?? "").toLowerCase();
  const quoteType = String(item?.company?.quoteType ?? "").toUpperCase();
  return instrumentType === "etf" || instrumentType === "fund" || quoteType.includes("ETF") || quoteType.includes("FUND");
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

function normalizeTickerForNasdaq(ticker: string) {
  return ticker.toUpperCase().replace(/\./g, "-");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function yearsAgoIsoDate(years: number) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function parseNasdaqDate(value: unknown) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseNasdaqRange(value: unknown) {
  const [low, high] = String(value ?? "")
    .split(/\s+-\s+/)
    .map((part) => rawNumber(part));
  return { low: low ?? null, high: high ?? null };
}

function monthlyFromDailyRows(rows: Array<{ date: string; close: number }>) {
  const byMonth = new Map<string, { date: string; close: number }>();
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    byMonth.set(row.date.slice(0, 7), row);
  }
  return Array.from(byMonth.values());
}

function parseNasdaqHistoricalRows(history: any) {
  const rows = history?.data?.tradesTable?.rows;
  if (!Array.isArray(rows)) return [];

  const parsed = rows
    .map((row) => {
      const date = parseNasdaqDate(row?.date);
      const close = rawNumber(row?.close);
      if (!date || close == null) return null;
      return { date, close };
    })
    .filter(Boolean) as Array<{ date: string; close: number }>;

  return monthlyFromDailyRows(parsed);
}

async function fetchNasdaqAssetClass(ticker: string, assetClass: "stocks" | "etf") {
  const symbol = normalizeTickerForNasdaq(ticker);
  const [info, history] = await Promise.all([
    fetchJson(
      `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=${assetClass}`,
      NASDAQ_HEADERS
    ).catch((error) => ({ error: error.message })),
    fetchJson(
      `https://api.nasdaq.com/api/quote/${encodeURIComponent(
        symbol
      )}/historical?assetclass=${assetClass}&fromdate=${yearsAgoIsoDate(5)}&todate=${todayIsoDate()}&limit=9999`,
      NASDAQ_HEADERS
    ).catch((error) => ({ error: error.message })),
  ]);

  const infoData = info?.data ?? null;
  const priceRows = parseNasdaqHistoricalRows(history);
  const hasUsableInfo = Boolean(infoData?.symbol || infoData?.primaryData || infoData?.secondaryData);
  if (!hasUsableInfo && !priceRows.length) {
    throw new Error(info?.error || history?.error || `No ${assetClass} market data returned.`);
  }

  const range = parseNasdaqRange(infoData?.keyStats?.fiftyTwoWeekHighLow?.value);
  const primaryPrice = rawNumber(infoData?.primaryData?.lastSalePrice);
  const secondaryPrice = rawNumber(infoData?.secondaryData?.lastSalePrice);
  const latestHistoryPrice = priceRows.at(-1)?.close ?? null;
  const quoteType = assetClass === "etf" || String(infoData?.assetClass ?? "").toUpperCase() === "ETF" ? "ETF" : "EQUITY";

  return {
    source: "Market Data",
    ticker,
    instrumentType: instrumentTypeFromQuoteType(quoteType),
    company: {
      name: infoData?.companyName ?? ticker,
      shortName: infoData?.companyName ?? null,
      exchange: infoData?.exchange ?? null,
      sector: null,
      industry: null,
      quoteType,
      currency: "USD",
    },
    market: {
      regularMarketPrice: primaryPrice ?? secondaryPrice ?? latestHistoryPrice,
      fiftyTwoWeekHigh: range.high,
      fiftyTwoWeekLow: range.low,
      regularMarketVolume: rawNumber(infoData?.primaryData?.volume),
      previousClose: secondaryPrice ?? latestHistoryPrice,
      marketCap: null,
      trailingPE: null,
      forwardPE: null,
      priceToBook: null,
      dividendYield: null,
    },
    annualFundamentals: [],
    priceHistory: priceRows,
    yearlyPrice: buildYearlyPriceRows(priceRows),
    dataQuality: {
      profileSource: "nasdaq",
      priceSource: "nasdaq",
      fundamentalsSource: null,
      messages: [],
    },
    errors: {
      nasdaqInfo: info?.error ?? null,
      nasdaqHistory: history?.error ?? null,
    },
  } satisfies NeuroMarketData;
}

async function fetchNasdaqFallback(ticker: string) {
  const errors: string[] = [];
  for (const assetClass of ["stocks", "etf"] as const) {
    try {
      const data = await fetchNasdaqAssetClass(ticker, assetClass);
      if (data.market.regularMarketPrice != null || data.priceHistory.length || data.company.name !== ticker) return data;
    } catch (error: any) {
      errors.push(`${assetClass}: ${error?.message || "failed"}`);
    }
  }
  throw new Error(errors.join("; ") || "Nasdaq fallback failed.");
}

type SecTickerRow = {
  cik: number;
  name: string;
  ticker: string;
  exchange?: string | null;
};

let secTickerIndexPromise: Promise<Record<string, SecTickerRow>> | null = null;

async function secTickerIndex() {
  if (!secTickerIndexPromise) {
    secTickerIndexPromise = fetchJson("https://www.sec.gov/files/company_tickers_exchange.json", SEC_HEADERS).then((json) => {
      const fields = Array.isArray(json?.fields) ? json.fields : [];
      const tickerIndex = fields.indexOf("ticker");
      const cikIndex = fields.indexOf("cik");
      const nameIndex = fields.indexOf("name");
      const exchangeIndex = fields.indexOf("exchange");
      const out: Record<string, SecTickerRow> = {};
      for (const row of json?.data ?? []) {
        const ticker = sanitizeNeuroTicker(row?.[tickerIndex]);
        const cik = Number(row?.[cikIndex]);
        if (!ticker || !Number.isFinite(cik)) continue;
        out[ticker] = {
          ticker,
          cik,
          name: String(row?.[nameIndex] ?? ticker),
          exchange: exchangeIndex >= 0 ? String(row?.[exchangeIndex] ?? "") || null : null,
        };
      }
      return out;
    });
  }
  return secTickerIndexPromise;
}

function factUnits(companyFacts: any, namespace: "us-gaap" | "dei", concepts: string[], units: string[]) {
  const facts = companyFacts?.facts?.[namespace] ?? {};
  for (const concept of concepts) {
    const conceptUnits = facts?.[concept]?.units ?? {};
    for (const unit of units) {
      const rows = conceptUnits?.[unit];
      if (Array.isArray(rows) && rows.length) return rows;
    }
  }
  return [];
}

function daysBetween(start?: string, end?: string) {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
}

function annualFactMap(rows: any[]) {
  const byYear = new Map<number, any>();
  for (const row of rows) {
    const year = Number(row?.fy ?? String(row?.end ?? "").slice(0, 4));
    const value = rawNumber(row?.val);
    if (!year || value == null) continue;
    const form = String(row?.form ?? "");
    const fp = String(row?.fp ?? "");
    const duration = daysBetween(row?.start, row?.end);
    const annualFrame = /^CY\d{4}$/.test(String(row?.frame ?? ""));
    const annual = ["10-K", "20-F", "40-F"].includes(form) && (fp === "FY" || annualFrame || (duration != null && duration >= 250));
    if (!annual) continue;
    const existing = byYear.get(year);
    if (!existing || String(row?.filed ?? "") >= String(existing?.filed ?? "")) byYear.set(year, { ...row, value });
  }
  return Object.fromEntries(Array.from(byYear.entries()).map(([year, row]) => [year, row.value])) as Record<number, number>;
}

function instantFactMap(rows: any[]) {
  const byYear = new Map<number, any>();
  for (const row of rows) {
    const year = Number(row?.fy ?? String(row?.end ?? "").slice(0, 4));
    const value = rawNumber(row?.val);
    if (!year || value == null) continue;
    const form = String(row?.form ?? "");
    const fp = String(row?.fp ?? "");
    if (!["10-K", "20-F", "40-F"].includes(form) || (fp && fp !== "FY")) continue;
    const existing = byYear.get(year);
    if (!existing || String(row?.filed ?? "") >= String(existing?.filed ?? "")) byYear.set(year, { ...row, value });
  }
  return Object.fromEntries(Array.from(byYear.entries()).map(([year, row]) => [year, row.value])) as Record<number, number>;
}

function buildSecAnnualRows(companyFacts: any) {
  const revenue = annualFactMap(
    factUnits(companyFacts, "us-gaap", ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"], ["USD"])
  );
  const operatingIncome = annualFactMap(factUnits(companyFacts, "us-gaap", ["OperatingIncomeLoss"], ["USD"]));
  const netIncome = annualFactMap(factUnits(companyFacts, "us-gaap", ["NetIncomeLoss", "ProfitLoss"], ["USD"]));
  const operatingCashFlow = annualFactMap(
    factUnits(companyFacts, "us-gaap", ["NetCashProvidedByUsedInOperatingActivities"], ["USD"])
  );
  const capex = annualFactMap(
    factUnits(
      companyFacts,
      "us-gaap",
      ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
      ["USD"]
    )
  );
  const dilutedEPS = annualFactMap(factUnits(companyFacts, "us-gaap", ["EarningsPerShareDiluted"], ["USD/shares"]));
  const stockholdersEquity = instantFactMap(
    factUnits(
      companyFacts,
      "us-gaap",
      ["StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", "StockholdersEquity"],
      ["USD"]
    )
  );
  const longTermDebt = instantFactMap(
    factUnits(
      companyFacts,
      "us-gaap",
      ["LongTermDebtAndFinanceLeaseObligations", "LongTermDebt", "LongTermDebtNoncurrent"],
      ["USD"]
    )
  );
  const currentDebt = instantFactMap(
    factUnits(companyFacts, "us-gaap", ["LongTermDebtCurrent", "ShortTermBorrowings", "ShortTermDebt"], ["USD"])
  );

  const years = Array.from(
    new Set(
      [
        ...Object.keys(revenue),
        ...Object.keys(operatingIncome),
        ...Object.keys(netIncome),
        ...Object.keys(operatingCashFlow),
        ...Object.keys(stockholdersEquity),
      ].map(Number)
    )
  )
    .filter(Boolean)
    .sort((a, b) => a - b)
    .slice(-10);

  return years.map((year) => {
    const totalRevenue = revenue[year] ?? null;
    const cashFlow = operatingCashFlow[year] ?? null;
    const capexValue = capex[year] ?? null;
    const freeCashFlow = cashFlow != null ? cashFlow - Math.abs(capexValue ?? 0) : null;
    const totalDebt =
      longTermDebt[year] != null || currentDebt[year] != null
        ? (longTermDebt[year] ?? 0) + (currentDebt[year] ?? 0)
        : null;
    return {
      year,
      totalRevenue,
      operatingIncome: operatingIncome[year] ?? null,
      netIncome: netIncome[year] ?? null,
      operatingCashFlow: cashFlow,
      freeCashFlow,
      dilutedEPS: dilutedEPS[year] ?? null,
      totalDebt,
      stockholdersEquity: stockholdersEquity[year] ?? null,
      operatingMargin:
        totalRevenue && operatingIncome[year] != null ? operatingIncome[year] / totalRevenue : null,
      netMargin: totalRevenue && netIncome[year] != null ? netIncome[year] / totalRevenue : null,
      fcfMargin: totalRevenue && freeCashFlow != null ? freeCashFlow / totalRevenue : null,
      debtToEquity:
        stockholdersEquity[year] && totalDebt != null ? totalDebt / stockholdersEquity[year] : null,
    };
  });
}

async function fetchSecCompanyFallback(ticker: string) {
  const index = await secTickerIndex();
  const entry = index[ticker];
  if (!entry?.cik) throw new Error("SEC ticker not found.");
  const cik = String(entry.cik).padStart(10, "0");
  const facts = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, SEC_HEADERS);
  return {
    company: {
      name: facts?.entityName ?? entry.name ?? ticker,
      exchange: entry.exchange ?? null,
      quoteType: "EQUITY",
    },
    annualFundamentals: buildSecAnnualRows(facts),
  };
}

function normalizeWeightings(value: any) {
  const out: Record<string, number | null> = {};
  if (Array.isArray(value)) {
    for (const item of value) {
      for (const [key, raw] of Object.entries(item ?? {})) out[key] = rawNumber(raw);
    }
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, raw] of Object.entries(value)) out[key] = rawNumber(raw);
  }
  return out;
}

function buildFundProfile(quoteSummary: any) {
  const result = quoteSummary?.quoteSummary?.result?.[0] ?? null;
  if (!result) return null;
  const fundProfile = result?.fundProfile ?? {};
  const topHoldings = result?.topHoldings ?? {};
  const summaryDetail = result?.summaryDetail ?? {};
  const defaultKeyStatistics = result?.defaultKeyStatistics ?? {};
  const holdings = Array.isArray(topHoldings?.holdings)
    ? topHoldings.holdings.slice(0, 20).map((holding: any) => ({
        symbol: holding?.symbol ?? holding?.holdingSymbol ?? null,
        holdingName: holding?.holdingName ?? holding?.name ?? null,
        holdingPercent: rawNumber(holding?.holdingPercent),
      }))
    : [];

  const fund = {
    categoryName: fundProfile?.categoryName ?? null,
    family: fundProfile?.family ?? null,
    legalType: fundProfile?.legalType ?? null,
    fundInceptionDate: rawNumber(fundProfile?.fundInceptionDate)
      ? new Date(Number(rawNumber(fundProfile.fundInceptionDate)) * 1000).toISOString().slice(0, 10)
      : null,
    annualReportExpenseRatio:
      rawNumber(fundProfile?.annualReportExpenseRatio) ??
      rawNumber(fundProfile?.expenseRatio) ??
      rawNumber(summaryDetail?.annualReportExpenseRatio) ??
      null,
    netAssets: rawNumber(fundProfile?.totalNetAssets) ?? rawNumber(summaryDetail?.totalAssets) ?? null,
    yield: rawNumber(summaryDetail?.yield) ?? rawNumber(summaryDetail?.dividendYield) ?? null,
    ytdReturn: rawNumber(defaultKeyStatistics?.ytdReturn) ?? null,
    threeYearAverageReturn: rawNumber(defaultKeyStatistics?.threeYearAverageReturn) ?? null,
    fiveYearAverageReturn: rawNumber(defaultKeyStatistics?.fiveYearAverageReturn) ?? null,
    beta3Year: rawNumber(defaultKeyStatistics?.beta3Year) ?? null,
    topHoldings: holdings,
    sectorWeightings: normalizeWeightings(topHoldings?.sectorWeightings),
  };

  return Object.values(fund).some((value) =>
    Array.isArray(value) ? value.length > 0 : value && (typeof value !== "object" || Object.keys(value).length > 0)
  )
    ? fund
    : null;
}

function fundValueIsUsable(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return value !== null && value !== undefined && value !== "";
}

function mergeFundProfiles(
  primary: NeuroMarketData["fund"] | null | undefined,
  external: NeuroExternalProviderSnapshot["fund"] | null | undefined
) {
  const merged: NonNullable<NeuroMarketData["fund"]> = { ...(external ?? {}) };
  for (const [key, value] of Object.entries(primary ?? {})) {
    if (fundValueIsUsable(value)) (merged as Record<string, unknown>)[key] = value;
  }
  return Object.keys(merged).length ? merged : null;
}

export async function fetchNeuroMarketData(tickerInput: string): Promise<NeuroMarketData> {
  const ticker = sanitizeNeuroTicker(tickerInput);
  if (!ticker) throw new Error("Ticker is required.");

  const now = Math.floor(Date.now() / 1000);
  const tenYearsAgo = now - 60 * 60 * 24 * 365 * 10;
  const [search, quote, chart, fundamentals, quoteSummary, external] = await Promise.all([
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
    fetchJson(
      `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
        ticker
      )}?modules=fundProfile,topHoldings,summaryDetail,defaultKeyStatistics`
    ).catch((error) => ({ error: error.message })),
    fetchNeuroExternalProviderSnapshot(ticker).catch(
      (error): NeuroExternalProviderSnapshot => ({
        ticker,
        statuses: [
          {
            provider: "external_provider_router",
            configured: true,
            ok: false,
            message: error?.message || "External provider router failed.",
            fetchedAt: new Date().toISOString(),
          },
        ],
      })
    ),
  ]);

  const searchQuote = Array.isArray(search?.quotes) ? search.quotes[0] ?? null : null;
  const quoteRow = quote?.quoteResponse?.result?.[0] ?? null;
  const chartResult = chart?.chart?.result?.[0] ?? null;
  const externalCompany = external.company ?? null;
  const externalMarket = external.market ?? null;
  const yahooPriceRows = buildPriceRows(chart);
  const externalPriceRows = external.priceHistory ?? [];
  let priceRows = yahooPriceRows.length ? yahooPriceRows : externalPriceRows;
  const yahooAnnualFundamentals = buildAnnualRows(fundamentals);
  let annualFundamentals = yahooAnnualFundamentals;
  const yahooQuoteType = searchQuote?.quoteType ?? chartResult?.meta?.instrumentType ?? quoteRow?.quoteType ?? null;
  let nasdaqFallback: NeuroMarketData | null = null;
  let secFallback: Awaited<ReturnType<typeof fetchSecCompanyFallback>> | null = null;
  let nasdaqError: string | null = null;
  let secError: string | null = null;

  const hasExternalProfile = Boolean(externalCompany?.name || externalCompany?.shortName || external.symbol?.name);
  const hasExternalQuote = externalMarket?.regularMarketPrice != null;
  const hasExternalInstrumentType = Boolean(external.instrumentType && external.instrumentType !== "unknown");
  if (
    !priceRows.length ||
    (!quoteRow && !hasExternalQuote) ||
    (!searchQuote && !hasExternalProfile) ||
    !(yahooQuoteType ?? externalCompany?.quoteType ?? (hasExternalInstrumentType ? external.instrumentType : null))
  ) {
    try {
      nasdaqFallback = await fetchNasdaqFallback(ticker);
      if (!priceRows.length) priceRows = nasdaqFallback.priceHistory;
    } catch (error: any) {
      nasdaqError = error?.message || "Nasdaq fallback failed.";
    }
  }

  const preliminaryQuoteType = yahooQuoteType ?? externalCompany?.quoteType ?? nasdaqFallback?.company?.quoteType ?? null;
  const preliminaryInstrumentType =
    external.instrumentType && external.instrumentType !== "unknown"
      ? external.instrumentType
      : instrumentTypeFromQuoteType(preliminaryQuoteType);

  if (preliminaryInstrumentType !== "etf" && preliminaryInstrumentType !== "fund" && !annualFundamentals.length) {
    try {
      secFallback = await fetchSecCompanyFallback(ticker);
      annualFundamentals = secFallback.annualFundamentals;
    } catch (error: any) {
      secError = error?.message || "SEC company facts fallback failed.";
    }
  }

  const quoteType = preliminaryQuoteType ?? secFallback?.company?.quoteType ?? null;
  const instrumentType =
    external.instrumentType && external.instrumentType !== "unknown"
      ? external.instrumentType
      : instrumentTypeFromQuoteType(quoteType);
  const fundProfile = mergeFundProfiles(buildFundProfile(quoteSummary), external.fund ?? null);
  const priceSource = yahooPriceRows.length ? "primary" : externalPriceRows.length ? "external" : nasdaqFallback?.priceHistory.length ? "fallback" : null;
  const fundamentalsSource = yahooAnnualFundamentals.length ? "primary" : secFallback?.annualFundamentals.length ? "sec" : null;
  const profileSource =
    searchQuote || quoteRow
      ? "primary"
      : hasExternalProfile
        ? "external"
        : nasdaqFallback || secFallback
          ? "fallback"
          : null;
  const externalProviderError = external.statuses
    .filter((item) => item.configured && !item.ok && item.message)
    .map((item) => `${item.provider}: ${item.message}`)
    .join("; ");
  const fallbackMessages = [
    search?.error || quote?.error || chart?.error || fundamentals?.error
      ? "Primary market data was rate limited or incomplete; fallback data was used where available."
      : null,
    !priceRows.length ? "No price history was available from the configured market data sources." : null,
    instrumentType !== "etf" && instrumentType !== "fund" && !annualFundamentals.length
      ? "No annual company fundamentals were available from the configured data sources."
      : null,
    externalProviderError ? "One or more configured external market-data providers could not return data." : null,
  ].filter(Boolean) as string[];

  return {
    source: fallbackMessages.length ? "Market Data (multi-source degraded)" : "Market Data (multi-source)",
    ticker,
    instrumentType,
    symbol: external.symbol ?? null,
    company: {
      name:
        searchQuote?.longname ??
        chartResult?.meta?.longName ??
        quoteRow?.longName ??
        externalCompany?.name ??
        externalCompany?.shortName ??
        external.symbol?.name ??
        nasdaqFallback?.company?.name ??
        secFallback?.company?.name ??
        searchQuote?.shortname ??
        ticker,
      shortName:
        searchQuote?.shortname ??
        chartResult?.meta?.shortName ??
        quoteRow?.shortName ??
        externalCompany?.shortName ??
        externalCompany?.name ??
        nasdaqFallback?.company?.shortName ??
        null,
      exchange:
        searchQuote?.exchDisp ??
        chartResult?.meta?.fullExchangeName ??
        chartResult?.meta?.exchangeName ??
        quoteRow?.fullExchangeName ??
        externalCompany?.exchange ??
        external.symbol?.exchange ??
        nasdaqFallback?.company?.exchange ??
        secFallback?.company?.exchange ??
        null,
      sector: searchQuote?.sector ?? externalCompany?.sector ?? null,
      industry: searchQuote?.industry ?? externalCompany?.industry ?? null,
      quoteType,
      currency: chartResult?.meta?.currency ?? quoteRow?.currency ?? externalCompany?.currency ?? nasdaqFallback?.company?.currency ?? null,
    },
    market: {
      regularMarketPrice:
        chartResult?.meta?.regularMarketPrice ?? quoteRow?.regularMarketPrice ?? externalMarket?.regularMarketPrice ?? nasdaqFallback?.market?.regularMarketPrice ?? null,
      fiftyTwoWeekHigh:
        chartResult?.meta?.fiftyTwoWeekHigh ?? quoteRow?.fiftyTwoWeekHigh ?? externalMarket?.fiftyTwoWeekHigh ?? nasdaqFallback?.market?.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow:
        chartResult?.meta?.fiftyTwoWeekLow ?? quoteRow?.fiftyTwoWeekLow ?? externalMarket?.fiftyTwoWeekLow ?? nasdaqFallback?.market?.fiftyTwoWeekLow ?? null,
      regularMarketVolume:
        chartResult?.meta?.regularMarketVolume ?? quoteRow?.regularMarketVolume ?? externalMarket?.regularMarketVolume ?? nasdaqFallback?.market?.regularMarketVolume ?? null,
      previousClose:
        chartResult?.meta?.chartPreviousClose ?? quoteRow?.regularMarketPreviousClose ?? externalMarket?.previousClose ?? nasdaqFallback?.market?.previousClose ?? null,
      marketCap: quoteRow?.marketCap ?? searchQuote?.marketCap ?? externalMarket?.marketCap ?? nasdaqFallback?.market?.marketCap ?? null,
      trailingPE: quoteRow?.trailingPE ?? externalMarket?.trailingPE ?? nasdaqFallback?.market?.trailingPE ?? null,
      forwardPE: quoteRow?.forwardPE ?? externalMarket?.forwardPE ?? nasdaqFallback?.market?.forwardPE ?? null,
      priceToBook: quoteRow?.priceToBook ?? externalMarket?.priceToBook ?? nasdaqFallback?.market?.priceToBook ?? null,
      dividendYield: quoteRow?.dividendYield ?? externalMarket?.dividendYield ?? nasdaqFallback?.market?.dividendYield ?? null,
    },
    fund: fundProfile,
    annualFundamentals,
    priceHistory: priceRows,
    yearlyPrice: buildYearlyPriceRows(priceRows),
    macro: external.macro,
    dataQuality: {
      degraded: fallbackMessages.length > 0,
      profileSource,
      priceSource,
      fundamentalsSource,
      providerStatuses: external.statuses,
      messages: fallbackMessages,
    },
    errors: {
      search: search?.error ?? null,
      quote: quote?.error ?? quote?.quoteResponse?.error ?? null,
      chart: chart?.error ?? chart?.chart?.error ?? null,
      fundamentals: fundamentals?.error ?? fundamentals?.timeseries?.error ?? null,
      quoteSummary: quoteSummary?.error ?? quoteSummary?.quoteSummary?.error ?? null,
      externalProviders: externalProviderError || null,
      nasdaq: nasdaqError,
      sec: secError,
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
