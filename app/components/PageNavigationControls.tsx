"use client";

import { ArrowLeft, House } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function PageNavigationControls() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
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

  const buttonClass =
    "inline-flex h-9 min-w-9 items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-950 px-2.5 text-xs font-semibold text-slate-100 transition hover:border-emerald-400 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950";

  return (
    <nav
      aria-label={lang === "es" ? "Navegación de página" : "Page navigation"}
      className="relative z-[60] flex min-h-12 w-full items-center gap-2 border-b border-slate-800 bg-slate-950 px-4 py-1.5 print:hidden"
    >
      <button
        type="button"
        onClick={handleBack}
        className={buttonClass}
        aria-label={backLabel}
        title={backLabel}
      >
        <ArrowLeft aria-hidden="true" size={18} strokeWidth={2} />
        <span>{backLabel}</span>
      </button>

      {!isHome ? (
        <Link
          href={homeHref}
          className={buttonClass}
          aria-label={homeLabel}
          title={homeLabel}
        >
          <House aria-hidden="true" size={18} strokeWidth={2} />
          <span>{homeLabel}</span>
        </Link>
      ) : null}
    </nav>
  );
}
