import { describe, expect, it } from "vitest";

import {
  buildBusinessQualityFallback,
  BUSINESS_QUALITY_DIMENSIONS,
  constrainBusinessQualityEvidenceSources,
  normalizeBusinessQualityAnalysis,
} from "@/lib/neuroBusinessQuality";

describe("Business Quality Analysis Engine", () => {
  it("always preserves the exact 20 qualitative dimensions without a score", () => {
    const fallback = buildBusinessQualityFallback({
      ticker: "ACME",
      companyName: "Acme Inc.",
      instrumentType: "equity",
      uploadedFilings: [
        { form: "10-K", fiscalYear: 2025 },
        { form: "10-Q", periodEnd: "2026-06-30" },
      ],
    });
    const analysis = normalizeBusinessQualityAnalysis({
      fallback,
      candidate: {
        status: "complete",
        score: 99,
        dimensions: BUSINESS_QUALITY_DIMENSIONS.map((dimension) => ({
          ...dimension,
          score: 99,
          conclusion: `${dimension.label} conclusion`,
          supportingEvidence: [
            {
              status: "identified",
              statement: "Supported by a dated filing.",
              sourceLabel: "2025 annual filing",
              sourceDate: "2025-12-31",
              sourceType: "company_filing",
              sourceUrl: null,
            },
          ],
          contradictoryEvidence: [
            {
              status: "identified",
              statement: "A counterpoint exists.",
              sourceLabel: "2026 quarterly filing",
              sourceDate: "2026-06-30",
              sourceType: "company_filing",
              sourceUrl: null,
            },
          ],
          uncertainty: ["The duration is uncertain."],
          additionalInformation: ["Updated segment disclosure would change the conclusion."],
        })),
        whatMustBeTrue: [
          {
            condition: "Returns on capital remain above the cost of capital.",
            whyItMatters: "Value creation requires a positive spread.",
            evidenceNeeded: "Normalized ROIC and WACC evidence.",
            failureSignal: "A persistent negative spread.",
          },
        ],
      },
    });

    expect(analysis.dimensions).toHaveLength(20);
    expect(analysis.dimensions.map((dimension) => dimension.key)).toEqual(
      BUSINESS_QUALITY_DIMENSIONS.map((dimension) => dimension.key)
    );
    expect(JSON.stringify(analysis)).not.toContain('"score"');
    expect(analysis.analysisOrder).toBe("business_before_valuation");
    expect(analysis.priceDataExcluded).toBe(true);
  });

  it("shows support, contradiction, uncertainty, and change requirements for every conclusion", () => {
    const fallback = buildBusinessQualityFallback({
      ticker: "ACME",
      instrumentType: "equity",
      annualFundamentals: [{ year: 2025, totalRevenue: 100, freeCashFlow: 12, totalDebt: 20 }],
    });
    const analysis = normalizeBusinessQualityAnalysis({ candidate: {}, fallback });

    for (const dimension of analysis.dimensions) {
      expect(dimension.conclusion.length).toBeGreaterThan(0);
      expect(dimension.supportingEvidence.length).toBeGreaterThan(0);
      expect(dimension.contradictoryEvidence.length).toBeGreaterThan(0);
      expect(dimension.uncertainty.length).toBeGreaterThan(0);
      expect(dimension.additionalInformation.length).toBeGreaterThan(0);
    }
    expect(analysis.whatMustBeTrue.length).toBeGreaterThan(0);
  });

  it("does not apply the operating-company engine to an ETF", () => {
    const analysis = buildBusinessQualityFallback({
      ticker: "SPY",
      companyName: "SPDR S&P 500 ETF Trust",
      instrumentType: "etf",
    });

    expect(analysis.status).toBe("not_applicable");
    expect(analysis.priceDataExcluded).toBe(true);
  });

  it("does not let AI claim completeness when required company evidence is missing", () => {
    const fallback = buildBusinessQualityFallback({ ticker: "ACME", instrumentType: "equity" });
    const candidate = {
      status: "complete",
      dimensions: BUSINESS_QUALITY_DIMENSIONS.map((dimension) => ({
        ...dimension,
        conclusion: "Claimed conclusion",
        supportingEvidence: [],
        contradictoryEvidence: [],
        uncertainty: ["Unknown"],
        additionalInformation: ["Current filing"],
      })),
    };
    const analysis = normalizeBusinessQualityAnalysis({ candidate, fallback });

    expect(analysis.status).toBe("insufficient_information");
  });

  it("downgrades evidence that cannot be matched to a retrieved source", () => {
    const fallback = buildBusinessQualityFallback({
      ticker: "ACME",
      instrumentType: "equity",
      uploadedFilings: [{ form: "10-K" }, { form: "10-Q" }],
    });
    const candidate = {
      status: "complete",
      dimensions: BUSINESS_QUALITY_DIMENSIONS.map((dimension) => ({
        ...dimension,
        conclusion: "Claimed conclusion",
        supportingEvidence: [
          {
            status: "identified",
            statement: "An unsupported public claim.",
            sourceLabel: "Imaginary source",
            sourceDate: "2026-01-01",
            sourceType: "public_source",
            sourceUrl: "https://invalid.example/claim",
          },
        ],
        contradictoryEvidence: [],
        uncertainty: ["Unknown"],
        additionalInformation: ["More evidence"],
      })),
    };
    const normalized = normalizeBusinessQualityAnalysis({ candidate, fallback });
    const constrained = constrainBusinessQualityEvidenceSources({ analysis: normalized, webSources: [] });

    expect(constrained.dimensions[0].supportingEvidence[0].status).toBe("not_identified");
    expect(constrained.dimensions[0].supportingEvidence[0].sourceType).toBe("not_available");
  });
});
