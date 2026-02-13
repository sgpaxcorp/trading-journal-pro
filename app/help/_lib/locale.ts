import { cookies, headers } from "next/headers";

export type HelpLocale = "en" | "es";

async function resolveMaybePromise<T>(value: T | Promise<T>): Promise<T> {
  if (value && typeof (value as Promise<T>).then === "function") {
    return await (value as Promise<T>);
  }
  return value as T;
}

export async function getHelpLocale(): Promise<HelpLocale> {
  const cookieStore = await resolveMaybePromise(cookies());
  const cookieLocale = cookieStore?.get?.("nt_locale")?.value;
  if (cookieLocale === "es") return "es";
  if (cookieLocale === "en") return "en";

  const headersStore = await resolveMaybePromise(headers());
  const accept = headersStore?.get?.("accept-language") ?? "";
  return accept.toLowerCase().includes("es") ? "es" : "en";
}
