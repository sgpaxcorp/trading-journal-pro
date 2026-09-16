export type MarketDataLicense = {
  source: string;
  termsCategory: string;
  termsUrl: string | null;
  redistributionPermitted: boolean;
  storagePermitted: boolean;
  derivedCalculationsPermitted: boolean;
  investorDisplayPermitted: boolean;
  checkedAt: string | null;
};

export const KNOWN_MARKET_DATA_LICENSES: Record<string, MarketDataLicense> = {
  sec_edgar: {
    source: "SEC EDGAR",
    termsCategory: "US government public filing data",
    termsUrl: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
    redistributionPermitted: true,
    storagePermitted: true,
    derivedCalculationsPermitted: true,
    investorDisplayPermitted: true,
    checkedAt: "2026-09-16T00:00:00.000Z",
  },
  fred: {
    source: "Federal Reserve Economic Data",
    termsCategory: "Government and third-party series; series-specific review required",
    termsUrl: "https://fred.stlouisfed.org/legal/",
    redistributionPermitted: false,
    storagePermitted: true,
    derivedCalculationsPermitted: true,
    investorDisplayPermitted: true,
    checkedAt: "2026-09-16T00:00:00.000Z",
  },
  bls: {
    source: "US Bureau of Labor Statistics",
    termsCategory: "US government public data",
    termsUrl: "https://www.bls.gov/bls/linksite.htm",
    redistributionPermitted: true,
    storagePermitted: true,
    derivedCalculationsPermitted: true,
    investorDisplayPermitted: true,
    checkedAt: "2026-09-16T00:00:00.000Z",
  },
  bea: {
    source: "US Bureau of Economic Analysis",
    termsCategory: "US government public data",
    termsUrl: "https://apps.bea.gov/API/signup/",
    redistributionPermitted: true,
    storagePermitted: true,
    derivedCalculationsPermitted: true,
    investorDisplayPermitted: true,
    checkedAt: "2026-09-16T00:00:00.000Z",
  },
  treasury_fiscal_data: {
    source: "US Treasury Fiscal Data",
    termsCategory: "US government public data",
    termsUrl: "https://fiscaldata.treasury.gov/api-documentation/",
    redistributionPermitted: true,
    storagePermitted: true,
    derivedCalculationsPermitted: true,
    investorDisplayPermitted: true,
    checkedAt: "2026-09-16T00:00:00.000Z",
  },
  openfigi: {
    source: "OpenFIGI",
    termsCategory: "External service; contract and attribution review required",
    termsUrl: "https://www.openfigi.com/api",
    redistributionPermitted: false,
    storagePermitted: false,
    derivedCalculationsPermitted: false,
    investorDisplayPermitted: false,
    checkedAt: null,
  },
  alpha_vantage: {
    source: "Alpha Vantage",
    termsCategory: "Commercial market data; plan-specific rights review required",
    termsUrl: "https://www.alphavantage.co/terms_of_service/",
    redistributionPermitted: false,
    storagePermitted: false,
    derivedCalculationsPermitted: false,
    investorDisplayPermitted: false,
    checkedAt: null,
  },
  twelve_data: {
    source: "Twelve Data",
    termsCategory: "Commercial market data; plan-specific rights review required",
    termsUrl: "https://twelvedata.com/terms",
    redistributionPermitted: false,
    storagePermitted: false,
    derivedCalculationsPermitted: false,
    investorDisplayPermitted: false,
    checkedAt: null,
  },
  fmp: {
    source: "Financial Modeling Prep",
    termsCategory: "Commercial financial data; plan-specific rights review required",
    termsUrl: "https://site.financialmodelingprep.com/terms-of-service",
    redistributionPermitted: false,
    storagePermitted: false,
    derivedCalculationsPermitted: false,
    investorDisplayPermitted: false,
    checkedAt: null,
  },
  yahoo_finance: {
    source: "Yahoo Finance",
    termsCategory: "External display service; production redistribution rights unverified",
    termsUrl: "https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apiforydn/index.html",
    redistributionPermitted: false,
    storagePermitted: false,
    derivedCalculationsPermitted: false,
    investorDisplayPermitted: false,
    checkedAt: null,
  },
  nasdaq: {
    source: "Nasdaq",
    termsCategory: "External market data; production rights unverified",
    termsUrl: "https://www.nasdaq.com/terms-of-use",
    redistributionPermitted: false,
    storagePermitted: false,
    derivedCalculationsPermitted: false,
    investorDisplayPermitted: false,
    checkedAt: null,
  },
};

