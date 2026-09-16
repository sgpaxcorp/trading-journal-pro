import { describe, expect, it } from "vitest";

import { buildRelativeValuationAnalysis, type ValuationObservation } from "@/lib/neuroValuationEngine";

function observation(ticker: string, marketCap: number, earnings: number): ValuationObservation {
  return {
    ticker,
    asOfDate: "2026-09-16",
    marketCapitalization: marketCap,
    enterpriseValue: marketCap + 100,
    netIncome: earnings,
    freeCashFlow: earnings * 1.2,
    shareholdersEquity: marketCap / 3,
    revenue: marketCap / 2,
    sourceTraceIds: [`trace-${ticker}`],
  };
}

describe("relative valuation engine", () => {
  it("shows target, historical and peer ranges without declaring cheap or expensive", () => {
    const result = buildRelativeValuationAnalysis({
      target: observation("ACME", 1_000, 100),
      historical: [observation("ACME", 800, 100), observation("ACME", 1_200, 100)],
      peers: [observation("PEER1", 900, 100), observation("PEER2", 1_100, 100)],
      calculatedAt: "2026-09-16T12:00:00.000Z",
    });
    expect(result.status).toBe("complete");
    expect(result.targetMultiples.find((item) => item.key === "price_to_earnings")?.value).toBe(10);
    expect(result.historicalRangesAndPeerComparables.price_to_earnings.historical.median).toBe(10);
    expect(result.noCheapOrExpensiveVerdict).toBe(true);
    expect(result).not.toHaveProperty("recommendation");
  });

  it("marks a negative denominator unavailable", () => {
    const target = observation("LOSS", 1_000, -10);
    const result = buildRelativeValuationAnalysis({ target, historical: [], peers: [] });
    expect(result.targetMultiples.find((item) => item.key === "price_to_earnings")?.displayValue).toBe("DATA NOT AVAILABLE");
  });
});
