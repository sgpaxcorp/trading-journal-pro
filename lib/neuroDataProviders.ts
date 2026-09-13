import "server-only";

export type NeuroExternalProviderStatus = {
  provider: string;
  configured: boolean;
  ok: boolean;
  message?: string | null;
  fetchedAt?: string;
};

export type NeuroExternalPriceRow = { date: string; close: number };

export type NeuroExternalProviderSnapshot = {
  ticker: string;
  statuses: NeuroExternalProviderStatus[];
  symbol?: {
    figi?: string | null;
    compositeFigi?: string | null;
    shareClassFigi?: string | null;
    name?: string | null;
    exchange?: string | null;
    securityType?: string | null;
    securityType2?: string | null;
    marketSector?: string | null;
  } | null;
  instrumentType?: "equity" | "etf" | "fund" | "unknown";
  company?: {
    name?: string | null;
    shortName?: string | null;
    exchange?: string | null;
    sector?: string | null;
    industry?: string | null;
    quoteType?: string | null;
    currency?: string | null;
  } | null;
  market?: {
    regularMarketPrice?: number | null;
    previousClose?: number | null;
    fiftyTwoWeekHigh?: number | null;
    fiftyTwoWeekLow?: number | null;
    regularMarketVolume?: number | null;
    marketCap?: number | null;
    trailingPE?: number | null;
    forwardPE?: number | null;
    priceToBook?: number | null;
    dividendYield?: number | null;
  } | null;
  fund?: {
    annualReportExpenseRatio?: number | null;
    netAssets?: number | null;
    yield?: number | null;
    topHoldings?: Array<{ symbol?: string | null; holdingName?: string | null; holdingPercent?: number | null }>;
    sectorWeightings?: Record<string, number | null>;
  } | null;
  priceHistory?: NeuroExternalPriceRow[];
  macro?: {
    fred?: Record<string, { value: number | null; date?: string | null }> | null;
    bls?: Record<string, { value: number | null; period?: string | null; year?: string | null }> | null;
    bea?: { latestGdp?: number | null; period?: string | null; year?: string | null } | null;
    treasury?: { averageInterestRate?: number | null; recordDate?: string | null } | null;
  };
};

const PROVIDER_FETCH_TIMEOUT_MS = 8_000;
const PROVIDER_HEADERS = {
  "User-Agent":
    process.env.SEC_USER_AGENT ||
    process.env.NEURO_ANALYSIS_SEC_USER_AGENT ||
    "NeuroTrader research platform support@neurotrader-journal.com",
  Accept: "application/json,text/plain,*/*",
};

function envValue(name: string) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower.includes("your_") || lower.endsWith("_xxx") || lower === "demo") return "";
  return value;
}

function status(provider: string, configured: boolean, ok: boolean, message?: string | null): NeuroExternalProviderStatus {
  return { provider, configured, ok, message: message ?? null, fetchedAt: new Date().toISOString() };
}

function rawNumber(value: unknown) {
  const raw =
    typeof value === "object" && value
      ? (value as any).raw ?? (value as any).fmt ?? (value as any).value ?? value
      : value;
  const text = String(raw ?? "").trim();
  if (!text || text === "." || text.toLowerCase() === "nan") return null;
  const parsed = Number(text.replace(/[$,\s]/g, "").replace(/%$/, ""));
  if (!Number.isFinite(parsed)) return null;
  return text.endsWith("%") ? parsed / 100 : parsed;
}

async function fetchProviderJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_FETCH_TIMEOUT_MS);
  const res = await fetch(url, {
    headers: PROVIDER_HEADERS,
    cache: "force-cache",
    next: { revalidate: 900 },
    ...init,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 240) || `Request failed with ${res.status}`);
  return JSON.parse(text);
}

function providerError(json: any) {
  if (json?.["Error Message"]) return json["Error Message"];
  if (json?.Note) return json.Note;
  if (json?.Information) return json.Information;
  if (json?.status === "error") return json?.message || "Provider returned an error status.";
  if (json?.message && !json?.data && !json?.values) return json.message;
  return null;
}

