import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";

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

  const [pages, setPages] = useState<NotebookPage[]>([]);
  const [books, setBooks] = useState<NotebookBook[]>([]);
  const [sections, setSections] = useState<NotebookSection[]>([]);
  const [freeNotes, setFreeNotes] = useState<FreeNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <ScreenScaffold
      title={t(language, "Notebook", "Notebook")}
      subtitle={t(
        language,
        "Review your notebook entries from the web app.",
        "Revisa tus notas del notebook desde la web."
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
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {t(language, "Daily notebook", "Notebook diario")}
              </Text>
              <Text style={styles.sectionLink} onPress={() => Linking.openURL(WEB_NOTEBOOK_URL)}>
                {t(language, "Open on web", "Abrir en web")}
              </Text>
            </View>
            {freeNotes.length === 0 ? (
              <Text style={styles.emptyText}>
                {t(language, "No daily notes yet.", "Aún no hay notas diarias.")}
              </Text>
            ) : (
              freeNotes.slice(0, 6).map((note) => (
                <View key={note.entry_date} style={styles.noteCard}>
                  <Text style={styles.noteDate}>{note.entry_date}</Text>
                  <Text style={styles.noteContent} numberOfLines={3}>
                    {stripHtml(note.content)}
                  </Text>
                </View>
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
                <View key={page.id} style={styles.pageCard}>
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
                </View>
              ))
            )}
          </View>
        </View>
      )}
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
  });
