import "server-only";

import { createHash } from "node:crypto";

export const SEC_EDGAR_MAX_REQUESTS_PER_SECOND = 10;
export const SEC_EDGAR_DEFAULT_REQUESTS_PER_SECOND = 8;

export type SecEdgarCacheEntry = {
  body: string;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  fetchedAt: string;
  contentSha256: string;
};

export interface SecEdgarCache {
  get(requestKey: string): Promise<SecEdgarCacheEntry | null>;
  set(requestKey: string, entry: SecEdgarCacheEntry): Promise<void>;
}

export type SecEdgarResponse<T> = {
  data: T;
  receipt: {
    requestKey: string;
    requestUrl: string;
    fetchedAt: string;
    contentType: string | null;
    etag: string | null;
    lastModified: string | null;
    contentSha256: string;
    fromCache: boolean;
    revalidated: boolean;
  };
};

export type SecEdgarClientOptions = {
  userAgent: string;
  requestsPerSecond?: number;
  timeoutMs?: number;
  maxRetries?: number;
  cache?: SecEdgarCache;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export type SecCompanyIdentity = {
  cik: string;
  ticker: string;
  legalName: string;
};

const ALLOWED_SEC_HOSTS = new Set(["data.sec.gov", "www.sec.gov"]);

export class MemorySecEdgarCache implements SecEdgarCache {
  private readonly entries = new Map<string, SecEdgarCacheEntry>();

  async get(requestKey: string) {
    return this.entries.get(requestKey) ?? null;
  }

  async set(requestKey: string, entry: SecEdgarCacheEntry) {
    this.entries.set(requestKey, entry);
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function validUserAgent(value: string) {
  const userAgent = value.trim();
  if (userAgent.length < 10) return false;
  return /@[a-z0-9.-]+\.[a-z]{2,}/i.test(userAgent) || /https?:\/\//i.test(userAgent);
}

export function normalizeSecCik(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits || digits.length > 10) throw new Error("SEC CIK must contain at most 10 digits.");
  return digits.padStart(10, "0");
}

function normalizeTicker(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 20);
}

function secUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ALLOWED_SEC_HOSTS.has(url.hostname)) {
    throw new Error("Only official HTTPS SEC resources are allowed.");
  }
  url.hash = "";
  return url;
}

