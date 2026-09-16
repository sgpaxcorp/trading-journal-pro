import { describe, expect, it } from "vitest";

import {
  EARNINGS_QUALITY_AREAS,
  buildEarningsQualityFallback,
  constrainEarningsQualitySources,
  normalizeEarningsQualityAnalysis,
} from "@/lib/neuroEarningsQuality";

const fundamentals = [
  {
    year: 2022,
    totalRevenue: 1_000,
    netIncome: 100,
    operatingCashFlow: 70,
    freeCashFlow: 50,
    accountsReceivable: 100,
    inventory: 100,
    dilutedAverageShares: 100,
  },
  {
    year: 2023,
    totalRevenue: 1_100,
    netIncome: 120,
    operatingCashFlow: 75,
    freeCashFlow: 55,
    accountsReceivable: 150,
    inventory: 115,
    dilutedAverageShares: 104,
  },
  {
    year: 2024,
    totalRevenue: 1_200,
    netIncome: 140,
    operatingCashFlow: 80,
    freeCashFlow: 60,
    accountsReceivable: 220,
    inventory: 120,
    dilutedAverageShares: 110,
  },
];

function fallback() {
  return buildEarningsQualityFallback({
    ticker: "ACME",
    companyName: "Acme Corp.",
    annualFundamentals: fundamentals,
    uploadedFilings: [
      { ticker: "ACME", form: "10-K", fileName: "acme-2024-10k.pdf", periodEnd: "2024-12-31" },
      { ticker: "ACME", form: "10-Q", fileName: "acme-2025-q1.pdf", periodEnd: "2025-03-31" },
    ],
    generatedAt: "2026-09-15T12:00:00.000Z",
  });
}

describe("Earnings Quality and Accounting Risk Agent", () => {
  it("covers all 20 requested areas without creating a fraud score", () => {
    const analysis = fallback();

    expect(analysis.areas.map((area) => area.key)).toEqual(EARNINGS_QUALITY_AREAS.map((area) => area.key));
    expect(analysis.areas).toHaveLength(20);
    expect(analysis.fraudDetermination).toBe("not_made");
    expect(analysis.statisticalAnomaliesAreNotFraudFindings).toBe(true);
    expect(analysis.priceDataExcluded).toBe(true);
    expect(analysis).not.toHaveProperty("score");
    expect(analysis).not.toHaveProperty("fraudProbability");
  });

  it("recomputes cash conversion and receivables divergence from raw multi-year values", () => {
    const analysis = fallback();
    const cashConversion = analysis.areas.find((area) => area.key === "netIncomeVsOperatingCashFlow");
    const receivables = analysis.areas.find((area) => area.key === "accountsReceivableVsRevenue");

    expect(cashConversion?.multiYearTrend.map((point) => point.calculatedValue)).toEqual([0.7, 0.625, 80 / 140]);
    expect(cashConversion?.investigationFlag.status).toBe("investigate");
    expect(receivables?.multiYearTrend[1].calculatedValue).toBeCloseTo(0.4, 8);
    expect(receivables?.multiYearTrend[2].calculatedValue).toBeCloseTo((220 / 150 - 1) - (1_200 / 1_100 - 1), 8);
    expect(receivables?.investigationFlag.status).toBe("investigate");
  });

  it("treats persistent share issuance as a specific investigation screen", () => {
    const dilution = fallback().areas.find((area) => area.key === "shareDilution");

    expect(dilution?.multiYearTrend.map((point) => point.calculatedValue)).toEqual([1.04, 110 / 104]);
    expect(dilution?.investigationFlag.status).toBe("investigate");
    expect(dilution?.investigationFlag.mathematicalExplanation).toContain("increased diluted average shares");
  });

  it("neutralizes unsupported fraud accusations while preserving an investigation prompt", () => {
    const base = fallback();
    const candidate = {
      companyName: "Acme Corp.",
      status: "complete",
      summary: "The company is fraudulent.",
      prioritizedInvestigationQuestions: ["Reconcile operating cash flow to earnings."],
      areas: base.areas.map((area, index) => ({
        ...area,
        conclusion: index === 0 ? "Management committed accounting fraud." : area.conclusion,
      })),
    };
    const analysis = normalizeEarningsQualityAnalysis({ candidate, fallback: base });

    expect(analysis.generatedBy).toBe("ai_research");
    expect(analysis.summary).toContain("requires additional investigation");
    expect(analysis.areas[0].conclusion).toContain("requires additional investigation");
    expect(analysis.summary.toLowerCase()).not.toContain("is fraudulent");
  });

  it("removes calculations that cannot be matched to retrieved source data", () => {
    const analysis = constrainEarningsQualitySources({
      analysis: fallback(),
      annualFundamentals: [],
      uploadedFilings: [],
      webSources: [],
    });
    const cashConversion = analysis.areas.find((area) => area.key === "netIncomeVsOperatingCashFlow");

    expect(analysis.status).toBe("insufficient_information");
    expect(cashConversion?.multiYearTrend.every((point) => point.calculatedValue == null)).toBe(true);
    expect(cashConversion?.investigationFlag.status).toBe("data_gap");
  });

  it("marks the operating-company module not applicable for funds", () => {
    const analysis = buildEarningsQualityFallback({ ticker: "SPY", instrumentType: "etf" });

    expect(analysis.status).toBe("not_applicable");
  });
});
