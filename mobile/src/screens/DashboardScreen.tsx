import { Image, StyleSheet, Text, View } from "react-native";

import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";
import { COLORS } from "../theme";

type DashboardScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

export function DashboardScreen({ onOpenModule }: DashboardScreenProps) {
  return (
    <ScreenScaffold
      title="Performance Snapshot"
      subtitle="MVP móvil separado del web app. Aquí vas a ver calendario, estadísticas y paneles clave."
    >
      <View style={styles.logoWrap}>
        <Image
          source={require("../../assets/apple-touch-icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
      <ModuleTile
        title="Calendar progress"
        description="Ver días, resultado diario y abrir journal por fecha."
        iconName="calendar-outline"
        onPress={() =>
          onOpenModule(
            "Calendar progress",
            "Integración pendiente: calendar + open journal date con el mismo backend del web app."
          )
        }
      />
      <ModuleTile
        title="Analytics & statistics"
        description="KPIs, win rate, hold time, expectancy y métricas de disciplina."
        iconName="stats-chart-outline"
        onPress={() =>
          onOpenModule(
            "Analytics & statistics",
            "Integración pendiente: usar los KPIs actuales y la misma lógica de filtros por rango."
          )
        }
      />
      <ModuleTile
        title="Balance chart"
        description="Curva de equity y comportamiento por periodos."
        iconName="trending-up-outline"
        onPress={() =>
          onOpenModule(
            "Balance chart",
            "Integración pendiente: consumir series del endpoint /api/account/series."
          )
        }
      />
      <ModuleTile
        title="Cashflow"
        description="Depósitos y retiros con resumen del rango."
        iconName="wallet-outline"
        onPress={() =>
          onOpenModule(
            "Cashflow",
            "Integración pendiente: usar cashflows de Supabase y métricas agregadas de overview."
          )
        }
      />
      <ModuleTile
        title="Profit & Loss Track"
        description="Seguimiento de ingresos/costos y neto del negocio."
        iconName="cash-outline"
        onPress={() =>
          onOpenModule(
            "Profit & Loss Track",
            "Integración pendiente: conectar vista móvil a /performance/profit-loss-track."
          )
        }
      />
      <View style={styles.noteBox}>
        <Text style={styles.noteTitle}>Scope de fase 1</Text>
        <Text style={styles.noteText}>
          Esta app vive en /mobile y no toca el código web. Import de archivos queda para desktop/web.
        </Text>
      </View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  logoWrap: {
    alignItems: "center",
    marginBottom: 4,
  },
  logo: {
    width: 72,
    height: 72,
  },
  noteBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 12,
    marginTop: 4,
    gap: 4,
  },
  noteTitle: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  noteText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
