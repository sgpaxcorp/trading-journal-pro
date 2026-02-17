import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";

type MoreScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

export function MoreScreen({ onOpenModule }: MoreScreenProps) {
  return (
    <ScreenScaffold
      title="Other modules"
      subtitle="Todo lo demás queda aquí: resources, forum, global ranking, notebook, cashflow, P&L track y balance chart."
    >
      <ModuleTile
        title="Journal"
        description="Ver y editar Journal Date (pre-market, inside trade, after trade)."
        iconName="reader-outline"
        onPress={() =>
          onOpenModule(
            "Journal",
            "Integración pendiente: versión móvil de /journal/[date] con editor optimizado."
          )
        }
      />
      <ModuleTile
        title="Resources Library"
        description="Guardar links YouTube, libros, Amazon y notas."
        iconName="library-outline"
        onPress={() =>
          onOpenModule(
            "Resources Library",
            "Integración pendiente: CRUD móvil contra ntj_resource_library_items."
          )
        }
      />
      <ModuleTile
        title="Forum"
        description="Comunidad, threads y respuestas."
        iconName="chatbubbles-outline"
        onPress={() => onOpenModule("Forum", "Integración pendiente: foro móvil con listado + detalle de thread.")}
      />
      <ModuleTile
        title="Global ranking"
        description="Leaderboard y perfiles."
        iconName="podium-outline"
        onPress={() =>
          onOpenModule("Global ranking", "Integración pendiente: tabla global con navegación a perfil.")
        }
      />
      <ModuleTile
        title="Notebook"
        description="Leer y escribir notas completas."
        iconName="book-outline"
        onPress={() =>
          onOpenModule("Notebook", "Integración pendiente: ntj_notebook_* + editor rico móvil.")
        }
      />
      <ModuleTile
        title="Balance chart"
        description="Curva de equity y evolución temporal."
        iconName="trending-up-outline"
        onPress={() =>
          onOpenModule(
            "Balance chart",
            "Integración pendiente: endpoint /api/account/series en versión móvil."
          )
        }
      />
      <ModuleTile
        title="Cashflow"
        description="Depósitos y retiros por cuenta."
        iconName="wallet-outline"
        onPress={() =>
          onOpenModule(
            "Cashflow",
            "Integración pendiente: módulo /performance/plan adaptado a iPhone."
          )
        }
      />
      <ModuleTile
        title="Profit & Loss Track"
        description="Ingresos, costos y neto del negocio."
        iconName="cash-outline"
        onPress={() =>
          onOpenModule(
            "Profit & Loss Track",
            "Integración pendiente: módulo /performance/profit-loss-track adaptado a iPhone."
          )
        }
      />
      <ModuleTile
        title="Audit"
        description="Ordenes, compliance, score y evidencias."
        iconName="shield-checkmark-outline"
        onPress={() =>
          onOpenModule("Audit", "Integración pendiente: espejo de /audit/order-history en versión móvil.")
        }
      />
      <ModuleTile
        title="Imports"
        description="No recomendado en móvil (archivo pesado/estructura)."
        iconName="document-attach-outline"
        onPress={() =>
          onOpenModule(
            "Imports",
            "Decisión de producto: mantener import de broker en web/desktop para evitar fricción móvil."
          )
        }
      />
    </ScreenScaffold>
  );
}
