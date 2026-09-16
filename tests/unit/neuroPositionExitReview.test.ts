import { describe, expect, it } from "vitest";

import type { OriginalInvestmentThesisRecord } from "@/lib/neuroInvestmentThesis";
import {
  buildPositionExitReviewFallback,
  buildPositionExitReviewInput,
  constrainPositionExitReviewEvidence,
  normalizePositionExitReview,
  POSITION_EXIT_COMPARISON_TYPES,
} from "@/lib/neuroPositionExitReview";

const generatedAt = "2026-09-16T12:00:00.000Z";

function originalRecord(): OriginalInvestmentThesisRecord {
  return {
    id: "thesis-1",
    user_id: "user-1",
    case_id: "case-1",
    ticker: "EXM",
    committee_decision_id: "decision-1",
    committee_packet_id: "packet-1",
    purchase_date: "2026-01-15",
    purchase_price: 50,
    portfolio_weight_pct: 8,
    investment_thesis: [
      {
        classification: "AI_INTERPRETATION",
        text: "Recurring revenue and cash conversion should remain durable.",
        sourceIds: ["filing-1"],
        asOfDate: "2025-12-31",
      },
    ],
    valuation_assumptions: {
      committeeClaims: [
        {
          classification: "ASSUMPTION",
          text: "Base valuation assumes 8% revenue growth.",
          sourceIds: ["valuation_model"],
          asOfDate: "2026-01-15",
        },
      ],
      modelAssumptions: { discountRatePct: 10 },
      reverseDcf: { whatMustBeTrue: ["Revenue growth remains near 8%."] },
    },
    expected_business_developments: [],
    major_risks: [],
    expected_catalysts: [],
    key_metrics_to_monitor: [
      {
        metric: "Operating cash conversion",
        baseline: "Above 90%",
        whyItMatters: "Tests earnings quality.",
        sourceIds: ["filing-1"],
        asOfDate: "2025-12-31",
      },
    ],
    invalidation_conditions: [
      {
        classification: "AI_INTERPRETATION",
        text: "Operating cash conversion remains below 60% for two consecutive annual periods.",
        sourceIds: ["filing-1"],
        asOfDate: "2025-12-31",
      },
    ],
    supporting_documents: [
      {
        id: "filing-1",
        title: "EXM 2025 10-K",
        sourceType: "company_filing",
        documentDate: "2025-12-31",
        accessedAt: generatedAt,
        url: "https://example.com/exm-2025-10k",
      },
    ],
    committee_decision_snapshot: { decision: "APPROVED" },
    committee_packet_snapshot: {} as OriginalInvestmentThesisRecord["committee_packet_snapshot"],
    content_hash: "original-hash",
    created_at: "2026-01-15T12:00:00.000Z",
  };
}

function candidateChange(overrides: Record<string, unknown> = {}) {
  return {
    reason: "FUNDAMENTAL_DETERIORATION",
    change: "Cash conversion deteriorated materially.",
    materiality: "material",
    originalBaseline: "Cash conversion above 90%.",
    currentObservation: "Cash conversion was 52% in 2026.",
    explanation: "The actual result is materially below the purchase-date expectation.",
    matchedInvalidationCondition: null,
    originalSourceIds: ["filing-1"],
    currentEvidence: [
      {
        status: "identified",
        statement: "2026 operating cash conversion was 52%.",
        sourceLabel: "EXM 2026 annual financial statement",
        sourceDate: "2026-12-31",
        sourceType: "financial_statement",
        sourceUrl: null,
      },
    ],
    uncertainty: "One additional annual period is needed to test the invalidation condition.",
    ...overrides,
  };
}