function instrumentTypeFromText(value: unknown): NeuroExternalProviderSnapshot["instrumentType"] {
  const text = String(value ?? "").toUpperCase();
  if (text.includes("ETF") || text.includes("EXCHANGE TRADED")) return "etf";
  if (text.includes("FUND") || text.includes("MUTUAL")) return "fund";
  if (text.includes("COMMON") || text.includes("EQUITY") || text.includes("STOCK")) return "equity";
  return "unknown";
}

function mergeDefined<T extends Record<string, any>>(...items: Array<T | null | undefined>) {
  const out: Record<string, any> = {};
  for (const item of items) {
    if (!item) continue;
    for (const [key, value] of Object.entries(item)) {
      if (value !== null && value !== undefined && value !== "") out[key] = value;
    }
  }
  return out as T;
}

function normalizeMonthlyRows(rows: Array<{ date: string; close: number }>) {
  const byMonth = new Map<string, { date: string; close: number }>();
  for (const row of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    if (Number.isFinite(row.close)) byMonth.set(row.date.slice(0, 7), row);
  }
  return Array.from(byMonth.values()).slice(-120);
}

async function fetchOpenFigi(ticker: string) {
  const key = envValue("OPENFIGI_API_KEY");
  const headers: Record<string, string> = { ...PROVIDER_HEADERS, "Content-Type": "application/json" };
  if (key) headers["X-OPENFIGI-APIKEY"] = key;
  const json = await fetchProviderJson("https://api.openfigi.com/v3/mapping", {
    method: "POST",
    headers,
    body: JSON.stringify([{ idType: "TICKER", idValue: ticker, exchCode: "US" }]),
  });
  const row = Array.isArray(json?.[0]?.data) ? json[0].data[0] : null;
  if (!row) throw new Error(json?.[0]?.error || "OpenFIGI did not return a mapping.");
  const instrumentType = instrumentTypeFromText(row.securityType2 || row.securityType || row.marketSector);
  return {
    status: status("openfigi", true, true),
    symbol: {
      figi: row.figi ?? null,
      compositeFigi: row.compositeFIGI ?? null,
      shareClassFigi: row.shareClassFIGI ?? null,
      name: row.name ?? null,
      exchange: row.exchCode ?? null,
      securityType: row.securityType ?? null,
      securityType2: row.securityType2 ?? null,
      marketSector: row.marketSector ?? null,
    },
    instrumentType,
    company: {
      name: row.name ?? null,
      exchange: row.exchCode ?? null,
      quoteType: instrumentType === "etf" ? "ETF" : instrumentType === "fund" ? "FUND" : "EQUITY",
    },
  };
}

async function fetchAlphaVantage(ticker: string) {
  const key = envValue("ALPHA_VANTAGE_API_KEY");
  if (!key) return { status: status("alpha_vantage", false, false, "Missing ALPHA_VANTAGE_API_KEY") };

  const base = "https://www.alphavantage.co/query";
  const url = (params: Record<string, string>) => {
    const query = new URLSearchParams({ ...params, symbol: ticker, apikey: key });
    return `${base}?${query.toString()}`;
  };
  const [quote, monthly, overview, etfProfile] = await Promise.all([
    fetchProviderJson(url({ function: "GLOBAL_QUOTE" })).catch((error) => ({ error: error.message })),
    fetchProviderJson(url({ function: "TIME_SERIES_MONTHLY_ADJUSTED" })).catch((error) => ({ error: error.message })),
    fetchProviderJson(url({ function: "OVERVIEW" })).catch((error) => ({ error: error.message })),
    fetchProviderJson(url({ function: "ETF_PROFILE" })).catch((error) => ({ error: error.message })),
  ]);

  const error = providerError(quote) || providerError(monthly) || providerError(overview);
  if (error) throw new Error(String(error));

  const quoteRow = quote?.["Global Quote"] ?? {};
  const series = monthly?.["Monthly Adjusted Time Series"] ?? {};
  const priceHistory = normalizeMonthlyRows(
    Object.entries(series).map(([date, row]: [string, any]) => ({
      date,
      close: rawNumber(row?.["5. adjusted close"] ?? row?.["4. close"]) ?? 0,
    }))
  );
  const etfHoldings = Array.isArray(etfProfile?.holdings)
    ? etfProfile.holdings.slice(0, 20).map((holding: any) => ({
        symbol: holding?.symbol ?? null,
        holdingName: holding?.description ?? holding?.name ?? null,
        holdingPercent: rawNumber(holding?.weight),
      }))
    : [];

  return {
    status: status("alpha_vantage", true, true),
    company: {
      name: overview?.Name ?? null,
      exchange: overview?.Exchange ?? null,
      sector: overview?.Sector ?? null,
      industry: overview?.Industry ?? null,
      quoteType: etfProfile && !etfProfile.error ? "ETF" : overview?.AssetType ?? null,
      currency: overview?.Currency ?? null,
    },
    market: {
      regularMarketPrice: rawNumber(quoteRow?.["05. price"]),
      previousClose: rawNumber(quoteRow?.["08. previous close"]),
      regularMarketVolume: rawNumber(quoteRow?.["06. volume"]),
      marketCap: rawNumber(overview?.MarketCapitalization),
      trailingPE: rawNumber(overview?.PERatio),
      forwardPE: rawNumber(overview?.ForwardPE),
      priceToBook: rawNumber(overview?.PriceToBookRatio),
      dividendYield: rawNumber(overview?.DividendYield),
    },
    priceHistory,
    fund:
      etfHoldings.length || etfProfile?.net_assets || etfProfile?.net_expense_ratio
        ? {
            netAssets: rawNumber(etfProfile?.net_assets),
            annualReportExpenseRatio: rawNumber(etfProfile?.net_expense_ratio),
            yield: rawNumber(etfProfile?.dividend_yield),
            topHoldings: etfHoldings,
          }
        : null,
  };
}

