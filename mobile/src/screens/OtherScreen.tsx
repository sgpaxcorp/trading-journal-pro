import { useMemo } from "react";

import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/ThemeContext";
import { type ThemeColors } from "../theme";
import { Linking, StyleSheet, View } from "react-native";

type OtherScreenProps = {
  onOpenModule: (title: string, description: string) => void;
  onOpenSettings: () => void;
  onOpenGlobalRanking: () => void;
  onOpenTrophies: () => void;
  onOpenNotebook: () => void;
  onOpenChallenges: () => void;
  onOpenJournalDate: () => void;
};

const WEB_BASE = "https://www.neurotrader-journal.com";

export function OtherScreen({
  onOpenModule,
  onOpenSettings,
  onOpenGlobalRanking,
  onOpenTrophies,
  onOpenNotebook,
  onOpenChallenges,
  onOpenJournalDate,
}: OtherScreenProps) {
  const { language } = useLanguage();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScreenScaffold
      title={t(language, "Other", "Otros")}
      subtitle={t(
        language,
        "Quick access to settings, resources, and ranking tools.",
        "Acceso rápido a ajustes, recursos y ranking."
      )}
    >
      <View style={styles.section}>
        <ModuleTile
          title={t(language, "Settings", "Ajustes")}
          description={t(
            language,
            "Profile, security, notifications, and appearance.",
            "Perfil, seguridad, notificaciones y apariencia."
          )}
          iconName="settings-outline"
          onPress={onOpenSettings}
        />
        <ModuleTile
          title={t(language, "Journal", "Journal")}
          description={t(
            language,
            "Open your daily journal entries from mobile.",
            "Abre tus entradas diarias del journal."
          )}
          iconName="reader-outline"
          onPress={onOpenJournalDate}
        />
        <ModuleTile
          title={t(language, "Global ranking", "Ranking global")}
          description={t(
            language,
            "See your position among active traders.",
            "Mira tu posición entre traders activos."
          )}
          iconName="trophy-outline"
          onPress={onOpenGlobalRanking}
        />
        <ModuleTile
          title={t(language, "Trophies", "Trofeos")}
          description={t(
            language,
            "See earned and locked trophies.",
            "Mira trofeos ganados y bloqueados."
          )}
          iconName="medal-outline"
          onPress={onOpenTrophies}
        />
        <ModuleTile
          title={t(language, "Notebook", "Notebook")}
          description={t(
            language,
            "Review your saved notebook entries.",
            "Revisa tus notas guardadas."
          )}
          iconName="document-text-outline"
          onPress={onOpenNotebook}
        />
        <ModuleTile
          title={t(language, "Challenges", "Retos")}
          description={t(
            language,
            "Track your challenge progress and streaks.",
            "Sigue tu progreso y rachas de retos."
          )}
          iconName="flame-outline"
          onPress={onOpenChallenges}
        />
        <ModuleTile
          title={t(language, "About us", "Sobre nosotros")}
          description={t(
            language,
            "Read the NeuroTrader Journal story.",
            "Lee la historia de NeuroTrader Journal."
          )}
          iconName="information-circle-outline"
          onPress={() => Linking.openURL(`${WEB_BASE}/about`)}
        />
        <ModuleTile
          title={t(language, "Terms & conditions", "Términos y condiciones")}
          description={t(
            language,
            "Read the platform terms.",
            "Lee los términos de la plataforma."
          )}
          iconName="document-text-outline"
          onPress={() => Linking.openURL(`${WEB_BASE}/terms`)}
        />
        <ModuleTile
          title={t(language, "Privacy policy", "Política de privacidad")}
          description={t(
            language,
            "Review the privacy policy.",
            "Revisa la política de privacidad."
          )}
          iconName="shield-checkmark-outline"
          onPress={() => Linking.openURL(`${WEB_BASE}/privacy`)}
        />
      </View>
    </ScreenScaffold>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    section: {
      gap: 12,
    },
  });