describe("Position Exit Review", () => {
  it("defaults to insufficient evidence and never creates an automatic trading decision", () => {
    const original = originalRecord();
    const fallback = buildPositionExitReviewFallback({
      originalThesis: original,
      currentPrice: 35,
      generatedAt,
    });
    const promptInput = buildPositionExitReviewInput({ originalThesis: original });

    expect(fallback.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(fallback.primaryReason).toBeNull();
    expect(fallback.automaticTradingDecision).toBe(false);
    expect(fallback.humanDecisionRequired).toBe(true);
    expect(fallback.priceMovementAssessment.direction).toBe("down");
    expect(fallback.priceMovementAssessment.priceAloneCanDetermineThesisStatus).toBe(false);
    expect(promptInput).toContain("falling price alone is not thesis failure");
  });

  it("accepts fundamental deterioration only with verified current financial evidence", () => {
    const original = originalRecord();
    const fallback = buildPositionExitReviewFallback({ originalThesis: original, generatedAt });
    const normalized = normalizePositionExitReview({
      originalThesis: original,
      fallback,
      candidate: {
        status: "DOCUMENTED_CHANGE_REQUIRES_HUMAN_REVIEW",
        primaryReason: "FUNDAMENTAL_DETERIORATION",
        summary: "A documented operating change requires human review.",
        whatChanged: [candidateChange()],
      },
    });
    const constrained = constrainPositionExitReviewEvidence({
      review: normalized,
      originalThesis: original,
      annualFundamentals: [{ year: 2026 }],
    });

    expect(constrained.status).toBe("DOCUMENTED_CHANGE_REQUIRES_HUMAN_REVIEW");
    expect(constrained.primaryReason).toBe("FUNDAMENTAL_DETERIORATION");
  });

  it("rejects a valuation-change reason supported only by a falling stock price", () => {
    const original = originalRecord();
    const fallback = buildPositionExitReviewFallback({ originalThesis: original, currentPrice: 30, generatedAt });
    const priceEvidence = {
      status: "identified",
      statement: "The stock price fell from $50 to $30.",
      sourceLabel: "Current market quote",
      sourceDate: "2026-09-16",
      sourceType: "public_source",
      sourceUrl: "https://example.com/exm-quote",
    };
    const normalized = normalizePositionExitReview({
      originalThesis: original,
      fallback,
      candidate: {
        status: "DOCUMENTED_CHANGE_REQUIRES_HUMAN_REVIEW",
        primaryReason: "VALUATION_MATERIALLY_CHANGED",
        summary: "The price declined.",
        whatChanged: [
          candidateChange({
            reason: "VALUATION_MATERIALLY_CHANGED",
            change: "The stock price fell.",
            currentObservation: "The market price fell to $30.",
            explanation: "The lower stock price is treated as thesis failure.",
            currentEvidence: [priceEvidence],
          }),
        ],
        classificationEvidence: [priceEvidence],
      },
    });
    const constrained = constrainPositionExitReviewEvidence({
      review: normalized,
      originalThesis: original,
      webSources: [{ url: priceEvidence.sourceUrl }],
    });

    expect(constrained.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(constrained.primaryReason).toBeNull();
    expect(constrained.whatChanged[0].materiality).toBe("unclear");
    expect(constrained.automaticTradingDecision).toBe(false);
  });

  it("requires an exact frozen condition before classifying the original thesis as invalidated", () => {
    const original = originalRecord();
    const fallback = buildPositionExitReviewFallback({ originalThesis: original, generatedAt });
    const normalized = normalizePositionExitReview({
      originalThesis: original,
      fallback,
      candidate: {
        status: "DOCUMENTED_CHANGE_REQUIRES_HUMAN_REVIEW",
        primaryReason: "ORIGINAL_THESIS_INVALIDATED",
        whatChanged: [
          candidateChange({
            reason: "ORIGINAL_THESIS_INVALIDATED",
            matchedInvalidationCondition: "The share price falls 20%.",
          }),
        ],
      },
    });
    const constrained = constrainPositionExitReviewEvidence({
      review: normalized,
      originalThesis: original,
      annualFundamentals: [{ year: 2026 }],
    });

    expect(constrained.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(constrained.primaryReason).toBeNull();
  });

  it("accepts original-thesis invalidation only when the exact frozen condition is documented", () => {
    const original = originalRecord();
    const condition = original.invalidation_conditions[0].text;
    const fallback = buildPositionExitReviewFallback({ originalThesis: original, generatedAt });
    const normalized = normalizePositionExitReview({
      originalThesis: original,
      fallback,
      candidate: {
        status: "DOCUMENTED_CHANGE_REQUIRES_HUMAN_REVIEW",
        primaryReason: "ORIGINAL_THESIS_INVALIDATED",
        whatChanged: [
          candidateChange({
            reason: "ORIGINAL_THESIS_INVALIDATED",
            matchedInvalidationCondition: condition,
            currentObservation: "Cash conversion remained below 60% in 2025 and 2026.",
          }),
        ],
      },
    });
    const constrained = constrainPositionExitReviewEvidence({
      review: normalized,
      originalThesis: original,
      annualFundamentals: [{ year: 2026 }],
    });

    expect(constrained.status).toBe("DOCUMENTED_CHANGE_REQUIRES_HUMAN_REVIEW");
    expect(constrained.primaryReason).toBe("ORIGINAL_THESIS_INVALIDATED");
  });

  it("allows no documented change only when all three comparisons have verified evidence", () => {
    const original = originalRecord();
    const fallback = buildPositionExitReviewFallback({ originalThesis: original, generatedAt });
    const evidence = candidateChange().currentEvidence;
    const normalized = normalizePositionExitReview({
      originalThesis: original,
      fallback,
      candidate: {
        status: "NO_DOCUMENTED_CHANGE",
        primaryReason: null,
        summary: "All required comparisons are current and no material change was documented.",
        comparisons: POSITION_EXIT_COMPARISON_TYPES.map((type) => ({
          type,
          originalBaseline: "Purchase-date baseline.",
          currentObservation: "Current 2026 result.",
          change: "No material change documented.",
          materiality: "not_material",
          originalSourceIds: ["filing-1"],
          currentEvidence: evidence,
          uncertainty: "Normal forecasting uncertainty remains.",
        })),
      },
    });
    const constrained = constrainPositionExitReviewEvidence({
      review: normalized,
      originalThesis: original,
      annualFundamentals: [{ year: 2026 }],
    });

    expect(constrained.status).toBe("NO_DOCUMENTED_CHANGE");
    expect(constrained.primaryReason).toBeNull();
    expect(constrained.comparisons).toHaveLength(3);
  });
});
