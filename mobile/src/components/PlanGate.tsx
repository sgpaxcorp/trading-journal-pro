import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { ScreenScaffold } from "./ScreenScaffold";

type PlanGateProps = {
  title: string;
  subtitle: string;
  badge?: string;
  loading?: boolean;
};

export function PlanGate({
  title,
  subtitle,
  badge = "Advanced",
  loading = false,
}: PlanGateProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScreenScaffold
      title={title}
      subtitle={t(
        language,
        "Your plan controls which premium tools are available on mobile.",
        "Tu plan controla qué herramientas premium están disponibles en móvil."
      )}
    >
      <View style={styles.card}>
        <Text style={styles.badge}>{badge}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>{t(language, "Checking access…", "Verificando acceso…")}</Text>
          </View>
        ) : (
          <Text style={styles.note}>
            {t(
              language,
              "Manage or upgrade your plan from the web platform.",
              "Administra o mejora tu plan desde la plataforma web."
            )}
          </Text>
        )}
      </View>
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 20,
      gap: 10,
    },
    badge: {
      alignSelf: "flex-start",
      color: colors.primary,
      borderColor: colors.primary,
      borderWidth: 1,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
      letterSpacing: 1.4,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: "900",
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
    },
    note: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 12,
    },
  });
