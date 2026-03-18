"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  QUICK_TOUR_OPEN_EVENT,
  getQuickIntroSeenKey,
  getQuickTourContext,
  getQuickTourSeenKey,
} from "@/lib/quickTour";

export default function PageIntro() {
  const pathname = usePathname();
  const { user } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const current = getQuickTourContext(pathname || "/dashboard", L);

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user?.id || !pathname) return;

    const introKey = getQuickIntroSeenKey(user.id, current.key);
    const tourKey = getQuickTourSeenKey(user.id, current.key);
    const introSeen = localStorage.getItem(introKey);
    const tourSeen = localStorage.getItem(tourKey);

    if (introSeen || tourSeen) {
      setVisible(false);
      return;
    }

    setVisible(true);
  }, [current.key, pathname, user?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpen = () => setVisible(false);
    window.addEventListener(QUICK_TOUR_OPEN_EVENT, onOpen as EventListener);
    return () => {
      window.removeEventListener(QUICK_TOUR_OPEN_EVENT, onOpen as EventListener);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed right-6 top-[88px] z-[70] max-w-[380px] rounded-3xl border border-slate-800 bg-slate-950/95 p-5 text-slate-100 shadow-2xl shadow-emerald-500/10 backdrop-blur">
      <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/80">
        {L("Quick tour", "Quick tour")}
      </p>
      <h3 className="mt-2 text-xl font-semibold text-slate-50">{current.title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-300">{current.summary}</p>

      <ul className="mt-4 space-y-2 text-sm text-slate-300">
        {current.bullets.slice(0, 3).map((bullet) => (
          <li key={bullet} className="flex gap-2">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href={current.guideHref}
          className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
        >
          {L("Open guide", "Abrir guía")}
        </Link>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new CustomEvent(QUICK_TOUR_OPEN_EVENT));
            setVisible(false);
          }}
          className="rounded-xl bg-emerald-400 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          {L("Start quick tour", "Iniciar quick tour")}
        </button>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (!user?.id) return;
            localStorage.setItem(getQuickIntroSeenKey(user.id, current.key), "1");
            setVisible(false);
          }}
          className="text-xs text-slate-400 transition hover:text-slate-200"
        >
          {L("Dismiss", "Cerrar")}
        </button>
      </div>
    </div>
  );
}
