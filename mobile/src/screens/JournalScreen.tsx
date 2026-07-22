import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";
import { useLanguage } from "../lib/LanguageContext";
import { t } from "../lib/i18n";
import type { OpenModuleFn } from "../lib/moduleNavigation";

type JournalScreenProps = {
  onOpenModule: OpenModuleFn;
};

export function JournalScreen({ onOpenModule }: JournalScreenProps) {
  const { language } = useLanguage();
  return (
    <ScreenScaffold
      title={t(language, "Execution Record", "Registro de Ejecución")}
      subtitle={t(
        language,
        "Fast mobile capture for the facts of the trading business: premarket, live execution, after-trade notes, and evidence.",
        "Captura móvil rápida de los hechos de la empresa de trading: premarket, ejecución en vivo, notas post-trade y evidencia."
      )}
    >
      <ModuleTile
        title={t(language, "Daily business record", "Registro empresarial diario")}
        description={t(
          language,
          "Open a date and capture the execution record for the business.",
          "Abre una fecha y captura el registro de ejecución del negocio."
        )}
        iconName="document-text-outline"
        onPress={() =>
          onOpenModule(
            t(language, "Daily business record", "Registro empresarial diario"),
            t(
              language,
              "This mobile flow opens the execution evidence model used to review the trading business with consistency.",
              "Este flujo móvil abre el modelo de evidencia de ejecución usado para revisar la empresa de trading con consistencia."
            )
          )
        }
      />
      <ModuleTile
        title={t(language, "Live execution notes", "Notas de ejecución en vivo")}
        description={t(
          language,
          "Timestamped notes while the trade is active, so the business has evidence later.",
          "Notas con timestamp mientras el trade está activo, para que el negocio tenga evidencia luego."
        )}
        iconName="pencil-outline"
        onPress={() =>
          onOpenModule(
            t(language, "Live execution notes", "Notas de ejecución en vivo"),
            t(
              language,
              "Use this to preserve context for Business AI Coaching without leaving the trading flow.",
              "Úsalo para preservar contexto para Business AI Coaching sin salir del flujo de trading."
            )
          )
        }
      />
      <ModuleTile
        title={t(language, "Voice business capture", "Captura empresarial por voz")}
        description={t(
          language,
          "Capture a business observation by voice and turn it into reviewable notes.",
          "Captura una observación del negocio por voz y conviértela en notas revisables."
        )}
        iconName="mic-outline"
        onPress={() =>
          onOpenModule(
            t(language, "Voice business capture", "Captura empresarial por voz"),
            t(
              language,
              "Next phase: mobile dictation/transcription for live execution notes without breaking flow.",
              "Próxima fase: dictado/transcripción móvil para notas de ejecución en vivo sin romper el flujo."
            )
          )
        }
      />
    </ScreenScaffold>
  );
}
