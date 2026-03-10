import { useEffect, useMemo, useState } from "react";
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
import { useNavigation } from "@react-navigation/native";

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
const FREE_NOTES_TABLE = "ntj_notebook_free_notes";

type NotebookBook = {
  id: string;
  name: string;
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

type FreeNote = {
  entry_date: string;
  content: string;
  updated_at: string | null;
};

type AccountsResponse = {
  activeAccountId: string | null;
};

type ManageTarget =
  | { kind: "book"; book: NotebookBook }
  | { kind: "section"; section: NotebookSection }
  | { kind: "page"; page: NotebookPage };

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

function toYmd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function fetchActiveAccountId(): Promise<string | null> {
  try {
    const res = await apiGet<AccountsResponse>("/api/trading-accounts/list");
    return res.activeAccountId ?? null;
  } catch {
    return null;
  }
}

export function NotebookScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const user = useSupabaseUser();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();

  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [books, setBooks] = useState<NotebookBook[]>([]);
  const [sections, setSections] = useState<NotebookSection[]>([]);
  const [freeNotes, setFreeNotes] = useState<FreeNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<"book" | "section" | "page" | null>(null);
  const [createName, setCreateName] = useState("");
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [manageTarget, setManageTarget] = useState<ManageTarget | null>(null);
  const [manageName, setManageName] = useState("");
  const [manageBookId, setManageBookId] = useState<string | null>(null);
  const [manageSectionId, setManageSectionId] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  async function reloadNotebookData(options?: { showLoading?: boolean }) {
    if (!supabaseMobile || !user?.id) return;

    const showLoading = options?.showLoading ?? false;
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const accountId = await fetchActiveAccountId();

      let bookQuery = supabaseMobile
        .from(BOOKS_TABLE)
        .select("id, name, account_id")
        .eq("user_id", user.id);

      if (accountId) bookQuery = bookQuery.eq("account_id", accountId);

      const { data: bookRows, error: bookErr } = await bookQuery.order("created_at", {
        ascending: true,
      });

      const safeBooks = Array.isArray(bookRows) ? (bookRows as any[]) : [];
      const bookIds = safeBooks.map((b) => b.id);

      let sectionRows: NotebookSection[] = [];
      let pageRows: NotebookPage[] = [];

      if (bookIds.length > 0) {
        const { data: secData } = await supabaseMobile
          .from(SECTIONS_TABLE)
          .select("id, name, notebook_id")
          .in("notebook_id", bookIds)
          .order("created_at", { ascending: true });

        const { data: pageData } = await supabaseMobile
          .from(PAGES_TABLE)
          .select("id, notebook_id, section_id, title, content, created_at, updated_at")
          .in("notebook_id", bookIds)
          .order("updated_at", { ascending: false });

        sectionRows = Array.isArray(secData) ? (secData as NotebookSection[]) : [];
        pageRows = Array.isArray(pageData) ? (pageData as NotebookPage[]) : [];
      }

      let freeQuery = supabaseMobile
        .from(FREE_NOTES_TABLE)
        .select("entry_date, content, updated_at, account_id")
        .eq("user_id", user.id);

      if (accountId) freeQuery = freeQuery.eq("account_id", accountId);
      else freeQuery = freeQuery.is("account_id", null);

      const { data: freeRows } = await freeQuery.order("entry_date", {
        ascending: false,
      });

      if (bookErr) {
        console.error("[NotebookScreen] book error:", bookErr);
        setError(
          t(
            language,
            "We couldn't load notebook data.",
            "No pudimos cargar el notebook."
          )
        );
      }

      setBooks(safeBooks.map((b) => ({ id: b.id, name: b.name })));
      setSections(sectionRows);
      setPages(pageRows);
      setFreeNotes(Array.isArray(freeRows) ? (freeRows as FreeNote[]) : []);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    if (!supabaseMobile || !user?.id) return;

    let cancelled = false;

    async function loadNotebook(isRefresh = false) {
      await reloadNotebookData({ showLoading: !isRefresh });
      if (cancelled) return;
    }

    void loadNotebook();

    return () => {
      cancelled = true;
    };
  }, [language, user?.id]);

  async function handleRefresh() {
    if (!supabaseMobile || !user?.id) return;
    setRefreshing(true);
    try {
      await reloadNotebookData();
    } finally {
      setRefreshing(false);
    }
  }

  const availableSections = useMemo(() => {
    if (!selectedBookId) return [];
    return sections.filter((section) => section.notebook_id === selectedBookId);
  }, [sections, selectedBookId]);

  const pagesBySectionId = useMemo(() => {
    const map = new Map<string, NotebookPage[]>();
    pages.forEach((page) => {
      const key = page.section_id ?? "__unsectioned__";
      const next = map.get(key) ?? [];
      next.push(page);
      map.set(key, next);
    });
    return map;
  }, [pages]);

  const notebookWorkspace = useMemo(
    () =>
      books.map((book) => {
        const notebookSections = sections.filter((section) => section.notebook_id === book.id);
        const notebookPages = pages.filter((page) => page.notebook_id === book.id);
        const standalonePages = notebookPages.filter((page) => !page.section_id);
        return {
          book,
          sections: notebookSections.map((section) => ({
            section,
            pages: (pagesBySectionId.get(section.id) ?? []).filter(
              (page) => page.notebook_id === book.id
            ),
          })),
          standalonePages,
          totalPages: notebookPages.length,
        };
      }),
    [books, sections, pages, pagesBySectionId]
  );

  function openCreate(mode: "book" | "section" | "page") {
    setCreateMode(mode);
    setCreateName("");
    setCreateError(null);
    setCreating(false);
    if (mode === "book") {
      setSelectedBookId(null);
      setSelectedSectionId(null);
      return;
    }
    if (!selectedBookId && books.length > 0) {
      setSelectedBookId(books[0].id);
    }
    if (mode === "section") {
      setSelectedSectionId(null);
    }
  }

  function closeCreate() {
    if (creating) return;
    setCreateMode(null);
    setCreateName("");
    setCreateError(null);
  }

  function openManage(target: ManageTarget) {
    setManageTarget(target);
    setManageError(null);
    setManaging(false);
    if (target.kind === "book") {
      setManageName(target.book.name);
      setManageBookId(target.book.id);
      setManageSectionId(null);
      return;
    }
    if (target.kind === "section") {
      setManageName(target.section.name);
      setManageBookId(target.section.notebook_id);
      setManageSectionId(target.section.id);
      return;
    }
    setManageName(target.page.title);
    setManageBookId(target.page.notebook_id);
    setManageSectionId(target.page.section_id);
  }

  function closeManage() {
    if (managing) return;
    setManageTarget(null);
    setManageError(null);
  }

  async function openDailyNote(entryDate = toYmd()) {
    if (!supabaseMobile || !user?.id) return;
    try {
      const accountId = await fetchActiveAccountId();
      const { error: upsertErr } = await supabaseMobile
        .from(FREE_NOTES_TABLE)
        .upsert(
          {
            user_id: user.id,
            account_id: accountId ?? null,
            entry_date: entryDate,
            content: "",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,account_id,entry_date" }
        );
      if (upsertErr) throw upsertErr;
      await handleRefresh();
      navigation.navigate("NotebookEditor", {
        kind: "free",
        id: entryDate,
        title: `${t(language, "Daily note", "Nota diaria")} · ${entryDate}`,
      });
    } catch (err: any) {
      setError(
        err?.message ??
          t(language, "We couldn't open the daily note.", "No pudimos abrir la nota diaria.")
      );
    }
  }

  async function handleCreate() {
    if (!supabaseMobile || !user?.id || !createMode) return;
    const trimmed = createName.trim();
    const fallbackTitle = t(language, "Untitled page", "Página sin título");

    if (createMode === "book" && !trimmed) {
      setCreateError(t(language, "Name is required.", "El nombre es requerido."));
      return;
    }
    if (createMode === "section" && (!trimmed || !selectedBookId)) {
      setCreateError(
        selectedBookId
          ? t(language, "Name is required.", "El nombre es requerido.")
          : t(language, "Select a notebook first.", "Selecciona un notebook primero.")
      );
      return;
    }
    if (createMode === "page" && !selectedBookId) {
      setCreateError(t(language, "Select a notebook first.", "Selecciona un notebook primero."));
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const accountId = await fetchActiveAccountId();
      if (createMode === "book") {
        const { error: insertErr } = await supabaseMobile
          .from(BOOKS_TABLE)
          .insert({
            user_id: user.id,
            account_id: accountId ?? null,
            name: trimmed,
          });
        if (insertErr) throw insertErr;
      } else if (createMode === "section") {
        const { error: insertErr } = await supabaseMobile
          .from(SECTIONS_TABLE)
          .insert({
            user_id: user.id,
            notebook_id: selectedBookId,
            name: trimmed,
          });
        if (insertErr) throw insertErr;
      } else if (createMode === "page") {
        const title = trimmed || fallbackTitle;
        const { data, error: insertErr } = await supabaseMobile
          .from(PAGES_TABLE)
          .insert({
            user_id: user.id,
            notebook_id: selectedBookId,
            section_id: selectedSectionId ?? null,
            title,
            content: "",
            account_id: accountId ?? null,
          })
          .select("id, title")
          .single();
        if (insertErr) throw insertErr;
        if (data?.id) {
          closeCreate();
          await reloadNotebookData();
          navigation.navigate("NotebookEditor", {
            kind: "page",
            id: data.id,
            title: data.title ?? title,
          });
          return;
        }
      }

      closeCreate();
      await reloadNotebookData();
    } catch (err: any) {
      setCreateError(
        err?.message ??
          t(language, "We couldn't create the notebook item.", "No pudimos crear el notebook.")
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameOrMove() {
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
        const { error } = await supabaseMobile
          .from(BOOKS_TABLE)
          .update({ name: trimmed })
          .eq("id", manageTarget.book.id)
          .eq("user_id", user.id);
        if (error) throw error;
      } else if (manageTarget.kind === "section") {
        if (!manageBookId) {
          throw new Error(t(language, "Select a notebook first.", "Selecciona un notebook primero."));
        }
        const fromBookId = manageTarget.section.notebook_id;
        const sectionId = manageTarget.section.id;
        const { error: sectionError } = await supabaseMobile
          .from(SECTIONS_TABLE)
          .update({ name: trimmed, notebook_id: manageBookId })
          .eq("id", sectionId)
          .eq("user_id", user.id);
        if (sectionError) throw sectionError;

        if (fromBookId !== manageBookId) {
          const { error: pageMoveError } = await supabaseMobile
            .from(PAGES_TABLE)
            .update({ notebook_id: manageBookId })
            .eq("section_id", sectionId)
            .eq("user_id", user.id);
          if (pageMoveError) throw pageMoveError;
        }
      } else {
        if (!manageBookId) {
          throw new Error(t(language, "Select a notebook first.", "Selecciona un notebook primero."));
        }
        const targetSection =
          manageSectionId && sections.some((section) => section.id === manageSectionId && section.notebook_id === manageBookId)
            ? manageSectionId
            : null;
        const { error } = await supabaseMobile
          .from(PAGES_TABLE)
          .update({
            title: trimmed,
            notebook_id: manageBookId,
            section_id: targetSection,
            updated_at: new Date().toISOString(),
          })
          .eq("id", manageTarget.page.id)
          .eq("user_id", user.id);
        if (error) throw error;
      }

      await reloadNotebookData();
      closeManage();
    } catch (err: any) {
      setManageError(
        err?.message ??
          t(language, "We couldn't update this item.", "No pudimos actualizar este elemento.")
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
      } else if (manageTarget.kind === "section") {
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
      } else {
        const { error: deletePageError } = await supabaseMobile
          .from(PAGES_TABLE)
          .delete()
          .eq("id", manageTarget.page.id)
          .eq("user_id", user.id);
        if (deletePageError) throw deletePageError;
      }

      await reloadNotebookData();
      closeManage();
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
    const title =
      manageTarget.kind === "book"
        ? manageTarget.book.name
        : manageTarget.kind === "section"
        ? manageTarget.section.name
        : manageTarget.page.title;
    const message =
      manageTarget.kind === "book"
        ? t(
            language,
            "This deletes the notebook, its sections, and all pages.",
            "Esto borra el notebook, sus secciones y todas las páginas."
          )
        : manageTarget.kind === "section"
        ? t(
            language,
            "This deletes the section and keeps its pages as unsectioned.",
            "Esto borra la sección y deja sus páginas sin sección."
          )
        : t(language, "This deletes the page permanently.", "Esto borra la página permanentemente.");

    Alert.alert(
      t(language, "Delete item", "Borrar elemento"),
      `${title}\n\n${message}`,
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
      title={t(language, "Notebook", "Notebook")}
      subtitle={t(
        language,
        "Review and edit your notebook entries.",
        "Revisa y edita tus notas del notebook."
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
      ) : (
        <View style={styles.sectionList}>
          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>
              {t(language, "Create new", "Crear nuevo")}
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [styles.actionButton, pressed && styles.cardPressed]}
                onPress={() => openCreate("book")}
              >
                <Text style={styles.actionButtonText}>
                  {t(language, "Notebook", "Notebook")}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.actionButton, pressed && styles.cardPressed]}
                onPress={() => openCreate("section")}
              >
                <Text style={styles.actionButtonText}>
                  {t(language, "Section", "Sección")}
                </Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.actionButton, pressed && styles.cardPressed]}
                onPress={() => openCreate("page")}
              >
                <Text style={styles.actionButtonText}>
                  {t(language, "Page", "Página")}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.actionHint}>
              {t(
                language,
                "Create notebooks, sections, and pages directly here.",
                "Crea notebooks, secciones y páginas directamente aquí."
              )}
            </Text>
          </View>
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t(language, "Daily notebook", "Notebook diario")}
              </Text>
              <Pressable style={styles.headerPill} onPress={() => void openDailyNote()}>
                <Text style={styles.headerPillText}>
                  {t(language, "Open today", "Abrir hoy")}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>
              {t(
                language,
                "Open today's note or edit a previous day below.",
                "Abre la nota de hoy o edita un día anterior abajo."
              )}
            </Text>
            {freeNotes.length === 0 ? (
              <Text style={styles.emptyText}>
                {t(language, "No daily notes yet.", "Aún no hay notas diarias.")}
              </Text>
            ) : (
              freeNotes.slice(0, 6).map((note) => (
                <Pressable
                  key={note.entry_date}
                  style={({ pressed }) => [styles.noteCard, pressed && styles.cardPressed]}
                  onPress={() =>
                    navigation.navigate("NotebookEditor", {
                      kind: "free",
                      id: note.entry_date,
                      title: `${t(language, "Daily note", "Nota diaria")} · ${note.entry_date}`,
                    })
                  }
                >
                  <Text style={styles.noteDate}>{note.entry_date}</Text>
                  <Text style={styles.noteContent} numberOfLines={3}>
                    {stripHtml(note.content)}
                  </Text>
                </Pressable>
              ))
            )}
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t(language, "Notebook workspace", "Workspace del notebook")}
              </Text>
              <Text style={styles.sectionMeta}>
                {books.length} {t(language, "notebooks", "notebooks")}
              </Text>
            </View>
            <Text style={styles.sectionHint}>
              {t(
                language,
                "Browse notebooks, sections, and pages natively.",
                "Navega notebooks, secciones y páginas de forma nativa."
              )}
            </Text>
            {notebookWorkspace.length === 0 ? (
              <Text style={styles.emptyText}>
                {t(language, "No notebooks yet.", "Aún no hay notebooks.")}
              </Text>
            ) : (
              notebookWorkspace.map(({ book, sections: notebookSections, standalonePages, totalPages }) => (
                <View key={book.id} style={styles.workspaceCard}>
                  <View style={styles.workspaceHeader}>
                    <View>
                      <Text style={styles.workspaceTitle}>{book.name}</Text>
                      <Text style={styles.workspaceMeta}>
                        {totalPages} {t(language, "pages", "páginas")}
                        {" · "}
                        {notebookSections.length} {t(language, "sections", "secciones")}
                      </Text>
                    </View>
                    <View style={styles.workspaceHeaderActions}>
                      <Pressable
                        style={styles.headerPill}
                        onPress={() => {
                          setSelectedBookId(book.id);
                          openCreate("page");
                        }}
                      >
                        <Text style={styles.headerPillText}>
                          {t(language, "New page", "Nueva página")}
                        </Text>
                      </Pressable>
                      <Pressable style={styles.itemMenuButton} onPress={() => openManage({ kind: "book", book })}>
                        <Text style={styles.itemMenuText}>•••</Text>
                      </Pressable>
                    </View>
                  </View>

                  {standalonePages.length > 0 ? (
                    <View style={styles.workspaceBlock}>
                      <Text style={styles.workspaceBlockTitle}>
                        {t(language, "Pages without section", "Páginas sin sección")}
                      </Text>
                      {standalonePages.map((page) => (
                        <Pressable
                          key={page.id}
                          style={({ pressed }) => [styles.pageCard, pressed && styles.cardPressed]}
                          onPress={() =>
                            navigation.navigate("NotebookEditor", {
                              kind: "page",
                              id: page.id,
                              title: page.title,
                            })
                          }
                        >
                          <Text style={styles.pageTitle}>{page.title}</Text>
                          <Text style={styles.pageMeta}>
                            {formatDate(page.updated_at ?? page.created_at)}
                          </Text>
                          <Text style={styles.pageContent} numberOfLines={3}>
                            {stripHtml(page.content)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  {notebookSections.map(({ section, pages: sectionPages }) => (
                    <View key={section.id} style={styles.workspaceBlock}>
                      <View style={styles.workspaceBlockHeader}>
                        <Text style={styles.workspaceBlockTitle}>{section.name}</Text>
                        <View style={styles.workspaceHeaderActions}>
                          <Text style={styles.workspaceBlockMeta}>
                            {sectionPages.length} {t(language, "pages", "páginas")}
                          </Text>
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
                          {t(language, "No pages in this section yet.", "Aún no hay páginas en esta sección.")}
                        </Text>
                      ) : (
                        sectionPages.map((page) => (
                          <Pressable
                            key={page.id}
                            style={({ pressed }) => [styles.pageCard, pressed && styles.cardPressed]}
                            onPress={() =>
                              navigation.navigate("NotebookEditor", {
                                kind: "page",
                                id: page.id,
                                title: page.title,
                              })
                            }
                          >
                            <View style={styles.pageHeaderRow}>
                              <Text style={styles.pageTitle}>{page.title}</Text>
                              <Pressable
                                style={styles.itemMenuButton}
                                onPress={() => openManage({ kind: "page", page })}
                              >
                                <Text style={styles.itemMenuText}>•••</Text>
                              </Pressable>
                            </View>
                            <Text style={styles.pageMeta}>
                              {formatDate(page.updated_at ?? page.created_at)}
                            </Text>
                            <Text style={styles.pageContent} numberOfLines={3}>
                              {stripHtml(page.content)}
                            </Text>
                          </Pressable>
                        ))
                      )}
                    </View>
                  ))}
                </View>
              ))
            )}
          </View>
        </View>
      )}
      <Modal visible={!!createMode} transparent animationType="slide" onRequestClose={closeCreate}>
        <TouchableWithoutFeedback onPress={closeCreate}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>
                  {createMode === "book"
                    ? t(language, "New notebook", "Nuevo notebook")
                    : createMode === "section"
                    ? t(language, "New section", "Nueva sección")
                    : t(language, "New page", "Nueva página")}
                </Text>
                {createError ? <Text style={styles.modalError}>{createError}</Text> : null}

                {createMode !== "book" && (
                  <View style={styles.selectorBlock}>
                    <Text style={styles.selectorLabel}>
                      {t(language, "Notebook", "Notebook")}
                    </Text>
                    <View style={styles.selectorRow}>
                      {books.length === 0 ? (
                        <Text style={styles.selectorEmpty}>
                          {t(
                            language,
                            "Create a notebook first.",
                            "Crea un notebook primero."
                          )}
                        </Text>
                      ) : (
                        books.map((book) => {
                          const active = book.id === selectedBookId;
                          return (
                            <Pressable
                              key={book.id}
                              style={[
                                styles.selectorChip,
                                active && styles.selectorChipActive,
                              ]}
                              onPress={() => {
                                setSelectedBookId(book.id);
                                setSelectedSectionId(null);
                              }}
                            >
                              <Text
                                style={[
                                  styles.selectorChipText,
                                  active && styles.selectorChipTextActive,
                                ]}
                              >
                                {book.name}
                              </Text>
                            </Pressable>
                          );
                        })
                      )}
                    </View>
                  </View>
                )}

                {createMode === "page" && (
                  <View style={styles.selectorBlock}>
                    <Text style={styles.selectorLabel}>
                      {t(language, "Section (optional)", "Sección (opcional)")}
                    </Text>
                    <View style={styles.selectorRow}>
                      <Pressable
                        style={[
                          styles.selectorChip,
                          !selectedSectionId && styles.selectorChipActive,
                        ]}
                        onPress={() => setSelectedSectionId(null)}
                      >
                        <Text
                          style={[
                            styles.selectorChipText,
                            !selectedSectionId && styles.selectorChipTextActive,
                          ]}
                        >
                          {t(language, "No section", "Sin sección")}
                        </Text>
                      </Pressable>
                      {availableSections.map((section) => {
                        const active = section.id === selectedSectionId;
                        return (
                          <Pressable
                            key={section.id}
                            style={[
                              styles.selectorChip,
                              active && styles.selectorChipActive,
                            ]}
                            onPress={() => setSelectedSectionId(section.id)}
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
                )}

                <TextInput
                  placeholder={
                    createMode === "page"
                      ? t(language, "Page title", "Título de página")
                      : t(language, "Name", "Nombre")
                  }
                  placeholderTextColor={colors.textMuted}
                  value={createName}
                  onChangeText={setCreateName}
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

                {manageTarget?.kind !== "book" ? (
                  <View style={styles.selectorBlock}>
                    <Text style={styles.selectorLabel}>
                      {t(language, "Notebook", "Notebook")}
                    </Text>
                    <View style={styles.selectorRow}>
                      {books.map((book) => {
                        const active = book.id === manageBookId;
                        return (
                          <Pressable
                            key={book.id}
                            style={[styles.selectorChip, active && styles.selectorChipActive]}
                            onPress={() => {
                              setManageBookId(book.id);
                              if (manageTarget?.kind === "page") {
                                const matches = sections.some(
                                  (section) => section.id === manageSectionId && section.notebook_id === book.id
                                );
                                if (!matches) setManageSectionId(null);
                              }
                            }}
                          >
                            <Text
                              style={[styles.selectorChipText, active && styles.selectorChipTextActive]}
                            >
                              {book.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}

                {manageTarget?.kind === "page" ? (
                  <View style={styles.selectorBlock}>
                    <Text style={styles.selectorLabel}>
                      {t(language, "Section", "Sección")}
                    </Text>
                    <View style={styles.selectorRow}>
                      <Pressable
                        style={[styles.selectorChip, !manageSectionId && styles.selectorChipActive]}
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
                      {sections
                        .filter((section) => section.notebook_id === manageBookId)
                        .map((section) => {
                          const active = section.id === manageSectionId;
                          return (
                            <Pressable
                              key={section.id}
                              style={[styles.selectorChip, active && styles.selectorChipActive]}
                              onPress={() => setManageSectionId(section.id)}
                            >
                              <Text
                                style={[styles.selectorChipText, active && styles.selectorChipTextActive]}
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
                      "Moving the section to another notebook also moves its pages there.",
                      "Mover la sección a otro notebook también mueve sus páginas."
                    )}
                  </Text>
                ) : null}

                <View style={styles.manageActionRow}>
                  <Pressable
                    style={[styles.primaryButton, styles.managePrimaryButton, managing && styles.primaryButtonDisabled]}
                    onPress={handleRenameOrMove}
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
      gap: 12,
    },
    actionCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 10,
    },
    actionTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    actionRow: {
      flexDirection: "row",
      gap: 8,
    },
    actionButton: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 10,
      alignItems: "center",
    },
    actionButtonText: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
    actionHint: {
      color: colors.textMuted,
      fontSize: 11,
    },
    sectionCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 10,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    sectionHint: {
      color: colors.textMuted,
      fontSize: 11,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    sectionMeta: {
      color: colors.textMuted,
      fontSize: 12,
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
    noteCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 6,
    },
    cardPressed: {
      opacity: 0.8,
      transform: [{ scale: 0.99 }],
    },
    noteDate: {
      color: colors.textMuted,
      fontSize: 11,
    },
    noteContent: {
      color: colors.textPrimary,
      fontSize: 12,
      lineHeight: 17,
    },
    pageCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 6,
    },
    pageHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    pageTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 13,
      flex: 1,
    },
    pageMeta: {
      color: colors.textMuted,
      fontSize: 11,
    },
    pageContent: {
      color: colors.textPrimary,
      fontSize: 12,
      lineHeight: 17,
    },
    workspaceCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 12,
    },
    workspaceHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    workspaceHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    workspaceTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    workspaceMeta: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    workspaceBlock: {
      gap: 8,
    },
    workspaceBlockHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    workspaceBlockTitle: {
      color: colors.textPrimary,
      fontSize: 12,
      fontWeight: "700",
    },
    workspaceBlockMeta: {
      color: colors.textMuted,
      fontSize: 11,
    },
    itemMenuButton: {
      minWidth: 34,
      height: 34,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
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
    emptyText: {
      color: colors.textMuted,
      fontSize: 12,
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
    selectorEmpty: {
      color: colors.textMuted,
      fontSize: 12,
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
  });
