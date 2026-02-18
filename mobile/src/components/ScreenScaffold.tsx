import { PropsWithChildren, useMemo } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { useLanguage } from "../lib/LanguageContext";
import { useTheme } from "../lib/ThemeContext";
import { t } from "../lib/i18n";
import type { ThemeColors } from "../theme";

const brandLogo = require("../../assets/neurotrader-logo-web.png");

type ScreenScaffoldProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  scrollable?: boolean;
}>;

export function ScreenScaffold({ title, subtitle, children, scrollable = true }: ScreenScaffoldProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const content = (
    <>
      <View style={styles.brandRow}>
        <Image source={brandLogo} style={styles.brandLogo} resizeMode="contain" />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={[styles.block, !scrollable && styles.blockFill]}>{children}</View>
    </>
  );

  if (!scrollable) {
    return (
      <View style={styles.root}>
        <View style={styles.content}>{content}</View>
      </View>
    );
  }
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
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
  });