async function fetchTwelveData(ticker: string) {
  const key = envValue("TWELVE_DATA_API_KEY");
  if (!key) return { status: status("twelve_data", false, false, "Missing TWELVE_DATA_API_KEY") };
  const base = "https://api.twelvedata.com";
  const [quote, timeSeries, profile] = await Promise.all([
    fetchProviderJson(`${base}/quote?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`).catch((error) => ({ error: error.message })),
    fetchProviderJson(
      `${base}/time_series?symbol=${encodeURIComponent(ticker)}&interval=1month&outputsize=120&apikey=${encodeURIComponent(key)}`
    ).catch((error) => ({ error: error.message })),
    fetchProviderJson(`${base}/profile?symbol=${encodeURIComponent(ticker)}&apikey=${encodeURIComponent(key)}`).catch((error) => ({ error: error.message })),
  ]);
  const error = providerError(quote) || providerError(timeSeries);
  if (error) throw new Error(String(error));

  const priceHistory = normalizeMonthlyRows(
    (Array.isArray(timeSeries?.values) ? timeSeries.values : []).map((row: any) => ({
      date: String(row.datetime ?? ""),
      close: rawNumber(row.close) ?? 0,
    }))
  );

  return {
    status: status("twelve_data", true, true),
    company: {
      name: quote?.name ?? profile?.name ?? null,
      exchange: quote?.exchange ?? profile?.exchange ?? null,
      currency: quote?.currency ?? profile?.currency ?? null,
      quoteType: profile?.type ?? quote?.type ?? null,
    },
    market: {
      regularMarketPrice: rawNumber(quote?.close),
      previousClose: rawNumber(quote?.previous_close),
      fiftyTwoWeekHigh: rawNumber(quote?.fifty_two_week?.high),
      fiftyTwoWeekLow: rawNumber(quote?.fifty_two_week?.low),
      regularMarketVolume: rawNumber(quote?.volume),
    },
    priceHistory,
  };
}

