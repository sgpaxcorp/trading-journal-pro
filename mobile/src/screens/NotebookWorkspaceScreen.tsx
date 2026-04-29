import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { PlanGate } from "../components/PlanGate";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { usePlanAccess } from "../lib/usePlanAccess";
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
  const planAccess = usePlanAccess();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { notebookId, title } = (route.params ?? {}) as RouteParams;

  const [book, setBook] = useState<NotebookBook | null>(null);
  const [sections, setSections] = useState<NotebookSection[]>([]);
  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inlineSectionOpen, setInlineSectionOpen] = useState(false);
  const [inlineSectionValue, setInlineSectionValue] = useState("");
  const [sectionBusy, setSectionBusy] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [inlinePageOpen, setInlinePageOpen] = useState(false);
  const [inlinePageValue, setInlinePageValue] = useState("");
  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [manageTarget, setManageTarget] = useState<ManageTarget | null>(null);
  const [manageName, setManageName] = useState("");
  const [manageSectionId, setManageSectionId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const loadWorkspace = useCallback(
    async (options?: { showLoading?: boolean; isRefresh?: boolean }) => {
      if (!planAccess.isAdvanced) return;
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

        if (accountId) bookQuery = bookQuery.eq("account_id", accountId);

        const { data: bookRow, error: bookErr } = await bookQuery.maybeSingle();
        if (bookErr) throw bookErr;
        if (!bookRow) {
          throw new Error(
            t(language, "We couldn't find this notebook.", "No pudimos encontrar este notebook.")
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
              "We couldn't load this notebook.",
              "No pudimos cargar este notebook."
            )
        );
      } finally {
        if (showLoading) setLoading(false);
        if (isRefresh) setRefreshing(false);
      }
    },
    [language, notebookId, planAccess.isAdvanced, user?.id]
  );

  useFocusEffect(
    useCallback(() => {
      if (!planAccess.isAdvanced) return;
      void loadWorkspace({ showLoading: true });
    }, [loadWorkspace, planAccess.isAdvanced])
  );

  useEffect(() => {
    if (selectedSectionId && sections.some((section) => section.id === selectedSectionId)) return;
    if (sections.length > 0) {
      setSelectedSectionId(sections[0].id);
    } else {
      setSelectedSectionId(null);
    }
  }, [sections, selectedSectionId]);

  const loosePages = useMemo(() => pages.filter((page) => !page.section_id), [pages]);
  const selectedSection = useMemo(
    () => sections.find((section) => section.id === selectedSectionId) ?? null,
    [sections, selectedSectionId]
  );
  const visiblePages = useMemo(
    () => pages.filter((page) => page.section_id === selectedSectionId),
    [pages, selectedSectionId]
  );

  if (!planAccess.isAdvanced) {
    return (
      <PlanGate
        title={t(language, "Notebook", "Notebook")}
        badge="Advanced"
        loading={planAccess.loading}
        subtitle={t(
          language,
          "Notebook workspaces, sections, pages, and ink editing are included in Advanced.",
          "Los workspaces, secciones, páginas e ink editing de Notebook están incluidos en Advanced."
        )}
      />
    );
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

  async function handleRefresh() {
    await loadWorkspace({ isRefresh: true });
  }

  async function handleInlineSectionCreate() {
    if (!supabaseMobile || !user?.id || !book) return;
    const trimmed = inlineSectionValue.trim();
    if (!trimmed) {
      setSectionError(t(language, "Name is required.", "El nombre es requerido."));
      return;
    }

    setSectionBusy(true);
    setSectionError(null);
    try {
      const { data, error: sectionError } = await supabaseMobile
        .from(SECTIONS_TABLE)
        .insert({
          user_id: user.id,
          notebook_id: book.id,
          name: trimmed,
        })
        .select("id")
        .single();
      if (sectionError) throw sectionError;

      setInlineSectionOpen(false);
      setInlineSectionValue("");
      await loadWorkspace();
      if (data?.id) setSelectedSectionId(data.id as string);
    } catch (err: any) {
      setSectionError(
        err?.message ??
          t(language, "We couldn't create this section.", "No pudimos crear esta sección.")
      );
    } finally {
      setSectionBusy(false);
    }
  }

  async function handleInlinePageCreate() {
    if (!supabaseMobile || !user?.id || !book) return;
    const trimmed = inlinePageValue.trim();
    if (!trimmed) {
      setPageError(t(language, "Name is required.", "El nombre es requerido."));
      return;
    }

    setPageBusy(true);
    setPageError(null);
    try {
      const { error: pageInsertError } = await supabaseMobile.from(PAGES_TABLE).insert({
        user_id: user.id,
        notebook_id: book.id,
        section_id: selectedSectionId,
        title: trimmed,
        content: "",
      });
      if (pageInsertError) throw pageInsertError;

      setInlinePageOpen(false);
      setInlinePageValue("");
      await loadWorkspace();
    } catch (err: any) {
      setPageError(
        err?.message ??
          t(language, "We couldn't create this page.", "No pudimos crear esta página.")
      );
    } finally {
      setPageBusy(false);
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
          .update({ name: trimmed, updated_at: new Date().toISOString() })
          .eq("id", manageTarget.book.id)
          .eq("user_id", user.id);
        if (bookError) throw bookError;
      } else if (manageTarget.kind === "section") {
        const { error: sectionError } = await supabaseMobile
          .from(SECTIONS_TABLE)
          .update({ name: trimmed, updated_at: new Date().toISOString() })
          .eq("id", manageTarget.section.id)
          .eq("user_id", user.id);
        if (sectionError) throw sectionError;
      } else {
        const { error: pageError } = await supabaseMobile
          .from(PAGES_TABLE)
          .update({
            title: trimmed,
            section_id: manageSectionId,
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
            "This deletes the section and keeps its pages as loose pages.",
            "Esto borra la sección y deja sus páginas como páginas sueltas."
          )
        : t(language, "This deletes the page permanently.", "Esto borra la página permanentemente.");

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

  return (
    <ScreenScaffold
      title={book?.name ?? title ?? t(language, "Notebook", "Notebook")}
      subtitle={t(
        language,
        "Sections first. Pages second. Everything stays clean and visual.",
        "Primero secciones. Luego páginas. Todo se mantiene limpio y visual."
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
      showBrand={false}
      compactHeader
      contentPadding={12}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>{t(language, "Loading notebook…", "Cargando notebook…")}</Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : !book ? (
        <Text style={styles.errorText}>{t(language, "Notebook not found.", "No encontramos el notebook.")}</Text>
      ) : (
        <View style={styles.sectionList}>
          <View style={styles.topRow}>
            <Text style={styles.topHint}>
              {t(
                language,
                "Pick a section, then open or create pages inside it.",
                "Elige una sección y luego abre o crea páginas dentro."
              )}
            </Text>
            <Pressable style={styles.headerPill} onPress={() => openManage({ kind: "book", book })}>
              <Text style={styles.headerPillText}>{t(language, "Manage notebook", "Gestionar notebook")}</Text>
            </Pressable>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{t(language, "Sections", "Secciones")}</Text>
            <View style={styles.iconGrid}>
              <Pressable
                style={({ pressed }) => [
                  styles.libraryTile,
                  !selectedSectionId && styles.libraryTileActive,
                  pressed && styles.cardPressed,
                ]}
                onPress={() => setSelectedSectionId(null)}
              >
                <View style={styles.libraryTileTop}>
                  <View style={styles.libraryIconBubble}>
                    <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
                  </View>
                </View>
                <Text style={styles.libraryTileTitle}>{t(language, "Loose Pages", "Páginas sueltas")}</Text>
                <Text style={styles.libraryTileMeta}>
                  {t(language, "Pages outside sections", "Páginas fuera de secciones")}
                </Text>
                <Text style={styles.libraryTilePreview} numberOfLines={2}>
                  {loosePages.length > 0
                    ? t(language, "Open the loose page lane.", "Abre el carril de páginas sueltas.")
                    : t(language, "Use this lane for pages without section.", "Usa este carril para páginas sin sección.")}
                </Text>
              </Pressable>

              {sections.map((section) => (
                <Pressable
                  key={section.id}
                  style={({ pressed }) => [
                    styles.libraryTile,
                    selectedSectionId === section.id && styles.libraryTileActive,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => setSelectedSectionId(section.id)}
                  onLongPress={() => openManage({ kind: "section", section })}
                >
                  <View style={styles.libraryTileTop}>
                    <View style={styles.libraryIconBubble}>
                      <Ionicons name="albums-outline" size={20} color={colors.primary} />
                    </View>
                  </View>
                  <Text style={styles.libraryTileTitle}>{section.name}</Text>
                  <Text style={styles.libraryTileMeta}>
                    {t(language, "Tap to view pages", "Toca para ver páginas")}
                  </Text>
                  <Text style={styles.libraryTilePreview} numberOfLines={2}>
                    {t(
                      language,
                      "Long press to rename or delete.",
                      "Mantén presionado para renombrar o borrar."
                    )}
                  </Text>
                </Pressable>
              ))}

              {inlineSectionOpen ? (
                <View style={styles.draftTile}>
                  <View style={styles.libraryTileTop}>
                    <View style={styles.libraryIconBubble}>
                      <Ionicons name="layers-outline" size={18} color={colors.primary} />
                    </View>
                  </View>
                  <TextInput
                    value={inlineSectionValue}
                    onChangeText={setInlineSectionValue}
                    placeholder={t(language, "Section name", "Nombre de la sección")}
                    placeholderTextColor={colors.textMuted}
                    style={styles.draftInput}
                    autoFocus
                    onSubmitEditing={() => {
                      void handleInlineSectionCreate();
                    }}
                  />
                  {sectionError ? <Text style={styles.inlineError}>{sectionError}</Text> : null}
                  <View style={styles.draftActions}>
                    <Pressable
                      style={[styles.smallPrimaryButton, sectionBusy && styles.primaryButtonDisabled]}
                      onPress={() => {
                        void handleInlineSectionCreate();
                      }}
                      disabled={sectionBusy}
                    >
                      <Text style={styles.smallPrimaryButtonText}>
                        {sectionBusy ? t(language, "Saving…", "Guardando…") : t(language, "Save", "Guardar")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallSecondaryButton}
                      onPress={() => {
                        if (sectionBusy) return;
                        setInlineSectionOpen(false);
                        setInlineSectionValue("");
                        setSectionError(null);
                      }}
                    >
                      <Text style={styles.smallSecondaryButtonText}>{t(language, "Cancel", "Cancelar")}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.createTile, pressed && styles.cardPressed]}
                  onPress={() => {
                    setInlineSectionOpen(true);
                    setInlineSectionValue("");
                    setSectionError(null);
                  }}
                >
                  <View style={styles.createTileBubble}>
                    <Ionicons name="add-outline" size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.createTileTitle}>{t(language, "New section", "Nueva sección")}</Text>
                  <Text style={styles.createTileCaption}>{t(language, "Create it here", "Créala aquí")}</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              {selectedSection ? selectedSection.name : t(language, "Loose Pages", "Páginas sueltas")}
            </Text>
            <Text style={styles.sectionHint}>
              {selectedSection
                ? t(
                    language,
                    "Open or create pages inside this section.",
                    "Abre o crea páginas dentro de esta sección."
                  )
                : t(
                    language,
                    "Open or create pages that live outside sections.",
                    "Abre o crea páginas que viven fuera de secciones."
                  )}
            </Text>
            <View style={styles.iconGrid}>
              {visiblePages.map((page) => (
                <Pressable
                  key={page.id}
                  style={({ pressed }) => [styles.libraryTile, pressed && styles.cardPressed]}
                  onPress={() =>
                    navigation.navigate("NotebookEditor", {
                      kind: "page",
                      id: page.id,
                      title: page.title,
                    })
                  }
                  onLongPress={() => openManage({ kind: "page", page })}
                >
                  <View style={styles.libraryTileTop}>
                    <View style={styles.libraryIconBubble}>
                      <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                    </View>
                  </View>
                  <Text style={styles.libraryTileTitle} numberOfLines={2}>
                    {page.title}
                  </Text>
                  <Text style={styles.libraryTileMeta}>
                    {formatDate(page.updated_at ?? page.created_at)}
                  </Text>
                  <Text style={styles.libraryTilePreview} numberOfLines={2}>
                    {stripHtml(page.content) ||
                      t(language, "Empty page ready for notes.", "Página vacía lista para notas.")}
                  </Text>
                </Pressable>
              ))}

              {inlinePageOpen ? (
                <View style={styles.draftTile}>
                  <View style={styles.libraryTileTop}>
                    <View style={styles.libraryIconBubble}>
                      <Ionicons name="document-outline" size={18} color={colors.primary} />
                    </View>
                  </View>
                  <TextInput
                    value={inlinePageValue}
                    onChangeText={setInlinePageValue}
                    placeholder={t(language, "Page title", "Título de la página")}
                    placeholderTextColor={colors.textMuted}
                    style={styles.draftInput}
                    autoFocus
                    onSubmitEditing={() => {
                      void handleInlinePageCreate();
                    }}
                  />
                  {pageError ? <Text style={styles.inlineError}>{pageError}</Text> : null}
                  <View style={styles.draftActions}>
                    <Pressable
                      style={[styles.smallPrimaryButton, pageBusy && styles.primaryButtonDisabled]}
                      onPress={() => {
                        void handleInlinePageCreate();
                      }}
                      disabled={pageBusy}
                    >
                      <Text style={styles.smallPrimaryButtonText}>
                        {pageBusy ? t(language, "Saving…", "Guardando…") : t(language, "Save", "Guardar")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallSecondaryButton}
                      onPress={() => {
                        if (pageBusy) return;
                        setInlinePageOpen(false);
                        setInlinePageValue("");
                        setPageError(null);
                      }}
                    >
                      <Text style={styles.smallSecondaryButtonText}>{t(language, "Cancel", "Cancelar")}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.createTile, pressed && styles.cardPressed]}
                  onPress={() => {
                    setInlinePageOpen(true);
                    setInlinePageValue("");
                    setPageError(null);
                  }}
                >
                  <View style={styles.createTileBubble}>
                    <Ionicons name="add-outline" size={24} color={colors.primary} />
                  </View>
                  <Text style={styles.createTileTitle}>{t(language, "New page", "Nueva página")}</Text>
                  <Text style={styles.createTileCaption}>{t(language, "Create it here", "Créala aquí")}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      )}

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

                <TextInput
                  value={manageName}
                  onChangeText={setManageName}
                  placeholder={t(language, "Name", "Nombre")}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  autoFocus
                />

                {manageTarget?.kind === "page" ? (
                  <View style={styles.selectorBlock}>
                    <Text style={styles.selectorLabel}>{t(language, "Section", "Sección")}</Text>
                    <View style={styles.selectorRow}>
                      <Pressable
                        style={[styles.selectorChip, manageSectionId === null && styles.selectorChipActive]}
                        onPress={() => setManageSectionId(null)}
                      >
                        <Text style={[styles.selectorChipText, manageSectionId === null && styles.selectorChipTextActive]}>
                          {t(language, "Loose pages", "Páginas sueltas")}
                        </Text>
                      </Pressable>
                      {sections.map((section) => {
                        const active = section.id === manageSectionId;
                        return (
                          <Pressable
                            key={section.id}
                            style={[styles.selectorChip, active && styles.selectorChipActive]}
                            onPress={() => setManageSectionId(section.id)}
                          >
                            <Text style={[styles.selectorChipText, active && styles.selectorChipTextActive]}>
                              {section.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                <View style={styles.manageActionRow}>
                  <Pressable
                    style={[styles.primaryButton, styles.managePrimaryButton, managing && styles.primaryButtonDisabled]}
                    onPress={() => {
                      void handleManageSave();
                    }}
                    disabled={managing}
                  >
                    <Text style={styles.primaryButtonText}>
                      {managing ? t(language, "Saving…", "Guardando…") : t(language, "Save changes", "Guardar cambios")}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={confirmDeleteTarget} disabled={managing}>
                    <Text style={styles.secondaryButtonText}>{t(language, "Delete", "Borrar")}</Text>
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
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    topHint: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
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
    sectionCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 12,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "800",
    },
    sectionHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    iconGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    libraryTile: {
      width: "48%",
      minHeight: 146,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 8,
    },
    libraryTileActive: {
      borderColor: colors.primary,
      backgroundColor: colors.card,
      shadowColor: colors.primary,
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    libraryTileTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    libraryIconBubble: {
      width: 42,
      height: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      alignItems: "center",
      justifyContent: "center",
    },
    libraryTileTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "800",
    },
    libraryTileMeta: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
    },
    libraryTilePreview: {
      color: colors.textPrimary,
      fontSize: 11,
      lineHeight: 16,
    },
    createTile: {
      width: "48%",
      minHeight: 146,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.primary,
      borderStyle: "dashed",
      backgroundColor: colors.successSoft,
      padding: 12,
      gap: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    createTileBubble: {
      width: 46,
      height: 46,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    createTileTitle: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "800",
      textAlign: "center",
    },
    createTileCaption: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textAlign: "center",
    },
    draftTile: {
      width: "48%",
      minHeight: 146,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 10,
    },
    draftInput: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    draftActions: {
      flexDirection: "row",
      gap: 8,
    },
    inlineError: {
      color: colors.danger,
      fontSize: 11,
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
    smallPrimaryButton: {
      flex: 1,
      borderRadius: 10,
      backgroundColor: colors.primary,
      paddingVertical: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    smallPrimaryButtonText: {
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: "800",
    },
    smallSecondaryButton: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      paddingVertical: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    smallSecondaryButtonText: {
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: "700",
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
  });
