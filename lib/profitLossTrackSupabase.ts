import { supabaseBrowser } from "@/lib/supaBaseClient";

export type BillingCycle =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "one_time";

export type CostCategory =
  | "subscription"
  | "data"
  | "education"
  | "funding"
  | "software"
  | "mentorship"
  | "broker"
  | "admin"
  | "other";

export type TraderType = "minimal" | "options" | "futures" | "funded" | "swing";

export type ProfitLossProfile = {
  id?: string;
  user_id: string;
  account_id?: string | null;
  trader_type: TraderType;
  initial_capital: number;
  trading_days_per_month: number;
  avg_trades_per_month: number;
  include_education_in_break_even: boolean;
  include_owner_pay_in_break_even: boolean;
  owner_pay_target_monthly: number;
  renewal_alert_days: number;
  overspend_alert_pct: number;
  variable_cost_alert_ratio: number;
  finance_alerts_inapp_enabled: boolean;
  finance_alerts_push_enabled: boolean;
  finance_alerts_email_enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export type NormalizedTradeCostRow = {
  id: string;
  user_id: string;
  account_id?: string | null;
  broker?: string | null;
  symbol?: string | null;
  executed_at: string;
  commissions: number;
  fees: number;
  total_cost: number;
};

export type ProfitLossCost = {
  id: string;
  user_id: string;
  account_id?: string | null;
  name: string;
  category: CostCategory;
  vendor?: string | null;
  billing_cycle: BillingCycle;
  amount: number;
  currency?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  notes?: string | null;
  preset_key?: string | null;
  is_active?: boolean;
  include_in_break_even?: boolean;
  amortization_months?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type ProfitLossBudget = {
  id?: string;
  user_id: string;
  account_id?: string | null;
  category: CostCategory;
  monthly_amount: number;
  created_at?: string;
  updated_at?: string;
};

const COSTS_TABLE = "profit_loss_costs";
const PROFILE_TABLE = "profit_loss_profiles";
const BUDGETS_TABLE = "profit_loss_budgets";

function toNumber(x: unknown, fallback = 0): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTraderType(raw: unknown): TraderType {
  const value = String(raw ?? "").toLowerCase();
  if (value === "options" || value === "futures" || value === "funded" || value === "swing") {
    return value;
  }
  return "minimal";
}

function mapCostRow(row: any): ProfitLossCost {
  return {
    id: row.id,
    user_id: row.user_id,
    account_id: row.account_id ?? null,
    name: row.name,
    category: row.category,
    vendor: row.vendor ?? null,
    billing_cycle: row.billing_cycle,
    amount: toNumber(row.amount),
    currency: row.currency ?? "USD",
    starts_at: row.starts_at ?? null,
    ends_at: row.ends_at ?? null,
    notes: row.notes ?? null,
    preset_key: row.preset_key ?? null,
    is_active: row.is_active ?? true,
    include_in_break_even: row.include_in_break_even ?? true,
    amortization_months: row.amortization_months == null ? null : toNumber(row.amortization_months, 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapProfileRow(row: any, userId: string, accountId?: string | null): ProfitLossProfile {
  return {
    id: row?.id,
    user_id: row?.user_id ?? userId,
    account_id: row?.account_id ?? accountId ?? null,
    trader_type: normalizeTraderType(row?.trader_type),
    initial_capital: toNumber(row?.initial_capital),
    trading_days_per_month: Math.max(1, Math.round(toNumber(row?.trading_days_per_month, 20))),
    avg_trades_per_month: Math.max(1, Math.round(toNumber(row?.avg_trades_per_month, 40))),
    include_education_in_break_even: row?.include_education_in_break_even ?? true,
    include_owner_pay_in_break_even: row?.include_owner_pay_in_break_even ?? false,
    owner_pay_target_monthly: toNumber(row?.owner_pay_target_monthly),
    renewal_alert_days: Math.max(1, Math.round(toNumber(row?.renewal_alert_days, 7))),
    overspend_alert_pct: Math.max(0, toNumber(row?.overspend_alert_pct, 0.1)),
    variable_cost_alert_ratio: Math.max(0, toNumber(row?.variable_cost_alert_ratio, 0.25)),
    finance_alerts_inapp_enabled: row?.finance_alerts_inapp_enabled ?? true,
    finance_alerts_push_enabled: row?.finance_alerts_push_enabled ?? true,
    finance_alerts_email_enabled: row?.finance_alerts_email_enabled ?? true,
    created_at: row?.created_at,
    updated_at: row?.updated_at,
  };
}

function mapBudgetRow(row: any): ProfitLossBudget {
  return {
    id: row?.id,
    user_id: row?.user_id,
    account_id: row?.account_id ?? null,
    category: row?.category,
    monthly_amount: toNumber(row?.monthly_amount),
    created_at: row?.created_at,
    updated_at: row?.updated_at,
  };
}

export function buildDefaultProfitLossProfile(userId: string, accountId?: string | null): ProfitLossProfile {
  return {
    user_id: userId,
    account_id: accountId ?? null,
    trader_type: "minimal",
    initial_capital: 0,
    trading_days_per_month: 20,
    avg_trades_per_month: 40,
    include_education_in_break_even: true,
    include_owner_pay_in_break_even: false,
    owner_pay_target_monthly: 0,
    renewal_alert_days: 7,
    overspend_alert_pct: 0.1,
    variable_cost_alert_ratio: 0.25,
    finance_alerts_inapp_enabled: true,
    finance_alerts_push_enabled: true,
    finance_alerts_email_enabled: true,
  };
}

export async function getProfitLossProfile(userId: string, accountId?: string | null) {
  if (!userId) return buildDefaultProfitLossProfile("", accountId ?? null);

  let specificQuery = supabaseBrowser
    .from(PROFILE_TABLE)
    .select("*")
    .eq("user_id", userId)
    .limit(1);

  if (accountId) {
    specificQuery = specificQuery.eq("account_id", accountId);
  } else {
    specificQuery = specificQuery.is("account_id", null);
  }

  const { data: specific, error: specificError } = await specificQuery.maybeSingle();
  if (specificError) throw specificError;
  if (specific) return mapProfileRow(specific, userId, accountId ?? null);

  if (accountId) {
    const { data: fallback, error: fallbackError } = await supabaseBrowser
      .from(PROFILE_TABLE)
      .select("*")
      .eq("user_id", userId)
      .is("account_id", null)
      .limit(1)
      .maybeSingle();

    if (fallbackError) throw fallbackError;
    if (fallback) return mapProfileRow(fallback, userId, accountId ?? null);
  }

  return buildDefaultProfitLossProfile(userId, accountId ?? null);
}

export async function upsertProfitLossProfile(profile: ProfitLossProfile) {
  const payload = {
    user_id: profile.user_id,
    account_id: profile.account_id ?? null,
    trader_type: profile.trader_type,
    initial_capital: profile.initial_capital,
    trading_days_per_month: profile.trading_days_per_month,
    avg_trades_per_month: profile.avg_trades_per_month,
    include_education_in_break_even: profile.include_education_in_break_even,
    include_owner_pay_in_break_even: profile.include_owner_pay_in_break_even,
    owner_pay_target_monthly: profile.owner_pay_target_monthly,
    renewal_alert_days: profile.renewal_alert_days,
    overspend_alert_pct: profile.overspend_alert_pct,
    variable_cost_alert_ratio: profile.variable_cost_alert_ratio,
    finance_alerts_inapp_enabled: profile.finance_alerts_inapp_enabled,
    finance_alerts_push_enabled: profile.finance_alerts_push_enabled,
    finance_alerts_email_enabled: profile.finance_alerts_email_enabled,
    updated_at: new Date().toISOString(),
  };

  let existingQuery = supabaseBrowser
    .from(PROFILE_TABLE)
    .select("id")
    .eq("user_id", profile.user_id)
    .limit(1);

  if (profile.account_id) {
    existingQuery = existingQuery.eq("account_id", profile.account_id);
  } else {
    existingQuery = existingQuery.is("account_id", null);
  }

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();

  if (existingError && existingError.code !== "PGRST116") throw existingError;

  if (existing?.id) {
    const { data, error } = await supabaseBrowser
      .from(PROFILE_TABLE)
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapProfileRow(data, profile.user_id, profile.account_id ?? null);
  }

  const { data, error } = await supabaseBrowser
    .from(PROFILE_TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return mapProfileRow(data, profile.user_id, profile.account_id ?? null);
}

export async function listProfitLossBudgets(userId: string, accountId?: string | null) {
  if (!userId) return [] as ProfitLossBudget[];

  let query = supabaseBrowser.from(BUDGETS_TABLE).select("*").eq("user_id", userId);

  if (accountId) {
    query = query.or(`account_id.eq.${accountId},account_id.is.null`);
  } else {
    query = query.is("account_id", null);
  }

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) throw error;

  const ordered = (data ?? []).sort((a: any, b: any) => {
    const aSpecific = a?.account_id === accountId ? 1 : 0;
    const bSpecific = b?.account_id === accountId ? 1 : 0;
    return aSpecific - bSpecific;
  });

  const byCategory = new Map<CostCategory, ProfitLossBudget>();
  ordered.forEach((row: any) => {
    const mapped = mapBudgetRow(row);
    byCategory.set(mapped.category, mapped);
  });

  return Array.from(byCategory.values());
}

export async function upsertProfitLossBudget(params: {
  userId: string;
  accountId?: string | null;
  category: CostCategory;
  monthlyAmount: number;
}) {
  let existingQuery = supabaseBrowser
    .from(BUDGETS_TABLE)
    .select("id")
    .eq("user_id", params.userId)
    .eq("category", params.category)
    .limit(1);

  if (params.accountId) {
    existingQuery = existingQuery.eq("account_id", params.accountId);
  } else {
    existingQuery = existingQuery.is("account_id", null);
  }

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError && existingError.code !== "PGRST116") throw existingError;

  if (params.monthlyAmount <= 0) {
    if (existing?.id) {
      const { error } = await supabaseBrowser.from(BUDGETS_TABLE).delete().eq("id", existing.id);
      if (error) throw error;
    }
    return null;
  }

  const payload = {
    user_id: params.userId,
    account_id: params.accountId ?? null,
    category: params.category,
    monthly_amount: params.monthlyAmount,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabaseBrowser
      .from(BUDGETS_TABLE)
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return mapBudgetRow(data);
  }

  const { data, error } = await supabaseBrowser
    .from(BUDGETS_TABLE)
    .insert(payload)
    .select("*")
    .single();
  if (error) throw error;
  return mapBudgetRow(data);
}

export async function listProfitLossCosts(userId: string, accountId?: string | null) {
  if (!userId) return [] as ProfitLossCost[];
  let query = supabaseBrowser.from(COSTS_TABLE).select("*").eq("user_id", userId);

  if (accountId) {
    query = query.or(`account_id.eq.${accountId},account_id.is.null`);
  } else {
    query = query.is("account_id", null);
  }

  const { data, error } = await query.order("is_active", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCostRow);
}

export async function createProfitLossCost(params: {
  userId: string;
  accountId?: string | null;
  name: string;
  category: CostCategory;
  vendor?: string | null;
  billingCycle: BillingCycle;
  amount: number;
  currency?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  notes?: string | null;
  presetKey?: string | null;
  isActive?: boolean;
  includeInBreakEven?: boolean;
  amortizationMonths?: number | null;
}) {
  const { data, error } = await supabaseBrowser
    .from(COSTS_TABLE)
    .insert({
      user_id: params.userId,
      account_id: params.accountId ?? null,
      name: params.name,
      category: params.category,
      vendor: params.vendor ?? null,
      billing_cycle: params.billingCycle,
      amount: params.amount,
      currency: params.currency ?? "USD",
      starts_at: params.startsAt ?? null,
      ends_at: params.endsAt ?? null,
      notes: params.notes ?? null,
      preset_key: params.presetKey ?? null,
      is_active: params.isActive ?? true,
      include_in_break_even: params.includeInBreakEven ?? true,
      amortization_months: params.amortizationMonths ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapCostRow(data);
}

export async function deleteProfitLossCost(userId: string, id: string) {
  if (!id) throw new Error("Missing cost id");
  const { error } = await supabaseBrowser
    .from(COSTS_TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw error;
}

export async function updateProfitLossCost(userId: string, id: string, patch: Partial<ProfitLossCost>) {
  if (!id) throw new Error("Missing cost id");
  const { data, error } = await supabaseBrowser
    .from(COSTS_TABLE)
    .update({
      name: patch.name,
      category: patch.category,
      vendor: patch.vendor,
      billing_cycle: patch.billing_cycle,
      amount: patch.amount,
      currency: patch.currency,
      starts_at: patch.starts_at,
      ends_at: patch.ends_at,
      notes: patch.notes,
      preset_key: patch.preset_key,
      is_active: patch.is_active,
      include_in_break_even: patch.include_in_break_even,
      amortization_months: patch.amortization_months,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapCostRow(data);
}

export async function listNormalizedTradeCosts(params: {
  userId: string;
  fromIso: string;
  toIso: string;
  accountId?: string | null;
}) {
  if (!params.userId) return [] as NormalizedTradeCostRow[];

  let query = supabaseBrowser
    .from("trades")
    .select("id,user_id,account_id,broker,symbol,executed_at,commissions,fees")
    .eq("user_id", params.userId)
    .gte("executed_at", params.fromIso)
    .lt("executed_at", params.toIso);

  if (params.accountId) {
    query = query.eq("account_id", params.accountId);
  }

  const { data, error } = await query.order("executed_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const commissions = Math.abs(toNumber(row?.commissions));
    const fees = Math.abs(toNumber(row?.fees));
    return {
      id: String(row?.id ?? ""),
      user_id: String(row?.user_id ?? params.userId),
      account_id: row?.account_id ?? null,
      broker: row?.broker ?? null,
      symbol: row?.symbol ?? null,
      executed_at: String(row?.executed_at ?? ""),
      commissions,
      fees,
      total_cost: commissions + fees,
    };
  });
}
