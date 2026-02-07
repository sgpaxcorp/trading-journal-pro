"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

import { useAppSettings, type AppLocale, type AppTheme } from "@/lib/appSettings";
import { resolveLocale, t } from "@/lib/i18n";

export default function AccountPreferencesPage() {
  const { user, loading } = useAuth() as any;
  const router = useRouter();
  const pathname = usePathname();

  // Auth guard
  useEffect(() => {
    if (!loading && !user) router.replace("/signin");
  }, [loading, user, router]);

  const { theme, setTheme, locale, setLocale, ready } = useAppSettings();
  const lang = useMemo(() => resolveLocale(locale), [locale]);

  const [msg, setMsg] = useState<string | null>(null);

  function isCurrent(href: string) {
    return pathname === href;
  }

  function onThemeChange(next: AppTheme) {
    setTheme(next);
    setMsg(t("prefs.hint.saved", lang));
    window.setTimeout(() => setMsg(null), 1800);
  }

  function onLocaleChange(next: AppLocale) {
    setLocale(next);
    setMsg(t("prefs.hint.saved", lang));
    window.setTimeout(() => setMsg(null), 1800);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="max-w-5xl mx-auto px-6 md:px-8 py-8 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
              {lang === "es" ? "Cuenta" : "Account"}
            </p>
            <h1 className="text-3xl font-semibold mt-1">
              {t("prefs.title", lang)}
            </h1>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              {t("prefs.subtitle", lang)}
            </p>
          </div>

          {msg && (
            <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
              {msg}
            </div>
          )}
        </header>

        {/* Tabs */}
        <nav className="flex flex-wrap gap-2 text-[12px] border-b border-slate-800 pb-2">
          <a
            href="/account"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/account")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            {t("account.settings", lang)}
          </a>

          <a
            href="/account/preferences"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/account/preferences")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            {t("account.preferences", lang)}
          </a>

          <a
            href="/account/password"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/account/password")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            {t("account.password", lang, "Change password")}
          </a>

          <a
            href="/billing"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/billing")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            {t("account.billing", lang, "Billing & subscription")}
          </a>

          <a
            href="/billing/history"
            className={`rounded-full px-3 py-1.5 ${
              isCurrent("/billing/history")
                ? "bg-emerald-500/15 text-emerald-200 border border-emerald-400/60"
                : "text-slate-300 border border-slate-700 hover:border-emerald-400 hover:text-emerald-200"
            } transition`}
          >
            {t("account.billingHistory", lang, "Billing history")}
          </a>
        </nav>

        <section className="grid gap-6 md:grid-cols-2">
          {/* Appearance */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">
              {t("prefs.appearance", lang)}
            </p>

            <h2 className="mt-2 text-lg font-semibold text-slate-50">
              {t("prefs.theme.label", lang)}
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              {lang === "es"
                ? "Cambia entre NeuroMode (oscuro) y Modo claro. El modo claro mantiene tus colores (verde, violeta y azul) pero con fondos claros y líneas grises."
                : "Switch between NeuroMode (dark) and Light mode. Light mode keeps your brand colors (green, violet, blue) with brighter backgrounds and soft gray lines."}
            </p>

            <div className="mt-4 inline-flex rounded-full border border-slate-700 bg-slate-950/70 p-1">
              <button
                type="button"
                onClick={() => onThemeChange("neuro")}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  theme === "neuro"
                    ? "bg-emerald-400 text-slate-950"
                    : "text-slate-200 hover:bg-slate-800"
                }`}
                disabled={!ready}
              >
                {t("prefs.theme.neuro", lang)}
              </button>
              <button
                type="button"
                onClick={() => onThemeChange("light")}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                  theme === "light"
                    ? "bg-sky-400 text-slate-950"
                    : "text-slate-200 hover:bg-slate-800"
                }`}
                disabled={!ready}
              >
                {t("prefs.theme.light", lang)}
              </button>
            </div>

            <p className="mt-3 text-[11px] text-slate-500">
              {t("prefs.hint.saved", lang)}
            </p>
          </div>

          {/* Language */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
            <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-300">
              {t("prefs.language", lang)}
            </p>

            <h2 className="mt-2 text-lg font-semibold text-slate-50">
              {t("prefs.language", lang)}
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              {lang === "es"
                ? "Selecciona tu idioma preferido. Si eliges Automático, se usará el idioma del navegador."
                : "Select your preferred language. If you choose Auto, we follow your browser language."}
            </p>

            <div className="mt-4">
              <label className="block text-[11px] text-slate-400 mb-1">
                {lang === "es" ? "Idioma" : "Language"}
              </label>

              <select
                value={locale}
                onChange={(e) => onLocaleChange(e.target.value as AppLocale)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                disabled={!ready}
              >
                <option value="auto">{t("prefs.language.auto", lang)}</option>
                <option value="en">{t("prefs.language.en", lang)}</option>
                <option value="es">{t("prefs.language.es", lang)}</option>
              </select>

              <p className="mt-2 text-[11px] text-slate-500">
                {lang === "es"
                  ? "Nota: esta preferencia se aplicará progresivamente en toda la interfaz. Por ahora también la usaremos como señal de idioma para el AI Coach."
                  : "Note: this preference will be rolled out progressively across the UI. For now, we also use it as a language hint for the AI Coach."}
              </p>
            </div>
          </div>
        </section>

        <div className="text-[11px] text-slate-500">
          {lang === "es"
            ? "Tip: si no ves el modo claro en algún componente, dime qué página es (ruta) y lo ajustamos."
            : "Tip: if you see a component that doesn’t look right in Light mode, send me the page route and we’ll tune it."}
        </div>
      </div>
    </main>
  );
}
