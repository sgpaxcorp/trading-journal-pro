import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";

type CalendarScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

export function CalendarScreen({ onOpenModule }: CalendarScreenProps) {
  return (
    <ScreenScaffold
      title="P&L Calendar"
      subtitle="Aquí va el calendario del P&L como el widget del dashboard, optimizado para iPhone."
    >
      <ModuleTile
        title="Month calendar"
        description="Vista mensual con celdas por día (P&L, open journal, holidays)."
        iconName="calendar-clear-outline"
        onPress={() =>
          onOpenModule(
            "Month calendar",
            "Integración pendiente: reproducir JournalGrid/widget de dashboard con layout móvil."
          )
        }
      />
      <ModuleTile
        title="Open day journal"
        description="Tap en un día para abrir ese Journal Date."
        iconName="open-outline"
        onPress={() =>
          onOpenModule(
            "Open day journal",
            "Integración pendiente: deep link al journal de esa fecha con navegación móvil."
          )
        }
      />
      <ModuleTile
        title="Weekly context"
        description="W number y resumen semanal visible como en dashboard."
        iconName="albums-outline"
        onPress={() =>
          onOpenModule(
            "Weekly context",
            "Integración pendiente: mostrar week blocks, streaks y summary por semana."
          )
        }
      />
    </ScreenScaffold>
  );
}
