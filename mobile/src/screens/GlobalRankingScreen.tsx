import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";

const DEFAULT_LIMIT = 25;

type LeaderboardRow = {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  tier: string;
  xp_total: number;
  trophies_count: number;
};

type PublicProfile = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  tier: string;
  xp_total: number;
  trophies_count: number;
  level: number;
};

function formatNumber(value?: number | null) {
  if (typeof value !== "number") return "—";
  return value.toLocaleString();
}

export function GlobalRankingScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const user = useSupabaseUser();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseMobile || !user?.id) return;

    let cancelled = false;

    async function loadRanking() {
      setLoading(true);
      setError(null);

      let leaderboard: any[] | null = null;
      let lbError: any = null;

      const primary = await supabaseMobile.rpc("nt_public_leaderboard", {
        limit_num: DEFAULT_LIMIT,
        offset_num: 0,
      });

      leaderboard = primary.data;
      lbError = primary.error;

      if (lbError) {
        const alt = await supabaseMobile.rpc("nt_public_leaderboard", {
          p_limit: DEFAULT_LIMIT,
          p_offset: 0,
        });
        leaderboard = alt.data;
        lbError = alt.error;
      }

      let profileRow: any = null;
      let profileError: any = null;

      const profileRes = await supabaseMobile.rpc("nt_public_user_profile", {
        target_user: user.id,
      });

      profileRow = profileRes.data;
      profileError = profileRes.error;

      if (profileError) {
        const altProfile = await supabaseMobile.rpc("nt_public_user_profile", {
          p_user_id: user.id,
        });
        profileRow = altProfile.data;
        profileError = altProfile.error;
      }

      if (!cancelled) {
        if (lbError) {
          console.error("[GlobalRankingScreen] leaderboard error:", lbError);
          setError(
            t(
              language,
              "We couldn't load the leaderboard.",
              "No pudimos cargar el ranking."
            )
          );
        } else {
          const parsed = (leaderboard ?? []).map((row: any, idx: number) => ({
            rank:
              typeof row?.rank === "number"
                ? row.rank
                : idx + 1,
            user_id: String(row?.user_id ?? ""),
            display_name: String(row?.display_name ?? "Trader"),
            avatar_url: (row?.avatar_url ?? null) as string | null,
            tier: String(row?.tier ?? "Bronze"),
            xp_total: Number(row?.xp_total ?? 0),
            trophies_count: Number(row?.trophies_count ?? row?.trophies_total ?? 0),
          }));
          setRows(parsed);
        }

        if (!profileError && profileRow) {
          const row = Array.isArray(profileRow) ? profileRow[0] : profileRow;
          if (row) {
            setProfile({
              user_id: String(row.user_id ?? user.id),
              display_name: String(row.display_name ?? "Trader"),
              avatar_url: (row.avatar_url ?? null) as string | null,
              tier: String(row.tier ?? "Bronze"),
              xp_total: Number(row.xp_total ?? 0),
              trophies_count: Number(row.trophies_count ?? row.trophies_total ?? 0),
              level: Number(row.level ?? 1),
            });
          }
        }

        setLoading(false);
      }
    }

    void loadRanking();

    return () => {
      cancelled = true;
    };
  }, [language, user?.id]);

  const myRank = useMemo(() => {
    if (!user?.id) return null;
    const index = rows.findIndex((row) => row.user_id === user.id);
    if (index < 0) return null;
    return index + 1;
  }, [rows, user?.id]);

  return (
    <ScreenScaffold
      title={t(language, "Global ranking", "Ranking global")}
      subtitle={t(
        language,
        "Top traders by XP and trophies earned.",
        "Top traders por XP y trofeos ganados."
      )}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>
            {t(language, "Loading leaderboard…", "Cargando ranking…")}
          </Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <>
          <View style={styles.snapshotCard}>
            <Text style={styles.snapshotLabel}>
              {t(language, "Your snapshot", "Tu resumen")}
            </Text>
            <Text style={styles.snapshotValue}>
              {myRank ? `#${myRank}` : t(language, "Not in top 25", "Fuera del top 25")}
              {profile
                ? ` · ${formatNumber(profile.xp_total)} XP · ${formatNumber(profile.trophies_count)} ${t(
                    language,
                    "trophies",
                    "trofeos"
                  )}`
                : ""}
            </Text>
            {profile ? (
              <Text style={styles.snapshotSub}>
                {t(language, "Tier", "Tier")}: {profile.tier} · {t(language, "Level", "Nivel")} {profile.level}
              </Text>
            ) : null}
          </View>

          <View style={styles.list}>
            {rows.map((row) => (
              <View key={`${row.user_id}-${row.rank}`} style={styles.rowCard}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{row.rank}</Text>
                </View>
                {row.avatar_url ? (
                  <Image source={{ uri: row.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>
                      {row.display_name?.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.rowCopy}>
                  <Text style={styles.rowName}>{row.display_name}</Text>
                  <Text style={styles.rowMeta}>
                    {formatNumber(row.xp_total)} XP · {formatNumber(row.trophies_count)} {t(language, "trophies", "trofeos")}
                  </Text>
                </View>
                <View style={styles.tierPill}>
                  <Text style={styles.tierText}>{row.tier}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
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
    snapshotCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 14,
      gap: 6,
    },
    snapshotLabel: {
      color: colors.textMuted,
      fontSize: 11,
      letterSpacing: 0.6,
      textTransform: "uppercase",
    },
    snapshotValue: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: "700",
    },
    snapshotSub: {
      color: colors.textMuted,
      fontSize: 12,
    },
    list: {
      marginTop: 8,
      gap: 10,
    },
    rowCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    rankBadge: {
      width: 38,
      height: 38,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    rankText: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 12,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
    },
    avatarFallback: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarFallbackText: {
      color: colors.textPrimary,
      fontWeight: "700",
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowName: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 14,
    },
    rowMeta: {
      color: colors.textMuted,
      fontSize: 12,
    },
    tierPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 4,
      backgroundColor: colors.surface,
    },
    tierText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "capitalize",
    },
  });
