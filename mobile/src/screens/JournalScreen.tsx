import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";
import type { OpenModuleFn } from "../lib/moduleNavigation";

type JournalScreenProps = {
  onOpenModule: OpenModuleFn;
};

export function JournalScreen({ onOpenModule }: JournalScreenProps) {
  return (
    <ScreenScaffold
      title="Execution Journal mobile"
      subtitle="Objetivo: registrar rápido pre-market, inside trade y after trade desde iPhone."
    >
      <ModuleTile
        title="Daily execution record"
        description="Abrir fecha y editar el registro de ejecución."
        iconName="document-text-outline"
        onPress={() =>
          onOpenModule(
            "Daily execution record",
            "Integración pendiente: reutilizar modelo de la página /journal/[date] como registro de ejecución."
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
            "Plan: agregar editor optimizado móvil + timestamp para que Business AI Coaching lo use."
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
