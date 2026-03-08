import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from "react-native";
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
import { NotebookEditorScreen } from "./src/screens/NotebookEditorScreen";
import { ChallengesScreen } from "./src/screens/ChallengesScreen";
import { BrokerConnectScreen } from "./src/screens/BrokerConnectScreen";
import { AuthScreen, type AuthMode } from "./src/screens/AuthScreen";
import { ThemeProvider, useTheme } from "./src/lib/ThemeContext";
import { LanguageProvider } from "./src/lib/LanguageContext";
import { useLanguage } from "./src/lib/LanguageContext";
import { hasSupabaseConfig, supabaseMobile } from "./src/lib/supabase";
import { ModulePlaceholderScreen } from "./src/screens/ModulePlaceholderScreen";
import { MoreSheet } from "./src/components/MoreSheet";
import { t } from "./src/lib/i18n";

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
  Tabs: undefined;
  Module: { title: string; description: string };
  Settings: undefined;
  JournalDate: { date?: string } | undefined;
  GlobalRanking: undefined;
  Trophies: undefined;
  Notebook: undefined;
  NotebookEditor: { kind: "page" | "free"; id: string; title?: string };
  Challenges: undefined;
  BrokerConnect: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();
const WEB_BASE = "https://www.neurotrader-journal.com";

function MainTabs() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { language } = useLanguage();
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
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("Notebook");
      return;
    }
    navigation.navigate("Notebook");
  }, [navigation]);

  const openChallenges = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("Challenges");
      return;
    }
    navigation.navigate("Challenges");
  }, [navigation]);

  const openBrokerConnect = useCallback(() => {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("BrokerConnect");
      return;
    }
    navigation.navigate("BrokerConnect");
  }, [navigation]);

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
        label: t(language, "Notebook", "Notebook"),
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
        label: t(language, "Broker connect", "Conectar bróker"),
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
    ]
  );

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
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
          {() => <AnalyticsScreen onOpenModule={openModule} />}
        </Tab.Screen>
        <Tab.Screen name="AICoach" options={{ title: "AI Coach" }}>
          {() => <AICoachScreen onOpenModule={openModule} />}
        </Tab.Screen>
        <Tab.Screen
          name="Other"
          options={{
            title: "More",
            tabBarButton: (props) => (
              <Pressable
                {...props}
                onPress={() => setMoreOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="More"
              />
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

function AppShell() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const { colors, mode: themeMode } = useTheme();
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
    } = supabaseMobile.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const shouldShowMainTabs = Boolean(session) || !hasSupabaseConfig;

  return (
    <NavigationContainer>
      <StatusBar style={themeMode === "light" ? "dark" : "light"} />
      {!authReady ? (
        <View style={loadingStyles.loading}>
          <ActivityIndicator color={colors.primary} />
          <Text style={loadingStyles.loadingText}>Loading...</Text>
        </View>
      ) : shouldShowMainTabs ? (
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.surface },
            headerTintColor: colors.textPrimary,
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="Tabs" options={{ headerShown: false }}>
            {() => <MainTabs />}
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
      ) : (
        <AuthScreen
          mode={mode}
          onToggleMode={() => setMode((current) => (current === "signin" ? "signup" : "signin"))}
        />
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
