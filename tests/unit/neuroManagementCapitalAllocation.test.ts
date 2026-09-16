import { describe, expect, it } from "vitest";

import {
  buildManagementCapitalAllocationFallback,
  constrainManagementCapitalAllocationSources,
  MANAGEMENT_ACTION_CATEGORIES,
  normalizeManagementCapitalAllocationAnalysis,
} from "@/lib/neuroManagementCapitalAllocation";

function evidence(sourceLabel = "ACME 2025 10-K") {
  return {
    status: "identified",
    statement: "The filing documents the action and amount.",
    sourceLabel,
    sourceDate: "2025-12-31",
    sourceType: "company_filing",
    sourceUrl: null,
  };
}

function completeCandidate() {
  return {
    status: "complete",
    observableAllocationPattern: "Documented cash uses favored reinvestment and shareholder returns.",
    categories: MANAGEMENT_ACTION_CATEGORIES.map((category) => ({
      ...category,
      score: 100,
      conclusion: `${category.label} conclusion based on documented actions.`,
      documentedActions: [],
      inconsistencies: [],
      unresolvedQuestions: [`What additional disclosure would change the ${category.label} conclusion?`],
    })),
    incrementalCapitalAllocation: {
      status: "calculated",
      periodStart: "2025-01-01",
      periodEnd: "2025-12-31",
      currency: "USD",
      methodology: "Comparable documented cash outflows for the same fiscal year.",
      sourcesOfCapital: [
        {
          label: "Operating cash flow",
          amount: 150,
          currency: "USD",
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          source: evidence(),
        },
      ],
      uses: [
        {
          category: "acquisitions",
          label: "Cash paid for acquisitions",
          amount: 40,
          currency: "USD",
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          basis: "cash_outflow",
          includedInComparableTotal: true,
          exclusionReason: "",
          source: evidence(),
        },
        {
          category: "share_repurchases",
          label: "Cash paid for repurchases",
          amount: 60,
          currency: "USD",
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          basis: "cash_outflow",
          includedInComparableTotal: true,
          exclusionReason: "",
          source: evidence(),
        },
        {
          category: "research_and_development",
          label: "R&D operating expense",
          amount: 25,
          currency: "USD",
          periodStart: "2025-01-01",
          periodEnd: "2025-12-31",
          basis: "operating_expense",
          includedInComparableTotal: true,
          exclusionReason: "Already embedded in operating cash flow.",
          source: evidence(),
        },
      ],
      limitations: ["Acquisition consideration is presented gross of acquired cash."],
    },
    guidanceOutcomeComparisons: [
      {
        metric: "Revenue",
        managementStatement: "Management guided to $100 of revenue.",
        statementDate: "2025-01-01",
        expectedOutcome: "$100",
        subsequentDocumentedOutcome: "Reported revenue was $95.",
        outcomeDate: "2025-12-31",
        result: "missed",
        variance: "-$5 / -5%",
        statementSource: evidence("ACME 2025 10-K"),
        outcomeSource: evidence("ACME 2025 10-K"),
        unresolvedQuestion: "Were definitions unchanged?",
      },
    ],
    financialConsequences: ["Repurchases and acquisitions used $100 of verified cash."],
    inconsistencies: ["Guided revenue exceeded the subsequent documented result."],
    unresolvedQuestions: ["What return was earned on acquired capital?"],
  };
}

describe("Management and Capital Allocation Analysis", () => {
  it("preserves the exact 13 action categories and never creates a management score", () => {
    const fallback = buildManagementCapitalAllocationFallback({
      ticker: "ACME",
      companyName: "Acme Inc.",
      instrumentType: "equity",
      uploadedFilings: [{ form: "10-K" }, { form: "10-Q" }],
    });
    const analysis = normalizeManagementCapitalAllocationAnalysis({ candidate: completeCandidate(), fallback });

    expect(analysis.categories.map((category) => category.key)).toEqual(
      MANAGEMENT_ACTION_CATEGORIES.map((category) => category.key)
    );
    expect(analysis.characterInferenceProhibited).toBe(true);
    expect(JSON.stringify(analysis)).not.toContain('"score"');
  });

  it("does not let AI claim completion when the required company filings are absent", () => {
    const fallback = buildManagementCapitalAllocationFallback({ ticker: "ACME", instrumentType: "equity" });
    const analysis = normalizeManagementCapitalAllocationAnalysis({ candidate: completeCandidate(), fallback });

    expect(analysis.status).toBe("insufficient_information");
  });

  it("recomputes allocation from verified comparable cash uses and excludes embedded R&D", () => {
    const filings = [
      { ticker: "ACME", form: "10-K", fileName: "acme-2025-10k.pdf", periodEnd: "2025-12-31" },
      { ticker: "ACME", form: "10-Q", fileName: "acme-2026-q2.pdf", periodEnd: "2026-06-30" },
    ];
    const fallback = buildManagementCapitalAllocationFallback({
      ticker: "ACME",
      instrumentType: "equity",
      uploadedFilings: filings,
    });
    const normalized = normalizeManagementCapitalAllocationAnalysis({ candidate: completeCandidate(), fallback });
    const constrained = constrainManagementCapitalAllocationSources({ analysis: normalized, uploadedFilings: filings });
    const [acquisitions, repurchases, research] = constrained.incrementalCapitalAllocation.uses;

    expect(constrained.incrementalCapitalAllocation.status).toBe("calculated");
    expect(constrained.incrementalCapitalAllocation.totalComparableUses).toBe(100);
    expect(acquisitions.percentOfComparableUses).toBe(0.4);
    expect(repurchases.percentOfComparableUses).toBe(0.6);
    expect(research.includedInComparableTotal).toBe(false);
    expect(research.percentOfComparableUses).toBeNull();
  });

  it("downgrades unverified evidence and makes an unmatched guidance comparison not testable", () => {
    const filings = [{ ticker: "ACME", form: "10-K", fileName: "acme-2025-10k.pdf", periodEnd: "2025-12-31" }];
    const fallback = buildManagementCapitalAllocationFallback({
      ticker: "ACME",
      instrumentType: "equity",
      uploadedFilings: [...filings, { form: "10-Q" }],
    });
    const candidate: any = completeCandidate();
    candidate.guidanceOutcomeComparisons[0].outcomeSource = {
      ...evidence("Unsupported source"),
      sourceType: "public_source",
      sourceUrl: "https://invalid.example/outcome",
    };
    const normalized = normalizeManagementCapitalAllocationAnalysis({ candidate, fallback });
    const constrained = constrainManagementCapitalAllocationSources({
      analysis: normalized,
      uploadedFilings: filings,
      webSources: [],
    });

    expect(constrained.guidanceOutcomeComparisons[0].outcomeSource.status).toBe("not_identified");
    expect(constrained.guidanceOutcomeComparisons[0].result).toBe("not_testable");
  });

  it("marks the operating-company module as not applicable to a fund", () => {
    const analysis = buildManagementCapitalAllocationFallback({ ticker: "SPY", instrumentType: "etf" });

    expect(analysis.status).toBe("not_applicable");
  });
});
