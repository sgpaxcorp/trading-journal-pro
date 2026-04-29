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
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { usePlanAccess } from "../lib/usePlanAccess";
import { apiGet } from "../lib/api";

const PAGES_TABLE = "ntj_notebook_pages";
const FREE_NOTES_TABLE = "ntj_notebook_free_notes";

type RouteParams = {
  kind: "page" | "free";
  id: string;
  title?: string;
};

type NotebookInkPayload = {
  mode?: "text" | "ink";
  drawing?: InkDrawing | null;
};

type AccountsResponse = {
  activeAccountId: string | null;
};

type PageRow = {
  id: string;
  title: string;
  content: string | null;
  ink: NotebookInkPayload | null;
  updated_at: string | null;
  created_at?: string | null;
};

type FreeNoteRow = {
  entry_date: string;
  content: string | null;
  ink: NotebookInkPayload | null;
  updated_at: string | null;
};

async function fetchActiveAccountId(): Promise<string | null> {
  try {
    const res = await apiGet<AccountsResponse>("/api/trading-accounts/list");
    return res.activeAccountId ?? null;
  } catch {
    return null;
  }
}

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
  const user = useSupabaseUser();
  const planAccess = usePlanAccess();
  const route = useRoute<any>();
  const params = (route?.params ?? {}) as RouteParams;
  const { kind, id, title } = params;
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
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const loadData = useCallback(async () => {
    if (!planAccess.isAdvanced) return;
    if (!supabaseMobile || !user?.id || !kind || !id) return;
    setLoading(true);
    setError(null);

    try {
      const accountId = await fetchActiveAccountId();

      if (kind === "page") {
        const pageResult = await supabaseMobile
          .from(PAGES_TABLE)
          .select("id, title, content, ink, updated_at, created_at")
          .eq("id", id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (pageResult.error) throw pageResult.error;
        const page = pageResult.data as PageRow | null;
        if (!page) throw new Error(t(language, "Page not found.", "No encontramos la página."));

        setCurrentTitle(page.title);
        setRenameValue(page.title);
        setContent(page.content ?? "");
        setMode(page.ink?.mode === "ink" ? "ink" : "text");
        setInk(page.ink?.drawing ?? null);
        setLastUpdated(page.updated_at ?? page.created_at ?? null);
      } else {
        const noteResult = accountId
          ? await supabaseMobile
              .from(FREE_NOTES_TABLE)
              .select("entry_date, content, ink, updated_at")
              .eq("entry_date", id)
              .eq("user_id", user.id)
              .eq("account_id", accountId)
              .maybeSingle()
          : await supabaseMobile
              .from(FREE_NOTES_TABLE)
              .select("entry_date, content, ink, updated_at")
              .eq("entry_date", id)
              .eq("user_id", user.id)
              .maybeSingle();

        if (noteResult.error) throw noteResult.error;
        const note = noteResult.data as FreeNoteRow | null;
        if (!note) throw new Error(t(language, "Note not found.", "No encontramos la nota."));

        setCurrentTitle(buildDailyTitle(language, note.entry_date));
        setRenameValue(buildDailyTitle(language, note.entry_date));
        setContent(note.content ?? "");
        setMode(note.ink?.mode === "ink" ? "ink" : "text");
        setInk(note.ink?.drawing ?? null);
        setLastUpdated(note.updated_at ?? null);
      }
    } catch (err: any) {
      setError(err?.message ?? t(language, "Failed to load notebook.", "No pudimos cargar el notebook."));
    } finally {
      setLoading(false);
    }
  }, [id, kind, language, planAccess.isAdvanced, user?.id]);

  useEffect(() => {
    if (!planAccess.isAdvanced) return;
    void loadData();
  }, [loadData, planAccess.isAdvanced]);

  async function handleSave() {
    if (!planAccess.isAdvanced) return;
    if (!supabaseMobile || !user?.id || !kind || !id) return;
    setSaving(true);
    setError(null);
    try {
      const accountId = await fetchActiveAccountId();
      const inkPayload: NotebookInkPayload = {
        mode,
        drawing: mode === "ink" ? ink : null,
      };

      if (kind === "page") {
        const updateResult = await supabaseMobile
          .from(PAGES_TABLE)
          .update({
            content,
            ink: inkPayload,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("user_id", user.id);
        if (updateResult.error) throw updateResult.error;
      } else {
        const updateResult = accountId
          ? await supabaseMobile
              .from(FREE_NOTES_TABLE)
              .update({
                content,
                ink: inkPayload,
                updated_at: new Date().toISOString(),
              })
              .eq("entry_date", id)
              .eq("user_id", user.id)
              .eq("account_id", accountId)
          : await supabaseMobile
              .from(FREE_NOTES_TABLE)
              .update({
                content,
                ink: inkPayload,
                updated_at: new Date().toISOString(),
              })
              .eq("entry_date", id)
              .eq("user_id", user.id);
        if (updateResult.error) throw updateResult.error;
      }

      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? t(language, "Failed to save.", "No pudimos guardar."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!planAccess.isAdvanced) return;
    if (!supabaseMobile || !user?.id || kind !== "page") {
      setRenameOpen(false);
      return;
    }
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;

    setRenaming(true);
    setError(null);
    try {
      const updateResult = await supabaseMobile
        .from(PAGES_TABLE)
        .update({
          title: nextTitle,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", user.id);
      if (updateResult.error) throw updateResult.error;
      setCurrentTitle(nextTitle);
      setRenameOpen(false);
      setLastUpdated(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? t(language, "Failed to rename page.", "No pudimos renombrar la página."));
    } finally {
      setRenaming(false);
    }
  }

  const screenTitle = currentTitle || title || t(language, "Notebook page", "Página del notebook");
  const screenSubtitle =
    kind === "page"
      ? t(
          language,
          "Write, format, or sketch on this page without the extra workspace chrome.",
          "Escribe, formatea o dibuja en esta página sin el chrome extra del workspace."
        )
      : t(
          language,
          "Your journal day page stays focused here: write or draw without distractions.",
          "La página del journal del día se mantiene enfocada aquí: escribe o dibuja sin distracciones."
        );

  if (!planAccess.isAdvanced) {
    return (
      <PlanGate
        title={t(language, "Notebook", "Notebook")}
        badge="Advanced"
        loading={planAccess.loading}
        subtitle={t(
          language,
          "Notebook page editing, ink, rich text, and daily pages are included in Advanced.",
          "La edición de páginas, ink, rich text y páginas diarias de Notebook están incluidas en Advanced."
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
            label={kind === "page" ? t(language, "Notebook page", "Página del notebook") : t(language, "Journal page", "Página del journal")}
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
