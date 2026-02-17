import { RouteProp } from "@react-navigation/native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { COLORS } from "../theme";

type Params = {
  Module: {
    title: string;
    description: string;
  };
};

type Props = {
  route: RouteProp<Params, "Module">;
};

export function ModulePlaceholderScreen({ route }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.badge}>MVP stage</Text>
        <Text style={styles.title}>{route.params.title}</Text>
        <Text style={styles.description}>{route.params.description}</Text>

        <View style={styles.ruleBox}>
          <Text style={styles.ruleTitle}>Rule kept</Text>
          <Text style={styles.ruleText}>
            Este desarrollo móvil es separado. No se modifica la app web existente.
          </Text>
        </View>

        <Pressable style={styles.cta}>
          <Text style={styles.ctaText}>Ready for next implementation step</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 16,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    padding: 16,
    gap: 10,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3568D4",
    backgroundColor: "#17316A",
    color: "#A7C3FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "700",
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: "700",
  },
  description: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  ruleBox: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 10,
    gap: 4,
  },
  ruleTitle: {
    color: COLORS.primary,
    fontWeight: "700",
    fontSize: 12,
  },
  ruleText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  cta: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ctaText: {
    color: "#061122",
    fontSize: 12,
    fontWeight: "700",
  },
});
