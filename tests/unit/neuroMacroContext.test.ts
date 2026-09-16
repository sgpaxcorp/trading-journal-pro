import { describe, expect, it } from "vitest";

import {
  buildMacroContextFallback,
  buildObservedMacroData,
  constrainMacroContextEvidence,
  normalizeMacroContextReport,
} from "@/lib/neuroMacroContext";

const positions = [
  { ticker: "OWN", company: { name: "Owned Company" }, researchOnly: false },
  { ticker: "NEW", company: { name: "Candidate Company" }, researchOnly: true },
];

const marketData = {
  items: {
    OWN: {
      macro: {
        fred: {
          FEDFUNDS: { value: 4.25, date: "2026-09-01" },
          DGS10: { value: 4.4, date: "2026-09-15" },
          DGS2: { value: 4.1, date: "2026-09-15" },
          CPIAUCSL: { value: 326, date: "2026-08-01", yoyPct: 2.7 },
          UNRATE: { value: 4.2, date: "2026-08-01" },
          A191RL1Q225SBEA: { value: 2.1, date: "2026-07-01" },
          BAMLH0A0HYM2: { value: 3.25, date: "2026-09-15" },
          DTWEXBGS: { value: 121.4, date: "2026-09-11" },
          DCOILWTICO: { value: 74.2, date: "2026-09-14" },
          PALLFNFINDEXQ: { value: 181.2, date: "2026-07-01" },
        },
      },
      annualFundamentals: [{ year: 2025, totalRevenue: 1_000 }],
    },
    NEW: { annualFundamentals: [{ year: 2025, totalRevenue: 500 }] },
  },
};

describe("Macro Context Agent", () => {
  it("builds observed macro data and calculates the yield curve without relabeling it as a forecast", () => {
    const rows = buildObservedMacroData({ marketData, language: "en" });
    const curve = rows.find((row) => row.id === "observed:yield-curve-10y2y");
    const inflation = rows.find((row) => row.id === "observed:cpi-yoy");

    expect(curve?.value).toBeCloseTo(0.3);
    expect(curve?.valueKind).toBe("calculation");
    expect(curve?.sourceCategory).toBe("OBSERVED_MACROECONOMIC_DATA");
    expect(inflation?.value).toBe(2.7);
    expect(rows.some((row) => row.variable === "CREDIT_CONDITIONS")).toBe(true);
    expect(rows.some((row) => row.variable === "DOLLAR_STRENGTH")).toBe(true);
    expect(rows.some((row) => row.variable === "ENERGY_PRICES")).toBe(true);
  });

  it("keeps observed data, market expectations, forecasts, and AI interpretation separate", () => {
    const fallback = buildMacroContextFallback({ positions, marketData, language: "en" });
    const candidate = {
      status: "ready",
      marketExpectations: [{
        id: "expectation:rates",
        variable: "INTEREST_RATES",
        statement: "The current curve prices a different short-rate path.",
        asOfDate: "2026-09-15",
        sourceLabel: "Current market curve",
        sourceUrl: "https://example.com/market-curve",
      }],
      thirdPartyForecasts: [{
        id: "forecast:gdp",
        variable: "GDP",
        statement: "The institution forecasts slower growth next year.",
        asOfDate: "2026-09-15",
        forecastHorizon: "Calendar 2027",
        sourceLabel: "Economic outlook",
        sourceUrl: "https://example.com/economic-outlook",
      }],
      aiInterpretations: [{
        id: "interpretation:rates",
        variable: "INTEREST_RATES",
        interpretation: "Financing conditions could pressure interest expense.",
        evidenceIds: ["observed:policy-rate", "expectation:rates"],
        uncertainty: "Refinancing dates remain uncertain.",
      }],
      companyContexts: [{
        ticker: "OWN",
        sensitivities: [{
          variable: "INTEREST_RATES",
          specificDriver: "US refinancing rates",
          materiality: "high",
          direction: "negative",
          timeHorizon: "medium_term",
          transmissionMechanism: "Higher refinancing rates increase cash interest and reduce free cash flow.",
          financialLineItems: ["interest expense", "free cash flow"],
          evidence: [{
            status: "identified",
            ticker: "OWN",
            statement: "The company has debt maturities requiring refinancing.",
            sourceLabel: "Debt maturity disclosure",
            sourceDate: "2026-09-15",
            sourceType: "public_source",
            sourceUrl: "https://example.com/own-debt",
          }],
          contradictoryEvidence: [],
          uncertainty: "Future refinancing terms are unknown.",
          indicatorsToMonitor: ["interest expense", "debt maturities"],
        }],
        missingEvidence: [],
      }],
      missingData: [],
    };
    const constrained = constrainMacroContextEvidence({
      report: normalizeMacroContextReport({ candidate, fallback, positions }),
      marketData,
      webSources: [
        { url: "https://example.com/market-curve" },
        { url: "https://example.com/economic-outlook" },
        { url: "https://example.com/own-debt" },
      ],
    });

    expect(constrained.marketExpectations).toHaveLength(1);
    expect(constrained.marketExpectations[0].sourceCategory).toBe("MARKET_EXPECTATION");
    expect(constrained.thirdPartyForecasts).toHaveLength(1);
    expect(constrained.thirdPartyForecasts[0].sourceCategory).toBe("THIRD_PARTY_FORECAST");
    expect(constrained.aiInterpretations[0].classification).toBe("AI_INTERPRETATION");
    expect(constrained.companyContexts.find((row) => row.ticker === "OWN")?.sensitivities).toHaveLength(1);
    expect(constrained.companyContexts.find((row) => row.ticker === "NEW")?.portfolioStatus).toBe("research_candidate");
  });

  it("removes unverified public claims and preserves the no-timing safety contract", () => {
    const fallback = buildMacroContextFallback({ positions, marketData, language: "en" });
    const report = normalizeMacroContextReport({
      fallback,
      positions,
      candidate: {
        status: "ready",
        marketExpectations: [{
          variable: "INFLATION",
          statement: "Unsupported market expectation.",
          asOfDate: "2026-09-15",
          sourceUrl: "https://example.com/unverified",
        }],
        aiInterpretations: [{
          variable: "INFLATION",
          interpretation: "Buy this company immediately.",
          evidenceIds: ["observed:cpi-yoy"],
          uncertainty: "Unknown",
        }],
      },
    });
    const constrained = constrainMacroContextEvidence({ report, marketData, webSources: [] });

    expect(constrained.marketExpectations).toHaveLength(0);
    expect(constrained.aiInterpretations[0].interpretation).toContain("does not determine a portfolio action");
    expect(constrained.methodology.macroIsContextNotTiming).toBe(true);
    expect(constrained.methodology.automaticBuySellInstructions).toBe(false);
    expect(constrained.methodology.humanReviewRequired).toBe(true);
  });
});
