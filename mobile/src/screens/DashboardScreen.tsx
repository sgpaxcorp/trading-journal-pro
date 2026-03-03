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
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";

type DashboardScreenProps = {
  onOpenModule: (title: string, description: string) => void;
  onOpenJournalDate: (date: string) => void;
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

type AccountsResponse = {
  activeAccountId: string | null;
};

type TradingSystemItem = {
  id?: string;
  text?: string;
};

type TradingSystemPayload = {
  doList: TradingSystemItem[];
  dontList: TradingSystemItem[];
};

type PlanRow = {
  steps?: any;
};

const WEB_GROWTH_PLAN_URL = "https://www.neurotrader-journal.com/growth-plan";

const HERO_MESSAGES = [
  {
    title: { en: "Train like a pro today", es: "Entrena como profesional hoy" },
    subtitle: {
      en: "Process before outcome. Trade the plan, not the noise.",
      es: "Proceso antes que resultado. Opera el plan, no el ruido.",
    },
  },
  {
    title: { en: "One clean trade is enough", es: "Un trade limpio es suficiente" },
    subtitle: {
      en: "Patience is the edge. Wait for your A+ setup.",
      es: "La paciencia es el edge. Espera tu setup A+.",
    },
  },
  {
    title: { en: "Protect capital first", es: "Protege el capital primero" },
    subtitle: {
      en: "Risk small, execute sharp, review honestly.",
      es: "Riesgo pequeño, ejecución clara, revisión honesta.",
    },
  },
  {
    title: { en: "Consistency compounds", es: "La consistencia compone" },
    subtitle: {
      en: "Win your routine today; results will follow.",
      es: "Gana tu rutina hoy; el resultado llegará.",
    },
  },
];

const FOCUS_RULES = [
  { en: "No revenge trading", es: "No revenge trading" },
  { en: "Max 2% risk per trade", es: "Máximo 2% de riesgo por trade" },
  { en: "Process > outcome", es: "Proceso > resultado" },
];

export function DashboardScreen({ onOpenModule, onOpenJournalDate }: DashboardScreenProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const user = useSupabaseUser();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [series, setSeries] = useState<AccountSeriesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemData, setSystemData] = useState<TradingSystemPayload | null>(null);

  async function fetchActiveAccountId(): Promise<string | null> {
    try {
      const res = await apiGet<AccountsResponse>("/api/trading-accounts/list");
      return res.activeAccountId ?? null;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let active = true;

    async function load(isRefresh = false) {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
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
        if (isRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.id || !supabaseMobile) return;
    let cancelled = false;

    async function loadTradingSystem() {
      setSystemLoading(true);
      const accountId = await fetchActiveAccountId();

      const tables = ["growth_plans", "ntj_growth_plans"];
      let plan: PlanRow | null = null;

      for (const table of tables) {
        let query = supabaseMobile
          .from(table)
          .select("steps, updated_at, created_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1);

        if (accountId) query = query.eq("account_id", accountId);
        else query = query.is("account_id", null);

        const { data, error: loadError } = await query;

        if (loadError && accountId) {
          const alt = await supabaseMobile
            .from(table)
            .select("steps, updated_at, created_at")
            .eq("user_id", user.id)
            .order("updated_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1);
          if (!alt.error && alt.data && alt.data.length > 0) {
            plan = alt.data[0] as PlanRow;
            break;
          }
        }

        if (!loadError && data && data.length > 0) {
          plan = data[0] as PlanRow;
          break;
        }
      }

      if (!cancelled) {
        if (!plan?.steps) {
          setSystemData(null);
          setSystemLoading(false);
          return;
        }

        const system = plan?.steps?.execution_and_journal?.system ?? {};
        const doList = Array.isArray(system.doList) ? system.doList : [];
        const dontList = Array.isArray(system.dontList) ? system.dontList : [];
        setSystemData({
          doList: doList.filter((i: any) => (i?.text ?? "").trim().length > 0),
          dontList: dontList.filter((i: any) => (i?.text ?? "").trim().length > 0),
        });
        setSystemLoading(false);
      }
    }

    void loadTradingSystem();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    async function loadJournalEntries(isRefresh = false) {
      try {
        if (!isRefresh) {
          setJournalLoading(true);
        }
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
        if (!isRefresh) {
          setJournalLoading(false);
        }
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

  const formatSigned = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    const abs = Math.abs(value);
    const formatted = new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(abs);
    return `${sign}${formatted}`;
  };

  const formatSignedShort = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}$${Math.abs(value).toFixed(0)}`;
  };

  const heroMessage = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const idx = dayOfYear % HERO_MESSAGES.length;
    return HERO_MESSAGES[idx];
  }, []);

  async function handleRefresh() {
    setError(null);
    setRefreshing(true);
    try {
      const today = new Date();
      const toDate = today.toISOString().slice(0, 10);
      const from = new Date(today);
      from.setDate(today.getDate() - 45);
      const fromDate = from.toISOString().slice(0, 10);

      const [seriesRes, journalRes] = await Promise.all([
        apiGet<AccountSeriesResponse>("/api/account/series"),
        apiGet<JournalListResponse>(`/api/journal/list?fromDate=${fromDate}&toDate=${toDate}`),
      ]);

      setSeries(seriesRes ?? null);
      const entries = journalRes?.entries ?? [];
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
    } catch (err: any) {
      setError(err?.message ?? "Failed to refresh.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScreenScaffold
      title={t(language, "Dashboard", "Dashboard")}
      subtitle={t(
        language,
        "Your daily overview: progress, streaks, and key actions.",
        "Tu resumen diario: progreso, rachas y acciones clave."
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading data…", "Cargando datos…")}</Text>
        </View>
      ) : (
        <>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>{t(language, "Daily focus", "Enfoque del día")}</Text>
            <Text style={styles.heroTitle}>{heroMessage.title[language]}</Text>
            <Text style={styles.heroSubtitle}>{heroMessage.subtitle[language]}</Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, styles.weeklyCard]}>
              <Text style={styles.summaryLabel}>{t(language, "Weekly P&L", "P&L semanal")}</Text>
              <Text style={styles.summaryValue}>{formatSigned(weeklySummary.total)}</Text>
              <Text style={styles.summaryHint}>
                {t(language, "Current week (Sun–Fri).", "Semana actual (Dom–Vie).")}
              </Text>
              <View style={styles.weeklyRow}>
                {weeklySummary.days.map((day, idx) => {
                  const isPositive = day.pnl != null && day.pnl > 0;
                  const isNegative = day.pnl != null && day.pnl < 0;
                  return (
                    <Pressable
                      key={`weekly-${day.iso}-${idx}`}
                      accessibilityRole="button"
                      onPress={() => onOpenJournalDate(day.iso)}
                      style={[
                        styles.weekCell,
                        isPositive && styles.weekCellWin,
                        isNegative && styles.weekCellLoss,
                        day.pnl === 0 && styles.weekCellFlat,
                      ]}
                    >
                      <Text style={styles.weekCellLabel}>
                        {language === "es"
                          ? ["D", "L", "M", "X", "J", "V"][idx]
                          : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][idx]}
                      </Text>
                      <Text
                        style={styles.weekCellValue}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {day.pnl == null ? "—" : day.pnl === 0 ? "$0" : formatSignedShort(day.pnl)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={[styles.summaryCard, styles.focusCard]}>
            <Text style={styles.planLabel}>{t(language, "Focus of the day", "Focus del día")}</Text>
            <View style={styles.focusList}>
              {FOCUS_RULES.map((rule) => (
                <View key={rule.en} style={styles.focusRow}>
                  <View style={styles.focusDot} />
                  <Text style={styles.focusText}>{rule[language]}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.systemCard}>
            <Text style={styles.systemTitle}>{t(language, "Trading System", "Sistema de trading")}</Text>
            {systemLoading ? (
              <Text style={styles.systemHint}>
                {t(language, "Loading system…", "Cargando sistema…")}
              </Text>
            ) : !systemData ||
              (systemData.doList.length + systemData.dontList.length === 0) ? (
              <Text style={styles.systemHint}>
                {t(
                  language,
                  "Add your Do/Don't rules in Growth Plan.",
                  "Agrega tus reglas Hacer/No hacer en Growth Plan."
                )}{" "}
                <Text style={styles.systemLink} onPress={() => Linking.openURL(WEB_GROWTH_PLAN_URL)}>
                  {t(language, "Open Growth Plan →", "Abrir Growth Plan →")}
                </Text>
              </Text>
            ) : (
              <View style={styles.systemGrid}>
                <View style={styles.systemSection}>
                  <Text style={styles.systemLabel}>{t(language, "Do", "Hacer")}</Text>
                  {(systemData.doList.length ? systemData.doList : [{ text: "—" }]).map((item, idx) => (
                    <Text key={`do-${idx}`} style={styles.systemItem}>
                      • {item.text}
                    </Text>
                  ))}
                </View>
                <View style={styles.systemSection}>
                  <Text style={styles.systemLabelDont}>{t(language, "Don't", "No hacer")}</Text>
                  {(systemData.dontList.length ? systemData.dontList : [{ text: "—" }]).map((item, idx) => (
                    <Text key={`dont-${idx}`} style={styles.systemItem}>
                      • {item.text}
                    </Text>
                  ))}
                </View>
              </View>
            )}
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
      gap: 8,
      alignItems: "stretch",
    },
    heroCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 6,
    },
    heroEyebrow: {
      color: colors.textMuted,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    heroTitle: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: "700",
    },
    heroSubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    summaryCard: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      gap: 3,
    },
    weeklyCard: {
      flex: 1,
    },
    focusCard: {
      marginTop: 8,
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 6,
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
      fontSize: 16,
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
      fontSize: 13,
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
    focusList: {
      gap: 6,
      marginTop: 4,
    },
    focusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    focusDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    focusText: {
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: "600",
    },
    weeklyRow: {
      marginTop: 6,
      flexDirection: "row",
      flexWrap: "nowrap",
      justifyContent: "space-between",
    },
    weekCell: {
      width: "15%",
      minWidth: 48,
      height: 56,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 4,
      paddingHorizontal: 4,
      gap: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    weekCellWin: {
      borderColor: colors.success,
      backgroundColor: colors.successSoft,
    },
    weekCellLoss: {
      borderColor: colors.info,
      backgroundColor: colors.infoSoft,
    },
    weekCellFlat: {
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    weekCellLabel: {
      color: colors.textMuted,
      fontSize: 8,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      fontWeight: "700",
    },
    weekCellValue: {
      color: colors.textPrimary,
      fontSize: 10,
      fontWeight: "700",
      fontVariant: ["tabular-nums"],
      textAlign: "center",
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
