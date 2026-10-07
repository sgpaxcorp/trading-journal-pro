import { useCallback, useEffect, useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { apiGet, apiPost } from "../lib/api";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";

type Mode = "today" | "forward_positioning";
type Horizon = "today" | "one_week" | "one_month" | "three_months";
type Profile = {
  id: string;
  symbol: string;
  status: "active" | "paused" | "archived";
  last_analysis_at?: string | null;
  last_flow_session_date?: string | null;
  current_snapshot?: Record<string, any> | null;
};
type Bar = { sessionDate: string; close: number; open: number; high: number; low: number; volume?: number | null };
type Workspace = {
  profile: Profile;
  analyses: any[];
  bars: Bar[];
  reviews: any[];
  checkpoints: any[];
  events: any[];
  openInterestIntelligence?: Record<string, any> | null;
  optionMarketData?: Record<string, any> | null;
  trend?: Record<string, any> | null;
};
type Screenshot = { id: string; uri: string; dataUrl: string };

const PROVIDERS = ["unusualwhales", "optionstrat", "cheddarflow", "quantdata", "other"] as const;

function cleanSymbol(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9.^=-]/g, "").slice(0, 10);
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: unknown) {
  if (value == null || value === "") return "DATA NOT AVAILABLE";
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(number)
    : "DATA NOT AVAILABLE";
}

function percent(value: unknown) {
  if (value == null || value === "") return "DATA NOT AVAILABLE";
  const number = Number(value);
  return Number.isFinite(number) ? `${number >= 0 ? "+" : ""}${number.toFixed(2)}%` : "DATA NOT AVAILABLE";
}

function compactNumber(value: unknown) {
  if (value == null || value === "") return "DATA NOT AVAILABLE";
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(number)
    : "DATA NOT AVAILABLE";
}

