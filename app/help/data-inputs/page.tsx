import HelpDoc from "../_components/HelpDoc";
import { getHelpLocale } from "../_lib/locale";

export default async function HelpDataInputsPage() {
  const lang = await getHelpLocale();
  return <HelpDoc source={`docs/user-manual/${lang}/data-inputs.md`} />;
}
