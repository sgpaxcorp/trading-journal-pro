"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type AppTourProps = {
  onboardingCompleted: boolean;
};

type TourStep = {
  id: number;
  title: string;
  body: string;
  path: string;
  selector: string;
};

function formatDateIso(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function buildSteps(
  L: (en: string, es: string) => string,
  journalDate: string
): TourStep[] {
  return [
    {
      id: 1,
      title: L("Weekly P&L", "P&L semanal"),
      body: L(
        "See your current week at a glance. Tap a day to jump into its journal.",
        "Ve tu semana de un vistazo. Toca un día para abrir su journal."
      ),
      path: "/dashboard",
      selector: '[data-tour="dash-widget-weekly"]',
    },
    {
      id: 2,
      title: L("P&L Calendar", "Calendario de P&L"),
      body: L(
        "Your monthly view with wins, losses, and quick access to each session.",
        "Vista mensual con ganancias, pérdidas y acceso rápido a cada sesión."
      ),
      path: "/dashboard",
      selector: '[data-tour="dash-widget-calendar"]',
    },
    {
      id: 3,
      title: L("Day Summary", "Resumen del día"),
      body: L(
        "Daily snapshot of performance, behavior, and focus. Keep it front and center.",
        "Resumen diario de performance, conducta y enfoque. Manténlo visible."
      ),
      path: "/dashboard",
      selector: '[data-tour="dash-widget-progress"]',
    },
    {
      id: 4,
      title: L("Edit Growth Plan", "Editar Growth Plan"),
      body: L(
        "Set your targets, risk, trading days, and phases here.",
        "Aquí defines metas, riesgo, días de trading y fases."
      ),
      path: "/dashboard",
      selector: '[data-tour="dash-edit-growth-plan"]',
    },
    {
      id: 5,
      title: L("Performance", "Performance"),
      body: L(
        "Deep analytics and breakdowns by instrument, time, and behavior.",
        "Analítica profunda y desglose por instrumento, tiempo y conducta."
      ),
      path: "/dashboard",
      selector: '[data-tour="nav-performance"]',
    },
    {
      id: 6,
      title: L("Notebook", "Notebook"),
      body: L(
        "Your playbook, lessons, and evidence-based notes.",
        "Tu playbook, lecciones y notas basadas en evidencia."
      ),
      path: "/dashboard",
      selector: '[data-tour="nav-notebook"]',
    },
    {
      id: 7,
      title: L("Back-Studying", "Back-Studying"),
      body: L(
        "Replay trades on the chart and audit execution in context.",
        "Repite trades en el gráfico y audita la ejecución con contexto."
      ),
      path: "/dashboard",
      selector: '[data-tour="nav-back-study"]',
    },
    {
      id: 8,
      title: L("Option Flow Intelligence", "Option Flow Intelligence"),
      body: L(
        "Private beta module for testing options flow reports and premarket plans.",
        "Módulo en beta privada para probar reportes de options flow y planes premarket."
      ),
      path: "/dashboard",
      selector: '[data-tour="nav-option-flow"]',
    },
    {
      id: 9,
      title: L("Challenges", "Desafíos"),
      body: L(
        "Behavior missions to build discipline and consistency.",
        "Misiones de conducta para crear disciplina y consistencia."
      ),
      path: "/dashboard",
      selector: '[data-tour="nav-challenges"]',
    },
    {
      id: 11,
      title: L("Rules & Alarms", "Reglas y alarmas"),
      body: L(
        "Define non-negotiables and alerts that protect your plan.",
        "Define no negociables y alertas que protegen tu plan."
      ),
      path: "/dashboard",
      selector: '[data-tour="nav-rules"]',
    },
    {
      id: 12,
      title: L("Forum", "Foro"),
      body: L(
        "Community discussions, feedback, and shared progress.",
        "Comunidad, feedback y progreso compartido."
      ),
      path: "/dashboard",
      selector: '[data-tour="nav-forum"]',
    },
    {
      id: 13,
      title: L("Global Ranking", "Ranking global"),
      body: L(
        "Track XP and ranking progress over time.",
        "Sigue tu XP y ranking en el tiempo."
      ),
      path: "/dashboard",
      selector: '[data-tour="nav-global-ranking"]',
    },
    {
      id: 14,
      title: L("Starting balance", "Balance inicial"),
      body: L(
        "This anchors every projection and phase target.",
        "Esto ancla cada proyección y meta de fase."
      ),
      path: "/growth-plan",
      selector: "#gp-starting-balance",
    },
    {
      id: 15,
      title: L("Target balance", "Balance meta"),
      body: L(
        "Your long-term goal. Everything ladders into this number.",
        "Tu meta a largo plazo. Todo se alinea hacia este número."
      ),
      path: "/growth-plan",
      selector: "#gp-target-balance",
    },
    {
      id: 16,
      title: L("Plan mode", "Modo del plan"),
      body: L(
        "Choose automatic pacing or manual phases you control.",
        "Elige pacing automático o fases manuales que controlas."
      ),
      path: "/growth-plan",
      selector: "#gp-plan-mode",
    },
    {
      id: 17,
      title: L("Trading days", "Días de trading"),
      body: L(
        "Set the cadence you commit to and the calendar adapts.",
        "Define la cadencia y el calendario se ajusta."
      ),
      path: "/growth-plan",
      selector: "#gp-trading-days",
    },
    {
      id: 18,
      title: L("Plan phases", "Fases del plan"),
      body: L(
        "Break the goal into phases that fit your timeline.",
        "Divide la meta en fases que encajen tu timeline."
      ),
      path: "/growth-plan",
      selector: "#gp-plan-phases",
    },
    {
      id: 19,
      title: L("Journal date", "Journal del día"),
      body: L(
        "Navigate sessions and keep every day documented.",
        "Navega sesiones y documenta cada día."
      ),
      path: `/journal/${journalDate}`,
      selector: '[data-tour="journal-date-header"]',
    },
    {
      id: 20,
      title: L("Premarket", "Premarket"),
      body: L(
        "Set bias, levels, and your plan before the session opens.",
        "Define sesgo, niveles y plan antes de abrir la sesión."
      ),
      path: `/journal/${journalDate}`,
      selector: '[data-tour="journal-premarket"]',
    },
    {
      id: 21,
      title: L("Inside trade", "Dentro del trade"),
      body: L(
        "Capture live execution, thoughts, and adjustments.",
        "Registra ejecución en vivo, pensamientos y ajustes."
      ),
      path: `/journal/${journalDate}`,
      selector: '[data-tour="journal-inside"]',
    },
    {
      id: 22,
      title: L("After trade", "Post‑trade"),
      body: L(
        "Review mistakes, lessons, and next actions.",
        "Revisa errores, lecciones y próximos pasos."
      ),
      path: `/journal/${journalDate}`,
      selector: '[data-tour="journal-after"]',
    },
    {
      id: 23,
      title: L("Save your session", "Guarda tu sesión"),
      body: L(
        "Save anytime and keep your progress synced.",
        "Guarda cuando quieras y mantén todo sincronizado."
      ),
      path: `/journal/${journalDate}`,
      selector: '[data-tour="journal-save"]',
    },
  ];
}

export default function AppTour({ onboardingCompleted }: AppTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [missingTarget, setMissingTarget] = useState(false);

  const journalDate = useMemo(() => formatDateIso(new Date()), []);
  const steps = useMemo(() => buildSteps(L, journalDate), [lang, journalDate]);
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];

  useEffect(() => {
    if (onboardingCompleted) return;
    setActive(true);
  }, [onboardingCompleted]);

  useEffect(() => {
    if (!active || !currentStep) return;
    if (pathname !== currentStep.path) {
      router.replace(currentStep.path);
    }
  }, [active, currentStep, pathname, router]);

  useEffect(() => {
    if (!active || !currentStep) return;

    const updateTarget = () => {
      const el = document.querySelector(currentStep.selector) as HTMLElement | null;
      if (!el) {
        setTargetRect(null);
        setMissingTarget(true);
        return;
      }
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      setMissingTarget(false);
    };

    const el = document.querySelector(currentStep.selector) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth", inline: "center" });
    }

    const raf = window.requestAnimationFrame(updateTarget);
    window.addEventListener("resize", updateTarget);
    window.addEventListener("scroll", updateTarget, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateTarget);
      window.removeEventListener("scroll", updateTarget, true);
    };
  }, [active, currentStep, pathname]);

  useEffect(() => {
    if (!user?.id) return;
    const key = `ntj_app_tour_${user.id}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed)) {
        setStepIndex(Math.max(0, Math.min(parsed, steps.length - 1)));
      }
    }
  }, [user?.id, steps.length]);

  useEffect(() => {
    if (!user?.id) return;
    const key = `ntj_app_tour_${user.id}`;
    localStorage.setItem(key, String(stepIndex));
  }, [user?.id, stepIndex]);

  const markOnboardingComplete = async () => {
    try {
      setSaving(true);
      const {
        data: { user: authUser },
        error: userError,
      } = await supabaseBrowser.auth.getUser();

      if (userError || !authUser) {
        console.error("[AppTour] Failed to load user", userError);
        return;
      }

      await supabaseBrowser.auth.updateUser({
        data: { onboardingCompleted: true },
      });

      await supabaseBrowser
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", authUser.id);

      setActive(false);
      router.replace("/dashboard");
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (stepIndex >= steps.length - 1) {
      void markOnboardingComplete();
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handlePrev = () => {
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  if (!active || !currentStep) return null;

  const highlightStyle = targetRect
    ? {
        top: Math.max(0, targetRect.top - 8),
        left: Math.max(0, targetRect.left - 8),
        width: targetRect.width + 16,
        height: targetRect.height + 16,
      }
    : null;

  const tooltipStyle = (() => {
    if (!targetRect || typeof window === "undefined") {
      return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" } as const;
    }

    const padding = 16;
    const maxWidth = 360;
    const estimatedHeight = 200;

    let top = targetRect.bottom + 14;
    if (top + estimatedHeight > window.innerHeight - padding) {
      top = targetRect.top - estimatedHeight - 14;
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
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-slate-950/45" />
      {highlightStyle ? (
        <div
          className="absolute rounded-2xl border border-emerald-400/80 shadow-[0_0_0_9999px_rgba(2,6,23,0.55)]"
          style={highlightStyle as any}
        />
      ) : null}

      <div
        className="absolute rounded-2xl border border-slate-800 bg-slate-950/95 p-4 shadow-xl shadow-emerald-500/10 text-slate-100"
        style={tooltipStyle as any}
      >
        <p className="text-[11px] uppercase tracking-[0.24em] text-emerald-300/70">
          {L("Guided tour", "Tour guiado")}
        </p>
        <h3 className="text-lg font-semibold mt-1">{currentStep.title}</h3>
        <p className="text-[13px] text-slate-300 mt-2">{currentStep.body}</p>
        {missingTarget ? (
          <p className="mt-2 text-[11px] text-amber-300">
            {L(
              "We could not find this element. It may be hidden in your layout.",
              "No pudimos encontrar este elemento. Puede estar oculto en tu layout."
            )}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {L("Step", "Paso")} {stepIndex + 1} {L("of", "de")} {steps.length}
          </span>
          <button
            type="button"
            onClick={() => void markOnboardingComplete()}
            className="text-emerald-300 hover:text-emerald-200"
            disabled={saving}
          >
            {L("Skip tour", "Saltar tour")}
          </button>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          {stepIndex > 0 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="px-3 py-1.5 rounded-lg border border-slate-700 text-[12px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
            >
              {L("Back", "Atrás")}
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleNext}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-emerald-400 text-slate-950 text-[12px] font-semibold hover:bg-emerald-300 disabled:opacity-60"
          >
            {stepIndex >= steps.length - 1
              ? L("Finish", "Finalizar")
              : L("Next", "Siguiente")}
          </button>
        </div>
      </div>
    </div>
  );
}
