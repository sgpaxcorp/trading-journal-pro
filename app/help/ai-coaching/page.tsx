import { getHelpLocale } from "../_lib/locale";
import HelpDoc from "../_components/HelpDoc";

export default async function HelpAiCoachingPage() {
  const lang = await getHelpLocale();
  return <HelpDoc source={`docs/user-manual/${lang}/ai-coaching.md`} />;
}
