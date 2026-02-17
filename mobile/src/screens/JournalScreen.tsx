import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";

type JournalScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

export function JournalScreen({ onOpenModule }: JournalScreenProps) {
  return (
    <ScreenScaffold
      title="Journal mobile"
      subtitle="Objetivo: escribir rápido en pre-market, inside trade y after trade desde iPhone."
    >
      <ModuleTile
        title="Daily journal"
        description="Abrir fecha y editar widgets del journal."
        iconName="document-text-outline"
        onPress={() =>
          onOpenModule(
            "Daily journal",
            "Integración pendiente: reutilizar modelo de la página /journal/[date] sin importar archivos."
          )
        }
      />
      <ModuleTile
        title="Inside trade notes"
        description="Entrada rápida en medio de la operación."
        iconName="pencil-outline"
        onPress={() =>
          onOpenModule(
            "Inside trade notes",
            "Plan: agregar editor optimizado móvil + timestamp para que AI Coaching lo use."
          )
        }
      />
      <ModuleTile
        title="Voice capture"
        description="Registrar idea por voz y convertir a texto."
        iconName="mic-outline"
        onPress={() =>
          onOpenModule(
            "Voice capture",
            "Plan fase siguiente: dictado/transcripción para notas inside trade sin romper flujo."
          )
        }
      />
    </ScreenScaffold>
  );
}
