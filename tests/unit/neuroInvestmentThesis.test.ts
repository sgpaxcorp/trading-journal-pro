import { describe, expect, it } from "vitest";

import type { InvestmentCommitteePacket } from "@/lib/neuroInvestmentCommittee";
import {
  buildInvestmentThesisReviewFallback,
  buildInvestmentThesisReviewInput,
  buildOriginalInvestmentThesisPayload,
  constrainInvestmentThesisReviewEvidence,
  normalizeInvestmentThesisReview,
  type OriginalInvestmentThesisRecord,
} from "@/lib/neuroInvestmentThesis";

const generatedAt = "2026-09-16T12:00:00.000Z";

function claim(text: string, sourceIds = ["filing-1"]) {
  return { classification: "FACT" as const, text, sourceIds, asOfDate: "2025-12-31" };
}

function packetFixture(): InvestmentCommitteePacket {
  const section = [claim("Documented committee baseline.")];
  return {
    schemaVersion: "1.0",
    ticker: "EXM",
    generatedAt,
    executiveSummary: section,
    investmentThesis: [claim("Recurring revenue should remain durable.")],
    currentMarketPrice: section,
    intrinsicValueRange: section,
    expectedReturnAssumptions: [
      {
        classification: "ASSUMPTION",
        text: "Base valuation assumes 8% revenue growth.",
        sourceIds: ["valuation_model"],
        asOfDate: generatedAt,
      },
    ],
    downsideScenario: [claim("A material retention decline would pressure free cash flow.")],
    keyFinancialMetrics: [claim("Revenue retention baseline was 110%.")],
    balanceSheetAnalysis: section,
    competitivePosition: section,
    catalysts: [claim("A new product launch is expected in 2027.")],
    principalRisks: [claim("Customer retention may weaken.")],
    contradictingEvidence: [claim("Recent cohort retention has moderated.")],
    portfolioImpact: section,
    positionSizeProposal: section,
    invalidationConditions: [claim("Net revenue retention falls below 90% for two consecutive quarters.")],
    completeness: { isComplete: true, missingSections: [], uncitedClaimCount: 0 },
  };
}

function originalRecord(): OriginalInvestmentThesisRecord {
  const packet = packetFixture();
  return {
    id: "thesis-1",
    user_id: "user-1",
    case_id: "case-1",
    ticker: "EXM",
    committee_decision_id: "decision-1",
    committee_packet_id: "packet-1",
    purchase_date: "2026-09-16",
    purchase_price: 42,
    portfolio_weight_pct: 5,
    investment_thesis: packet.investmentThesis,
    valuation_assumptions: {
      committeeClaims: packet.expectedReturnAssumptions,
      modelAssumptions: { discountRatePct: 10 },
      reverseDcf: { whatMustBeTrue: ["Revenue growth remains above 8%."] },
    },
    expected_business_developments: packet.catalysts,
    major_risks: packet.principalRisks,
    expected_catalysts: packet.catalysts,
    key_metrics_to_monitor: [
      {
        metric: "Net revenue retention",
        baseline: "110%",
        whyItMatters: "Tests recurring revenue durability.",
        sourceIds: ["filing-1"],
        asOfDate: "2025-12-31",
      },
    ],
    invalidation_conditions: packet.invalidationConditions,
    supporting_documents: [
      {
        id: "filing-1",
        title: "EXM 2025 10-K",
        sourceType: "company_filing",
        documentDate: "2025-12-31",
        accessedAt: generatedAt,
        url: "https://example.com/filing",
      },
      {
        id: "valuation_model",
        title: "Purchase-date valuation model",
        sourceType: "valuation_model",
        documentDate: generatedAt,
        accessedAt: generatedAt,
        url: null,
      },
    ],
    committee_decision_snapshot: { decision: "APPROVED" },
    committee_packet_snapshot: {
      id: "packet-1",
      caseId: "case-1",
      reportId: "report-1",
      policyId: "policy-1",
      ticker: "EXM",
      version: 1,
      generationStatus: "ready",
      packet,
      sourceManifest: [],
      reportSnapshot: {},
      engineSnapshot: {},
      policySnapshot: {},
      evidenceSnapshot: {},
      contentHash: "packet-hash",
      generatedBy: "deterministic_fallback",
      createdAt: generatedAt,
    },
    content_hash: "original-hash",
    created_at: generatedAt,
  };
}

