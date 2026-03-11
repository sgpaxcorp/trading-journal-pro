import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { apiGet } from "../lib/api";

const BOOKS_TABLE = "ntj_notebook_books";
const SECTIONS_TABLE = "ntj_notebook_sections";
const PAGES_TABLE = "ntj_notebook_pages";

type RouteParams = {
  notebookId: string;
  title?: string;
};

type NotebookBook = {
  id: string;
  name: string;
  account_id?: string | null;
};

type NotebookSection = {
  id: string;
  name: string;
  notebook_id: string;
};

type NotebookPage = {
  id: string;
  notebook_id: string;
  section_id: string | null;
  title: string;
  content: string;
  updated_at: string | null;
  created_at: string;
};

type ManageTarget =
  | { kind: "book"; book: NotebookBook }
  | { kind: "section"; section: NotebookSection }
  | { kind: "page"; page: NotebookPage };

type CreateMode = "section" | "page" | null;

type AccountsResponse = {
  activeAccountId: string | null;
};

async function fetchActiveAccountId(): Promise<string | null> {
  try {
    const res = await apiGet<AccountsResponse>("/api/trading-accounts/list");
    return res.activeAccountId ?? null;
  } catch {
    return null;
  }
}

function stripHtml(input?: string | null) {
  if (!input) return "";
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

export function NotebookWorkspaceScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const user = useSupabaseUser();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { notebookId, title } = (route.params ?? {}) as RouteParams;

  const [book, setBook] = useState<NotebookBook | null>(null);
  const [sections, setSections] = useState<NotebookSection[]>([]);
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [createValue, setCreateValue] = useState("");
  const [createSectionId, setCreateSectionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [manageTarget, setManageTarget] = useState<ManageTarget | null>(null);
  const [manageName, setManageName] = useState("");
  const [manageSectionId, setManageSectionId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const loadWorkspace = useCallback(
    async (options?: { showLoading?: boolean; isRefresh?: boolean }) => {
      if (!supabaseMobile || !user?.id || !notebookId) return;

      const showLoading = options?.showLoading ?? false;
      const isRefresh = options?.isRefresh ?? false;
      if (showLoading) setLoading(true);
      if (isRefresh) setRefreshing(true);
      setError(null);

      try {
        const accountId = await fetchActiveAccountId();
        let bookQuery = supabaseMobile
          .from(BOOKS_TABLE)
          .select("id, name, account_id")
          .eq("id", notebookId)
          .eq("user_id", user.id);

        if (accountId) {
          bookQuery = bookQuery.eq("account_id", accountId);
        }

        const { data: bookRow, error: bookErr } = await bookQuery.maybeSingle();
        if (bookErr) throw bookErr;
        if (!bookRow) {
          throw new Error(
            t(
              language,
              "We couldn't find this notebook.",
              "No pudimos encontrar este notebook."
            )
          );
        }

        const [sectionResult, pageResult] = await Promise.all([
          supabaseMobile
            .from(SECTIONS_TABLE)
            .select("id, name, notebook_id")
            .eq("user_id", user.id)
            .eq("notebook_id", notebookId)
            .order("created_at", { ascending: true }),
          supabaseMobile
            .from(PAGES_TABLE)
            .select("id, notebook_id, section_id, title, content, created_at, updated_at")
            .eq("user_id", user.id)
            .eq("notebook_id", notebookId)
            .order("updated_at", { ascending: false }),
        ]);

        if (sectionResult.error) throw sectionResult.error;
        if (pageResult.error) throw pageResult.error;

        setBook(bookRow as NotebookBook);
        setSections(Array.isArray(sectionResult.data) ? (sectionResult.data as NotebookSection[]) : []);
        setPages(Array.isArray(pageResult.data) ? (pageResult.data as NotebookPage[]) : []);
      } catch (err: any) {
        setError(
          err?.message ??
            t(
              language,
              "We couldn't load this notebook workspace.",
              "No pudimos cargar este workspace del notebook."
            )
        );
      } finally {
        if (showLoading) setLoading(false);
        if (isRefresh) setRefreshing(false);
      }
    },
    [language, notebookId, user?.id]
  );

  useFocusEffect(
    useCallback(() => {
      void loadWorkspace({ showLoading: true });
    }, [loadWorkspace])
  );

  const standalonePages = useMemo(
    () => pages.filter((page) => !page.section_id),
    [pages]
  );

  const sectionGroups = useMemo(
    () =>
      sections.map((section) => ({
        section,
        pages: pages.filter((page) => page.section_id === section.id),
      })),
    [pages, sections]
  );

  function openCreate(mode: Exclude<CreateMode, null>, sectionId?: string | null) {
    setCreateMode(mode);
    setCreateValue("");
    setCreateError(null);
    setCreating(false);
    setCreateSectionId(sectionId ?? null);
  }

  function closeCreate() {
    if (creating) return;
    setCreateMode(null);
    setCreateValue("");
    setCreateError(null);
    setCreateSectionId(null);
  }

  function openManage(target: ManageTarget) {
    setManageTarget(target);
    setManageError(null);
    setManaging(false);
    if (target.kind === "book") {
      setManageName(target.book.name);
      setManageSectionId(null);
      return;
    }
    if (target.kind === "section") {
      setManageName(target.section.name);
      setManageSectionId(null);
      return;
    }
    setManageName(target.page.title);
    setManageSectionId(target.page.section_id);
  }

  function closeManage() {
    if (managing) return;
    setManageTarget(null);
    setManageError(null);
    setManageSectionId(null);
  }

  async function handleCreate() {
    if (!supabaseMobile || !user?.id || !book || !createMode) return;
    const trimmed = createValue.trim();
    if (!trimmed) {
      setCreateError(t(language, "Name is required.", "El nombre es requerido."));
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      if (createMode === "section") {
        const { error: sectionError } = await supabaseMobile
          .from(SECTIONS_TABLE)
          .insert({
            user_id: user.id,
            notebook_id: book.id,
            name: trimmed,
          });

        if (sectionError) throw sectionError;
        closeCreate();
        await loadWorkspace();
        return;
      }

      const { data, error: pageError } = await supabaseMobile
        .from(PAGES_TABLE)
        .insert({
          user_id: user.id,
          notebook_id: book.id,
          section_id: createSectionId ?? null,
          title: trimmed,
          content: "",
        })
        .select("id, title")
        .single();

      if (pageError) throw pageError;
      closeCreate();
      await loadWorkspace();
      if (data?.id) {
        navigation.navigate("NotebookEditor", {
          kind: "page",
          id: data.id,
          title: data.title ?? trimmed,
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

  async function handleManageSave() {
    if (!supabaseMobile || !user?.id || !manageTarget) return;
    const trimmed = manageName.trim();
    if (!trimmed) {
      setManageError(t(language, "Name is required.", "El nombre es requerido."));
      return;
    }

    setManaging(true);
    setManageError(null);
    try {
      if (manageTarget.kind === "book") {
        const { error: bookError } = await supabaseMobile
          .from(BOOKS_TABLE)
          .update({
            name: trimmed,
            updated_at: new Date().toISOString(),
          })
          .eq("id", manageTarget.book.id)
          .eq("user_id", user.id);
        if (bookError) throw bookError;
      } else if (manageTarget.kind === "section") {
        const { error: sectionError } = await supabaseMobile
          .from(SECTIONS_TABLE)
          .update({
            name: trimmed,
            updated_at: new Date().toISOString(),
          })
          .eq("id", manageTarget.section.id)
          .eq("user_id", user.id);
        if (sectionError) throw sectionError;
      } else {
        const { error: pageError } = await supabaseMobile
          .from(PAGES_TABLE)
          .update({
            title: trimmed,
            section_id: manageSectionId ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", manageTarget.page.id)
          .eq("user_id", user.id);
        if (pageError) throw pageError;
      }

      closeManage();
      await loadWorkspace();
    } catch (err: any) {
      setManageError(
        err?.message ??
          t(language, "We couldn't save these changes.", "No pudimos guardar estos cambios.")
      );
    } finally {
      setManaging(false);
    }
  }

  async function executeDeleteTarget() {
    if (!supabaseMobile || !user?.id || !manageTarget) return;
    setManaging(true);
    setManageError(null);
    try {
      if (manageTarget.kind === "book") {
        const { error: deletePagesError } = await supabaseMobile
          .from(PAGES_TABLE)
          .delete()
          .eq("notebook_id", manageTarget.book.id)
          .eq("user_id", user.id);
        if (deletePagesError) throw deletePagesError;

        const { error: deleteSectionsError } = await supabaseMobile
          .from(SECTIONS_TABLE)
          .delete()
          .eq("notebook_id", manageTarget.book.id)
          .eq("user_id", user.id);
        if (deleteSectionsError) throw deleteSectionsError;

        const { error: deleteBookError } = await supabaseMobile
          .from(BOOKS_TABLE)
          .delete()
          .eq("id", manageTarget.book.id)
          .eq("user_id", user.id);
        if (deleteBookError) throw deleteBookError;

        closeManage();
        navigation.goBack();
        return;
      }

      if (manageTarget.kind === "section") {
        const { error: releasePagesError } = await supabaseMobile
          .from(PAGES_TABLE)
          .update({ section_id: null, updated_at: new Date().toISOString() })
          .eq("section_id", manageTarget.section.id)
          .eq("user_id", user.id);
        if (releasePagesError) throw releasePagesError;

        const { error: deleteSectionError } = await supabaseMobile
          .from(SECTIONS_TABLE)
          .delete()
          .eq("id", manageTarget.section.id)
          .eq("user_id", user.id);
        if (deleteSectionError) throw deleteSectionError;

        closeManage();
        await loadWorkspace();
        return;
      }

      const { error: deletePageError } = await supabaseMobile
        .from(PAGES_TABLE)
        .delete()
        .eq("id", manageTarget.page.id)
        .eq("user_id", user.id);
      if (deletePageError) throw deletePageError;

      closeManage();
      await loadWorkspace();
    } catch (err: any) {
      setManageError(
        err?.message ??
          t(language, "We couldn't delete this item.", "No pudimos borrar este elemento.")
      );
    } finally {
      setManaging(false);
    }
  }

  function confirmDeleteTarget() {
    if (!manageTarget) return;
    const entityName =
      manageTarget.kind === "book"
        ? manageTarget.book.name
        : manageTarget.kind === "section"
          ? manageTarget.section.name
          : manageTarget.page.title;
    const message =
      manageTarget.kind === "book"
        ? t(
            language,
            "This deletes the notebook, all sections, and every page inside it.",
            "Esto borra el notebook, todas las secciones y cada página dentro."
          )
        : manageTarget.kind === "section"
          ? t(
              language,
              "This deletes the section and keeps its pages in the notebook without section.",
              "Esto borra la sección y deja sus páginas en el notebook sin sección."
            )
          : t(
              language,
              "This deletes the page permanently.",
              "Esto borra la página permanentemente."
            );

    Alert.alert(
      t(language, "Delete item", "Borrar elemento"),
      `${entityName}\n\n${message}`,
      [
        { text: t(language, "Cancel", "Cancelar"), style: "cancel" },
        {
          text: t(language, "Delete", "Borrar"),
          style: "destructive",
          onPress: () => {
            void executeDeleteTarget();
          },
        },
      ]
    );
  }

  async function handleRefresh() {
    await loadWorkspace({ isRefresh: true });
  }

  const pageCount = pages.length;
  const sectionCount = sections.length;

  return (
    <ScreenScaffold
      title={book?.name ?? title ?? t(language, "Notebook", "Notebook")}
      subtitle={t(
        language,
        "A focused workspace for one custom notebook. Organize sections, pages, and notes without mixing everything together.",
        "Un workspace enfocado para una sola libreta custom. Organiza secciones, páginas y notas sin mezclarlo todo."
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>
            {t(language, "Loading notebook…", "Cargando notebook…")}
          </Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : !book ? (
        <Text style={styles.errorText}>
          {t(language, "Notebook not found.", "No encontramos el notebook.")}
        </Text>
      ) : (
        <View style={styles.sectionList}>
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroIconWrap}>
                <Ionicons name="folder-open-outline" size={24} color={colors.primary} />
              </View>
              <Pressable
                style={styles.itemMenuButton}
                onPress={() => openManage({ kind: "book", book })}
              >
                <Text style={styles.itemMenuText}>•••</Text>
              </Pressable>
            </View>
            <Text style={styles.heroTitle}>{book.name}</Text>
            <Text style={styles.heroSubtitle}>
              {t(
                language,
                "Enter one notebook at a time, then work through sections and pages in a clean structure.",
                "Entra a una libreta a la vez y luego trabaja sus secciones y páginas en una estructura limpia."
              )}
            </Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatChip}>
                <Text style={styles.heroStatValue}>{sectionCount}</Text>
                <Text style={styles.heroStatLabel}>
                  {t(language, "sections", "secciones")}
                </Text>
              </View>
              <View style={styles.heroStatChip}>
                <Text style={styles.heroStatValue}>{pageCount}</Text>
                <Text style={styles.heroStatLabel}>
                  {t(language, "pages", "páginas")}
                </Text>
              </View>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [styles.primaryAction, pressed && styles.cardPressed]}
                onPress={() => openCreate("page")}
              >
                <Ionicons name="document-text-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.primaryActionText}>
                  {t(language, "New page", "Nueva página")}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.cardPressed]}
                onPress={() => openCreate("section")}
              >
                <Ionicons name="layers-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.secondaryActionText}>
                  {t(language, "New section", "Nueva sección")}
                </Text>
              </Pressable>
            </View>
          </View>

          {standalonePages.length > 0 ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={styles.sectionTitle}>
                    {t(language, "Pages without section", "Páginas sin sección")}
                  </Text>
                  <Text style={styles.sectionHint}>
                    {t(
                      language,
                      "Loose pages stay visible here until you move them into a section.",
                      "Las páginas sueltas se quedan visibles aquí hasta que las muevas a una sección."
                    )}
                  </Text>
                </View>
              </View>
              <View style={styles.pageList}>
                {standalonePages.map((page) => (
                  <Pressable
                    key={page.id}
                    style={({ pressed }) => [styles.pageRow, pressed && styles.cardPressed]}
                    onPress={() =>
                      navigation.navigate("NotebookEditor", {
                        kind: "page",
                        id: page.id,
                        title: page.title,
                      })
                    }
                  >
                    <View style={styles.pageIconWrap}>
                      <Ionicons name="document-text-outline" size={16} color={colors.primary} />
                    </View>
                    <View style={styles.pageCopy}>
                      <Text style={styles.pageTitle}>{page.title}</Text>
                      <Text style={styles.pageMeta}>
                        {formatDate(page.updated_at ?? page.created_at)}
                      </Text>
                      <Text style={styles.pagePreview} numberOfLines={2}>
                        {stripHtml(page.content) ||
                          t(
                            language,
                            "Empty page ready for notes.",
                            "Página vacía lista para notas."
                          )}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.itemMenuButton}
                      onPress={() => openManage({ kind: "page", page })}
                    >
                      <Text style={styles.itemMenuText}>•••</Text>
                    </Pressable>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {sectionGroups.length === 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {t(language, "No sections yet", "Aún no hay secciones")}
              </Text>
              <Text style={styles.sectionHint}>
                {t(
                  language,
                  "Create a section to group related pages inside this notebook.",
                  "Crea una sección para agrupar páginas relacionadas dentro de esta libreta."
                )}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.primaryAction, pressed && styles.cardPressed]}
                onPress={() => openCreate("section")}
              >
                <Ionicons name="layers-outline" size={16} color={colors.textPrimary} />
                <Text style={styles.primaryActionText}>
                  {t(language, "Create first section", "Crear primera sección")}
                </Text>
              </Pressable>
            </View>
          ) : (
            sectionGroups.map(({ section, pages: sectionPages }) => (
              <View key={section.id} style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionTitleWrap}>
                    <View style={styles.sectionIconBubble}>
                      <Ionicons name="albums-outline" size={16} color={colors.primary} />
                    </View>
                    <View style={styles.sectionCopy}>
                      <Text style={styles.sectionTitle}>{section.name}</Text>
                      <Text style={styles.sectionMeta}>
                        {sectionPages.length} {t(language, "pages", "páginas")}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.sectionActions}>
                    <Pressable
                      style={styles.headerPill}
                      onPress={() => openCreate("page", section.id)}
                    >
                      <Text style={styles.headerPillText}>
                        {t(language, "New page", "Nueva página")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.itemMenuButton}
                      onPress={() => openManage({ kind: "section", section })}
                    >
                      <Text style={styles.itemMenuText}>•••</Text>
                    </Pressable>
                  </View>
                </View>

                {sectionPages.length === 0 ? (
                  <Text style={styles.emptyText}>
                    {t(
                      language,
                      "No pages in this section yet.",
                      "Aún no hay páginas en esta sección."
                    )}
                  </Text>
                ) : (
                  <View style={styles.pageList}>
                    {sectionPages.map((page) => (
                      <Pressable
                        key={page.id}
                        style={({ pressed }) => [styles.pageRow, pressed && styles.cardPressed]}
                        onPress={() =>
                          navigation.navigate("NotebookEditor", {
                            kind: "page",
                            id: page.id,
                            title: page.title,
                          })
                        }
                      >
                        <View style={styles.pageIconWrap}>
                          <Ionicons
                            name="document-text-outline"
                            size={16}
                            color={colors.primary}
                          />
                        </View>
                        <View style={styles.pageCopy}>
                          <Text style={styles.pageTitle}>{page.title}</Text>
                          <Text style={styles.pageMeta}>
                            {formatDate(page.updated_at ?? page.created_at)}
                          </Text>
                          <Text style={styles.pagePreview} numberOfLines={2}>
                            {stripHtml(page.content) ||
                              t(
                                language,
                                "Empty page ready for notes.",
                                "Página vacía lista para notas."
                              )}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.itemMenuButton}
                          onPress={() => openManage({ kind: "page", page })}
                        >
                          <Text style={styles.itemMenuText}>•••</Text>
                        </Pressable>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      )}

      <Modal visible={!!createMode} transparent animationType="slide" onRequestClose={closeCreate}>
        <TouchableWithoutFeedback onPress={closeCreate}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>
                  {createMode === "section"
                    ? t(language, "New section", "Nueva sección")
                    : t(language, "New page", "Nueva página")}
                </Text>
                {createError ? <Text style={styles.modalError}>{createError}</Text> : null}

                {createMode === "page" ? (
                  <View style={styles.selectorBlock}>
                    <Text style={styles.selectorLabel}>
                      {t(language, "Section (optional)", "Sección (opcional)")}
                    </Text>
                    <View style={styles.selectorRow}>
                      <Pressable
                        style={[
                          styles.selectorChip,
                          !createSectionId && styles.selectorChipActive,
                        ]}
                        onPress={() => setCreateSectionId(null)}
                      >
                        <Text
                          style={[
                            styles.selectorChipText,
                            !createSectionId && styles.selectorChipTextActive,
                          ]}
                        >
                          {t(language, "No section", "Sin sección")}
                        </Text>
                      </Pressable>
                      {sections.map((section) => {
                        const active = section.id === createSectionId;
                        return (
                          <Pressable
                            key={section.id}
                            style={[
                              styles.selectorChip,
                              active && styles.selectorChipActive,
                            ]}
                            onPress={() => setCreateSectionId(section.id)}
                          >
                            <Text
                              style={[
                                styles.selectorChipText,
                                active && styles.selectorChipTextActive,
                              ]}
                            >
                              {section.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                <TextInput
                  placeholder={
                    createMode === "section"
                      ? t(language, "Section name", "Nombre de la sección")
                      : t(language, "Page title", "Título de página")
                  }
                  placeholderTextColor={colors.textMuted}
                  value={createValue}
                  onChangeText={setCreateValue}
                  style={styles.input}
                />
                <Pressable
                  style={[styles.primaryButton, creating && styles.primaryButtonDisabled]}
                  onPress={handleCreate}
                  disabled={creating}
                >
                  <Text style={styles.primaryButtonText}>
                    {creating
                      ? t(language, "Creating…", "Creando…")
                      : t(language, "Create", "Crear")}
                  </Text>
                </Pressable>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal visible={!!manageTarget} transparent animationType="slide" onRequestClose={closeManage}>
        <TouchableWithoutFeedback onPress={closeManage}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>
                  {manageTarget?.kind === "book"
                    ? t(language, "Manage notebook", "Gestionar notebook")
                    : manageTarget?.kind === "section"
                      ? t(language, "Manage section", "Gestionar sección")
                      : t(language, "Manage page", "Gestionar página")}
                </Text>
                {manageError ? <Text style={styles.modalError}>{manageError}</Text> : null}

                <View style={styles.selectorBlock}>
                  <Text style={styles.selectorLabel}>
                    {manageTarget?.kind === "page"
                      ? t(language, "Page title", "Título de página")
                      : t(language, "Name", "Nombre")}
                  </Text>
                  <TextInput
                    placeholder={
                      manageTarget?.kind === "page"
                        ? t(language, "Page title", "Título de página")
                        : t(language, "Name", "Nombre")
                    }
                    placeholderTextColor={colors.textMuted}
                    value={manageName}
                    onChangeText={setManageName}
                    style={styles.input}
                  />
                </View>

                {manageTarget?.kind === "page" ? (
                  <View style={styles.selectorBlock}>
                    <Text style={styles.selectorLabel}>
                      {t(language, "Section", "Sección")}
                    </Text>
                    <View style={styles.selectorRow}>
                      <Pressable
                        style={[
                          styles.selectorChip,
                          !manageSectionId && styles.selectorChipActive,
                        ]}
                        onPress={() => setManageSectionId(null)}
                      >
                        <Text
                          style={[
                            styles.selectorChipText,
                            !manageSectionId && styles.selectorChipTextActive,
                          ]}
                        >
                          {t(language, "No section", "Sin sección")}
                        </Text>
                      </Pressable>
                      {sections.map((section) => {
                        const active = section.id === manageSectionId;
                        return (
                          <Pressable
                            key={section.id}
                            style={[
                              styles.selectorChip,
                              active && styles.selectorChipActive,
                            ]}
                            onPress={() => setManageSectionId(section.id)}
                          >
                            <Text
                              style={[
                                styles.selectorChipText,
                                active && styles.selectorChipTextActive,
                              ]}
                            >
                              {section.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {manageTarget?.kind === "section" ? (
                  <Text style={styles.actionHint}>
                    {t(
                      language,
                      "Deleting a section keeps its pages in this notebook as unsectioned pages.",
                      "Borrar una sección mantiene sus páginas en esta libreta como páginas sin sección."
                    )}
                  </Text>
                ) : null}

                <View style={styles.manageActionRow}>
                  <Pressable
                    style={[
                      styles.primaryButton,
                      styles.managePrimaryButton,
                      managing && styles.primaryButtonDisabled,
                    ]}
                    onPress={handleManageSave}
                    disabled={managing}
                  >
                    <Text style={styles.primaryButtonText}>
                      {managing
                        ? t(language, "Saving…", "Guardando…")
                        : t(language, "Save changes", "Guardar cambios")}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.secondaryButton}
                    onPress={confirmDeleteTarget}
                    disabled={managing}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {t(language, "Delete", "Borrar")}
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
      gap: 10,
      paddingVertical: 10,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    errorText: {
      color: colors.danger,
      fontSize: 12,
    },
    sectionList: {
      gap: 14,
    },
    heroCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.card,
      padding: 16,
      gap: 14,
    },
    heroTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    heroIconWrap: {
      width: 54,
      height: 54,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.successSoft,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    heroTitle: {
      color: colors.textPrimary,
      fontSize: 22,
      fontWeight: "800",
    },
    heroSubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    heroStatsRow: {
      flexDirection: "row",
      gap: 10,
    },
    heroStatChip: {
      flex: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 2,
    },
    heroStatValue: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "800",
    },
    heroStatLabel: {
      color: colors.textMuted,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
    },
    primaryAction: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
    },
    primaryActionText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "800",
    },
    secondaryAction: {
      flex: 1,
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 12,
    },
    secondaryActionText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    sectionCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 12,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    sectionTitleWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },
    sectionIconBubble: {
      width: 38,
      height: 38,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionCopy: {
      flex: 1,
      gap: 2,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontWeight: "800",
      fontSize: 15,
    },
    sectionMeta: {
      color: colors.textMuted,
      fontSize: 11,
    },
    sectionHint: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
    },
    sectionActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    pageList: {
      gap: 10,
    },
    pageRow: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 8,
      flexDirection: "row",
      alignItems: "flex-start",
    },
    pageIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    pageCopy: {
      flex: 1,
      gap: 2,
    },
    pageTitle: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    pageMeta: {
      color: colors.textMuted,
      fontSize: 11,
    },
    pagePreview: {
      color: colors.textPrimary,
      fontSize: 11,
      lineHeight: 16,
    },
    itemMenuButton: {
      minWidth: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    itemMenuText: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
      letterSpacing: 1,
    },
    headerPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    headerPillText: {
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: "700",
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    cardPressed: {
      opacity: 0.82,
      transform: [{ scale: 0.99 }],
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: "flex-end",
    },
    modalCard: {
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
    modalHandle: {
      width: 44,
      height: 5,
      borderRadius: 999,
      backgroundColor: colors.border,
      alignSelf: "center",
    },
    modalTitle: {
      textAlign: "center",
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "700",
    },
    modalError: {
      color: colors.danger,
      fontSize: 12,
      textAlign: "center",
    },
    selectorBlock: {
      gap: 8,
    },
    selectorLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    selectorRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    selectorChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    selectorChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
    },
    selectorChipText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "600",
    },
    selectorChipTextActive: {
      color: colors.textPrimary,
    },
    input: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontSize: 13,
    },
    primaryButton: {
      borderRadius: 12,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      alignItems: "center",
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 13,
    },
    manageActionRow: {
      flexDirection: "row",
      gap: 10,
    },
    managePrimaryButton: {
      flex: 1,
    },
    secondaryButton: {
      minWidth: 110,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    secondaryButtonText: {
      color: colors.danger,
      fontWeight: "700",
      fontSize: 13,
    },
    actionHint: {
      color: colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
    },
  });
