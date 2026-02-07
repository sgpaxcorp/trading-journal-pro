"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  FaInstagram,
  FaFacebookF,
  FaTwitter,
  FaDiscord,
} from "react-icons/fa";

type QuickTourOverlayProps = {
  onboardingCompleted: boolean;
};

type TourStep = {
  id: number;
  name: string;
  title: string;
  description: string[];
  path: string; // ruta donde debe estar el usuario para este paso
};

const buildSteps = (L: (en: string, es: string) => string): TourStep[] => [
  {
    id: 1,
    name: L("Growth Plan", "Plan de crecimiento"),
    title: L("Step 1 · Build your Growth Plan", "Paso 1 · Crea tu plan de crecimiento"),
    path: "/growth-plan",
    description: [
      L(
        "In the Growth Plan section you define who you want to be as a trader: style, risk per trade, sessions per week and your non-negotiable rules.",
        "En el Plan de Crecimiento defines quién quieres ser como trader: estilo, riesgo por trade, sesiones por semana y tus reglas no negociables."
      ),
      L(
        "This becomes the contract between you and your more disciplined future version, so the whole platform knows what 'trading on-plan' means for you.",
        "Esto se convierte en un contrato contigo más disciplinado, para que toda la plataforma sepa qué significa para ti operar 'en plan'."
      ),
    ],
  },
  {
    id: 2,
    name: L("Dashboard", "Dashboard"),
    title: L("Step 2 · Dashboard overview", "Paso 2 · Resumen del dashboard"),
    path: "/dashboard",
    description: [
      L(
        "The dashboard gives you a high-signal overview: green streaks, P&L calendar, your best instruments and your main self-sabotage patterns.",
        "El dashboard te da un resumen de alta señal: rachas verdes, calendario de P&L, tus mejores instrumentos y tus principales patrones de autosabotaje."
      ),
      L(
        "You can rearrange widgets so the first screen you see every day is the one that actually moves your performance forward.",
        "Puedes reorganizar widgets para que la primera pantalla que veas cada día sea la que realmente impulsa tu rendimiento."
      ),
    ],
  },
  {
    id: 3,
    name: L("Performance", "Rendimiento"),
    title: L("Step 3 · Performance analytics", "Paso 3 · Analítica de rendimiento"),
    path: "/performance",
    description: [
      L(
        "Performance breaks your trading down by instrument, time of day, setup and weekday so you can attack specific leaks instead of guessing.",
        "Rendimiento desglosa tu trading por instrumento, hora del día, setup y día de la semana para atacar fugas específicas en lugar de adivinar."
      ),
      L(
        "This is where you see hard evidence of where you print money and where you bleed.",
        "Aquí ves evidencia dura de dónde generas dinero y dónde sangras."
      ),
    ],
  },
  {
    id: 4,
    name: L("Notebook", "Notebook"),
    title: L("Step 4 · Notebook & playbook", "Paso 4 · Notebook y playbook"),
    path: "/notebook",
    description: [
      L(
        "The Notebook is your space to document playbooks, pre-market plans, key lessons and mindset notes.",
        "El Notebook es tu espacio para documentar playbooks, planes de premarket, lecciones clave y notas de mindset."
      ),
      L(
        "Over time this becomes your personal trading manual, built out of your own data.",
        "Con el tiempo se convierte en tu manual personal de trading, construido con tus propios datos."
      ),
    ],
  },
  {
    id: 5,
    name: L("Back-Studying", "Back-Studying"),
    title: L("Step 5 · Back-Study your trades", "Paso 5 · Back-Study de tus trades"),
    path: "/back-study",
    description: [
      L(
        "Back-Studying lets you review each trade on the underlying chart, so you can audit entries, exits and timing with brutal honesty.",
        "Back-Studying te permite revisar cada trade en el gráfico del subyacente para auditar entradas, salidas y timing con honestidad brutal."
      ),
      L(
        "You'll quickly see if you're cutting winners too early or holding losers too long.",
        "Rápido verás si cortas ganadores muy pronto o mantienes perdedores demasiado tiempo."
      ),
    ],
  },
  {
    id: 6,
    name: L("Challenges", "Desafíos"),
    title: L("Step 6 · Challenges & behavior change", "Paso 6 · Desafíos y cambio de conducta"),
    path: "/challenges",
    description: [
      L(
        "Challenges are focused missions to build specific habits: respecting max loss, taking only A+ setups, following your morning routine, etc.",
        "Los desafíos son misiones enfocadas para construir hábitos: respetar pérdida máxima, tomar solo setups A+, seguir tu rutina matutina, etc."
      ),
      L(
        "Instead of trying to fix everything at once, you work on one or two behaviors at a time.",
        "En lugar de arreglar todo a la vez, trabajas uno o dos comportamientos a la vez."
      ),
    ],
  },
  {
    id: 7,
    name: L("Resources", "Recursos"),
    title: L("Step 7 · Resources & help center", "Paso 7 · Recursos y centro de ayuda"),
    path: "/resources",
    description: [
      L(
        "Resources centralize PDFs, mini-guides, checklists and links so you don't have to dig through emails or chats.",
        "Recursos centraliza PDFs, mini guías, checklists y enlaces para que no tengas que buscar en correos o chats."
      ),
      L(
        "Whenever we release new frameworks or features, you'll find the latest material here.",
        "Cuando lancemos nuevas metodologías o funciones, aquí encontrarás el material más reciente."
      ),
    ],
  },
  {
    id: 8,
    name: L("Rules & Alarms", "Reglas y alarmas"),
    title: L("Step 8 · Rules & alarms", "Paso 8 · Reglas y alarmas"),
    path: "/rules-alarms",
    description: [
      L(
        "Here you define your key risk and behavior rules and set alarms to warn you when you're about to cross a line.",
        "Aquí defines tus reglas clave de riesgo y conducta y configuras alarmas que te avisan cuando estás por cruzar un límite."
      ),
      L(
        "The goal is fewer 'I knew I shouldn’t have done that' moments, and more structure protecting you from your worst impulses.",
        "El objetivo es menos momentos de “sabía que no debía hacerlo” y más estructura protegiéndote de tus peores impulsos."
      ),
    ],
  },
  {
    id: 9,
    name: L("Global Ranking & XP", "Ranking global y XP"),
    title: L("Step 9 · Global ranking & XP", "Paso 9 · Ranking global y XP"),
    path: "/ranking",
    description: [
      L(
        "Global Ranking & XP turns your progress into a game: you earn experience for disciplined behavior and consistent execution, not just P&L.",
        "El Ranking Global y XP convierte tu progreso en un juego: ganas experiencia por disciplina y ejecución consistente, no solo por P&L."
      ),
      L(
        "You can track levels, streaks and ranking over time to stay motivated to show up as a professional.",
        "Puedes seguir niveles, rachas y ranking en el tiempo para mantenerte motivado a presentarte como profesional."
      ),
    ],
  },
];

