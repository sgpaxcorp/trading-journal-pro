import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/authServer";
import { rateLimit, rateLimitHeaders } from "@/lib/rateLimit";
import { requireSmartToolsOwner } from "@/lib/smartToolsAccess";

export const runtime = "nodejs";
const SEC_FETCH_TIMEOUT_MS = 8_000;

function sanitizeTicker(value: string | null) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 12);
}

function accessionNoDashes(value: string) {
  return value.replace(/-/g, "");
}

async function secFetchJson(url: string) {
  const userAgent =
    process.env.SEC_USER_AGENT ||
    process.env.NEURO_ANALYSIS_SEC_USER_AGENT ||
    "Neuro Trader research contact@example.com";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEC_FETCH_TIMEOUT_MS);
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/json",
    },
    cache: "force-cache",
    next: { revalidate: 900 },
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`Company document lookup failed with ${res.status}`);
  return res.json();
}

export async function GET(req: Request) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const smartToolsGate = await requireSmartToolsOwner(authUser);
    if (smartToolsGate) return smartToolsGate;

    const limiter = await rateLimit(`neuro-analysis:company-documents:${authUser.userId}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: rateLimitHeaders(limiter) }
      );
    }

    const url = new URL(req.url);
    const ticker = sanitizeTicker(url.searchParams.get("ticker"));
    if (!ticker) return NextResponse.json({ error: "Ticker is required." }, { status: 400 });

    const tickers = await secFetchJson("https://www.sec.gov/files/company_tickers.json");
    const company = Object.values(tickers as Record<string, any>).find(
      (row: any) => String(row?.ticker ?? "").toUpperCase() === ticker
    ) as any | undefined;
    if (!company?.cik_str) {
      return NextResponse.json({ ticker, documents: [], error: "Company document profile not found." });
    }

    const cik = String(company.cik_str).padStart(10, "0");
    const submissions = await secFetchJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
    const recent = submissions?.filings?.recent ?? {};
    const forms: string[] = recent.form ?? [];
    const accessionNumbers: string[] = recent.accessionNumber ?? [];
    const primaryDocuments: string[] = recent.primaryDocument ?? [];
    const filingDates: string[] = recent.filingDate ?? [];
    const reportDates: string[] = recent.reportDate ?? [];

    const documents = forms
      .map((form, index) => ({
        form,
        accessionNumber: accessionNumbers[index],
        filingDate: filingDates[index],
        periodEnd: reportDates[index] || null,
        primaryDocument: primaryDocuments[index],
      }))
      .filter((row) => row.form === "10-K" || row.form === "10-Q")
      .slice(0, 12)
      .map((row) => {
        const accession = accessionNoDashes(row.accessionNumber);
        const cikNoZeros = String(Number(cik));
        return {
          ...row,
          ticker,
          companyName: company.title ?? ticker,
          documentUrl: `https://www.sec.gov/Archives/edgar/data/${cikNoZeros}/${accession}/${row.primaryDocument}`,
          filingDetailUrl: `https://www.sec.gov/Archives/edgar/data/${cikNoZeros}/${accession}/`,
        };
      });

    return NextResponse.json({
      ticker,
      company: { name: company.title ?? ticker, cik },
      documents,
    });
  } catch (error: any) {
    console.error("[neuro-analysis/company-documents] error:", error);
    return NextResponse.json({ error: error?.message || "Company document lookup failed." }, { status: 500 });
  }
}
