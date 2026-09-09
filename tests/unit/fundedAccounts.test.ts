import { describe, expect, it } from "vitest";

import {
  calculateFundedAccountMetrics,
  defaultFundedAccountProfile,
  fundedProfileRulesSignature,
  getFundedProfileMissingFields,
  normalizeFundedAccountProfile,
  normalizeTradingAccountType,
} from "@/lib/fundedAccounts";

function completeProfile() {
  return {
    ...defaultFundedAccountProfile(),
    firmName: "Test Firm",
    programName: "Evaluation 100K",
    nominalAccountSize: 100_000,
    currentEquity: 100_000,
    profitTarget: 8_000,
    dailyLossLimit: 2_000,
    maxDrawdown: 4_000,
    rulesConfirmedAt: "2026-09-08T12:00:00.000Z",
  };
}

describe("funded trading accounts", () => {
  it("keeps legacy accounts personal by default", () => {
    expect(normalizeTradingAccountType(undefined)).toBe("personal");
    expect(normalizeTradingAccountType("PERSONAL")).toBe("personal");
    expect(normalizeTradingAccountType("FUNDED")).toBe("funded");
  });

  it("normalizes database fields into the application profile", () => {
    const profile = normalizeFundedAccountProfile({
      stage: "verification",
      firm_name: "Test Firm",
      program_name: "Express 50K",
      nominal_account_size: "50000",
      current_equity: "50750",
      profit_target: "3000",
      daily_loss_limit: "1000",
      max_drawdown: "2000",
      drawdown_type: "trailing_eod",
      news_trading_allowed: true,
      rules_version: 2,
      rules_confirmed_at: "2026-09-08T12:00:00.000Z",
    });

    expect(profile).toMatchObject({
      stage: "verification",
      firmName: "Test Firm",
      programName: "Express 50K",
      nominalAccountSize: 50_000,
      currentEquity: 50_750,
      drawdownType: "trailing_eod",
      newsTradingAllowed: true,
      rulesVersion: 2,
    });
  });

  it("requires the minimum risk rules and explicit confirmation", () => {
    expect(getFundedProfileMissingFields(defaultFundedAccountProfile())).toEqual([
      "firmName",
      "programName",
      "nominalAccountSize",
      "currentEquity",
      "profitTarget",
      "dailyLossLimit",
      "maxDrawdown",
      "rulesConfirmedAt",
    ]);
    expect(getFundedProfileMissingFields(completeProfile())).toEqual([]);
  });

  it("calculates internal rails from remaining drawdown, not nominal size", () => {
    const metrics = calculateFundedAccountMetrics(completeProfile());

    expect(metrics).toMatchObject({
      configured: true,
      breachFloor: 96_000,
      remainingDrawdown: 4_000,
      targetBalance: 108_000,
      remainingProfitTarget: 8_000,
      firmDailyLossLimit: 2_000,
      operatingDailyStop: 1_000,
      status: "safe",
    });
    expect(metrics?.recommendedRiskPerTrade).toBeCloseTo(333.3333, 3);
  });

  it("does not treat a missing live balance as zero", () => {
    const metrics = calculateFundedAccountMetrics(completeProfile(), null);
    expect(metrics?.currentEquity).toBe(100_000);
    expect(metrics?.status).toBe("safe");
  });

  it("tightens risk near the breach floor and stops at the floor", () => {
    const profile = completeProfile();
    const reduced = calculateFundedAccountMetrics(profile, 97_500);
    const stopped = calculateFundedAccountMetrics(profile, 96_000);

    expect(reduced).toMatchObject({
      remainingDrawdown: 1_500,
      operatingDailyStop: 375,
      recommendedRiskPerTrade: 125,
      status: "reduce_risk",
    });
    expect(stopped).toMatchObject({
      remainingDrawdown: 0,
      operatingDailyStop: 0,
      recommendedRiskPerTrade: 0,
      status: "stop",
    });
  });

  it("keeps the funded-stage target fixed as equity changes", () => {
    const profile = { ...completeProfile(), stage: "funded" as const, profitTarget: 3_000 };
    expect(calculateFundedAccountMetrics(profile, 100_500)?.targetBalance).toBe(103_000);
    expect(calculateFundedAccountMetrics(profile, 102_000)?.targetBalance).toBe(103_000);
  });

  it("requires a current breach floor for trailing drawdown programs", () => {
    const profile = {
      ...completeProfile(),
      drawdownType: "trailing_eod" as const,
      drawdownFloor: null,
    };
    expect(getFundedProfileMissingFields(profile)).toContain("drawdownFloor");
  });

  it("distinguishes rule changes from live equity updates", () => {
    const profile = completeProfile();
    expect(fundedProfileRulesSignature({ ...profile, currentEquity: 99_500 })).toBe(
      fundedProfileRulesSignature(profile)
    );
    expect(fundedProfileRulesSignature({ ...profile, maxDrawdown: 3_500 })).not.toBe(
      fundedProfileRulesSignature(profile)
    );
  });
});
