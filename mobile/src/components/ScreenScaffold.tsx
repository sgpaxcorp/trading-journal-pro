import { PropsWithChildren, useMemo, useState } from "react";
import { ActivityIndicator, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

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
}>;

export function ScreenScaffold({
  title,
  subtitle,
  children,
  scrollable = true,
  refreshing = false,
  onRefresh,
}: ScreenScaffoldProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [fallbackRefreshing, setFallbackRefreshing] = useState(false);
  const activeRefreshing = refreshing || fallbackRefreshing;

  const handleRefresh = onRefresh
    ? onRefresh
    : async () => {
        setFallbackRefreshing(true);
        await refreshAppBaseline();
        setFallbackRefreshing(false);
      };
  const content = (
    <>
      <View style={styles.brandRow}>
        <Image source={brandLogo} style={styles.brandLogo} resizeMode="contain" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {activeRefreshing ? (
        <View style={styles.refreshBanner}>
          <Image source={brandLogo} style={styles.refreshLogo} resizeMode="contain" />
          <Text style={styles.refreshText}>{t(language, "Refreshing…", "Actualizando…")}</Text>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null}
      <View style={[styles.block, !scrollable && styles.blockFill]}>{children}</View>
    </>
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      alwaysBounceVertical
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
    subtitle: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    block: {
      marginTop: 6,
      gap: 10,
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
