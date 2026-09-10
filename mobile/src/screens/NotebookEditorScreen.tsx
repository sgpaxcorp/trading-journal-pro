import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View,
} from "react-native";
import { useRoute } from "@react-navigation/native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { PlanGate } from "../components/PlanGate";
import { InkField } from "../components/InkField";
import type { InkDrawing } from "../components/inkTypes";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import type { AppLanguage } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { usePlanAccess } from "../lib/usePlanAccess";
import { apiGet, apiPost } from "../lib/api";

type RouteParams = {
  kind: "page" | "free";
  id: string;
  title?: string;
  accountId?: string | null;
  accountName?: string;
};

type NotebookInkPayload = {
  mode?: "text" | "ink";
  drawing?: InkDrawing | null;
};

type PageRow = {
  id: string;
  title: string;
  content: string | null;
  ink: NotebookInkPayload | null;
  updated_at: string | null;
  created_at?: string | null;
  version?: number;
};

type FreeNoteRow = {
  entry_date: string;
  content: string | null;
  ink: NotebookInkPayload | null;
  updated_at: string | null;
  version?: number;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function buildDailyTitle(language: AppLanguage, entryDate: string) {
  return `${t(language, "Daily note", "Nota diaria")} · ${entryDate}`;
}

export function NotebookEditorScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const planAccess = usePlanAccess();
  const route = useRoute<any>();
  const params = (route?.params ?? {}) as RouteParams;
  const { kind, id, title, accountId, accountName } = params;
  const { height: screenHeight } = useWindowDimensions();
  const editorFieldHeight = Math.max(620, Math.min(920, Math.round(screenHeight * 0.78)));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"text" | "ink">("text");
  const [ink, setInk] = useState<InkDrawing | null>(null);
  const [currentTitle, setCurrentTitle] = useState(title ?? "");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const loadData = useCallback(async () => {
    if (!planAccess.hasNotebook) return;
    if (!kind || !id) return;
    setLoading(true);
    setError(null);

    try {
      if (kind === "page") {
        const pageResult = await apiGet<{ page: PageRow }>(
          `/api/notebook/workspace?view=page&pageId=${encodeURIComponent(id)}`
        );
        const page = pageResult.page;
        if (!page) throw new Error(t(language, "Page not found.", "No encontramos la página."));

        setCurrentTitle(page.title);
        setRenameValue(page.title);
        setContent(page.content ?? "");
        setMode(page.ink?.mode === "ink" ? "ink" : "text");
        setInk(page.ink?.drawing ?? null);
        setLastUpdated(page.updated_at ?? page.created_at ?? null);
        setVersion(page.version ?? 1);
      } else {
        if (!accountId) throw new Error(t(language, "Account context is missing.", "Falta el contexto de cuenta."));
        const noteResult = await apiGet<{ daily: { note: FreeNoteRow | null } }>(
          `/api/notebook/workspace?view=daily&accountId=${encodeURIComponent(accountId)}&date=${encodeURIComponent(id)}`
        );
        const note = noteResult.daily.note;
        if (!note) throw new Error(t(language, "Note not found.", "No encontramos la nota."));

        setCurrentTitle(buildDailyTitle(language, note.entry_date));
        setRenameValue(buildDailyTitle(language, note.entry_date));
        setContent(note.content ?? "");
        setMode(note.ink?.mode === "ink" ? "ink" : "text");
        setInk(note.ink?.drawing ?? null);
        setLastUpdated(note.updated_at ?? null);
        setVersion(note.version ?? 1);
      }
    } catch (err: any) {
      setError(err?.message ?? t(language, "Failed to load notebook.", "No pudimos cargar el notebook."));
    } finally {
      setLoading(false);
    }
  }, [accountId, id, kind, language, planAccess.hasNotebook]);

  useEffect(() => {
    if (!planAccess.hasNotebook) return;
    void loadData();
  }, [loadData, planAccess.hasNotebook]);

  async function handleSave() {
    if (!planAccess.hasNotebook) return;
    if (!kind || !id) return;
    setSaving(true);
    setError(null);
    try {
      const inkPayload: NotebookInkPayload = {
        mode,
        drawing: mode === "ink" ? ink : null,
      };

      if (kind === "page") {
        const updateResult = await apiPost<{ page: PageRow }>("/api/notebook/workspace", {
          action: "update_page",
          pageId: id,
          content,
          ink: inkPayload,
          expectedVersion: version,
        });
        setVersion(updateResult.page.version ?? version);
      } else {
        if (!accountId) throw new Error(t(language, "Account context is missing.", "Falta el contexto de cuenta."));
        const updateResult = await apiPost<{ note: FreeNoteRow }>("/api/notebook/workspace", {
          action: "upsert_daily",
          accountId,
          date: id,
          content,
          ink: inkPayload,
          expectedVersion: version,
        });
        setVersion(updateResult.note.version ?? version);
      }

      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? t(language, "Failed to save.", "No pudimos guardar."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!planAccess.hasNotebook) return;
    if (kind !== "page") {
      setRenameOpen(false);
      return;
    }
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;

    setRenaming(true);
    setError(null);
    try {
      const updateResult = await apiPost<{ page: PageRow }>("/api/notebook/workspace", {
        action: "update_page",
        pageId: id,
        title: nextTitle,
        expectedVersion: version,
      });
      setVersion(updateResult.page.version ?? version);
      setCurrentTitle(nextTitle);
      setRenameOpen(false);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? t(language, "Failed to rename page.", "No pudimos renombrar la página."));
    } finally {
      setRenaming(false);
    }
  }

  const screenTitle = currentTitle || title || t(language, "Business Notebook page", "Página del Notebook Empresarial");
  const screenSubtitle = accountName
    ? accountName
    : kind === "page"
      ? t(
          language,
          "Write, format, or sketch on this page without the extra workspace chrome.",
          "Escribe, formatea o dibuja en esta página sin el chrome extra del workspace."
        )
      : t(
          language,
          "Your daily business page stays focused here: write or draw without distractions.",
          "Tu página empresarial diaria se mantiene enfocada aquí: escribe o dibuja sin distracciones."
        );

  if (!planAccess.hasNotebook) {
    return (
      <PlanGate
        title={t(language, "Business Notebook", "Notebook Empresarial")}
        badge="Advanced"
        loading={planAccess.loading}
        subtitle={t(
          language,
          "Business Notebook page editing, ink, rich text, and daily pages are included in Advanced.",
          "La edición de páginas del Notebook Empresarial, ink, rich text y páginas diarias están incluidas en Advanced."
        )}
      />
    );
  }

  return (
    <ScreenScaffold
      title={screenTitle}
      subtitle={screenSubtitle}
      scrollable
      showBrand={false}
      compactHeader
      contentPadding={12}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading…", "Cargando…")}</Text>
        </View>
      ) : (
        <>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.editorBar}>
            <View style={styles.editorMeta}>
              <Text style={styles.editorMetaLabel}>{t(language, "Last update", "Última actualización")}</Text>
              <Text style={styles.editorMetaValue}>{formatDateTime(lastUpdated)}</Text>
            </View>
            <View style={styles.editorActions}>
              {kind === "page" ? (
                <Pressable style={styles.secondaryButton} onPress={() => setRenameOpen(true)}>
                  <Text style={styles.secondaryButtonText}>{t(language, "Rename", "Renombrar")}</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave}>
                <Text style={styles.saveButtonText}>
                  {saving ? t(language, "Saving…", "Guardando…") : t(language, "Save", "Guardar")}
                </Text>
              </Pressable>
            </View>
          </View>

          <InkField
            label={kind === "page" ? t(language, "Business Notebook page", "Página del Notebook Empresarial") : t(language, "Daily business page", "Página empresarial diaria")}
            mode={mode}
            onModeChange={setMode}
            textValue={content}
            onTextChange={setContent}
            inkValue={ink}
            onInkChange={setInk}
            placeholder={t(language, "Write your note…", "Escribe tu nota…")}
            height={editorFieldHeight}
          />
        </>
      )}

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setRenameOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>{t(language, "Rename page", "Renombrar página")}</Text>
                <Text style={styles.modalSubtitle}>
                  {t(
                    language,
                    "Use a page title that feels clear inside the notebook library.",
                    "Usa un título de página que se sienta claro dentro de la biblioteca del notebook."
                  )}
                </Text>
                <TextInput
                  value={renameValue}
                  onChangeText={setRenameValue}
                  placeholder={t(language, "Page title", "Título de la página")}
                  placeholderTextColor={colors.textMuted}
                  style={styles.modalInput}
                  autoFocus
                />
                <View style={styles.modalActions}>
                  <Pressable style={styles.secondaryButton} onPress={() => setRenameOpen(false)}>
                    <Text style={styles.secondaryButtonText}>{t(language, "Cancel", "Cancelar")}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.saveButton, renaming && styles.saveButtonDisabled]}
                    onPress={handleRename}
                  >
                    <Text style={styles.saveButtonText}>
                      {renaming ? t(language, "Saving…", "Guardando…") : t(language, "Apply", "Aplicar")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    loadingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
    },
    editorBar: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 12,
    },
    editorMeta: {
      gap: 4,
    },
    editorMetaLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    editorMetaValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    editorActions: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },
    saveButton: {
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 11,
      paddingHorizontal: 16,
      minWidth: 110,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: colors.onPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    secondaryButton: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 11,
      paddingHorizontal: 14,
    },
    secondaryButtonText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "center",
      padding: 18,
    },
    modalCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      gap: 12,
    },
    modalTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "800",
    },
    modalSubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    modalInput: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "600",
    },
    modalActions: {
      flexDirection: "row",
      justifyContent: "flex-end",
      gap: 8,
      flexWrap: "wrap",
    },
  });
