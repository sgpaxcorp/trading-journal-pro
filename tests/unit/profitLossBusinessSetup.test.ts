import { describe, expect, it } from "vitest";

import {
  capitalAllocationFromPlans,
  monthlyAmountFromSchedule,
  planOperatingContext,
  totalInitialBusinessCapital,
  traderTypeFromPlan,
} from "../../lib/profitLossBusinessSetup";
import type { GrowthPlan } from "../../lib/growthPlanSupabase";

const accounts = [
  { id: "account-a", name: "Primary", accountType: "personal" },
  { id: "account-b", name: "Options", accountType: "personal" },
];

function plan(accountId: string, startingBalance: number, operatingModel: Record<string, unknown> = {}) {
  return {
    user_id: "user-1",
    accountId,
    startingBalance,
    targetBalance: startingBalance * 2,
    maxDailyLossPercent: 1,
    tradingDays: 100,
    steps: {
      business_analysis: { operatingModel },
    } as any,
  } satisfies GrowthPlan;
}

describe("Profit & Loss business setup", () => {
  it("imports each account's initial capital from its approved plan", () => {
    expect(
      capitalAllocationFromPlans({
        accounts,
        plans: [plan("account-a", 1_000), plan("account-b", 2_500)],
      })
    ).toEqual({ "account-a": 1_000, "account-b": 2_500 });
  });

  it("calculates one-account and consolidated capital without double counting", () => {
    const allocation = { "account-a": 1_000, "account-b": 2_500 };
    expect(
      totalInitialBusinessCapital({
        scope: "single_account",
        accounts,
        selectedAccountId: "account-b",
        allocation,
      })
    ).toBe(2_500);
    expect(
      totalInitialBusinessCapital({
        scope: "all_accounts",
        accounts,
        selectedAccountId: "account-a",
        allocation,
      })
    ).toBe(3_500);
  });

  it("converts the approved weekly rhythm and withdrawal cadence to monthly inputs", () => {
    const context = planOperatingContext(
      plan("account-a", 1_000, {
        averageTradingDaysPerWeek: 5,
        tradingInstrument: "options",
        plannedWithdrawalSettings: { enabled: true, frequency: "quarterly", amount: 3_000 },
      })
    );

    expect(context.tradingDaysPerMonth).toBe(22);
    expect(context.tradingInstrument).toBe("options");
    expect(context.ownerPayMonthly).toBe(1_000);
    expect(monthlyAmountFromSchedule({ enabled: true, frequency: "semiannual", amount: 6_000 })).toBe(1_000);
  });

  it("maps plan instruments and funded accounts to the correct operating profile", () => {
    expect(traderTypeFromPlan({ instrument: "options", accountType: "personal" })).toBe("options");
    expect(traderTypeFromPlan({ instrument: "stocks", accountType: "funded" })).toBe("funded");
  });
});
