import { PropsWithChildren, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

import { useLanguage } from "../lib/LanguageContext";
import { useTheme } from "../lib/ThemeContext";
import { t } from "../lib/i18n";
import type { ThemeColors } from "../theme";
import { refreshAppBaseline } from "../lib/refresh";

const brandLogo = require("../../assets/neurotrader-logo-web.png");

type ScreenScaffoldProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  scrollable?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  showBrand?: boolean;
  compactHeader?: boolean;
  contentPadding?: number;
  showPageNavigation?: boolean;
}>;

export function ScreenScaffold({
  title,
  subtitle,
  children,
  scrollable = true,
  refreshing = false,
  onRefresh,
  showBrand = true,
  compactHeader = false,
  contentPadding = 16,
  showPageNavigation = true,
}: ScreenScaffoldProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [fallbackRefreshing, setFallbackRefreshing] = useState(false);
  const activeRefreshing = refreshing || fallbackRefreshing;
  const isBusinessCenter = route.name === "Dashboard";

  const returnToBusinessCenter = () => {
    let rootNavigation = navigation;
    while (rootNavigation.getParent?.()) {
      rootNavigation = rootNavigation.getParent();
    }
    rootNavigation.navigate("Tabs", { screen: "Dashboard" });
  };

  const goBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    returnToBusinessCenter();
  };

  const handleRefresh = onRefresh
    ? onRefresh
    : async () => {
        setFallbackRefreshing(true);
        await refreshAppBaseline();
        setFallbackRefreshing(false);
      };
  const content = (
    <>
      {showPageNavigation && !isBusinessCenter ? (
        <View style={styles.pageNavigation}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(language, "Back", "Atrás")}
            onPress={goBack}
            style={({ pressed }) => [styles.pageNavigationButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name="arrow-back" size={18} color={colors.info} />
            <Text style={styles.pageNavigationButtonText}>{t(language, "Back", "Atrás")}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(language, "Return to Business Center", "Volver al Centro Empresarial")}
            onPress={returnToBusinessCenter}
            style={({ pressed }) => [styles.businessCenterButton, pressed && styles.buttonPressed]}
          >
            <Ionicons name="grid-outline" size={17} color={colors.onPrimary} />
            <Text style={styles.businessCenterButtonText}>
              {t(language, "Business Center", "Centro Empresarial")}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {showBrand ? (
        <View style={styles.brandRow}>
          <Image source={brandLogo} style={styles.brandLogo} resizeMode="contain" />
        </View>
      ) : null}
      <Text style={[styles.title, compactHeader && styles.titleCompact]}>{title}</Text>
      <Text style={[styles.subtitle, compactHeader && styles.subtitleCompact]}>{subtitle}</Text>
      {activeRefreshing ? (
        <View style={styles.refreshBanner}>
          <Image source={brandLogo} style={styles.refreshLogo} resizeMode="contain" />
          <Text style={styles.refreshText}>{t(language, "Refreshing…", "Actualizando…")}</Text>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null}
      <View style={[styles.block, compactHeader && styles.blockCompact, !scrollable && styles.blockFill]}>
        {children}
      </View>
    </>
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        compactHeader && styles.contentCompact,
        { paddingHorizontal: contentPadding },
      ]}
      alwaysBounceVertical
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={activeRefreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
          progressBackgroundColor={colors.surface}
        />
      }
    >
      {content}
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 16,
      gap: 12,
      paddingBottom: 24,
      flexGrow: 1,
    },
    contentCompact: {
      paddingTop: 12,
      gap: 10,
    },
    pageNavigation: {
      minHeight: 52,
      padding: 5,
      gap: 7,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      backgroundColor: colors.surface,
      shadowColor: colors.background,
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    pageNavigationButton: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.info,
      borderRadius: 7,
      backgroundColor: colors.infoSoft,
      paddingHorizontal: 13,
    },
    pageNavigationButtonText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    businessCenterButton: {
      minHeight: 40,
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 7,
      backgroundColor: colors.primary,
      paddingHorizontal: 10,
    },
    businessCenterButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: "800",
      flexShrink: 1,
      textAlign: "center",
    },
    buttonPressed: {
      opacity: 0.78,
    },
    brandRow: {
      alignItems: "center",
      marginBottom: 4,
    },
    brandLogo: {
      width: 270,
      height: 72,
    },
    title: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 26,
    },
    titleCompact: {
      fontSize: 22,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    subtitleCompact: {
      fontSize: 13,
      lineHeight: 18,
    },
    block: {
      marginTop: 6,
      gap: 10,
    },
    blockCompact: {
      marginTop: 4,
      gap: 8,
    },
    blockFill: {
      flex: 1,
    },
    refreshBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
    },
    refreshLogo: {
      width: 90,
      height: 24,
    },
    refreshText: {
      color: colors.textMuted,
      fontSize: 12,
      flex: 1,
    },
  });
