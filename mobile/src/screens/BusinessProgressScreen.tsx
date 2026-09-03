import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";

const ACCOUNT_SERIES_PATH = "/api/account/series?seriesDays=180";
const DAY_MS = 24 * 60 * 60 * 1000;

type GrowthPlanSummary = {
  startingBalance?: number;
  targetBalance?: number;
  adjustedTargetBalance?: number;
  planStartIso?: string | null;
  targetDate?: string | null;
  planMode?: string | null;
  planPhases?: unknown;
  averageTradingDaysPerWeek?: number | null;
  tradingDays?: number | null;
  lossDaysPerWeek?: number | null;
};

type AccountSeriesResponse = {
  plan?: GrowthPlanSummary | null;
  totals?: {
    currentBalance?: number | null;
  } | null;
};

type NormalizedPhase = {
  id: string;
  title: string;
  targetEquity: number;
  targetDate: string | null;
  monthIndex: number | null;
  weekIndex: number | null;
  weeksInMonth: number | null;
  monthStartBalance: number | null;
  monthEndBalance: number | null;
};

type PeriodKey = "week" | "month" | "quarter" | "semiannual" | "annual";

type ProgressPeriod = {
  key: PeriodKey;
  title: string;
  periodLabel: string;
  startBalance: number;
  targetBalance: number;
  targetDate: string | null;
  progress: number;
  actualMove: number;
  requiredMove: number;
  gap: number;
};

type ProgressModel = {
  startBalance: number;
  targetBalance: number;
  currentBalance: number;
  targetDate: string | null;
  planMode: string;
  overallProgress: number;
  builtAmount: number;
  remainingAmount: number;
  daysRemaining: number | null;
  tradingDaysPerWeek: number;
  lossDaysPerWeek: number;
  activeCheckpoint: string;
  periods: ProgressPeriod[];
};

type BusinessProgressScreenProps = {
  onOpenBusinessPlan: () => void;
};

const POSITIVE_MESSAGES = {
  en: [
    "Consistency turns a plan into a business. Protect the process today.",
    "A disciplined session is progress, even before the P&L confirms it.",
    "Your edge grows when every decision has a reason and every result has a record.",
    "Small, repeatable actions build the equity curve you want.",
    "Today’s job is not to force profit; it is to execute the plan with precision.",
    "The strongest milestone is the next rule-followed session.",
    "Capital grows best when patience and risk control grow first.",
    "One clean decision at a time is how professional consistency is built.",
    "Measure the process, respect the limits, and let compounding do its work.",
    "Progress is staying aligned when the market invites you to improvise.",
    "A protected downside keeps tomorrow’s opportunity available.",
    "Your forecast is a compass; today’s execution is the next step.",
    "The goal becomes realistic when the daily behavior becomes repeatable.",
    "Professional growth is quiet: preparation, execution, review, repeat.",
    "Trade the opportunity in front of you, not the deadline in your head.",
    "A good business day is one where the system remained in control.",
    "Keep the risk defined and the learning continuous.",
    "The curve follows the habits. Strengthen the habit you need today.",
    "Patience is productive when it protects your highest-quality setups.",
    "Every documented session makes the next decision more intelligent.",
    "You do not need a perfect day; you need an honest, controlled one.",
    "Focus on the checkpoint you can influence with today’s decisions.",
    "Repeatable discipline is more valuable than one exceptional result.",
    "The plan gives direction; your execution gives it credibility.",
    "Stay selective. Preserved capital is working capital.",
    "A calm process creates room for better decisions.",
    "Review without judgment, adjust with evidence, execute with clarity.",
    "Your next milestone begins with respecting today’s guardrails.",
    "Let data shape the adjustment and discipline carry it forward.",
    "Build the business at a pace your process can actually support.",
    "Finish today with a record you can learn from tomorrow.",
  ],
  es: [
    "La consistencia convierte un plan en un negocio. Protege el proceso hoy.",
    "Una sesión disciplinada es progreso, incluso antes de que el P&L lo confirme.",
    "Tu ventaja crece cuando cada decisión tiene una razón y cada resultado queda registrado.",
    "Las acciones pequeñas y repetibles construyen la curva de equity que buscas.",
    "El trabajo de hoy no es forzar ganancias; es ejecutar el plan con precisión.",
    "El milestone más fuerte es la próxima sesión respetando las reglas.",
    "El capital crece mejor cuando primero crecen la paciencia y el control de riesgo.",
    "Una decisión limpia a la vez construye consistencia profesional.",
    "Mide el proceso, respeta los límites y deja que la capitalización haga su trabajo.",
    "Progresar es mantenerte alineado cuando el mercado invita a improvisar.",
    "Proteger el downside mantiene disponible la oportunidad de mañana.",
    "Tu forecast es la brújula; la ejecución de hoy es el próximo paso.",
    "La meta se vuelve realista cuando la conducta diaria se vuelve repetible.",
    "El crecimiento profesional es silencioso: preparar, ejecutar, revisar y repetir.",
    "Opera la oportunidad frente a ti, no la fecha límite dentro de tu cabeza.",
    "Un buen día de negocio es aquel en que el sistema mantuvo el control.",
    "Mantén el riesgo definido y el aprendizaje continuo.",
    "La curva sigue a los hábitos. Fortalece hoy el hábito que necesitas.",
    "La paciencia es productiva cuando protege tus setups de mayor calidad.",
    "Cada sesión documentada hace más inteligente la próxima decisión.",
    "No necesitas un día perfecto; necesitas uno honesto y controlado.",
    "Enfócate en el checkpoint que puedes influir con las decisiones de hoy.",
    "La disciplina repetible vale más que un solo resultado excepcional.",
    "El plan da dirección; tu ejecución le da credibilidad.",
    "Sé selectivo. El capital preservado es capital de trabajo.",
    "Un proceso calmado crea espacio para mejores decisiones.",
    "Revisa sin juzgar, ajusta con evidencia y ejecuta con claridad.",
    "Tu próximo milestone comienza respetando los límites de hoy.",
    "Deja que los datos definan el ajuste y la disciplina lo sostenga.",
    "Construye el negocio al ritmo que tu proceso realmente puede sostener.",
    "Termina hoy con un registro del que puedas aprender mañana.",
  ],
} as const;

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function signedCurrency(value: number): string {
  const amount = currency(Math.abs(value));
  if (Math.abs(value) < 0.005) return amount;
  return `${value > 0 ? "+" : "−"}${amount}`;
}

