"use client";

import Link from "next/link";
import {
  FaInstagram,
  FaLinkedinIn,
  FaFacebookF,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";

import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale, t } from "@/lib/i18n";

export default function Footer() {
  const year = new Date().getFullYear();

  const { theme, locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isLight = theme === "light";

  const footerClass = isLight
    ? "w-full bg-slate-50/90 text-slate-600 px-7 md:px-12 py-8 border-t border-slate-200 mt-auto"
    : "w-full bg-[#0b0c14] text-slate-300 px-7 md:px-12 py-8 border-t border-slate-800 mt-auto";

  const socialBtnClass = isLight
    ? "p-2 rounded-md bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 hover:border-slate-300 transition"
    : "p-2 rounded-md bg-slate-900 hover:bg-slate-800 transition";

  const brandChipClass = isLight
    ? "h-7 w-7 rounded-md bg-emerald-500/90 flex items-center justify-center text-white text-xs font-black"
    : "h-7 w-7 rounded-md bg-emerald-400/90 flex items-center justify-center text-slate-950 text-xs font-black";

  const brandNameClass =
    "text-sm md:text-base font-semibold tracking-tight bg-linear-to-r from-emerald-400 via-sky-400 to-indigo-400 text-transparent bg-clip-text";

  return (
    <footer className={footerClass}>
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10">
        {/* Col 1: Logo + description */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className={brandChipClass}>NTJ</div>
            <span className={brandNameClass}>{t("footer.brand", lang)}</span>
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
              href="/signin?next=/admin"
              className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}
            >
              {t("footer.links.staff", lang)}
            </Link>
            <Link href="/blog" className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}>
              {t("footer.links.blog", lang)}
            </Link>
            <Link href="/pricing" className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}>
              {t("footer.links.pricing", lang)}
            </Link>
            <Link href="/partners" className={isLight ? "hover:text-emerald-600 transition" : "hover:text-emerald-400 transition"}>
              {t("footer.links.partner", lang)}
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

        {/* Col 3: Socials */}
        <div className="flex flex-col gap-4 md:items-end">
          <div className={isLight ? "flex gap-3" : "flex gap-3 text-slate-400"}>
            <a href="#" className={socialBtnClass} aria-label="X">
              <FaXTwitter className="text-[16px]" />
            </a>
            <a href="#" className={socialBtnClass} aria-label="Instagram">
              <FaInstagram className="text-[16px]" />
            </a>
            <a href="#" className={socialBtnClass} aria-label="LinkedIn">
              <FaLinkedinIn className="text-[16px]" />
            </a>
            <a href="#" className={socialBtnClass} aria-label="Facebook">
              <FaFacebookF className="text-[16px]" />
            </a>
          </div>
        </div>
      </div>

      <div className={isLight ? "mt-8 border-t border-slate-200 pt-4 text-[11px] text-slate-500 text-center" : "mt-8 border-t border-slate-800 pt-4 text-[11px] text-slate-500 text-center"}>
        © {year} {t("footer.copyright", lang)}
      </div>
    </footer>
  );
}
