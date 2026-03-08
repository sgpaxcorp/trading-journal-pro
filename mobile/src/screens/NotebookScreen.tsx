import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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

const WEB_NOTEBOOK_URL = "https://www.neurotrader-journal.com/notebook";

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

  useEffect(() => {
    if (!supabaseMobile || !user?.id) return;

    let cancelled = false;

    async function loadNotebook(isRefresh = false) {
      if (!isRefresh) {
        setLoading(true);
      }
      setError(null);

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

      if (!cancelled) {
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
        if (!isRefresh) {
          setLoading(false);
        }
      }
    }

    void loadNotebook();

    return () => {
      cancelled = true;
    };
  }, [language, user?.id]);

  async function handleRefresh() {
    if (!supabaseMobile || !user?.id) return;
    setRefreshing(true);
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
      setRefreshing(false);
    }
  }

  const bookNameById = useMemo(() => {
    const map = new Map<string, string>();
    books.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [books]);

  const sectionNameById = useMemo(() => {
    const map = new Map<string, string>();
    sections.forEach((s) => map.set(s.id, s.name));
    return map;
  }, [sections]);

  const availableSections = useMemo(() => {
    if (!selectedBookId) return [];
    return sections.filter((section) => section.notebook_id === selectedBookId);
  }, [sections, selectedBookId]);

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
          await handleRefresh();
          navigation.navigate("NotebookEditor", {
            kind: "page",
            id: data.id,
            title: data.title ?? title,
          });
          return;
        }
      }

      closeCreate();
      await handleRefresh();
    } catch (err: any) {
      setCreateError(
        err?.message ??
          t(language, "We couldn't create the notebook item.", "No pudimos crear el notebook.")
      );
    } finally {
      setCreating(false);
    }
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
              <Text style={styles.sectionLink} onPress={() => Linking.openURL(WEB_NOTEBOOK_URL)}>
                {t(language, "Open on web", "Abrir en web")}
              </Text>
            </View>
            <Text style={styles.sectionHint}>
              {t(language, "Tap a note to edit.", "Toca una nota para editar.")}
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
                {t(language, "Notebook pages", "Páginas del notebook")}
              </Text>
              <Text style={styles.sectionMeta}>
                {pages.length} {t(language, "pages", "páginas")}
              </Text>
            </View>
            {pages.length === 0 ? (
              <Text style={styles.emptyText}>
                {t(language, "No notebook pages yet.", "Aún no hay páginas.")}
              </Text>
            ) : (
              pages.slice(0, 8).map((page) => (
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
                    {bookNameById.get(page.notebook_id) ?? t(language, "Notebook", "Notebook")}
                    {page.section_id && sectionNameById.get(page.section_id)
                      ? ` · ${sectionNameById.get(page.section_id)}`
                      : ""}
                    {` · ${formatDate(page.updated_at ?? page.created_at)}`}
                  </Text>
                  <Text style={styles.pageContent} numberOfLines={3}>
                    {stripHtml(page.content)}
                  </Text>
                </Pressable>
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
    sectionLink: {
      color: colors.primary,
      fontSize: 12,
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
    pageTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 13,
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
      backgroundColor: colors.primaryMuted,
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
  });
