"use client";

import { ArrowLeft } from "lucide-react";
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

  if (pathname === "/" || isHome) return null;

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(homeHref);
  };

  const backButtonClass = isLight
    ? "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white"
    : "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/30 bg-slate-950/65 text-emerald-300 transition hover:border-emerald-300 hover:bg-emerald-400/10 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

  return (
    <nav
      aria-label={lang === "es" ? "Navegación de página" : "Page navigation"}
      data-page-navigation-placement={placement}
      className="relative z-40 w-full print:hidden"
    >
      <div className="flex min-h-11 w-full items-center px-4 py-1 md:px-6 lg:px-8">
        <button
          type="button"
          onClick={handleBack}
          className={backButtonClass}
          aria-label={backLabel}
          title={backLabel}
        >
          <ArrowLeft aria-hidden="true" size={19} strokeWidth={2.2} />
        </button>
      </div>
    </nav>
  );
}
