import type { GrowthPlan } from "@/lib/growthPlanSupabase";
import type { ProfitLossProfile, TraderType } from "@/lib/profitLossTrackSupabase";
import type { TradingInstrument } from "@/lib/tradingCalendar";

export type BusinessCapitalScope = "single_account" | "all_accounts";

export type BusinessSetupAccount = {
  id: string;
  name: string;
  accountType?: string | null;
};

export type BusinessCapitalAllocation = Record<string, number>;

function finiteNonNegative(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

export function capitalAllocationFromPlans(params: {
  accounts: BusinessSetupAccount[];
  plans: GrowthPlan[];
  profile?: ProfitLossProfile | null;
}): BusinessCapitalAllocation {
  const savedAllocation = params.profile?.capital_allocation ?? {};
  const plansByAccount = new Map(
    params.plans
      .filter((plan) => Boolean(plan.accountId))
      .map((plan) => [String(plan.accountId), plan] as const)
  );

  return params.accounts.reduce<BusinessCapitalAllocation>((allocation, account) => {
    const saved = savedAllocation[account.id];
    if (Number.isFinite(Number(saved))) {
      allocation[account.id] = finiteNonNegative(saved);
      return allocation;
    }

    const planCapital = plansByAccount.get(account.id)?.startingBalance;
    if (Number.isFinite(Number(planCapital)) && Number(planCapital) > 0) {
      allocation[account.id] = finiteNonNegative(planCapital);
      return allocation;
    }

    if (params.profile?.account_id === account.id && params.profile.initial_capital > 0) {
      allocation[account.id] = finiteNonNegative(params.profile.initial_capital);
      return allocation;
    }

    allocation[account.id] = 0;
    return allocation;
  }, {});
}

export function selectedCapitalAccountIds(params: {
  scope: BusinessCapitalScope;
  accounts: BusinessSetupAccount[];
  selectedAccountId?: string | null;
}): string[] {
  if (params.scope === "all_accounts") return params.accounts.map((account) => account.id);
  return params.selectedAccountId ? [params.selectedAccountId] : [];
}

export function totalInitialBusinessCapital(params: {
  scope: BusinessCapitalScope;
  accounts: BusinessSetupAccount[];
  selectedAccountId?: string | null;
  allocation: BusinessCapitalAllocation;
}): number {
  return Number(
    selectedCapitalAccountIds(params)
      .reduce((sum, accountId) => sum + finiteNonNegative(params.allocation[accountId]), 0)
      .toFixed(2)
  );
}

export function planOperatingContext(plan?: GrowthPlan | null) {
  const steps = (plan?.steps ?? {}) as Record<string, any>;
  const operatingModel = steps?.business_analysis?.operatingModel ?? {};
  const averageTradingDaysPerWeek = finiteNonNegative(
    operatingModel.averageTradingDaysPerWeek ?? steps?._ui?.averageTradingDaysPerWeek
  );
  const tradingInstrument = String(
    operatingModel.tradingInstrument ?? steps?._ui?.tradingInstrument ?? "stocks"
  ) as TradingInstrument;
  const withdrawalSettings = operatingModel.plannedWithdrawalSettings ?? plan?.plannedWithdrawalSettings;

  return {
    averageTradingDaysPerWeek,
    tradingDaysPerMonth:
      averageTradingDaysPerWeek > 0
        ? Math.max(1, Math.round((averageTradingDaysPerWeek * 52) / 12))
        : 20,
    tradingInstrument,
    ownerPayMonthly: monthlyAmountFromSchedule(withdrawalSettings),
  };
}

export function monthlyAmountFromSchedule(
  settings?: { enabled?: boolean; frequency?: string; amount?: number } | null
): number {
  if (!settings?.enabled) return 0;
  const amount = finiteNonNegative(settings.amount);
  if (settings.frequency === "quarterly") return Number((amount / 3).toFixed(2));
  if (settings.frequency === "semiannual") return Number((amount / 6).toFixed(2));
  return Number(amount.toFixed(2));
}

export function traderTypeFromPlan(params: {
  instrument?: string | null;
  accountType?: string | null;
}): TraderType {
  if (params.accountType === "funded") return "funded";
  if (params.instrument === "options") return "options";
  if (params.instrument === "futures") return "futures";
  return "minimal";
}
