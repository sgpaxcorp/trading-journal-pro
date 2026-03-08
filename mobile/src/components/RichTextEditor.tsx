import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RichEditor, RichToolbar, actions } from "react-native-pell-rich-editor";

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

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 160,
}: RichTextEditorProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const editorRef = useRef<RichEditor>(null);
  const [fontSize, setFontSize] = useState(18);

  useEffect(() => {
    const editor = editorRef.current as unknown as {
      setContentHTML?: (html: string) => void;
    } | null;
    if (typeof editor?.setContentHTML === "function") {
      editor.setContentHTML(value || "");
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

  return (
    <View style={styles.wrapper}>
      <RichToolbar
        editor={editorRef}
        actions={[
          actions.setBold,
          actions.setItalic,
          actions.setUnderline,
          actions.insertBulletsList,
          actions.insertOrderedList,
          actions.heading1,
          "insertTable",
          "fontSmaller",
          "fontLarger",
        ].filter(Boolean) as string[]}
        iconMap={{
          insertTable: () => <Text style={styles.toolbarText}>Tbl</Text>,
          fontSmaller: () => <Text style={styles.toolbarText}>A-</Text>,
          fontLarger: () => <Text style={styles.toolbarText}>A+</Text>,
        }}
        onPressAddImage={() => {}}
        onPress={(action) => {
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
      />
      <RichEditor
        ref={editorRef}
        style={[styles.editor, { minHeight }]}
        placeholder={placeholder}
        initialContentHTML={value}
        editorStyle={{
          backgroundColor: colors.surface,
          color: colors.textPrimary,
          placeholderColor: colors.textMuted,
          cssText: `body { padding: 10px; font-size: ${fontSize}px; line-height: ${Math.round(
            fontSize * 1.45
          )}px; color: ${colors.textPrimary}; }`,
        }}
        onChange={onChange}
      />
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrapper: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    toolbar: {
      backgroundColor: colors.card,
      borderBottomColor: colors.border,
      borderBottomWidth: 1,
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
