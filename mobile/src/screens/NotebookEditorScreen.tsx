import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { InkField } from "../components/InkField";
import type { InkDrawing } from "../components/inkTypes";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import type { AppLanguage } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { apiGet } from "../lib/api";

const BOOKS_TABLE = "ntj_notebook_books";
const SECTIONS_TABLE = "ntj_notebook_sections";
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
  notebook_id: string;
  section_id: string | null;
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

type WorkspaceChip = {
  id: string;
  label: string;
  subtitle?: string;
  kind: "page" | "free";
};

type WorkspaceSectionGroup = {
  id: string;
  title: string;
  subtitle?: string;
  items: WorkspaceChip[];
};

type CreateMode = "section" | "page" | null;

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

function formatEntryDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildDailyTitle(language: AppLanguage, entryDate: string) {
  return `${t(language, "Daily note", "Nota diaria")} · ${entryDate}`;
}

export function NotebookEditorScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useSupabaseUser();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const params = (route?.params ?? {}) as RouteParams;
  const { kind, id, title } = params;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"text" | "ink">("text");
  const [ink, setInk] = useState<InkDrawing | null>(null);
  const [currentTitle, setCurrentTitle] = useState(title ?? "");
  const [currentNotebookId, setCurrentNotebookId] = useState<string | null>(null);
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null);
  const [workspaceLabel, setWorkspaceLabel] = useState("");
  const [sectionLabel, setSectionLabel] = useState("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [workspaceChips, setWorkspaceChips] = useState<WorkspaceChip[]>([]);
  const [workspaceGroups, setWorkspaceGroups] = useState<WorkspaceSectionGroup[]>([]);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState<CreateMode>(null);
  const [createValue, setCreateValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  const loadData = useCallback(async () => {
    if (!supabaseMobile || !user?.id || !kind || !id) return;
    setLoading(true);
    setError(null);

    try {
      const accountId = await fetchActiveAccountId();

      if (kind === "page") {
        const pageResult = accountId
          ? await supabaseMobile
              .from(PAGES_TABLE)
              .select("id, notebook_id, section_id, title, content, ink, updated_at, created_at")
              .eq("id", id)
              .eq("user_id", user.id)
              .eq("account_id", accountId)
              .maybeSingle()
          : await supabaseMobile
              .from(PAGES_TABLE)
              .select("id, notebook_id, section_id, title, content, ink, updated_at, created_at")
              .eq("id", id)
              .eq("user_id", user.id)
              .maybeSingle();

        if (pageResult.error) throw pageResult.error;
        const page = pageResult.data as PageRow | null;
        if (!page) throw new Error(t(language, "Page not found.", "No encontramos la página."));

        setCurrentNotebookId(page.notebook_id);
        setCurrentSectionId(page.section_id ?? null);
        setCurrentTitle(page.title);
        setRenameValue(page.title);
        setContent(page.content ?? "");
        setMode(page.ink?.mode === "ink" ? "ink" : "text");
        setInk(page.ink?.drawing ?? null);
        setLastUpdated(page.updated_at ?? page.created_at ?? null);

        const [bookResult, sectionResult, siblingResult, sectionsResult] = await Promise.all([
          supabaseMobile
            .from(BOOKS_TABLE)
            .select("name")
            .eq("id", page.notebook_id)
            .maybeSingle(),
          page.section_id
            ? supabaseMobile
                .from(SECTIONS_TABLE)
                .select("name")
                .eq("id", page.section_id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabaseMobile
            .from(PAGES_TABLE)
            .select("id, title, updated_at, section_id, notebook_id")
            .eq("user_id", user.id)
            .eq("notebook_id", page.notebook_id)
            .order("updated_at", { ascending: false }),
          supabaseMobile
            .from(SECTIONS_TABLE)
            .select("id, name")
            .eq("user_id", user.id)
            .eq("notebook_id", page.notebook_id)
            .order("sort_order", { ascending: true }),
        ]);

        setWorkspaceLabel((bookResult.data as { name?: string } | null)?.name ?? t(language, "Notebook", "Notebook"));
        setSectionLabel((sectionResult.data as { name?: string } | null)?.name ?? t(language, "No section", "Sin sección"));

        const siblingRows = Array.isArray(siblingResult.data) ? siblingResult.data : [];
        const prioritized = siblingRows
          .filter((item: any) => (page.section_id ? item.section_id === page.section_id : !item.section_id))
          .slice(0, 12);
        const fallback = siblingRows
          .filter((item: any) => !prioritized.some((chosen: any) => chosen.id === item.id))
          .slice(0, Math.max(0, 12 - prioritized.length));
        const chips = [...prioritized, ...fallback].map((item: any) => ({
          id: item.id,
          label: item.title || t(language, "Untitled page", "Página sin título"),
          subtitle: item.section_id ? t(language, "Section page", "Página de sección") : t(language, "Standalone page", "Página suelta"),
          kind: "page" as const,
        }));
        setWorkspaceChips(chips);

        const sections = Array.isArray(sectionsResult.data) ? sectionsResult.data : [];
        const pagesBySection = new Map<string | null, WorkspaceChip[]>();

        siblingRows.forEach((item: any) => {
          const key = item.section_id ?? null;
          const list = pagesBySection.get(key) ?? [];
          list.push({
            id: item.id,
            label: item.title || t(language, "Untitled page", "Página sin título"),
            subtitle:
              item.id === id
                ? t(language, "Open now", "Abierta ahora")
                : item.updated_at
                  ? formatDateTime(item.updated_at)
                  : t(language, "No timestamp", "Sin fecha"),
            kind: "page",
          });
          pagesBySection.set(key, list);
        });

        const groups: WorkspaceSectionGroup[] = sections.map((section: any) => ({
          id: section.id,
          title: section.name || t(language, "Unnamed section", "Sección sin nombre"),
          subtitle:
            section.id === page.section_id
              ? t(language, "Current section", "Sección actual")
              : t(language, "Section", "Sección"),
          items: pagesBySection.get(section.id) ?? [],
        }));

        const loosePages = pagesBySection.get(null) ?? [];
        if (loosePages.length > 0) {
          groups.push({
            id: "no-section",
            title: t(language, "Loose pages", "Páginas sueltas"),
            subtitle: t(language, "Pages outside sections", "Páginas fuera de secciones"),
            items: loosePages,
          });
        }

        setWorkspaceGroups(groups);
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

        const recentResult = accountId
          ? await supabaseMobile
              .from(FREE_NOTES_TABLE)
              .select("entry_date, updated_at")
              .eq("user_id", user.id)
              .eq("account_id", accountId)
              .order("entry_date", { ascending: false })
              .limit(12)
          : await supabaseMobile
              .from(FREE_NOTES_TABLE)
              .select("entry_date, updated_at")
              .eq("user_id", user.id)
              .order("entry_date", { ascending: false })
              .limit(12);

        if (recentResult.error) throw recentResult.error;

        setCurrentTitle(buildDailyTitle(language, note.entry_date));
        setRenameValue(buildDailyTitle(language, note.entry_date));
        setCurrentNotebookId(null);
        setCurrentSectionId(null);
        setContent(note.content ?? "");
        setMode(note.ink?.mode === "ink" ? "ink" : "text");
        setInk(note.ink?.drawing ?? null);
        setLastUpdated(note.updated_at ?? null);
        setWorkspaceLabel(t(language, "Daily notebook", "Notebook diario"));
        setSectionLabel(formatEntryDate(note.entry_date));
        const chips = (recentResult.data ?? []).map((item: any) => ({
            id: item.entry_date,
            label: formatEntryDate(item.entry_date),
            subtitle: item.entry_date === id ? t(language, "Current note", "Nota actual") : t(language, "Daily note", "Nota diaria"),
            kind: "free" as const,
          }));
        setWorkspaceChips(chips);
        setWorkspaceGroups([
          {
            id: "recent-daily",
            title: t(language, "Recent daily notes", "Notas diarias recientes"),
            subtitle: t(language, "Jump week by week without leaving the editor.", "Salta semana por semana sin salir del editor."),
            items: chips,
          },
        ]);
      }
    } catch (err: any) {
      setError(err?.message ?? t(language, "Failed to load notebook.", "No pudimos cargar el notebook."));
    } finally {
      setLoading(false);
    }
  }, [id, kind, language, user?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleSave() {
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
        const updateResult = accountId
          ? await supabaseMobile
              .from(PAGES_TABLE)
              .update({
                content,
                ink: inkPayload,
                updated_at: new Date().toISOString(),
              })
              .eq("id", id)
              .eq("user_id", user.id)
              .eq("account_id", accountId)
          : await supabaseMobile
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
    if (!supabaseMobile || !user?.id || kind !== "page") {
      setRenameOpen(false);
      return;
    }
    const nextTitle = renameValue.trim();
    if (!nextTitle) return;

    setRenaming(true);
    setError(null);
    try {
      const accountId = await fetchActiveAccountId();
      const updateResult = accountId
        ? await supabaseMobile
            .from(PAGES_TABLE)
            .update({
              title: nextTitle,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("user_id", user.id)
            .eq("account_id", accountId)
        : await supabaseMobile
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
      await loadData();
    } catch (err: any) {
      setError(err?.message ?? t(language, "Failed to rename page.", "No pudimos renombrar la página."));
    } finally {
      setRenaming(false);
    }
  }

  function openCreateModal(nextMode: Exclude<CreateMode, null>) {
    setCreateOpen(nextMode);
    setCreateValue("");
    setCreateError(null);
  }

  async function handleCreateFromEditor() {
    if (!supabaseMobile || !user?.id || !createOpen) return;
    const nextName = createValue.trim();
    if (!nextName) {
      setCreateError(t(language, "Name is required.", "El nombre es requerido."));
      return;
    }
    if (!currentNotebookId) {
      setCreateError(t(language, "Open a notebook page first.", "Abre primero una página del notebook."));
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const accountId = await fetchActiveAccountId();

      if (createOpen === "section") {
        const sectionInsert = await supabaseMobile
          .from(SECTIONS_TABLE)
          .insert({
            user_id: user.id,
            notebook_id: currentNotebookId,
            name: nextName,
          })
          .select("id, name")
          .single();

        if (sectionInsert.error) throw sectionInsert.error;
        const sectionId = sectionInsert.data?.id as string | undefined;
        if (sectionId) {
          setCreateOpen(null);
          await loadData();
          setCurrentSectionId(sectionId);
        }
        return;
      }

      const pageInsert = await supabaseMobile
        .from(PAGES_TABLE)
        .insert({
          user_id: user.id,
          notebook_id: currentNotebookId,
          section_id: currentSectionId ?? null,
          title: nextName,
          content: "",
          account_id: accountId ?? null,
        })
        .select("id, title")
        .single();

      if (pageInsert.error) throw pageInsert.error;

      setCreateOpen(null);
      await loadData();
      if (pageInsert.data?.id) {
        navigation.replace("NotebookEditor", {
          kind: "page",
          id: pageInsert.data.id,
          title: pageInsert.data.title ?? nextName,
        });
      }
    } catch (err: any) {
      setCreateError(
        err?.message ??
          t(language, "We couldn't create this item.", "No pudimos crear este elemento.")
      );
    } finally {
      setCreating(false);
    }
  }

  function openChip(chip: WorkspaceChip) {
    navigation.replace("NotebookEditor", {
      kind: chip.kind,
      id: chip.id,
      title: chip.kind === "free" ? buildDailyTitle(language, chip.id) : chip.label,
    });
  }

  const screenTitle = currentTitle || title || t(language, "Notebook entry", "Nota");
  const screenSubtitle =
    kind === "page"
      ? t(
          language,
          "Notebook > section > page. Keep notes, sketch with stylus, and jump across related pages.",
          "Notebook > sección > página. Toma notas, dibuja con stylus y salta entre páginas relacionadas."
        )
      : t(
          language,
          "Your daily notebook stays native. Review nearby dates and keep written or ink notes together.",
          "Tu notebook diario se mantiene nativo. Revisa fechas cercanas y conserva texto o tinta en un mismo lugar."
        );

  return (
    <ScreenScaffold title={screenTitle} subtitle={screenSubtitle} scrollable>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading…", "Cargando…")}</Text>
        </View>
      ) : (
        <>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.workspaceCard}>
            <View style={styles.workspaceTop}>
              <View style={styles.workspaceMeta}>
                <Text style={styles.eyebrow}>
                  {kind === "page"
                    ? t(language, "Workspace", "Workspace")
                    : t(language, "Daily flow", "Flujo diario")}
                </Text>
                <Text style={styles.workspacePath}>{workspaceLabel}</Text>
                <Text style={styles.workspaceSubpath}>{sectionLabel}</Text>
              </View>
              <View style={styles.workspaceActions}>
                {kind === "page" ? (
                  <>
                    <Pressable style={styles.secondaryButton} onPress={() => openCreateModal("section")}>
                      <Text style={styles.secondaryButtonText}>{t(language, "New section", "Nueva sección")}</Text>
                    </Pressable>
                    <Pressable style={styles.secondaryButton} onPress={() => openCreateModal("page")}>
                      <Text style={styles.secondaryButtonText}>{t(language, "New page", "Nueva página")}</Text>
                    </Pressable>
                  </>
                ) : null}
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

            <View style={styles.statRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>{t(language, "Mode", "Modo")}</Text>
                <Text style={styles.statValue}>{mode === "ink" ? "Ink" : "Text"}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>{t(language, "Last update", "Última actualización")}</Text>
                <Text style={styles.statValue}>{formatDateTime(lastUpdated)}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>{t(language, "Quick action", "Acción rápida")}</Text>
                <Pressable style={styles.linkButton} onPress={() => navigation.navigate("Notebook")}>
                  <Text style={styles.linkButtonText}>{t(language, "Back to workspace", "Volver al workspace")}</Text>
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.workspaceRail}>
            <View style={styles.railHeader}>
              <View style={styles.railHeaderText}>
                <Text style={styles.railTitle}>
                  {kind === "page"
                    ? t(language, "Workspace explorer", "Explorador del workspace")
                    : t(language, "Daily note explorer", "Explorador de notas diarias")}
                </Text>
                <Text style={styles.railSubtitle}>
                  {kind === "page"
                    ? t(language, "Use the navigator like a notebook rail: section first, page second.", "Usa el navegador como un riel de notebook: primero sección, luego página.")
                    : t(language, "Keep moving through your recent daily notes without leaving the editor.", "Muévete entre tus notas diarias recientes sin salir del editor.")}
                </Text>
              </View>
              <Pressable style={styles.secondaryButton} onPress={() => setExplorerOpen((value) => !value)}>
                <Text style={styles.secondaryButtonText}>
                  {explorerOpen ? t(language, "Collapse", "Colapsar") : t(language, "Expand", "Expandir")}
                </Text>
              </Pressable>
            </View>

            {explorerOpen ? (
              <View style={styles.groupList}>
                {workspaceGroups.map((group) => (
                  <View key={group.id} style={styles.groupCard}>
                    <View style={styles.groupHeader}>
                      <Text style={styles.groupTitle}>{group.title}</Text>
                      {group.subtitle ? <Text style={styles.groupSubtitle}>{group.subtitle}</Text> : null}
                    </View>
                    <View style={styles.chipWrap}>
                      {group.items.length > 0 ? (
                        group.items.map((chip) => {
                          const isActive = chip.id === id;
                          return (
                            <Pressable
                              key={`${group.id}-${chip.kind}-${chip.id}`}
                              style={[styles.workspaceChip, isActive && styles.workspaceChipActive]}
                              onPress={() => openChip(chip)}
                            >
                              <Text style={[styles.workspaceChipTitle, isActive && styles.workspaceChipTitleActive]}>
                                {chip.label}
                              </Text>
                              {chip.subtitle ? (
                                <Text style={[styles.workspaceChipSubtitle, isActive && styles.workspaceChipSubtitleActive]}>
                                  {chip.subtitle}
                                </Text>
                              ) : null}
                            </Pressable>
                          );
                        })
                      ) : (
                        <Text style={styles.emptyGroupText}>
                          {t(language, "No pages in this lane yet.", "Todavía no hay páginas en este carril.")}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.chipWrap}>
                {workspaceChips.slice(0, 6).map((chip) => {
                  const isActive = chip.id === id;
                  return (
                    <Pressable
                      key={`collapsed-${chip.kind}-${chip.id}`}
                      style={[styles.workspaceChip, isActive && styles.workspaceChipActive]}
                      onPress={() => openChip(chip)}
                    >
                      <Text style={[styles.workspaceChipTitle, isActive && styles.workspaceChipTitleActive]}>
                        {chip.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <InkField
            label={t(language, "Notebook page", "Página del notebook")}
            mode={mode}
            onModeChange={setMode}
            textValue={content}
            onTextChange={setContent}
            inkValue={ink}
            onInkChange={setInk}
            placeholder={t(language, "Write your note…", "Escribe tu nota…")}
            height={360}
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
                  {t(language, "Use a page title that is clear enough to scan like a notebook tab.", "Usa un título claro para escanearlo como una pestaña de notebook.")}
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

      <Modal visible={!!createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(null)}>
        <TouchableWithoutFeedback onPress={() => setCreateOpen(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>
                  {createOpen === "section"
                    ? t(language, "Create section", "Crear sección")
                    : t(language, "Create page", "Crear página")}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {createOpen === "section"
                    ? t(language, "This section will be added inside the current notebook.", "Esta sección se añadirá dentro del notebook actual.")
                    : t(language, "This page will be created in the current section or as a loose page if no section is open.", "Esta página se creará en la sección actual o quedará suelta si no hay sección abierta.")}
                </Text>
                <TextInput
                  value={createValue}
                  onChangeText={setCreateValue}
                  placeholder={
                    createOpen === "section"
                      ? t(language, "Section name", "Nombre de la sección")
                      : t(language, "Page title", "Título de la página")
                  }
                  placeholderTextColor={colors.textMuted}
                  style={styles.modalInput}
                  autoFocus
                />
                {currentNotebookId ? (
                  <View style={styles.contextCard}>
                    <Text style={styles.contextLabel}>{t(language, "Notebook", "Notebook")}</Text>
                    <Text style={styles.contextValue}>{workspaceLabel}</Text>
                    {createOpen === "page" ? (
                      <>
                        <Text style={styles.contextLabel}>{t(language, "Target section", "Sección destino")}</Text>
                        <Text style={styles.contextValue}>
                          {currentSectionId ? sectionLabel : t(language, "Loose page", "Página suelta")}
                        </Text>
                      </>
                    ) : null}
                  </View>
                ) : null}
                {createError ? <Text style={styles.errorText}>{createError}</Text> : null}
                <View style={styles.modalActions}>
                  <Pressable style={styles.secondaryButton} onPress={() => setCreateOpen(null)}>
                    <Text style={styles.secondaryButtonText}>{t(language, "Cancel", "Cancelar")}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.saveButton, creating && styles.saveButtonDisabled]}
                    onPress={handleCreateFromEditor}
                  >
                    <Text style={styles.saveButtonText}>
                      {creating ? t(language, "Creating…", "Creando…") : t(language, "Create", "Crear")}
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
    workspaceCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 12,
    },
    workspaceTop: {
      gap: 12,
    },
    workspaceMeta: {
      gap: 4,
    },
    eyebrow: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.4,
      textTransform: "uppercase",
    },
    workspacePath: {
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: "800",
    },
    workspaceSubpath: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
    workspaceActions: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },
    statRow: {
      flexDirection: "row",
      gap: 10,
      flexWrap: "wrap",
    },
    statCard: {
      minWidth: 140,
      flexGrow: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 5,
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    statValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    workspaceRail: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 8,
    },
    railHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 10,
      flexWrap: "wrap",
    },
    railHeaderText: {
      flex: 1,
      minWidth: 220,
      gap: 4,
    },
    railTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "800",
    },
    railSubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    groupList: {
      gap: 10,
    },
    groupCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 10,
    },
    groupHeader: {
      gap: 2,
    },
    groupTitle: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "800",
    },
    groupSubtitle: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
    },
    emptyGroupText: {
      color: colors.textMuted,
      fontSize: 12,
      fontStyle: "italic",
    },
    workspaceChip: {
      minWidth: 124,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 2,
    },
    workspaceChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.infoSoft,
    },
    workspaceChipTitle: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
    workspaceChipTitleActive: {
      color: colors.primary,
    },
    workspaceChipSubtitle: {
      color: colors.textMuted,
      fontSize: 11,
    },
    workspaceChipSubtitleActive: {
      color: colors.textPrimary,
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
    linkButton: {
      alignSelf: "flex-start",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    linkButtonText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: "800",
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
    contextCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      gap: 6,
    },
    contextLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
    contextValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
  });
