import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet, apiPost } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";

type LocalizedText = { en: string; es: string };

type OfficeAlert = {
  id: string;
  ticker: string;
  category: string;
  materiality: "critical" | "high" | "medium" | "monitor";
  headline: LocalizedText;
  whatChanged: LocalizedText;
  whyItMatters: LocalizedText;
  affectedThesisAssumption: string;
  source: { title: string; url: string | null; publicationDate: string };
  humanReview: "REQUIRED" | "RECOMMENDED" | "NOT_NOW";
};

type BriefingRecord = {
  id: string;
  briefing_date: string;
  version: number;
  briefing: {
    executiveSummary: LocalizedText;
    trackedTickers: string[];
    alerts: OfficeAlert[];
    dataGaps: LocalizedText[];
  };
};

type AttentionReview = {
  alert_id: string;
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
};

type OfficePayload = {
  latest: BriefingRecord | null;
  attentionReviews: AttentionReview[];
};

export function DailyInvestmentOfficeScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [payload, setPayload] = useState<OfficePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingAlertId, setSavingAlertId] = useState("");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localized = useCallback(
    (value?: LocalizedText | null) => (language === "es" ? value?.es : value?.en) ?? "",
    [language]
  );

  const load = useCallback(async (pullToRefresh = false) => {
    pullToRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const result = await apiGet<OfficePayload>("/api/neuro-analysis/daily-office");
      setPayload(result);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t(language, "Could not load briefing.", "No se pudo cargar el briefing."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [language]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviews = useMemo(
    () => new Map((payload?.attentionReviews ?? []).map((review) => [review.alert_id, review.status])),
    [payload?.attentionReviews]
  );
  const alerts = useMemo(() => {
    const rows = payload?.latest?.briefing.alerts ?? [];
    return attentionOnly ? rows.filter((alert) => alert.humanReview !== "NOT_NOW") : rows;
  }, [attentionOnly, payload?.latest]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      await apiPost(
        "/api/neuro-analysis/daily-office",
        { action: "generate" },
        { timeoutMs: 240_000 }
      );
      await load();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : t(language, "Could not generate briefing.", "No se pudo generar el briefing."));
    } finally {
      setGenerating(false);
    }
  }

  async function triage(alertId: string, status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED") {
    const briefingId = payload?.latest?.id;
    if (!briefingId) return;
    setSavingAlertId(alertId);
    try {
      const result = await apiPost<{ review: AttentionReview }>("/api/neuro-analysis/daily-office", {
        action: "triage",
        briefingId,
        alertId,
        status,
      });
      setPayload((current) => {
        if (!current) return current;
        return {
          ...current,
          attentionReviews: [
            ...current.attentionReviews.filter((review) => review.alert_id !== alertId),
            result.review,
          ],
        };
      });
    } catch (triageError) {
      setError(triageError instanceof Error ? triageError.message : t(language, "Could not update review.", "No se pudo actualizar la revisión."));
    } finally {
      setSavingAlertId("");
    }
  }

  const briefing = payload?.latest?.briefing;
  const required = briefing?.alerts.filter((alert) => alert.humanReview === "REQUIRED").length ?? 0;

  return (
    <ScreenScaffold
      title={t(language, "Daily Investment Office", "Oficina Diaria de Inversiones")}
      subtitle={t(
        language,
        "Material developments prioritized against the original investment thesis.",
        "Desarrollos materiales priorizados contra la tesis original de inversión."
      )}
      refreshing={refreshing}
      onRefresh={() => void load(true)}
      compactHeader
    >
      <View style={styles.commandBar}>
        <View style={styles.commandCopy}>
          <Text style={styles.eyebrow}>{t(language, "MARKET-DAY BRIEFING", "BRIEFING DEL DÍA")}</Text>
          <Text style={styles.summary}>
            {briefing
              ? localized(briefing.executiveSummary)
              : t(language, "No briefing is available yet.", "Aún no hay un briefing disponible.")}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(language, "Refresh briefing", "Actualizar briefing")}
          disabled={generating}
          onPress={() => void generate()}
          style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed, generating && styles.disabled]}
        >
          {generating ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.onPrimary} />
          )}
        </Pressable>
      </View>

      <View style={styles.decisionStandard}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.info} />
        <View style={styles.decisionStandardCopy}>
          <Text style={styles.decisionStandardLabel}>
            {t(language, "DECISION STANDARD", "ESTÁNDAR DE DECISIÓN")}
          </Text>
          <Text style={styles.decisionStandardText}>
            {t(
              language,
              "Evidence before action. No price prediction or automatic trade decision.",
              "Evidencia antes que acción. Sin predicción de precio ni decisión automática de trading."
            )}
          </Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>{t(language, "Loading briefing...", "Cargando briefing...")}</Text>
        </View>
      ) : briefing ? (
        <>
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>{t(language, "DATE", "FECHA")}</Text>
              <Text style={styles.metricValue}>{payload?.latest?.briefing_date}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>{t(language, "TRACKED", "MONITOREADOS")}</Text>
              <Text style={styles.metricValue}>{briefing.trackedTickers.length}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>{t(language, "REVIEW", "REVISIÓN")}</Text>
              <Text style={[styles.metricValue, required > 0 && styles.dangerText]}>{required}</Text>
            </View>
          </View>

          <View style={styles.filters}>
            <Pressable onPress={() => setAttentionOnly(false)} style={[styles.filter, !attentionOnly && styles.filterActive]}>
              <Text style={[styles.filterText, !attentionOnly && styles.filterTextActive]}>{t(language, "All", "Todo")}</Text>
            </Pressable>
            <Pressable onPress={() => setAttentionOnly(true)} style={[styles.filter, attentionOnly && styles.filterActive]}>
              <Text style={[styles.filterText, attentionOnly && styles.filterTextActive]}>{t(language, "Needs attention", "Requiere atención")}</Text>
            </Pressable>
          </View>

          {alerts.map((alert) => {
            const status = reviews.get(alert.id) ?? "OPEN";
            const busy = savingAlertId === alert.id;
            return (
              <View key={alert.id} style={styles.alert}>
                <View style={styles.alertHeader}>
                  <Text style={styles.ticker}>{alert.ticker}</Text>
                  <Text style={[styles.materiality, alert.materiality === "critical" && styles.materialityCritical]}>
                    {alert.materiality.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.alertTitle}>{localized(alert.headline)}</Text>
                <Text style={styles.question}>{t(language, "WHAT CHANGED?", "¿QUÉ CAMBIÓ?")}</Text>
                <Text style={styles.answer}>{localized(alert.whatChanged)}</Text>
                <Text style={styles.question}>{t(language, "WHY COULD IT MATTER?", "¿POR QUÉ PODRÍA IMPORTAR?")}</Text>
                <Text style={styles.answer}>{localized(alert.whyItMatters)}</Text>
                <View style={styles.thesisBox}>
                  <Text style={styles.thesisLabel}>{t(language, "ORIGINAL THESIS ASSUMPTION", "PREMISA DE LA TESIS ORIGINAL")}</Text>
                  <Text style={styles.thesisText}>{alert.affectedThesisAssumption}</Text>
                </View>
                <Text style={styles.question}>{t(language, "CONFIRMING SOURCE", "FUENTE CONFIRMATORIA")}</Text>
                <Pressable
                  disabled={!alert.source.url}
                  onPress={() => alert.source.url && void Linking.openURL(alert.source.url)}
                  style={styles.sourceRow}
                >
                  <Text style={[styles.sourceText, !alert.source.url && styles.muted]}>{alert.source.title}</Text>
                  {alert.source.url ? <Ionicons name="open-outline" size={15} color={colors.info} /> : null}
                </Pressable>
                <Text style={styles.sourceDate}>{alert.source.publicationDate}</Text>
                <Text style={styles.reviewQuestion}>
                  {t(language, "Does human review appear necessary?", "¿Parece necesaria la revisión humana?")} {alert.humanReview}
                </Text>
                <View style={styles.actions}>
                  {status === "OPEN" ? (
                    <Pressable disabled={busy} onPress={() => void triage(alert.id, "ACKNOWLEDGED")} style={styles.secondaryAction}>
                      <Text style={styles.secondaryActionText}>{t(language, "Acknowledge", "Reconocer")}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    disabled={busy}
                    onPress={() => void triage(alert.id, status === "RESOLVED" ? "OPEN" : "RESOLVED")}
                    style={styles.primaryAction}
                  >
                    {busy ? <ActivityIndicator size="small" color={colors.onPrimary} /> : null}
                    <Text style={styles.primaryActionText}>
                      {status === "RESOLVED" ? t(language, "Reopen", "Reabrir") : t(language, "Resolve", "Resolver")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}

          {!alerts.length ? (
            <View style={styles.empty}>
              <Ionicons name="shield-checkmark-outline" size={28} color={colors.success} />
              <Text style={styles.emptyText}>{t(language, "No material items in this view.", "No hay asuntos materiales en esta vista.")}</Text>
            </View>
          ) : null}

          {briefing.dataGaps.length ? (
            <View style={styles.gaps}>
              <Text style={styles.gapTitle}>{t(language, "EVIDENCE GAPS", "FALTAS DE EVIDENCIA")}</Text>
              {briefing.dataGaps.map((gap, index) => (
                <Text key={`${gap.en}-${index}`} style={styles.gapText}>• {localized(gap)}</Text>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={28} color={colors.primary} />
          <Text style={styles.emptyText}>{t(language, "Generate the first market-day briefing.", "Genera el primer briefing del día de mercado.")}</Text>
        </View>
      )}
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    commandBar: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.surface, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
    commandCopy: { flex: 1 },
    eyebrow: { color: colors.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    summary: { marginTop: 5, color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
    decisionStandard: { borderLeftWidth: 3, borderLeftColor: colors.info, backgroundColor: colors.infoSoft, padding: 11, flexDirection: "row", alignItems: "flex-start", gap: 9 },
    decisionStandardCopy: { flex: 1 },
    decisionStandardLabel: { color: colors.info, fontSize: 9, fontWeight: "800" },
    decisionStandardText: { marginTop: 3, color: colors.textPrimary, fontSize: 11, lineHeight: 17 },
    refreshButton: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
    pressed: { opacity: 0.78 },
    disabled: { opacity: 0.55 },
    error: { color: colors.dangerText, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 8, padding: 10, fontSize: 12, lineHeight: 18 },
    loadingRow: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: 10 },
    muted: { color: colors.textMuted },
    metricsRow: { flexDirection: "row", borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" },
    metric: { flex: 1, minHeight: 68, padding: 10, justifyContent: "center", borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border },
    metricLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "800" },
    metricValue: { marginTop: 5, color: colors.textPrimary, fontSize: 16, fontWeight: "800" },
    dangerText: { color: colors.dangerText },
    filters: { flexDirection: "row", gap: 8 },
    filter: { minHeight: 38, justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
    filterActive: { borderColor: colors.primary, backgroundColor: colors.successSoft },
    filterText: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    filterTextActive: { color: colors.primary },
    alert: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.card, padding: 14, gap: 7 },
    alertHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    ticker: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
    materiality: { color: colors.info, fontSize: 9, fontWeight: "800" },
    materialityCritical: { color: colors.dangerText },
    alertTitle: { color: colors.textPrimary, fontSize: 16, lineHeight: 22, fontWeight: "700" },
    question: { marginTop: 7, color: colors.textMuted, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
    answer: { color: colors.textPrimary, fontSize: 13, lineHeight: 19 },
    thesisBox: { marginTop: 7, borderLeftWidth: 3, borderLeftColor: colors.info, backgroundColor: colors.infoSoft, padding: 10 },
    thesisLabel: { color: colors.info, fontSize: 9, fontWeight: "800" },
    thesisText: { marginTop: 4, color: colors.textPrimary, fontSize: 12, lineHeight: 18 },
    sourceRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
    sourceText: { flex: 1, color: colors.info, fontSize: 12, lineHeight: 18, fontWeight: "700" },
    sourceDate: { color: colors.textMuted, fontSize: 10 },
    reviewQuestion: { marginTop: 6, color: colors.warning, fontSize: 11, lineHeight: 17, fontWeight: "800" },
    actions: { marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 },
    secondaryAction: { minHeight: 38, justifyContent: "center", borderRadius: 8, borderWidth: 1, borderColor: colors.warning, paddingHorizontal: 12 },
    secondaryActionText: { color: colors.warning, fontSize: 12, fontWeight: "800" },
    primaryAction: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8, backgroundColor: colors.primary, paddingHorizontal: 12 },
    primaryActionText: { color: colors.onPrimary, fontSize: 12, fontWeight: "800" },
    empty: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
    emptyText: { maxWidth: 270, color: colors.textMuted, textAlign: "center", fontSize: 13, lineHeight: 19 },
    gaps: { borderWidth: 1, borderColor: colors.warning, borderRadius: 8, backgroundColor: colors.warningSoft, padding: 12, gap: 4 },
    gapTitle: { color: colors.warning, fontSize: 10, fontWeight: "800" },
    gapText: { color: colors.textPrimary, fontSize: 11, lineHeight: 17 },
  });
