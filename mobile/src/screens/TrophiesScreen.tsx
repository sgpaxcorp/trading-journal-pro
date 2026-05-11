import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { useSupabaseUser } from "../lib/useSupabaseUser";
import { apiGet, apiPost } from "../lib/api";
import { supabaseMobile } from "../lib/supabase";

type TrophiesApiResponse = {
  definitions: TrophyDefinition[];
  earned: TrophyItem[];
};

type TrophyDefinition = {
  id: string;
  title: string;
  description: string;
  tier: string;
  xp: number;
  category: string;
  icon?: string | null;
  secret?: boolean | null;
};

type TrophyItem = {
  trophy_id: string;
  title: string;
  description: string;
  tier: string;
  xp: number;
  category: string;
  earned_at: string | null;
  locked: boolean;
  secret?: boolean | null;
};

function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

async function syncTrophiesQuietly() {
  try {
    await apiPost("/api/trophies/sync", {});
  } catch (err) {
    console.warn("[TrophiesScreen] sync error:", err);
  }
}

export function TrophiesScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const user = useSupabaseUser();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [earned, setEarned] = useState<TrophyItem[]>([]);
  const [locked, setLocked] = useState<TrophyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedEmptyLabel, setLockedEmptyLabel] = useState<string>(
    t(language, "All trophies unlocked.", "Todos los trofeos desbloqueados.")
  );

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    async function loadTrophies(isRefresh = false) {
      if (!isRefresh) {
        setLoading(true);
      }
      setError(null);

      let defs: TrophyDefinition[] = [];
      let earnedRows: TrophyItem[] = [];
      let loadError: any = null;

      await syncTrophiesQuietly();

      try {
        const res = await apiGet<TrophiesApiResponse>("/api/trophies/mobile");
        defs = Array.isArray(res.definitions) ? res.definitions : [];
        earnedRows = Array.isArray(res.earned) ? res.earned : [];
      } catch (err) {
        loadError = err;
        console.warn("[TrophiesScreen] API error:", err);
      }

      if (loadError && supabaseMobile) {
        try {
          const userId = user?.id;
          if (!userId) throw new Error("Missing user");
          let rpcRes = await supabaseMobile.rpc("nt_public_user_trophies", {
            target_user: userId,
          });
          if (rpcRes.error) {
            rpcRes = await supabaseMobile.rpc("nt_public_user_trophies", {
              p_user_id: userId,
            });
          }
          if (!rpcRes.error && Array.isArray(rpcRes.data)) {
            loadError = null;
            defs = [];
            earnedRows = rpcRes.data.map((row: any) => ({
              trophy_id: String(row?.trophy_id ?? ""),
              title: String(row?.title ?? "Trophy"),
              description: String(row?.description ?? ""),
              tier: String(row?.tier ?? "Bronze"),
              xp: Number(row?.xp ?? 0),
              category: String(row?.category ?? "General"),
              earned_at: row?.earned_at ? String(row.earned_at) : null,
            })) as TrophyItem[];
          }
        } catch (fallbackErr) {
          console.warn("[TrophiesScreen] fallback error:", fallbackErr);
        }
      }

      if (!cancelled) {
        if (loadError) {
          setError(
            t(
              language,
              "We couldn't load trophies yet.",
              "No pudimos cargar los trofeos aún."
            )
          );
          setLoading(false);
          return;
        }

        const earnedList: TrophyItem[] = (earnedRows ?? []).map((row: any) => ({
          trophy_id: String(row?.trophy_id ?? ""),
          title: String(row?.title ?? "Trophy"),
          description: String(row?.description ?? ""),
          tier: String(row?.tier ?? "Bronze"),
          xp: Number(row?.xp ?? 0),
          category: String(row?.category ?? "General"),
          earned_at: row?.earned_at ? String(row.earned_at) : null,
          locked: false,
          secret: row?.secret ?? null,
        }));

        const earnedIds = new Set(earnedList.map((item) => item.trophy_id));

        const lockedList: TrophyItem[] = (defs ?? [])
          .filter((def: any) => !earnedIds.has(String(def.id)))
          .map((def: any) => ({
            trophy_id: String(def.id),
            title: def.secret
              ? t(language, "Secret trophy", "Trofeo secreto")
              : String(def.title ?? "Trophy"),
            description: def.secret
              ? t(
                  language,
                  "Keep trading and journaling to reveal this trophy.",
                  "Sigue operando y haciendo journal para revelar este trofeo."
                )
              : String(def.description ?? ""),
            tier: String(def.tier ?? "Bronze"),
            xp: Number(def.xp ?? 0),
            category: String(def.category ?? "General"),
            earned_at: null,
            locked: true,
            secret: def.secret ?? null,
          }));

        setEarned(earnedList);
        setLocked(lockedList);
        setLockedEmptyLabel(
          defs && defs.length > 0
            ? t(language, "All trophies unlocked.", "Todos los trofeos desbloqueados.")
            : t(
                language,
                "Locked trophies sync on web.",
                "Los trofeos bloqueados se sincronizan en la web."
              )
        );
        if (!isRefresh) {
          setLoading(false);
        }
      }
    }

    void loadTrophies();

    return () => {
      cancelled = true;
    };
  }, [language, user?.id]);

  async function handleRefresh() {
    if (!user?.id) return;
    setRefreshing(true);
    setError(null);
    try {
      let defs: TrophyDefinition[] = [];
      let earnedRows: TrophyItem[] = [];
      let loadError: any = null;

      await syncTrophiesQuietly();

      try {
        const res = await apiGet<TrophiesApiResponse>("/api/trophies/mobile");
        defs = Array.isArray(res.definitions) ? res.definitions : [];
        earnedRows = Array.isArray(res.earned) ? res.earned : [];
      } catch (err) {
        loadError = err;
      }

      if (loadError && supabaseMobile) {
        try {
          let rpcRes = await supabaseMobile.rpc("nt_public_user_trophies", {
            target_user: user.id,
          });
          if (rpcRes.error) {
            rpcRes = await supabaseMobile.rpc("nt_public_user_trophies", {
              p_user_id: user.id,
            });
          }
          if (!rpcRes.error && Array.isArray(rpcRes.data)) {
            loadError = null;
            defs = [];
            earnedRows = rpcRes.data.map((row: any) => ({
              trophy_id: String(row?.trophy_id ?? ""),
              title: String(row?.title ?? "Trophy"),
              description: String(row?.description ?? ""),
              tier: String(row?.tier ?? "Bronze"),
              xp: Number(row?.xp ?? 0),
              category: String(row?.category ?? "General"),
              earned_at: row?.earned_at ? String(row.earned_at) : null,
            })) as TrophyItem[];
          }
        } catch {
          // ignore
        }
      }

      if (loadError) {
        setError(
          t(
            language,
            "We couldn't load trophies yet.",
            "No pudimos cargar los trofeos aún."
          )
        );
        return;
      }

      const earnedList: TrophyItem[] = (earnedRows ?? []).map((row: any) => ({
        trophy_id: String(row?.trophy_id ?? ""),
        title: String(row?.title ?? "Trophy"),
        description: String(row?.description ?? ""),
        tier: String(row?.tier ?? "Bronze"),
        xp: Number(row?.xp ?? 0),
        category: String(row?.category ?? "General"),
        earned_at: row?.earned_at ? String(row.earned_at) : null,
        locked: false,
        secret: row?.secret ?? null,
      }));

      const earnedIds = new Set(earnedList.map((item) => item.trophy_id));
      const lockedList: TrophyItem[] = (defs ?? [])
        .filter((def: any) => !earnedIds.has(String(def.id)))
        .map((def: any) => ({
          trophy_id: String(def.id),
          title: def.secret
            ? t(language, "Secret trophy", "Trofeo secreto")
            : String(def.title ?? "Trophy"),
          description: def.secret
            ? t(
                language,
                "Keep trading and journaling to reveal this trophy.",
                "Sigue operando y haciendo journal para revelar este trofeo."
              )
            : String(def.description ?? ""),
          tier: String(def.tier ?? "Bronze"),
          xp: Number(def.xp ?? 0),
          category: String(def.category ?? "General"),
          earned_at: null,
          locked: true,
          secret: def.secret ?? null,
        }));

      setEarned(earnedList);
      setLocked(lockedList);
      setLockedEmptyLabel(
        defs && defs.length > 0
          ? t(language, "All trophies unlocked.", "Todos los trofeos desbloqueados.")
          : t(
              language,
              "Locked trophies sync on web.",
              "Los trofeos bloqueados se sincronizan en la web."
            )
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScreenScaffold
      title={t(language, "Trophies", "Trofeos")}
      subtitle={t(
        language,
        "Track earned and locked trophies.",
        "Revisa tus trofeos ganados y bloqueados."
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>
            {t(language, "Loading trophies…", "Cargando trofeos…")}
          </Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <View style={styles.sectionList}>
          <Section
            title={t(language, "Earned trophies", "Trofeos ganados")}
            items={earned}
            emptyLabel={t(language, "No trophies yet.", "Aún no hay trofeos.")}
            styles={styles}
            language={language}
          />
          <Section
            title={t(language, "Locked trophies", "Trofeos bloqueados")}
            items={locked}
            emptyLabel={lockedEmptyLabel}
            styles={styles}
            language={language}
          />
        </View>
      )}
    </ScreenScaffold>
  );
}

type SectionProps = {
  title: string;
  items: TrophyItem[];
  emptyLabel: string;
  styles: ReturnType<typeof createStyles>;
  language: "en" | "es";
};

function Section({ title, items, emptyLabel, styles, language }: SectionProps) {
  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      ) : (
        <View style={styles.itemsList}>
          {items.map((item) => (
            <View key={`${item.locked ? "L" : "E"}-${item.trophy_id}`} style={styles.trophyCard}>
              <View style={styles.trophyHeader}>
                <Text style={styles.trophyTitle}>{item.title}</Text>
                <View style={styles.tierPill}>
                  <Text style={styles.tierText}>{item.tier}</Text>
                </View>
              </View>
              <Text style={styles.trophyDesc}>{item.description}</Text>
              <Text style={styles.trophyMeta}>
                {item.locked
                  ? t(language, "Locked", "Bloqueado")
                  : `${t(language, "Earned", "Ganado")} ${formatDate(item.earned_at)}`}
                {item.xp ? ` · ${item.xp} XP` : ""}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
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
    sectionTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    itemsList: {
      gap: 10,
    },
    trophyCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      gap: 6,
    },
    trophyHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
    },
    trophyTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 13,
      flex: 1,
    },
    trophyDesc: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    trophyMeta: {
      color: colors.textMuted,
      fontSize: 11,
    },
    tierPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingVertical: 4,
      backgroundColor: colors.background,
    },
    tierText: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "capitalize",
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: 12,
    },
  });
