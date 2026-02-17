import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { COLORS } from "../theme";

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
  return (
    <Pressable onPress={onPress} style={styles.tile}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{description}</Text>
      </View>
      <Ionicons name={iconName} color={COLORS.primary} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
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
    color: COLORS.textPrimary,
    fontWeight: "700",
    fontSize: 15,
  },
  desc: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
