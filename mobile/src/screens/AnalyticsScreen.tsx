import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";

type AnalyticsScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

type SeriesPoint = { date: string; value: number };
type AccountSeriesResponse = { series: SeriesPoint[]; daily: SeriesPoint[] };

type DayOfWeekBucket = {
  dow: string;
  pnl: number;
  trades: number;
  winRate: number;
};

type HourBucket = {
  hour: string;
  pnl: number;
  trades: number;
  winRate: number;
};

type SymbolBucket = {
  symbol: string;
  pnl: number;
  trades: number;
  winRate: number;
};

type AnalyticsSnapshot = {
  updatedAtIso?: string;
  totalSessions?: number;
  totalTrades?: number;
  wins?: number;
  losses?: number;
  breakevens?: number;
  winRate?: number;
  grossPnl?: number;
  netPnl?: number;
  totalFees?: number;
  avgNetPerSession?: number;
  profitFactor?: number | null;
  expectancy?: number;
  avgWin?: number;
  avgLoss?: number;
  maxWin?: number;
  maxLoss?: number;
  maxDrawdown?: number;
  maxDrawdownPct?: number;
  longestWinStreak?: number;
  longestLossStreak?: number;
  cagr?: number | null;
  sharpe?: number | null;
  sortino?: number | null;
  recoveryFactor?: number | null;
  payoffRatio?: number | null;
  byDOW?: DayOfWeekBucket[];
  byHour?: HourBucket[];
  bySymbol?: SymbolBucket[];
};

type EdgeRow = {
  symbol?: string | null;
  time_bucket?: string | null;
  dow?: string | null;
  dte_bucket?: string | null;
  edge_score?: number | null;
  confidence?: number | null;
  n_sessions?: number | null;
  win_rate_shrunk?: number | null;
  expectancy?: number | null;
};

type AnalyticsStyles = ReturnType<typeof createStyles>;

