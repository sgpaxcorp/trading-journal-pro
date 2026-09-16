import { describe, expect, it } from "vitest";

import {
  buildPortfolioExposureFallback,
  buildPortfolioExposureInput,
  constrainPortfolioExposureEvidence,
  normalizePortfolioExposureMap,
} from "@/lib/neuroPortfolioExposure";

const positions = [
  { ticker: "EXM", weight: 0.55, currentValue: 5_500, company: { sector: "Industrials" } },
  { ticker: "DAT", weight: 0.45, currentValue: 4_500, company: { sector: "Technology" } },
];

function evidence(ticker: string, url: string) {
  return {
    status: "identified",
    ticker,
    statement: `${ticker} revenue depends materially on hyperscaler infrastructure programs.`,
    sourceLabel: `${ticker} current public disclosure`,
    sourceDate: "2026-09-15",
    sourceType: "public_source",
    sourceUrl: url,
  };
}

function exposure(ticker: string, dependencyName = "Hyperscaler AI infrastructure capex") {
  const url = `https://example.com/${ticker.toLowerCase()}-exposure`;
  return {
    ticker,
    driver: "ARTIFICIAL_INTELLIGENCE_SPENDING",
    dependencyName,
    channel: `${ticker} sells infrastructure used in hyperscaler AI deployments.`,
    direction: "positive",
    magnitude: ticker === "EXM" ? "high" : "medium",
    timeHorizon: "multiple",
    evidence: [evidence(ticker, url)],
    contradictoryEvidence: [],
    uncertainty: "Customer spending plans can change.",
  };
}

describe("Portfolio Exposure Map", () => {
  it("defaults to evidence gaps and never recommends diversification automatically", () => {
    const fallback = buildPortfolioExposureFallback({ positions, generatedAt: "2026-09-16T12:00:00.000Z" });
    const input = buildPortfolioExposureInput({ positions });

    expect(fallback.evidenceStatus).toBe("insufficient");
    expect(fallback.methodology.tickerCountIsDiversification).toBe(false);
    expect(fallback.methodology.sectorLabelsAreSufficient).toBe(false);
    expect(fallback.automaticDiversificationRecommendation).toBe(false);
    expect(fallback.humanReviewRequired).toBe(true);
    expect(input).toContain("Ticker count and sector labels are not evidence of diversification");
  });

  it("builds a cross-sector dependency with deterministic portfolio magnitude", () => {
    const fallback = buildPortfolioExposureFallback({ positions });
    const candidate = {
      evidenceStatus: "ready",
      summary: "Two companies depend on the same AI infrastructure spending cycle.",
      holdingExposures: [exposure("EXM"), exposure("DAT")],
      missingEvidence: [],
    };
    const normalized = normalizePortfolioExposureMap({ candidate, fallback, positions });
    const constrained = constrainPortfolioExposureEvidence({
      map: normalized,
      positions,
      marketData: {
        items: {
          EXM: { company: { sector: "Industrials" } },
          DAT: { company: { sector: "Technology" } },
        },
      },
      webSources: [
        { url: "https://example.com/exm-exposure" },
        { url: "https://example.com/dat-exposure" },
      ],
    });

    expect(constrained.evidenceStatus).toBe("ready");
    expect(constrained.commonDependencies).toHaveLength(1);
    expect(constrained.commonDependencies[0].tickers).toEqual(["EXM", "DAT"]);
    expect(constrained.commonDependencies[0].crossSector).toBe(true);
    expect(constrained.commonDependencies[0].grossPortfolioWeightPct).toBe(100);
    expect(constrained.commonDependencies[0].portfolioShareMagnitude).toBe("high");
    expect(constrained.dependencyGraph.edges).toHaveLength(2);
    expect(constrained.automaticDiversificationRecommendation).toBe(false);
  });

  it("does not merge different specific dependencies under the same broad driver", () => {
    const fallback = buildPortfolioExposureFallback({ positions });
    const normalized = normalizePortfolioExposureMap({
      fallback,
      positions,
      candidate: {
        evidenceStatus: "ready",
        holdingExposures: [
          exposure("EXM", "US enterprise AI capex"),
          exposure("DAT", "European sovereign AI capex"),
        ],
        missingEvidence: [],
      },
    });
    const constrained = constrainPortfolioExposureEvidence({
      map: normalized,
      positions,
      webSources: [
        { url: "https://example.com/exm-exposure" },
        { url: "https://example.com/dat-exposure" },
      ],
    });

    expect(constrained.commonDependencies).toHaveLength(0);
    expect(constrained.dependencyGraph.driverNodes).toHaveLength(2);
  });

  it("removes exposures whose cited source is not in the verified evidence set", () => {
    const fallback = buildPortfolioExposureFallback({ positions });
    const normalized = normalizePortfolioExposureMap({
      fallback,
      positions,
      candidate: {
        evidenceStatus: "ready",
        holdingExposures: [exposure("EXM")],
      },
    });
    const constrained = constrainPortfolioExposureEvidence({
      map: normalized,
      positions,
      webSources: [],
    });

    expect(constrained.evidenceStatus).toBe("insufficient");
    expect(constrained.holdingExposures).toHaveLength(0);
    expect(constrained.commonDependencies).toHaveLength(0);
    expect(constrained.uncoveredTickers).toEqual(["EXM", "DAT"]);
  });
});
