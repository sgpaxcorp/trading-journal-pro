import { getHelpLocale } from "../_lib/locale";
import HelpDoc from "../_components/HelpDoc";

export default async function HelpGrowthPlanPage() {
  const lang = await getHelpLocale();
  return <HelpDoc source={`docs/user-manual/${lang}/growth-plan.md`} />;
}
