import { describe, expect, it } from "vitest";

import {
  BEAR_CASE_AREAS,
  buildBearCaseFallback,
  buildBearCaseInput,
  constrainBearCaseEvidenceSources,
  normalizeBearCaseAnalysis,
} from "@/lib/neuroBearCase";

const generatedAt = "2026-09-16T12:00:00.000Z";

function candidate() {
  return {
    companyName: "Example Co",
    investmentThesis: "Durable demand and margin expansion can support long-term value creation.",
    strongestBearArgument: "A disclosed customer concentration creates material revenue sensitivity.",
    strongestBearArea: "customerLosses",
    evidenceSupportingStrongestArgument: [
      {
        status: "identified",
        statement: "One customer represented 31% of annual revenue.",
        sourceLabel: "EXM 2025 10-K",
        sourceDate: "2025-12-31",
        sourceType: "company_filing",
        sourceUrl: null,
      },
    ],
    potentialFinancialImpact: "Loss of the customer could reduce revenue and pressure fixed-cost absorption.",
    indicatorsToMonitor: ["Quarterly customer concentration disclosure"],
    confirmationConditions: ["The customer reduces purchases without replacement demand."],
    invalidationConditions: ["Concentration declines through verified customer diversification."],
    areas: BEAR_CASE_AREAS.map((area) => ({
      key: area.key,
      label: area.label,
      status: area.key === "customerLosses" ? "supported" : "insufficient_information",
      argument:
        area.key === "customerLosses"
          ? "Customer concentration could make revenue fragile."
          : "No supported area-specific argument.",
      supportingEvidence:
        area.key === "customerLosses"
          ? [
              {
                status: "identified",
                statement: "One customer represented 31% of annual revenue.",
                sourceLabel: "EXM 2025 10-K",
                sourceDate: "2025-12-31",
                sourceType: "company_filing",
                sourceUrl: null,
              },
            ]
          : [],
      contradictoryEvidence: [],
      potentialFinancialImpact: "Not quantified.",
      indicatorsToMonitor: ["Relevant disclosure"],
      confirmationConditions: ["Documented deterioration"],
      invalidationConditions: ["Documented improvement"],
      uncertainty: ["Future customer behavior is unknown."],
      additionalInformation: ["Updated customer concentration disclosure"],
    })),
    missingInformation: ["Current customer concentration"],
  };
}

describe("independent Bear Case Agent contract", () => {
  it("preserves all 16 areas and the independence controls", () => {
    const fallback = buildBearCaseFallback({
      ticker: "EXM",
      companyName: "Example Co",
      investmentThesis: "Durable demand supports long-term value creation.",
      generatedAt,
    });
    const analysis = normalizeBearCaseAnalysis({ candidate: candidate(), fallback });

    expect(analysis.areas).toHaveLength(16);
    expect(analysis.generatedBy).toBe("ai_research");
    expect(analysis.independence.bullRecommendationExcluded).toBe(true);
    expect(analysis.independence.finalRecommendationExcluded).toBe(true);
    expect(analysis.independence.probabilityExcluded).toBe(true);
    expect(analysis.noManufacturedArguments).toBe(true);
  });

  it("removes a strongest bear claim when its cited source is not in the frozen evidence set", () => {
    const fallback = buildBearCaseFallback({
      ticker: "EXM",
      companyName: "Example Co",
      investmentThesis: "Durable demand supports long-term value creation.",
      generatedAt,
    });
    const analysis = normalizeBearCaseAnalysis({ candidate: candidate(), fallback });
    const constrained = constrainBearCaseEvidenceSources({
      analysis,
      uploadedFilings: [],
      annualFundamentals: [],
      webSources: [],
      investmentThesis: analysis.investmentThesis,
    });

    expect(constrained.strongestBearArea).toBeNull();
    expect(constrained.strongestBearArgument).toContain("No sufficiently supported bear argument");
    expect(constrained.areas.find((area) => area.key === "customerLosses")?.status).toBe(
      "insufficient_information"
    );
  });

  it("accepts evidence only when it matches an indexed company filing", () => {
    const fallback = buildBearCaseFallback({
      ticker: "EXM",
      companyName: "Example Co",
      investmentThesis: "Durable demand supports long-term value creation.",
      generatedAt,
    });
    const analysis = normalizeBearCaseAnalysis({ candidate: candidate(), fallback });
    const constrained = constrainBearCaseEvidenceSources({
      analysis,
      uploadedFilings: [
        { ticker: "EXM", form: "10-K", fileName: "EXM 2025 10-K", periodEnd: "2025-12-31" },
      ],
      annualFundamentals: [],
      webSources: [],
      investmentThesis: analysis.investmentThesis,
    });

    expect(constrained.strongestBearArea).toBe("customerLosses");
    expect(constrained.evidenceSupportingStrongestArgument[0].status).toBe("identified");
  });

  it("builds an input that explicitly excludes both final recommendations", () => {
    const input = buildBearCaseInput({
      ticker: "EXM",
      investmentThesis: "Margins can expand.",
      reverseDcf: { impliedScenarios: [] },
    });

    expect(input).toContain("BULL AGENT FINAL RECOMMENDATION: INTENTIONALLY EXCLUDED");
    expect(input).toContain("FINAL NEURO RECOMMENDATION: NOT YET CREATED AND INTENTIONALLY EXCLUDED");
  });
});
