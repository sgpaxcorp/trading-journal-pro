import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
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
  const [openDropdown, setOpenDropdown] = useState<"font" | "size" | null>(null);

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

  const applyFontSize = (nextSize: (typeof FONT_SIZE_OPTIONS)[number]) => {
    setFontSize(nextSize.px);
    editorRef.current?.setFontSize(nextSize.command);
    editorRef.current?.focusContentEditor();
  };

  const currentFontOption = FONT_FAMILY_OPTIONS.find((option) => option.value === fontFamily) ?? FONT_FAMILY_OPTIONS[0];
  const currentSizeOption = FONT_SIZE_OPTIONS.find((option) => option.px === fontSize);
  const dropdownTitle = openDropdown === "font" ? "Choose font" : "Choose size";
  const dropdownOptions = openDropdown === "font" ? FONT_FAMILY_OPTIONS : FONT_SIZE_OPTIONS;

  return (
    <View style={[styles.wrapper, focused && styles.wrapperFocused]}>
      <View style={styles.controlRail}>
        <View style={styles.dropdownRow}>
          <Pressable
            style={[styles.dropdownField, openDropdown === "font" && styles.dropdownFieldActive]}
            onPress={() => setOpenDropdown((current) => (current === "font" ? null : "font"))}
          >
            <Text style={styles.dropdownLabel}>Font</Text>
            <View style={styles.dropdownValueRow}>
              <Text style={styles.dropdownValue} numberOfLines={1}>
                {currentFontOption?.label ?? "System"}
              </Text>
              <Text style={styles.dropdownChevron}>v</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.dropdownField, openDropdown === "size" && styles.dropdownFieldActive]}
            onPress={() => setOpenDropdown((current) => (current === "size" ? null : "size"))}
          >
            <Text style={styles.dropdownLabel}>Size</Text>
            <View style={styles.dropdownValueRow}>
              <Text style={styles.dropdownValue} numberOfLines={1}>
                {currentSizeOption?.label ?? String(fontSize)}
              </Text>
              <Text style={styles.dropdownChevron}>v</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <Modal
        transparent
        visible={openDropdown !== null}
        animationType="fade"
        onRequestClose={() => setOpenDropdown(null)}
      >
        <View style={styles.dropdownModal}>
          <Pressable style={styles.dropdownBackdrop} onPress={() => setOpenDropdown(null)} />
          <View style={styles.dropdownSheet}>
            <Text style={styles.dropdownSheetTitle}>{dropdownTitle}</Text>
            <View style={styles.dropdownSheetOptions}>
              {dropdownOptions.map((option) => {
                const active =
                  openDropdown === "font"
                    ? fontFamily === (option as (typeof FONT_FAMILY_OPTIONS)[number]).value
                    : fontSize === (option as (typeof FONT_SIZE_OPTIONS)[number]).px;

                return (
                  <Pressable
                    key={option.id}
                    style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                    onPress={() => {
                      if (openDropdown === "font") {
                        applyFontFamily((option as (typeof FONT_FAMILY_OPTIONS)[number]).value);
                      } else {
                        applyFontSize(option as (typeof FONT_SIZE_OPTIONS)[number]);
                      }
                      setOpenDropdown(null);
                    }}
                  >
                    <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>
                      {option.label}
                    </Text>
                    {active ? <Text style={styles.dropdownOptionBadge}>Current</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

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
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.background,
    },
    dropdownRow: {
      flexDirection: "row",
      gap: 10,
    },
    dropdownField: {
      flex: 1,
      minWidth: 0,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    dropdownFieldActive: {
      borderColor: colors.primary,
      backgroundColor: colors.infoSoft,
    },
    dropdownLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    dropdownValueRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    dropdownValue: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
    },
    dropdownChevron: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    dropdownModal: {
      flex: 1,
      justifyContent: "flex-end",
    },
    dropdownBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(3, 7, 18, 0.45)",
    },
    dropdownSheet: {
      marginHorizontal: 12,
      marginBottom: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: 14,
      gap: 12,
    },
    dropdownSheetTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "800",
    },
    dropdownSheetOptions: {
      gap: 8,
    },
    dropdownOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 10,
    },
    dropdownOptionActive: {
      borderColor: colors.primary,
      backgroundColor: colors.infoSoft,
    },
    dropdownOptionText: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
    },
    dropdownOptionTextActive: {
      color: colors.textPrimary,
    },
    dropdownOptionBadge: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "800",
      textTransform: "uppercase",
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