export default function QuickTourOverlay({
  onboardingCompleted,
}: QuickTourOverlayProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const steps = buildSteps(L);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  // 1) Activar el tour solo si no ha completado onboarding
  useEffect(() => {
    if (!onboardingCompleted) {
      setActive(true);
    }
  }, [onboardingCompleted]);

  // 2) Asegurarnos de que el usuario está en la ruta correcta para el step actual
  useEffect(() => {
    if (!active) return;
    if (!currentStep) return;

    if (pathname !== currentStep.path) {
      router.push(currentStep.path);
    }
  }, [active, currentStep, pathname, router]);

  async function finishTour() {
    try {
      setSaving(true);

      const {
        data: { user },
        error: userError,
      } = await supabaseBrowser.auth.getUser();

      if (userError || !user) {
        console.error("Error getting current user:", userError);
        setSaving(false);
        return;
      }

      const userId = user.id;

      // 1) metadata
      const { error: authError } = await supabaseBrowser.auth.updateUser({
        data: {
          onboardingCompleted: true,
        },
      });
      if (authError) {
        console.error("Error updating onboardingCompleted in auth:", authError);
      }

      // 2) profiles
      const { error: profileError } = await supabaseBrowser
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", userId);

      if (profileError) {
        console.error(
          "Error updating onboarding_completed in profiles:",
          profileError
        );
      }

      setActive(false);
      router.replace("/dashboard");
    } finally {
      setSaving(false);
    }
  }

  function handleSkip() {
    finishTour();
  }

  function handleNext() {
    if (isLastStep) {
      void finishTour();
      return;
    }
    setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
  }

  function handlePrev() {
    setStepIndex((prev) => Math.max(prev - 1, 0));
  }

  if (!active || !currentStep) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
      {/* Card */}
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/95 p-5 shadow-2xl shadow-emerald-500/20">
        {/* Pills de steps arriba */}
        <div className="mb-3 flex flex-wrap gap-1.5 text-[10px]">
          {steps.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStepIndex(idx)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
                idx === stepIndex
                  ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                  : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-emerald-300/60 hover:text-emerald-100"
              }`}
            >
              <span className="h-3.5 w-3.5 inline-flex items-center justify-center rounded-full border border-current text-[8px]">
                {idx + 1}
              </span>
              <span>{s.name}</span>
            </button>
          ))}
        </div>

        {/* Contenido del step */}
        <p className="text-[11px] text-slate-400 mb-1">
          {L("Step", "Paso")} {stepIndex + 1} {L("of", "de")} {steps.length}
        </p>
        <h2 className="text-sm md:text-base font-semibold text-slate-50 mb-2">
          {currentStep.title}
        </h2>
        <p className="text-[10px] text-slate-500 mb-3">
          {L("You’re currently on:", "Actualmente estás en:")}{" "}
          <span className="font-semibold text-emerald-300">
            {currentStep.path}
          </span>
        </p>

        <ul className="mb-4 space-y-2 text-[11px] text-slate-200">
          {currentStep.description.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
              <span>{line}</span>
            </li>
          ))}
        </ul>

        {/* Solo en el último step: redes sociales */}
        {isLastStep && (
          <div className="mb-4 space-y-2">
            <p className="text-[11px] text-slate-400">
              {L(
                "For more tutorials and live breakdowns you can also follow us on:",
                "Para más tutoriales y análisis en vivo, también puedes seguirnos en:"
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="https://instagram.com/tu_cuenta_aqui"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                <FaInstagram className="h-3.5 w-3.5" />
                Instagram
              </a>
              <a
                href="https://facebook.com/tu_cuenta_aqui"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                <FaFacebookF className="h-3.5 w-3.5" />
                Facebook
              </a>
              <a
                href="https://x.com/tu_cuenta_aqui"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                <FaTwitter className="h-3.5 w-3.5" />
                X
              </a>
              <a
                href="https://discord.gg/tu_invite_aqui"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                <FaDiscord className="h-3.5 w-3.5" />
                Discord
              </a>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="flex items-center justify-between gap-2 mt-2">
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="text-[11px] text-slate-400 hover:text-emerald-200 disabled:opacity-50"
          >
            {L("Skip tour", "Saltar tour")}
          </button>

          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-3 py-1.5 rounded-xl border border-slate-700 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-100"
              >
                {L("Previous", "Anterior")}
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-emerald-400 text-slate-950 text-[11px] font-semibold hover:bg-emerald-300 disabled:opacity-60"
            >
              {saving
                ? L("Finishing…", "Finalizando…")
                : isLastStep
                ? L("Finish & go to dashboard", "Finalizar y volver al dashboard")
                : L("Next step", "Siguiente paso")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
