import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  NavigationContainer,
  createNavigationContainerRef,
  type NavigatorScreenParams,
  useNavigation,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableFreeze, enableScreens } from "react-native-screens";
import type { Session } from "@supabase/supabase-js";
import { ActivityIndicator, InteractionManager, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import * as Notifications from "expo-notifications";

import { DashboardScreen } from "./src/screens/DashboardScreen";
import { CalendarScreen } from "./src/screens/CalendarScreen";
import { AnalyticsScreen } from "./src/screens/AnalyticsScreen";
import { AICoachScreen } from "./src/screens/AICoachScreen";
import { SettingsScreen } from "./src/screens/MoreScreen";
import { BusinessProgressScreen } from "./src/screens/BusinessProgressScreen";
import { JournalDateScreen } from "./src/screens/JournalDateScreen";
import { NotebookScreen } from "./src/screens/NotebookScreen";
import { NotebookWorkspaceScreen } from "./src/screens/NotebookWorkspaceScreen";
import { NotebookEditorScreen } from "./src/screens/NotebookEditorScreen";
import { BrokerConnectScreen } from "./src/screens/BrokerConnectScreen";
import { BusinessPlanScreen } from "./src/screens/BusinessPlanScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { ResetPasswordScreen } from "./src/screens/ResetPasswordScreen";
import { ThemeProvider, useTheme } from "./src/lib/ThemeContext";
import { LanguageProvider } from "./src/lib/LanguageContext";
import { useLanguage } from "./src/lib/LanguageContext";
import { hasSupabaseConfig, supabaseMobile } from "./src/lib/supabase";
import { createRecoverySessionFromUrl, isPasswordRecoveryUrl } from "./src/lib/authRecovery";
import { registerDeviceForPush } from "./src/lib/pushNotifications";
import { ModulePlaceholderScreen } from "./src/screens/ModulePlaceholderScreen";
import { PlanGate } from "./src/components/PlanGate";
import { t } from "./src/lib/i18n";
import type { ModuleRouteOptions, ModuleRouteParams } from "./src/lib/moduleNavigation";
import { usePlanAccess } from "./src/lib/usePlanAccess";
import { apiGet, apiPost } from "./src/lib/api";

enableScreens(true);
enableFreeze(true);

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

type MainTabParamList = {
  Dashboard: undefined;
  Calendar: undefined;
  Analytics: undefined;
  AICoach: undefined;
  BusinessProgress: undefined;
};

type RootStackParamList = {
  Auth: undefined;
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  LegalAcceptance: undefined;
  PaymentRequired: undefined;
  ResetPassword: undefined;
  Module: ModuleRouteParams;
  Settings: undefined;
  JournalDate: { date?: string } | undefined;
  Notebook: undefined;
  NotebookWorkspace: { notebookId: string; title?: string };
  NotebookEditor: { kind: "page" | "free"; id: string; title?: string };
  BrokerConnect: undefined;
  BusinessPlan: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
type AccessStatusResponse = {
  hasAppAccess?: boolean;
};

type LegalAcceptanceStatus = {
  accepted?: boolean;
  requiresAcceptance?: boolean;
  termsVersion?: string;
  privacyVersion?: string;
};

function MainTabs() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const planAccess = usePlanAccess();
  const tabTitles = useMemo(
    () => ({
      Dashboard: t(language, "Business Center", "Centro Empresarial"),
      Calendar: t(language, "P&L Calendar", "Calendario P&L"),
      Analytics: t(language, "Business KPIs", "KPIs Empresariales"),
      AICoach: t(language, "Business Coach", "Coach Empresarial"),
      BusinessProgress: t(language, "Business Progress", "Progreso del negocio"),
    }),
    [language]
  );

  const openModule = useCallback((title: string, description: string, options?: ModuleRouteOptions) => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("Module", { title, description, ...options });
      return;
    }
    navigation.navigate("Module", { title, description, ...options });
  }, [navigation]);

  const openSettings = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("Settings");
      return;
    }
    // fallback if navigation is already the stack
    (navigation as unknown as NativeStackNavigationProp<RootStackParamList>).navigate("Settings");
  }, [navigation]);

  const openJournalDate = useCallback((date?: string) => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("JournalDate", date ? { date } : undefined);
      return;
    }
    navigation.navigate("JournalDate", date ? { date } : undefined);
  }, [navigation]);

  const openBusinessPlan = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("BusinessPlan");
      return;
    }
    navigation.navigate("BusinessPlan");
  }, [navigation]);

  const openNotebook = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("Notebook");
      return;
    }
    navigation.navigate("Notebook");
  }, [navigation]);

  return (
      <Tab.Navigator
        detachInactiveScreens
        screenOptions={({ route }) => ({
          lazy: true,
          freezeOnBlur: true,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: "700" },
          headerTitle: () => (
            <Text style={[styles.headerText, { color: colors.textPrimary }]}>{tabTitles[route.name]}</Text>
          ),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(language, "Open app settings", "Abrir ajustes de la app")}
              hitSlop={10}
              onPress={openSettings}
              style={styles.settingsButton}
            >
              <Ionicons name="settings-outline" size={22} color={colors.textPrimary} />
            </Pressable>
          ),
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarPosition: "bottom",
          tabBarVariant: "uikit",
          tabBarLabelPosition: "below-icon",
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          sceneStyle: { backgroundColor: colors.background },
          tabBarIcon: ({ color, size }) => {
            if (route.name === "Dashboard") return <Ionicons name="home-outline" size={size} color={color} />;
            if (route.name === "Calendar") return <Ionicons name="calendar-outline" size={size} color={color} />;
            if (route.name === "Analytics") return <Ionicons name="stats-chart-outline" size={size} color={color} />;
            if (route.name === "AICoach") return <Ionicons name="sparkles-outline" size={size} color={color} />;
            return <Ionicons name="trending-up-outline" size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Dashboard" options={{ title: t(language, "Center", "Centro") }}>
          {() => (
            <DashboardScreen
              onOpenJournalDate={openJournalDate}
              onOpenBusinessPlan={openBusinessPlan}
              onOpenNotebook={openNotebook}
              onOpenAICoach={() => navigation.navigate("Tabs", { screen: "AICoach" })}
            />
          )}
        </Tab.Screen>
        <Tab.Screen name="Calendar" options={{ title: "P&L" }}>
          {() => <CalendarScreen onOpenModule={openModule} onOpenJournalDate={openJournalDate} />}
        </Tab.Screen>
        <Tab.Screen name="Analytics" options={{ title: "KPIs" }}>
          {() => <AnalyticsScreen onOpenModule={openModule} isAdvanced={planAccess.hasAdvancedAnalytics} />}
        </Tab.Screen>
        <Tab.Screen name="AICoach" options={{ title: t(language, "Coach", "Coach") }}>
          {() =>
            planAccess.hasAICoaching ? (
              <AICoachScreen onOpenModule={openModule} />
            ) : (
              <PlanGate
                title={t(language, "Business AI Coach", "Coach Empresarial IA")}
                badge="Advanced"
                loading={planAccess.loading}
                subtitle={t(
                  language,
                  "Business AI Coaching, action plans, and mindset feedback are included in Advanced.",
                  "Business AI Coaching, planes de acción y feedback de mindset están incluidos en Advanced."
                )}
              />
            )
          }
        </Tab.Screen>
        <Tab.Screen name="BusinessProgress" options={{ title: t(language, "Progress", "Progreso") }}>
          {() => <BusinessProgressScreen onOpenBusinessPlan={openBusinessPlan} />}
        </Tab.Screen>
      </Tab.Navigator>
  );
}

