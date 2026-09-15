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
import Ionicons from "@expo/vector-icons/Ionicons";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { PlanGate } from "../components/PlanGate";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { usePlanAccess } from "../lib/usePlanAccess";
import { apiGet, apiPost } from "../lib/api";

const BOOKS_TABLE = "ntj_notebook_books";
const FREE_NOTES_TABLE = "ntj_notebook_free_notes";

type NotebookBook = {
  id: string;
  name: string;
};

type FreeNote = {
  entry_date: string;
  content: string | null;
  updated_at: string | null;
};

type JournalEntryDateRow = {
  date: string;
};

type AccountsResponse = {
  activeAccountId: string | null;
  accounts?: {
    id: string;
    name: string;
    account_type?: "personal" | "funded";
  }[];
};

type ShelfMode = "journal" | "custom";

function stripHtml(input?: string | null) {
  if (!input) return "";
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function formatEntryDateBadge(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatEntryDateWeekday(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
  });
}

export function NotebookScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const user = useSupabaseUser();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<any>();
  const planAccess = usePlanAccess();

  const [books, setBooks] = useState<NotebookBook[]>([]);
  const [accounts, setAccounts] = useState<NonNullable<AccountsResponse["accounts"]>>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [freeNotes, setFreeNotes] = useState<FreeNote[]>([]);
  const [journalDates, setJournalDates] = useState<string[]>([]);
  const [activeShelf, setActiveShelf] = useState<ShelfMode>("journal");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inlineBookOpen, setInlineBookOpen] = useState(false);
  const [inlineBookName, setInlineBookName] = useState("");
  const [inlineBookBusy, setInlineBookBusy] = useState(false);
  const [inlineBookError, setInlineBookError] = useState<string | null>(null);
  const [manageBook, setManageBook] = useState<NotebookBook | null>(null);
  const [manageBookName, setManageBookName] = useState("");
  const [manageBookBusy, setManageBookBusy] = useState(false);
  const [manageBookError, setManageBookError] = useState<string | null>(null);

  async function reloadNotebookData(options?: { showLoading?: boolean; accountId?: string | null }) {
    if (!planAccess.hasNotebook) return;
    if (!supabaseMobile || !user?.id) return;

    const showLoading = options?.showLoading ?? false;
    if (showLoading) setLoading(true);
    setError(null);

    try {
      const accountResponse = await apiGet<AccountsResponse>("/api/trading-accounts/list");
      const availableAccounts = Array.isArray(accountResponse.accounts) ? accountResponse.accounts : [];
      const requestedAccountId = options && "accountId" in options ? options.accountId : selectedAccountId;
      const accountId = requestedAccountId && availableAccounts.some((account) => account.id === requestedAccountId)
        ? requestedAccountId
        : accountResponse.activeAccountId ?? availableAccounts[0]?.id ?? null;
      setAccounts(availableAccounts);
      setSelectedAccountId(accountId);

      let bookQuery = supabaseMobile
        .from(BOOKS_TABLE)
        .select("id, name, account_id")
        .eq("user_id", user.id);

      if (accountId) bookQuery = bookQuery.eq("account_id", accountId);
      else bookQuery = bookQuery.is("account_id", null);

      let freeQuery = supabaseMobile
        .from(FREE_NOTES_TABLE)
        .select("entry_date, content, updated_at, account_id")
        .eq("user_id", user.id);

      if (accountId) freeQuery = freeQuery.eq("account_id", accountId);
      else freeQuery = freeQuery.is("account_id", null);

      let journalQuery = supabaseMobile
        .from("journal_entries")
        .select("date, account_id")
        .eq("user_id", user.id);

      if (accountId) journalQuery = journalQuery.eq("account_id", accountId);

      const [{ data: bookRows, error: bookErr }, { data: freeRows, error: freeErr }, { data: journalRows, error: journalErr }] =
        await Promise.all([
          bookQuery.order("created_at", { ascending: true }),
          freeQuery.order("entry_date", { ascending: false }),
          journalQuery.order("date", { ascending: false }),
        ]);

      if (bookErr) throw bookErr;
      if (freeErr) throw freeErr;
      if (journalErr) throw journalErr;

      const safeBooks = Array.isArray(bookRows) ? (bookRows as any[]) : [];
      const safeNotes = Array.isArray(freeRows) ? (freeRows as FreeNote[]) : [];
      const safeJournalRows = Array.isArray(journalRows) ? (journalRows as JournalEntryDateRow[]) : [];

      const mergedDates = Array.from(
        new Set([
          ...safeNotes.map((note) => note.entry_date),
          ...safeJournalRows.map((row) => row.date),
        ])
      ).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

      setBooks(safeBooks.map((book) => ({ id: book.id, name: book.name })));
      setFreeNotes(safeNotes);
      setJournalDates(mergedDates);
    } catch (err: any) {
      setError(
        err?.message ??
          t(language, "We couldn't load the notebook library.", "No pudimos cargar la biblioteca del notebook.")
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    if (!planAccess.hasNotebook) return;
    if (!supabaseMobile || !user?.id) return;
    void reloadNotebookData({ showLoading: true });
  }, [language, planAccess.hasNotebook, user?.id]);

  useEffect(() => {
    if (activeShelf === "journal" && journalDates.length === 0 && books.length > 0) {
      setActiveShelf("custom");
    }
    if (activeShelf === "custom" && books.length === 0 && journalDates.length > 0) {
      setActiveShelf("journal");
    }
  }, [activeShelf, books.length, journalDates.length]);

  async function handleRefresh() {
    if (!planAccess.hasNotebook) return;
    if (!supabaseMobile || !user?.id) return;
    setRefreshing(true);
    try {
      await reloadNotebookData();
    } finally {
      setRefreshing(false);
    }
  }

  function openManageBook(book: NotebookBook) {
    setManageBook(book);
    setManageBookName(book.name);
    setManageBookBusy(false);
    setManageBookError(null);
  }

  function closeManageBook() {
    if (manageBookBusy) return;
    setManageBook(null);
    setManageBookError(null);
  }

  const journalNoteMap = useMemo(() => {
    const map = new Map<string, FreeNote>();
    freeNotes.forEach((note) => {
      map.set(note.entry_date, note);
    });
    return map;
  }, [freeNotes]);

  const journalTiles = useMemo(
    () =>
      journalDates.map((entryDate) => {
        const note = journalNoteMap.get(entryDate) ?? null;
        return {
          id: entryDate,
          title: formatEntryDateBadge(entryDate),
          subtitle: formatEntryDateWeekday(entryDate),
          preview:
            stripHtml(note?.content) ||
            t(
              language,
              "Open this daily business notebook page.",
              "Abre esta página diaria del notebook empresarial."
            ),
        };
      }),
    [journalDates, journalNoteMap, language]
  );

  if (!planAccess.hasNotebook) {
    return (
      <PlanGate
        title={t(language, "Business Notebook", "Notebook Empresarial")}
        badge="Advanced"
        loading={planAccess.loading}
        subtitle={t(
          language,
          "Custom business notebooks, daily pages, sections, ink, and research notes are included in Advanced.",
          "Notebooks empresariales custom, páginas diarias, secciones, ink y notas de research están incluidas en Advanced."
        )}
      />
    );
  }

  async function openDailyNote(entryDate: string) {
    if (!supabaseMobile || !user?.id) return;
    try {
      const accountId = selectedAccountId;
      if (!accountId) throw new Error(t(language, "Choose an account first.", "Selecciona una cuenta primero."));
      const existing = freeNotes.find((note) => note.entry_date === entryDate);
      if (!existing) {
        await apiPost("/api/notebook/workspace", {
          action: "upsert_daily",
          accountId,
          date: entryDate,
          content: "",
          ink: null,
        });
      }

      await reloadNotebookData();
      navigation.navigate("NotebookEditor", {
        kind: "free",
        id: entryDate,
        title: `${t(language, "Daily note", "Nota diaria")} · ${entryDate}`,
        accountId,
        accountName: accounts.find((account) => account.id === accountId)?.name ?? "",
      });
    } catch (err: any) {
      setError(
        err?.message ??
          t(language, "We couldn't open this daily business page.", "No pudimos abrir esta página empresarial diaria.")
      );
    }
  }

  async function handleInlineBookCreate() {
    if (!supabaseMobile || !user?.id) return;
    const trimmed = inlineBookName.trim();
    if (!trimmed) {
      setInlineBookError(t(language, "Name is required.", "El nombre es requerido."));
      return;
    }

    setInlineBookBusy(true);
    setInlineBookError(null);
    try {
      const accountId = selectedAccountId;
      await apiPost("/api/notebook/workspace", {
        action: "create_book",
        scope: "account",
        accountId,
        name: trimmed,
      });

      setInlineBookOpen(false);
      setInlineBookName("");
      setActiveShelf("custom");
      await reloadNotebookData();
    } catch (err: any) {
      setInlineBookError(
        err?.message ??
          t(language, "We couldn't create this notebook.", "No pudimos crear este notebook.")
      );
    } finally {
      setInlineBookBusy(false);
    }
  }

  async function handleManageBookSave() {
    if (!supabaseMobile || !user?.id || !manageBook) return;
    const trimmed = manageBookName.trim();
    if (!trimmed) {
      setManageBookError(t(language, "Name is required.", "El nombre es requerido."));
      return;
    }

    setManageBookBusy(true);
    setManageBookError(null);
    try {
      await apiPost("/api/notebook/workspace", {
        action: "update_book",
        bookId: manageBook.id,
        name: trimmed,
      });

      await reloadNotebookData();
      closeManageBook();
    } catch (err: any) {
      setManageBookError(
        err?.message ??
          t(language, "We couldn't update this notebook.", "No pudimos actualizar este notebook.")
      );
    } finally {
      setManageBookBusy(false);
    }
  }

  async function executeDeleteBook() {
    if (!supabaseMobile || !user?.id || !manageBook) return;
    setManageBookBusy(true);
    setManageBookError(null);
    try {
      await apiPost("/api/notebook/workspace", {
        action: "trash_book",
        bookId: manageBook.id,
      });

      await reloadNotebookData();
      closeManageBook();
    } catch (err: any) {
      setManageBookError(
        err?.message ??
          t(language, "We couldn't delete this notebook.", "No pudimos borrar este notebook.")
      );
    } finally {
      setManageBookBusy(false);
    }
  }

  function confirmDeleteBook() {
    if (!manageBook) return;
    Alert.alert(
      t(language, "Move notebook to trash", "Mover notebook a papelera"),
      `${manageBook.name}\n\n${t(
        language,
        "The notebook and its pages can be recovered from Trash on the web app.",
        "El notebook y sus páginas pueden recuperarse desde Papelera en la web."
      )}`,
      [
        { text: t(language, "Cancel", "Cancelar"), style: "cancel" },
        {
          text: t(language, "Move to trash", "Mover a papelera"),
          style: "destructive",
          onPress: () => {
            void executeDeleteBook();
          },
        },
      ]
    );
  }

  return (
    <ScreenScaffold
      title={t(language, "Business Notebook", "Notebook Empresarial")}
      subtitle={t(
        language,
        "Open daily business pages by date or manage your custom notebook library.",
        "Abre páginas empresariales diarias por fecha o gestiona tu biblioteca de notebooks custom."
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
      ) : (
      <View style={styles.sectionList}>
          <View style={styles.accountContextCard}>
            <View style={styles.accountContextHeader}>
              <View style={styles.accountContextCopy}>
                <Text style={styles.accountContextLabel}>{t(language, "ACCOUNT CONTEXT", "CONTEXTO DE CUENTA")}</Text>
                <Text style={styles.accountContextTitle}>
                  {accounts.find((account) => account.id === selectedAccountId)?.name ?? t(language, "Choose an account", "Selecciona una cuenta")}
                </Text>
              </View>
              <Ionicons name="swap-horizontal-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.accountPills}>
              {accounts.map((account) => {
                const selected = account.id === selectedAccountId;
                return (
                  <Pressable
                    key={account.id}
                    style={[styles.accountPill, selected && styles.accountPillActive]}
                    onPress={async () => {
                      if (selected) return;
                      setSelectedAccountId(account.id);
                      setLoading(true);
                      try {
                        await apiPost("/api/trading-accounts/set-active", { accountId: account.id });
                        await reloadNotebookData({ accountId: account.id });
                      } catch (err: any) {
                        setError(err?.message ?? t(language, "We couldn't switch accounts.", "No pudimos cambiar de cuenta."));
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    <Text style={[styles.accountPillText, selected && styles.accountPillTextActive]} numberOfLines={1}>
                      {account.name}
                    </Text>
                    <Text style={[styles.accountPillMeta, selected && styles.accountPillMetaActive]}>
                      {account.account_type === "funded" ? t(language, "Funded", "Fondeada") : t(language, "Personal", "Personal")}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.shelfRow}>
            <Pressable
              style={({ pressed }) => [
                styles.shelfCard,
                activeShelf === "journal" && styles.shelfCardActive,
                pressed && styles.cardPressed,
              ]}
              onPress={() => setActiveShelf("journal")}
            >
              <View style={[styles.shelfIconBubble, activeShelf === "journal" && styles.shelfIconBubbleActive]}>
                <Ionicons name="calendar-clear-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.shelfTitle}>{t(language, "Daily Business Pages", "Páginas Empresariales Diarias")}</Text>
              <Text style={styles.shelfCaption}>
                {t(
                  language,
                  "Each execution day lives here as its own notebook page.",
                  "Cada día de ejecución vive aquí como su propia página."
                )}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.shelfCard,
                activeShelf === "custom" && styles.shelfCardActive,
                pressed && styles.cardPressed,
              ]}
              onPress={() => setActiveShelf("custom")}
            >
              <View style={[styles.shelfIconBubble, activeShelf === "custom" && styles.shelfIconBubbleActive]}>
                <Ionicons name="library-outline" size={22} color={colors.primary} />
              </View>
              <Text style={styles.shelfTitle}>{t(language, "Custom Business Notebooks", "Notebooks Empresariales Custom")}</Text>
              <Text style={styles.shelfCaption}>
                {t(
                  language,
                  "Keep separate libraries for study, process, ideas, and playbooks.",
                  "Mantén bibliotecas separadas para estudio, proceso, ideas y playbooks."
                )}
              </Text>
            </Pressable>
          </View>

          {activeShelf === "journal" ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {t(language, "Daily Business Pages", "Páginas Empresariales Diarias")}
              </Text>
              <Text style={styles.sectionHint}>
                {t(
                  language,
                  "These pages come from days you created or traded in the Execution Journal.",
                  "Estas páginas salen de los días que creaste u operaste en el Registro de Ejecución."
                )}
              </Text>

              {journalTiles.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
                  <Text style={styles.emptyText}>
                    {t(
                      language,
                      "No daily business pages yet. Once you trade or write in the Execution Journal, the day appears here.",
                      "Aún no hay páginas empresariales diarias. Cuando tradees o escribas en el Registro de Ejecución, el día aparecerá aquí."
                    )}
                  </Text>
                </View>
              ) : (
                <View style={styles.iconGrid}>
                  {journalTiles.map((tile) => (
                    <Pressable
                      key={tile.id}
                      style={({ pressed }) => [styles.libraryTile, pressed && styles.cardPressed]}
                      onPress={() => void openDailyNote(tile.id)}
                    >
                      <View style={styles.libraryTileTop}>
                        <View style={styles.libraryIconBubble}>
                          <Ionicons name="book-outline" size={20} color={colors.primary} />
                        </View>
                      </View>
                      <Text style={styles.libraryTileTitle}>{tile.title}</Text>
                      <Text style={styles.libraryTileMeta}>{tile.subtitle}</Text>
                      <Text style={styles.libraryTilePreview} numberOfLines={2}>
                        {tile.preview}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>
                {t(language, "Custom Business Notebooks", "Notebooks Empresariales Custom")}
              </Text>
              <Text style={styles.sectionHint}>
                {t(
                  language,
                  "Create notebooks right here, then open one library at a time.",
                  "Crea notebooks aquí mismo y luego abre una biblioteca a la vez."
                )}
              </Text>

              <View style={styles.iconGrid}>
                {inlineBookOpen ? (
                  <View style={styles.draftTile}>
                    <View style={styles.libraryTileTop}>
                      <View style={styles.libraryIconBubble}>
                        <Ionicons name="create-outline" size={18} color={colors.primary} />
                      </View>
                    </View>
                    <TextInput
                      value={inlineBookName}
                      onChangeText={setInlineBookName}
                      placeholder={t(language, "Notebook name", "Nombre del notebook")}
                      placeholderTextColor={colors.textMuted}
                      style={styles.draftInput}
                      autoFocus
                      onSubmitEditing={() => {
                        void handleInlineBookCreate();
                      }}
                    />
                    {inlineBookError ? <Text style={styles.inlineError}>{inlineBookError}</Text> : null}
                    <View style={styles.draftActions}>
                      <Pressable
                        style={[styles.smallPrimaryButton, inlineBookBusy && styles.primaryButtonDisabled]}
                        onPress={() => {
                          void handleInlineBookCreate();
                        }}
                        disabled={inlineBookBusy}
                      >
                        <Text style={styles.smallPrimaryButtonText}>
                          {inlineBookBusy ? t(language, "Saving…", "Guardando…") : t(language, "Save", "Guardar")}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.smallSecondaryButton}
                        onPress={() => {
                          if (inlineBookBusy) return;
                          setInlineBookOpen(false);
                          setInlineBookName("");
                          setInlineBookError(null);
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
                      setInlineBookOpen(true);
                      setInlineBookName("");
                      setInlineBookError(null);
                    }}
                  >
                    <View style={styles.createTileBubble}>
                      <Ionicons name="add-outline" size={24} color={colors.primary} />
                    </View>
                    <Text style={styles.createTileTitle}>
                      {t(language, "New notebook", "Nuevo notebook")}
                    </Text>
                    <Text style={styles.createTileCaption}>
                      {t(language, "Create it here", "Créalo aquí")}
                    </Text>
                  </Pressable>
                )}

                {books.map((book) => (
                  <Pressable
                    key={book.id}
                    style={({ pressed }) => [styles.libraryTile, pressed && styles.cardPressed]}
                    onPress={() =>
                      navigation.navigate("NotebookWorkspace", {
                        notebookId: book.id,
                        title: book.name,
                        accountId: selectedAccountId,
                      })
                    }
                    onLongPress={() => openManageBook(book)}
                  >
                    <View style={styles.libraryTileTop}>
                      <View style={styles.libraryIconBubble}>
                        <Ionicons name="library-outline" size={20} color={colors.primary} />
                      </View>
                    </View>
                    <Text style={styles.libraryTileTitle} numberOfLines={2}>
                      {book.name}
                    </Text>
                    <Text style={styles.libraryTileMeta}>
                      {t(language, "Open notebook", "Abrir notebook")}
                    </Text>
                    <Text style={styles.libraryTilePreview} numberOfLines={2}>
                      {t(
                        language,
                        "Tap to open. Long press to rename or delete.",
                        "Toca para abrir. Mantén presionado para renombrar o borrar."
                      )}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {!inlineBookOpen && books.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="library-outline" size={20} color={colors.textMuted} />
                  <Text style={styles.emptyText}>
                    {t(language, "No custom notebooks yet.", "Aún no hay notebooks custom.")}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}

      <Modal visible={!!manageBook} transparent animationType="slide" onRequestClose={closeManageBook}>
        <TouchableWithoutFeedback onPress={closeManageBook}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>{t(language, "Manage notebook", "Gestionar notebook")}</Text>
                {manageBookError ? <Text style={styles.modalError}>{manageBookError}</Text> : null}
                <TextInput
                  value={manageBookName}
                  onChangeText={setManageBookName}
                  placeholder={t(language, "Notebook name", "Nombre del notebook")}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  autoFocus
                />
                <View style={styles.manageActionRow}>
                  <Pressable
                    style={[styles.primaryButton, styles.managePrimaryButton, manageBookBusy && styles.primaryButtonDisabled]}
                    onPress={() => {
                      void handleManageBookSave();
                    }}
                    disabled={manageBookBusy}
                  >
                    <Text style={styles.primaryButtonText}>
                      {manageBookBusy ? t(language, "Saving…", "Guardando…") : t(language, "Save changes", "Guardar cambios")}
                    </Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButton} onPress={confirmDeleteBook} disabled={manageBookBusy}>
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
    accountContextCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 12,
    },
    accountContextHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    accountContextCopy: {
      flex: 1,
      gap: 3,
    },
    accountContextLabel: {
      color: colors.primary,
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 1.4,
    },
    accountContextTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "800",
    },
    accountPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    accountPill: {
      minWidth: 112,
      maxWidth: 170,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    accountPillActive: {
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
    },
    accountPillText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    accountPillTextActive: {
      color: colors.textPrimary,
    },
    accountPillMeta: {
      color: colors.textMuted,
      fontSize: 9,
      marginTop: 2,
    },
    accountPillMetaActive: {
      color: colors.primary,
    },
    shelfRow: {
      flexDirection: "row",
      gap: 10,
    },
    shelfCard: {
      flex: 1,
      minHeight: 150,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 10,
    },
    shelfCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surface,
      shadowColor: colors.primary,
      shadowOpacity: 0.14,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    shelfIconBubble: {
      width: 46,
      height: 46,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    shelfIconBubbleActive: {
      borderColor: colors.primary,
      backgroundColor: colors.successSoft,
    },
    shelfTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "800",
    },
    shelfCaption: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
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
      fontWeight: "800",
      fontSize: 16,
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
    emptyCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      gap: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
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
