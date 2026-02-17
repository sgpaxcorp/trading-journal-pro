import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { COLORS } from "../theme";

type DashboardScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

type SeriesPoint = { date: string; value: number };

type AccountSeriesResponse = {
  totals: { tradingPnl: number; cashflowNet: number; currentBalance: number };
  daily: SeriesPoint[];
};

type AnalyticsSnapshot = {
  totalTrades: number;
  winRate: number;
  netPnl: number;
};

type AnalyticsSnapshotResponse = {
  snapshot: AnalyticsSnapshot | null;
};

type ChecklistItem = {
  text: string;
  done: boolean;
};

type ChecklistResponse = {
  date: string;
  items: ChecklistItem[];
  notes: string | null;
};

export function DashboardScreen({ onOpenModule }: DashboardScreenProps) {
  const { language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<AccountSeriesResponse | null>(null);
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [checklist, setChecklist] = useState<ChecklistResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [seriesRes, snapshotRes, checklistRes] = await Promise.all([
          apiGet<AccountSeriesResponse>("/api/account/series"),
          apiGet<AnalyticsSnapshotResponse>("/api/analytics/snapshot"),
          apiGet<ChecklistResponse>("/api/checklist/today"),
        ]);
        if (!active) return;
        setSeries(seriesRes ?? null);
        setSnapshot(snapshotRes?.snapshot ?? null);
        setChecklist(checklistRes ?? null);
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

  const checklistStats = useMemo(() => {
    const items = checklist?.items ?? [];
    const done = items.filter((item) => item.done).length;
    return { items, done, total: items.length };
  }, [checklist]);

  const formatUsd = (value: number) =>
    new Intl.NumberFormat(language === "es" ? "es-ES" : "en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(value);

  const formatPct = (value: number) => {
    if (!Number.isFinite(value)) return "—";
    const pct = Math.abs(value) > 1 ? value : value * 100;
    return `${pct.toFixed(1)}%`;
  };

  const formatSigned = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}${formatUsd(Math.abs(value))}`;
  };

  const formatSignedShort = (value: number) => {
    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}$${Math.abs(value).toFixed(0)}`;
  };

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
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading data…", "Cargando datos…")}</Text>
        </View>
      ) : (
        <>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
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
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t(language, "Win rate", "Win rate")}</Text>
              <Text style={styles.summaryValue}>{snapshot ? formatPct(snapshot.winRate) : "—"}</Text>
              <Text style={styles.summaryHint}>
                {t(language, "Based on closed trades.", "Basado en trades cerrados.")}
              </Text>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t(language, "Net P&L", "P&L neto")}</Text>
              <Text style={styles.summaryValue}>
                {snapshot ? formatUsd(snapshot.netPnl) : "—"}
              </Text>
              <Text style={styles.summaryHint}>
                {t(language, "All-time net performance.", "Performance neta total.")}
              </Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{t(language, "Total trades", "Total trades")}</Text>
              <Text style={styles.summaryValue}>
                {snapshot ? String(snapshot.totalTrades) : "—"}
              </Text>
              <Text style={styles.summaryHint}>
                {t(language, "Closed trades in your journal.", "Trades cerrados en tu journal.")}
              </Text>
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </>
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{t(language, "Today checklist", "Checklist de hoy")}</Text>
        {checklistStats.total > 0 ? (
          <>
            <Text style={styles.panelText}>
              {t(
                language,
                `${checklistStats.done} of ${checklistStats.total} completed`,
                `${checklistStats.done} de ${checklistStats.total} completados`
              )}
            </Text>
            <View style={styles.checklist}>
              {checklistStats.items.map((item, idx) => (
                <View key={`check-${idx}`} style={styles.checklistRow}>
                  <View style={[styles.checkDot, item.done ? styles.checkDotDone : styles.checkDotPending]} />
                  <Text style={styles.checklistText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.panelText}>
            {t(
              language,
              "No checklist yet. Add your pre-market rules to stay consistent today.",
              "Aún no hay checklist. Agrega tus reglas pre-market para mantener consistencia hoy."
            )}
          </Text>
        )}
      </View>

      <ModuleTile
        title={t(language, "Open Journal", "Abrir Journal")}
        description={t(
          language,
          "Write pre-market, inside trade, and after-trade notes.",
          "Escribe pre-market, inside trade y after trade."
        )}
        iconName="reader-outline"
        onPress={() =>
          onOpenModule(
            t(language, "Journal", "Journal"),
            t(
              language,
              "This space will show your daily entries and allow fast updates on the go.",
              "Aquí verás tus entradas diarias y podrás actualizar rápido."
            )
          )
        }
      />
      <ModuleTile
        title={t(language, "Review Analytics", "Revisar Analytics")}
        description={t(
          language,
          "Track KPIs, performance, and risk.",
          "Monitorea KPIs, performance y riesgo."
        )}
        iconName="stats-chart-outline"
        onPress={() =>
          onOpenModule(
            t(language, "Analytics", "Analíticas"),
            t(
              language,
              "Detailed KPIs and performance reports will appear here once trades are logged.",
              "Los KPIs y reportes detallados aparecerán aquí cuando tengas trades registrados."
            )
          )
        }
      />
      <ModuleTile
        title={t(language, "Message Center", "Centro de mensajes")}
        description={t(
          language,
          "See alerts, reminders, and important updates.",
          "Ver alertas, recordatorios y actualizaciones."
        )}
        iconName="mail-outline"
        onPress={() =>
          onOpenModule(
            t(language, "Message Center", "Centro de mensajes"),
            t(
              language,
              "Your alerts and reminders will show up here.",
              "Tus alertas y recordatorios aparecerán aquí."
            )
          )
        }
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  summaryRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 12,
    gap: 4,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  summaryValue: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  summaryHint: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  weeklyRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  weekCell: {
    flexBasis: "30%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 2,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  weekCellLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  weekCellValue: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontWeight: "600",
  },
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 12,
    gap: 6,
  },
  panelTitle: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  panelText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  checklist: {
    marginTop: 6,
    gap: 6,
  },
  checklistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  checkDotDone: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkDotPending: {
    backgroundColor: COLORS.surface,
  },
  checklistText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    flexShrink: 1,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 12,
  },
});
