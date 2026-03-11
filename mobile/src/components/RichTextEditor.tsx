import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { RichEditor, RichToolbar, actions, type FONT_SIZE } from "react-native-pell-rich-editor";

import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
};

const TABLE_HTML =
  "<table style='width:100%; border-collapse:collapse;' border='1'>" +
  "<tr><th>Header</th><th>Header</th></tr>" +
  "<tr><td>Cell</td><td>Cell</td></tr>" +
  "</table><p></p>";

const FONT_FAMILY_OPTIONS = [
  { id: "system", label: "System", value: "Arial" },
  { id: "serif", label: "Serif", value: "Georgia" },
  { id: "mono", label: "Mono", value: "Courier New" },
];

const FONT_SIZE_OPTIONS: Array<{ id: string; label: string; command: FONT_SIZE; px: number }> = [
  { id: "sm", label: "14", command: 2, px: 14 },
  { id: "md", label: "16", command: 3, px: 16 },
  { id: "lg", label: "18", command: 4, px: 18 },
  { id: "xl", label: "24", command: 5, px: 24 },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 160,
}: RichTextEditorProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const editorRef = useRef<RichEditor>(null);
  const lastSyncedHtmlRef = useRef(value || "");
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState(FONT_FAMILY_OPTIONS[0]?.value ?? "Arial");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const editor = editorRef.current as unknown as {
      setContentHTML?: (html: string) => void;
    } | null;
    const nextValue = value || "";
    if (nextValue === lastSyncedHtmlRef.current) return;
    if (typeof editor?.setContentHTML === "function") {
      editor.setContentHTML(nextValue);
      lastSyncedHtmlRef.current = nextValue;
    }
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current as unknown as {
      setContentStyle?: (style: Record<string, unknown>) => void;
      setContentCSS?: (css: string) => void;
    } | null;
    if (typeof editor?.setContentStyle === "function") {
      editor.setContentStyle({ color: colors.textPrimary });
    }
    if (typeof editor?.setContentCSS === "function") {
      editor.setContentCSS(
        `body { font-size: ${fontSize}px; color: ${colors.textPrimary}; } table, th, td { border: 1px solid ${
          colors.border
        }; }`
      );
    }
  }, [colors, fontSize]);

  const editorCss = `
    html, body {
      margin: 0;
      padding: 0;
      background: ${colors.surface};
      color: ${colors.textPrimary};
      min-height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
    }
    body {
      padding: 14px;
      font-size: ${fontSize}px;
      line-height: ${Math.round(fontSize * 1.55)}px;
      caret-color: ${colors.primary};
    }
    p { margin: 0 0 0.7em 0; }
    ul, ol { padding-left: 1.2em; margin: 0.7em 0; }
    li { margin: 0.25em 0; }
    blockquote {
      margin: 0.8em 0;
      padding-left: 0.8em;
      border-left: 2px solid ${colors.primary};
      color: ${colors.textMuted};
    }
    a {
      color: ${colors.primary};
      text-decoration: underline;
    }
    table, th, td {
      border: 1px solid ${colors.border};
      border-collapse: collapse;
    }
    th, td {
      padding: 8px;
      background: ${colors.card};
      color: ${colors.textPrimary};
    }
  `;

  const applyFontFamily = (nextFont: string) => {
    setFontFamily(nextFont);
    const editor = editorRef.current as (RichEditor & { setFontName?: (name: string) => void }) | null;
    editor?.setFontName?.(nextFont);
    editor?.focusContentEditor();
  };

  return (
    <View style={[styles.wrapper, focused && styles.wrapperFocused]}>
      <View style={styles.controlRail}>
        <View style={styles.controlGroup}>
          <Text style={styles.controlLabel}>Font</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.controlRow}>
            {FONT_FAMILY_OPTIONS.map((option) => {
              const active = fontFamily === option.value;
              return (
                <Pressable
                  key={option.id}
                  style={[styles.controlChip, active && styles.controlChipActive]}
                  onPress={() => applyFontFamily(option.value)}
                >
                  <Text style={[styles.controlChipText, active && styles.controlChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.controlGroupCompact}>
          <Text style={styles.controlLabel}>Size</Text>
          <View style={styles.controlRow}>
            {FONT_SIZE_OPTIONS.map((option) => {
              const active = fontSize === option.px;
              return (
                <Pressable
                  key={option.id}
                  style={[styles.controlChipSmall, active && styles.controlChipActive]}
                  onPress={() => {
                    setFontSize(option.px);
                    editorRef.current?.setFontSize(option.command);
                    editorRef.current?.focusContentEditor();
                  }}
                >
                  <Text style={[styles.controlChipText, active && styles.controlChipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <RichToolbar
        editor={editorRef}
        actions={[
          actions.setBold,
          actions.setItalic,
          actions.setUnderline,
          actions.insertBulletsList,
          actions.insertOrderedList,
          actions.heading1,
          actions.blockquote,
          actions.removeFormat,
          actions.undo,
          actions.redo,
          "insertTable",
          "fontSmaller",
          "fontLarger",
        ].filter(Boolean) as string[]}
        iconMap={{
          insertTable: ({ tintColor }: { tintColor: string }) => (
            <Text style={[styles.toolbarText, { color: tintColor }]}>Tbl</Text>
          ),
          fontSmaller: ({ tintColor }: { tintColor: string }) => (
            <Text style={[styles.toolbarText, { color: tintColor }]}>A-</Text>
          ),
          fontLarger: ({ tintColor }: { tintColor: string }) => (
            <Text style={[styles.toolbarText, { color: tintColor }]}>A+</Text>
          ),
        }}
        onPressAddImage={() => {}}
        onPress={(action: string) => {
          if (action === "insertTable") {
            const editor = editorRef.current as unknown as {
              insertHTML?: (html: string) => void;
            } | null;
            if (typeof editor?.insertHTML === "function") {
              editor.insertHTML(TABLE_HTML);
            }
            return;
          }
          if (action === "fontSmaller") {
            setFontSize((prev) => Math.max(14, prev - 2));
            return;
          }
          if (action === "fontLarger") {
            setFontSize((prev) => Math.min(28, prev + 2));
            return;
          }
        }}
        style={styles.toolbar}
        flatContainerStyle={styles.toolbarContent}
        itemStyle={styles.toolbarItem}
        selectedButtonStyle={styles.toolbarItemActive}
        unselectedButtonStyle={styles.toolbarItemIdle}
        disabledButtonStyle={styles.toolbarItemDisabled}
        iconTint={colors.textMuted}
        selectedIconTint={colors.textPrimary}
        disabledIconTint={colors.border}
        iconSize={18}
        iconGap={30}
      />
      <RichEditor
        ref={editorRef}
        style={[styles.editor, { minHeight, height: minHeight }]}
        initialHeight={minHeight}
        placeholder={placeholder}
        initialContentHTML={value}
        styleWithCSS
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editorStyle={{
          backgroundColor: colors.surface,
          color: colors.textPrimary,
          caretColor: colors.primary,
          placeholderColor: colors.textMuted,
          initialCSSText: `html, body { background: ${colors.surface}; color: ${colors.textPrimary}; }`,
          contentCSSText: editorCss,
          cssText: editorCss,
        }}
        onChange={(html) => {
          lastSyncedHtmlRef.current = html || "";
          onChange(html);
        }}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    wrapperFocused: {
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOpacity: 0.16,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    controlRail: {
      paddingHorizontal: 10,
      paddingTop: 10,
      paddingBottom: 8,
      gap: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    controlGroup: {
      gap: 6,
    },
    controlGroupCompact: {
      gap: 6,
    },
    controlLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    controlRow: {
      gap: 8,
      alignItems: "center",
    },
    controlChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    controlChipSmall: {
      minWidth: 46,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 7,
      alignItems: "center",
    },
    controlChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.infoSoft,
    },
    controlChipText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    controlChipTextActive: {
      color: colors.textPrimary,
    },
    toolbar: {
      backgroundColor: colors.background,
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    toolbarContent: {
      gap: 8,
      paddingRight: 4,
    },
    toolbarItem: {
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    toolbarItemIdle: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toolbarItemActive: {
      backgroundColor: colors.infoSoft,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    toolbarItemDisabled: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      opacity: 0.45,
    },
    toolbarText: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 12,
    },
    editor: {
      backgroundColor: colors.surface,
      minHeight: 160,
    },
  });
