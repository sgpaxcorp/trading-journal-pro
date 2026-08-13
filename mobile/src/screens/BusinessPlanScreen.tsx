import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet, apiPost } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";

type MobileGrowthPlan = {
  accountId?: string | null;
  startingBalance?: number;
  targetBalance?: number;
  targetDate?: string | null;
  planStartDate?: string | null;
  dailyTargetPct?: number;
  maxDailyLossPercent?: number;
  maxRiskPerTradePercent?: number;
  averageTradingDaysPerWeek?: number;
  lossDaysPerWeek?: number;
  tradingDays?: number;
  tradingInstrument?: TradingInstrument;
  returnModelMode?: ReturnModelMode;
  plannedDepositSettings?: CapitalFlowSettings | null;
  plannedWithdrawalSettings?: CapitalFlowSettings | null;
  runway?: {
    amount?: number;
    unit?: RunwayUnit;
    calendarKey?: string;
    calendarIsEstimate?: boolean;
  };
  adaptivePlan?: AdaptivePlan | null;
  steps?: any;
};

type TradingInstrument = "stocks" | "options" | "futures" | "forex" | "crypto" | "other";
type RunwayUnit = "days" | "weeks" | "months" | "years";
type ReturnModelMode = "conservative" | "moderate" | "aggressive" | "manual" | "";
type CapitalFlowMode = "undecided" | "none" | "scheduled";
type CapitalFlowFrequency = "monthly" | "quarterly" | "semiannual";
type CapitalFlowSettings = {
  enabled?: boolean;
  frequency?: CapitalFlowFrequency;
  amount?: number;
  startPeriodIndex?: number | null;
};

type AdaptiveMilestone = {
  periodIndex?: number;
  targetDate?: string;
  targetBalance?: number;
  plannedChangeUsd?: number;
  plannedReturnPct?: number;
  plannedTradingChangeUsd?: number;
  plannedDepositsUsd?: number;
  plannedWithdrawalsUsd?: number;
  sessionCount?: number;
};

type AdaptivePlan = {
  verdict?: "supported" | "stretch" | "not_supported" | "unvalidated" | "no_validated_edge" | "incomplete";
  isProvisional?: boolean;
  requestedProjectedBalance?: number;
  requestedCoveragePct?: number;
  requestedShortfallUsd?: number;
  requestedDepositsUsd?: number;
  requestedWithdrawalsUsd?: number;
  requestedTradingGrowthUsd?: number;
  requestedNetCashflowUsd?: number;
  policyGoalDayCapPct?: number;
  policyExpectedLossDayFloorPct?: number;
  recommendedGoalDayPct?: number;
  expectedLossDayPct?: number;
  maxDailyLossGuardrailPct?: number;
  modeledAnnualReturnPct?: number;
  recommendedCompletionDate?: string | null;
  recommendedTradingSessions?: number | null;
  recommendedCalendarMonths?: number | null;
  recommendedCalendarYears?: number | null;
  qualificationRequired?: boolean;
  qualificationMinimumSessions?: number;
  nextMilestone?: AdaptiveMilestone | null;
  monthlyMilestones?: AdaptiveMilestone[];
  quarterlyMilestones?: AdaptiveMilestone[];
  annualMilestones?: AdaptiveMilestone[];
  flags?: string[];
};

type MobileGrowthPlanResponse = {
  accountId?: string | null;
  plan?: MobileGrowthPlan | null;
  projection?: {
    requiredGoalPct?: number;
    tradingDays?: number;
    completionDate?: string | null;
    targetReached?: boolean;
    adaptivePlan?: AdaptivePlan | null;
  };
};

const RETURN_MODELS = {
  conservative: { goal: 0.12, loss: 0.25, maxLoss: 0.75, risk: 0.25, lossDays: 1 },
  moderate: { goal: 0.2, loss: 0.35, maxLoss: 1, risk: 0.5, lossDays: 1 },
  aggressive: { goal: 0.3, loss: 0.5, maxLoss: 1.5, risk: 0.75, lossDays: 1 },
} as const;

function getReturnModel(
  mode: keyof typeof RETURN_MODELS,
  profile?: Record<string, unknown> | null
) {
  const base = RETURN_MODELS[mode];
  let paceFactor = 1;
  let riskFactor = 1;
  if (profile?.experience === "new") {
    paceFactor *= 0.75;
    riskFactor *= 0.75;
  } else if (profile?.experience === "developing") {
    paceFactor *= 0.9;
    riskFactor *= 0.9;
  }
  if (profile?.incomeDependency === "high") {
    paceFactor *= 0.8;
    riskFactor *= 0.75;
  }
  if (profile?.drawdownComfort === "low") {
    paceFactor *= 0.82;
    riskFactor *= 0.8;
  }
  if (profile?.riskProfile === "conservative") {
    paceFactor *= 0.9;
    riskFactor *= 0.9;
  }
  const maxLoss = Number(Math.max(0.5, base.maxLoss * riskFactor).toFixed(2));
  return {
    goal: Number(Math.max(0.08, base.goal * paceFactor).toFixed(3)),
    loss: Number(Math.min(maxLoss * 0.65, Math.max(0.12, base.loss * riskFactor)).toFixed(3)),
    maxLoss,
    risk: Number(Math.max(0.1, base.risk * riskFactor).toFixed(3)),
    lossDays: base.lossDays,
  };
}

const DEFAULT_DO_RULES = [
  "Confirm plan permission before the first trade.",
  "Define risk before entry.",
  "Journal the trade before the next session.",
];
const DEFAULT_DONT_RULES = [
  "Do not trade after max daily loss.",
  "Do not increase size to recover a loss.",
  "Do not enter without a defined exit.",
];
const DEFAULT_ORDER_RULES = [
  "Premarket levels marked.",
  "Risk and invalidation defined.",
  "Entry, management, and exit recorded.",
];

function isoDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysIso(baseIso: string, days: number) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(baseIso) ? new Date(`${baseIso}T00:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return isoDate(base);
}

function addRunwayIso(baseIso: string, amount: number, unit: RunwayUnit) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(baseIso) ? new Date(`${baseIso}T00:00:00`) : new Date();
  const safeAmount = Math.max(1, Math.floor(Number.isFinite(amount) ? amount : 1));
  if (unit === "days" || unit === "weeks") {
    base.setDate(base.getDate() + safeAmount * (unit === "weeks" ? 7 : 1));
    return isoDate(base);
  }
  const originalDay = base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth() + safeAmount * (unit === "years" ? 12 : 1));
  const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(originalDay, lastDay));
  return isoDate(base);
}

function inferRunway(baseIso: string, targetIso: string): { amount: number; unit: RunwayUnit } {
  for (let years = 1; years <= 30; years += 1) {
    if (addRunwayIso(baseIso, years, "years") === targetIso) return { amount: years, unit: "years" };
  }
  for (let months = 1; months <= 360; months += 1) {
    if (addRunwayIso(baseIso, months, "months") === targetIso) return { amount: months, unit: "months" };
  }
  const days = Math.max(1, dateDiffDays(baseIso, targetIso));
  return days % 7 === 0 ? { amount: days / 7, unit: "weeks" } : { amount: days, unit: "days" };
}

function parseAmount(value: string) {
  const n = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatMoneyDraft(value: string) {
  const cleaned = String(value ?? "").replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [integerRaw = "", ...decimals] = cleaned.split(".");
  const integer = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimals.length ? `${grouped}.${decimals.join("").slice(0, 2)}` : grouped;
}

function formatMoneyValue(value: string | number) {
  const amount = typeof value === "number" ? value : parseAmount(value);
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parsePercent(value: string) {
  const n = Number(String(value).replace(/[%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function dateDiffDays(startIso: string, endIso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) return 0;
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  return Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function rulesToText(items: unknown, fallback: string[]) {
  const list = Array.isArray(items)
    ? items
        .map((item) => String((item as any)?.text ?? item ?? "").trim())
        .filter(Boolean)
    : [];
  return (list.length ? list : fallback).join("\n");
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

export function BusinessPlanScreen() {
  const navigation = useNavigation<any>();
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const today = useMemo(() => isoDate(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [lastProjection, setLastProjection] = useState<MobileGrowthPlanResponse["projection"] | null>(null);
  const [adaptivePlan, setAdaptivePlan] = useState<AdaptivePlan | null>(null);
  const [activeAdaptivePlan, setActiveAdaptivePlan] = useState<AdaptivePlan | null>(null);
  const [evaluatedDraftKey, setEvaluatedDraftKey] = useState<string | null>(null);
  const [businessProfile, setBusinessProfile] = useState<Record<string, unknown> | null>(null);

  const [startingBalance, setStartingBalance] = useState("");
  const [targetBalance, setTargetBalance] = useState("");
  const [planStartDate, setPlanStartDate] = useState(today);
  const [targetDate, setTargetDate] = useState(addDaysIso(today, 365));
  const [runwayAmount, setRunwayAmount] = useState("1");
  const [runwayUnit, setRunwayUnit] = useState<RunwayUnit>("years");
  const [tradingInstrument, setTradingInstrument] = useState<TradingInstrument>("stocks");
  const [averageTradingDaysPerWeek, setAverageTradingDaysPerWeek] = useState("5");
  const [lossDaysPerWeek, setLossDaysPerWeek] = useState("1");
  const [maxDailyLossPercent, setMaxDailyLossPercent] = useState("2");
  const [maxRiskPerTradePercent, setMaxRiskPerTradePercent] = useState("1");
  const [operatingGoalDayPct, setOperatingGoalDayPct] = useState("0.20");
  const [expectedLossDayPct, setExpectedLossDayPct] = useState("0.35");
  const [returnModelMode, setReturnModelMode] = useState<ReturnModelMode>("");
  const [policyScenarioId, setPolicyScenarioId] = useState<Exclude<ReturnModelMode, "manual" | "">>("moderate");
  const [plannedDepositMode, setPlannedDepositMode] = useState<CapitalFlowMode>("undecided");
  const [plannedDepositFrequency, setPlannedDepositFrequency] = useState<CapitalFlowFrequency>("monthly");
  const [plannedDepositAmount, setPlannedDepositAmount] = useState("");
  const [plannedDepositStartPeriod, setPlannedDepositStartPeriod] = useState("1");
  const [plannedWithdrawalMode, setPlannedWithdrawalMode] = useState<CapitalFlowMode>("undecided");
  const [plannedWithdrawalFrequency, setPlannedWithdrawalFrequency] = useState<CapitalFlowFrequency>("monthly");
  const [plannedWithdrawalAmount, setPlannedWithdrawalAmount] = useState("");
  const [plannedWithdrawalStartPeriod, setPlannedWithdrawalStartPeriod] = useState("1");
  const [strategyName, setStrategyName] = useState("");
  const [strategyNotes, setStrategyNotes] = useState("");
  const [doRules, setDoRules] = useState(DEFAULT_DO_RULES.join("\n"));
  const [dontRules, setDontRules] = useState(DEFAULT_DONT_RULES.join("\n"));
  const [orderRules, setOrderRules] = useState(DEFAULT_ORDER_RULES.join("\n"));

  const hydrateForm = useCallback(
    (plan: MobileGrowthPlan | null | undefined) => {
      if (!plan) {
        setAdaptivePlan(null);
        setBusinessProfile(null);
        setStartingBalance("");
        setTargetBalance("");
        setPlanStartDate(today);
        setTargetDate(addDaysIso(today, 365));
        setRunwayAmount("1");
        setRunwayUnit("years");
        setTradingInstrument("stocks");
        setAverageTradingDaysPerWeek("5");
        setLossDaysPerWeek("1");
        setMaxDailyLossPercent("2");
        setMaxRiskPerTradePercent("1");
        setOperatingGoalDayPct("0.20");
        setExpectedLossDayPct("0.35");
        setReturnModelMode("");
        setPolicyScenarioId("moderate");
        setPlannedDepositMode("undecided");
        setPlannedDepositFrequency("monthly");
        setPlannedDepositAmount("");
        setPlannedDepositStartPeriod("1");
        setPlannedWithdrawalMode("undecided");
        setPlannedWithdrawalFrequency("monthly");
        setPlannedWithdrawalAmount("");
        setPlannedWithdrawalStartPeriod("1");
        setStrategyName("");
        setStrategyNotes("");
        setDoRules(DEFAULT_DO_RULES.join("\n"));
        setDontRules(DEFAULT_DONT_RULES.join("\n"));
        setOrderRules(DEFAULT_ORDER_RULES.join("\n"));
        return;
      }

      const steps = plan.steps ?? {};
      const firstStrategy = Array.isArray(steps?.strategy?.strategies) ? steps.strategy.strategies[0] : null;
      const system = steps?.execution_and_journal?.system ?? {};
      setAdaptivePlan(plan.adaptivePlan ?? null);
      setBusinessProfile(
        steps?.business_analysis?.profile && typeof steps.business_analysis.profile === "object"
          ? steps.business_analysis.profile
          : null
      );

      setStartingBalance(plan.startingBalance ? formatMoneyValue(plan.startingBalance) : "");
      setTargetBalance(plan.targetBalance ? formatMoneyValue(plan.targetBalance) : "");
      setPlanStartDate(plan.planStartDate || today);
      setTargetDate(plan.targetDate || addDaysIso(plan.planStartDate || today, 365));
      setRunwayAmount(String(plan.runway?.amount || 1));
      setRunwayUnit(plan.runway?.unit || "years");
      setTradingInstrument(plan.tradingInstrument || "stocks");
      setAverageTradingDaysPerWeek(String(plan.averageTradingDaysPerWeek || 5));
      setLossDaysPerWeek(String(plan.lossDaysPerWeek ?? 1));
      setMaxDailyLossPercent(String(plan.maxDailyLossPercent || 2));
      setMaxRiskPerTradePercent(String(plan.maxRiskPerTradePercent || 1));
      setOperatingGoalDayPct(
        String(
          plan.adaptivePlan?.recommendedGoalDayPct ??
            steps?.business_analysis?.selectedScenario?.dailyGoalPct ??
            0.2
        )
      );
      setExpectedLossDayPct(
        String(
          plan.adaptivePlan?.expectedLossDayPct ??
            steps?.business_analysis?.selectedScenario?.expectedLossDayPct ??
            0.35
        )
      );
      const storedReturnMode = plan.returnModelMode || "moderate";
      setReturnModelMode(storedReturnMode);
      const storedScenarioId = String(steps?.business_analysis?.selectedScenarioId ?? "moderate");
      setPolicyScenarioId(
        storedScenarioId === "conservative" || storedScenarioId === "aggressive"
          ? storedScenarioId
          : "moderate"
      );
      const depositSettings = plan.plannedDepositSettings;
      setPlannedDepositMode(depositSettings ? (depositSettings.enabled ? "scheduled" : "none") : "undecided");
      setPlannedDepositFrequency(depositSettings?.frequency ?? "monthly");
      setPlannedDepositAmount(depositSettings?.amount ? formatMoneyValue(depositSettings.amount) : "");
      setPlannedDepositStartPeriod(String(depositSettings?.startPeriodIndex ?? 1));
      const withdrawalSettings = plan.plannedWithdrawalSettings;
      setPlannedWithdrawalMode(withdrawalSettings ? (withdrawalSettings.enabled ? "scheduled" : "none") : "undecided");
      setPlannedWithdrawalFrequency(withdrawalSettings?.frequency ?? "monthly");
      setPlannedWithdrawalAmount(withdrawalSettings?.amount ? formatMoneyValue(withdrawalSettings.amount) : "");
      setPlannedWithdrawalStartPeriod(String(withdrawalSettings?.startPeriodIndex ?? 1));
      setStrategyName(String(firstStrategy?.name ?? "").trim());
      setStrategyNotes(String(firstStrategy?.setup || steps?.strategy?.notes || "").trim());
      setDoRules(rulesToText(system?.doList, DEFAULT_DO_RULES));
      setDontRules(rulesToText(system?.dontList, DEFAULT_DONT_RULES));
      setOrderRules(rulesToText(system?.orderList, DEFAULT_ORDER_RULES));
    },
    [today]
  );

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiGet<MobileGrowthPlanResponse>("/api/growth-plan/mobile");
      setAccountId(response.accountId ?? response.plan?.accountId ?? null);
      hydrateForm(response.plan);
      setActiveAdaptivePlan(response.plan?.adaptivePlan ?? null);
      setEvaluatedDraftKey(null);
      setLastProjection(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Business Plan.");
    } finally {
      setLoading(false);
    }
  }, [hydrateForm]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    setTargetDate(
      addRunwayIso(
        planStartDate,
        Math.max(1, Math.floor(parsePercent(runwayAmount) || 1)),
        runwayUnit
      )
    );
  }, [planStartDate, runwayAmount, runwayUnit]);

  const preview = useMemo(() => {
    const start = parseAmount(startingBalance);
    const target = parseAmount(targetBalance);
    const calendarDays = Math.max(0, dateDiffDays(planStartDate, targetDate));
    const availableSessionsPerWeek = tradingInstrument === "crypto" ? 7 : 5;
    const operatingDays = Math.max(
      0,
      Math.round(
        (calendarDays / 7) *
          Math.max(
            1,
            Math.min(availableSessionsPerWeek, parsePercent(averageTradingDaysPerWeek) || 5)
          )
      )
    );
    const requiredPct =
      start > 0 && target > start && operatingDays > 0
        ? (Math.pow(target / start, 1 / operatingDays) - 1) * 100
        : 0;
    const gap = Math.max(0, target - start);
    const tone =
      requiredPct > 1
        ? t(language, "High mathematical pace", "Ritmo matemático alto")
        : requiredPct > 0.5
          ? t(language, "Elevated mathematical pace", "Ritmo matemático elevado")
          : t(language, "Measured mathematical pace", "Ritmo matemático moderado");
    const advisor =
      requiredPct > 1
        ? t(
            language,
            "Consider extending time or breaking the goal into smaller phases before scaling size.",
            "Considera extender el tiempo o dividir la meta en fases más pequeñas antes de subir size."
          )
        : requiredPct > 0.5
          ? t(
              language,
              "Validate this pace against your real execution evidence before treating it as an operating expectation.",
              "Valida este ritmo contra tu evidencia real de ejecución antes de tratarlo como una expectativa operativa."
            )
          : t(
              language,
              "This gives the business room to compound without forcing every session.",
              "Esto le da espacio al negocio para componer sin forzar cada sesión."
            );

    return { start, target, calendarDays, operatingDays, requiredPct, gap, tone, advisor };
  }, [averageTradingDaysPerWeek, language, planStartDate, startingBalance, targetBalance, targetDate, tradingInstrument]);

  const adaptiveHeadline = useMemo(() => {
    if (!adaptivePlan) return "";
    if (adaptivePlan.verdict === "not_supported") {
      return t(
        language,
        "The requested deadline is not supported by this disciplined model.",
        "El plazo solicitado no está respaldado por este modelo disciplinado."
      );
    }
    if (adaptivePlan.verdict === "no_validated_edge") {
      if (adaptivePlan.recommendedCompletionDate && adaptivePlan.flags?.includes("planned_deposits_included")) {
        return t(
          language,
          "Trading growth is not validated. The displayed horizon comes from scheduled funding while trading remains in qualification.",
          "El crecimiento por trading no está validado. El horizonte mostrado proviene del fondeo programado mientras el trading permanece en calificación."
        );
      }
      return t(
        language,
        "Validate a positive execution edge before assigning a completion date.",
        "Valida una ventaja positiva de ejecución antes de asignar una fecha de cumplimiento."
      );
    }
    if (adaptivePlan.verdict === "stretch") {
      return t(language, "The requested deadline is a stretch.", "El plazo solicitado es exigente.");
    }
    if (adaptivePlan.verdict === "unvalidated") {
      return t(
        language,
        "The roadmap is provisional until more execution is documented.",
        "La ruta es provisional hasta documentar más ejecución."
      );
    }
    return t(
      language,
      "The requested runway is supported by the operating model.",
      "El runway solicitado está respaldado por el modelo operativo."
    );
  }, [adaptivePlan, language]);

  const useRecommendedRunway = useCallback(() => {
    const completionDate = adaptivePlan?.recommendedCompletionDate;
    if (!completionDate) return;
    const recommended = inferRunway(planStartDate, completionDate);
    setRunwayAmount(String(recommended.amount));
    setRunwayUnit(recommended.unit);
    setSavedMessage(
      t(
        language,
        "Recommended runway loaded. Save the Business Plan to activate the new checkpoints.",
        "Runway recomendado cargado. Guarda el Plan Empresarial para activar los nuevos checkpoints."
      )
    );
  }, [adaptivePlan?.recommendedCompletionDate, language, planStartDate]);

  const selectReturnModel = useCallback((mode: Exclude<ReturnModelMode, "">) => {
    setReturnModelMode(mode);
    if (mode === "manual") return;
    const policy = getReturnModel(mode, businessProfile);
    setPolicyScenarioId(mode);
    setOperatingGoalDayPct(policy.goal.toFixed(2));
    setExpectedLossDayPct(policy.loss.toFixed(2));
    setMaxDailyLossPercent(policy.maxLoss.toFixed(2));
    setMaxRiskPerTradePercent(policy.risk.toFixed(2));
    setLossDaysPerWeek(String(policy.lossDays));
  }, [businessProfile]);

  const declaredReturnSummary = useMemo(() => {
    const days = Math.max(1, Math.floor(parsePercent(averageTradingDaysPerWeek) || 1));
    const losingDays = Math.min(days - 1, Math.max(0, Math.floor(parsePercent(lossDaysPerWeek))));
    const goalDays = Math.max(1, days - losingDays);
    const weeklyFactor =
      Math.pow(1 + Math.max(0, parsePercent(operatingGoalDayPct)) / 100, goalDays) *
      Math.pow(1 - Math.min(99, Math.max(0, parsePercent(expectedLossDayPct))) / 100, losingDays);
    return {
      weekly: (weeklyFactor - 1) * 100,
      monthly: (Math.pow(weeklyFactor, 52 / 12) - 1) * 100,
      annual: (Math.pow(weeklyFactor, 52) - 1) * 100,
      goalDays,
      losingDays,
    };
  }, [averageTradingDaysPerWeek, expectedLossDayPct, lossDaysPerWeek, operatingGoalDayPct]);

  const capitalFlowAssumptionsComplete =
    (plannedDepositMode === "none" ||
      (plannedDepositMode === "scheduled" && parseAmount(plannedDepositAmount) > 0)) &&
    (plannedWithdrawalMode === "none" ||
      (plannedWithdrawalMode === "scheduled" && parseAmount(plannedWithdrawalAmount) > 0));

  const maximumOperatingDays = tradingInstrument === "crypto" ? 7 : 5;
  const operatingDays = Math.floor(parsePercent(averageTradingDaysPerWeek));
  const plannedLossDays = Math.floor(parsePercent(lossDaysPerWeek));
  const formInputsComplete =
    preview.start > 0 &&
    preview.target > preview.start &&
    /^\d{4}-\d{2}-\d{2}$/.test(planStartDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(targetDate) &&
    dateDiffDays(planStartDate, targetDate) > 0 &&
    operatingDays >= 1 &&
    operatingDays <= maximumOperatingDays &&
    plannedLossDays >= 0 &&
    plannedLossDays < operatingDays &&
    parsePercent(operatingGoalDayPct) > 0 &&
    parsePercent(expectedLossDayPct) > 0 &&
    parsePercent(maxDailyLossPercent) > 0 &&
    parsePercent(maxRiskPerTradePercent) > 0 &&
    parsePercent(expectedLossDayPct) <= parsePercent(maxDailyLossPercent) &&
    Boolean(returnModelMode) &&
    capitalFlowAssumptionsComplete;

  const planRequestPayload = useMemo(
    () => ({
      accountId,
      startingBalance: preview.start,
      targetBalance: preview.target,
      planStartDate,
      targetDate,
      runwayAmount: parsePercent(runwayAmount),
      runwayUnit,
      tradingInstrument,
      averageTradingDaysPerWeek: parsePercent(averageTradingDaysPerWeek),
      lossDaysPerWeek: parsePercent(lossDaysPerWeek),
      maxDailyLossPercent: parsePercent(maxDailyLossPercent),
      maxRiskPerTradePercent: parsePercent(maxRiskPerTradePercent),
      returnModelMode,
      policyScenarioId,
      operatingDailyGoalPct: parsePercent(operatingGoalDayPct),
      expectedLossDayPct: parsePercent(expectedLossDayPct),
      plannedDepositMode,
      plannedDepositFrequency,
      plannedDepositAmount: parseAmount(plannedDepositAmount),
      plannedDepositStartPeriod: parsePercent(plannedDepositStartPeriod),
      plannedWithdrawalMode,
      plannedWithdrawalFrequency,
      plannedWithdrawalAmount: parseAmount(plannedWithdrawalAmount),
      plannedWithdrawalStartPeriod: parsePercent(plannedWithdrawalStartPeriod),
      strategyName,
      strategyNotes,
      doRules,
      dontRules,
      orderRules,
    }),
    [
      accountId,
      averageTradingDaysPerWeek,
      doRules,
      dontRules,
      expectedLossDayPct,
      lossDaysPerWeek,
      maxDailyLossPercent,
      maxRiskPerTradePercent,
      operatingGoalDayPct,
      orderRules,
      planStartDate,
      plannedDepositAmount,
      plannedDepositFrequency,
      plannedDepositMode,
      plannedDepositStartPeriod,
      plannedWithdrawalAmount,
      plannedWithdrawalFrequency,
      plannedWithdrawalMode,
      plannedWithdrawalStartPeriod,
      policyScenarioId,
      preview.start,
      preview.target,
      returnModelMode,
      runwayAmount,
      runwayUnit,
      strategyName,
      strategyNotes,
      targetDate,
      tradingInstrument,
    ]
  );
  const draftEvaluationKey = useMemo(
    () => JSON.stringify(planRequestPayload),
    [planRequestPayload]
  );

  useEffect(() => {
    if (!evaluatedDraftKey || evaluatedDraftKey === draftEvaluationKey) return;
    setLastProjection(null);
    setAdaptivePlan(activeAdaptivePlan);
    setEvaluatedDraftKey(null);
    setSavedMessage(null);
  }, [activeAdaptivePlan, draftEvaluationKey, evaluatedDraftKey]);

  const canEvaluate = formInputsComplete && !saving && !previewing && !resetting;
  const canSave =
    formInputsComplete &&
    !saving &&
    !previewing &&
    !resetting;

  const evaluatePlan = useCallback(async () => {
    if (!formInputsComplete) {
      setError(
        t(
          language,
          "Complete the return model, trading and losing days, risk limits, contributions, and withdrawals before evaluating.",
          "Completa el modelo de retorno, días de trading y pérdida, límites de riesgo, aportaciones y retiros antes de evaluar."
        )
      );
      return;
    }

    setPreviewing(true);
    setError(null);
    setSavedMessage(null);
    try {
      const response = await apiPost<MobileGrowthPlanResponse>("/api/growth-plan/mobile", {
        ...planRequestPayload,
        action: "preview",
      });
      setLastProjection(response.projection ?? null);
      setAdaptivePlan(response.projection?.adaptivePlan ?? null);
      setEvaluatedDraftKey(draftEvaluationKey);
      setSavedMessage(
        t(
          language,
          "Draft evaluated. Review the realistic horizon, trading growth, contributions, and withdrawals before saving.",
          "Borrador evaluado. Revisa el horizonte realista, crecimiento por trading, aportaciones y retiros antes de guardar."
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to evaluate Business Plan.");
    } finally {
      setPreviewing(false);
    }
  }, [draftEvaluationKey, formInputsComplete, language, planRequestPayload]);

  const savePlan = useCallback(async () => {
    if (!canSave) {
      setError(
        t(
          language,
          "Complete the capital goal, return model, operating schedule, contributions, and withdrawals before saving.",
          "Completa la meta de capital, modelo de retorno, calendario operativo, aportaciones y retiros antes de guardar."
        )
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const response = await apiPost<MobileGrowthPlanResponse>("/api/growth-plan/mobile", planRequestPayload);
      setAccountId(response.accountId ?? accountId);
      const activatedRecommendedRunway =
        Boolean(response.plan?.targetDate) && response.plan?.targetDate !== targetDate;
      hydrateForm(response.plan);
      setLastProjection(response.projection ?? null);
      const savedAdaptivePlan = response.projection?.adaptivePlan ?? response.plan?.adaptivePlan ?? null;
      setAdaptivePlan(savedAdaptivePlan);
      setActiveAdaptivePlan(savedAdaptivePlan);
      setEvaluatedDraftKey(draftEvaluationKey);
      setSavedMessage(
        activatedRecommendedRunway
          ? t(
              language,
              `Business Plan saved with the disciplined runway ending ${response.plan?.targetDate}. Official checkpoints now follow that horizon.`,
              `Plan Empresarial guardado con el runway disciplinado que termina ${response.plan?.targetDate}. Los checkpoints oficiales ahora siguen ese horizonte.`
            )
          : t(
              language,
              "Business Plan saved. Your dashboard Business Progress can now track this plan.",
              "Plan Empresarial guardado. El Business Progress del dashboard ahora puede seguir este plan."
            )
      );
      try {
        await apiPost("/api/business-milestones/sync", {
          accountId: response.accountId ?? accountId,
          lang: language,
        });
      } catch {
        // Milestones are supportive; the plan itself is already saved.
      }
      Alert.alert(
        t(language, "Business Plan saved", "Plan Empresarial guardado"),
        t(
          language,
          activatedRecommendedRunway
            ? "The requested deadline was not supported, so the plan activated the disciplined recommended runway and synchronized its checkpoints."
            : "Your plan is active. Open the Business Center to review progress and checkpoints.",
          activatedRecommendedRunway
            ? "El plazo solicitado no estaba respaldado, por eso el plan activó el runway disciplinado recomendado y sincronizó sus checkpoints."
            : "Tu plan está activo. Abre el Centro Empresarial para revisar progreso y checkpoints."
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save Business Plan.");
    } finally {
      setSaving(false);
    }
  }, [
    accountId,
    canSave,
    draftEvaluationKey,
    hydrateForm,
    language,
    planRequestPayload,
    targetDate,
  ]);

  const resetPlan = useCallback(() => {
    Alert.alert(
      t(language, "Reset Business Plan?", "¿Resetear Plan Empresarial?"),
      t(
        language,
        "This removes the active Trading Business Plan, plan checkpoints, plan history, and plan-based alarms. Your journal, account records, and subscription stay untouched.",
        "Esto elimina el Plan de Empresa de Trading activo, checkpoints, historial del plan y alarmas basadas en el plan. Tu journal, registros de cuenta y suscripción no se tocan."
      ),
      [
        { text: t(language, "Cancel", "Cancelar"), style: "cancel" },
        {
          text: t(language, "Continue", "Continuar"),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t(language, "Final warning", "Advertencia final"),
              t(
                language,
                "This cannot be undone. You will need to create a new Business Plan from zero.",
                "Esto no se puede deshacer. Tendrás que crear un nuevo Plan Empresarial desde cero."
              ),
              [
                { text: t(language, "Cancel", "Cancelar"), style: "cancel" },
                {
                  text: t(language, "Reset plan", "Resetear plan"),
                  style: "destructive",
                  onPress: async () => {
                    setResetting(true);
                    setError(null);
                    setSavedMessage(null);
                    try {
                      const response = await apiPost<MobileGrowthPlanResponse>("/api/growth-plan/mobile", {
                        action: "reset",
                        accountId,
                        confirmation: "RESET PLAN",
                      });
                      setAccountId(response.accountId ?? accountId);
                      hydrateForm(null);
                      setActiveAdaptivePlan(null);
                      setEvaluatedDraftKey(null);
                      setLastProjection(null);
                      setSavedMessage(
                        t(
                          language,
                          "Business Plan reset. You can now start a new plan.",
                          "Plan Empresarial reseteado. Ahora puedes comenzar un plan nuevo."
                        )
                      );
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Unable to reset Business Plan.");
                    } finally {
                      setResetting(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [accountId, hydrateForm, language]);

  const renderField = (
    label: string,
    value: string,
    onChangeText: (value: string) => void,
    options?: {
      placeholder?: string;
      multiline?: boolean;
      keyboardType?: "default" | "numeric";
      onBlur?: () => void;
      editable?: boolean;
    }
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={options?.placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={options?.keyboardType ?? "default"}
        multiline={options?.multiline}
        onBlur={options?.onBlur}
        editable={options?.editable ?? true}
        textAlignVertical={options?.multiline ? "top" : "center"}
        style={[styles.input, options?.multiline && styles.inputMultiline, options?.editable === false && styles.inputDisabled]}
      />
    </View>
  );

  return (
    <ScreenScaffold
      title={t(language, "Trading Business Plan", "Plan de Empresa de Trading")}
      subtitle={t(
        language,
        "Create or edit the operating plan the mobile dashboard and coach will follow.",
        "Crea o edita el plan operativo que el dashboard mobile y el coach van a seguir."
      )}
      refreshing={loading}
      onRefresh={loadPlan}
      showBrand={false}
      compactHeader
    >
      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>{t(language, "Loading Business Plan...", "Cargando Plan Empresarial...")}</Text>
        </View>
      ) : (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>{t(language, "Business objective", "Objetivo empresarial")}</Text>
            <Text style={styles.heroTitle}>
              {preview.start > 0 && preview.target > preview.start
                ? `${formatCompactCurrency(preview.start)} → ${formatCompactCurrency(preview.target)}`
                : t(language, "Define the account journey", "Define el recorrido de la cuenta")}
            </Text>
            <Text style={styles.heroBody}>
              {preview.advisor}
            </Text>
            <View style={styles.previewGrid}>
              <View style={styles.previewCell}>
                <Text style={styles.previewLabel}>{t(language, "Plan tone", "Tono del plan")}</Text>
                <Text style={styles.previewValue}>{preview.tone}</Text>
              </View>
              <View style={styles.previewCell}>
                <Text style={styles.previewLabel}>{t(language, "Est. sessions", "Sesiones est.")}</Text>
                <Text style={styles.previewValue}>{preview.operatingDays}</Text>
              </View>
              <View style={styles.previewCell}>
                <Text style={styles.previewLabel}>
                  {lastProjection
                    ? t(language, "Evaluated goal-day need", "Necesidad día-meta evaluada")
                    : t(language, "Target-only math/session", "Matemática meta/sesión")}
                </Text>
                <Text style={styles.previewValue}>
                  {Number(lastProjection?.requiredGoalPct ?? preview.requiredPct).toFixed(2)}%
                </Text>
              </View>
              <View style={styles.previewCell}>
                <Text style={styles.previewLabel}>{t(language, "Gap before flows", "Diferencia antes de flujos")}</Text>
                <Text style={styles.previewValue}>{formatCompactCurrency(preview.gap)}</Text>
              </View>
            </View>
            {lastProjection ? (
              <Text style={styles.savedHint}>
                {t(language, "Latest evaluation:", "Evaluación más reciente:")}{" "}
                <Text style={styles.savedStrong}>{Number(lastProjection.requiredGoalPct ?? 0).toFixed(2)}%</Text>
                {" · "}
                {t(language, "Trading days:", "Días de trading:")}{" "}
                <Text style={styles.savedStrong}>{lastProjection.tradingDays ?? preview.operatingDays}</Text>
              </Text>
            ) : null}
          </View>

          {adaptivePlan ? (
            <View style={styles.sectionCard}>
              <Text style={styles.eyebrow}>{t(language, "Discipline roadmap", "Ruta de disciplina")}</Text>
              <Text style={styles.sectionTitle}>{adaptiveHeadline}</Text>
              <Text style={styles.muted}>
                {t(
                  language,
                  `At the selected operating pace, the model projects ${formatCompactCurrency(Number(adaptivePlan.requestedProjectedBalance ?? 0))} by the requested date.`,
                  `Al ritmo operativo seleccionado, el modelo proyecta ${formatCompactCurrency(Number(adaptivePlan.requestedProjectedBalance ?? 0))} para la fecha solicitada.`
                )}
              </Text>
              <View style={styles.previewGrid}>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLabel}>{t(language, "Deadline coverage", "Cobertura del plazo")}</Text>
                  <Text style={styles.previewValue}>{Number(adaptivePlan.requestedCoveragePct ?? 0).toFixed(0)}%</Text>
                </View>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLabel}>{t(language, "Recommended completion", "Cumplimiento recomendado")}</Text>
                  <Text style={styles.previewValue}>{adaptivePlan.recommendedCompletionDate || "—"}</Text>
                </View>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLabel}>{t(language, "Goal-day model", "Modelo día-meta")}</Text>
                  <Text style={styles.previewValue}>{Number(adaptivePlan.recommendedGoalDayPct ?? 0).toFixed(2)}%</Text>
                </View>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLabel}>{t(language, "Expected loss-day", "Pérdida esperada/día")}</Text>
                  <Text style={styles.previewValue}>{Number(adaptivePlan.expectedLossDayPct ?? 0).toFixed(2)}%</Text>
                </View>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLabel}>{t(language, "Trading growth", "Crecimiento de trading")}</Text>
                  <Text style={styles.previewValue}>{formatCompactCurrency(Number(adaptivePlan.requestedTradingGrowthUsd ?? 0))}</Text>
                </View>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLabel}>{t(language, "Contributions", "Aportaciones")}</Text>
                  <Text style={styles.previewValue}>{formatCompactCurrency(Number(adaptivePlan.requestedDepositsUsd ?? 0))}</Text>
                </View>
                <View style={styles.previewCell}>
                  <Text style={styles.previewLabel}>{t(language, "Withdrawals", "Retiros")}</Text>
                  <Text style={styles.previewValue}>{formatCompactCurrency(Number(adaptivePlan.requestedWithdrawalsUsd ?? 0))}</Text>
                </View>
              </View>
              {adaptivePlan.nextMilestone ? (
                <View style={styles.calculatedDate}>
                  <Text style={styles.previewLabel}>{t(language, "Next monthly checkpoint", "Próximo checkpoint mensual")}</Text>
                  <Text style={styles.previewValue}>
                    {formatCompactCurrency(Number(adaptivePlan.nextMilestone.targetBalance ?? 0))} · {adaptivePlan.nextMilestone.targetDate || "—"}
                  </Text>
                </View>
              ) : null}
              {adaptivePlan.qualificationRequired ? (
                <Text style={styles.savedHint}>
                  {t(
                    language,
                    `Provisional until at least ${adaptivePlan.qualificationMinimumSessions ?? 30} documented sessions are available.`,
                    `Provisional hasta contar con al menos ${adaptivePlan.qualificationMinimumSessions ?? 30} sesiones documentadas.`
                  )}
                </Text>
              ) : null}
              {adaptivePlan.flags?.includes("declared_goal_above_operating_policy") ||
              adaptivePlan.flags?.includes("declared_loss_assumption_below_operating_policy") ? (
                <Text style={styles.savedHint}>
                  {t(
                    language,
                    `The declared assumptions were evaluated without accelerating the recommendation. Policy cap: ${Number(adaptivePlan.policyGoalDayCapPct ?? 0).toFixed(2)}% goal-day; loss-day floor: ${Number(adaptivePlan.policyExpectedLossDayFloorPct ?? 0).toFixed(2)}%.`,
                    `Los supuestos declarados se evaluaron sin acelerar la recomendación. Tope de política: ${Number(adaptivePlan.policyGoalDayCapPct ?? 0).toFixed(2)}% en día-meta; piso de pérdida: ${Number(adaptivePlan.policyExpectedLossDayFloorPct ?? 0).toFixed(2)}%.`
                  )}
                </Text>
              ) : null}
              {adaptivePlan.recommendedCompletionDate && adaptivePlan.verdict !== "supported" ? (
                <Pressable style={[styles.button, styles.primaryButton]} onPress={useRecommendedRunway}>
                  <Text style={styles.primaryButtonText}>
                    {t(language, "Use recommended runway", "Usar runway recomendado")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t(language, "Target and runway", "Meta y runway")}</Text>
            <View style={styles.twoCol}>
              {renderField(t(language, "Starting balance", "Capital inicial"), startingBalance, (value) => setStartingBalance(formatMoneyDraft(value)), {
                keyboardType: "numeric",
                placeholder: "5,000.00",
                onBlur: () => {
                  if (startingBalance) setStartingBalance(formatMoneyValue(startingBalance));
                },
              })}
              {renderField(t(language, "Target balance", "Meta de balance"), targetBalance, (value) => setTargetBalance(formatMoneyDraft(value)), {
                keyboardType: "numeric",
                placeholder: "50,000.00",
                onBlur: () => {
                  if (targetBalance) setTargetBalance(formatMoneyValue(targetBalance));
                },
              })}
            </View>
            <View style={styles.twoCol}>
              {renderField(t(language, "Start date", "Fecha inicial"), planStartDate, setPlanStartDate, {
                placeholder: "YYYY-MM-DD",
              })}
              {renderField(t(language, "Runway amount", "Cantidad del runway"), runwayAmount, setRunwayAmount, {
                keyboardType: "numeric",
                placeholder: "1",
              })}
            </View>
            <Text style={styles.label}>{t(language, "Runway unit", "Unidad del runway")}</Text>
            <View style={styles.optionRow}>
              {(["days", "weeks", "months", "years"] as RunwayUnit[]).map((unit) => (
                <Pressable
                  key={unit}
                  style={[styles.optionChip, runwayUnit === unit && styles.optionChipActive]}
                  onPress={() => setRunwayUnit(unit)}
                >
                  <Text style={[styles.optionChipText, runwayUnit === unit && styles.optionChipTextActive]}>
                    {unit === "days"
                      ? t(language, "Days", "Días")
                      : unit === "weeks"
                        ? t(language, "Weeks", "Semanas")
                        : unit === "months"
                          ? t(language, "Months", "Meses")
                          : t(language, "Years", "Años")}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.calculatedDate}>
              <Text style={styles.previewLabel}>{t(language, "Calculated target date", "Fecha objetivo calculada")}</Text>
              <Text style={styles.previewValue}>{targetDate}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t(language, "Operating model", "Modelo operativo")}</Text>
            <Text style={styles.label}>{t(language, "Return model", "Modelo de retorno")}</Text>
            <View style={styles.optionRow}>
              {(["conservative", "moderate", "aggressive", "manual"] as const).map((mode) => {
                const model = mode === "manual" ? null : getReturnModel(mode, businessProfile);
                return (
                  <Pressable
                    key={mode}
                    style={[styles.optionChip, returnModelMode === mode && styles.optionChipActive]}
                    onPress={() => selectReturnModel(mode)}
                  >
                    <Text style={[styles.optionChipText, returnModelMode === mode && styles.optionChipTextActive]}>
                      {mode === "conservative"
                        ? t(language, "Conservative", "Conservador")
                        : mode === "moderate"
                          ? t(language, "Moderate", "Moderado")
                          : mode === "aggressive"
                            ? t(language, "Aggressive", "Agresivo")
                            : t(language, "Manual", "Manual")}
                    </Text>
                    {model ? (
                      <Text style={styles.optionChipDetail}>
                        +{model.goal.toFixed(2)}% / -{model.loss.toFixed(2)}%
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.muted}>
              {returnModelMode && returnModelMode !== "manual"
                ? t(
                    language,
                    `${getReturnModel(returnModelMode, businessProfile).goal.toFixed(2)}% goal-day · ${getReturnModel(returnModelMode, businessProfile).loss.toFixed(2)}% expected losing-day`,
                    `${getReturnModel(returnModelMode, businessProfile).goal.toFixed(2)}% día-meta · ${getReturnModel(returnModelMode, businessProfile).loss.toFixed(2)}% día perdedor esperado`
                  )
                : t(
                    language,
                    "Manual inputs are still evaluated against the selected policy guardrails and execution evidence.",
                    "Los datos manuales se evalúan contra las reglas de la política seleccionada y la evidencia de ejecución."
                  )}
            </Text>
            <Text style={styles.label}>{t(language, "Primary instrument", "Instrumento principal")}</Text>
            <View style={styles.optionRow}>
              {(["stocks", "options", "futures", "forex", "crypto", "other"] as TradingInstrument[]).map((instrument) => (
                <Pressable
                  key={instrument}
                  style={[styles.optionChip, tradingInstrument === instrument && styles.optionChipActive]}
                  onPress={() => {
                    setTradingInstrument(instrument);
                    if (instrument !== "crypto" && parsePercent(averageTradingDaysPerWeek) > 5) {
                      setAverageTradingDaysPerWeek("5");
                    }
                  }}
                >
                  <Text style={[styles.optionChipText, tradingInstrument === instrument && styles.optionChipTextActive]}>
                    {instrument === "stocks"
                      ? t(language, "Stocks", "Acciones")
                      : instrument === "options"
                        ? t(language, "Options", "Opciones")
                        : instrument === "futures"
                          ? t(language, "Futures", "Futuros")
                          : instrument === "other"
                            ? t(language, "Other", "Otro")
                            : instrument.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.twoCol}>
              {renderField(t(language, "Trading days/week", "Días de trading/semana"), averageTradingDaysPerWeek, setAverageTradingDaysPerWeek, {
                keyboardType: "numeric",
                placeholder: "5",
              })}
              {renderField(t(language, "Planned loss days/week", "Días pérdida/semana"), lossDaysPerWeek, setLossDaysPerWeek, {
                keyboardType: "numeric",
                placeholder: "1",
              })}
            </View>
            <View style={styles.twoCol}>
              {renderField(t(language, "Max daily loss %", "Max pérdida diaria %"), maxDailyLossPercent, setMaxDailyLossPercent, {
                keyboardType: "numeric",
                placeholder: "2",
              })}
              {renderField(t(language, "Risk per trade %", "Riesgo por trade %"), maxRiskPerTradePercent, setMaxRiskPerTradePercent, {
                keyboardType: "numeric",
                placeholder: "1",
              })}
            </View>
            <View style={styles.twoCol}>
              {renderField(t(language, "Goal-day model %", "Modelo día-meta %"), operatingGoalDayPct, (value) => {
                setReturnModelMode("manual");
                setOperatingGoalDayPct(value);
              }, {
                keyboardType: "numeric",
                placeholder: "0.20",
                editable: !returnModelMode || returnModelMode === "manual",
              })}
              {renderField(t(language, "Expected loss-day %", "Pérdida esperada/día %"), expectedLossDayPct, (value) => {
                setReturnModelMode("manual");
                setExpectedLossDayPct(value);
              }, {
                keyboardType: "numeric",
                placeholder: "0.35",
                editable: !returnModelMode || returnModelMode === "manual",
              })}
            </View>
            {returnModelMode ? (
              <View style={styles.returnSummary}>
                <View style={styles.returnSummaryItem}>
                  <Text style={styles.previewLabel}>{t(language, "Modeled week", "Semana modelada")}</Text>
                  <Text style={styles.returnSummaryValue}>{declaredReturnSummary.weekly.toFixed(2)}%</Text>
                </View>
                <View style={styles.returnSummaryItem}>
                  <Text style={styles.previewLabel}>{t(language, "Modeled month", "Mes modelado")}</Text>
                  <Text style={styles.returnSummaryValue}>{declaredReturnSummary.monthly.toFixed(2)}%</Text>
                </View>
                <View style={styles.returnSummaryItem}>
                  <Text style={styles.previewLabel}>{t(language, "Modeled year", "Año modelado")}</Text>
                  <Text style={styles.returnSummaryValue}>{declaredReturnSummary.annual.toFixed(2)}%</Text>
                </View>
              </View>
            ) : null}
            <Text style={styles.muted}>
              {t(
                language,
                "Expected loss-day is the planning average. Max daily loss remains the hard stop.",
                "La pérdida esperada por día es el promedio de planificación. La pérdida diaria máxima sigue siendo el stop duro."
              )}
            </Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t(language, "Capital flows", "Flujos de capital")}</Text>
            <Text style={styles.muted}>
              {t(
                language,
                "Contributions and withdrawals affect the account balance, but they are reported separately from trading profit.",
                "Las aportaciones y los retiros afectan el balance, pero se reportan separados de la ganancia de trading."
              )}
            </Text>

            <View style={styles.flowBlock}>
              <Text style={styles.flowTitle}>{t(language, "Future contributions", "Aportaciones futuras")}</Text>
              <View style={styles.optionRow}>
                {(["none", "scheduled"] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    style={[styles.optionChip, plannedDepositMode === mode && styles.optionChipActive]}
                    onPress={() => setPlannedDepositMode(mode)}
                  >
                    <Text style={[styles.optionChipText, plannedDepositMode === mode && styles.optionChipTextActive]}>
                      {mode === "none" ? t(language, "None", "Ninguna") : t(language, "Scheduled", "Programada")}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {plannedDepositMode === "scheduled" ? (
                <>
                  <Text style={styles.label}>{t(language, "Frequency", "Frecuencia")}</Text>
                  <View style={styles.optionRow}>
                    {(["monthly", "quarterly", "semiannual"] as CapitalFlowFrequency[]).map((frequency) => (
                      <Pressable
                        key={frequency}
                        style={[styles.optionChip, plannedDepositFrequency === frequency && styles.optionChipActive]}
                        onPress={() => setPlannedDepositFrequency(frequency)}
                      >
                        <Text style={[styles.optionChipText, plannedDepositFrequency === frequency && styles.optionChipTextActive]}>
                          {frequency === "monthly"
                            ? t(language, "Monthly", "Mensual")
                            : frequency === "quarterly"
                              ? t(language, "Quarterly", "Trimestral")
                              : t(language, "Semiannual", "Semestral")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.twoCol}>
                    {renderField(t(language, "Contribution amount", "Monto de aportación"), plannedDepositAmount, (value) => setPlannedDepositAmount(formatMoneyDraft(value)), {
                      keyboardType: "numeric",
                      placeholder: "500.00",
                      onBlur: () => plannedDepositAmount && setPlannedDepositAmount(formatMoneyValue(plannedDepositAmount)),
                    })}
                    {renderField(t(language, "Start period", "Período inicial"), plannedDepositStartPeriod, setPlannedDepositStartPeriod, {
                      keyboardType: "numeric",
                      placeholder: "1",
                    })}
                  </View>
                </>
              ) : null}
            </View>

            <View style={styles.flowBlock}>
              <Text style={styles.flowTitle}>{t(language, "Planned withdrawals", "Retiros planificados")}</Text>
              <View style={styles.optionRow}>
                {(["none", "scheduled"] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    style={[styles.optionChip, plannedWithdrawalMode === mode && styles.optionChipActive]}
                    onPress={() => setPlannedWithdrawalMode(mode)}
                  >
                    <Text style={[styles.optionChipText, plannedWithdrawalMode === mode && styles.optionChipTextActive]}>
                      {mode === "none" ? t(language, "None", "Ninguno") : t(language, "Scheduled", "Programado")}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {plannedWithdrawalMode === "scheduled" ? (
                <>
                  <Text style={styles.label}>{t(language, "Frequency", "Frecuencia")}</Text>
                  <View style={styles.optionRow}>
                    {(["monthly", "quarterly", "semiannual"] as CapitalFlowFrequency[]).map((frequency) => (
                      <Pressable
                        key={frequency}
                        style={[styles.optionChip, plannedWithdrawalFrequency === frequency && styles.optionChipActive]}
                        onPress={() => setPlannedWithdrawalFrequency(frequency)}
                      >
                        <Text style={[styles.optionChipText, plannedWithdrawalFrequency === frequency && styles.optionChipTextActive]}>
                          {frequency === "monthly"
                            ? t(language, "Monthly", "Mensual")
                            : frequency === "quarterly"
                              ? t(language, "Quarterly", "Trimestral")
                              : t(language, "Semiannual", "Semestral")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.twoCol}>
                    {renderField(t(language, "Withdrawal amount", "Monto del retiro"), plannedWithdrawalAmount, (value) => setPlannedWithdrawalAmount(formatMoneyDraft(value)), {
                      keyboardType: "numeric",
                      placeholder: "500.00",
                      onBlur: () => plannedWithdrawalAmount && setPlannedWithdrawalAmount(formatMoneyValue(plannedWithdrawalAmount)),
                    })}
                    {renderField(t(language, "Start period", "Período inicial"), plannedWithdrawalStartPeriod, setPlannedWithdrawalStartPeriod, {
                      keyboardType: "numeric",
                      placeholder: "1",
                    })}
                  </View>
                </>
              ) : null}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t(language, "Strategy and rules", "Estrategia y reglas")}</Text>
            {renderField(t(language, "Primary strategy", "Estrategia principal"), strategyName, setStrategyName, {
              placeholder: t(language, "Example: Opening range pullback", "Ejemplo: Opening range pullback"),
            })}
            {renderField(t(language, "Strategy notes", "Notas de estrategia"), strategyNotes, setStrategyNotes, {
              multiline: true,
              placeholder: t(language, "Setup, market condition, invalidation, and management.", "Setup, condición de mercado, invalidación y manejo."),
            })}
            {renderField(t(language, "Do rules", "Reglas de hacer"), doRules, setDoRules, { multiline: true })}
            {renderField(t(language, "Do not rules", "Reglas de no hacer"), dontRules, setDontRules, { multiline: true })}
            {renderField(t(language, "Execution order", "Orden de ejecución"), orderRules, setOrderRules, { multiline: true })}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {savedMessage ? <Text style={styles.successText}>{savedMessage}</Text> : null}

          <Pressable
            style={[styles.evaluateButton, !canEvaluate && styles.buttonDisabled]}
            onPress={evaluatePlan}
            disabled={!canEvaluate}
          >
            <Text style={styles.evaluateButtonEyebrow}>
              {t(language, "DISCIPLINE CHECK", "EVALUACIÓN DE DISCIPLINA")}
            </Text>
            <Text style={styles.evaluateButtonText}>
              {previewing
                ? t(language, "Evaluating draft...", "Evaluando borrador...")
                : t(language, "Evaluate plan before saving", "Evaluar plan antes de guardar")}
            </Text>
          </Pressable>

          <View style={styles.actionRow}>
            <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => navigation.navigate("Tabs", { screen: "Dashboard" })}>
              <Text style={styles.secondaryButtonText}>{t(language, "View progress", "Ver progreso")}</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.primaryButton, !canSave && styles.buttonDisabled]} onPress={savePlan} disabled={!canSave}>
              <Text style={styles.primaryButtonText}>
                {saving ? t(language, "Saving...", "Guardando...") : t(language, "Save Business Plan", "Guardar Plan Empresarial")}
              </Text>
            </Pressable>
          </View>

          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>{t(language, "Plan reset", "Reset del plan")}</Text>
            <Text style={styles.dangerHint}>
              {t(
                language,
                "Use this only when you want to remove the current Business Plan and build a new one from zero.",
                "Usa esto solo cuando quieras eliminar el Plan Empresarial actual y crear uno nuevo desde cero."
              )}
            </Text>
            <Pressable
              style={[styles.dangerButton, resetting && styles.buttonDisabled]}
              onPress={resetPlan}
              disabled={resetting}
            >
              <Text style={styles.dangerButtonText}>
                {resetting ? t(language, "Resetting...", "Reseteando...") : t(language, "Reset plan", "Reset plan")}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    loadingCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      alignItems: "center",
      gap: 8,
    },
    muted: {
      color: colors.textMuted,
      fontSize: 12,
    },
    heroCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 10,
    },
    eyebrow: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 1.6,
      textTransform: "uppercase",
    },
    heroTitle: {
      color: colors.textPrimary,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "900",
    },
    heroBody: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    previewGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    previewCell: {
      width: "48%",
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      gap: 4,
    },
    previewLabel: {
      color: colors.textMuted,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 1.1,
      fontWeight: "800",
    },
    previewValue: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "900",
    },
    savedHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    savedStrong: {
      color: colors.primary,
      fontWeight: "900",
    },
    sectionCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 10,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "900",
    },
    twoCol: {
      flexDirection: "row",
      gap: 10,
    },
    field: {
      flex: 1,
      gap: 6,
    },
    label: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    input: {
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      color: colors.textPrimary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      fontWeight: "700",
    },
    inputMultiline: {
      minHeight: 92,
      lineHeight: 19,
      fontWeight: "600",
    },
    inputDisabled: {
      opacity: 0.58,
    },
    returnSummary: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    returnSummaryItem: {
      flexGrow: 1,
      minWidth: 96,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      gap: 4,
    },
    returnSummaryValue: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: "900",
    },
    flowBlock: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 10,
    },
    flowTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "900",
    },
    optionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    optionChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    optionChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
    },
    optionChipText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
    },
    optionChipTextActive: {
      color: colors.primary,
    },
    optionChipDetail: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: "700",
      marginTop: 2,
    },
    calculatedDate: {
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 4,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "700",
    },
    successText: {
      color: colors.success,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "800",
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "center",
    },
    evaluateButton: {
      minHeight: 64,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    evaluateButtonEyebrow: {
      color: colors.primary,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.6,
    },
    evaluateButtonText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "900",
      marginTop: 3,
    },
    button: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    dangerZone: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.dangerSoft,
      padding: 14,
      gap: 8,
    },
    dangerTitle: {
      color: colors.dangerText,
      fontSize: 15,
      fontWeight: "900",
    },
    dangerHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    dangerButton: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.dangerBorder,
      backgroundColor: colors.danger,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 46,
      paddingHorizontal: 12,
    },
    dangerButtonText: {
      color: "#FEE2E2",
      fontSize: 13,
      fontWeight: "900",
    },
    buttonDisabled: {
      opacity: 0.52,
    },
    primaryButtonText: {
      color: "#00130f",
      fontSize: 13,
      fontWeight: "900",
    },
    secondaryButtonText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "900",
    },
  });
