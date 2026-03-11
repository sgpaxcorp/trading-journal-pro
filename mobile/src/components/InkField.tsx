import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { InkCanvas } from "./InkCanvas";
import type { InkCanvasHandle } from "./InkCanvas";
import type { InkDrawing } from "./inkTypes";
import { RichTextEditor } from "./RichTextEditor";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";

type InkFieldProps = {
  label: string;
  mode: "text" | "ink";
  onModeChange: (next: "text" | "ink") => void;
  textValue: string;
  onTextChange: (next: string) => void;
  inkValue: InkDrawing | null;
  onInkChange: (next: InkDrawing) => void;
  placeholder?: string;
  height?: number;
};

export type InkFieldHandle = {
  getCurrentInk: () => Promise<InkDrawing | null>;
};

export const InkField = forwardRef<InkFieldHandle, InkFieldProps>(function InkField({
  label,
  mode,
  onModeChange,
  textValue,
  onTextChange,
  inkValue,
  onInkChange,
  placeholder,
  height = 520,
}: InkFieldProps, ref) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inkRef = useRef<InkCanvasHandle>(null);
  const [inkColor, setInkColor] = useState("#FFFFFF");

  useImperativeHandle(
    ref,
    () => ({
      getCurrentInk: async () => {
        const next = await inkRef.current?.getCurrentDrawing?.();
        return next ?? inkValue ?? null;
      },
    }),
    [inkValue]
  );

  const palette = [
    { id: "white", value: "#FFFFFF" },
    { id: "teal", value: colors.primary },
    { id: "sky", value: "#7DD3FC" },
  ];

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleChip, mode === "text" && styles.toggleChipActive]}
            onPress={() => onModeChange("text")}
          >
            <Text style={[styles.toggleText, mode === "text" && styles.toggleTextActive]}>Text</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleChip, mode === "ink" && styles.toggleChipActive]}
            onPress={() => onModeChange("ink")}
          >
            <Text style={[styles.toggleText, mode === "ink" && styles.toggleTextActive]}>Ink</Text>
          </Pressable>
        </View>
      </View>
      {mode === "ink" ? (
        <View style={styles.colorRow}>
          <Text style={styles.colorLabel}>Ink</Text>
          <View style={styles.colorChips}>
            {palette.map((item) => (
              <Pressable
                key={item.id}
                style={[
                  styles.colorChip,
                  { backgroundColor: item.value },
                  inkColor === item.value && styles.colorChipActive,
                ]}
                onPress={() => {
                  setInkColor(item.value);
                  if (Platform.OS === "ios") {
                    inkRef.current?.showColorPicker();
                  }
                }}
              />
            ))}
            {Platform.OS === "ios" ? (
              <Pressable
                style={styles.colorPicker}
                onPress={() => inkRef.current?.showColorPicker()}
              >
                <Text style={styles.colorPickerText}>Pick</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      {mode === "text" ? (
        <RichTextEditor
          value={textValue}
          onChange={onTextChange}
          placeholder={placeholder}
          minHeight={height}
        />
      ) : (
        <View style={styles.inkWrapper}>
          <InkCanvas
            ref={inkRef}
            value={inkValue ?? undefined}
            onChange={onInkChange}
            height={height}
            strokeColor={inkColor}
          />
        </View>
      )}
    </View>
  );
});

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    block: {
      gap: 10,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    label: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
    },
    toggle: {
      flexDirection: "row",
      gap: 6,
    },
    toggleChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    toggleChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.infoSoft,
    },
    toggleText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    toggleTextActive: {
      color: colors.textPrimary,
    },
    inkWrapper: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    colorRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    colorLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    colorChips: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    colorChip: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.border,
    },
    colorChipActive: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    colorPicker: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    colorPickerText: {
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: "600",
    },
  });
