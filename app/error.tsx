"use client";

import { useEffect } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const L = (en: string, es: string) => (lang === "es" ? es : en);

  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Neuro Trader</p>
        <h1 className="mt-3 text-2xl font-semibold">{L("Something went wrong", "Algo salió mal")}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {L(
            "An unexpected error occurred. You can try loading this view again.",
            "Tuvimos un error inesperado. Puedes intentar recargar esta vista."
          )}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-6 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          {L("Try again", "Reintentar")}
        </button>
      </div>
    </div>
  );
}
