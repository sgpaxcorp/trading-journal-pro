import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  NavigationContainer,
  createNavigationContainerRef,
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
import { OtherScreen } from "./src/screens/OtherScreen";
import { GlobalRankingScreen } from "./src/screens/GlobalRankingScreen";
import { JournalDateScreen } from "./src/screens/JournalDateScreen";
import { TrophiesScreen } from "./src/screens/TrophiesScreen";
import { NotebookScreen } from "./src/screens/NotebookScreen";
import { NotebookWorkspaceScreen } from "./src/screens/NotebookWorkspaceScreen";
import { NotebookEditorScreen } from "./src/screens/NotebookEditorScreen";
import { ChallengesScreen } from "./src/screens/ChallengesScreen";
import { BrokerConnectScreen } from "./src/screens/BrokerConnectScreen";
import { AuthScreen } from "./src/screens/AuthScreen";
import { ResetPasswordScreen } from "./src/screens/ResetPasswordScreen";
import { ThemeProvider, useTheme } from "./src/lib/ThemeContext";
import { LanguageProvider } from "./src/lib/LanguageContext";
import { useLanguage } from "./src/lib/LanguageContext";
import { hasSupabaseConfig, supabaseMobile } from "./src/lib/supabase";
import { createRecoverySessionFromUrl, isPasswordRecoveryUrl } from "./src/lib/authRecovery";
import { registerDeviceForPush } from "./src/lib/pushNotifications";
import { ModulePlaceholderScreen } from "./src/screens/ModulePlaceholderScreen";
import { MoreSheet } from "./src/components/MoreSheet";
import { PlanGate } from "./src/components/PlanGate";
import { t } from "./src/lib/i18n";
import { usePlanAccess } from "./src/lib/usePlanAccess";
import { apiGet } from "./src/lib/api";

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
  Other: undefined;
};

