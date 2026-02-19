import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";
import { parseNotes, type TradesPayload, type StoredTradeRow } from "../lib/journalNotes";

type DashboardScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

type SeriesPoint = { date: string; value: number };

type AccountSeriesResponse = {
  plan?: {
    startingBalance: number;
    targetBalance: number;
    dailyTargetPct?: number;
    planStartIso?: string;
  };
  totals: { tradingPnl: number; cashflowNet: number; currentBalance: number };
  daily: SeriesPoint[];
};

type JournalEntry = {
  date?: string | null;
  notes?: string | null;
};

type JournalListResponse = {
  entries: JournalEntry[];
};

const WEB_PLAN_SUMMARY_URL = "https://www.neurotrader-journal.com/performance/plan-summary";

export function DashboardScreen({ onOpenModule }: DashboardScreenProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<AccountSeriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [seriesRes] = await Promise.all([
          apiGet<AccountSeriesResponse>("/api/account/series"),
        ]);
        if (!active) return;
        setSeries(seriesRes ?? null);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load data.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadJournalEntries() {
      try {
        setJournalLoading(true);
        const today = new Date();
        const toDate = today.toISOString().slice(0, 10);
        const from = new Date(today);
        from.setDate(today.getDate() - 45);
        const fromDate = from.toISOString().slice(0, 10);
        const res = await apiGet<JournalListResponse>(
          `/api/journal/list?fromDate=${fromDate}&toDate=${toDate}`
        );
        if (!active) return;
        const entries = res?.entries ?? [];
        setJournalEntries(entries);

        const availableDates = entries
          .map((entry) => String(entry?.date ?? "").slice(0, 10))
          .filter((value) => value.length === 10)
          .sort();

        const todayStr = today.toISOString().slice(0, 10);
        if (!selectedDate || !availableDates.includes(selectedDate)) {
          if (availableDates.includes(todayStr)) {
            setSelectedDate(todayStr);
          } else {
            setSelectedDate(availableDates[availableDates.length - 1] ?? null);
          }
        }
      } catch {
        if (!active) return;
        setJournalEntries([]);
      } finally {
        if (!active) return;
        setJournalLoading(false);
      }
    }

    loadJournalEntries();
    return () => {
      active = false;
    };
  }, []);

  const dailyMap = useMemo(() => new Map(series?.daily?.map((d) => [d.date, d.value]) ?? []), [series]);

  const weeklySummary = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // Sunday = 0
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    sunday.setHours(0, 0, 0, 0);
    const friday = new Date(sunday);
    friday.setDate(sunday.getDate() + 5);

    const days = Array.from({ length: 6 }, (_, idx) => {
      const date = new Date(sunday);
      date.setDate(sunday.getDate() + idx);
      const iso = date.toISOString().slice(0, 10);
      const pnl = dailyMap.has(iso) ? Number(dailyMap.get(iso)) || 0 : null;
      return { iso, pnl };
    });

    const total = days.reduce((acc, day) => acc + (day.pnl ?? 0), 0);
    return { total, days };
  }, [dailyMap]);

  const daySummaryDates = useMemo(() => {
    const dates = journalEntries
      .map((entry) => String(entry?.date ?? "").slice(0, 10))
      .filter((value) => value.length === 10)
      .sort();
    return dates;
  }, [journalEntries]);

  const selectedEntry = selectedDate
    ? journalEntries.find((entry) => String(entry?.date ?? "").slice(0, 10) === selectedDate) ?? null
    : null;
  const selectedNotes: TradesPayload = parseNotes(selectedEntry?.notes ?? null);
  const premarketText = String(selectedNotes?.premarket ?? "").trim();
  const insideText = String(selectedNotes?.live ?? "").trim();
  const afterText = String(selectedNotes?.post ?? "").trim();
  const entryRows: StoredTradeRow[] = Array.isArray(selectedNotes?.entries) ? selectedNotes.entries : [];
  const exitRows: StoredTradeRow[] = Array.isArray(selectedNotes?.exits) ? selectedNotes.exits : [];

  const daySummaryIndex = selectedDate ? daySummaryDates.indexOf(selectedDate) : -1;
  const prevSummaryDate = daySummaryIndex > 0 ? daySummaryDates[daySummaryIndex - 1] : null;
  const nextSummaryDate =
    daySummaryIndex >= 0 && daySummaryIndex < daySummaryDates.length - 1
      ? daySummaryDates[daySummaryIndex + 1]
      : null;

  const formatUsd = (value: number) =>
    new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);

  const formatSigned = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}${formatUsd(Math.abs(value))}`;
  };

  const formatSignedShort = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}$${Math.abs(value).toFixed(0)}`;
  };

  const planProgress = useMemo(() => {
    const plan = series?.plan;
    const totals = series?.totals;
    if (!plan || !totals) return null;
    const start = Number(plan.startingBalance ?? 0);
    const target = Number(plan.targetBalance ?? 0);
    const current = Number(totals.currentBalance ?? 0);
    if (!Number.isFinite(start) || !Number.isFinite(target) || target === start) return null;
    const progress = ((current - start) / (target - start)) * 100;
    return {
      start,
      target,
      current,
      progress,
    };
  }, [series]);

  return (
    <ScreenScaffold
      title={t(language, "Dashboard", "Dashboard")}
      subtitle={t(
        language,
        "Your daily overview: progress, streaks, and key actions.",
        "Tu resumen diario: progreso, rachas y acciones clave."
      )}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading data…", "Cargando datos…")}</Text>
        </View>
      ) : (
        <>
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.weeklyCard]}>
              <Text style={styles.summaryLabel}>{t(language, "Weekly P&L", "P&L semanal")}</Text>
              <Text style={styles.summaryValue}>{formatSigned(weeklySummary.total)}</Text>
              <Text style={styles.summaryHint}>
                {t(language, "Current trading week (Sun–Fri).", "Semana actual de trading (Dom–Vie).")}
              </Text>
              <View style={styles.weeklyRow}>
                {weeklySummary.days.map((day, idx) => {
                  const isPositive = day.pnl != null && day.pnl > 0;
                  const isNegative = day.pnl != null && day.pnl < 0;
                  return (
                    <View
                      key={`weekly-${day.iso}-${idx}`}
                      style={[
                        styles.weekCell,
                        isPositive && styles.weekCellWin,
                        isNegative && styles.weekCellLoss,
                        day.pnl === 0 && styles.weekCellFlat,
                      ]}
                    >
                      <Text style={styles.weekCellLabel}>
                        {language === "es" ? ["D", "L", "M", "X", "J", "V"][idx] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][idx]}
                      </Text>
                      <Text style={styles.weekCellValue}>
                        {day.pnl == null ? "—" : day.pnl === 0 ? "$0" : formatSignedShort(day.pnl)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
            <Pressable
              style={[styles.summaryCard, styles.planCard]}
              onPress={() => Linking.openURL(WEB_PLAN_SUMMARY_URL)}
            >
              <Text style={styles.planLabel}>{t(language, "Plan progress", "Progreso del plan")}</Text>
              <Text style={styles.planValue}>
                {planProgress ? `${planProgress.progress.toFixed(1)}%` : "—"}
              </Text>
              <Text style={styles.planHint}>
                {planProgress
                  ? t(
                      language,
                      `Start ${formatUsd(planProgress.start)} → Target ${formatUsd(planProgress.target)}`,
                      `Inicio ${formatUsd(planProgress.start)} → Meta ${formatUsd(planProgress.target)}`
                    )
                  : t(language, "Set a growth plan to track progress.", "Configura tu plan para ver progreso.")}
              </Text>
              <Text style={styles.planLink}>
                {t(language, "Open plan phases →", "Ver fases del plan →")}
              </Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </>
      )}

      <View style={styles.daySummaryCard}>
        <View style={styles.daySummaryHeader}>
          <View>
            <Text style={styles.daySummaryEyebrow}>{t(language, "Day summary", "Resumen del día")}</Text>
            <Text style={styles.daySummaryTitle}>
              {selectedDate ?? t(language, "Select a day", "Selecciona un día")}
            </Text>
          </View>
          <View style={styles.daySummaryNav}>
            <Pressable
              style={[styles.dayNavButton, !prevSummaryDate && styles.dayNavDisabled]}
              onPress={() => prevSummaryDate && setSelectedDate(prevSummaryDate)}
              disabled={!prevSummaryDate}
            >
              <Text style={styles.dayNavText}>‹</Text>
            </Pressable>
            <Pressable
              style={[styles.dayNavButton, !nextSummaryDate && styles.dayNavDisabled]}
              onPress={() => nextSummaryDate && setSelectedDate(nextSummaryDate)}
              disabled={!nextSummaryDate}
            >
              <Text style={styles.dayNavText}>›</Text>
            </Pressable>
          </View>
        </View>

        {!selectedDate ? (
          <Text style={styles.daySummaryHint}>
            {t(
              language,
              "No journal days found in the last 45 days.",
              "No hay días de journal en los últimos 45 días."
            )}
          </Text>
        ) : (
          <>
            <View style={styles.daySummaryRow}>
              <View style={styles.daySummaryNote}>
                <Text style={styles.daySummaryLabel}>{t(language, "Premarket", "Premarket")}</Text>
                <Text style={styles.daySummaryBody}>
                  {premarketText ? premarketText.slice(0, 160) : t(language, "No notes.", "Sin notas.")}
                </Text>
              </View>
              <View style={styles.daySummaryNote}>
                <Text style={styles.daySummaryLabel}>{t(language, "Inside trade", "Inside trade")}</Text>
                <Text style={styles.daySummaryBody}>
                  {insideText ? insideText.slice(0, 160) : t(language, "No notes.", "Sin notas.")}
                </Text>
              </View>
            </View>
            <View style={styles.daySummaryRow}>
              <View style={styles.daySummaryNote}>
                <Text style={styles.daySummaryLabel}>{t(language, "After trade", "After trade")}</Text>
                <Text style={styles.daySummaryBody}>
                  {afterText ? afterText.slice(0, 160) : t(language, "No notes.", "Sin notas.")}
                </Text>
              </View>
            </View>
            <View style={styles.daySummaryTrades}>
              <View style={styles.daySummaryTradeCard}>
                <Text style={styles.daySummaryLabel}>{t(language, "Entries", "Entradas")}</Text>
                {entryRows.length ? (
                  entryRows.slice(0, 5).map((row, idx) => (
                    <Text key={`entry-${idx}`} style={styles.daySummaryBody}>
                      {row.symbol} · {row.side ?? "—"} · {row.quantity ?? "—"} @ {row.price ?? "—"}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.daySummaryBody}>{t(language, "No entries logged.", "Sin entradas.")}</Text>
                )}
              </View>
              <View style={styles.daySummaryTradeCard}>
                <Text style={styles.daySummaryLabel}>{t(language, "Exits", "Salidas")}</Text>
                {exitRows.length ? (
                  exitRows.slice(0, 5).map((row, idx) => (
                    <Text key={`exit-${idx}`} style={styles.daySummaryBody}>
                      {row.symbol} · {row.side ?? "—"} · {row.quantity ?? "—"} @ {row.price ?? "—"}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.daySummaryBody}>{t(language, "No exits logged.", "Sin salidas.")}</Text>
                )}
              </View>
            </View>
          </>
        )}
        {journalLoading ? (
          <Text style={styles.loadingText}>{t(language, "Syncing journal…", "Sincronizando journal…")}</Text>
        ) : null}
      </View>

    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    summaryRow: {
      flexDirection: "row",
      gap: 10,
      alignItems: "stretch",
    },
    summaryCard: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 4,
    },
    weeklyCard: {
      flex: 1.15,
    },
    planCard: {
      flex: 0.85,
      justifyContent: "space-between",
    },
    summaryLabel: {
      color: colors.textMuted,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    summaryValue: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    summaryHint: {
      color: colors.textMuted,
      fontSize: 12,
    },
    planLabel: {
      color: colors.textMuted,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    planValue: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700",
    },
    planHint: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    planLink: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "700",
      marginTop: 6,
    },
    weeklyRow: {
      marginTop: 8,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    weekCell: {
      flexBasis: "31%",
      minWidth: 86,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 8,
      paddingHorizontal: 8,
      gap: 4,
      alignItems: "center",
      justifyContent: "center",
      aspectRatio: 1,
    },
    weekCellWin: {
      borderColor: "#1EE6A8",
      backgroundColor: "#0F2C2A",
    },
    weekCellLoss: {
      borderColor: "#2E90FF",
      backgroundColor: "#0B1E3A",
    },
    weekCellFlat: {
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    weekCellLabel: {
      color: colors.textMuted,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    weekCellValue: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
    },
    daySummaryCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 10,
    },
    daySummaryHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    },
    daySummaryEyebrow: {
      color: colors.textMuted,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      fontWeight: "700",
    },
    daySummaryTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    daySummaryNav: {
      flexDirection: "row",
      gap: 8,
    },
    dayNavButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.card,
    },
    dayNavDisabled: {
      opacity: 0.4,
    },
    dayNavText: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700",
    },
    daySummaryHint: {
      color: colors.textMuted,
      fontSize: 12,
    },
    daySummaryRow: {
      flexDirection: "row",
      gap: 10,
    },
    daySummaryNote: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      gap: 6,
    },
    daySummaryTrades: {
      flexDirection: "row",
      gap: 10,
    },
    daySummaryTradeCard: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      gap: 6,
    },
    daySummaryLabel: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1.1,
    },
    daySummaryBody: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
    },
  });
