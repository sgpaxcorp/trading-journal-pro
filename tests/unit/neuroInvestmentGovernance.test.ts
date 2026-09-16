import { describe, expect, it } from "vitest";

import {
  buildNeuroDecisionSupport,
  starterNeuroInvestmentPolicy,
  type NeuroInvestmentPolicy,
} from "@/lib/neuroInvestmentGovernance";

function activePolicy(): NeuroInvestmentPolicy {
  return {
    ...starterNeuroInvestmentPolicy(),
    status: "active",
    approvedAt: "2026-09-15T12:00:00.000Z",
  };
}

function researchEngine({
  docsReady = true,
  marginOfSafety = 0.35,
  fcfMargin = 0.14,
  debtToEquity = 0.4,
  weight = 0.1,
} = {}) {
  return {
    positions: [
      {
        ticker: "SMR",
        weight,
        currentPrice: 10,
        marketCap: 1_000_000,
        latestFundamentals: {
          fcfMargin,
          debtToEquity,
          freeCashFlow: 120_000,
        },
        derived: {
          marginOfSafety,
          valuationStatus:
            marginOfSafety >= 0.15
              ? "undervalued"
              : marginOfSafety <= -0.15
                ? "overvalued"
                : "fairly_valued",
          fcfMargin,
          debtToEquity,
        },
        valuationProfile: {
          currentMarketCap: 1_000_000,
          selectedHorizonScenarios: {
            base: {
              intrinsicEquityValue: 1_350_000,
            },
          },
        },
      },
    ],
    documentReadiness: [
      {
        ticker: "SMR",
        ready: docsReady,
        missing: docsReady ? [] : ["10-Q"],
        requiresCompanyFilings: true,
        evidenceModel: "company_filings",
      },
    ],
    riskFlags: [],
  };
}

const marketData = {
  market: {
    regularMarketPrice: 10,
    marketCap: 1_000_000,
  },
};

const businessQualityAnalysis = {
  status: "complete",
  generatedBy: "ai_research",
};

const managementCapitalAllocationAnalysis = {
  status: "complete",
  generatedBy: "ai_research",
};

const earningsQualityAccountingRiskAnalysis = {
  status: "complete",
  generatedBy: "ai_research",
};

const independentBearCaseAnalysis = {
  status: "complete",
  generatedBy: "ai_research",
};

