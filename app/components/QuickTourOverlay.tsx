"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supaBaseClient";
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

const TOUR_STEPS: TourStep[] = [
  {
    id: 1,
    name: "Growth Plan",
    title: "Step 1 · Build your Growth Plan",
    path: "/growth-plan", // AJUSTA a tu ruta real
    description: [
      "In the Growth Plan section you define who you want to be as a trader: style, risk per trade, sessions per week and your non-negotiable rules.",
      "This becomes the contract between you and your more disciplined future version, so the whole platform knows what 'trading on-plan' means for you.",
    ],
  },
  {
    id: 2,
    name: "Dashboard",
    title: "Step 2 · Dashboard overview",
    path: "/dashboard", // AJUSTA a tu ruta real
    description: [
      "The dashboard gives you a high-signal overview: green streaks, P&L calendar, your best instruments and your main self-sabotage patterns.",
      "You can rearrange widgets so the first screen you see every day is the one that actually moves your performance forward.",
    ],
  },
  {
    id: 3,
    name: "Performance",
    title: "Step 3 · Performance analytics",
    path: "/performance", // AJUSTA
    description: [
      "Performance breaks your trading down by instrument, time of day, setup and weekday so you can attack specific leaks instead of guessing.",
      "This is where you see hard evidence of where you print money and where you bleed.",
    ],
  },
  {
    id: 4,
    name: "Notebook",
    title: "Step 4 · Notebook & playbook",
    path: "/notebook", // AJUSTA
    description: [
      "The Notebook is your space to document playbooks, pre-market plans, key lessons and mindset notes.",
      "Over time this becomes your personal trading manual, built out of your own data.",
    ],
  },
  {
    id: 5,
    name: "Back-Studying",
    title: "Step 5 · Back-Study your trades",
    path: "/back-study", // AJUSTA
    description: [
      "Back-Studying lets you review each trade on the underlying chart, so you can audit entries, exits and timing with brutal honesty.",
      "You'll quickly see if you're cutting winners too early or holding losers too long.",
    ],
  },
  {
    id: 6,
    name: "Challenges",
    title: "Step 6 · Challenges & behavior change",
    path: "/challenges", // AJUSTA
    description: [
      "Challenges are focused missions to build specific habits: respecting max loss, taking only A+ setups, following your morning routine, etc.",
      "Instead of trying to fix everything at once, you work on one or two behaviors at a time.",
    ],
  },
  {
    id: 7,
    name: "Resources",
    title: "Step 7 · Resources & help center",
    path: "/resources", // AJUSTA
    description: [
      "Resources centralize PDFs, mini-guides, checklists and links so you don't have to dig through emails or chats.",
      "Whenever we release new frameworks or features, you'll find the latest material here.",
    ],
  },
  {
    id: 8,
    name: "Rules & Alarms",
    title: "Step 8 · Rules & alarms",
    path: "/rules-alarms", // AJUSTA
    description: [
      "Here you define your key risk and behavior rules and set alarms to warn you when you're about to cross a line.",
      "The goal is fewer 'I knew I shouldn’t have done that' moments, and more structure protecting you from your worst impulses.",
    ],
  },
  {
    id: 9,
    name: "Global Ranking & XP",
    title: "Step 9 · Global ranking & XP",
    path: "/ranking", // AJUSTA
    description: [
      "Global Ranking & XP turns your progress into a game: you earn experience for disciplined behavior and consistent execution, not just P&L.",
      "You can track levels, streaks and ranking over time to stay motivated to show up as a professional.",
    ],
  },
];

export default function QuickTourOverlay({
  onboardingCompleted,
}: QuickTourOverlayProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  const currentStep = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

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
    setStepIndex((prev) => Math.min(prev + 1, TOUR_STEPS.length - 1));
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
          {TOUR_STEPS.map((s, idx) => (
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
          Step {stepIndex + 1} of {TOUR_STEPS.length}
        </p>
        <h2 className="text-sm md:text-base font-semibold text-slate-50 mb-2">
          {currentStep.title}
        </h2>
        <p className="text-[10px] text-slate-500 mb-3">
          You&apos;re currently on:{" "}
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
              For more tutorials and live breakdowns you can also follow us on:
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
            Skip tour
          </button>

          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-3 py-1.5 rounded-xl border border-slate-700 text-[11px] text-slate-200 hover:border-emerald-400 hover:text-emerald-100"
              >
                Previous
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-emerald-400 text-slate-950 text-[11px] font-semibold hover:bg-emerald-300 disabled:opacity-60"
            >
              {saving
                ? "Finishing…"
                : isLastStep
                ? "Finish & go to dashboard"
                : "Next step"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
