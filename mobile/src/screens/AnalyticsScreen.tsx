import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";

type AnalyticsScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

export function AnalyticsScreen({ onOpenModule }: AnalyticsScreenProps) {
  return (
    <ScreenScaffold
      title="Analytics & Statistics"
      subtitle="Navegación móvil por los tabs de Analytics: overview, performance, risk, time, instruments, trades y statistics."
    >
      <ModuleTile
        title="Overview"
        description="Snapshot general: P&L, win rate, streaks, expectancy, deposits/withdrawals."
        iconName="analytics-outline"
        onPress={() =>
          onOpenModule(
            "Overview",
            "Integración pendiente: espejo del tab overview con cards mobile-first."
          )
        }
      />
      <ModuleTile
        title="Performance / Risk / Time"
        description="Subtabs para lectura rápida por bloque."
        iconName="pulse-outline"
        onPress={() =>
          onOpenModule(
            "Performance / Risk / Time",
            "Integración pendiente: tabs segmentados para no saturar pantalla pequeña."
          )
        }
      />
      <ModuleTile
        title="Instruments / Trades"
        description="Breakdown por símbolo/instrumento y detalles de ejecución."
        iconName="layers-outline"
        onPress={() =>
          onOpenModule(
            "Instruments / Trades",
            "Integración pendiente: tablas convertidas a cards + filtros táctiles."
          )
        }
      />
      <ModuleTile
        title="Statistics (KPI Library)"
        description="Todos los KPIs y explicación corta por métrica."
        iconName="stats-chart-outline"
        onPress={() =>
          onOpenModule(
            "Statistics (KPI Library)",
            "Integración pendiente: lista KPI optimizada para scroll móvil."
          )
        }
      />
    </ScreenScaffold>
  );
}
