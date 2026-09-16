import { describe, expect, it } from "vitest";

import {
  buildCommitteePacketFallback,
  buildCommitteeSourceManifest,
  COMMITTEE_SECTION_KEYS,
  isCommitteeDecision,
  normalizeInvestmentCommitteePacket,
} from "@/lib/neuroInvestmentCommittee";

const generatedAt = "2026-09-15T12:00:00.000Z";

function reportFixture() {
  return {
    id: "report-1",
    created_at: "2026-09-14T15:00:00.000Z",
    report_text: "SMR has a working long-term thesis, but the committee must review valuation and execution risk.",
    filings_used: [
      {
        ticker: "SMR",
        form: "10-K",
        fileName: "smr-2025-10k.pdf",
        periodEnd: "2025-12-31",
      },
      {
        ticker: "SMR",
        form: "10-Q",
        fileName: "smr-2026-q2.pdf",
        periodEnd: "2026-06-30",
      },
    ],
    market_data_snapshot: {
      ticker: "SMR",
      market: { regularMarketPrice: 10, marketCap: 1_000_000 },
    },
    structured: {
      businessQualityAnalysis: { generatedAt, status: "complete" },
      managementCapitalAllocationAnalysis: { generatedAt, status: "complete" },
      earningsQualityAccountingRiskAnalysis: { generatedAt, status: "complete" },
      independentBearCaseAnalysis: {
        generatedAt,
        status: "complete",
        strongestBearArgument: "Execution delays could increase capital requirements before commercialization.",
        confirmationConditions: ["Project delays continue while required capital rises."],
        invalidationConditions: ["Milestones arrive on schedule within the disclosed budget."],
      },
    },
    engine: {
      assumptions: { horizonYears: 5, discountRatePct: 10, terminalGrowthPct: 2.5 },
      positions: [
        {
          ticker: "SMR",
          currentPrice: 10,
          marketCap: 1_000_000,
          weight: 0.05,
          latestFundamentals: {
            year: 2025,
            totalRevenue: 100_000,
            operatingIncome: 20_000,
            netIncome: 15_000,
            freeCashFlow: 12_000,
            totalDebt: 30_000,
            stockholdersEquity: 60_000,
            debtToEquity: 0.5,
          },
          scenarios: {
            bear: { intrinsicEquityValue: 800_000, upsideToMarket: -0.2 },
            base: { intrinsicEquityValue: 1_300_000, upsideToMarket: 0.3 },
            bull: { intrinsicEquityValue: 1_700_000, upsideToMarket: 0.7 },
          },
          reverseDcf: {
            impliedScenarios: [
              {
                solutionStatus: "solved",
                revenueGrowthPct: 8,
                targetOperatingMarginPct: 20,
              },
              {
                solutionStatus: "solved",
                revenueGrowthPct: 12,
                targetOperatingMarginPct: 17,
              },
            ],
          },
        },
      ],
      allocation: [{ ticker: "SMR", targetWeight: 0.1, deltaValue: 50_000 }],
    },
  };
}

const policy = {
  id: "policy-1",
  version: 2,
  status: "active",
  approvedAt: "2026-09-01T12:00:00.000Z",
  limits: { maxPositionPct: 8 },
};

describe("Neuro Investment Committee packet", () => {
  it("builds every required packet section with dated source citations", () => {
    const report = reportFixture();
    const sources = buildCommitteeSourceManifest({ ticker: "SMR", report, policy, generatedAt });
    const packet = buildCommitteePacketFallback({ ticker: "SMR", report, policy, sources, generatedAt });

    expect(packet.completeness.isComplete).toBe(true);
    expect(packet.completeness.uncitedClaimCount).toBe(0);
    expect(packet.positionSizeProposal[0].text).toContain("8.0%");
    expect(sources.some((source) => source.id === "management_capital_allocation_analysis")).toBe(true);
    expect(sources.some((source) => source.id === "earnings_quality_accounting_risk_analysis")).toBe(true);
    expect(sources.some((source) => source.id === "independent_bear_case_analysis")).toBe(true);
    expect(packet.principalRisks[0].text).toContain("Execution delays");
    expect(packet.expectedReturnAssumptions.some((claim) => claim.text.includes("Reverse DCF produced 2"))).toBe(true);
    for (const section of COMMITTEE_SECTION_KEYS) {
      expect(packet[section].length).toBeGreaterThan(0);
      expect(packet[section][0].sourceIds.length).toBeGreaterThan(0);
      expect(packet[section][0].asOfDate).toBeTruthy();
    }
  });

  it("never accepts USER_DECISION content from an AI-generated packet", () => {
    const report = reportFixture();
    const sources = buildCommitteeSourceManifest({ ticker: "SMR", report, policy, generatedAt });
    const fallback = buildCommitteePacketFallback({ ticker: "SMR", report, policy, sources, generatedAt });
    const packet = normalizeInvestmentCommitteePacket({
      candidate: {
        executiveSummary: [
          {
            classification: "USER_DECISION",
            text: "APPROVED",
            sourceIds: ["research_report"],
            asOfDate: generatedAt,
          },
        ],
      },
      fallback,
      sources,
    });

    expect(packet.executiveSummary[0].classification).toBe("AI_INTERPRETATION");
    expect(packet.completeness.isComplete).toBe(true);
  });

  it("accepts only the four human committee decisions", () => {
    expect(isCommitteeDecision("APPROVED")).toBe(true);
    expect(isCommitteeDecision("NEEDS_MORE_RESEARCH")).toBe(true);
    expect(isCommitteeDecision("PROPOSE")).toBe(false);
    expect(isCommitteeDecision("AI_APPROVED")).toBe(false);
  });
});
