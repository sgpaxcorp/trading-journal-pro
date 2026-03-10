import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { ScreenScaffold } from "../components/ScreenScaffold";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import type { ThemeColors } from "../theme";
import { supabaseMobile } from "../lib/supabase";
import { useSupabaseUser } from "../lib/useSupabaseUser";

const CHALLENGE_CATALOG: Record<
  string,
  { title: string; description: string; duration: number }
> = {
  "process-consistency": {
    title: "Process Consistency",
    description: "Stack rule-respecting sessions and journal everything.",
    duration: 14,
  },
  "max-loss-discipline": {
    title: "Max Loss Discipline",
    description: "Respect max loss and avoid digging deeper.",
    duration: 10,
  },
  "journal-streak": {
    title: "Journaling Streak",
    description: "Journal consistently, no matter the PnL.",
    duration: 21,
  },
  "no-revenge": {
    title: "No Revenge Trading",
    description: "Reset after losses and avoid revenge trades.",
    duration: 12,
  },
};

type ChallengeRun = {
  id: string;
  challenge_id: string;
  status: string;
  duration_days: number;
  required_green_days: number;
  days_tracked: number;
  process_green_days: number;
  max_loss_breaks: number;
  xp_earned: number;
  current_streak: number;
  best_streak: number;
  last_tracked_date: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

export function ChallengesScreen() {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const user = useSupabaseUser();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [runs, setRuns] = useState<ChallengeRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseMobile;
    const userId = user?.id;
    if (!sb || !userId) return;
    const supabase = sb;

    let cancelled = false;

    async function loadChallenges(isRefresh = false) {
      if (!isRefresh) {
        setLoading(true);
      }
      setError(null);

      const { data, error: runErr } = await supabase
        .from("challenge_runs")
        .select(
          "id,challenge_id,status,duration_days,required_green_days,days_tracked,process_green_days,max_loss_breaks,xp_earned,current_streak,best_streak,last_tracked_date,started_at,ended_at,created_at"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!cancelled) {
        if (runErr) {
          console.error("[ChallengesScreen] load error:", runErr);
          setError(
            t(
              language,
              "We couldn't load challenges yet.",
              "No pudimos cargar los retos aún."
            )
          );
          setRuns([]);
        } else {
          const latestByChallenge: Record<string, ChallengeRun> = {};
          for (const row of (data as ChallengeRun[]) || []) {
            if (!latestByChallenge[row.challenge_id]) {
              latestByChallenge[row.challenge_id] = row;
            }
          }
          setRuns(Object.values(latestByChallenge));
        }
        if (!isRefresh) {
          setLoading(false);
        }
      }
    }

    void loadChallenges();

    return () => {
      cancelled = true;
    };
  }, [language, user?.id]);

  async function handleRefresh() {
    if (!supabaseMobile || !user?.id) return;
    setRefreshing(true);
    setError(null);
    try {
      const { data, error: runErr } = await supabaseMobile
        .from("challenge_runs")
        .select(
          "id,challenge_id,status,duration_days,required_green_days,days_tracked,process_green_days,max_loss_breaks,xp_earned,current_streak,best_streak,last_tracked_date,started_at,ended_at,created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (runErr) {
        setError(
          t(
            language,
            "We couldn't load challenges yet.",
            "No pudimos cargar los retos aún."
          )
        );
        setRuns([]);
      } else {
        const latestByChallenge: Record<string, ChallengeRun> = {};
        for (const row of (data as ChallengeRun[]) || []) {
          if (!latestByChallenge[row.challenge_id]) {
            latestByChallenge[row.challenge_id] = row;
          }
        }
        setRuns(Object.values(latestByChallenge));
      }
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <ScreenScaffold
      title={t(language, "Challenges", "Retos")}
      subtitle={t(
        language,
        "Track your active challenges and streaks.",
        "Sigue tus retos activos y rachas."
      )}
      refreshing={refreshing}
      onRefresh={handleRefresh}
    >
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>
            {t(language, "Loading challenges…", "Cargando retos…")}
          </Text>
        </View>
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : (
        <View style={styles.list}>
          {runs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {t(language, "No challenges yet", "Aún no hay retos")}
              </Text>
              <Text style={styles.emptySubtitle}>
                {t(
                  language,
                  "Start a challenge on the web and your progress will show here.",
                  "Inicia un reto en la web y tu progreso aparecerá aquí."
                )}
              </Text>
            </View>
          ) : (
            runs.map((run) => {
              const meta = CHALLENGE_CATALOG[run.challenge_id] || {
                title: run.challenge_id,
                description: "",
                duration: run.duration_days,
              };
              const daysTarget = run.duration_days || meta.duration || 0;
              const progressLabel = daysTarget
                ? `${run.days_tracked}/${daysTarget}`
                : `${run.days_tracked}`;
              const greenTarget = run.required_green_days || 0;
              const greenLabel = greenTarget
                ? `${run.process_green_days}/${greenTarget}`
                : `${run.process_green_days}`;

              return (
                <View key={run.id} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{meta.title}</Text>
                    <View style={styles.statusPill}>
                      <Text style={styles.statusText}>{run.status}</Text>
                    </View>
                  </View>
                  {meta.description ? (
                    <Text style={styles.cardDesc}>{meta.description}</Text>
                  ) : null}
                  <View style={styles.metricRow}>
                    <Metric label={t(language, "Days", "Días")} value={progressLabel} styles={styles} />
                    <Metric label={t(language, "Green", "Verde")} value={greenLabel} styles={styles} />
                    <Metric label={t(language, "XP", "XP")} value={String(run.xp_earned ?? 0)} styles={styles} />
                  </View>
                  <View style={styles.metricRow}>
                    <Metric label={t(language, "Current streak", "Racha actual")} value={String(run.current_streak ?? 0)} styles={styles} />
                    <Metric label={t(language, "Best streak", "Mejor racha")} value={String(run.best_streak ?? 0)} styles={styles} />
                    <Metric label={t(language, "Max loss breaks", "Rupturas max loss")} value={String(run.max_loss_breaks ?? 0)} styles={styles} />
                  </View>
                  {run.last_tracked_date ? (
                    <Text style={styles.cardMeta}>
                      {t(language, "Last tracked", "Último día")}: {run.last_tracked_date}
                    </Text>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      )}
    </ScreenScaffold>
  );
}

type MetricProps = {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
};

function Metric({ label, value, styles }: MetricProps) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
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
    list: {
      gap: 12,
    },
    emptyCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      padding: 16,
      gap: 6,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontWeight: "700",
      fontSize: 15,
    },
    emptySubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
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
      fontSize: 14,
      flex: 1,
    },
    statusPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      textTransform: "capitalize",
    },
    cardDesc: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    metricRow: {
      flexDirection: "row",
      gap: 8,
      flexWrap: "wrap",
    },
    metricCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 8,
      minWidth: 90,
      flexGrow: 1,
      gap: 4,
    },
    metricLabel: {
      color: colors.textMuted,
      fontSize: 11,
    },
    metricValue: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "700",
    },
    cardMeta: {
      color: colors.textMuted,
      fontSize: 11,
    },
  });