describe("neuro investment governance", () => {
  it("blocks capital proposals when company filings are missing", () => {
    const support = buildNeuroDecisionSupport({
      engine: researchEngine({ docsReady: false }),
      policy: activePolicy(),
      focusTicker: "SMR",
      marketData,
      vectorStoreCount: 1,
      filingsIndexed: 1,
      privateMethodologyReady: true,
      businessQualityAnalysis,
      managementCapitalAllocationAnalysis,
      earningsQualityAccountingRiskAnalysis,
      independentBearCaseAnalysis,
    });

    expect(support.suggestedState).toBe("insufficient_information");
    expect(support.committeeReviewEligible).toBe(false);
    expect(support.capitalActionAllowed).toBe(false);
    expect(support.blockingReasons).toContain("Required filings not indexed");
    expect(support.evidenceCompleteness).not.toBe("sufficient");
    expect(support.systemDisposition.code).toBe("NEED_MORE_INFORMATION");
    expect(support).not.toHaveProperty("confidence");
  });

  it("advances a proposal to committee without approving a capital action", () => {
    const support = buildNeuroDecisionSupport({
      engine: researchEngine(),
      policy: activePolicy(),
      focusTicker: "SMR",
      marketData,
      vectorStoreCount: 3,
      filingsIndexed: 2,
      privateMethodologyReady: true,
      businessQualityAnalysis,
      managementCapitalAllocationAnalysis,
      earningsQualityAccountingRiskAnalysis,
      independentBearCaseAnalysis,
    });

    expect(support.suggestedState).toBe("propose");
    expect(support.committeeReviewEligible).toBe(true);
    expect(support.capitalActionAllowed).toBe(false);
    expect(support.scorecard.overall).toBeGreaterThanOrEqual(68);
    expect(support.evidenceCompleteness).toBe("sufficient");
    expect(support.systemDisposition.code).toBe("DO_NOTHING");
    expect(support.systemDisposition.humanDecisionRequired).toBe(true);
    expect(support).not.toHaveProperty("confidence");
  });

  it("cannot advance an AI proposal while the emergency control is disabled", () => {
    const support = buildNeuroDecisionSupport({
      engine: researchEngine(),
      policy: activePolicy(),
      focusTicker: "SMR",
      marketData,
      vectorStoreCount: 3,
      filingsIndexed: 2,
      privateMethodologyReady: true,
      businessQualityAnalysis,
      managementCapitalAllocationAnalysis,
      earningsQualityAccountingRiskAnalysis,
      independentBearCaseAnalysis,
      aiTradeProposalsEnabled: false,
    });

    expect(support.suggestedState).toBe("observe");
    expect(support.committeeReviewEligible).toBe(false);
    expect(support.capitalActionAllowed).toBe(false);
    expect(support.blockingReasons).toContain(
      "AI-generated trade proposals disabled by emergency control"
    );
  });

  it("keeps strong evidence in observe when the investment policy is still draft", () => {
    const support = buildNeuroDecisionSupport({
      engine: researchEngine(),
      policy: starterNeuroInvestmentPolicy(),
      focusTicker: "SMR",
      marketData,
      vectorStoreCount: 3,
      filingsIndexed: 2,
      privateMethodologyReady: true,
      businessQualityAnalysis,
      managementCapitalAllocationAnalysis,
      earningsQualityAccountingRiskAnalysis,
      independentBearCaseAnalysis,
    });

    expect(support.suggestedState).toBe("observe");
    expect(support.committeeReviewEligible).toBe(false);
    expect(support.capitalActionAllowed).toBe(false);
    expect(support.blockingReasons).toContain("No approved investment policy");
    expect(support.systemDisposition.code).toBe("NEED_MORE_INFORMATION");
  });

  it("blocks committee review until the business-first dossier exists", () => {
    const support = buildNeuroDecisionSupport({
      engine: researchEngine(),
      policy: activePolicy(),
      focusTicker: "SMR",
      marketData,
      vectorStoreCount: 3,
      filingsIndexed: 2,
      privateMethodologyReady: true,
      managementCapitalAllocationAnalysis,
      earningsQualityAccountingRiskAnalysis,
      independentBearCaseAnalysis,
    });

    expect(support.suggestedState).toBe("insufficient_information");
    expect(support.committeeReviewEligible).toBe(false);
    expect(support.evidence.businessQualityReady).toBe(false);
    expect(support.blockingReasons).toContain("Business Quality Analysis incomplete");
  });

  it("blocks committee review until the management-actions dossier exists", () => {
    const support = buildNeuroDecisionSupport({
      engine: researchEngine(),
      policy: activePolicy(),
      focusTicker: "SMR",
      marketData,
      vectorStoreCount: 3,
      filingsIndexed: 2,
      privateMethodologyReady: true,
      businessQualityAnalysis,
      earningsQualityAccountingRiskAnalysis,
      independentBearCaseAnalysis,
    });

    expect(support.suggestedState).toBe("insufficient_information");
    expect(support.committeeReviewEligible).toBe(false);
    expect(support.evidence.managementAllocationReady).toBe(false);
    expect(support.blockingReasons).toContain("Management and Capital Allocation Analysis incomplete");
  });

  it("blocks committee review until the earnings-quality dossier exists", () => {
    const support = buildNeuroDecisionSupport({
      engine: researchEngine(),
      policy: activePolicy(),
      focusTicker: "SMR",
      marketData,
      vectorStoreCount: 3,
      filingsIndexed: 2,
      privateMethodologyReady: true,
      businessQualityAnalysis,
      managementCapitalAllocationAnalysis,
      independentBearCaseAnalysis,
    });

    expect(support.suggestedState).toBe("insufficient_information");
    expect(support.committeeReviewEligible).toBe(false);
    expect(support.evidence.earningsQualityReady).toBe(false);
    expect(support.blockingReasons).toContain("Earnings Quality and Accounting Risk Analysis incomplete");
  });

  it("blocks committee review until the independent bear case exists", () => {
    const support = buildNeuroDecisionSupport({
      engine: researchEngine(),
      policy: activePolicy(),
      focusTicker: "SMR",
      marketData,
      vectorStoreCount: 3,
      filingsIndexed: 2,
      privateMethodologyReady: true,
      businessQualityAnalysis,
      managementCapitalAllocationAnalysis,
      earningsQualityAccountingRiskAnalysis,
    });

    expect(support.suggestedState).toBe("insufficient_information");
    expect(support.committeeReviewEligible).toBe(false);
    expect(support.evidence.independentBearCaseReady).toBe(false);
    expect(support.blockingReasons).toContain("Independent Bear Case Analysis incomplete");
  });
});
