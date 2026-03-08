import { getHelpLocale } from "../_lib/locale";
import HelpDoc from "../_components/HelpDoc";

export default async function HelpRulesAlarmsPage() {
  const lang = await getHelpLocale();
  return <HelpDoc source={`docs/user-manual/${lang}/rules-alarms.md`} />;
}
