"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { useAppSettings } from "@/lib/appSettings";
import { useAuth } from "@/context/AuthContext";
import { getAdminStatus } from "@/lib/adminStatus";
import { resolveLocale, t } from "@/lib/i18n";

export default function Footer() {
  const year = new Date().getFullYear();

  const { theme, locale } = useAppSettings();
  const { user, loading: authLoading } = useAuth();
  const lang = resolveLocale(locale);
  const isLight = theme === "light";
  const [staffHref, setStaffHref] = useState("/signin?next=/admin");
  const neuroAnalysisHref = user ? "/neuro-analysis" : "/signin?next=/neuro-analysis";

  const footerClass = isLight
    ? "w-full bg-slate-50/90 text-slate-600 px-6 md:px-10 lg:px-16 py-8 border-t border-slate-200 mt-auto"
    : "w-full bg-[#0b0c14] text-slate-300 px-6 md:px-10 lg:px-16 py-8 border-t border-slate-800 mt-auto";

  const brandLogoSrc = "/neurotrader-logo.svg";

  useEffect(() => {
    let cancelled = false;

    async function syncStaffHref() {
      if (authLoading) return;

      if (!user) {
        setStaffHref("/signin?next=/admin");
        return;
      }

      try {
        const adminStatus = await getAdminStatus();
        if (cancelled) return;

        setStaffHref(adminStatus.isAdmin ? "/admin" : "/signin?next=/admin");
      } catch (error) {
        if (!cancelled) {
          setStaffHref("/signin?next=/admin");
        }
      }
    }

    void syncStaffHref();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  return (
    <footer className={footerClass}>
      <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-10">
        {/* Col 1: Logo + description */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <img
              src={brandLogoSrc}
              alt="Neuro Trader"
              className="h-10 md:h-12 w-auto object-contain"
              draggable={false}
            />
          </div>
          <p className={isLight ? "text-[12px] text-slate-500 leading-relaxed" : "text-[12px] text-slate-400 leading-relaxed"}>
            {t("footer.description", lang)}
          </p>
        </div>

        {/* Col 2: Links */}
        <div className="flex flex-wrap justify-between gap-6 text-[13px]">
          <div className="flex flex-col gap-2">
            <Link href="/signin" className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}>
              {t("footer.links.login", lang)}
            </Link>
            <Link
              href={staffHref}
              className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}
            >
              {t("footer.links.staff", lang)}
            </Link>
            <Link
              href={neuroAnalysisHref}
              className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}
            >
              {t("footer.links.neuroAnalysis", lang)}
            </Link>
            <Link href="/blog" className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}>
              {t("footer.links.blog", lang)}
            </Link>
            <Link href="/pricing" className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}>
              {t("footer.links.pricing", lang)}
            </Link>
          </div>

          <div className="flex flex-col gap-2">
            <Link href="/contact" className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}>
              {t("footer.links.contact", lang)}
            </Link>
            <Link href="/privacy" className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}>
              {t("footer.links.privacy", lang)}
            </Link>
            <Link href="/terms" className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}>
              {t("footer.links.terms", lang)}
            </Link>
            <Link href="/about" className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}>
              {t("footer.links.about", lang)}
            </Link>
          </div>
        </div>

      </div>

      <div className={isLight ? "mt-8 border-t border-slate-200 pt-4 text-[11px] text-slate-500 text-center" : "mt-8 border-t border-slate-800 pt-4 text-[11px] text-slate-500 text-center"}>
        © {year} {t("footer.copyright", lang)}
      </div>
    </footer>
  );
}
