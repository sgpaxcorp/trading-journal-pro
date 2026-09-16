import { describe, expect, it } from "vitest";

import {
  auditAiInvestmentProbabilityPayload,
  enforceInvestmentProbabilityIntegrity,
  hasValidatedStatisticalModelDisclosure,
  INVESTMENT_PROBABILITY_NOT_AVAILABLE,
} from "@/lib/neuroInvestmentProbabilityIntegrity";

const validatedModel = {
  modelName: "Documented return calibration model",
  modelVersion: "1.0.0",
  methodology: "Out-of-sample logistic calibration",
  validationEvidence: "Walk-forward validation report dated 2026-09-01",
  sampleDefinition: "US common stocks from 2000 through 2025",
  assumptions: ["Inputs are observed at each rebalance date"],
  limitations: ["Historical relationships may not persist"],
  calculationTimestamp: "2026-09-16T12:00:00.000Z",
  sourceData: ["Validated model dataset v3"],
};

describe("investment probability integrity", () => {
  it.each([
    "85% chance this stock will increase.",
    "AI confidence: 92%.",
    "Confidence: 92%.",
    "Probability of successful investment: 78%.",
    "Likelihood of a positive return: 8/10.",
    "Existe un 85% de probabilidad de que la acción suba.",
    "Confianza de la IA: 92%.",
    "Probabilidad de éxito de la inversión: 78%.",
  ])("blocks unsupported investment probability claim: %s", (claim) => {
    const result = enforceInvestmentProbabilityIntegrity(claim);

    expect(result.text).toContain(INVESTMENT_PROBABILITY_NOT_AVAILABLE);
    expect(result.text).not.toContain(claim);
    expect(result.blockedClaimCount).toBe(1);
    expect(result.validatedStatisticalModelUsed).toBe(false);
  });

  it("blocks qualitative LLM certainty tied to a market outcome", () => {
    const result = enforceInvestmentProbabilityIntegrity(
      "High confidence this stock will increase over the next year."
    );

    expect(result.text).toContain(INVESTMENT_PROBABILITY_NOT_AVAILABLE);
    expect(result.blockedClaimCount).toBe(1);
  });

  it("preserves qualitative uncertainty and evidence-gap language", () => {
    const text =
      "Evidence is incomplete. Revenue concentration and debt maturities require additional research.";
    const result = enforceInvestmentProbabilityIntegrity(text);

    expect(result.text).toBe(text);
    expect(result.blockedClaimCount).toBe(0);
  });

  it("requires a complete statistical-model disclosure", () => {
    expect(hasValidatedStatisticalModelDisclosure(validatedModel)).toBe(true);
    expect(
      hasValidatedStatisticalModelDisclosure({
        ...validatedModel,
        limitations: [],
      })
    ).toBe(false);
  });

  it("allows a probability only with a complete validated-model disclosure", () => {
    const text = "The validated model estimates a 61% probability of a positive return.";
    const result = enforceInvestmentProbabilityIntegrity(text, {
      validatedModel,
    });

    expect(result.text).toBe(text);
    expect(result.blockedClaimCount).toBe(0);
    expect(result.validatedStatisticalModelUsed).toBe(true);
  });

  it("audits nested AI payload strings without changing non-string values", () => {
    const audited = auditAiInvestmentProbabilityPayload({
      summary: "AI confidence: 92%.",
      evidence: ["Evidence is incomplete."],
      sourceCount: 4,
    }) as any;

    expect(audited.summary).toContain(INVESTMENT_PROBABILITY_NOT_AVAILABLE);
    expect(audited.evidence).toEqual(["Evidence is incomplete."]);
    expect(audited.sourceCount).toBe(4);
  });
});
