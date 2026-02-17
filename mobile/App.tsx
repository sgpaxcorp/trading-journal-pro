import { StatusBar } from "expo-status-bar";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator, type NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useCallback } from "react";

import { DashboardScreen } from "./src/screens/DashboardScreen";
import { CalendarScreen } from "./src/screens/CalendarScreen";
import { AnalyticsScreen } from "./src/screens/AnalyticsScreen";
import { AICoachScreen } from "./src/screens/AICoachScreen";
import { MoreScreen } from "./src/screens/MoreScreen";
import { ModulePlaceholderScreen } from "./src/screens/ModulePlaceholderScreen";
import { COLORS } from "./src/theme";

type RootStackParamList = {
  Tabs: undefined;
  Module: { title: string; description: string };
};

type MainTabParamList = {
  Dashboard: undefined;
  Calendar: undefined;
  Analytics: undefined;
  AICoach: undefined;
  More: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function MainTabs() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const openModule = useCallback(
    (title: string, description: string) => {
      navigation.navigate("Module", { title, description });
    },
    [navigation]
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
        tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        sceneStyle: { backgroundColor: COLORS.background },
        tabBarIcon: ({ color, size }) => {
          if (route.name === "Dashboard") return <Ionicons name="grid-outline" size={size} color={color} />;
          if (route.name === "Calendar") return <Ionicons name="calendar-outline" size={size} color={color} />;
          if (route.name === "Analytics") return <Ionicons name="stats-chart-outline" size={size} color={color} />;
          if (route.name === "AICoach") return <Ionicons name="sparkles-outline" size={size} color={color} />;
          return <Ionicons name="ellipsis-horizontal-circle-outline" size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" options={{ title: "Dashboard" }}>
        {() => <DashboardScreen onOpenModule={openModule} />}
      </Tab.Screen>
      <Tab.Screen name="Calendar" options={{ title: "Calendar" }}>
        {() => <CalendarScreen onOpenModule={openModule} />}
      </Tab.Screen>
      <Tab.Screen name="Analytics" options={{ title: "Analytics" }}>
        {() => <AnalyticsScreen onOpenModule={openModule} />}
      </Tab.Screen>
      <Tab.Screen name="AICoach" options={{ title: "AI Coaching" }}>
        {() => <AICoachScreen onOpenModule={openModule} />}
      </Tab.Screen>
      <Tab.Screen name="More" options={{ title: "Other" }}>
        {() => <MoreScreen onOpenModule={openModule} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: COLORS.surface },
            headerTintColor: COLORS.textPrimary,
            contentStyle: { backgroundColor: COLORS.background },
          }}
        >
          <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen
            name="Module"
            component={ModulePlaceholderScreen}
            options={({ route }) => ({ title: route.params.title })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
