import { RouteProp, useNavigation } from "@react-navigation/native";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo } from "react";

import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import type { ModuleRouteParams } from "../lib/moduleNavigation";
import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";

type Params = {
  Module: ModuleRouteParams;
};

type Props = {
  route: RouteProp<Params, "Module">;
};

export function ModulePlaceholderScreen({ route }: Props) {
  const { language } = useLanguage();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.badge}>{route.params.badge ?? t(language, "Overview", "Resumen")}</Text>
        <Text style={styles.title}>{route.params.title}</Text>
        <Text style={styles.description}>{route.params.description}</Text>

        <View style={styles.ruleBox}>
          <Text style={styles.ruleText}>
            {route.params.detail ??
              t(
                language,
                "This section will show your data as soon as you start using the feature.",
                "Esta sección mostrará tu data cuando empieces a usar la función."
              )}
          </Text>
        </View>

        <View style={styles.actionRow}>
          {route.params.ctaUrl ? (
            <Pressable
              style={[styles.cta, styles.secondaryCta]}
              onPress={() => void Linking.openURL(route.params.ctaUrl!)}
            >
              <Text style={styles.secondaryCtaText}>
                {route.params.ctaLabel ?? t(language, "Open website", "Abrir website")}
              </Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.cta} onPress={() => navigation.goBack()}>
            <Text style={styles.ctaText}>{t(language, "Go back", "Volver")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 16,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 16,
      gap: 10,
    },
    badge: {
      alignSelf: "flex-start",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.info,
      backgroundColor: colors.infoSoft,
      color: colors.info,
      paddingHorizontal: 8,
      paddingVertical: 4,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontWeight: "700",
    },
    title: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: "700",
    },
    description: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    ruleBox: {
      marginTop: 2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 4,
    },
    ruleText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    cta: {
      marginTop: 6,
      alignSelf: "flex-start",
      borderRadius: 10,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginTop: 6,
    },
    ctaText: {
      color: colors.onPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
    secondaryCta: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryCtaText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
  });
