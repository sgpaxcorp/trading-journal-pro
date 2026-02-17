import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { COLORS } from "../theme";

type ScreenScaffoldProps = PropsWithChildren<{
  title: string;
  subtitle: string;
  scrollable?: boolean;
}>;

export function ScreenScaffold({ title, subtitle, children, scrollable = true }: ScreenScaffoldProps) {
  const { language } = useLanguage();
  const content = (
    <>
      <Text style={styles.kicker}>
        {t(language, "Neuro Trader · Mobile", "Neuro Trader · Móvil")}
      </Text>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
    flexGrow: 1,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 1.8,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  title: {
    color: COLORS.textPrimary,
    fontWeight: "700",
    fontSize: 26,
  },
  subtitle: {
    color: COLORS.textMuted,
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
