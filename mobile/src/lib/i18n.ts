export type AppLanguage = "en" | "es";

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  if (value === "es") return "es";
  return "en";
}

export function t(lang: AppLanguage, en: string, es: string) {
  return lang === "es" ? es : en;
}