describe("permanent original investment thesis", () => {
  it("freezes every required purchase-time field from the exact approved packet", () => {
    const packet = packetFixture();
    const payload = buildOriginalInvestmentThesisPayload({
      ticker: "EXM",
      purchaseDate: "2026-09-16",
      purchasePrice: 42,
      portfolioWeightPct: 5,
      packet,
      packetRow: {
        source_manifest: originalRecord().supporting_documents,
        engine_snapshot: {
          assumptions: { discountRatePct: 10 },
          positions: [{ ticker: "EXM", reverseDcf: { whatMustBeTrue: ["Revenue growth remains above 8%."] } }],
        },
        report_snapshot: {
          structured: {
            businessQualityAnalysis: {
              generatedAt,
              whatMustBeTrue: [{ condition: "Retention economics remain durable." }],
            },
            independentBearCaseAnalysis: {
              generatedAt,
              indicatorsToMonitor: ["Quarterly net revenue retention"],
            },
          },
        },
      },
      decision: { decision: "APPROVED", id: "decision-1" },
      frozenAt: generatedAt,
    });

    expect(payload.immutable).toBe(true);
    expect(payload.purchaseDate).toBe("2026-09-16");
    expect(payload.purchasePrice).toBe(42);
    expect(payload.portfolioWeightPct).toBe(5);
    expect(payload.investmentThesis).toEqual(packet.investmentThesis);
    expect(payload.valuationAssumptions.reverseDcf).toBeTruthy();
    expect(payload.expectedBusinessDevelopments.length).toBeGreaterThan(0);
    expect(payload.majorRisks.length).toBeGreaterThan(0);
    expect(payload.expectedCatalysts).toEqual(packet.catalysts);
    expect(payload.keyMetricsToMonitor.length).toBeGreaterThan(0);
    expect(payload.conditionsThatInvalidateTheThesis).toEqual(packet.invalidationConditions);
    expect(payload.supportingDocuments).toHaveLength(2);
    expect(payload.investmentCommitteeDecision).toEqual({ decision: "APPROVED", id: "decision-1" });
  });

  it("defaults to insufficient evidence and explicitly excludes automatic trading decisions", () => {
    const original = originalRecord();
    const fallback = buildInvestmentThesisReviewFallback({ originalThesis: original, generatedAt });
    const input = buildInvestmentThesisReviewInput({ originalThesis: original });

    expect(fallback.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(fallback.originalThesisPreserved).toBe(true);
    expect(fallback.automaticTradingDecision).toBe(false);
    expect(input).toContain("ORIGINAL immutable investment thesis");
    expect(input).toContain("not an automatic trading decision");
  });

  it("allows invalidation only when verified current evidence matches an exact frozen condition", () => {
    const original = originalRecord();
    const fallback = buildInvestmentThesisReviewFallback({ originalThesis: original, generatedAt });
    const evidence = {
      status: "identified",
      statement: "Retention was below 90% for the second consecutive quarter.",
      sourceLabel: "Current retention disclosure",
      sourceDate: "2026-09-15",
      sourceType: "public_source",
      sourceUrl: "https://example.com/current-retention",
    };
    const normalized = normalizeInvestmentThesisReview({
      fallback,
      originalThesis: original,
      candidate: {
        classification: "THESIS_INVALIDATED",
        summary: "The frozen retention condition was met.",
        changes: [
          {
            field: "invalidation_conditions",
            originalExpectation: original.invalidation_conditions[0].text,
            currentFact: evidence.statement,
            effect: "invalidates",
            explanation: "The exact purchase-date invalidation condition is now documented.",
            matchedInvalidationCondition: original.invalidation_conditions[0].text,
            originalSourceIds: ["filing-1"],
            currentEvidence: [evidence],
          },
        ],
        classificationEvidence: [evidence],
        missingEvidence: [],
      },
    });
    const constrained = constrainInvestmentThesisReviewEvidence({
      review: normalized,
      originalThesis: original,
      webSources: [{ url: evidence.sourceUrl, title: evidence.sourceLabel }],
    });

    expect(constrained.classification).toBe("THESIS_INVALIDATED");
    expect(constrained.changes[0].currentEvidence[0].status).toBe("identified");
  });

  it("rejects an invalidation label when the claimed condition is not in the frozen original", () => {
    const original = originalRecord();
    const fallback = buildInvestmentThesisReviewFallback({ originalThesis: original, generatedAt });
    const evidence = {
      status: "identified",
      statement: "The share price declined.",
      sourceLabel: "Current market source",
      sourceDate: "2026-09-15",
      sourceType: "public_source",
      sourceUrl: "https://example.com/price",
    };
    const normalized = normalizeInvestmentThesisReview({
      fallback,
      originalThesis: original,
      candidate: {
        classification: "THESIS_INVALIDATED",
        changes: [
          {
            field: "invalidation_conditions",
            originalExpectation: "Durable retention",
            currentFact: evidence.statement,
            effect: "invalidates",
            explanation: "Price moved lower.",
            matchedInvalidationCondition: "The share price declines 10%.",
            originalSourceIds: ["filing-1"],
            currentEvidence: [evidence],
          },
        ],
        classificationEvidence: [evidence],
        missingEvidence: [],
      },
    });
    const constrained = constrainInvestmentThesisReviewEvidence({
      review: normalized,
      originalThesis: original,
      webSources: [{ url: evidence.sourceUrl, title: evidence.sourceLabel }],
    });

    expect(constrained.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(constrained.automaticTradingDecision).toBe(false);
  });

  it("does not treat price movement alone as a strengthening or weakening of the business thesis", () => {
    const original = originalRecord();
    const fallback = buildInvestmentThesisReviewFallback({ originalThesis: original, generatedAt });
    const evidence = {
      status: "identified",
      statement: "The share price increased 25%.",
      sourceLabel: "Current market source",
      sourceDate: "2026-09-15",
      sourceType: "public_source",
      sourceUrl: "https://example.com/price-change",
    };
    const review = normalizeInvestmentThesisReview({
      fallback,
      originalThesis: original,
      candidate: {
        classification: "THESIS_STRENGTHENED",
        changes: [
          {
            field: "investment_thesis",
            originalExpectation: original.investment_thesis[0].text,
            currentFact: evidence.statement,
            effect: "strengthens",
            explanation: "The stock price rose.",
            matchedInvalidationCondition: null,
            originalSourceIds: ["filing-1"],
            currentEvidence: [evidence],
          },
        ],
        classificationEvidence: [evidence],
      },
    });
    const constrained = constrainInvestmentThesisReviewEvidence({
      review,
      originalThesis: original,
      webSources: [{ url: evidence.sourceUrl, title: evidence.sourceLabel }],
    });

    expect(constrained.classification).toBe("INSUFFICIENT_EVIDENCE");
    expect(constrained.changes[0].effect).toBe("unclear");
  });
});