export function AnalyticsScreen({}: AnalyticsScreenProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [topEdges, setTopEdges] = useState<EdgeRow[]>([]);
  const [series, setSeries] = useState<AccountSeriesResponse | null>(null);
  const [section, setSection] = useState<"overview" | "performance" | "risk" | "time">("overview");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [snapRes, seriesRes] = await Promise.all([
          apiGet<{ snapshot: AnalyticsSnapshot | null; topEdges: EdgeRow[] }>("/api/analytics/snapshot"),
          apiGet<AccountSeriesResponse>("/api/account/series"),
        ]);
        if (!active) return;
        setSnapshot(snapRes.snapshot);
        setTopEdges(snapRes.topEdges ?? []);
        setSeries(seriesRes ?? null);
      } catch (err: any) {
        if (!active) return;
        setError(err?.message ?? "Failed to load analytics.");
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

  const formatUsd = (value: number) =>
    new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);

  const formatPct = (value?: number | null) => {
    if (value == null || !Number.isFinite(value)) return "—";
    const pct = Math.abs(value) > 1 ? value : value * 100;
    return `${pct.toFixed(1)}%`;
  };

  const formatValue = (value?: number | null) =>
    value == null || !Number.isFinite(value) ? "—" : formatUsd(value);

  const toneFor = (value?: number | null, positiveIsGood = true) => {
    if (value == null || !Number.isFinite(value)) return "neutral";
    if (value === 0) return "neutral";
    const positive = value > 0;
    return positiveIsGood ? (positive ? "positive" : "negative") : positive ? "negative" : "positive";
  };

  const hourCells = useMemo(() => {
    const map = new Map((snapshot?.byHour ?? []).map((h) => [h.hour, h]));
    return Array.from({ length: 24 }, (_, h) => {
      const label = `${String(h).padStart(2, "0")}:00`;
      const row = map.get(label);
      return {
        label,
        pnl: row?.pnl ?? 0,
        trades: row?.trades ?? 0,
      };
    });
  }, [snapshot]);

  const maxAbsHour = useMemo(() => {
    return hourCells.reduce((acc, cell) => Math.max(acc, Math.abs(cell.pnl || 0)), 0);
  }, [hourCells]);

  const dayRows = useMemo(() => snapshot?.byDOW ?? [], [snapshot]);
  const topSymbols = useMemo(() => (snapshot?.bySymbol ?? []).slice(0, 5), [snapshot]);
  const edgesTop = useMemo(() => topEdges.slice(0, 4), [topEdges]);

  const balanceSeries = useMemo(() => {
    const points = series?.series ?? [];
    return points.slice(Math.max(0, points.length - 30));
  }, [series]);

  const dailySeries = useMemo(() => {
    const points = series?.daily ?? [];
    return points.slice(Math.max(0, points.length - 14));
  }, [series]);

  return (
    <ScreenScaffold
      title={t(language, "Analytics", "Analíticas")}
      subtitle={t(
        language,
        "Institutional KPIs, performance, and risk overview.",
        "KPIs institucionales, performance y riesgo."
      )}
    >
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>{t(language, "Quick stats", "Resumen rápido")}</Text>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>{t(language, "Loading…", "Cargando…")}</Text>
          </View>
        ) : snapshot ? (
          <View style={styles.kpiRow}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>{t(language, "Net P&L", "P&L neto")}</Text>
              <Text style={styles.kpiValue}>{formatValue(snapshot.netPnl)}</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiLabel}>{t(language, "Win rate", "Win rate")}</Text>
              <Text style={styles.kpiValue}>{formatPct(snapshot.winRate)}</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.bannerText}>
            {t(
              language,
              "No data yet. Start logging trades to unlock analytics.",
              "Aún no hay datos. Registra trades para desbloquear analíticas."
            )}
          </Text>
        )}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <View style={styles.segmentRow}>
        {([
          { id: "overview", label: t(language, "Overview", "Resumen") },
          { id: "performance", label: t(language, "Performance", "Performance") },
          { id: "risk", label: t(language, "Risk", "Riesgo") },
          { id: "time", label: t(language, "Time", "Tiempo") },
        ] as const).map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setSection(item.id)}
            style={[styles.segmentButton, section === item.id && styles.segmentButtonActive]}
          >
            <Text style={styles.segmentLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </View>

      {section === "overview" && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Overview", "Resumen")}</Text>
          <View style={styles.statGrid}>
            <StatCard styles={styles} label={t(language, "Total trades", "Total trades")} value={String(snapshot?.totalTrades ?? "—")} tone="neutral" />
            <StatCard styles={styles} label={t(language, "Win rate", "Win rate")} value={formatPct(snapshot?.winRate)} tone="positive" />
            <StatCard styles={styles} label={t(language, "Net P&L", "P&L neto")} value={formatValue(snapshot?.netPnl)} tone={toneFor(snapshot?.netPnl)} />
            <StatCard styles={styles} label={t(language, "Avg / session", "Promedio / sesión")} value={formatValue(snapshot?.avgNetPerSession)} tone={toneFor(snapshot?.avgNetPerSession)} />
            <StatCard styles={styles} label={t(language, "Max drawdown", "Max drawdown")} value={formatValue(snapshot?.maxDrawdown)} tone={toneFor(snapshot?.maxDrawdown, false)} />
            <StatCard styles={styles} label={t(language, "Profit factor", "Profit factor")} value={snapshot?.profitFactor != null ? snapshot.profitFactor.toFixed(2) : "—"} tone={toneFor(snapshot?.profitFactor)} />
          </View>

          {edgesTop.length ? (
            <View style={styles.subSection}>
              <Text style={styles.subTitle}>{t(language, "Top edges", "Mejores edges")}</Text>
              {edgesTop.map((edge, idx) => (
                <View key={`edge-${idx}`} style={styles.edgeRow}>
                  <Text style={styles.edgeLabel}>
                    {(edge.symbol || edge.time_bucket || edge.dow || edge.dte_bucket || "Edge").toString()}
                  </Text>
                  <Text style={styles.edgeValue}>
                    {edge.edge_score != null ? edge.edge_score.toFixed(2) : "—"}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.subSection}>
            <Text style={styles.subTitle}>{t(language, "Balance chart", "Balance chart")}</Text>
            {balanceSeries.length ? (
              <SparkBarChart
                styles={styles}
                values={balanceSeries.map((p) => p.value)}
                positiveColor="#1EE6A8"
                negativeColor="#2E90FF"
              />
            ) : (
              <Text style={styles.bannerText}>{t(language, "No balance data yet.", "Aún no hay datos de balance.")}</Text>
            )}
          </View>

          <View style={styles.subSection}>
            <Text style={styles.subTitle}>{t(language, "Daily P&L (last 14)", "P&L diario (últimos 14)")}</Text>
            {dailySeries.length ? (
              <DailyBarChart styles={styles} values={dailySeries.map((p) => p.value)} />
            ) : (
              <Text style={styles.bannerText}>{t(language, "No daily data yet.", "Aún no hay datos diarios.")}</Text>
            )}
          </View>
        </View>
      )}

      {section === "performance" && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Performance", "Performance")}</Text>
          <View style={styles.statGrid}>
            <StatCard styles={styles} label={t(language, "Gross P&L", "P&L bruto")} value={formatValue(snapshot?.grossPnl)} tone={toneFor(snapshot?.grossPnl)} />
            <StatCard styles={styles} label={t(language, "Net P&L", "P&L neto")} value={formatValue(snapshot?.netPnl)} tone={toneFor(snapshot?.netPnl)} />
            <StatCard styles={styles} label={t(language, "Profit factor", "Profit factor")} value={snapshot?.profitFactor != null ? snapshot.profitFactor.toFixed(2) : "—"} tone={toneFor(snapshot?.profitFactor)} />
            <StatCard styles={styles} label={t(language, "Expectancy", "Expectancy")} value={formatValue(snapshot?.expectancy)} tone={toneFor(snapshot?.expectancy)} />
            <StatCard styles={styles} label={t(language, "Avg win", "Promedio gana")} value={formatValue(snapshot?.avgWin)} tone={toneFor(snapshot?.avgWin)} />
            <StatCard styles={styles} label={t(language, "Avg loss", "Promedio pierde")} value={formatValue(snapshot?.avgLoss)} tone={toneFor(snapshot?.avgLoss, false)} />
            <StatCard styles={styles} label={t(language, "Max win", "Mayor ganancia")} value={formatValue(snapshot?.maxWin)} tone={toneFor(snapshot?.maxWin)} />
            <StatCard styles={styles} label={t(language, "Max loss", "Mayor pérdida")} value={formatValue(snapshot?.maxLoss)} tone={toneFor(snapshot?.maxLoss, false)} />
          </View>
        </View>
      )}

      {section === "risk" && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Risk", "Riesgo")}</Text>
          <View style={styles.statGrid}>
            <StatCard styles={styles} label={t(language, "Max drawdown", "Max drawdown")} value={formatValue(snapshot?.maxDrawdown)} tone={toneFor(snapshot?.maxDrawdown, false)} />
            <StatCard styles={styles} label={t(language, "Max DD %", "Max DD %")} value={formatPct(snapshot?.maxDrawdownPct)} tone={toneFor(snapshot?.maxDrawdownPct, false)} />
            <StatCard styles={styles} label={t(language, "Recovery factor", "Recovery factor")} value={snapshot?.recoveryFactor != null ? snapshot.recoveryFactor.toFixed(2) : "—"} tone={toneFor(snapshot?.recoveryFactor)} />
            <StatCard styles={styles} label={t(language, "Sharpe", "Sharpe")} value={snapshot?.sharpe != null ? snapshot.sharpe.toFixed(2) : "—"} tone={toneFor(snapshot?.sharpe)} />
            <StatCard styles={styles} label={t(language, "Sortino", "Sortino")} value={snapshot?.sortino != null ? snapshot.sortino.toFixed(2) : "—"} tone={toneFor(snapshot?.sortino)} />
            <StatCard styles={styles} label={t(language, "Payoff ratio", "Payoff ratio")} value={snapshot?.payoffRatio != null ? snapshot.payoffRatio.toFixed(2) : "—"} tone={toneFor(snapshot?.payoffRatio)} />
            <StatCard styles={styles} label={t(language, "CAGR", "CAGR")} value={formatPct(snapshot?.cagr)} tone={toneFor(snapshot?.cagr)} />
          </View>
        </View>
      )}

      {section === "time" && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>{t(language, "Timing & behavior", "Timing y conducta")}</Text>
          <View style={styles.subSection}>
            <Text style={styles.subTitle}>{t(language, "By day of week", "Por día de semana")}</Text>
            {dayRows.length ? (
              dayRows.map((row) => (
                <View key={row.dow} style={styles.edgeRow}>
                  <Text style={styles.edgeLabel}>{row.dow}</Text>
                  <Text style={[styles.edgeValue, row.pnl < 0 && styles.lossValue]}>
                    {row.pnl >= 0 ? "+" : "-"}{formatUsd(Math.abs(row.pnl))}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.bannerText}>{t(language, "No timing data yet.", "Aún no hay datos de tiempo.")}</Text>
            )}
          </View>

          <View style={styles.subSection}>
            <Text style={styles.subTitle}>{t(language, "Best hours heatmap", "Mapa de horas")}</Text>
            <View style={styles.heatGrid}>
              {hourCells.map((cell) => {
                const intensity = maxAbsHour > 0 ? Math.min(1, Math.abs(cell.pnl) / maxAbsHour) : 0;
                const bg =
                  cell.pnl > 0
                    ? `rgba(30,230,168,${0.12 + intensity * 0.5})`
                    : cell.pnl < 0
                    ? `rgba(46,144,255,${0.12 + intensity * 0.5})`
                    : colors.surface;
                const border =
                  cell.pnl > 0 ? "#1EE6A8" : cell.pnl < 0 ? "#2E90FF" : colors.border;
                return (
                  <View key={cell.label} style={[styles.heatCell, { backgroundColor: bg, borderColor: border }]}>
                    <Text style={styles.heatLabel}>{cell.label.slice(0, 2)}</Text>
                    <Text style={styles.heatValue}>
                      {cell.pnl === 0 && cell.trades === 0 ? "—" : cell.pnl >= 0 ? `+${cell.pnl.toFixed(0)}` : `${cell.pnl.toFixed(0)}`}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {topSymbols.length ? (
            <View style={styles.subSection}>
              <Text style={styles.subTitle}>{t(language, "Top symbols", "Top símbolos")}</Text>
              {topSymbols.map((row) => (
                <View key={row.symbol} style={styles.edgeRow}>
                  <Text style={styles.edgeLabel}>{row.symbol}</Text>
                  <Text style={[styles.edgeValue, row.pnl < 0 && styles.lossValue]}>
                    {row.pnl >= 0 ? "+" : "-"}{formatUsd(Math.abs(row.pnl))}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      )}
    </ScreenScaffold>
  );
}

function StatCard({
  label,
  value,
  tone,
  styles,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  styles: AnalyticsStyles;
}) {
  return (
    <View
      style={[
        styles.statCard,
        tone === "positive" && styles.statCardPositive,
        tone === "negative" && styles.statCardNegative,
      ]}
    >
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function SparkBarChart({
  values,
  positiveColor,
  negativeColor,
  styles,
}: {
  values: number[];
  positiveColor: string;
  negativeColor: string;
  styles: AnalyticsStyles;
}) {
  const max = values.reduce((acc, v) => Math.max(acc, Math.abs(v)), 0) || 1;
  return (
    <View style={styles.chartRow}>
      {values.map((v, idx) => {
        const height = Math.max(6, Math.round((Math.abs(v) / max) * 60));
        return (
          <View key={`spark-${idx}`} style={styles.chartBarWrap}>
            <View
              style={[
                styles.chartBar,
                {
                  height,
                  backgroundColor: v >= 0 ? positiveColor : negativeColor,
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

function DailyBarChart({ values, styles }: { values: number[]; styles: AnalyticsStyles }) {
  const max = values.reduce((acc, v) => Math.max(acc, Math.abs(v)), 0) || 1;
  return (
    <View style={styles.chartRow}>
      {values.map((v, idx) => {
        const height = Math.max(6, Math.round((Math.abs(v) / max) * 60));
        return (
          <View key={`daily-${idx}`} style={styles.chartBarWrap}>
            <View
              style={[
                styles.chartBar,
                {
                  height,
                  backgroundColor: v >= 0 ? "#1EE6A8" : "#2E90FF",
                },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    banner: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 6,
    },
    bannerTitle: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    bannerText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
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
    kpiRow: {
      flexDirection: "row",
      gap: 8,
    },
    kpiCard: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 10,
      gap: 4,
    },
    kpiLabel: {
      color: colors.textMuted,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    kpiValue: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700",
    },
    segmentRow: {
      flexDirection: "row",
      gap: 8,
    },
    segmentButton: {
      flex: 1,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 6,
      alignItems: "center",
    },
    segmentButtonActive: {
      borderColor: colors.primary,
      backgroundColor: "#0F2C2A",
    },
    segmentLabel: {
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: "700",
    },
    sectionCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 10,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
    },
    statGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    statCard: {
      width: "48%",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 4,
    },
    statCardPositive: {
      borderColor: "#1EE6A8",
      backgroundColor: "#0F2C2A",
    },
    statCardNegative: {
      borderColor: "#2E90FF",
      backgroundColor: "#0B1E3A",
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    statValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    subSection: {
      gap: 6,
    },
    subTitle: {
      color: colors.textMuted,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    edgeRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 6,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    edgeLabel: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "600",
    },
    edgeValue: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    lossValue: {
      color: "#7EB3FF",
    },
    heatGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    heatCell: {
      width: "14%",
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 6,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
    },
    heatLabel: {
      color: colors.textMuted,
      fontSize: 9,
    },
    heatValue: {
      color: colors.textPrimary,
      fontSize: 10,
      fontWeight: "700",
    },
    chartRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 4,
      paddingTop: 6,
    },
    chartBarWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    chartBar: {
      width: "100%",
      borderRadius: 6,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
    },
  });