function parseDate(value: unknown): Date | null {
  const iso = typeof value === "string" ? value.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 12);
}

function clampDate(date: Date, min: Date, max: Date): Date {
  if (date < min) return min;
  if (date > max) return max;
  return date;
}

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0, 12);
  return Math.floor((date.getTime() - start.getTime()) / DAY_MS);
}

function dailyMessage(language: "en" | "es", date = new Date()): string {
  const messages = POSITIVE_MESSAGES[language];
  return messages[(dayOfYear(date) - 1 + messages.length) % messages.length]!;
}

function normalizePhases(raw: unknown): NormalizedPhase[] {
  return (Array.isArray(raw) ? raw : [])
    .map((item: any, index): NormalizedPhase => ({
      id: String(item?.id ?? `phase-${index + 1}`),
      title: String(item?.title ?? "").trim(),
      targetEquity: Number(item?.targetEquity ?? 0),
      targetDate: parseDate(item?.targetDate) ? String(item.targetDate).slice(0, 10) : null,
      monthIndex: Number.isFinite(Number(item?.monthIndex)) ? Number(item.monthIndex) : null,
      weekIndex: Number.isFinite(Number(item?.weekIndex)) ? Number(item.weekIndex) : null,
      weeksInMonth: Number.isFinite(Number(item?.weeksInMonth)) ? Number(item.weeksInMonth) : null,
      monthStartBalance: Number.isFinite(Number(item?.monthStartBalance)) ? Number(item.monthStartBalance) : null,
      monthEndBalance: Number.isFinite(Number(item?.monthEndBalance)) ? Number(item.monthEndBalance) : null,
    }))
    .filter((phase) => phase.targetEquity > 0)
    .sort((a, b) => String(a.targetDate ?? "9999-12-31").localeCompare(String(b.targetDate ?? "9999-12-31")));
}

