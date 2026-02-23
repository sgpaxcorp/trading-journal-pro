import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useTheme } from "../lib/ThemeContext";
import { type ThemeColors } from "../theme";

type MoreSheetItem = {
  key: string;
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
};

type MoreSheetProps = {
  visible: boolean;
  title: string;
  items: MoreSheetItem[];
  onClose: () => void;
};

export function MoreSheet({ visible, title, items, onClose }: MoreSheetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <Text style={styles.title}>{title}</Text>
              <View style={styles.grid}>
                {items.map((item) => (
                  <Pressable key={item.key} style={styles.tile} onPress={item.onPress}>
                    <View style={styles.iconWrap}>
                      <Ionicons name={item.iconName} size={22} color={colors.textPrimary} />
                    </View>
                    <Text style={styles.label}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 28,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    handle: {
      width: 44,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.border,
      alignSelf: "center",
    },
    title: {
      textAlign: "center",
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: 0.3,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      rowGap: 16,
    },
    tile: {
      width: "30%",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: "center",
      gap: 8,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    label: {
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: "600",
      textAlign: "center",
    },
  });