export type MarketDataProvenance = {
  providerId: string;
  sourceReference: string;
  observedAt: string;
  availableAt: string;
  fetchedAt: string;
  currency: string | null;
  units: string;
  adjustmentStatus: "unadjusted" | "split_adjusted" | "total_return_adjusted";
};

export type MarketQuote = {
  ticker: string;
  price: number | null;
  previousClose: number | null;
  volume: number | null;
  provenance: MarketDataProvenance;
};

export type HistoricalPrice = {
  ticker: string;
  date: string;
  close: number;
  provenance: MarketDataProvenance;
};

export type ProviderCorporateAction = {
  ticker: string;
  actionType: "split" | "reverse_split" | "dividend" | "special_dividend" | "spinoff" | "ticker_change" | "merger" | "delisting";
  effectiveDate: string;
  amount: number | null;
  ratioNumerator: number | null;
  ratioDenominator: number | null;
  currency: string | null;
  provenance: MarketDataProvenance;
};

export type ProviderScalar = {
  ticker: string;
  value: number | null;
  provenance: MarketDataProvenance;
};

export interface MarketDataProvider {
  readonly id: string;
  readonly displayName: string;
  readonly license: MarketDataLicense;
  getQuote(ticker: string): Promise<MarketQuote>;
  getHistoricalPrices(ticker: string, from: string, to: string): Promise<HistoricalPrice[]>;
  getCorporateActions(ticker: string, from: string, to: string): Promise<ProviderCorporateAction[]>;
  getDividends(ticker: string, from: string, to: string): Promise<ProviderCorporateAction[]>;
  getSplits(ticker: string, from: string, to: string): Promise<ProviderCorporateAction[]>;
  getMarketCap(ticker: string): Promise<ProviderScalar>;
  getSharesOutstanding(ticker: string): Promise<ProviderScalar>;
  getTradingVolume(ticker: string): Promise<ProviderScalar>;
}

function cleanTicker(value: unknown) {
  const ticker = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 20);
  if (!ticker) throw new Error("Ticker is required.");
  return ticker;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error("Market-data ranges require ISO dates.");
  }
  return value;
}

export class MarketDataProviderRegistry {
  private readonly providers = new Map<string, MarketDataProvider>();

  register(provider: MarketDataProvider) {
    if (this.providers.has(provider.id)) throw new Error(`Market-data provider ${provider.id} is already registered.`);
    this.providers.set(provider.id, provider);
    return this;
  }