export function OptionFlowScreen() {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("unusualwhales");
  const [mode, setMode] = useState<Mode>("today");
  const [horizon, setHorizon] = useState<Horizon>("today");
  const [flowDate, setFlowDate] = useState(todayKey);
  const [notes, setNotes] = useState("");
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);

  const loadProfiles = useCallback(async (preferredId?: string | null) => {
    const body = await apiGet<{ profiles?: Profile[] }>("/api/option-flow/profiles");
    const next = Array.isArray(body.profiles) ? body.profiles : [];
    setProfiles(next);
    const nextId = preferredId && next.some((item) => item.id === preferredId)
      ? preferredId
      : selectedId && next.some((item) => item.id === selectedId)
        ? selectedId
        : next[0]?.id ?? null;
    setSelectedId(nextId);
    return nextId;
  }, [selectedId]);

  const loadWorkspace = useCallback(async (profileId: string) => {
    const body = await apiGet<{ workspace?: Workspace }>(
      `/api/option-flow/profiles?profileId=${encodeURIComponent(profileId)}`
    );
    setWorkspace(body.workspace ?? null);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const nextId = await loadProfiles(selectedId);
      if (nextId) await loadWorkspace(nextId);
    } catch (error: any) {
      Alert.alert(t(language, "Could not load Option Flow", "No se pudo cargar Option Flow"), error?.message ?? "Error");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [language, loadProfiles, loadWorkspace, selectedId]);

  useEffect(() => { void refresh(); }, []); // initial screen bootstrap

  useEffect(() => {
    if (!selectedId) { setWorkspace(null); return; }
    void loadWorkspace(selectedId).catch((error: any) => {
      Alert.alert(t(language, "Could not load the profile", "No se pudo cargar el perfil"), error?.message ?? "Error");
    });
  }, [language, loadWorkspace, selectedId]);

  function openAnalysis(profileSymbol?: string) {
    setSymbol(cleanSymbol(profileSymbol ?? ""));
    setProvider("unusualwhales");
    setMode("today");
    setHorizon("today");
    setFlowDate(todayKey());
    setNotes("");
    setScreenshots([]);
    setModalVisible(true);
  }

  async function selectScreenshots() {
    const remaining = Math.max(0, 4 - screenshots.length);
    if (!remaining) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        t(language, "Photo access required", "Se requiere acceso a fotos"),
        t(language, "Allow photo access to add flow screenshots.", "Permite acceso a fotos para añadir screenshots de flow.")
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      orderedSelection: true,
      base64: true,
      quality: 0.85,
    });
    if (result.canceled) return;
    const mapped = result.assets
      .filter((asset) => Boolean(asset.base64))
      .map((asset, index) => ({
        id: `${asset.assetId ?? asset.uri}-${index}`,
        uri: asset.uri,
        dataUrl: `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`,
      }));
    setScreenshots((current) => [...current, ...mapped].slice(0, 4));
  }

  async function runAnalysis() {
    const target = cleanSymbol(symbol);
    if (!target || !screenshots.length) {
      Alert.alert(
        t(language, "Missing evidence", "Falta evidencia"),
        t(language, "Enter a ticker and add at least one screenshot.", "Escribe un ticker y añade al menos un screenshot.")
      );
      return;
    }
    setSubmitting(true);
    try {
      const body = await apiPost<{
        profileId?: string;
        analysisVersion?: number;
        dataQuality?: { newUniqueRows?: number; repeatedRows?: number };
      }>(
        "/api/option-flow/analyze",
        {
          provider,
          underlying: target,
          analysisMode: mode,
          horizon,
          sourceSessionDate: flowDate,
          analystNotes: notes,
          rows: [],
          screenshotDataUrls: screenshots.map((item) => item.dataUrl),
          language,
        },
        { timeoutMs: 120_000 }
      );
      const nextId = await loadProfiles(body.profileId ?? null);
      if (nextId) await loadWorkspace(nextId);
      setModalVisible(false);
      Alert.alert(
        t(language, "Analysis saved", "Análisis guardado"),
        `${target} · v${body.analysisVersion ?? "—"} · ${body.dataQuality?.newUniqueRows ?? "—"} ${t(language, "new", "nuevos")} · ${body.dataQuality?.repeatedRows ?? "—"} ${t(language, "repeated", "repetidos")}`
      );
    } catch (error: any) {
      Alert.alert(t(language, "Analysis failed", "Falló el análisis"), error?.message ?? "Error");
    } finally {
      setSubmitting(false);
    }
  }

  const latest = workspace?.analyses?.[0] ?? null;
  const latestAgent = latest?.agent_output ?? {};
  const latestDataQuality = latest?.data_quality ?? {};
  const latestThesisUpdate = latestAgent?.thesisUpdate ?? {};
  const latestBar = workspace?.bars?.at(-1) ?? null;
  const previousBar = workspace?.bars?.at(-2) ?? null;
  const dailyMove = latestBar && previousBar ? ((latestBar.close - previousBar.close) / previousBar.close) * 100 : null;
  const trend = workspace?.trend ?? {};
  const oiIntelligence = workspace?.openInterestIntelligence ?? {};
  const oiCoverage = oiIntelligence.coverage ?? {};
  const oiTotals = oiIntelligence.totals ?? {};
  const oiContracts = Array.isArray(oiIntelligence.contracts) ? oiIntelligence.contracts : [];
  const optionMarketData = workspace?.optionMarketData ?? {};
  const oiThesisUpdate = workspace?.profile?.current_snapshot?.openInterestThesisUpdate ?? null;

  return (
    <>
      <ScreenScaffold
        title={t(language, "Flow Research Center", "Centro de análisis de flujo")}
        subtitle={t(
          language,
          "Persistent intelligence by ticker with daily price follow-up.",
          "Inteligencia persistente por ticker con seguimiento diario de precio."
        )}
        refreshing={refreshing}
        onRefresh={refresh}
      >
        <View style={styles.headerRow}>
          <View style={styles.trackingPill}>
            <Ionicons name="time-outline" size={14} color={colors.success} />
            <Text style={styles.trackingText}>{t(language, "6 PM close · 8:15 AM OI", "6 PM cierre · 8:15 AM OI")}</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={() => openAnalysis(workspace?.profile.symbol)}>
            <Ionicons name="add" size={18} color={colors.onPrimary} />
            <Text style={styles.primaryButtonText}>{t(language, "Add flow", "Añadir flow")}</Text>
          </Pressable>
        </View>

        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileRail}>
          {profiles.map((profile) => {
            const selected = profile.id === selectedId;
            return (
              <Pressable key={profile.id} onPress={() => setSelectedId(profile.id)} style={[styles.profileCard, selected && styles.profileCardSelected]}>
                <View style={styles.profileCardTop}>
                  <Text style={styles.profileSymbol}>{profile.symbol}</Text>
                  <View style={[styles.statusDot, profile.status !== "active" && styles.statusPaused]} />
                </View>
                <Text style={styles.profileMeta}>{profile.last_flow_session_date ?? "—"}</Text>
              </Pressable>
            );
          })}
          {!profiles.length && !loading ? (
            <Pressable onPress={() => openAnalysis()} style={styles.emptyProfileCard}>
              <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              <Text style={styles.emptyProfileText}>{t(language, "New ticker", "Nuevo ticker")}</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        {workspace ? (
          <>
            <View style={styles.companyHeader}>
              <View style={styles.companyMonogram}><Text style={styles.companyMonogramText}>{workspace.profile.symbol.slice(0, 3)}</Text></View>
              <View style={styles.companyTitleBlock}>
                <Text style={styles.companyTitle}>{workspace.profile.symbol}</Text>
                <Text style={styles.companySubtitle}>{workspace.analyses.length} {t(language, "saved analyses", "análisis guardados")}</Text>
              </View>
              <View style={styles.biasPill}><Text style={styles.biasText}>{String(latestAgent.flowBias ?? "insufficient data").replaceAll("_", " ")}</Text></View>
            </View>

            <View style={styles.metricGrid}>
              <View style={styles.metric}><Text style={styles.metricLabel}>{t(language, "Latest close", "Último cierre")}</Text><Text style={styles.metricValue}>{money(latestBar?.close)}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>{t(language, "Daily move", "Movimiento diario")}</Text><Text style={[styles.metricValue, dailyMove != null && dailyMove < 0 ? styles.negative : styles.positive]}>{percent(dailyMove)}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>{t(language, "20-day return", "Retorno 20 días")}</Text><Text style={styles.metricValue}>{percent(trend.twentySessionReturnPct)}</Text></View>
              <View style={styles.metric}><Text style={styles.metricLabel}>{t(language, "Trend", "Tendencia")}</Text><Text style={styles.metricValue}>{String(trend.trendState ?? "DATA NOT AVAILABLE").replaceAll("_", " ")}</Text></View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}><Text style={styles.sectionEyebrow}>{t(language, "LATEST INTELLIGENCE READ", "ÚLTIMA LECTURA DE INTELIGENCIA")}</Text><Text style={styles.version}>v{latest?.version ?? "—"}</Text></View>
              <Text style={styles.summary}>{latestAgent.summary ?? "DATA NOT AVAILABLE"}</Text>
              <View style={styles.thesisCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.readLabel}>{t(language, "THESIS CHANGE", "CAMBIO DE TESIS")}</Text>
                  <Text style={styles.thesisStatus}>{String(latestThesisUpdate.classification ?? "INSUFFICIENT_EVIDENCE").replaceAll("_", " ")}</Text>
                </View>
                <Text style={styles.readBody}>{latestThesisUpdate.currentRead ?? "DATA NOT AVAILABLE"}</Text>
                <Text style={styles.deltaText}>
                  {latestDataQuality.evidencePeriodStart ?? "—"} · {latestDataQuality.evidencePeriodEnd ?? "—"}  |  {latestDataQuality.newUniqueRows ?? "—"} {t(language, "new", "nuevos")} · {latestDataQuality.repeatedRows ?? "—"} {t(language, "repeated", "repetidos")}
                </Text>
              </View>
              <View style={styles.readGrid}>
                <View style={styles.readCard}><Text style={styles.readLabel}>{t(language, "HORIZON", "HORIZONTE")}</Text><Text style={styles.readBody}>{latestAgent.horizonRead?.interpretation ?? "DATA NOT AVAILABLE"}</Text></View>
                <View style={styles.readCard}><Text style={styles.readLabel}>{t(language, "ACCUMULATION", "ACUMULACIÓN")}</Text><Text style={styles.readBody}>{latestAgent.accumulation?.classification ?? "DATA NOT AVAILABLE"}</Text></View>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionEyebrow}>{t(language, "OPEN INTEREST INTELLIGENCE", "INTELIGENCIA OPEN INTEREST")}</Text>
                <Text style={optionMarketData.configured ? styles.positive : styles.checkpointStatus}>
                  {optionMarketData.configured ? t(language, "AUTOMATIC", "AUTOMÁTICO") : t(language, "IMPORTS", "IMPORTS")}
                </Text>
              </View>
              <View style={styles.metricGrid}>
                <View style={styles.metric}><Text style={styles.metricLabel}>{t(language, "OI effective date", "Fecha efectiva OI")}</Text><Text style={styles.metricValue}>{oiIntelligence.asOfDate ?? "DATA NOT AVAILABLE"}</Text></View>
                <View style={styles.metric}><Text style={styles.metricLabel}>{t(language, "Comparable", "Comparables")}</Text><Text style={styles.metricValue}>{oiCoverage.contractsWithComparableOpenInterest ?? 0}</Text></View>
                <View style={styles.metric}><Text style={styles.metricLabel}>{t(language, "Net OI change", "Cambio neto OI")}</Text><Text style={styles.metricValue}>{compactNumber(oiTotals.confirmedOpenInterestChange)}</Text></View>
                <View style={styles.metric}><Text style={styles.metricLabel}>{t(language, "Reported change", "Cambio reportado")}</Text><Text style={styles.metricValue}>{compactNumber(oiTotals.reportedOpenInterestChange)}</Text></View>
                <View style={styles.metric}><Text style={styles.metricLabel}>{t(language, "Verified", "Verificados")}</Text><Text style={styles.metricValue}>{oiCoverage.verifiedContracts ?? 0}</Text></View>
              </View>
              <Text style={styles.oiCaution}>{t(
                language,
                "OI updates after overnight clearing and does not identify who is long or short.",
                "El OI se actualiza después de la consolidación nocturna y no identifica quién está long o short."
              )}</Text>
              {oiThesisUpdate ? <View style={styles.thesisCard}><Text style={styles.thesisStatus}>{String(oiThesisUpdate.classification ?? "INSUFFICIENT_EVIDENCE").replaceAll("_", " ")}</Text><Text style={styles.readBody}>{oiThesisUpdate.currentRead ?? oiThesisUpdate.headline ?? "DATA NOT AVAILABLE"}</Text></View> : null}
              {oiContracts.slice(0, 8).map((item: any) => (
                <View key={item.contractSymbol} style={styles.oiRow}>
                  <View style={styles.eventCopy}>
                    <Text style={styles.eventContract}>{item.contractSymbol}</Text>
                    <Text style={styles.eventMeta}>{item.openInterestAsOfDate ?? "DATA NOT AVAILABLE"} · {String(item.relationship ?? "insufficient_evidence").replaceAll("_", " ")}</Text>
                  </View>
                  <View style={styles.oiValues}>
                    <Text style={styles.eventPremium}>OI {compactNumber(item.openInterest)}</Text>
                    <Text style={Number(item.openInterestChange) > 0 ? styles.positive : Number(item.openInterestChange) < 0 ? styles.negative : styles.muted}>Δ {item.openInterestChange == null ? "—" : compactNumber(item.openInterestChange)}</Text>
                  </View>
                </View>
              ))}
              {!oiContracts.length ? <Text style={styles.muted}>{t(language, "No contract-level OI evidence yet.", "Aún no hay evidencia OI por contrato.")}</Text> : null}
            </View>

            <View style={[styles.section, styles.contradiction]}>
              <Text style={styles.contradictionLabel}>{t(language, "CONTRADICTION CHECK", "REVISIÓN DE CONTRADICCIÓN")}</Text>
              <Text style={styles.contradictionTitle}>{latestAgent.contradiction?.strongestAlternativeExplanation ?? "DATA NOT AVAILABLE"}</Text>
              <Text style={styles.readBody}>{latestAgent.contradiction?.whatWouldDisproveCurrentRead ?? "DATA NOT AVAILABLE"}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>{t(language, "HORIZON FOLLOW-UP", "SEGUIMIENTO DEL HORIZONTE")}</Text>
              {(workspace.checkpoints ?? []).slice(0, 6).map((item) => (
                <View key={item.id} style={styles.checkpointRow}>
                  <Text style={styles.checkpointDate}>{item.checkpoint_date}</Text>
                  <Text style={styles.checkpointStatus}>{String(item.classification ?? item.status).replaceAll("_", " ")}</Text>
                </View>
              ))}
              {!workspace.checkpoints.length ? <Text style={styles.muted}>{t(language, "No checkpoints yet.", "Aún no hay checkpoints.")}</Text> : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>{t(language, "RECENT FLOW", "FLOW RECIENTE")}</Text>
              {(workspace.events ?? []).slice(0, 12).map((item) => (
                <View key={item.id} style={styles.eventRow}>
                  <View style={styles.eventCopy}><Text style={styles.eventContract}>{item.contract_symbol ?? `${item.strike ?? "—"}${item.option_type ?? ""}`}</Text><Text style={styles.eventMeta}>{item.source_session_date} · {item.aggressor_side ?? "—"} · {item.expiry ?? "—"}</Text></View>
                  <Text style={styles.eventPremium}>{money(item.premium)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : !loading ? (
          <View style={styles.emptyState}><Ionicons name="analytics-outline" size={30} color={colors.primary} /><Text style={styles.emptyTitle}>{t(language, "No flow profiles yet", "Aún no hay perfiles de flow")}</Text><Pressable style={styles.primaryButton} onPress={() => openAnalysis()}><Text style={styles.primaryButtonText}>{t(language, "Create first profile", "Crear primer perfil")}</Text></Pressable></View>
        ) : null}
      </ScreenScaffold>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !submitting && setModalVisible(false)}>
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          <View style={styles.modalHeader}>
            <View><Text style={styles.sectionEyebrow}>{t(language, "NEW EVIDENCE", "EVIDENCIA NUEVA")}</Text><Text style={styles.modalTitle}>{t(language, "Run flow analysis", "Ejecutar análisis de flow")}</Text></View>
            <Pressable style={styles.iconButton} onPress={() => !submitting && setModalVisible(false)}><Ionicons name="close" size={22} color={colors.textPrimary} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.segmentRow}>
              <Pressable onPress={() => { setMode("today"); setHorizon("today"); }} style={[styles.segment, mode === "today" && styles.segmentActive]}><Text style={styles.segmentTitle}>{t(language, "Today", "Hoy")}</Text><Text style={styles.segmentMeta}>{t(language, "Current session", "Sesión actual")}</Text></Pressable>
              <Pressable onPress={() => { setMode("forward_positioning"); setHorizon("one_month"); }} style={[styles.segment, mode === "forward_positioning" && styles.segmentActive]}><Text style={styles.segmentTitle}>{t(language, "Future", "Futuro")}</Text><Text style={styles.segmentMeta}>{t(language, "Across expirations", "Entre expiraciones")}</Text></Pressable>
            </View>
            <Text style={styles.fieldLabel}>TICKER</Text>
            <TextInput value={symbol} onChangeText={(value) => setSymbol(cleanSymbol(value))} autoCapitalize="characters" placeholder="PLTR" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.fieldLabel}>{t(language, "FALLBACK DATE", "FECHA DE RESPALDO")}</Text>
            <TextInput value={flowDate} onChangeText={setFlowDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={styles.input} />
            <Text style={styles.fieldHelp}>{t(
              language,
              "Dates in the evidence are detected automatically. This is used only when the screenshot has no verifiable date.",
              "Las fechas de la evidencia se detectan automáticamente. Esta fecha solo se usa si el screenshot no tiene fecha verificable."
            )}</Text>
            <Text style={styles.fieldLabel}>PROVIDER</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>{PROVIDERS.map((item) => <Pressable key={item} onPress={() => setProvider(item)} style={[styles.chip, provider === item && styles.chipActive]}><Text style={styles.chipText}>{item}</Text></Pressable>)}</ScrollView>
            {mode === "forward_positioning" ? <><Text style={styles.fieldLabel}>{t(language, "EVALUATION HORIZON", "HORIZONTE DE EVALUACIÓN")}</Text><View style={styles.chipRail}>{(["one_week", "one_month", "three_months"] as Horizon[]).map((item) => <Pressable key={item} onPress={() => setHorizon(item)} style={[styles.chip, horizon === item && styles.chipActive]}><Text style={styles.chipText}>{item.replaceAll("_", " ")}</Text></Pressable>)}</View></> : null}
            <Text style={styles.fieldLabel}>{t(language, "SCREENSHOTS", "SCREENSHOTS")}</Text>
            <Pressable style={styles.uploadButton} onPress={() => void selectScreenshots()}><Ionicons name="images-outline" size={22} color={colors.info} /><Text style={styles.uploadTitle}>{t(language, "Choose flow screenshots", "Escoger screenshots de flow")}</Text><Text style={styles.uploadMeta}>{screenshots.length}/4</Text></Pressable>
            {screenshots.length ? <View style={styles.imageGrid}>{screenshots.map((item) => <View key={item.id} style={styles.imageTile}><Image source={{ uri: item.uri }} style={styles.image} /><Pressable onPress={() => setScreenshots((current) => current.filter((shot) => shot.id !== item.id))} style={styles.removeImage}><Ionicons name="close" size={14} color="#fff" /></Pressable></View>)}</View> : null}
            <Text style={styles.fieldLabel}>{t(language, "ANALYST NOTES", "NOTAS DEL ANALISTA")}</Text>
            <TextInput value={notes} onChangeText={setNotes} multiline maxLength={3000} placeholder={t(language, "Optional context", "Contexto opcional")} placeholderTextColor={colors.textMuted} style={[styles.input, styles.notesInput]} />
            <Pressable disabled={submitting || !screenshots.length || !cleanSymbol(symbol)} style={[styles.runButton, (submitting || !screenshots.length || !cleanSymbol(symbol)) && styles.disabled]} onPress={() => void runAnalysis()}>{submitting ? <ActivityIndicator color={colors.onPrimary} /> : <Ionicons name="sparkles-outline" size={18} color={colors.onPrimary} />}<Text style={styles.runButtonText}>{submitting ? t(language, "Running agents…", "Ejecutando agentes…") : t(language, "Run analysis", "Ejecutar análisis")}</Text></Pressable>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  trackingPill: { minHeight: 38, flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 11 },
  trackingText: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },
  primaryButton: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 14 },
  primaryButtonText: { color: colors.onPrimary, fontSize: 12, fontWeight: "800" },
  profileRail: { gap: 8, paddingVertical: 4 },
  profileCard: { width: 138, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12 },
  profileCardSelected: { borderColor: colors.primary, backgroundColor: colors.successSoft },
  profileCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  profileSymbol: { color: colors.textPrimary, fontSize: 17, fontWeight: "800" },
  profileMeta: { marginTop: 7, color: colors.textMuted, fontSize: 10 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  statusPaused: { backgroundColor: colors.warning },
  emptyProfileCard: { width: 138, minHeight: 70, alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed" },
  emptyProfileText: { color: colors.textMuted, fontSize: 11 },
  companyHeader: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 13 },
  companyMonogram: { width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.infoSoft, borderWidth: 1, borderColor: colors.info },
  companyMonogramText: { color: colors.textPrimary, fontSize: 15, fontWeight: "900" },
  companyTitleBlock: { flex: 1 }, companyTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: "800" },
  companySubtitle: { marginTop: 2, color: colors.textMuted, fontSize: 10 },
  biasPill: { maxWidth: 120, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.successSoft, paddingHorizontal: 8, paddingVertical: 5 },
  biasText: { color: colors.success, fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "48%", minHeight: 76, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 11 },
  metricLabel: { color: colors.textMuted, fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  metricValue: { marginTop: 8, color: colors.textPrimary, fontSize: 15, fontWeight: "800", textTransform: "capitalize" },
  positive: { color: colors.success }, negative: { color: colors.danger },
  section: { gap: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionEyebrow: { color: colors.primary, fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  version: { color: colors.textMuted, fontSize: 10 }, summary: { color: colors.textPrimary, fontSize: 16, lineHeight: 23, fontWeight: "700" },
  readGrid: { gap: 8 }, readCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 11 },
  readLabel: { color: colors.info, fontSize: 9, fontWeight: "800" }, readBody: { marginTop: 6, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  thesisCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 11 },
  thesisStatus: { color: colors.success, fontSize: 9, fontWeight: "900" },
  deltaText: { marginTop: 9, color: colors.textMuted, fontSize: 9, lineHeight: 14 },
  contradiction: { borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft }, contradictionLabel: { color: colors.dangerText, fontSize: 9, fontWeight: "800" },
  contradictionTitle: { color: colors.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: "700" },
  checkpointRow: { minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border },
  checkpointDate: { color: colors.textPrimary, fontSize: 11 }, checkpointStatus: { color: colors.warning, fontSize: 10, textTransform: "capitalize" },
  eventRow: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  eventCopy: { flex: 1 }, eventContract: { color: colors.textPrimary, fontSize: 11, fontWeight: "700" }, eventMeta: { marginTop: 3, color: colors.textMuted, fontSize: 9 },
  eventPremium: { color: colors.textPrimary, fontSize: 11, fontWeight: "700" }, muted: { color: colors.textMuted, fontSize: 11 },
  oiCaution: { borderLeftWidth: 2, borderLeftColor: colors.warning, paddingLeft: 9, color: colors.textMuted, fontSize: 10, lineHeight: 16 },
  oiRow: { minHeight: 58, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  oiValues: { alignItems: "flex-end", gap: 4 },
  emptyState: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 20 },
  emptyTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
  modalRoot: { flex: 1 }, modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.border, padding: 18 },
  modalTitle: { marginTop: 3, color: colors.textPrimary, fontSize: 21, fontWeight: "800" }, iconButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  modalContent: { gap: 12, padding: 18, paddingBottom: 40 }, segmentRow: { flexDirection: "row", gap: 8 },
  segment: { flex: 1, minHeight: 70, justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 11 },
  segmentActive: { borderColor: colors.primary, backgroundColor: colors.successSoft }, segmentTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: "800" }, segmentMeta: { marginTop: 5, color: colors.textMuted, fontSize: 9 },
  fieldLabel: { marginTop: 5, color: colors.textMuted, fontSize: 9, fontWeight: "800" }, input: { minHeight: 46, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary, paddingHorizontal: 12, fontSize: 13 },
  fieldHelp: { marginTop: -6, color: colors.textMuted, fontSize: 9, lineHeight: 14 },
  notesInput: { minHeight: 90, paddingTop: 12, textAlignVertical: "top" }, chipRail: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: { minHeight: 36, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10 },
  chipActive: { borderColor: colors.info, backgroundColor: colors.infoSoft }, chipText: { color: colors.textPrimary, fontSize: 10, textTransform: "capitalize" },
  uploadButton: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderStyle: "dashed", borderColor: colors.info, backgroundColor: colors.infoSoft, padding: 13 },
  uploadTitle: { flex: 1, color: colors.textPrimary, fontSize: 12, fontWeight: "700" }, uploadMeta: { color: colors.textMuted, fontSize: 10 },
  imageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 }, imageTile: { width: "48%", aspectRatio: 1.6, borderWidth: 1, borderColor: colors.border }, image: { width: "100%", height: "100%" },
  removeImage: { position: "absolute", right: 5, top: 5, width: 25, height: 25, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(2,11,38,.9)" },
  runButton: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, marginTop: 8 },
  runButtonText: { color: colors.onPrimary, fontSize: 13, fontWeight: "900" }, disabled: { opacity: 0.45 },
});