function retryAfterMilliseconds(response: Response) {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export class SecEdgarClient {
  private readonly userAgent: string;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly cache: SecEdgarCache;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly inFlight = new Map<string, Promise<SecEdgarResponse<unknown>>>();
  private throttleChain: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;

  constructor(options: SecEdgarClientOptions) {
    if (!validUserAgent(options.userAgent)) {
      throw new Error("SEC User-Agent must identify the application and include a contact email or URL.");
    }
    const requestedRate = options.requestsPerSecond ?? SEC_EDGAR_DEFAULT_REQUESTS_PER_SECOND;
    if (!Number.isFinite(requestedRate) || requestedRate <= 0 || requestedRate > SEC_EDGAR_MAX_REQUESTS_PER_SECOND) {
      throw new Error(`SEC request rate must be between 1 and ${SEC_EDGAR_MAX_REQUESTS_PER_SECOND} requests per second.`);
    }
    this.userAgent = options.userAgent.trim();
    this.intervalMs = Math.ceil(1_000 / requestedRate);
    this.timeoutMs = Math.max(1_000, options.timeoutMs ?? 15_000);
    this.maxRetries = Math.max(0, Math.min(8, Math.floor(options.maxRetries ?? 4)));
    this.cache = options.cache ?? new MemorySecEdgarCache();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  private async waitForRequestSlot() {
    const turn = this.throttleChain.then(async () => {
      const waitMs = Math.max(0, this.nextRequestAt - this.now());
      if (waitMs > 0) await this.sleep(waitMs);
      this.nextRequestAt = this.now() + this.intervalMs;
    });
    this.throttleChain = turn.catch(() => undefined);
    await turn;
  }

  private async requestText(urlInput: string, maxAgeMs: number): Promise<SecEdgarResponse<string>> {
    const url = secUrl(urlInput);
    const requestKey = url.toString();
    const existing = this.inFlight.get(requestKey);
    if (existing) return existing as Promise<SecEdgarResponse<string>>;

    const operation = this.requestTextUndeduplicated(url, requestKey, maxAgeMs);
    this.inFlight.set(requestKey, operation as Promise<SecEdgarResponse<unknown>>);
    try {
      return await operation;
    } finally {
      this.inFlight.delete(requestKey);
    }
  }

  private async requestTextUndeduplicated(url: URL, requestKey: string, maxAgeMs: number): Promise<SecEdgarResponse<string>> {
    const cached = await this.cache.get(requestKey);
    const cachedAt = cached ? Date.parse(cached.fetchedAt) : Number.NaN;
    if (cached && Number.isFinite(cachedAt) && this.now() - cachedAt <= Math.max(0, maxAgeMs)) {
      return {
        data: cached.body,
        receipt: {
          requestKey,
          requestUrl: requestKey,
          fetchedAt: cached.fetchedAt,
          contentType: cached.contentType,
          etag: cached.etag,
          lastModified: cached.lastModified,
          contentSha256: cached.contentSha256,
          fromCache: true,
          revalidated: false,
        },
      };
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.waitForRequestSlot();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        const headers: Record<string, string> = {
          "User-Agent": this.userAgent,
          Accept: "application/json,text/plain,application/xhtml+xml,text/html,*/*",
          "Accept-Encoding": "gzip, deflate",
        };
        if (cached?.etag) headers["If-None-Match"] = cached.etag;
        if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;
        response = await this.fetchImpl(url, { headers, signal: controller.signal, cache: "no-store" });
      } catch (error) {
        if (attempt >= this.maxRetries) throw error;
        await this.sleep(Math.min(30_000, 500 * 2 ** attempt));
        continue;
      } finally {
        clearTimeout(timeout);
      }

      if (response.status === 304 && cached) {
        const fetchedAt = new Date(this.now()).toISOString();
        const refreshed = { ...cached, fetchedAt };
        await this.cache.set(requestKey, refreshed);
        return {
          data: cached.body,
          receipt: {
            requestKey,
            requestUrl: requestKey,
            fetchedAt,
            contentType: cached.contentType,
            etag: cached.etag,
            lastModified: cached.lastModified,
            contentSha256: cached.contentSha256,
            fromCache: true,
            revalidated: true,
          },
        };
      }

      if (!response.ok) {
        if (attempt < this.maxRetries && isRetryableStatus(response.status)) {
          const retryAfter = retryAfterMilliseconds(response);
          await this.sleep(retryAfter ?? Math.min(30_000, 500 * 2 ** attempt));
          continue;
        }
        throw new Error(`SEC EDGAR request failed with status ${response.status}.`);
      }

      const body = await response.text();
      const entry: SecEdgarCacheEntry = {
        body,
        contentType: response.headers.get("content-type"),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        fetchedAt: new Date(this.now()).toISOString(),
        contentSha256: sha256(body),
      };
      await this.cache.set(requestKey, entry);
      return {
        data: body,
        receipt: {
          requestKey,
          requestUrl: requestKey,
          fetchedAt: entry.fetchedAt,
          contentType: entry.contentType,
          etag: entry.etag,
          lastModified: entry.lastModified,
          contentSha256: entry.contentSha256,
          fromCache: false,
          revalidated: Boolean(cached),
        },
      };
    }

    throw new Error("SEC EDGAR request exhausted its retry policy.");
  }

  async getJson<T>(url: string, maxAgeMs = 15 * 60_000): Promise<SecEdgarResponse<T>> {
    const result = await this.requestText(url, maxAgeMs);
    try {
      return { data: JSON.parse(result.data) as T, receipt: result.receipt };
    } catch {
      throw new Error("SEC EDGAR returned a non-JSON response for a JSON resource.");
    }
  }

  getCompanyTickers(maxAgeMs = 24 * 60 * 60_000) {
    return this.getJson<Record<string, { cik_str: number; ticker: string; title: string }>>(
      "https://www.sec.gov/files/company_tickers.json",
      maxAgeMs
    );
  }

  async resolveCompany(tickerInput: unknown): Promise<SecCompanyIdentity | null> {
    const ticker = normalizeTicker(tickerInput);
    if (!ticker) throw new Error("Ticker is required.");
    const response = await this.getCompanyTickers();
    const company = Object.values(response.data).find((row) => normalizeTicker(row.ticker) === ticker);
    return company
      ? { cik: normalizeSecCik(company.cik_str), ticker, legalName: String(company.title || ticker) }
      : null;
  }

  getSubmissions(cik: unknown, maxAgeMs = 15 * 60_000) {
    return this.getJson<Record<string, unknown>>(
      `https://data.sec.gov/submissions/CIK${normalizeSecCik(cik)}.json`,
      maxAgeMs
    );
  }

  getCompanyFacts(cik: unknown, maxAgeMs = 15 * 60_000) {
    return this.getJson<Record<string, unknown>>(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${normalizeSecCik(cik)}.json`,
      maxAgeMs
    );
  }

  getSubmissionHistoryFile(fileNameInput: unknown, maxAgeMs = 24 * 60 * 60_000) {
    const fileName = String(fileNameInput ?? "").trim();
    if (!/^CIK\d{10}-submissions-\d{3}\.json$/i.test(fileName)) {
      throw new Error("Invalid SEC submissions history file name.");
    }
    return this.getJson<Record<string, unknown>>(
      `https://data.sec.gov/submissions/${fileName}`,
      maxAgeMs
    );
  }

  getCompanyConcept(cik: unknown, taxonomy: string, concept: string, maxAgeMs = 15 * 60_000) {
    const safeTaxonomy = String(taxonomy).trim().replace(/[^a-z0-9_-]/gi, "");
    const safeConcept = String(concept).trim().replace(/[^a-z0-9_-]/gi, "");
    if (!safeTaxonomy || !safeConcept) throw new Error("A valid SEC taxonomy and concept are required.");
    return this.getJson<Record<string, unknown>>(
      `https://data.sec.gov/api/xbrl/companyconcept/CIK${normalizeSecCik(cik)}/${safeTaxonomy}/${safeConcept}.json`,
      maxAgeMs
    );
  }

  getFilingDocument(url: string, maxAgeMs = 365 * 24 * 60 * 60_000) {
    return this.requestText(url, maxAgeMs);
  }

  static bulkDatasetUrls() {
    return {
      companyFacts: "https://www.sec.gov/Archives/edgar/daily-index/xbrl/companyfacts.zip",
      submissions: "https://www.sec.gov/Archives/edgar/daily-index/bulkdata/submissions.zip",
    } as const;
  }
}

export function createSecEdgarClientFromEnv(options: Omit<SecEdgarClientOptions, "userAgent"> = {}) {
  const userAgent = String(
    process.env.SEC_USER_AGENT || process.env.NEURO_ANALYSIS_SEC_USER_AGENT || ""
  ).trim();
  if (!userAgent) {
    throw new Error("SEC_USER_AGENT must identify NeuroTrader and include a monitored contact email or URL.");
  }
  const requestsPerSecond = Number(process.env.SEC_REQUESTS_PER_SECOND);
  const timeoutMs = Number(process.env.SEC_FETCH_TIMEOUT_MS);
  const maxRetries = Number(process.env.SEC_MAX_RETRIES);
  return new SecEdgarClient({
    ...options,
    userAgent,
    requestsPerSecond: options.requestsPerSecond ?? (Number.isFinite(requestsPerSecond) && requestsPerSecond > 0 ? requestsPerSecond : undefined),
    timeoutMs: options.timeoutMs ?? (Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined),
    maxRetries: options.maxRetries ?? (Number.isFinite(maxRetries) && maxRetries >= 0 ? maxRetries : undefined),
  });
}
