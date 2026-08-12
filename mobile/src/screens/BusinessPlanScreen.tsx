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
  runway?: {
    amount?: number;
    unit?: RunwayUnit;
    calendarKey?: string;
    calendarIsEstimate?: boolean;
  };
  steps?: any;
};

type TradingInstrument = "stocks" | "options" | "futures" | "forex" | "crypto" | "other";
type RunwayUnit = "days" | "weeks" | "months" | "years";

type MobileGrowthPlanResponse = {
  accountId?: string | null;
  plan?: MobileGrowthPlan | null;
  projection?: {
    requiredGoalPct?: number;
    tradingDays?: number;
    completionDate?: string | null;
    targetReached?: boolean;
  };
};

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
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [lastProjection, setLastProjection] = useState<MobileGrowthPlanResponse["projection"] | null>(null);

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
  const [strategyName, setStrategyName] = useState("");
  const [strategyNotes, setStrategyNotes] = useState("");
  const [doRules, setDoRules] = useState(DEFAULT_DO_RULES.join("\n"));
  const [dontRules, setDontRules] = useState(DEFAULT_DONT_RULES.join("\n"));
  const [orderRules, setOrderRules] = useState(DEFAULT_ORDER_RULES.join("\n"));

  const hydrateForm = useCallback(
    (plan: MobileGrowthPlan | null | undefined) => {
      if (!plan) {
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

  const canSave =
    preview.start > 0 &&
    preview.target > preview.start &&
    /^\d{4}-\d{2}-\d{2}$/.test(planStartDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(targetDate) &&
    dateDiffDays(planStartDate, targetDate) > 0 &&
    !saving &&
    !resetting;

  const savePlan = useCallback(async () => {
    if (!canSave) {
      setError(
        t(
          language,
          "Complete starting balance, target balance, start date, and target date before saving.",
          "Completa capital inicial, meta, fecha inicial y fecha meta antes de guardar."
        )
      );
      return;
    }

    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const response = await apiPost<MobileGrowthPlanResponse>("/api/growth-plan/mobile", {
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
        strategyName,
        strategyNotes,
        doRules,
        dontRules,
        orderRules,
      });
      setAccountId(response.accountId ?? accountId);
      hydrateForm(response.plan);
      setLastProjection(response.projection ?? null);
      setSavedMessage(
        t(
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
          "Your plan is active. Open the Business Center to review progress and checkpoints.",
          "Tu plan está activo. Abre el Centro Empresarial para revisar progreso y checkpoints."
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save Business Plan.");
    } finally {
      setSaving(false);
    }
  }, [
    accountId,
    averageTradingDaysPerWeek,
    canSave,
    doRules,
    dontRules,
    hydrateForm,
    language,
    lossDaysPerWeek,
    maxDailyLossPercent,
    maxRiskPerTradePercent,
    orderRules,
    planStartDate,
    preview.start,
    preview.target,
    strategyName,
    strategyNotes,
    targetDate,
    runwayAmount,
    runwayUnit,
    tradingInstrument,
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
        textAlignVertical={options?.multiline ? "top" : "center"}
        style={[styles.input, options?.multiline && styles.inputMultiline]}
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
                <Text style={styles.previewLabel}>{t(language, "Perfect path/session", "Trayectoria perfecta/sesión")}</Text>
                <Text style={styles.previewValue}>{preview.requiredPct.toFixed(2)}%</Text>
              </View>
              <View style={styles.previewCell}>
                <Text style={styles.previewLabel}>{t(language, "Gap", "Diferencia")}</Text>
                <Text style={styles.previewValue}>{formatCompactCurrency(preview.gap)}</Text>
              </View>
            </View>
            {lastProjection ? (
              <Text style={styles.savedHint}>
                {t(language, "Saved required goal-day:", "Meta diaria guardada:")}{" "}
                <Text style={styles.savedStrong}>{Number(lastProjection.requiredGoalPct ?? 0).toFixed(2)}%</Text>
                {" · "}
                {t(language, "Trading days:", "Días de trading:")}{" "}
                <Text style={styles.savedStrong}>{lastProjection.tradingDays ?? preview.operatingDays}</Text>
              </Text>
            ) : null}
          </View>

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
