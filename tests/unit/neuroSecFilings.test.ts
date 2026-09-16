import { describe, expect, it } from "vitest";

import {
  buildRecentSecCompanyDocuments,
  buildRecentSecMaterialDocuments,
  sanitizeSecAccessionNumber,
  sanitizeSecTicker,
} from "@/lib/neuroSecFilings";

describe("neuro SEC filings", () => {
  it("normalizes tickers and rejects malformed accession numbers", () => {
    expect(sanitizeSecTicker(" brk.b ")).toBe("BRK.B");
    expect(sanitizeSecTicker("AAPL<script>")).toBe("AAPLSCRIPT");
    expect(sanitizeSecAccessionNumber("0000320193-25-000079")).toBe("0000320193-25-000079");
    expect(sanitizeSecAccessionNumber("../../0000320193-25-000079")).toBe("");
  });

  it("builds importable URLs only for valid 10-K and 10-Q documents", () => {
    const documents = buildRecentSecCompanyDocuments({
      ticker: "AAPL",
      company: { cik_str: 320193, title: "Apple Inc." },
      submissions: {
        filings: {
          recent: {
            form: ["8-K", "10-Q", "10-K", "10-Q"],
            accessionNumber: [
              "0000320193-26-000001",
              "0000320193-26-000002",
              "0000320193-25-000003",
              "not-an-accession",
            ],
            primaryDocument: ["event.htm", "quarter.htm", "annual.htm", "../unsafe.htm"],
            filingDate: ["2026-08-01", "2026-07-30", "2025-10-31", "2025-07-30"],
            reportDate: ["2026-07-31", "2026-06-30", "2025-09-27", "2025-06-30"],
          },
        },
      },
    });

    expect(documents).toHaveLength(2);
    expect(documents.map((document) => document.form)).toEqual(["10-Q", "10-K"]);
    expect(documents[0]).toMatchObject({
      ticker: "AAPL",
      companyName: "Apple Inc.",
      cik: "0000320193",
      periodEnd: "2026-06-30",
      documentUrl:
        "https://www.sec.gov/Archives/edgar/data/320193/000032019326000002/quarter.htm",
    });
  });

  it("builds a material daily-office filing feed without accepting arbitrary forms", () => {
    const documents = buildRecentSecMaterialDocuments({
      ticker: "AAPL",
      company: { cik_str: 320193, title: "Apple Inc." },
      submissions: {
        filings: {
          recent: {
            form: ["8-K", "DEF 14A", "UPLOAD", "S-3"],
            accessionNumber: [
              "0000320193-26-000010",
              "0000320193-26-000011",
              "0000320193-26-000012",
              "0000320193-26-000013",
            ],
            primaryDocument: ["event.htm", "proxy.htm", "letter.htm", "s3.htm"],
            primaryDocDescription: ["Material event", "Proxy statement", "SEC correspondence", "Shelf registration"],
            filingDate: ["2026-09-16", "2026-09-15", "2026-09-14", "2026-09-13"],
            reportDate: ["2026-09-16", "2026-09-15", "", ""],
          },
        },
      },
    });

    expect(documents.map((document) => document.form)).toEqual(["8-K", "DEF 14A", "S-3"]);
    expect(documents[0]).toMatchObject({
      description: "Material event",
      filingDate: "2026-09-16",
      documentUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019326000010/event.htm",
    });
  });
});
