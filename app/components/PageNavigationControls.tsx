"use client";

import { ArrowLeft, House } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type PageNavigationControlsProps = {
  placement?: "global" | "header";
};

export default function PageNavigationControls({
  placement = "global",
}: PageNavigationControlsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { locale, theme } = useAppSettings();
  const lang = resolveLocale(locale);
  const isLight = theme === "light";
  const homeHref = user ? "/dashboard" : "/";
  const isHome = pathname === homeHref;
  const backLabel = lang === "es" ? "Atrás" : "Back";
  const homeLabel = user
    ? lang === "es"
      ? "Centro Empresarial"
      : "Business Center"
    : lang === "es"
      ? "Inicio"
      : "Home";

  if (pathname === "/") return null;

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(homeHref);
  };

  const buttonBase =
    "inline-flex h-9 min-w-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2";
  const backButtonClass = isLight
    ? `${buttonBase} border-slate-300 bg-white text-slate-700 hover:border-sky-500 hover:text-sky-700 focus-visible:ring-offset-white`
    : `${buttonBase} border-sky-400/35 bg-slate-950/70 text-slate-100 hover:border-sky-300 hover:bg-sky-400/10 hover:text-sky-200 focus-visible:ring-offset-slate-950`;
  const homeButtonClass = isLight
    ? `${buttonBase} border-emerald-600 bg-emerald-600 text-white hover:border-emerald-700 hover:bg-emerald-700 focus-visible:ring-offset-white`
    : `${buttonBase} border-emerald-300/70 bg-emerald-400 text-slate-950 shadow-sm shadow-emerald-950/30 hover:border-emerald-200 hover:bg-emerald-300 focus-visible:ring-offset-slate-950`;
  const shellClass = isLight
    ? "border-b border-slate-200 bg-slate-50/95"
    : "border-b border-emerald-400/15 bg-[#061126]/95";

  return (
    <nav
      aria-label={lang === "es" ? "Navegación de página" : "Page navigation"}
      data-page-navigation-placement={placement}
      className={`relative z-40 min-h-12 w-full print:hidden ${shellClass}`}
    >
      <div className="mx-auto flex min-h-12 w-full max-w-[1600px] items-center gap-2 px-4 py-1.5 md:px-6">
        <button
          type="button"
          onClick={handleBack}
          className={backButtonClass}
          aria-label={backLabel}
          title={backLabel}
        >
          <ArrowLeft aria-hidden="true" size={18} strokeWidth={2} />
          <span>{backLabel}</span>
        </button>

        {!isHome ? (
          <Link
            href={homeHref}
            className={homeButtonClass}
            aria-label={homeLabel}
            title={homeLabel}
          >
            <House aria-hidden="true" size={17} strokeWidth={2.2} />
            <span>{homeLabel}</span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
