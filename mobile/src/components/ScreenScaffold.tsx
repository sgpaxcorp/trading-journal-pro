import { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { COLORS } from "../theme";

type ScreenScaffoldProps = PropsWithChildren<{
  title: string;
  subtitle: string;
}>;

export function ScreenScaffold({ title, subtitle, children }: ScreenScaffoldProps) {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Neuro Trader Journal · iPhone</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <View style={styles.block}>{children}</View>
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
});
