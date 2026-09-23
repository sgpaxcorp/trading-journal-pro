import { describe, expect, it } from "vitest";

import {
  calculateCurrentRatio,
  calculateInterestCoverage,
  calculateRoicProxy,
} from "@/lib/neuroScreeningMetrics";

describe("sector screening financial metrics", () => {
  it("calculates the documented ROIC proxy only from available inputs", () => {
    const result = calculateRoicProxy({
      operatingIncome: 120,
      pretaxIncome: 100,
      incomeTaxExpense: 20,
      totalDebt: 200,
      stockholdersEquity: 500,
      cashAndCashEquivalents: 100,
    });

    expect(result.value).toBeCloseTo(0.16, 8);
    expect(result.formula).toContain("operatingIncome");
    expect(result.missingInputs).toEqual([]);
  });

  it("returns unavailable ROIC instead of inventing a missing tax input", () => {
    const result = calculateRoicProxy({
      operatingIncome: 120,
      pretaxIncome: 100,
      incomeTaxExpense: null,
      totalDebt: 200,
      stockholdersEquity: 500,
      cashAndCashEquivalents: 100,
    });

    expect(result.value).toBeNull();
    expect(result.missingInputs).toContain("income tax expense");
  });

  it("calculates liquidity and interest coverage deterministically", () => {
    expect(calculateCurrentRatio({ currentAssets: 300, currentLiabilities: 200 }).value).toBe(1.5);
    expect(calculateInterestCoverage({ operatingIncome: 100, interestExpense: -20 }).value).toBe(5);
  });

  it("does not divide by a zero denominator", () => {
    expect(calculateCurrentRatio({ currentAssets: 300, currentLiabilities: 0 }).value).toBeNull();
    expect(calculateInterestCoverage({ operatingIncome: 100, interestExpense: 0 }).value).toBeNull();
  });
});
