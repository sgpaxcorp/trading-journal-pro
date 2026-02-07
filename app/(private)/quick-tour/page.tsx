"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  FaInstagram,
  FaFacebookF,
  FaTwitter, // X
  FaDiscord,
} from "react-icons/fa";

type Step = {
  id: number;
  name: string;
  title: string;
  videoUrl: string;
  body: string[];
};

const getSteps = (L: (en: string, es: string) => string): Step[] => [
  {
    id: 1,
    name: L("Growth Plan", "Plan de crecimiento"),
    title: L("Step 1 · Build your Growth Plan", "Paso 1 · Crea tu Growth Plan"),
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_1",
    body: [
      L(
        "In the Growth Plan section you define who you want to be as a trader: style, risk per trade, sessions per week and your non-negotiable rules.",
        "En Growth Plan defines quién quieres ser como trader: estilo, riesgo por trade, sesiones por semana y reglas no negociables."
      ),
      L(
        "This becomes the contract between you and your more disciplined future version, so the whole platform knows what “trading on-plan” means for you.",
        "Esto se convierte en el contrato entre tú y tu versión más disciplinada, para que toda la plataforma sepa qué significa para ti operar en plan."
      ),
    ],
  },
  {
    id: 2,
    name: L("Dashboard", "Dashboard"),
    title: L("Step 2 · Dashboard overview", "Paso 2 · Vista general del dashboard"),
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_2",
    body: [
      L(
        "The dashboard gives you a high-signal overview: green streaks, P&L calendar, your best instruments and your main self-sabotage patterns.",
        "El dashboard te da un overview de alto nivel: rachas en verde, calendario de P&L, tus mejores instrumentos y tus principales patrones de autosabotaje."
      ),
      L(
        "You can rearrange and resize widgets so the first screen you see every day is the one that actually moves your performance forward.",
        "Puedes reordenar y redimensionar los widgets para que la primera pantalla que veas cada día sea la que realmente mueve tu rendimiento."
      ),
    ],
  },
  {
    id: 3,
    name: L("Performance", "Performance"),
    title: L("Step 3 · Performance analytics", "Paso 3 · Analítica de performance"),
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_3",
    body: [
      L(
        "Performance breaks your trading down by instrument, time of day, setup, weekday and more, so you can attack specific leaks instead of guessing.",
        "Performance desglosa tu trading por instrumento, hora del día, setup, día de la semana y más, para atacar fugas específicas en vez de adivinar."
      ),
      L(
        "This is where you’ll see hard evidence of where you print money, where you bleed, and which rules are costing you the most when you break them.",
        "Aquí verás evidencia dura de dónde haces dinero, dónde sangras y qué reglas te cuestan más cuando las rompes."
      ),
    ],
  },
  {
    id: 4,
    name: L("Notebook", "Notebook"),
    title: L("Step 4 · Notebook & playbook", "Paso 4 · Notebook y playbook"),
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_4",
    body: [
      L(
        "The Notebook is your space to document playbooks, pre-market plans, key lessons, screenshots and mindset notes.",
        "El Notebook es tu espacio para documentar playbooks, planes de premarket, aprendizajes clave, screenshots y notas de mindset."
      ),
      L(
        "Over time this becomes your personal trading manual — not generic advice, but patterns and rules that are proven in your own data.",
        "Con el tiempo se convierte en tu manual de trading personal — no consejos genéricos, sino patrones y reglas probados en tus propios datos."
      ),
    ],
  },
  {
    id: 5,
    name: L("Back-Studying", "Back-Studying"),
    title: L("Step 5 · Back-Study your trades", "Paso 5 · Back-Study de tus trades"),
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_5",
    body: [
      L(
        "Back-Studying lets you see each trade on the underlying chart, so you can review entries, exits and timing with brutal honesty.",
        "Back-Studying te deja ver cada trade sobre el gráfico del subyacente, para revisar entradas, salidas y timing con honestidad brutal."
      ),
      L(
        "You’ll quickly spot if you’re cutting winners too early, holding losers too long, or entering in the middle of nowhere instead of at your levels.",
        "Rápido detectas si cortas ganadores muy pronto, aguantas perdedores demasiado, o entras en medio de la nada en vez de tus niveles."
      ),
    ],
  },
  {
    id: 6,
    name: L("Challenges", "Desafíos"),
    title: L("Step 6 · Challenges & behavior change", "Paso 6 · Desafíos y cambio de conducta"),
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_6",
    body: [
      L(
        "Challenges are short, focused missions to build specific habits: respecting max loss, taking only A+ setups, following your morning routine, etc.",
        "Los desafíos son misiones cortas y enfocadas para construir hábitos específicos: respetar el max loss, tomar solo setups A+, seguir tu rutina de mañana, etc."
      ),
      L(
        "Instead of trying to fix everything at once, you’ll work on one or two behaviors at a time and track progress like a training program.",
        "En vez de arreglar todo a la vez, trabajas uno o dos comportamientos a la vez y sigues el progreso como un programa de entrenamiento."
      ),
    ],
  },
  {
    id: 7,
    name: L("Resources", "Recursos"),
    title: L("Step 7 · Resources & help center", "Paso 7 · Recursos y centro de ayuda"),
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_7",
    body: [
      L(
        "The Resources area centralizes PDFs, mini-guides, checklists and links to tutorials so you don’t have to dig through emails or chats.",
        "Recursos centraliza PDFs, mini-guías, checklists y enlaces a tutoriales para que no tengas que buscar en emails o chats."
      ),
      L(
        "Whenever we release new features or frameworks, you’ll find the latest material here so you can plug it into your routine fast.",
        "Cada vez que lancemos features o frameworks nuevos, aquí encontrarás el material más reciente para integrarlo rápido a tu rutina."
      ),
    ],
  },
  {
    id: 8,
    name: L("Rules & Alarms", "Reglas y Alarmas"),
    title: L("Step 8 · Rules & alarms", "Paso 8 · Reglas y alarmas"),
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_8",
    body: [
      L(
        "Here you can define your key risk and behavior rules and set alarms to warn you when you’re about to cross a line.",
        "Aquí defines tus reglas clave de riesgo y conducta y configuras alarmas para avisarte cuando estés por cruzar una línea."
      ),
      L(
        "The goal is simple: fewer “I knew I shouldn’t have done that” moments, and more structure protecting you from your worst impulses.",
        "El objetivo es simple: menos momentos de “sabía que no debía hacer eso” y más estructura que te proteja de tus peores impulsos."
      ),
    ],
  },
  {
    id: 9,
    name: L("Global Ranking & XP", "Ranking Global y XP"),
    title: L("Step 9 · Global ranking & XP", "Paso 9 · Ranking global y XP"),
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_9",
    body: [
      L(
        "Global Ranking & XP turns your progress into a game: you earn experience for disciplined behavior and consistent execution, not just P&L.",
        "Ranking Global y XP convierte tu progreso en juego: ganas experiencia por conducta disciplinada y ejecución consistente, no solo por P&L."
      ),
      L(
        "You’ll be able to track levels, streaks and ranking over time, so you stay motivated to show up as a professional — even on the days the market doesn’t pay you.",
        "Podrás seguir niveles, rachas y ranking con el tiempo, para mantenerte motivado como profesional — incluso en días que el mercado no te paga."
      ),
    ],
  },
];

