"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type Props = {
  href: string;
  hideOn?: string[];     // rutas donde NO debe mostrarse. Soporta prefix match.
  label?: string;
  className?: string;
};

export default function GoToDashboard({
  href,
  hideOn = ["/dashboard"],
  label,
  className = "",
}: Props) {
  const pathname = usePathname() || "/";
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const resolvedLabel = label || L("Go to Dashboard", "Ir al dashboard");

  // Ocultar si el pathname hace match exacto o por prefijo con cualquiera en hideOn
  const shouldHide = useMemo(() => {
    return hideOn.some((p) => {
      if (!p) return false;
      // normaliza: quita trailing slash excepto raíz
      const norm = (s: string) => (s !== "/" && s.endsWith("/") ? s.slice(0, -1) : s);
      const a = norm(pathname);
      const b = norm(p);
      return a === b || a.startsWith(b + "/");
    });
  }, [pathname, hideOn]);

  if (shouldHide) return null;

  return (
    <Link
      href={href}
      aria-label={resolvedLabel}
      className={[
        "fixed right-6 bottom-6 z-9999",
        "inline-flex items-center gap-2",
        "rounded-full px-4 py-2",
        "bg-emerald-400 text-slate-950 font-semibold",
        "shadow-lg shadow-emerald-900/30 hover:bg-emerald-300",
        "transition-transform hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-emerald-300",
        className,
      ].join(" ")}
    >
      {/* Icono simple (→) */}
      <span className="inline-block">🏠</span>
      <span>{resolvedLabel}</span>
    </Link>
  );
}
