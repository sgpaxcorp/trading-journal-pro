import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
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

const TABLE = "ntj_resource_library_items";

type ResourceItem = {
  id: string;
  user_id: string;
  account_id: string | null;
  kind: string;
  title: string;
  url: string | null;
  author: string | null;
  content: string | null;
  created_at: string;
};

type AccountsResponse = {
  activeAccountId: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatKind(kind?: string | null, lang: "en" | "es" = "en") {
  const normalized = String(kind || "").toLowerCase();
  const map: Record<string, { en: string; es: string }> = {
    youtube: { en: "YouTube", es: "YouTube" },
    book: { en: "Book", es: "Libro" },
    amazon: { en: "Amazon", es: "Amazon" },
    article: { en: "Article", es: "Artículo" },
    note: { en: "Note", es: "Nota" },
    link: { en: "Link", es: "Enlace" },
  };
  return map[normalized]?.[lang] ?? (normalized ? normalized.toUpperCase() : "Item");
}

async function fetchActiveAccountId(): Promise<string | null> {
  try {
    const res = await apiGet<AccountsResponse>("/api/trading-accounts/list");
    return res.activeAccountId ?? null;
  } catch {
    return null;
  }
}

export function LibraryScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const user = useSupabaseUser();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !supabaseMobile) return;
    let cancelled = false;

    async function loadResources() {
      setLoading(true);
      setError(null);

      const accountId = await fetchActiveAccountId();

      let query = supabaseMobile
        .from(TABLE)
        .select("*")
        .eq("user_id", user.id);

      if (accountId) query = query.eq("account_id", accountId);
      else query = query.is("account_id", null);

      const { data, error: loadError } = await query.order("created_at", {
        ascending: false,
      });

      if (!cancelled) {
        if (loadError) {
          console.error("[LibraryScreen] load error:", loadError);
          setError(
            t(
              language,
              "We couldn't load your library yet.",
              "No pudimos cargar tu biblioteca aún."
            )
          );
          setItems([]);
        } else {
          setItems(Array.isArray(data) ? (data as ResourceItem[]) : []);
        }
        setLoading(false);
      }
    }

    void loadResources();

    return () => {
      cancelled = true;
    };
  }, [language, user?.id]);

  return (
    <ScreenScaffold
      title={t(language, "Library", "Biblioteca")}
      subtitle={t(
        language,
        "Your saved links, books, and notes from the web app.",
        "Tus links, libros y notas guardadas desde la web."
      )}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>
            {t(language, "Loading library…", "Cargando biblioteca…")}
          </Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {t(language, "No resources yet", "Aún no hay recursos")}
          </Text>
          <Text style={styles.emptySubtitle}>
            {t(
              language,
              "Save a resource on the web and it will appear here.",
              "Guarda un recurso en la web y aparecerá aquí."
            )}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => {
            const kindLabel = formatKind(item.kind, language);
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <View style={styles.kindPill}>
                    <Text style={styles.kindText}>{kindLabel}</Text>
                  </View>
                </View>
                <Text style={styles.metaText}>
                  {item.author ? `${item.author} · ` : ""}
                  {formatDate(item.created_at)}
                </Text>
                {item.content ? (
                  <Text style={styles.contentText} numberOfLines={3}>
                    {item.content}
                  </Text>
                ) : null}
                {item.url ? (
                  <Pressable
                    style={styles.linkButton}
                    onPress={() => Linking.openURL(item.url || "")}
                  >
                    <Text style={styles.linkText}>
                      {t(language, "Open link", "Abrir enlace")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    list: {
      gap: 12,
    },
    card: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 8,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 15,
      flex: 1,
    },
    kindPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: colors.surface,
    },
    kindText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "600",
      letterSpacing: 0.3,
    },
    metaText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    contentText: {
      color: colors.textPrimary,
      fontSize: 13,
      lineHeight: 18,
    },
    linkButton: {
      alignSelf: "flex-start",
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    linkText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    emptyCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 18,
      gap: 6,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 15,
    },
    emptySubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
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
  });