export default function QuickTourPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const steps = useMemo(() => getSteps(L), [lang]);
  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  async function markOnboardingAndGo() {
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

      // metadata
      const { error: authError } = await supabaseBrowser.auth.updateUser({
        data: {
          onboardingCompleted: true,
        },
      });
      if (authError) {
        console.error("Error updating onboardingCompleted in auth:", authError);
      }

      // profiles
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

      router.replace("/dashboard");
    } finally {
      setSaving(false);
    }
  }

  function handleNext() {
    if (isLastStep) return;
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  function handlePrev() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <section className="max-w-5xl mx-auto px-4 py-8 md:py-12">
        {/* Header */}
        <header className="mb-6 md:mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-400 mb-1">
              {L("Quick tour · 3–4 minutes", "Tour rápido · 3–4 minutos")}
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-50 mb-1">
              {L("Welcome to your NeuroTrader Journal.", "Bienvenido a tu NeuroTrader Journal.")}
            </h1>
            <p className="text-xs md:text-sm text-slate-400 max-w-xl">
              {L(
                "Before you start logging trades, let's walk through the core areas so you can squeeze the maximum edge out of the platform.",
                "Antes de registrar trades, recorramos las áreas clave para que puedas exprimir el máximo edge de la plataforma."
              )}
            </p>
          </div>
        </header>

        {/* Stepper pills */}
        <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
          {steps.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStepIndex(idx)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 transition ${
                idx === stepIndex
                  ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                  : "border-slate-700 bg-slate-900/70 text-slate-300 hover:border-emerald-300/60 hover:text-emerald-100"
              }`}
            >
              <span className="h-4 w-4 inline-flex items-center justify-center rounded-full border border-current text-[9px]">
                {idx + 1}
              </span>
              <span>{s.name}</span>
            </button>
          ))}
        </div>

        {/* Main card: video + text */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] items-start mb-8">
          {/* “Video” area */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 md:p-4 shadow-lg shadow-emerald-500/10">
            <p className="text-[11px] text-slate-400 mb-2">
              {L("Step", "Paso")} {stepIndex + 1} {L("of", "de")} {steps.length}
            </p>
            <h2 className="text-sm md:text-base font-semibold text-slate-50 mb-3">
              {currentStep.title}
            </h2>

            <div className="aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-950/70 mb-3">
              {/* Replace with your actual video URLs (YouTube, Loom, etc.) */}
              <iframe
                src={currentStep.videoUrl}
                title={currentStep.name}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <p className="text-[10px] text-slate-500">
              {L(
                "Replace the video URLs with your actual tutorials (YouTube, Loom, Vimeo, etc.). Each step can be a short 60–120s walkthrough.",
                "Reemplaza las URLs con tus tutoriales reales (YouTube, Loom, Vimeo, etc.). Cada paso puede ser un walkthrough corto de 60–120s."
              )}
            </p>
          </div>

          {/* Text bullets + social / CTA */}
          <div className="space-y-4">
            <ul className="space-y-2 text-[11px] md:text-xs text-slate-300">
              {currentStep.body.map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>

            {isLastStep && (
              <>
                <p className="text-[11px] md:text-xs text-slate-400">
                  {L(
                    "If you want step-by-step video tutorials for each module, you'll find them inside the Help section and on our social channels:",
                    "Si quieres tutoriales paso a paso de cada módulo, los encontrarás en la sección de Ayuda y en nuestras redes:"
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-3">
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
                <p className="text-[10px] text-slate-500">
                  {L(
                    "Replace these links with your official accounts so traders always know where to find tutorials, Q&A and platform updates.",
                    "Reemplaza estos enlaces con tus cuentas oficiales para que los traders sepan dónde encontrar tutoriales, Q&A y actualizaciones."
                  )}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] md:text-xs text-slate-400 max-w-md">
            {L(
              "When you finish this tour we'll take you straight to your dashboard so you can log your next session with this structure in mind.",
              "Cuando termines este tour te llevaremos directo al dashboard para que registres tu próxima sesión con esta estructura en mente."
            )}
          </p>

          <div className="flex gap-2 justify-end">
            {/* Skip button */}
            <button
              type="button"
              onClick={markOnboardingAndGo}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-700 text-[11px] md:text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-100 disabled:opacity-50"
            >
              {L("Skip tour", "Saltar tour")}
            </button>

            {/* Prev / Next / Finish */}
            {stepIndex > 0 && !isLastStep && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2 rounded-xl border border-slate-700 text-[11px] md:text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-100"
              >
                {L("Previous", "Anterior")}
              </button>
            )}

            {!isLastStep && (
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 rounded-xl bg-slate-200 text-slate-900 text-[11px] md:text-xs font-semibold hover:bg-white/90"
              >
                {L("Next step", "Siguiente paso")}
              </button>
            )}

            {isLastStep && (
              <button
                type="button"
                onClick={markOnboardingAndGo}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-[11px] md:text-xs font-semibold hover:bg-emerald-300 disabled:opacity-60 shadow-lg shadow-emerald-500/25"
              >
                {saving ? L("Finishing…", "Finalizando…") : L("Finish & go to dashboard", "Finalizar y abrir dashboard")}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