  get(providerId: string) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Market-data provider ${providerId} is not registered.`);
    return provider;
  }

  list() {
    return [...this.providers.values()].map((provider) => ({
      id: provider.id,
      displayName: provider.displayName,
      license: provider.license,
    }));
  }

  assertUsage(providerId: string, usage: "store" | "derive" | "display" | "redistribute") {
    const license = this.get(providerId).license;
    const permitted = usage === "store"
      ? license.storagePermitted
      : usage === "derive"
        ? license.derivedCalculationsPermitted
        : usage === "display"
          ? license.investorDisplayPermitted
          : license.redistributionPermitted;
    if (!permitted) throw new Error(`${license.source} terms do not permit ${usage} for this data.`);
  }
}

export type DemoMarketDataRecord = {
  ticker: string;
  currency?: string;
  quote?: { price?: number | null; previousClose?: number | null; volume?: number | null; observedAt?: string };
  historicalPrices?: Array<{ date: string; close: number }>;
  corporateActions?: Array<Omit<ProviderCorporateAction, "ticker" | "provenance">>;
  marketCap?: number | null;
  sharesOutstanding?: number | null;
};

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly id = "demo_market_data";
  readonly displayName = "Demo Market Data Provider";
  readonly license: MarketDataLicense = {
    source: "Synthetic NeuroTrader demonstration data",
    termsCategory: "Internal test data",
    termsUrl: null,
    redistributionPermitted: false,
    storagePermitted: true,
    derivedCalculationsPermitted: true,
    investorDisplayPermitted: true,
    checkedAt: "2026-09-16T00:00:00.000Z",
  };

  constructor(private readonly records: DemoMarketDataRecord[] = []) {}

  private record(tickerInput: string) {
    const ticker = cleanTicker(tickerInput);
    return { ticker, record: this.records.find((item) => cleanTicker(item.ticker) === ticker) ?? null };
  }

  private provenance(ticker: string, observedAt: string, units: string, currency: string | null, adjustmentStatus: MarketDataProvenance["adjustmentStatus"] = "unadjusted"): MarketDataProvenance {
    return {
      providerId: this.id,
      sourceReference: `demo://${ticker}`,
      observedAt,
      availableAt: observedAt,
      fetchedAt: new Date().toISOString(),
      currency,
      units,
      adjustmentStatus,
    };
  }

  async getQuote(tickerInput: string): Promise<MarketQuote> {
    const { ticker, record } = this.record(tickerInput);
    const observedAt = record?.quote?.observedAt ?? new Date().toISOString();
    return {
      ticker,
      price: record?.quote?.price ?? null,
      previousClose: record?.quote?.previousClose ?? null,
      volume: record?.quote?.volume ?? null,
      provenance: this.provenance(ticker, observedAt, `${record?.currency ?? "USD"}/share`, record?.currency ?? "USD"),
    };
  }

  async getHistoricalPrices(tickerInput: string, fromInput: string, toInput: string) {
    const { ticker, record } = this.record(tickerInput);
    const from = validDate(fromInput);
    const to = validDate(toInput);
    return (record?.historicalPrices ?? [])
      .filter((row) => row.date >= from && row.date <= to)
      .map((row) => ({
        ticker,
        date: row.date,
        close: row.close,
        provenance: this.provenance(ticker, `${row.date}T23:59:59.999Z`, `${record?.currency ?? "USD"}/share`, record?.currency ?? "USD", "split_adjusted"),
      }));
  }

  async getCorporateActions(tickerInput: string, fromInput: string, toInput: string) {
    const { ticker, record } = this.record(tickerInput);
    const from = validDate(fromInput);
    const to = validDate(toInput);
    return (record?.corporateActions ?? [])
      .filter((row) => row.effectiveDate >= from && row.effectiveDate <= to)
      .map((row) => ({
        ...row,
        ticker,
        provenance: this.provenance(
          ticker,
          `${row.effectiveDate}T23:59:59.999Z`,
          row.amount == null ? "ratio" : row.currency ?? record?.currency ?? "USD",
          row.currency ?? record?.currency ?? null
        ),
      }));
  }

  async getDividends(ticker: string, from: string, to: string) {
    return (await this.getCorporateActions(ticker, from, to)).filter((row) => row.actionType === "dividend" || row.actionType === "special_dividend");
  }

  async getSplits(ticker: string, from: string, to: string) {
    return (await this.getCorporateActions(ticker, from, to)).filter((row) => row.actionType === "split" || row.actionType === "reverse_split");
  }

  private async scalar(tickerInput: string, value: number | null | undefined, units: string): Promise<ProviderScalar> {
    const { ticker, record } = this.record(tickerInput);
    const observedAt = record?.quote?.observedAt ?? new Date().toISOString();
    return { ticker, value: value ?? null, provenance: this.provenance(ticker, observedAt, units, record?.currency ?? "USD") };
  }

  async getMarketCap(ticker: string) {
    const found = this.record(ticker);
    return this.scalar(ticker, found.record?.marketCap, found.record?.currency ?? "USD");
  }

  async getSharesOutstanding(ticker: string) {
    const found = this.record(ticker);
    return this.scalar(ticker, found.record?.sharesOutstanding, "shares");
  }

  async getTradingVolume(ticker: string) {
    const found = this.record(ticker);
    return this.scalar(ticker, found.record?.quote?.volume, "shares");
  }
}
