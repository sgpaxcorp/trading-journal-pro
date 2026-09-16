import { describe, expect, it } from "vitest";

import {
  buildReverseDcfAnalysis,
  calculateReverseDcfEnterpriseValue,
} from "@/lib/neuroReverseDcf";

const fundamentals = [
  {
    year: 2022,
    totalRevenue: 800,
    operatingIncome: 160,
    freeCashFlow: 72,
    pretaxIncome: 160,
    incomeTaxExpense: 40,
    totalDebt: 100,
    cashAndCashEquivalents: 50,
    dilutedAverageShares: 10,
  },
  {
    year: 2023,
    totalRevenue: 900,
    operatingIncome: 180,
    freeCashFlow: 81,
    pretaxIncome: 180,
    incomeTaxExpense: 45,
    totalDebt: 100,
    cashAndCashEquivalents: 50,
    dilutedAverageShares: 10,
  },
  {
    year: 2024,
    totalRevenue: 1_000,
    operatingIncome: 200,
    freeCashFlow: 90,
    pretaxIncome: 200,
    incomeTaxExpense: 50,
    totalDebt: 100,
    cashAndCashEquivalents: 50,
    dilutedAverageShares: 10,
  },
];

function knownValuation() {
  const enterpriseValue = calculateReverseDcfEnterpriseValue({
    startingRevenue: 1_000,
    startingOperatingMargin: 0.2,
    targetOperatingMargin: 0.2,
    revenueGrowth: 0.08,
    reinvestmentRate: 0.4,
    taxRate: 0.25,
    costOfCapital: 0.1,
    terminalGrowth: 0.025,
    horizonYears: 10,
  });
  if (enterpriseValue == null) throw new Error("Test valuation could not be calculated.");
  const marketCap = enterpriseValue - 100 + 50;
  return { enterpriseValue, marketCap, currentPrice: marketCap / 10 };
}

describe("Reverse DCF Engine", () => {
  it("recovers known market-implied growth and emits multiple combinations", () => {
    const known = knownValuation();
    const analysis = buildReverseDcfAnalysis({
      ticker: "ACME",
      companyName: "Acme Corp.",
      currentPrice: known.currentPrice,
      marketCap: known.marketCap,
      annualFundamentals: fundamentals,
      horizonYears: 10,
      defaultCostOfCapitalPct: 10,
      defaultTerminalGrowthPct: 2.5,
      generatedAt: "2026-09-15T12:00:00.000Z",
    });

    const historical = analysis.impliedScenarios.find(
      (scenario) => scenario.id === "historical_economics"
    );
    expect(analysis.status).toBe("complete");
    expect(analysis.impliedScenarios).toHaveLength(6);
    expect(historical?.solutionStatus).toBe("solved");
    expect(historical?.revenueGrowthPct).toBeCloseTo(8, 1);
    expect(historical?.targetOperatingMarginPct).toBe(20);
    expect(historical?.reinvestmentRatePct).toBe(40);
    expect(historical?.taxRatePct).toBe(25);
    expect(Math.abs(historical?.valuationGapPct ?? 1)).toBeLessThan(0.001);
  });

  it("builds both requested sensitivity tables from the paired assumptions", () => {
    const known = knownValuation();
    const analysis = buildReverseDcfAnalysis({
      ticker: "ACME",
      currentPrice: known.currentPrice,
      marketCap: known.marketCap,
      annualFundamentals: fundamentals,
    });

    expect(analysis.sensitivityTables.map((table) => [table.rowMetric, table.columnMetric])).toEqual([
      ["revenue_growth", "operating_margin"],
      ["cost_of_capital", "terminal_growth"],
    ]);
    expect(analysis.sensitivityTables[0].cells).toHaveLength(25);
    expect(analysis.sensitivityTables[1].cells).toHaveLength(25);
  });

  it("preserves historical comparison without creating an automatic investment verdict", () => {
    const known = knownValuation();
    const analysis = buildReverseDcfAnalysis({
      ticker: "ACME",
      currentPrice: known.currentPrice,
      marketCap: known.marketCap,
      annualFundamentals: fundamentals,
    });

    expect(analysis.notARecommendation).toBe(true);
    expect(analysis.historicalPerformance.revenueCagrPct).toBeGreaterThan(0);
    expect(analysis.historicalPerformance.operatingMarginPct).toEqual([20, 20, 20]);
    expect(analysis.historicalPerformance.effectiveTaxRatePct).toEqual([25, 25, 25]);
    expect(analysis.whatMustBeTrue.length).toBeGreaterThanOrEqual(4);
    expect(analysis).not.toHaveProperty("verdict");
    expect(analysis).not.toHaveProperty("recommendation");
  });

  it("reports missing market inputs instead of manufacturing an implied scenario", () => {
    const analysis = buildReverseDcfAnalysis({
      ticker: "ACME",
      annualFundamentals: fundamentals,
    });

    expect(analysis.status).toBe("insufficient_information");
    expect(analysis.impliedScenarios).toEqual([]);
    expect(analysis.missingInformation).toContain(
      "Current market capitalization or current price plus diluted shares"
    );
  });

  it("does not assume missing debt or cash is zero", () => {
    const known = knownValuation();
    const missingCash = fundamentals.map((row, index) =>
      index === fundamentals.length - 1 ? { ...row, cashAndCashEquivalents: null } : row
    );
    const analysis = buildReverseDcfAnalysis({
      ticker: "ACME",
      currentPrice: known.currentPrice,
      marketCap: known.marketCap,
      annualFundamentals: missingCash,
    });

    expect(analysis.status).toBe("insufficient_information");
    expect(analysis.marketInputs.cashAndCashEquivalents).toBeNull();
    expect(analysis.marketInputs.targetEnterpriseValue).toBeNull();
    expect(analysis.marketInputs.cashAssumedZero).toBe(false);
    expect(analysis.impliedScenarios).toEqual([]);
    expect(analysis.limitations.join(" ")).not.toContain("assumed to be zero");
  });

  it("does not apply the operating-company FCFF model to funds or unsuitable sectors", () => {
    const fund = buildReverseDcfAnalysis({
      ticker: "SPY",
      instrumentType: "etf",
      annualFundamentals: fundamentals,
    });
    const bank = buildReverseDcfAnalysis({
      ticker: "BANK",
      sector: "Financial Services",
      industry: "Banks",
      currentPrice: 10,
      marketCap: 1_000,
      annualFundamentals: fundamentals,
    });

    expect(fund.status).toBe("not_applicable");
    expect(bank.status).toBe("not_applicable");
  });
});
