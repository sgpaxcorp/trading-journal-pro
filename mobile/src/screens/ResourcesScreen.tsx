import { ModuleTile } from "../components/ModuleTile";
import { ScreenScaffold } from "../components/ScreenScaffold";

type ResourcesScreenProps = {
  onOpenModule: (title: string, description: string) => void;
};

export function ResourcesScreen({ onOpenModule }: ResourcesScreenProps) {
  return (
    <ScreenScaffold
      title="Resources"
      subtitle="Acceso móvil a la biblioteca para guardar y consultar links, libros y notas."
    >
      <ModuleTile
        title="Library"
        description="YouTube, Amazon, libros, links y texto copiado."
        iconName="library-outline"
        onPress={() =>
          onOpenModule(
            "Library",
            "Integración pendiente: conectar tabla ntj_resource_library_items para CRUD móvil."
          )
        }
      />
      <ModuleTile
        title="Quick save"
        description="Guardar recurso desde share sheet (fase siguiente)."
        iconName="share-social-outline"
        onPress={() =>
          onOpenModule(
            "Quick save",
            "Plan: deep link/share extension para guardar URLs desde Safari o YouTube."
          )
        }
      />
    </ScreenScaffold>
  );
}
