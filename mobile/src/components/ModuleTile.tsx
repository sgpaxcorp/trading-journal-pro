import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";

import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";

type ModuleTileProps = {
  title: string;
  description: string;
  eyebrow?: string;
  badges?: string[];
  iconName?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

function toneForBadge(colors: ThemeColors, badge: string) {
  const value = badge.trim().toLowerCase();
  if (value.includes("beta")) {
    return {
      borderColor: colors.warning,
      backgroundColor: colors.warningSoft,
      color: colors.warning,
    };
  }
  if (value.includes("advanced") || value.includes("locked")) {
    return {
      borderColor: colors.warning,
      backgroundColor: colors.warningSoft,
      color: colors.warning,
    };
  }
  if (value.includes("web") || value.includes("add-on")) {
    return {
      borderColor: colors.info,
      backgroundColor: colors.infoSoft,
      color: colors.info,
    };
  }
  if (value.includes("mobile") || value.includes("active") || value.includes("core")) {
    return {
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
      color: colors.primary,
    };
  }
  return {
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textMuted,
  };
}

export function ModuleTile({
  title,
  description,
  eyebrow,
  badges,
  iconName = "grid-outline",
  onPress,
}: ModuleTileProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable onPress={onPress} style={styles.tile}>
      <View style={styles.iconWrap}>
        <Ionicons name={iconName} color={colors.primary} size={18} />
      </View>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{description}</Text>
        {badges?.length ? (
          <View style={styles.badgeRow}>
            {badges.map((badge) => {
              const tone = toneForBadge(colors, badge);
              return (
                <View
                  key={`${title}-${badge}`}
                  style={[
                    styles.badge,
                    {
                      borderColor: tone.borderColor,
                      backgroundColor: tone.backgroundColor,
                    },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: tone.color }]}>{badge}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" color={colors.textMuted} size={18} />
    </Pressable>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    tile: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "flex-start",
    },
    copy: {
      flex: 1,
      gap: 4,
    },
    eyebrow: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    title: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 15,
    },
    desc: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    badgeRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 2,
    },
    badge: {
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeText: {
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.3,
    },
  });
