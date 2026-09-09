export type TradingAccountType = "personal" | "funded";

export type FundedAccountStage =
  | "evaluation"
  | "verification"
  | "funded";

export type FundedDrawdownType =
  | "static"
  | "trailing_intraday"
  | "trailing_eod";

export type FundedAccountProfile = {
  stage: FundedAccountStage;
  firmName: string;
  programName: string;
  nominalAccountSize: number;
  currentEquity: number;
  profitTarget: number;
  dailyLossLimit: number;
  maxDrawdown: number;
  drawdownType: FundedDrawdownType;
  drawdownFloor: number | null;
  minimumTradingDays: number;
  evaluationDeadline: string | null;
  consistencyRulePercent: number | null;
  maxPositions: number | null;
  profitSplitPercent: number | null;
  payoutMinimum: number | null;
  payoutEligibleDays: number | null;
  newsTradingAllowed: boolean;
  overnightAllowed: boolean;
  weekendAllowed: boolean;
  rulesVersion: number;
  rulesConfirmedAt: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type FundedAccountMetrics = {
  configured: boolean;
  nominalAccountSize: number;
  currentEquity: number;
  breachFloor: number;
  remainingDrawdown: number;
  remainingDrawdownPercent: number;
  targetBalance: number;
  remainingProfitTarget: number;
  firmDailyLossLimit: number;
  operatingDailyStop: number;
  recommendedRiskPerTrade: number;
  operatingDailyStopPercent: number;
  recommendedRiskPerTradePercent: number;
  status: "incomplete" | "safe" | "reduce_risk" | "stop";
};

function finite(value: unknown, fallback = 0) {
  if (value == null || value === "") return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value: unknown, fallback = 0) {
  return Math.max(0, finite(value, fallback));
}

function nullableNonNegative(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

function cleanDate(value: unknown) {
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export function normalizeTradingAccountType(value: unknown): TradingAccountType {
  return String(value ?? "").toLowerCase() === "funded" ? "funded" : "personal";
}

export function normalizeFundedAccountStage(value: unknown): FundedAccountStage {
  const stage = String(value ?? "").toLowerCase();
  if (stage === "verification" || stage === "funded") return stage;
  return "evaluation";
}

export function normalizeFundedDrawdownType(value: unknown): FundedDrawdownType {
  const type = String(value ?? "").toLowerCase();
  if (type === "trailing_intraday" || type === "trailing_eod") return type;
  return "static";
}

export function normalizeFundedAccountProfile(raw: any): FundedAccountProfile | null {
  const source = Array.isArray(raw) ? raw[0] : raw;
  if (!source || typeof source !== "object") return null;

  return {
    stage: normalizeFundedAccountStage(source.stage),
    firmName: String(source.firm_name ?? source.firmName ?? "").trim(),
    programName: String(source.program_name ?? source.programName ?? "").trim(),
    nominalAccountSize: nonNegative(source.nominal_account_size ?? source.nominalAccountSize),
    currentEquity: nonNegative(source.current_equity ?? source.currentEquity),
    profitTarget: nonNegative(source.profit_target ?? source.profitTarget),
    dailyLossLimit: nonNegative(source.daily_loss_limit ?? source.dailyLossLimit),
    maxDrawdown: nonNegative(source.max_drawdown ?? source.maxDrawdown),
    drawdownType: normalizeFundedDrawdownType(source.drawdown_type ?? source.drawdownType),
    drawdownFloor: nullableNonNegative(source.drawdown_floor ?? source.drawdownFloor),
    minimumTradingDays: Math.max(0, Math.trunc(finite(source.minimum_trading_days ?? source.minimumTradingDays))),
    evaluationDeadline: cleanDate(source.evaluation_deadline ?? source.evaluationDeadline),
    consistencyRulePercent: nullableNonNegative(
      source.consistency_rule_percent ?? source.consistencyRulePercent
    ),
    maxPositions: nullableNonNegative(source.max_positions ?? source.maxPositions),
    profitSplitPercent: nullableNonNegative(
      source.profit_split_percent ?? source.profitSplitPercent
    ),
    payoutMinimum: nullableNonNegative(source.payout_minimum ?? source.payoutMinimum),
    payoutEligibleDays: nullableNonNegative(
      source.payout_eligible_days ?? source.payoutEligibleDays
    ),
    newsTradingAllowed: Boolean(source.news_trading_allowed ?? source.newsTradingAllowed),
    overnightAllowed: Boolean(source.overnight_allowed ?? source.overnightAllowed),
    weekendAllowed: Boolean(source.weekend_allowed ?? source.weekendAllowed),
    rulesVersion: Math.max(1, Math.trunc(finite(source.rules_version ?? source.rulesVersion, 1))),
    rulesConfirmedAt: source.rules_confirmed_at ?? source.rulesConfirmedAt ?? null,
    createdAt: source.created_at ?? source.createdAt ?? null,
    updatedAt: source.updated_at ?? source.updatedAt ?? null,
  };
}

export function fundedProfileToDatabase(profile: FundedAccountProfile) {
  return {
    stage: normalizeFundedAccountStage(profile.stage),
    firm_name: profile.firmName.trim().slice(0, 120),
    program_name: profile.programName.trim().slice(0, 120),
    nominal_account_size: nonNegative(profile.nominalAccountSize),
    current_equity: nonNegative(profile.currentEquity),
    profit_target: nonNegative(profile.profitTarget),
    daily_loss_limit: nonNegative(profile.dailyLossLimit),
    max_drawdown: nonNegative(profile.maxDrawdown),
    drawdown_type: normalizeFundedDrawdownType(profile.drawdownType),
    drawdown_floor: nullableNonNegative(profile.drawdownFloor),
    minimum_trading_days: Math.max(0, Math.trunc(finite(profile.minimumTradingDays))),
    evaluation_deadline: cleanDate(profile.evaluationDeadline),
    consistency_rule_percent: nullableNonNegative(profile.consistencyRulePercent),
    max_positions: nullableNonNegative(profile.maxPositions),
    profit_split_percent: nullableNonNegative(profile.profitSplitPercent),
    payout_minimum: nullableNonNegative(profile.payoutMinimum),
    payout_eligible_days: nullableNonNegative(profile.payoutEligibleDays),
    news_trading_allowed: Boolean(profile.newsTradingAllowed),
    overnight_allowed: Boolean(profile.overnightAllowed),
    weekend_allowed: Boolean(profile.weekendAllowed),
    rules_confirmed_at: profile.rulesConfirmedAt,
  };
}

export function getFundedProfileMissingFields(profile: FundedAccountProfile | null) {
  if (!profile) return ["profile"];
  const missing: string[] = [];
  if (!profile.firmName) missing.push("firmName");
  if (!profile.programName) missing.push("programName");
  if (profile.nominalAccountSize <= 0) missing.push("nominalAccountSize");
  if (profile.currentEquity <= 0) missing.push("currentEquity");
  if (profile.profitTarget <= 0) missing.push("profitTarget");
  if (profile.dailyLossLimit <= 0) missing.push("dailyLossLimit");
  if (profile.maxDrawdown <= 0) missing.push("maxDrawdown");
  if (
    profile.drawdownType !== "static" &&
    profile.drawdownFloor == null
  ) {
    missing.push("drawdownFloor");
  }
  if (!profile.rulesConfirmedAt) missing.push("rulesConfirmedAt");
  return missing;
}

export function fundedProfileRulesSignature(profile: FundedAccountProfile | null) {
  if (!profile) return "";
  return JSON.stringify({
    stage: profile.stage,
    firmName: profile.firmName.trim(),
    programName: profile.programName.trim(),
    nominalAccountSize: nonNegative(profile.nominalAccountSize),
    profitTarget: nonNegative(profile.profitTarget),
    dailyLossLimit: nonNegative(profile.dailyLossLimit),
    maxDrawdown: nonNegative(profile.maxDrawdown),
    drawdownType: profile.drawdownType,
    drawdownFloor: nullableNonNegative(profile.drawdownFloor),
    minimumTradingDays: Math.max(0, Math.trunc(finite(profile.minimumTradingDays))),
    evaluationDeadline: cleanDate(profile.evaluationDeadline),
    consistencyRulePercent: nullableNonNegative(profile.consistencyRulePercent),
    maxPositions: nullableNonNegative(profile.maxPositions),
    profitSplitPercent: nullableNonNegative(profile.profitSplitPercent),
    payoutMinimum: nullableNonNegative(profile.payoutMinimum),
    payoutEligibleDays: nullableNonNegative(profile.payoutEligibleDays),
    newsTradingAllowed: Boolean(profile.newsTradingAllowed),
    overnightAllowed: Boolean(profile.overnightAllowed),
    weekendAllowed: Boolean(profile.weekendAllowed),
  });
}

export function calculateFundedAccountMetrics(
  profile: FundedAccountProfile | null,
  liveEquity?: number | null
): FundedAccountMetrics | null {
  if (!profile) return null;

  const nominal = nonNegative(profile.nominalAccountSize);
  const storedEquity = nonNegative(profile.currentEquity, nominal);
  const equity = nonNegative(liveEquity, storedEquity || nominal);
  const inferredFloor = Math.max(0, nominal - nonNegative(profile.maxDrawdown));
  const breachFloor = profile.drawdownFloor == null
    ? inferredFloor
    : nonNegative(profile.drawdownFloor);
  const remainingDrawdown = Math.max(0, equity - breachFloor);
  const firmDailyLossLimit = Math.min(
    nonNegative(profile.dailyLossLimit),
    remainingDrawdown
  );
  // The stage target stays anchored to the program balance so gains do not move the goalpost.
  const targetBalance = nominal + nonNegative(profile.profitTarget);
  const remainingProfitTarget = Math.max(0, targetBalance - equity);
  const configured = getFundedProfileMissingFields(profile).length === 0;

  // Internal operating rails preserve room for multiple sessions and sit below the firm's breach limits.
  const operatingDailyStop = Math.max(
    0,
    Math.min(firmDailyLossLimit * 0.75, remainingDrawdown * 0.25)
  );
  const recommendedRiskPerTrade = Math.max(
    0,
    Math.min(operatingDailyStop / 3, remainingDrawdown / 10)
  );
  const percentageBase = Math.max(equity, 1);
  const remainingDrawdownPercent = nominal > 0 ? (remainingDrawdown / nominal) * 100 : 0;
  const operatingDailyStopPercent = (operatingDailyStop / percentageBase) * 100;
  const recommendedRiskPerTradePercent = (recommendedRiskPerTrade / percentageBase) * 100;

  let status: FundedAccountMetrics["status"] = "safe";
  if (!configured) status = "incomplete";
  else if (remainingDrawdown <= 0) status = "stop";
  else if (
    remainingDrawdown <= Math.max(profile.maxDrawdown * 0.35, profile.dailyLossLimit)
  ) {
    status = "reduce_risk";
  }

  return {
    configured,
    nominalAccountSize: nominal,
    currentEquity: equity,
    breachFloor,
    remainingDrawdown,
    remainingDrawdownPercent,
    targetBalance,
    remainingProfitTarget,
    firmDailyLossLimit,
    operatingDailyStop,
    recommendedRiskPerTrade,
    operatingDailyStopPercent,
    recommendedRiskPerTradePercent,
    status,
  };
}

export function defaultFundedAccountProfile(): FundedAccountProfile {
  return {
    stage: "evaluation",
    firmName: "",
    programName: "",
    nominalAccountSize: 0,
    currentEquity: 0,
    profitTarget: 0,
    dailyLossLimit: 0,
    maxDrawdown: 0,
    drawdownType: "static",
    drawdownFloor: null,
    minimumTradingDays: 0,
    evaluationDeadline: null,
    consistencyRulePercent: null,
    maxPositions: null,
    profitSplitPercent: null,
    payoutMinimum: null,
    payoutEligibleDays: null,
    newsTradingAllowed: false,
    overnightAllowed: false,
    weekendAllowed: false,
    rulesVersion: 1,
    rulesConfirmedAt: null,
  };
}