type RootStackParamList = {
  Auth: undefined;
  Tabs: undefined;
  PaymentRequired: undefined;
  ResetPassword: undefined;
  Module: { title: string; description: string };
  Settings: undefined;
  JournalDate: { date?: string } | undefined;
  GlobalRanking: undefined;
  Trophies: undefined;
  Notebook: undefined;
  NotebookWorkspace: { notebookId: string; title?: string };
  NotebookEditor: { kind: "page" | "free"; id: string; title?: string };
  Challenges: undefined;
  BrokerConnect: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();
const WEB_BASE = "https://www.neurotrader-journal.com";

type AccessStatusResponse = {
  hasAppAccess?: boolean;
};

function MainTabs() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const planAccess = usePlanAccess();
  const [moreOpen, setMoreOpen] = useState(false);

  const openModule = useCallback((title: string, description: string) => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("Module", { title, description });
      return;
    }
    navigation.navigate("Module", { title, description });
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

  const openGlobalRanking = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("GlobalRanking");
      return;
    }
    navigation.navigate("GlobalRanking");
  }, [navigation]);

  const openTrophies = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("Trophies");
      return;
    }
    navigation.navigate("Trophies");
  }, [navigation]);

  const openNotebook = useCallback(() => {
    if (!planAccess.loading && !planAccess.isAdvanced) {
      openModule(
        t(language, "Notebook · Advanced", "Notebook · Advanced"),
        t(
          language,
          "Custom notebooks, sections, pages, ink, and research notes are included in Advanced.",
          "Libretas custom, secciones, páginas, ink y notas de research están incluidas en Advanced."
        )
      );
      return;
    }
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("Notebook");
      return;
    }
    navigation.navigate("Notebook");
  }, [language, navigation, openModule, planAccess.isAdvanced, planAccess.loading]);

  const openChallenges = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("Challenges");
      return;
    }
    navigation.navigate("Challenges");
  }, [navigation]);

  const openBrokerConnect = useCallback(() => {
    if (!planAccess.loading && !planAccess.hasBrokerSync) {
      openModule(
        t(language, "Broker Sync · Add-on", "Broker Sync · Add-on"),
        t(
          language,
          "Broker connection and automatic sync require the Broker Sync add-on.",
          "La conexión de bróker y sincronización automática requieren el add-on Broker Sync."
        )
      );
      return;
    }
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("BrokerConnect");
      return;
    }
    navigation.navigate("BrokerConnect");
  }, [language, navigation, openModule, planAccess.hasBrokerSync, planAccess.loading]);

  const handleMoreSelect = useCallback((action: () => void) => {
    setMoreOpen(false);
    setTimeout(action, 120);
  }, []);

  const moreItems = useMemo(
    () => [
      {
        key: "settings",
        label: t(language, "Settings", "Ajustes"),
        iconName: "settings-outline" as const,
        onPress: () => handleMoreSelect(openSettings),
      },
      {
        key: "trophies",
        label: t(language, "Trophies", "Trofeos"),
        iconName: "trophy-outline" as const,
        onPress: () => handleMoreSelect(openTrophies),
      },
      {
        key: "ranking",
        label: t(language, "Global ranking", "Ranking global"),
        iconName: "globe-outline" as const,
        onPress: () => handleMoreSelect(openGlobalRanking),
      },
      {
        key: "journal",
        label: t(language, "Journal", "Journal"),
        iconName: "book-outline" as const,
        onPress: () => handleMoreSelect(openJournalDate),
      },
      {
        key: "notebook",
        label: planAccess.isAdvanced
          ? t(language, "Notebook", "Notebook")
          : t(language, "Notebook · Advanced", "Notebook · Advanced"),
        iconName: "document-text-outline" as const,
        onPress: () => handleMoreSelect(openNotebook),
      },
      {
        key: "challenges",
        label: t(language, "Challenges", "Retos"),
        iconName: "flame-outline" as const,
        onPress: () => handleMoreSelect(openChallenges),
      },
      {
        key: "broker-connect",
        label: planAccess.hasBrokerSync
          ? t(language, "Broker connect", "Conectar bróker")
          : t(language, "Broker Sync · Add-on", "Broker Sync · Add-on"),
        iconName: "link-outline" as const,
        onPress: () => handleMoreSelect(openBrokerConnect),
      },
      {
        key: "about",
        label: t(language, "About us", "Sobre nosotros"),
        iconName: "information-circle-outline" as const,
        onPress: () => handleMoreSelect(() => Linking.openURL(`${WEB_BASE}/about`)),
      },
      {
        key: "terms",
        label: t(language, "Terms", "Términos"),
        iconName: "document-text-outline" as const,
        onPress: () => handleMoreSelect(() => Linking.openURL(`${WEB_BASE}/terms`)),
      },
      {
        key: "privacy",
        label: t(language, "Privacy", "Privacidad"),
        iconName: "shield-checkmark-outline" as const,
        onPress: () => handleMoreSelect(() => Linking.openURL(`${WEB_BASE}/privacy`)),
      },
    ],
    [
      handleMoreSelect,
      language,
      openChallenges,
      openGlobalRanking,
      openJournalDate,
      openNotebook,
      openSettings,
      openTrophies,
      openBrokerConnect,
      planAccess.hasBrokerSync,
      planAccess.isAdvanced,
    ]
  );

  return (
    <>
      <Tab.Navigator
        detachInactiveScreens
        screenOptions={({ route }) => ({
          lazy: true,
          freezeOnBlur: true,
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: "700" },
          headerTitle: () => (
            <Text style={[styles.headerText, { color: colors.textPrimary }]}>{route.name}</Text>
          ),
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          sceneStyle: { backgroundColor: colors.background },
          tabBarIcon: ({ color, size }) => {
            if (route.name === "Dashboard") return <Ionicons name="home-outline" size={size} color={color} />;
            if (route.name === "Calendar") return <Ionicons name="calendar-outline" size={size} color={color} />;
            if (route.name === "Analytics") return <Ionicons name="stats-chart-outline" size={size} color={color} />;
            if (route.name === "AICoach") return <Ionicons name="sparkles-outline" size={size} color={color} />;
            return <Ionicons name="ellipsis-horizontal-circle-outline" size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Dashboard" options={{ title: "Home" }}>
          {() => <DashboardScreen onOpenModule={openModule} onOpenJournalDate={openJournalDate} />}
        </Tab.Screen>
        <Tab.Screen name="Calendar" options={{ title: "Calendar" }}>
          {() => <CalendarScreen onOpenModule={openModule} onOpenJournalDate={openJournalDate} />}
        </Tab.Screen>
        <Tab.Screen name="Analytics" options={{ title: "Analytics" }}>
          {() => <AnalyticsScreen onOpenModule={openModule} isAdvanced={planAccess.isAdvanced} />}
        </Tab.Screen>
        <Tab.Screen name="AICoach" options={{ title: "AI Coach" }}>
          {() =>
            planAccess.isAdvanced ? (
              <AICoachScreen onOpenModule={openModule} />
            ) : (
              <PlanGate
                title={t(language, "AI Coach", "AI Coach")}
                badge="Advanced"
                loading={planAccess.loading}
                subtitle={t(
                  language,
                  "AI Coaching, action plans, and mindset feedback are included in Advanced.",
                  "AI Coaching, planes de acción y feedback de mindset están incluidos en Advanced."
                )}
              />
            )
          }
        </Tab.Screen>
        <Tab.Screen
          name="Other"
          options={{
            title: "More",
            tabBarButton: ({ children, style, accessibilityState, accessibilityLabel, testID }) => (
              <Pressable
                onPress={() => setMoreOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel ?? "More"}
                accessibilityState={accessibilityState}
                style={style}
                testID={testID}
              >
                {children}
              </Pressable>
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setMoreOpen(true);
            },
          }}
        >
          {() => (
            <OtherScreen
              onOpenModule={openModule}
              onOpenSettings={openSettings}
              onOpenGlobalRanking={openGlobalRanking}
              onOpenTrophies={openTrophies}
              onOpenNotebook={openNotebook}
              onOpenChallenges={openChallenges}
              onOpenJournalDate={openJournalDate}
              onOpenBrokerConnect={openBrokerConnect}
              isAdvanced={planAccess.isAdvanced}
              hasBrokerSync={planAccess.hasBrokerSync}
            />
          )}
        </Tab.Screen>
      </Tab.Navigator>

      <MoreSheet
        visible={moreOpen}
        title={t(language, "More", "Más")}
        items={moreItems}
        onClose={() => setMoreOpen(false)}
      />
    </>
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
        secondaryButton: {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          backgroundColor: "transparent",
        },
        dangerButton: {
          backgroundColor: "transparent",
        },
        primaryText: {
          color: "#00130f",
          fontSize: 14,
          fontWeight: "900",
        },
        secondaryText: {
          color: colors.textPrimary,
          fontSize: 14,
          fontWeight: "800",
        },
        dangerText: {
          color: colors.textMuted,
          fontSize: 13,
          fontWeight: "700",
        },
      }),
    [colors]
  );

  const openWebsite = useCallback(() => {
    void Linking.openURL(WEB_BASE);
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>{t(language, "Account access", "Acceso de cuenta")}</Text>
      <Text style={styles.title}>
        {t(language, "Sign in with an active NeuroTrader account.", "Entra con una cuenta activa de NeuroTrader.")}
      </Text>
      <Text style={styles.body}>
        {t(
          language,
          "The mobile app is free to download and is built for existing members. Your journal unlocks when your account already has active access.",
          "El app movil es gratis para descargar y esta creado para miembros existentes. Tu journal se desbloquea cuando tu cuenta ya tiene acceso activo."
        )}
      </Text>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>
          {t(language, "Why this matters", "Por que esto importa")}
        </Text>
        <Text style={styles.panelText}>
          {t(
            language,
            "Your journal, rules, analytics, trophies, and broker tools stay protected behind the same account access check on web and mobile.",
            "Tu journal, reglas, analiticas, trophies y herramientas de broker quedan protegidas con la misma validacion de cuenta en web y mobile."
          )}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.button, styles.primaryButton]} onPress={onRetry} disabled={checking}>
        <Text style={styles.primaryText}>
          {checking ? t(language, "Checking...", "Verificando...") : t(language, "Check access", "Verificar acceso")}
        </Text>
      </Pressable>
      <Pressable style={[styles.button, styles.secondaryButton]} onPress={openWebsite}>
        <Text style={styles.secondaryText}>{t(language, "Open website", "Abrir website")}</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.dangerButton]} onPress={onSignOut}>
        <Text style={styles.dangerText}>{t(language, "Sign out", "Cerrar sesion")}</Text>
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
  const [navReady, setNavReady] = useState(false);
  const [recoverySessionReady, setRecoverySessionReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [shouldOpenResetScreen, setShouldOpenResetScreen] = useState(false);
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

    supabaseMobile.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setAuthReady(true);
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

  const shouldShowMainTabs = !hasSupabaseConfig || (Boolean(session) && hasAppAccess);
  const shouldShowPaymentRequired = hasSupabaseConfig && Boolean(session) && accessReady && !hasAppAccess;
  const shouldShowLoading = !authReady || (hasSupabaseConfig && Boolean(session) && !accessReady);
  const postAuthRoute: "Tabs" | "PaymentRequired" | "Auth" = shouldShowMainTabs
    ? "Tabs"
    : shouldShowPaymentRequired
    ? "PaymentRequired"
    : "Auth";

  const handleSignOut = useCallback(() => {
    void supabaseMobile?.auth.signOut();
    setSession(null);
    setHasAppAccess(false);
    setAccessReady(true);
    setAccessError(null);
    if (navigationRef.isReady()) {
      navigationRef.reset({
        index: 0,
        routes: [{ name: "Auth" }],
      });
    }
  }, []);

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
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          {shouldShowMainTabs ? (
            <Stack.Screen name="Tabs" options={{ headerShown: false }}>
              {() => <MainTabs />}
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
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: "Settings" }}
          />
          <Stack.Screen
            name="JournalDate"
            component={JournalDateScreen}
            options={{ title: "Journal" }}
          />
          <Stack.Screen
            name="GlobalRanking"
            component={GlobalRankingScreen}
            options={{ title: "Global ranking" }}
          />
          <Stack.Screen
            name="Trophies"
            component={TrophiesScreen}
            options={{ title: "Trophies" }}
          />
          <Stack.Screen
            name="Notebook"
            component={NotebookScreen}
            options={{ title: "Notebook" }}
          />
          <Stack.Screen
            name="NotebookWorkspace"
            component={NotebookWorkspaceScreen}
            options={({ route }) => ({ title: (route.params as { title?: string } | undefined)?.title ?? "Notebook" })}
          />
          <Stack.Screen
            name="NotebookEditor"
            component={NotebookEditorScreen}
            options={{ title: "Notebook" }}
          />
          <Stack.Screen
            name="Challenges"
            component={ChallengesScreen}
            options={{ title: "Challenges" }}
          />
          <Stack.Screen
            name="BrokerConnect"
            component={BrokerConnectScreen}
            options={{ title: "Broker connect" }}
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
});
