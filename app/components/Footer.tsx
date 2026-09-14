"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BrainCircuit } from "lucide-react";

import { useAppSettings } from "@/lib/appSettings";
import { useAuth } from "@/context/AuthContext";
import { getAdminStatus } from "@/lib/adminStatus";
import { resolveLocale, t } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

export default function Footer() {
  const year = new Date().getFullYear();

  const { theme, locale } = useAppSettings();
  const { user, loading: authLoading } = useAuth();
  const lang = resolveLocale(locale);
  const isLight = theme === "light";
  const [staffHref, setStaffHref] = useState("/signin?next=/admin");
  const [neuroAnalysisAllowed, setNeuroAnalysisAllowed] = useState(false);
  const neuroAnalysisHref = user ? "/neuro-analysis" : "/signin?next=/neuro-analysis";

  const footerClass = isLight
    ? "mt-auto w-full border-t border-slate-200 bg-slate-50/95 text-slate-600"
    : "mt-auto w-full border-t border-emerald-400/15 bg-[#070b14] text-slate-300";
  const sectionLabelClass = isLight
    ? "text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500"
    : "text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500";
  const linkClass = isLight
    ? "text-[13px] text-slate-600 transition-colors hover:text-emerald-700"
    : "text-[13px] text-slate-300 transition-colors hover:text-emerald-300";

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

  useEffect(() => {
    let cancelled = false;

    async function checkNeuroAnalysisAccess() {
      if (authLoading || !user) {
        if (!cancelled) setNeuroAnalysisAllowed(false);
        return;
      }

      try {
        const { data } = await supabaseBrowser.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) {
          if (!cancelled) setNeuroAnalysisAllowed(false);
          return;
        }
        const res = await fetch("/api/smart-tools/access", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!cancelled) setNeuroAnalysisAllowed(Boolean(res.ok && json?.allowed));
      } catch {
        if (!cancelled) setNeuroAnalysisAllowed(false);
      }
    }

    void checkNeuroAnalysisAccess();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id]);

  return (
    <footer className={footerClass}>
      <div className="mx-auto w-full max-w-[1440px] px-6 py-8 md:px-10 lg:px-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-[minmax(0,1.55fr)_minmax(240px,0.75fr)_minmax(180px,0.45fr)] lg:gap-12">
          <div>
            <img
              src={brandLogoSrc}
              alt="Neuro Trader"
              className="h-12 w-auto object-contain md:h-14"
              draggable={false}
            />
            <p
              className={`mt-3 max-w-2xl text-[12px] leading-5 ${
                isLight ? "text-slate-500" : "text-slate-400"
              }`}
            >
              {t("footer.description", lang)}
            </p>
            <p className={`mt-3 text-[12px] font-semibold ${isLight ? "text-emerald-700" : "text-emerald-300"}`}>
              {t("footer.corePromise", lang)}
            </p>
          </div>

          <div>
            <p className={sectionLabelClass}>
              {neuroAnalysisAllowed
                ? t("footer.groups.privateResearch", lang)
                : lang === "es"
                  ? "Plataforma"
                  : "Platform"}
            </p>
            {neuroAnalysisAllowed ? (
              <Link
                href={neuroAnalysisHref}
                className={`group mt-3 flex items-center gap-3 border-l-2 px-3 py-2 transition-colors ${
                  isLight
                    ? "border-emerald-600 bg-emerald-50/80 hover:bg-emerald-100"
                    : "border-emerald-400 bg-emerald-400/5 hover:bg-emerald-400/10"
                }`}
              >
                <BrainCircuit
                  aria-hidden="true"
                  size={20}
                  className={isLight ? "shrink-0 text-emerald-700" : "shrink-0 text-emerald-300"}
                />
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] font-bold ${isLight ? "text-slate-900" : "text-slate-100"}`}>
                    {t("footer.links.neuroAnalysis", lang)}
                  </span>
                  <span className={isLight ? "block text-[11px] text-slate-500" : "block text-[11px] text-slate-400"}>
                    {t("footer.neuroAnalysisHint", lang)}
                  </span>
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  size={16}
                  className={isLight ? "shrink-0 text-emerald-700" : "shrink-0 text-emerald-300"}
                />
              </Link>
            ) : null}
            <div className={`${neuroAnalysisAllowed ? "mt-4" : "mt-3"} grid grid-cols-2 gap-x-5 gap-y-2`}>
              <Link href="/signin" className={linkClass}>{t("footer.links.login", lang)}</Link>
              <Link href="/pricing" className={linkClass}>{t("footer.links.pricing", lang)}</Link>
              <Link href="/blog" className={linkClass}>{t("footer.links.blog", lang)}</Link>
              <Link href={staffHref} className={linkClass}>{t("footer.links.staff", lang)}</Link>
            </div>
          </div>

          <div>
            <p className={sectionLabelClass}>{t("footer.groups.company", lang)}</p>
            <div className="mt-3 flex flex-col gap-2.5">
              <Link href="/contact" className={linkClass}>{t("footer.links.contact", lang)}</Link>
              <Link href="/privacy" className={linkClass}>{t("footer.links.privacy", lang)}</Link>
              <Link href="/terms" className={linkClass}>{t("footer.links.terms", lang)}</Link>
              <Link href="/about" className={linkClass}>{t("footer.links.about", lang)}</Link>
            </div>
          </div>
        </div>

        <div
          className={`mt-7 border-t pt-4 text-center text-[11px] ${
            isLight ? "border-slate-200 text-slate-500" : "border-slate-800 text-slate-500"
          }`}
        >
          © {year} {t("footer.copyright", lang)}
        </div>
      </div>
    </footer>
  );
}
