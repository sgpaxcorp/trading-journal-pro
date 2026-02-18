import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";

import { type ThemeColors } from "../theme";
import { useTheme } from "../lib/ThemeContext";

type ModuleTileProps = {
  title: string;
  description: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

export function ModuleTile({
  title,
  description,
  iconName = "chevron-forward",
  onPress,
}: ModuleTileProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Pressable onPress={onPress} style={styles.tile}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{description}</Text>
      </View>
      <Ionicons name={iconName} color={colors.primary} size={18} />
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
    copy: {
      flex: 1,
      gap: 4,
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
  });
