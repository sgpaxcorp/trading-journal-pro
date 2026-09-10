import "server-only";

import { cookies, headers } from "next/headers";

export type RequestLocale = "en" | "es";

export async function getRequestLocale(): Promise<RequestLocale> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("nt_locale")?.value;

  if (cookieLocale === "es" || cookieLocale === "en") {
    return cookieLocale;
  }

  const headerStore = await headers();
  const browserLanguages = (headerStore.get("accept-language") ?? "").toLowerCase();
  return browserLanguages.includes("es") ? "es" : "en";
}