async function fetchFmp(ticker: string) {
  const key = envValue("FMP_API_KEY") || envValue("FINANCIAL_MODELING_PREP_API_KEY");
  if (!key) return { status: status("fmp", false, false, "Missing FMP_API_KEY") };
  const base = "https://financialmodelingprep.com/api/v3";
  const withKey = (path: string) => `${base}${path}${path.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(key)}`;
  const [quote, profile, history, etfHoldings, etfSectors] = await Promise.all([
    fetchProviderJson(withKey(`/quote/${encodeURIComponent(ticker)}`)).catch((error) => ({ error: error.message })),
    fetchProviderJson(withKey(`/profile/${encodeURIComponent(ticker)}`)).catch((error) => ({ error: error.message })),
    fetchProviderJson(withKey(`/historical-price-full/${encodeURIComponent(ticker)}?serietype=line&timeseries=1825`)).catch((error) => ({ error: error.message })),
    fetchProviderJson(withKey(`/etf-holder/${encodeURIComponent(ticker)}`)).catch(() => null),
    fetchProviderJson(withKey(`/etf-sector-weightings/${encodeURIComponent(ticker)}`)).catch(() => null),
  ]);
  const quoteRow = Array.isArray(quote) ? quote[0] : null;
  const profileRow = Array.isArray(profile) ? profile[0] : null;
  if (!quoteRow && !profileRow && !history?.historical) throw new Error(quote?.error || profile?.error || "FMP returned no usable data.");

  const priceHistory = normalizeMonthlyRows(
    (Array.isArray(history?.historical) ? history.historical : []).map((row: any) => ({
      date: String(row.date ?? ""),
      close: rawNumber(row.close) ?? 0,
    }))
  );
  const topHoldings = Array.isArray(etfHoldings)
    ? etfHoldings.slice(0, 20).map((holding: any) => ({
        symbol: holding?.asset ?? holding?.symbol ?? null,
        holdingName: holding?.name ?? null,
        holdingPercent: rawNumber(holding?.weightPercentage ?? holding?.weight),
      }))
    : [];
  const sectorWeightings: Record<string, number | null> = {};
  if (Array.isArray(etfSectors)) {
    for (const row of etfSectors) {
      const keyName = String(row?.sector ?? row?.name ?? "").trim();
      if (keyName) sectorWeightings[keyName] = rawNumber(row?.weightPercentage ?? row?.weight);
    }
  }

  return {
    status: status("fmp", true, true),
    company: {
      name: profileRow?.companyName ?? quoteRow?.name ?? null,
      exchange: profileRow?.exchangeShortName ?? quoteRow?.exchange ?? null,
      sector: profileRow?.sector ?? null,
      industry: profileRow?.industry ?? null,
      quoteType: profileRow?.isEtf ? "ETF" : profileRow?.isFund ? "FUND" : profileRow ? "EQUITY" : null,
      currency: profileRow?.currency ?? null,
    },
    market: {
      regularMarketPrice: rawNumber(quoteRow?.price ?? profileRow?.price),
      previousClose: rawNumber(quoteRow?.previousClose),
      fiftyTwoWeekHigh: rawNumber(quoteRow?.yearHigh),
      fiftyTwoWeekLow: rawNumber(quoteRow?.yearLow),
      regularMarketVolume: rawNumber(quoteRow?.volume),
      marketCap: rawNumber(quoteRow?.marketCap ?? profileRow?.mktCap),
      trailingPE: rawNumber(quoteRow?.pe),
      dividendYield: rawNumber(profileRow?.lastDiv),
    },
    priceHistory,
    fund:
      topHoldings.length || Object.keys(sectorWeightings).length
        ? {
            topHoldings,
            sectorWeightings,
          }
        : null,
  };
}

