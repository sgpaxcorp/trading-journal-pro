"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { usePathname } from "next/navigation";

import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  QUICK_TOUR_FORCE_KEY,
  QUICK_TOUR_OPEN_EVENT,
  getQuickIntroSeenKey,
  getQuickTourContext,
  getQuickTourSeenKey,
} from "@/lib/quickTour";

export default function RouteQuickTour({ enabled = true }: { enabled?: boolean }) {
  const pathname = usePathname();
  const { user } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const context = getQuickTourContext(pathname || "/dashboard", L);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [missingTarget, setMissingTarget] = useState(false);

  const currentStep = context.steps[Math.min(stepIndex, Math.max(0, context.steps.length - 1))] ?? null;

  useEffect(() => {
    setActive(false);
    setStepIndex(0);
    setTargetRect(null);
    setMissingTarget(false);
  }, [pathname, context.key]);

  useEffect(() => {
    if (!enabled || !user?.id || typeof window === "undefined") return;

    const onOpen = () => {
      setStepIndex(0);
      setActive(true);
    };

    window.addEventListener(QUICK_TOUR_OPEN_EVENT, onOpen as EventListener);

    const forcedKey = sessionStorage.getItem(QUICK_TOUR_FORCE_KEY);
    if (forcedKey && forcedKey === context.key) {
      sessionStorage.removeItem(QUICK_TOUR_FORCE_KEY);
      onOpen();
    }

    return () => {
      window.removeEventListener(QUICK_TOUR_OPEN_EVENT, onOpen as EventListener);
    };
  }, [context.key, enabled, user?.id]);

  useEffect(() => {
    if (!active || !currentStep || typeof window === "undefined") return;
    const anchor = currentStep.anchor?.trim() || "";
    const nextHash = anchor ? `#${anchor}` : "";
    const currentHash = window.location.hash || "";
    if (currentHash !== nextHash) {
      window.history.replaceState(window.history.state, "", `${pathname || "/dashboard"}${nextHash}`);
      window.dispatchEvent(new Event("hashchange"));
    }
  }, [active, currentStep, pathname]);

  useEffect(() => {
    if (!active || !currentStep) return;

    const selector = currentStep.selector?.trim();
    if (!selector) {
      setTargetRect(null);
      setMissingTarget(false);
      return;
    }

    let frame = 0;
    let timeout = 0;

    const updateTarget = () => {
      const el = document.querySelector(selector) as HTMLElement | null;
      if (!el) {
        setTargetRect(null);
        setMissingTarget(true);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth", inline: "center" });
      setTargetRect(el.getBoundingClientRect());
      setMissingTarget(false);
    };

    frame = window.requestAnimationFrame(updateTarget);
    timeout = window.setTimeout(updateTarget, 140);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [active, currentStep]);

  const markSeenAndClose = () => {
    if (user?.id && typeof window !== "undefined") {
      localStorage.setItem(getQuickTourSeenKey(user.id, context.key), "1");
      localStorage.setItem(getQuickIntroSeenKey(user.id, context.key), "1");
    }
    setActive(false);
  };

  const handleNext = () => {
    if (!currentStep) return;
    if (stepIndex >= context.steps.length - 1) {
      markSeenAndClose();
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, context.steps.length - 1));
  };

  const handlePrev = () => {
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  if (!enabled || !active || !currentStep) return null;

  const highlightStyle = targetRect
    ? {
        top: Math.max(0, targetRect.top - 10),
        left: Math.max(0, targetRect.left - 10),
        width: targetRect.width + 20,
        height: targetRect.height + 20,
      }
    : null;

  const tooltipStyle = (() => {
    if (!targetRect || typeof window === "undefined") {
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" } as const;
    }

    const padding = 20;
    const maxWidth = 380;
    const estimatedHeight = 250;

    let top = targetRect.bottom + 18;
    if (top + estimatedHeight > window.innerHeight - padding) {
      top = targetRect.top - estimatedHeight - 18;
    }
    if (top < padding) top = padding;

    let left = targetRect.left;
    if (left + maxWidth > window.innerWidth - padding) {
      left = window.innerWidth - maxWidth - padding;
    }
    if (left < padding) left = padding;

    return { top, left, maxWidth } as const;
  })();

  return (
    <div className="fixed inset-0 z-[85]">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px]" />
      {highlightStyle ? (
        <div
          className="absolute rounded-[22px] border border-emerald-300/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.62)]"
          style={highlightStyle as CSSProperties}
        />
      ) : null}

      <div
        className="absolute rounded-3xl border border-slate-800 bg-slate-950/95 p-5 text-slate-100 shadow-2xl shadow-emerald-500/10"
        style={tooltipStyle as CSSProperties}
      >
        <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/80">
          {L("Quick tour", "Quick tour")}
        </p>
        <h3 className="mt-2 text-xl font-semibold text-slate-50">{currentStep.title}</h3>
        <p className="mt-3 text-sm leading-6 text-slate-300">{currentStep.body}</p>

        {missingTarget ? (
          <p className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            {L(
              "This element is not visible in the current layout, so the tour is explaining the section without highlighting it.",
              "Este elemento no está visible en el layout actual, así que el tour explica la sección sin resaltarla."
            )}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
          <span>
            {L("Step", "Paso")} {stepIndex + 1} {L("of", "de")} {context.steps.length}
          </span>
          <Link href={context.guideHref} className="text-emerald-300 hover:text-emerald-200">
            {L("Open guide", "Abrir guía")}
          </Link>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={markSeenAndClose}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            {L("Close tour", "Cerrar tour")}
          </button>

          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
              >
                {L("Back", "Atrás")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleNext}
              className="rounded-xl bg-emerald-400 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
            >
              {stepIndex >= context.steps.length - 1 ? L("Finish", "Finalizar") : L("Next", "Siguiente")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
