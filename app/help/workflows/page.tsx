import HelpDoc from "../_components/HelpDoc";
import { getHelpLocale } from "../_lib/locale";

export default async function HelpWorkflowsPage() {
  const lang = await getHelpLocale();
  return <HelpDoc source={`docs/user-manual/${lang}/workflows.md`} />;
}
