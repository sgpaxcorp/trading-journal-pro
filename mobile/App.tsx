import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import * as Notifications from "expo-notifications";

import { DashboardScreen } from "./src/screens/DashboardScreen";
import { CalendarScreen } from "./src/screens/CalendarScreen";
import { AnalyticsScreen } from "./src/screens/AnalyticsScreen";
import { AICoachScreen } from "./src/screens/AICoachScreen";
import { SettingsScreen } from "./src/screens/MoreScreen";
import { AuthScreen, type AuthMode } from "./src/screens/AuthScreen";
import { ThemeProvider, useTheme } from "./src/lib/ThemeContext";
import { LanguageProvider } from "./src/lib/LanguageContext";
import { hasSupabaseConfig, supabaseMobile } from "./src/lib/supabase";
import { ModulePlaceholderScreen } from "./src/screens/ModulePlaceholderScreen";

const headerIcon = require("./assets/neurotrader-logo-icon.png");

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
  Settings: undefined;
};

type RootStackParamList = {
  Tabs: undefined;
  Module: { title: string; description: string };
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

function MainTabs() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();

  function openModule(title: string, description: string) {
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
    if (parent) {
      parent.navigate("Module", { title, description });
      return;
    }
    navigation.navigate("Module", { title, description });
  }

  return (
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
          return <Ionicons name="settings-outline" size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" options={{ title: "Home" }}>
        {() => <DashboardScreen onOpenModule={openModule} />}
      </Tab.Screen>
      <Tab.Screen name="Calendar" options={{ title: "Calendar" }}>
        {() => <CalendarScreen onOpenModule={openModule} />}
      </Tab.Screen>
      <Tab.Screen name="Analytics" options={{ title: "Analytics" }}>
        {() => <AnalyticsScreen onOpenModule={openModule} />}
      </Tab.Screen>
      <Tab.Screen name="AICoach" options={{ title: "AI Coach" }}>
        {() => <AICoachScreen onOpenModule={openModule} />}
      </Tab.Screen>
      <Tab.Screen name="Settings" options={{ title: "Settings" }}>
        {() => <SettingsScreen />}
      </Tab.Screen>
    </Tab.Navigator>
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
