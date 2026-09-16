import { describe, expect, it } from "vitest";

import {
  buildCapitalAllocationDashboard,
  policySupportsTreasuryCashManagement,
} from "@/lib/neuroCapitalAllocation";
import { buildNeuroAnalysisEngine } from "@/lib/neuroAnalysisEngine";
import { starterNeuroInvestmentPolicy } from "@/lib/neuroInvestmentGovernance";

const engine = {
  positions: [
    {
      ticker: "OWN",
      researchOnly: false,
      currentValue: 8_000,
      currentPrice: 80,
      marketCap: 8_000_000,
      company: { name: "Owned Company" },
      derived: {
        baseGrowth: 0.06,
        fcfMargin: 0.12,
        marginOfSafety: 0.1,
        valuationStatus: "moderately_undervalued",
      },
      scenarios: { bear: { growth: 0.01, upsideToMarket: -0.25 } },
      documentReadiness: { ready: true },
    },
    {
      ticker: "NEW",
      researchOnly: true,
      currentValue: 50,
      currentPrice: 50,
      marketCap: 5_000_000,
      company: { name: "New Candidate" },
      derived: {
        baseGrowth: 0.08,
        fcfMargin: 0.15,
        marginOfSafety: 0.2,
        valuationStatus: "undervalued",
      },
      scenarios: { bear: { growth: 0.02, upsideToMarket: -0.3 } },
      documentReadiness: { ready: true },
    },
  ],
};

const marketData = {
  items: {
    OWN: { market: { regularMarketVolume: 2_000_000 } },
    NEW: {
      market: { regularMarketVolume: 250_000 },
      macro: {
        treasury: { averageInterestRate: 4.25, recordDate: "2026-09-15" },
      },
    },
  },
};

describe("Capital Allocation Dashboard", () => {
  it("preserves the research-only role through the deterministic engine", () => {
    const generated = buildNeuroAnalysisEngine({
      holdings: [
        {
          ticker: "NEW",
          shares: 1,
          averageCost: 50,
          currentPrice: 50,
          researchOnly: true,
        },
      ],
      marketData: {
        items: {
          NEW: {
            ticker: "NEW",
            market: { regularMarketPrice: 50, marketCap: 5_000_000 },
            annualFundamentals: [],
          },
        },
      },
    });

    expect(generated.positions[0].researchOnly).toBe(true);
    expect(generated.positions[0].derived.verdict).not.toMatch(/add|hold|trim|avoid/);
    expect(generated.allocation[0].targetWeight).toBeNull();
    expect(generated.allocation[0].deltaValue).toBeNull();
    expect(generated.simulation.automaticAllocationGenerated).toBe(false);
    expect(generated.simulation.stockPricePredictionGenerated).toBe(false);
  });

  it("keeps cash as a valid state and never requires deployment", () => {
    const dashboard = buildCapitalAllocationDashboard({
      engine,
      marketData,
      availableCapital: 2_000,
      focusTicker: "NEW",
    });

    expect(dashboard.cashState.validPortfolioState).toBe(true);
    expect(dashboard.cashState.deploymentRequired).toBe(false);
    expect(dashboard.methodology.forceCapitalDeployment).toBe(false);
    expect(dashboard.methodology.automaticAllocation).toBe(false);
    expect(dashboard.methodology.automaticRanking).toBe(false);
    expect(dashboard.alternatives.some((row) => row.kind === "cash")).toBe(true);
  });

  it("separates current positions from research candidates", () => {
    const dashboard = buildCapitalAllocationDashboard({
      engine,
      marketData,
      availableCapital: 2_000,
      focusTicker: "NEW",
    });
    const existing = dashboard.alternatives.find((row) => row.ticker === "OWN");
    const candidate = dashboard.alternatives.find((row) => row.ticker === "NEW");

    expect(dashboard.investedPortfolioValue).toBe(8_000);
    expect(existing?.kind).toBe("existing_position");
    expect(existing?.currentAllocation.amount).toBe(8_000);
    expect(candidate?.kind).toBe("new_candidate");
    expect(candidate?.currentAllocation.amount).toBe(0);
    expect(candidate?.existingConcentration.hypotheticalWeightIfAllAvailableCapitalAllocatedPct).toBe(20);
  });

  it("does not include Treasury merely because stocks and ETFs are allowed", () => {
    const policy = starterNeuroInvestmentPolicy();
    const dashboard = buildCapitalAllocationDashboard({
      engine,
      marketData,
      availableCapital: 2_000,
      focusTicker: "NEW",
      investmentPolicy: policy,
    });

    expect(policySupportsTreasuryCashManagement(policy)).toBe(false);
    expect(dashboard.treasuryCashManagement.included).toBe(false);
    expect(dashboard.alternatives.some((row) => row.kind === "treasury_cash_management")).toBe(false);
  });

  it("includes a Treasury comparison only when explicitly configured", () => {
    const policy = starterNeuroInvestmentPolicy();
    policy.limits.allowedInstruments.push("short_term_treasury");
    const dashboard = buildCapitalAllocationDashboard({
      engine,
      marketData,
      availableCapital: 2_000,
      focusTicker: "NEW",
      investmentPolicy: policy,
    });
    const treasury = dashboard.alternatives.find((row) => row.kind === "treasury_cash_management");

    expect(policySupportsTreasuryCashManagement(policy)).toBe(true);
    expect(dashboard.treasuryCashManagement.included).toBe(true);
    expect(treasury?.currentValuation.status).toBe("partial");
    expect(treasury?.currentValuation.referenceYieldPct).toBe(4.25);
    expect(treasury?.currentValuation.basis).toContain("broad Treasury context");
  });

  it("compares one dollar without converting the comparison into a recommendation", () => {
    const dashboard = buildCapitalAllocationDashboard({
      engine,
      marketData,
      availableCapital: 2_000,
      focusTicker: "NEW",
    });

    expect(dashboard.comparisonUnitAmount).toBe(1);
    expect(dashboard.alternatives.every((row) => row.comparisonUnit.amount === 1)).toBe(true);
    expect(dashboard.humanReviewRequired).toBe(true);
    expect(JSON.stringify(dashboard)).not.toContain("recommendedAlternative");
    expect(JSON.stringify(dashboard)).not.toContain("targetAllocation");
  });

  it("preserves unavailable capital and position values instead of displaying zero", () => {
    const dashboard = buildCapitalAllocationDashboard({
      engine: {
        positions: [{ ...engine.positions[0], currentValue: null }],
      },
      marketData,
      availableCapital: null,
      focusTicker: "OWN",
    });

    expect(dashboard.availableCapital).toBeNull();
    expect(dashboard.investedPortfolioValue).toBeNull();
    expect(dashboard.totalCapitalUnderReview).toBeNull();
    expect(dashboard.cashState.currentAmount).toBeNull();
    expect(dashboard.cashState.currentWeightPct).toBeNull();
  });
});