function periodBounds(key: PeriodKey, anchor: Date): { start: Date; end: Date; label: string } {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  if (key === "week") {
    const weekday = anchor.getDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const start = addDays(anchor, mondayOffset);
    return { start, end: addDays(start, 4), label: toIso(start) };
  }
  if (key === "month") {
    return {
      start: new Date(year, month, 1, 12),
      end: new Date(year, month + 1, 0, 12),
      label: String(month + 1),
    };
  }
  if (key === "quarter") {
    const firstMonth = Math.floor(month / 3) * 3;
    return {
      start: new Date(year, firstMonth, 1, 12),
      end: new Date(year, firstMonth + 3, 0, 12),
      label: String(Math.floor(month / 3) + 1),
    };
  }
  if (key === "semiannual") {
    const firstMonth = month < 6 ? 0 : 6;
    return {
      start: new Date(year, firstMonth, 1, 12),
      end: new Date(year, firstMonth + 6, 0, 12),
      label: String(firstMonth === 0 ? 1 : 2),
    };
  }
  return {
    start: new Date(year, 0, 1, 12),
    end: new Date(year, 11, 31, 12),
    label: String(year),
  };
}

function projectedBalanceAt(params: {
  startBalance: number;
  targetBalance: number;
  startDate: Date;
  targetDate: Date;
  at: Date;
  phases: NormalizedPhase[];
}): number {
  const { startBalance, targetBalance, startDate, targetDate, phases } = params;
  const bounded = clampDate(params.at, startDate, targetDate);
  const datedPhases = phases.filter((phase) => phase.targetDate && parseDate(phase.targetDate));
  const points = [
    { date: startDate, balance: startBalance },
    ...datedPhases.map((phase) => ({ date: parseDate(phase.targetDate)!, balance: phase.targetEquity })),
    { date: targetDate, balance: targetBalance },
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let previous = points[0]!;
  for (const point of points.slice(1)) {
    if (bounded <= point.date) {
      const span = Math.max(DAY_MS, point.date.getTime() - previous.date.getTime());
      const fraction = Math.max(0, Math.min(1, (bounded.getTime() - previous.date.getTime()) / span));
      if (previous.balance > 0 && point.balance > 0) {
        return previous.balance * Math.pow(point.balance / previous.balance, fraction);
      }
      return previous.balance + (point.balance - previous.balance) * fraction;
    }
    previous = point;
  }
  return targetBalance;
}

function buildProgressModel(response: AccountSeriesResponse, language: "en" | "es", today = new Date()): ProgressModel | null {
  const plan = response.plan;
  if (!plan) return null;

  const startBalance = Number(plan.startingBalance ?? 0);
  const targetBalance = Number(plan.adjustedTargetBalance ?? plan.targetBalance ?? 0);
  const currentBalance = Number(response.totals?.currentBalance ?? 0);
  if (!(startBalance > 0) || !(targetBalance > 0)) return null;

  const fallbackStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const startDate = parseDate(plan.planStartIso) ?? fallbackStart;
  let targetDate = parseDate(plan.targetDate);
  if (!targetDate || targetDate <= startDate) targetDate = addDays(startDate, 365);
  const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const activeDate = clampDate(todayDate, startDate, targetDate);
  const phases = normalizePhases(plan.planPhases);
  const structured = phases.filter(
    (phase) => phase.monthIndex && phase.weekIndex && phase.weeksInMonth && phase.targetDate
  );
  const activePhase =
    structured.find((phase) => String(phase.targetDate) >= toIso(activeDate)) ??
    structured[structured.length - 1] ??
    phases.find((phase) => phase.targetEquity > currentBalance) ??
    phases[phases.length - 1] ??
    null;

  const titles: Record<PeriodKey, string> = {
    week: t(language, "Weekly milestone", "Milestone semanal"),
    month: t(language, "Monthly milestone", "Milestone mensual"),
    quarter: t(language, "Quarterly milestone", "Milestone trimestral"),
    semiannual: t(language, "Semiannual milestone", "Milestone semestral"),
    annual: t(language, "Annual milestone", "Milestone anual"),
  };

  const keys: PeriodKey[] = ["week", "month", "quarter", "semiannual", "annual"];
  const periods = keys.map((key): ProgressPeriod => {
    const bounds = periodBounds(key, activeDate);
    const periodStart = clampDate(bounds.start, startDate, targetDate);
    const periodEnd = clampDate(bounds.end, startDate, targetDate);
    const projectedStart = projectedBalanceAt({ startBalance, targetBalance, startDate, targetDate, at: periodStart, phases });
    let projectedTarget = projectedBalanceAt({ startBalance, targetBalance, startDate, targetDate, at: periodEnd, phases });
    let checkpointDate = toIso(periodEnd);

    if (key === "week" && activePhase?.targetDate) {
      projectedTarget = activePhase.targetEquity;
      checkpointDate = activePhase.targetDate;
    }

    const requiredMove = Math.max(0, projectedTarget - projectedStart);
    const actualMove = currentBalance - projectedStart;
    const progress = requiredMove > 0 ? Math.max(0, Math.min(1.5, actualMove / requiredMove)) : currentBalance >= projectedTarget ? 1 : 0;
    const prefix =
      key === "week"
        ? t(language, "Week of", "Semana del")
        : key === "month"
          ? t(language, "Month", "Mes")
          : key === "quarter"
            ? t(language, "Quarter", "Trimestre")
            : key === "semiannual"
              ? t(language, "Half", "Semestre")
              : t(language, "Year", "Año");

    return {
      key,
      title: titles[key],
      periodLabel: `${prefix} ${bounds.label}`,
      startBalance: projectedStart,
      targetBalance: projectedTarget,
      targetDate: checkpointDate,
      progress,
      actualMove,
      requiredMove,
      gap: currentBalance - projectedTarget,
    };
  });

  const goalAmount = Math.max(0, targetBalance - startBalance);
  const builtAmount = currentBalance - startBalance;
  const deadlineDays = Math.ceil((targetDate.getTime() - todayDate.getTime()) / DAY_MS);
  const activeCheckpoint = activePhase
    ? activePhase.title ||
      t(
        language,
        `Month ${activePhase.monthIndex ?? "—"} · Week ${activePhase.weekIndex ?? "—"}`,
        `Mes ${activePhase.monthIndex ?? "—"} · Semana ${activePhase.weekIndex ?? "—"}`
      )
    : t(language, "Calculated forecast path", "Ruta calculada del forecast");

  return {
    startBalance,
    targetBalance,
    currentBalance,
    targetDate: toIso(targetDate),
    planMode: String(plan.planMode ?? "auto"),
    overallProgress: goalAmount > 0 ? Math.max(0, Math.min(1.25, builtAmount / goalAmount)) : currentBalance >= targetBalance ? 1 : 0,
    builtAmount,
    remainingAmount: Math.max(0, targetBalance - currentBalance),
    daysRemaining: deadlineDays,
    tradingDaysPerWeek: Math.max(1, Math.min(7, Math.round(Number(plan.averageTradingDaysPerWeek ?? plan.tradingDays ?? 5) || 5))),
    lossDaysPerWeek: Math.max(0, Math.round(Number(plan.lossDaysPerWeek ?? 0) || 0)),
    activeCheckpoint,
    periods,
  };
}

export function BusinessProgressScreen({ onOpenBusinessPlan }: BusinessProgressScreenProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors, width), [colors, width]);
  const [response, setResponse] = useState<AccountSeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      setResponse(await apiGet<AccountSeriesResponse>(ACCOUNT_SERIES_PATH));
    } catch (err: any) {
      setError(err?.message ?? t(language, "Could not load business progress.", "No se pudo cargar el progreso del negocio."));
    } finally {
      if (refresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const locale = language === "es" ? "es" : "en";
  const model = useMemo(() => (response ? buildProgressModel(response, locale) : null), [locale, response]);
  const message = useMemo(() => dailyMessage(locale), [locale]);

  return (
    <ScreenScaffold
      title={t(language, "Business Progress", "Progreso del negocio")}
      subtitle={t(
        language,
        "Your mathematical forecast compared with actual account results across every operating horizon.",
        "Tu forecast matemático comparado con los resultados reales de la cuenta en cada horizonte operativo."
      )}
      refreshing={refreshing}
      onRefresh={() => load(true)}
      contentPadding={width >= 768 ? 24 : 16}
    >
      <View style={styles.messageCard}>
        <Text style={styles.messageEyebrow}>{t(language, "Today’s perspective", "Perspectiva de hoy")}</Text>
        <Text style={styles.messageText}>{message}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>{t(language, "Calculating progress…", "Calculando el progreso…")}</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyCard}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.button} onPress={() => load(false)}>
            <Text style={styles.buttonText}>{t(language, "Try again", "Intentar de nuevo")}</Text>
          </Pressable>
        </View>
      ) : !model ? (
        <View style={styles.emptyCard}>
          <Text style={styles.sectionTitle}>{t(language, "Create your business forecast", "Crea tu forecast empresarial")}</Text>
          <Text style={styles.muted}>
            {t(
              language,
              "Complete the Trading Business Plan to generate weekly, monthly, quarterly, semiannual, and annual milestones.",
              "Completa el Plan de Empresa de Trading para generar milestones semanales, mensuales, trimestrales, semestrales y anuales."
            )}
          </Text>
          <Pressable style={styles.button} onPress={onOpenBusinessPlan}>
            <Text style={styles.buttonText}>{t(language, "Open business plan", "Abrir plan empresarial")}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View style={styles.flexOne}>
                <Text style={styles.eyebrow}>{t(language, "Full business target", "Meta total del negocio")}</Text>
                <Text style={styles.heroValue}>{currency(model.startBalance)} → {currency(model.targetBalance)}</Text>
                <Text style={styles.muted}>
                  {t(language, "Target date", "Fecha meta")} {model.targetDate ?? "—"} · {model.planMode === "manual" ? t(language, "Manual model", "Modelo manual") : t(language, "Guided model", "Modelo guiado")}
                </Text>
              </View>
              <View style={styles.percentPill}>
                <Text style={styles.percentValue}>{(model.overallProgress * 100).toFixed(0)}%</Text>
                <Text style={styles.percentLabel}>{t(language, "complete", "completado")}</Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, model.overallProgress * 100)}%` }]} />
            </View>

            <View style={styles.metricGrid}>
              <Metric label={t(language, "Actual balance", "Balance real")} value={currency(model.currentBalance)} styles={styles} />
              <Metric label={t(language, "Built so far", "Construido")} value={signedCurrency(model.builtAmount)} styles={styles} positive={model.builtAmount >= 0} />
              <Metric label={t(language, "Remaining", "Falta")} value={currency(model.remainingAmount)} styles={styles} warning />
              <Metric label={t(language, "Time remaining", "Tiempo restante")} value={model.daysRemaining == null ? "—" : model.daysRemaining >= 0 ? `${model.daysRemaining}d` : t(language, "Past due", "Vencido")} styles={styles} />
            </View>

            <Text style={styles.operatingLine}>
              {model.tradingDaysPerWeek} {t(language, "trading days/week", "días de trading/semana")} · {model.lossDaysPerWeek} {t(language, "planned losing days/week", "días perdedores planificados/semana")}
            </Text>
          </View>

          <View style={styles.checkpointHeaderCard}>
            <Text style={styles.eyebrow}>{t(language, "Active checkpoint", "Checkpoint activo")}</Text>
            <Text style={styles.sectionTitle}>{model.activeCheckpoint}</Text>
            <Text style={styles.muted}>
              {t(
                language,
                "Each dollar target is the forecast budget. The actual balance is measured against it below.",
                "Cada meta en dólares es el budget del forecast. El balance real se compara contra ella abajo."
              )}
            </Text>
          </View>

          <View style={styles.periodGrid}>
            {model.periods.map((period) => (
              <View key={period.key} style={styles.periodCard}>
                <View style={styles.periodHeader}>
                  <View style={styles.flexOne}>
                    <Text style={styles.periodTitle}>{period.title}</Text>
                    <Text style={styles.periodLabel}>{period.periodLabel}</Text>
                  </View>
                  <Text style={styles.periodDate}>{t(language, "By", "Para")} {period.targetDate ?? "—"}</Text>
                </View>

                <Text style={[styles.gapValue, period.gap >= 0 ? styles.positive : styles.warning]}>
                  {period.gap >= 0 ? t(language, "Ahead by", "Adelantado por") : t(language, "Remaining", "Falta")} {currency(Math.abs(period.gap))}
                </Text>

                <View style={styles.forecastRows}>
                  <ForecastRow label={t(language, "Forecast start", "Inicio forecast")} value={currency(period.startBalance)} styles={styles} />
                  <ForecastRow label={t(language, "Forecast target", "Meta forecast")} value={currency(period.targetBalance)} styles={styles} />
                  <ForecastRow label={t(language, "Actual balance", "Balance real")} value={currency(model.currentBalance)} styles={styles} />
                  <ForecastRow label={t(language, "Required move", "Movimiento requerido")} value={currency(period.requiredMove)} styles={styles} />
                  <ForecastRow label={t(language, "Actual move", "Movimiento real")} value={signedCurrency(period.actualMove)} styles={styles} />
                </View>

                <View style={styles.progressTrack}>
                  <View style={[styles.periodProgressFill, { width: `${Math.min(100, period.progress * 100)}%` }]} />
                </View>
                <Text style={styles.progressCaption}>{(period.progress * 100).toFixed(0)}% {t(language, "of this milestone", "de este milestone")}</Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.secondaryButton} onPress={onOpenBusinessPlan}>
            <Text style={styles.secondaryButtonText}>{t(language, "Review Trading Business Plan", "Revisar Plan de Empresa de Trading")}</Text>
          </Pressable>
        </>
      )}
    </ScreenScaffold>
  );
}

function Metric({
  label,
  value,
  positive,
  warning,
  styles,
}: {
  label: string;
  value: string;
  positive?: boolean;
  warning?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, positive && styles.positive, warning && styles.warning]}>{value}</Text>
    </View>
  );
}

function ForecastRow({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.forecastRow}>
      <Text style={styles.forecastLabel}>{label}</Text>
      <Text style={styles.forecastValue}>{value}</Text>
    </View>
  );
}

const createStyles = (colors: ThemeColors, width: number) => {
  const twoColumns = width >= 760;
  return StyleSheet.create({
    messageCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
      padding: 16,
      gap: 7,
    },
    messageEyebrow: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.7,
      textTransform: "uppercase",
    },
    messageText: {
      color: colors.textPrimary,
      fontSize: 16,
      lineHeight: 23,
      fontWeight: "700",
    },
    loadingCard: {
      minHeight: 150,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    emptyCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 18,
      gap: 12,
    },
    error: {
      color: colors.dangerText,
      fontSize: 13,
      lineHeight: 19,
    },
    button: {
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-start",
    },
    buttonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: "900",
    },
    heroCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 14,
    },
    heroHeader: {
      flexDirection: "row",
      gap: 12,
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    flexOne: { flex: 1 },
    eyebrow: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.5,
      textTransform: "uppercase",
      marginBottom: 5,
    },
    heroValue: {
      color: colors.textPrimary,
      fontSize: twoColumns ? 24 : 19,
      fontWeight: "900",
      marginBottom: 5,
    },
    muted: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    percentPill: {
      minWidth: 90,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      alignItems: "center",
    },
    percentValue: {
      color: colors.success,
      fontSize: 22,
      fontWeight: "900",
    },
    percentLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: "800",
      textTransform: "uppercase",
    },
    progressTrack: {
      height: 8,
      borderRadius: 999,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    periodProgressFill: {
      height: "100%",
      borderRadius: 999,
      backgroundColor: colors.info,
    },
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    metricCard: {
      width: twoColumns ? "48.7%" : "100%",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 11,
      gap: 5,
    },
    metricLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    metricValue: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "900",
    },
    positive: { color: colors.success },
    warning: { color: colors.warning },
    operatingLine: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "700",
    },
    checkpointHeaderCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 15,
      gap: 4,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "900",
    },
    periodGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      alignItems: "flex-start",
    },
    periodCard: {
      width: twoColumns ? "48.8%" : "100%",
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 11,
    },
    periodHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10,
    },
    periodTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "900",
    },
    periodLabel: {
      color: colors.textMuted,
      fontSize: 10,
      marginTop: 3,
    },
    periodDate: {
      color: colors.info,
      fontSize: 10,
      fontWeight: "800",
    },
    gapValue: {
      fontSize: 17,
      fontWeight: "900",
    },
    forecastRows: { gap: 7 },
    forecastRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
    },
    forecastLabel: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 11,
    },
    forecastValue: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
    progressCaption: {
      color: colors.textMuted,
      fontSize: 10,
      textAlign: "right",
    },
    secondaryButton: {
      minHeight: 46,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
    },
    secondaryButtonText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "900",
    },
  });
};
