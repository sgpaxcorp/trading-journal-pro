import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DATA_NOT_AVAILABLE,
  auditAiFinancialPayload,
  appendFinancialTraceabilityAppendix,
  createFinancialIntegrityManifest,
  enforceResearchFinancialIntegrity,
  financialCalculation,
  financialFact,
  financialNumberOrNull,
} from "@/lib/neuroFinancialDataIntegrity";
import { buildNeuroAnalysisEngine } from "@/lib/neuroAnalysisEngine";
import { buildMarketFinancialDataIntegrity } from "@/lib/neuroMarketData";

const generatedAt = "2026-09-16T12:00:00.000Z";

describe("Financial Data Integrity", () => {
  it("preserves a verified zero but never converts a missing value to zero", () => {
    expect(financialNumberOrNull(0)).toBe(0);
    expect(financialNumberOrNull("0")).toBe(0);
    expect(financialNumberOrNull(null)).toBeNull();
    expect(financialNumberOrNull(undefined)).toBeNull();
    expect(financialNumberOrNull("")).toBeNull();
    expect(financialNumberOrNull("   ")).toBeNull();
  });

  it("marks a value unavailable when any mandatory provenance field is missing", () => {
    const record = financialFact({
      path: "market.price",
      label: "Market price",
      value: 42,
      source: "Market data service",
      document: "ACME quote snapshot",
      reportingPeriod: generatedAt,
      publicationDate: null,
      currency: "USD",
      units: "USD/share",
    });

    expect(record.status).toBe("unavailable");
    expect(record.value).toBeNull();
    expect(record.displayValue).toBe(DATA_NOT_AVAILABLE);
  });

  it("requires formula, complete inputs, and timestamp for derived values", () => {
    const record = financialCalculation({
      path: "valuation.enterpriseValue",
      label: "Enterprise value",
      value: 120,
      formula: "marketCap + debt - cash",
      inputs: [
        { name: "marketCap", value: 100 },
        { name: "debt", value: 20 },
        { name: "cash", value: null },
      ],
      calculationTimestamp: generatedAt,
      reportingPeriod: generatedAt,
      currency: "USD",
      units: "USD",
    });

    expect(record.status).toBe("unavailable");
    expect(record.value).toBeNull();
    expect(record.formula).toBe("marketCap + debt - cash");
    expect(record.inputs[2].value).toBeNull();
  });

  it("removes uncited financial numbers and preserves fully cited verified claims", () => {
    const price = financialFact({
      id: "FIN-acme-price",
      path: "market.price",
      label: "ACME market price",
      value: 42,
      source: "Market data service",
      document: "ACME quote snapshot",
      reportingPeriod: generatedAt,
      publicationDate: generatedAt,
      currency: "USD",
      units: "USD/share",
    });
    const manifest = createFinancialIntegrityManifest([price], generatedAt);
    const uncited = enforceResearchFinancialIntegrity("Market price is $99.", manifest);
    const cited = enforceResearchFinancialIntegrity(
      "Market price is $42. [[FIN:FIN-acme-price]]",
      manifest
    );

    expect(uncited.report).toContain(DATA_NOT_AVAILABLE);
    expect(uncited.report).not.toContain("$99");
    expect(uncited.replacedClaimCount).toBe(1);
    expect(cited.report).toContain("$42");
    expect(cited.usedTraceIds).toEqual(["FIN-acme-price"]);

    const withAppendix = appendFinancialTraceabilityAppendix(
      cited.report,
      manifest,
      cited.usedTraceIds
    );
    expect(withAppendix).toContain("Financial Data Traceability");
    expect(withAppendix).toContain("ACME quote snapshot");
    expect(withAppendix).toContain("USD/share");
  });

  it("requires one valid financial trace per material number on a line", () => {
    const price = financialFact({
      id: "FIN-acme-price",
      path: "market.price",
      label: "ACME market price",
      value: 42,
      source: "Market data service",
      document: "ACME quote snapshot",
      reportingPeriod: generatedAt,
      publicationDate: generatedAt,
      currency: "USD",
      units: "USD/share",
    });
    const manifest = createFinancialIntegrityManifest([price], generatedAt);
    const audited = enforceResearchFinancialIntegrity(
      "Market price is $42 and estimated value is $90. [[FIN:FIN-acme-price]]",
      manifest
    );

    expect(audited.report).not.toContain("$90");
    expect(audited.report).toContain(DATA_NOT_AVAILABLE);
  });

  it("blocks uncited financial values inside compact markdown tables", () => {
    const manifest = createFinancialIntegrityManifest([], generatedAt);
    const audited = enforceResearchFinancialIntegrity(
      "| Case | Amount |\n|---|---:|\n| Base | $42.00 |\n| Margin | 18.5% |",
      manifest
    );

    expect(audited.report).not.toContain("$42.00");
    expect(audited.report).not.toContain("18.5%");
    expect(audited.report.match(/DATA NOT AVAILABLE/g)?.length).toBe(2);
  });

  it("rejects numeric JSON values supplied directly by an AI agent", () => {
    const manifest = createFinancialIntegrityManifest([], generatedAt);
    const audited = auditAiFinancialPayload({
      amount: 42000000,
      margin: "18.5%",
      narrative: "Revenue was $42 million.",
      sourceDate: "2026-09-16",
    }, manifest) as Record<string, unknown>;

    expect(audited.amount).toBeNull();
    expect(audited.margin).toBe(DATA_NOT_AVAILABLE);
    expect(audited.narrative).toContain(DATA_NOT_AVAILABLE);
    expect(audited.sourceDate).toBe("2026-09-16");
  });

  it("keeps missing market fields unavailable while preserving a reported zero", () => {
    const manifest = buildMarketFinancialDataIntegrity({
      source: "Test market source",
      ticker: "ACME",
      instrumentType: "equity",
      company: { currency: "USD" },
      market: { regularMarketPrice: null, dividendYield: 0 },
      fund: null,
      annualFundamentals: [],
      priceHistory: [],
      yearlyPrice: [],
      dataQuality: { fetchedAt: generatedAt },
    }, generatedAt);

    const price = manifest.records.find((record) => record.path === "market.regularMarketPrice");
    const yieldRecord = manifest.records.find((record) => record.path === "market.dividendYield");
    expect(price?.status).toBe("unavailable");
    expect(price?.displayValue).toBe(DATA_NOT_AVAILABLE);
    expect(yieldRecord?.status).toBe("verified");
    expect(yieldRecord?.value).toBe(0);
  });

  it("does not manufacture zero-valued positions when market price and cost are missing", () => {
    const engine = buildNeuroAnalysisEngine({
      holdings: [{ ticker: "ACME", shares: 1, averageCost: null, currentPrice: null, researchOnly: true }],
      marketData: {
        ticker: "ACME",
        company: { name: "Acme" },
        market: { regularMarketPrice: null, previousClose: null },
        annualFundamentals: [],
      },
    });

    expect(engine.positions[0].currentPrice).toBeNull();
    expect(engine.positions[0].averageCost).toBeNull();
    expect(engine.positions[0].currentValue).toBeNull();
    expect(engine.positions[0].invested).toBeNull();
    expect(engine.portfolio.totalValue).toBeNull();
    expect(engine.positions[0].scenarios.base.intrinsicEquityValue).toBeNull();
  });
});
