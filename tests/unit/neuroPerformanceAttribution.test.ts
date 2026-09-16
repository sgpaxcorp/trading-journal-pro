import { describe, expect, it } from "vitest";

import {
  buildNeuroPerformanceAttribution,
  calculateLinkedTimeWeightedReturn,
  calculateModifiedDietzReturn,
  calculatePerformanceAttribution,
  calculateXirr,
} from "@/lib/neuroPerformanceAttribution";

describe("Neuro Performance Attribution Engine", () => {
  it("geometrically links flow-neutral subperiod returns", () => {
    const result = calculateLinkedTimeWeightedReturn([
      {
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        beginningValue: 1_000,
        endingValue: 1_100,
      },
      {
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        beginningValue: 1_200,
        endingValue: 1_260,
      },
    ]);

    expect(result).toBeCloseTo(0.155, 12);
  });

  it("uses daily-weighted external flows in Modified Dietz", () => {
    const result = calculateModifiedDietzReturn({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      beginningValue: 1_000,
      endingValue: 1_650,
      externalCashFlows: [
        { date: "2026-07-02", type: "contribution", amount: 500 },
      ],
    });

    expect(result).toBeCloseTo(0.12, 3);
  });

  it("calculates reproducible XIRR from irregular investor cash flows", () => {
    const result = calculateXirr([
      { date: "2026-01-01", amount: -1_000 },
      { date: "2027-01-01", amount: 1_100 },
    ]);

    expect(result).toBeCloseTo(0.1, 10);
  });

  it("excludes contributions and withdrawals from investment P&L", () => {
    const report = calculatePerformanceAttribution(
      {
        period: { startDate: "2026-01-01", endDate: "2026-12-31" },
        baseCurrency: "USD",
        beginningValue: 1_000,
        endingValue: 1_200,
        externalCashFlows: [
          { date: "2026-03-01", type: "contribution", amount: 100 },
          { date: "2026-09-01", type: "withdrawal", amount: 50 },
        ],
        pnlComponents: {
          realizedGains: 40,
          unrealizedGains: 70,
          dividends: 50,
          cashIncome: 0,
          feesAndExpenses: 10,
          currencyGainLoss: 0,
        },
        benchmark: { ticker: "SPY", returnDecimal: 0.08 },
        concentrationCapPct: 20,
      },
      { generatedAt: "2026-12-31T00:00:00.000Z" }
    );

    expect(report.externalCashFlows).toEqual({
      contributions: 100,
      withdrawals: 50,
      netIntoPortfolio: 50,
      excludedFromInvestmentPnl: true,
    });
    expect(report.pnlAttribution.investmentPnl).toBe(150);
    expect(report.pnlAttribution.explainedPnl).toBe(150);
    expect(report.pnlAttribution.feesAndExpenses.amount).toBe(-10);
    expect(report.pnlAttribution.unexplainedResidual.amount).toBe(0);
    expect(report.pnlAttribution.reconciled).toBe(true);
  });

  it("reconciles security selection, sector exposure, and cash against a benchmark", () => {
    const report = calculatePerformanceAttribution({
      period: { startDate: "2026-01-01", endDate: "2026-12-31" },
      baseCurrency: "USD",
      beginningValue: 1_000,
      endingValue: 1_094,
      linkedSubperiods: [
        {
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          beginningValue: 1_000,
          endingValue: 1_094,
        },
      ],
      positions: [
        {
          ticker: "TECH",
          sector: "Technology",
          currency: "USD",
          beginningMarketValue: 700,
          beginningWeight: 0.7,
          baseReturnDecimal: 0.12,
          localReturnDecimal: 0.12,
          realizedGains: 0,
          unrealizedGains: 84,
          dividends: 0,
          cashIncome: 0,
          feesAndExpenses: 0,
          currencyGainLoss: 0,
        },
        {
          ticker: "HLTH",
          sector: "Health Care",
          currency: "USD",
          beginningMarketValue: 200,
          beginningWeight: 0.2,
          baseReturnDecimal: 0.04,
          localReturnDecimal: 0.04,
          realizedGains: 0,
          unrealizedGains: 8,
          dividends: 0,
          cashIncome: 0,
          feesAndExpenses: 0,
          currencyGainLoss: 0,
        },
      ],
      cash: {
        beginningValue: 100,
        endingValue: 102,
        returnDecimal: 0.02,
        income: 2,
      },
      pnlComponents: {
        realizedGains: 0,
        unrealizedGains: 92,
        dividends: 0,
        cashIncome: 2,
        feesAndExpenses: 0,
        currencyGainLoss: 0,
      },
      benchmark: {
        ticker: "SPY",
        returnDecimal: 0.08,
        sectors: [
          { sector: "Technology", weight: 0.6, returnDecimal: 0.1 },
          { sector: "Health Care", weight: 0.4, returnDecimal: 0.05 },
        ],
      },
      concentrationCapPct: 50,
    });

    expect(report.portfolioReturn.valuePct).toBeCloseTo(9.4, 8);
    expect(report.activeReturnPct).toBeCloseTo(1.4, 8);
    expect(report.activeAttribution.sectorExposure.effectPct).toBeCloseTo(0.8, 8);
    expect(report.activeAttribution.securitySelection.effectPct).toBeCloseTo(1.2, 8);
    expect(report.activeAttribution.cash.effectPct).toBeCloseTo(-0.6, 8);
    expect(report.activeAttribution.residual.effectPct).toBeCloseTo(0, 8);
  });

  it("separates a supported currency contribution from local security return", () => {
    const report = calculatePerformanceAttribution({
      period: { startDate: "2026-01-01", endDate: "2026-12-31" },
      baseCurrency: "USD",
      beginningValue: 1_000,
      endingValue: 1_121,
      linkedSubperiods: [
        {
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          beginningValue: 1_000,
          endingValue: 1_121,
        },
      ],
      positions: [
        {
          ticker: "EURCO",
          sector: "Industrials",
          currency: "EUR",
          beginningWeight: 1,
          beginningMarketValue: 1_000,
          localReturnDecimal: 0.1,
          baseReturnDecimal: 0.121,
          feesAndExpenses: 0,
        },
      ],
      pnlComponents: {
        realizedGains: 0,
        unrealizedGains: 100,
        dividends: 0,
        cashIncome: 0,
        feesAndExpenses: 0,
        currencyGainLoss: 21,
      },
      benchmark: {
        ticker: "BMK",
        returnDecimal: 0.08,
        sectors: [{ sector: "Industrials", weight: 1, returnDecimal: 0.08 }],
      },
      concentrationCapPct: 50,
    });

    expect(report.activeAttribution.currency.status).toBe("calculated");
    expect(report.activeAttribution.currency.effectPct).toBeCloseTo(2.1, 8);
    expect(report.pnlAttribution.currencyGainLoss.amount).toBe(21);
  });

  it("does not mislabel a cost-basis snapshot as TWR when no ledger exists", () => {
    const report = buildNeuroPerformanceAttribution({
      engine: {
        positions: [
          {
            ticker: "AAPL",
            researchOnly: false,
            invested: 1_000,
            currentValue: 1_250,
            pnl: 250,
            weight: 1,
            company: { sector: "Technology" },
          },
        ],
      },
      investmentPolicy: {
        baseCurrency: "USD",
        benchmark: "SPY",
        limits: { maxPositionPct: 20 },
      },
      generatedAt: "2026-09-16T12:00:00.000Z",
    });

    expect(report.mode).toBe("cost_basis_snapshot");
    expect(report.portfolioReturn.status).toBe("unavailable");
    expect(report.investorReturn.status).toBe("unavailable");
    expect(report.snapshot).toEqual({
      costBasis: 1_000,
      currentValue: 1_250,
      unrealizedGain: 250,
      costBasisReturnPct: 25,
      isTimeWeightedReturn: false,
    });
    expect(report.pnlAttribution.unrealizedGains.amount).toBe(250);
    expect(report.dataQuality.missing).toContain("dated portfolio valuations and external cash flows");
  });

  it("replays the frozen calculation input to the same result", () => {
    const input = {
      period: { startDate: "2026-01-01", endDate: "2027-01-01" },
      baseCurrency: "USD",
      beginningValue: 10_000,
      endingValue: 11_250,
      externalCashFlows: [
        { date: "2026-04-01", type: "contribution" as const, amount: 500 },
      ],
      pnlComponents: {
        realizedGains: 250,
        unrealizedGains: 400,
        dividends: 120,
        cashIncome: 10,
        feesAndExpenses: 30,
        currencyGainLoss: 0,
      },
      benchmark: { ticker: "SPY", returnDecimal: 0.08 },
      concentrationCapPct: 20,
    };
    const options = { generatedAt: "2027-01-01T00:00:00.000Z" };
    const first = calculatePerformanceAttribution(input, options);
    const replay = calculatePerformanceAttribution(first.calculationInput, options);

    expect(replay).toEqual(first);
  });

  it("does not convert a missing position value into a zero-valued snapshot", () => {
    const report = buildNeuroPerformanceAttribution({
      engine: {
        positions: [
          {
            ticker: "ACME",
            researchOnly: false,
            invested: null,
            currentValue: null,
            pnl: null,
            weight: null,
          },
        ],
      },
      investmentPolicy: {
        baseCurrency: "USD",
        benchmark: "SPY",
        limits: { maxPositionPct: 20 },
      },
      generatedAt: "2026-09-16T12:00:00.000Z",
    });

    expect(report.snapshot).toBeNull();
    expect(report.pnlAttribution.beginningValue).toBeNull();
    expect(report.portfolioReturn.status).toBe("unavailable");
  });
});