async function fetchFredMacro() {
  const key = envValue("FRED_API_KEY");
  if (!key) return { status: status("fred", false, false, "Missing FRED_API_KEY"), data: null };
  const series = ["DGS10", "DGS2", "FEDFUNDS", "CPIAUCSL", "UNRATE"];
  const entries = await Promise.all(
    series.map(async (seriesId) => {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${encodeURIComponent(
        key
      )}&file_type=json&sort_order=desc&limit=1`;
      const json = await fetchProviderJson(url);
      const latest = Array.isArray(json?.observations) ? json.observations[0] : null;
      return [seriesId, { value: rawNumber(latest?.value), date: latest?.date ?? null }] as const;
    })
  );
  return { status: status("fred", true, true), data: Object.fromEntries(entries) };
}

async function fetchBlsMacro() {
  const key = envValue("BLS_API_KEY");
  const payload: Record<string, any> = {
    seriesid: ["CUSR0000SA0", "WPUFD4", "LNS14000000"],
    latest: true,
  };
  if (key) payload.registrationkey = key;
  const json = await fetchProviderJson("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST",
    headers: { ...PROVIDER_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (json?.status && json.status !== "REQUEST_SUCCEEDED") throw new Error(json?.message?.join("; ") || "BLS request failed.");
  const out: Record<string, { value: number | null; period?: string | null; year?: string | null }> = {};
  for (const series of json?.Results?.series ?? []) {
    const latest = Array.isArray(series?.data) ? series.data[0] : null;
    out[series.seriesID] = {
      value: rawNumber(latest?.value),
      period: latest?.period ?? null,
      year: latest?.year ?? null,
    };
  }
  return { status: status("bls", Boolean(key), true, key ? null : "Using public unregistered BLS access"), data: out };
}

async function fetchBeaMacro() {
  const key = envValue("BEA_API_KEY");
  if (!key) return { status: status("bea", false, false, "Missing BEA_API_KEY"), data: null };
  const currentYear = new Date().getUTCFullYear();
  const url = `https://apps.bea.gov/api/data/?UserID=${encodeURIComponent(
    key
  )}&method=GetData&datasetname=NIPA&TableName=T10101&LineNumber=1&Frequency=Q&Year=${currentYear},${
    currentYear - 1
  }&ResultFormat=JSON`;
  const json = await fetchProviderJson(url);
  const rows = json?.BEAAPI?.Results?.Data ?? [];
  const latest = Array.isArray(rows) ? rows.find((row: any) => rawNumber(row?.DataValue) != null) : null;
  return {
    status: status("bea", true, true),
    data: {
      latestGdp: rawNumber(latest?.DataValue),
      period: latest?.TimePeriod ?? null,
      year: latest?.Year ?? null,
    },
  };
}

async function fetchTreasuryMacro() {
  const url =
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=1&format=json";
  const json = await fetchProviderJson(url);
  const row = Array.isArray(json?.data) ? json.data[0] : null;
  return {
    status: status("treasury_fiscal_data", true, true),
    data: {
      averageInterestRate: rawNumber(row?.avg_interest_rate_amt),
      recordDate: row?.record_date ?? null,
    },
  };
}

export async function fetchNeuroExternalProviderSnapshot(ticker: string): Promise<NeuroExternalProviderSnapshot> {
  const results = await Promise.allSettled([
    fetchOpenFigi(ticker),
    fetchAlphaVantage(ticker),
    fetchTwelveData(ticker),
    fetchFmp(ticker),
    fetchFredMacro(),
    fetchBlsMacro(),
    fetchBeaMacro(),
    fetchTreasuryMacro(),
  ]);

  const statuses: NeuroExternalProviderStatus[] = [];
  const data: any[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      const value = result.value as any;
      if (value?.status) statuses.push(value.status);
      data.push(value);
    } else {
      statuses.push(status("unknown_provider", true, false, result.reason?.message || "Provider failed."));
    }
  }

  const openFigi = data.find((item) => item?.status?.provider === "openfigi");
  const alpha = data.find((item) => item?.status?.provider === "alpha_vantage");
  const twelve = data.find((item) => item?.status?.provider === "twelve_data");
  const fmp = data.find((item) => item?.status?.provider === "fmp");
  const fred = data.find((item) => item?.status?.provider === "fred");
  const bls = data.find((item) => item?.status?.provider === "bls");
  const bea = data.find((item) => item?.status?.provider === "bea");
  const treasury = data.find((item) => item?.status?.provider === "treasury_fiscal_data");
  const priceHistory =
    alpha?.priceHistory?.length ? alpha.priceHistory : twelve?.priceHistory?.length ? twelve.priceHistory : fmp?.priceHistory ?? [];
  const fund = mergeDefined(alpha?.fund, fmp?.fund);
  const company = mergeDefined(openFigi?.company, alpha?.company, twelve?.company, fmp?.company);
  const market = mergeDefined(alpha?.market, twelve?.market, fmp?.market);
  const instrumentType =
    openFigi?.instrumentType && openFigi.instrumentType !== "unknown"
      ? openFigi.instrumentType
      : instrumentTypeFromText(company?.quoteType);

  return {
    ticker,
    statuses,
    symbol: openFigi?.symbol ?? null,
    instrumentType,
    company,
    market,
    fund,
    priceHistory,
    macro: {
      fred: fred?.data ?? null,
      bls: bls?.data ?? null,
      bea: bea?.data ?? null,
      treasury: treasury?.data ?? null,
    },
  };
}