function LegalAcceptanceScreen({
  status,
  checking,
  error,
  onAccept,
  onRetry,
  onSignOut,
}: {
  status: LegalAcceptanceStatus | null;
  checking: boolean;
  error: string | null;
  onAccept: () => Promise<void>;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: {
          flex: 1,
          justifyContent: "center",
          backgroundColor: colors.background,
          padding: 22,
        },
        card: {
          gap: 14,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          backgroundColor: colors.surface,
          padding: 20,
        },
        kicker: {
          color: colors.primary,
          fontSize: 11,
          fontWeight: "800",
          letterSpacing: 1.2,
          textTransform: "uppercase",
        },
        title: {
          color: colors.textPrimary,
          fontSize: 24,
          fontWeight: "800",
        },
        body: {
          color: colors.textMuted,
          fontSize: 14,
          lineHeight: 21,
        },
        links: {
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        },
        linkButton: {
          minHeight: 42,
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: 12,
        },
        linkText: {
          color: colors.primary,
          fontSize: 13,
          fontWeight: "700",
        },
        consentRow: {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          borderWidth: 1,
          borderColor: accepted ? colors.primary : colors.border,
          borderRadius: 8,
          backgroundColor: colors.card,
          padding: 12,
        },
        consentText: {
          flex: 1,
          color: colors.textPrimary,
          fontSize: 13,
          lineHeight: 19,
        },
        error: {
          color: colors.dangerText,
          fontSize: 13,
          lineHeight: 18,
        },
        primaryButton: {
          minHeight: 48,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          backgroundColor: colors.primary,
          paddingHorizontal: 16,
        },
        primaryButtonDisabled: {
          opacity: 0.45,
        },
        primaryText: {
          color: colors.onPrimary,
          fontSize: 14,
          fontWeight: "800",
        },
        secondaryButton: {
          minHeight: 44,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
        },
        secondaryText: {
          color: colors.textMuted,
          fontSize: 13,
          fontWeight: "700",
        },
      }),
    [accepted, colors]
  );

  const handleAccept = async () => {
    if (!accepted || saving || checking) return;
    setSaving(true);
    try {
      await onAccept();
    } catch {
      // The parent exposes the server message in the screen-level error state.
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.kicker}>{t(language, "Account terms update", "Actualizacion de terminos")}</Text>
        <Text style={styles.title}>{t(language, "Review and accept to continue", "Revisa y acepta para continuar")}</Text>
        <Text style={styles.body}>
          {t(
            language,
            "NeuroTrader is an educational planning and accountability tool. Its analytics, simulations, projections, and AI outputs are not financial advice and do not guarantee income, profit, capital growth, or trading results.",
            "NeuroTrader es una herramienta educativa de planificacion y accountability. Sus analiticas, simulaciones, proyecciones y resultados de IA no son asesoria financiera ni garantizan ingresos, ganancias, crecimiento de capital o resultados de trading."
          )}
        </Text>
        <View style={styles.links}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t(language, "Read Terms and Conditions", "Leer Terminos y Condiciones")}
            onPress={() => void Linking.openURL("https://www.neurotrader-journal.com/terms")}
            style={styles.linkButton}
          >
            <Ionicons name="document-text-outline" size={18} color={colors.primary} />
            <Text style={styles.linkText}>{t(language, "Terms", "Terminos")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t(language, "Read Privacy Policy", "Leer Politica de Privacidad")}
            onPress={() => void Linking.openURL("https://www.neurotrader-journal.com/privacy")}
            style={styles.linkButton}
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.primary} />
            <Text style={styles.linkText}>{t(language, "Privacy", "Privacidad")}</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          accessibilityLabel={t(language, "Accept current legal terms and AI data processing", "Aceptar terminos vigentes y procesamiento de datos por IA")}
          onPress={() => setAccepted((value) => !value)}
          style={styles.consentRow}
        >
          <Ionicons
            name={accepted ? "checkbox" : "square-outline"}
            size={23}
            color={accepted ? colors.primary : colors.textMuted}
          />
          <Text style={styles.consentText}>
            {t(
              language,
              "I accept the current Terms and Privacy Policy. When I choose an AI feature, I also consent to NeuroTrader sending the selected plans, journal records, trades, analytics, notes, and screenshots needed for that request to OpenAI or another disclosed AI service provider.",
              "Acepto los Terminos y la Politica de Privacidad vigentes. Cuando elijo una funcion de IA, tambien autorizo a NeuroTrader a enviar a OpenAI u otro proveedor de IA divulgado los planes, registros del journal, trades, analiticas, notas y screenshots seleccionados que sean necesarios para esa solicitud."
            )}
          </Text>
        </Pressable>
        {status?.termsVersion && status?.privacyVersion ? (
          <Text style={styles.body}>
            {t(language, "Versions", "Versiones")}: {status.termsVersion} / {status.privacyVersion}
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {error && !status ? (
          <Pressable style={styles.secondaryButton} onPress={onRetry} disabled={checking}>
            <Ionicons name="refresh" size={18} color={colors.textMuted} />
            <Text style={styles.secondaryText}>
              {checking ? t(language, "Checking...", "Verificando...") : t(language, "Try again", "Intentar de nuevo")}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(language, "Accept and continue", "Aceptar y continuar")}
          style={[styles.primaryButton, (!accepted || saving || checking || !status) && styles.primaryButtonDisabled]}
          onPress={() => void handleAccept()}
          disabled={!accepted || saving || checking || !status}
        >
          {saving ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryText}>{t(language, "Accept and continue", "Aceptar y continuar")}</Text>
          )}
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onSignOut}>
          <Ionicons name="arrow-back" size={18} color={colors.textMuted} />
          <Text style={styles.secondaryText}>{t(language, "Return to sign in", "Volver a iniciar sesion")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PaymentRequiredScreen({
  checking,
  error,
  onRetry,
  onSignOut,
}: {
  checking: boolean;
  error: string | null;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: colors.background,
          padding: 24,
          justifyContent: "center",
        },
        eyebrow: {
          color: colors.primary,
          fontSize: 12,
          fontWeight: "800",
          letterSpacing: 1.8,
          textTransform: "uppercase",
          marginBottom: 10,
        },
        title: {
          color: colors.textPrimary,
          fontSize: 30,
          lineHeight: 36,
          fontWeight: "900",
          marginBottom: 12,
        },
        body: {
          color: colors.textMuted,
          fontSize: 15,
          lineHeight: 22,
          marginBottom: 22,
        },
        panel: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: 8,
          padding: 16,
          marginBottom: 22,
        },
        panelTitle: {
          color: colors.textPrimary,
          fontSize: 15,
          fontWeight: "800",
          marginBottom: 6,
        },
        panelText: {
          color: colors.textMuted,
          fontSize: 13,
          lineHeight: 19,
        },
        error: {
          color: "#fda4af",
          fontSize: 12,
          lineHeight: 18,
          marginBottom: 12,
        },
        button: {
          minHeight: 48,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 16,
          marginTop: 10,
        },
        primaryButton: {
          backgroundColor: colors.primary,
        },
        dangerButton: {
          backgroundColor: "transparent",
        },
        primaryText: {
          color: "#00130f",
          fontSize: 14,
          fontWeight: "900",
        },
        dangerText: {
          color: colors.textMuted,
          fontSize: 13,
          fontWeight: "700",
        },
        returnRow: {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
      }),
    [colors]
  );

  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>{t(language, "Business access", "Acceso empresarial")}</Text>
      <Text style={styles.title}>
        {t(language, "Sign in with an active Trader Entrepreneur account.", "Entra con una cuenta activa de Empresario Trader.")}
      </Text>
      <Text style={styles.body}>
        {t(
          language,
          "The mobile app is free to download and opens for active NeuroTrader members with account access enabled.",
          "El app móvil es gratis para descargar y se abre para miembros activos de NeuroTrader con acceso de cuenta habilitado."
        )}
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>
          {t(language, "Why this matters", "Por que esto importa")}
        </Text>
        <Text style={styles.panelText}>
          {t(
            language,
            "Your execution records, analytics, notebooks, AI tools, and broker connections stay protected behind the same business account security layer.",
            "Tus registros de ejecución, analíticas, notebooks, herramientas de IA y conexiones de bróker quedan protegidas detrás de la misma capa de seguridad de cuenta empresarial."
          )}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.button, styles.primaryButton]} onPress={onRetry} disabled={checking}>
        <Text style={styles.primaryText}>
          {checking ? t(language, "Checking...", "Verificando...") : t(language, "Check access", "Verificar acceso")}
        </Text>
      </Pressable>
      <Pressable style={[styles.button, styles.dangerButton]} onPress={onSignOut}>
        <View style={styles.returnRow}>
          <Ionicons name="arrow-back" size={18} color={colors.textMuted} />
          <Text style={styles.dangerText}>{t(language, "Return to sign in", "Volver a iniciar sesion")}</Text>
        </View>
      </Pressable>
    </View>
  );
}

function AppShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accessReady, setAccessReady] = useState(!hasSupabaseConfig);
  const [hasAppAccess, setHasAppAccess] = useState(!hasSupabaseConfig);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [legalReady, setLegalReady] = useState(!hasSupabaseConfig);
  const [legalStatus, setLegalStatus] = useState<LegalAcceptanceStatus | null>(null);
  const [legalError, setLegalError] = useState<string | null>(null);
  const [navReady, setNavReady] = useState(false);
  const [recoverySessionReady, setRecoverySessionReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [shouldOpenResetScreen, setShouldOpenResetScreen] = useState(false);
  const lastNotificationResponseId = useRef<string | null>(null);
  const { colors, mode: themeMode } = useTheme();
  const { language } = useLanguage();
  const loadingStyles = useMemo(
    () =>
      StyleSheet.create({
        loading: {
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
        },
        loadingText: {
          color: colors.textMuted,
          fontSize: 12,
        },
      }),
    [colors]
  );

  useEffect(() => {
    if (!supabaseMobile) {
      setAuthReady(true);
      return;
    }

    let active = true;

    supabaseMobile.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session ?? null);
      })
      .catch((error) => {
        console.warn("[mobile] unable to restore the authentication session:", error);
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabaseMobile.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === "PASSWORD_RECOVERY") {
        setRecoverySessionReady(Boolean(nextSession));
        setRecoveryError(null);
        setShouldOpenResetScreen(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const refreshAccessStatus = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setHasAppAccess(true);
      setAccessReady(true);
      setAccessError(null);
      return;
    }
    if (!session?.user?.id) {
      setHasAppAccess(false);
      setAccessReady(true);
      setAccessError(null);
      return;
    }

    setAccessReady(false);
    setLegalReady(false);
    setAccessError(null);
    try {
      const access = await apiGet<AccessStatusResponse>("/api/access/status");
      setHasAppAccess(Boolean(access?.hasAppAccess));
    } catch (err) {
      setHasAppAccess(false);
      setAccessError(err instanceof Error ? err.message : "Unable to verify account access.");
    } finally {
      setAccessReady(true);
    }
  }, [session?.user?.id, session?.access_token]);

  useEffect(() => {
    let active = true;
    (async () => {
      await refreshAccessStatus();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [refreshAccessStatus]);

  const refreshLegalAcceptance = useCallback(async () => {
    if (!hasSupabaseConfig) {
      setLegalStatus({ accepted: true, requiresAcceptance: false });
      setLegalReady(true);
      setLegalError(null);
      return;
    }
    if (!session?.user?.id || !hasAppAccess) {
      setLegalStatus(null);
      setLegalReady(true);
      setLegalError(null);
      return;
    }

    setLegalReady(false);
    setLegalError(null);
    try {
      const status = await apiGet<LegalAcceptanceStatus>("/api/legal/acceptance");
      setLegalStatus(status);
    } catch (err) {
      setLegalStatus(null);
      setLegalError(
        err instanceof Error
          ? err.message
          : t(language, "Unable to verify the current terms.", "No se pudieron verificar los terminos vigentes.")
      );
    } finally {
      setLegalReady(true);
    }
  }, [hasAppAccess, language, session?.access_token, session?.user?.id]);

  useEffect(() => {
    void refreshLegalAcceptance();
  }, [refreshLegalAcceptance]);

  useEffect(() => {
    if (!supabaseMobile) return;

    let active = true;

    async function handleRecoveryUrl(url: string | null | undefined) {
      if (!url || !isPasswordRecoveryUrl(url)) return;
      try {
        const nextSession = await createRecoverySessionFromUrl(url);
        if (!active) return;
        setRecoverySessionReady(Boolean(nextSession));
        setRecoveryError(null);
      } catch (err) {
        if (!active) return;
        setRecoverySessionReady(false);
        setRecoveryError(err instanceof Error ? err.message : "Recovery link error");
      } finally {
        if (active) {
          setShouldOpenResetScreen(true);
        }
      }
    }

    Linking.getInitialURL()
      .then((url) => handleRecoveryUrl(url))
      .catch(() => null);

    const subscription = Linking.addEventListener("url", ({ url }) => {
      void handleRecoveryUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id || !hasAppAccess) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        (async () => {
          try {
            await registerDeviceForPush({
              locale: language,
              promptIfNeeded: false,
            });
          } catch (err) {
            if (!cancelled) {
              console.warn("[mobile] push auto-registration failed:", err);
            }
          }
        })();
      }, 1200);
    });

    return () => {
      cancelled = true;
      try {
        task.cancel?.();
      } catch {}
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [session?.user?.id, hasAppAccess, language]);

  useEffect(() => {
    if (!navReady || !shouldOpenResetScreen || !navigationRef.isReady()) return;
    navigationRef.navigate("ResetPassword");
    setShouldOpenResetScreen(false);
  }, [navReady, shouldOpenResetScreen]);

  useEffect(() => {
    if (!navReady || !session?.user?.id || !hasAppAccess || !navigationRef.isReady()) return;

    const openNotification = (response: Notifications.NotificationResponse | null) => {
      if (!response || !navigationRef.isReady()) return;
      const responseId = response.notification.request.identifier;
      if (lastNotificationResponseId.current === responseId) return;
      lastNotificationResponseId.current = responseId;

      const data = response.notification.request.content.data ?? {};
      const screen = String(data.screen ?? "Dashboard");
      if (screen === "AICoach") {
        navigationRef.navigate("Tabs", { screen: "AICoach" });
      } else if (screen === "Calendar") {
        navigationRef.navigate("Tabs", { screen: "Calendar" });
      } else if (screen === "JournalDate" && typeof data.date === "string") {
        navigationRef.navigate("JournalDate", { date: data.date });
      } else {
        navigationRef.navigate("Tabs", { screen: "Dashboard" });
      }
    };

    void Notifications.getLastNotificationResponseAsync().then(openNotification).catch(() => null);
    const subscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    return () => subscription.remove();
  }, [hasAppAccess, navReady, session?.user?.id]);

  const requiresLegalAcceptance = Boolean(legalStatus?.requiresAcceptance) || Boolean(legalError);
  const shouldShowMainTabs =
    !hasSupabaseConfig || (Boolean(session) && hasAppAccess && legalReady && !requiresLegalAcceptance);
  const shouldShowLegalAcceptance =
    hasSupabaseConfig && Boolean(session) && hasAppAccess && legalReady && requiresLegalAcceptance;
  const shouldShowPaymentRequired = hasSupabaseConfig && Boolean(session) && accessReady && !hasAppAccess;
  const shouldShowLoading =
    !authReady ||
    (hasSupabaseConfig && Boolean(session) && !accessReady) ||
    (hasSupabaseConfig && Boolean(session) && hasAppAccess && !legalReady);
  const postAuthRoute: "Tabs" | "LegalAcceptance" | "PaymentRequired" | "Auth" = shouldShowMainTabs
    ? "Tabs"
    : shouldShowLegalAcceptance
    ? "LegalAcceptance"
    : shouldShowPaymentRequired
    ? "PaymentRequired"
    : "Auth";

  const handleSignOut = useCallback(() => {
    void supabaseMobile?.auth.signOut();
    setSession(null);
    setHasAppAccess(false);
    setAccessReady(true);
    setAccessError(null);
    setLegalStatus(null);
    setLegalReady(false);
    setLegalError(null);
    if (navigationRef.isReady()) {
      navigationRef.reset({
        index: 0,
        routes: [{ name: "Auth" }],
      });
    }
  }, []);

  const handleLegalAccept = useCallback(async () => {
    if (!legalStatus?.termsVersion || !legalStatus?.privacyVersion) {
      throw new Error(
        t(language, "Current legal versions are unavailable. Try again.", "Las versiones legales no estan disponibles. Intenta de nuevo.")
      );
    }
    try {
      await apiPost("/api/legal/acceptance", {
        legalAccepted: true,
        termsVersion: legalStatus.termsVersion,
        privacyVersion: legalStatus.privacyVersion,
        source: "in_app_update",
        disclosureVersion: "mobile-ai-data-v1",
        location: "mobile_workspace_gate",
      });
      setLegalStatus((current) => ({ ...current, accepted: true, requiresAcceptance: false }));
      setLegalError(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t(language, "Could not record acceptance.", "No se pudo guardar la aceptacion.");
      setLegalError(message);
      throw err;
    }
  }, [language, legalStatus?.privacyVersion, legalStatus?.termsVersion]);

  const handleResetPasswordDone = useCallback(() => {
    setRecoveryError(null);
    setRecoverySessionReady(false);
    void refreshAccessStatus();
    if (navigationRef.isReady()) {
      navigationRef.reset({
        index: 0,
        routes: [{ name: postAuthRoute }],
      });
    }
  }, [postAuthRoute, refreshAccessStatus]);

  const handleResetPasswordCancel = useCallback(() => {
    setRecoveryError(null);
    setRecoverySessionReady(false);
    if (!navigationRef.isReady()) return;
    navigationRef.reset({
      index: 0,
      routes: [{ name: postAuthRoute }],
    });
  }, [postAuthRoute]);

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setNavReady(true)}>
      <StatusBar style={themeMode === "light" ? "dark" : "light"} />
      {shouldShowLoading ? (
        <View style={loadingStyles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={loadingStyles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.textPrimary,
            headerBackTitle: t(language, "Back", "Atrás"),
            headerBackVisible: !shouldShowMainTabs,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          {shouldShowMainTabs ? (
            <Stack.Screen name="Tabs" options={{ headerShown: false }}>
              {() => <MainTabs />}
            </Stack.Screen>
          ) : shouldShowLegalAcceptance ? (
            <Stack.Screen name="LegalAcceptance" options={{ headerShown: false }}>
              {() => (
                <LegalAcceptanceScreen
                  status={legalStatus}
                  checking={!legalReady}
                  error={legalError}
                  onAccept={handleLegalAccept}
                  onRetry={() => void refreshLegalAcceptance()}
                  onSignOut={handleSignOut}
                />
              )}
            </Stack.Screen>
          ) : shouldShowPaymentRequired ? (
            <Stack.Screen name="PaymentRequired" options={{ headerShown: false }}>
              {() => (
                <PaymentRequiredScreen
                  checking={!accessReady}
                  error={accessError}
                  onRetry={refreshAccessStatus}
                  onSignOut={handleSignOut}
                />
              )}
            </Stack.Screen>
          ) : (
            <Stack.Screen name="Auth" options={{ headerShown: false }} component={AuthScreen} />
          )}
          <Stack.Screen
            name="ResetPassword"
            options={{ title: t(language, "Reset password", "Resetear contraseña") }}
          >
            {() => (
              <ResetPasswordScreen
                initialError={recoveryError}
                hasRecoverySession={recoverySessionReady}
                onComplete={handleResetPasswordDone}
                onCancel={handleResetPasswordCancel}
              />
            )}
          </Stack.Screen>
          <Stack.Screen
            name="Module"
            component={ModulePlaceholderScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
          <Stack.Screen name="Settings" options={{ title: t(language, "Settings", "Ajustes") }}>
            {() => <SettingsScreen onAccountDeleted={handleSignOut} />}
          </Stack.Screen>
          <Stack.Screen
            name="JournalDate"
            component={JournalDateScreen}
            options={{ title: "Execution Journal" }}
          />
          <Stack.Screen
            name="Notebook"
            component={NotebookScreen}
            options={{ title: "Business Notebook" }}
          />
          <Stack.Screen
            name="NotebookWorkspace"
            component={NotebookWorkspaceScreen}
            options={({ route }) => ({ title: (route.params as { title?: string } | undefined)?.title ?? "Business Notebook" })}
          />
          <Stack.Screen
            name="NotebookEditor"
            component={NotebookEditorScreen}
            options={{ title: "Business Notebook" }}
          />
          <Stack.Screen
            name="BrokerConnect"
            component={BrokerConnectScreen}
            options={{ title: "Broker connect" }}
          />
          <Stack.Screen
            name="BusinessPlan"
            component={BusinessPlanScreen}
            options={{ title: "Trading Business Plan" }}
          />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  headerText: {
    fontSize: 16,
    fontWeight: "700",
  },
  settingsButton: {
    width: 42,
    height: 42,
    marginRight: 6,
    alignItems: "center",
    justifyContent: "center",
  },
});
