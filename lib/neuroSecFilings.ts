import { Buffer } from "node:buffer";

export type NeuroSecCompanyDocument = {
  ticker: string;
  companyName: string;
  cik: string;
  form: "10-K" | "10-Q";
  accessionNumber: string;
  filingDate: string;
  periodEnd: string | null;
  primaryDocument: string;
  documentUrl: string;
  filingDetailUrl: string;
};

const SEC_FETCH_TIMEOUT_MS = 15_000;
export const MAX_SEC_FILING_BYTES = 35 * 1024 * 1024;

function secUserAgent() {
  return (
    process.env.SEC_USER_AGENT ||
    process.env.NEURO_ANALYSIS_SEC_USER_AGENT ||
    "NeuroTrader research platform support@neurotrader-journal.com"
  );
}

export function sanitizeSecTicker(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

export function sanitizeSecAccessionNumber(value: unknown) {
  const accessionNumber = String(value ?? "").trim();
  return /^\d{10}-\d{2}-\d{6}$/.test(accessionNumber) ? accessionNumber : "";
}

function sanitizePrimaryDocument(value: unknown) {
  const fileName = String(value ?? "").trim();
  return /^[A-Za-z0-9._-]{1,240}$/.test(fileName) ? fileName : "";
}

function accessionNoDashes(value: string) {
  return value.replace(/-/g, "");
}

function cikWithoutLeadingZeros(value: string) {
  return value.replace(/^0+/, "") || "0";
}

async function secFetch(url: string, accept: string, revalidate: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEC_FETCH_TIMEOUT_MS);
  return fetch(url, {
    headers: { "User-Agent": secUserAgent(), Accept: accept },
    cache: "force-cache",
    next: { revalidate },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
}

async function secFetchJson(url: string) {
  const res = await secFetch(url, "application/json", 900);
  if (!res.ok) throw new Error(`Company document lookup failed with ${res.status}`);
  return res.json();
}

export function buildRecentSecCompanyDocuments(input: {
  ticker: string;
  company: { cik_str?: number | string; title?: string };
  submissions: any;
  limit?: number;
}): NeuroSecCompanyDocument[] {
  const ticker = sanitizeSecTicker(input.ticker);
  const cik = String(input.company?.cik_str ?? "").padStart(10, "0");
  if (!ticker || !/^\d{10}$/.test(cik)) return [];

  const recent = input.submissions?.filings?.recent ?? {};
  const forms: unknown[] = Array.isArray(recent.form) ? recent.form : [];
  const accessionNumbers: unknown[] = Array.isArray(recent.accessionNumber) ? recent.accessionNumber : [];
  const primaryDocuments: unknown[] = Array.isArray(recent.primaryDocument) ? recent.primaryDocument : [];
  const filingDates: unknown[] = Array.isArray(recent.filingDate) ? recent.filingDate : [];
  const reportDates: unknown[] = Array.isArray(recent.reportDate) ? recent.reportDate : [];
  const cikPath = cikWithoutLeadingZeros(cik);

  return forms
    .map((value, index): NeuroSecCompanyDocument | null => {
      const form = String(value ?? "").toUpperCase();
      if (form !== "10-K" && form !== "10-Q") return null;
      const accessionNumber = sanitizeSecAccessionNumber(accessionNumbers[index]);
      const primaryDocument = sanitizePrimaryDocument(primaryDocuments[index]);
      if (!accessionNumber || !primaryDocument) return null;
      const accessionPath = accessionNoDashes(accessionNumber);
      const filingDate = String(filingDates[index] ?? "").slice(0, 10);
      const periodEnd = String(reportDates[index] ?? "").slice(0, 10) || null;
      const archiveRoot = `https://www.sec.gov/Archives/edgar/data/${cikPath}/${accessionPath}`;

      return {
        ticker,
        companyName: String(input.company?.title ?? ticker),
        cik,
        form,
        accessionNumber,
        filingDate,
        periodEnd,
        primaryDocument,
        documentUrl: `${archiveRoot}/${primaryDocument}`,
        filingDetailUrl: `${archiveRoot}/`,
      };
    })
    .filter((document): document is NeuroSecCompanyDocument => Boolean(document))
    .slice(0, Math.max(1, Math.min(input.limit ?? 12, 100)));
}

export async function listRecentSecCompanyDocuments(tickerInput: unknown, limit = 12) {
  const ticker = sanitizeSecTicker(tickerInput);
  if (!ticker) throw new Error("Ticker is required.");

  const tickers = await secFetchJson("https://www.sec.gov/files/company_tickers.json");
  const company = Object.values(tickers as Record<string, any>).find(
    (row: any) => sanitizeSecTicker(row?.ticker) === ticker
  ) as { cik_str?: number | string; title?: string } | undefined;
  if (!company?.cik_str) {
    return { ticker, company: null, documents: [] as NeuroSecCompanyDocument[] };
  }

  const cik = String(company.cik_str).padStart(10, "0");
  const submissions = await secFetchJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const documents = buildRecentSecCompanyDocuments({ ticker, company, submissions, limit });
  return {
    ticker,
    company: { name: company.title ?? ticker, cik },
    documents,
  };
}

export async function findRecentSecCompanyDocument(input: {
  ticker: unknown;
  accessionNumber: unknown;
  form?: unknown;
}) {
  const ticker = sanitizeSecTicker(input.ticker);
  const accessionNumber = sanitizeSecAccessionNumber(input.accessionNumber);
  const requestedForm = String(input.form ?? "").trim().toUpperCase();
  if (!ticker || !accessionNumber) throw new Error("A valid ticker and accession number are required.");
  if (requestedForm && requestedForm !== "10-K" && requestedForm !== "10-Q") {
    throw new Error("Form must be 10-K or 10-Q.");
  }

  const result = await listRecentSecCompanyDocuments(ticker, 100);
  const document = result.documents.find(
    (item) => item.accessionNumber === accessionNumber && (!requestedForm || item.form === requestedForm)
  );
  if (!document) throw new Error("The selected filing could not be verified for this company.");
  return document;
}

export async function downloadSecCompanyDocument(document: NeuroSecCompanyDocument) {
  const url = new URL(document.documentUrl);
  if (url.protocol !== "https:" || url.hostname !== "www.sec.gov" || !url.pathname.startsWith("/Archives/edgar/data/")) {
    throw new Error("The filing source is not allowed.");
  }

  const res = await secFetch(url.toString(), "text/html,text/plain,application/xhtml+xml", 31_536_000);
  if (!res.ok) throw new Error(`The filing could not be downloaded (${res.status}).`);
  const declaredBytes = Number(res.headers.get("content-length") ?? 0);
  if (declaredBytes > MAX_SEC_FILING_BYTES) throw new Error("The filing is larger than 35MB.");

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) throw new Error("The downloaded filing is empty.");
  if (buffer.length > MAX_SEC_FILING_BYTES) throw new Error("The filing is larger than 35MB.");

  const sourceExtension = document.primaryDocument.toLowerCase().endsWith(".txt") ? "txt" : "html";
  const contentType = sourceExtension === "txt" ? "text/plain" : "text/html";
  const date = document.periodEnd || document.filingDate || "undated";
  const accession = accessionNoDashes(document.accessionNumber);

  return {
    buffer,
    contentType,
    fileName: `${document.ticker}-${document.form}-${date}-${accession}.${sourceExtension}`,
  };
}
