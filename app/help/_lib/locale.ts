import { getRequestLocale } from "@/lib/requestLocale";

export type HelpLocale = "en" | "es";

export async function getHelpLocale(): Promise<HelpLocale> {
  return getRequestLocale();
}
