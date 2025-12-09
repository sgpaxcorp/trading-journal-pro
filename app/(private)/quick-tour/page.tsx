"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { supabaseBrowser } from "@/lib/supaBaseClient";
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

const steps: Step[] = [
  {
    id: 1,
    name: "Growth Plan",
    title: "Step 1 · Build your Growth Plan",
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_1",
    body: [
      "In the Growth Plan section you define who you want to be as a trader: style, risk per trade, sessions per week and your non-negotiable rules.",
      "This becomes the contract between you and your more disciplined future version, so the whole platform knows what “trading on-plan” means for you.",
    ],
  },
  {
    id: 2,
    name: "Dashboard",
    title: "Step 2 · Dashboard overview",
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_2",
    body: [
      "The dashboard gives you a high-signal overview: green streaks, P&L calendar, your best instruments and your main self-sabotage patterns.",
      "You can rearrange and resize widgets so the first screen you see every day is the one that actually moves your performance forward.",
    ],
  },
  {
    id: 3,
    name: "Performance",
    title: "Step 3 · Performance analytics",
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_3",
    body: [
      "Performance breaks your trading down by instrument, time of day, setup, weekday and more, so you can attack specific leaks instead of guessing.",
      "This is where you’ll see hard evidence of where you print money, where you bleed, and which rules are costing you the most when you break them.",
    ],
  },
  {
    id: 4,
    name: "Notebook",
    title: "Step 4 · Notebook & playbook",
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_4",
    body: [
      "The Notebook is your space to document playbooks, pre-market plans, key lessons, screenshots and mindset notes.",
      "Over time this becomes your personal trading manual — not generic advice, but patterns and rules that are proven in your own data.",
    ],
  },
  {
    id: 5,
    name: "Back-Studying",
    title: "Step 5 · Back-Study your trades",
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_5",
    body: [
      "Back-Studying lets you see each trade on the underlying chart, so you can review entries, exits and timing with brutal honesty.",
      "You’ll quickly spot if you’re cutting winners too early, holding losers too long, or entering in the middle of nowhere instead of at your levels.",
    ],
  },
  {
    id: 6,
    name: "Challenges",
    title: "Step 6 · Challenges & behavior change",
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_6",
    body: [
      "Challenges are short, focused missions to build specific habits: respecting max loss, taking only A+ setups, following your morning routine, etc.",
      "Instead of trying to fix everything at once, you’ll work on one or two behaviors at a time and track progress like a training program.",
    ],
  },
  {
    id: 7,
    name: "Resources",
    title: "Step 7 · Resources & help center",
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_7",
    body: [
      "The Resources area centralizes PDFs, mini-guides, checklists and links to tutorials so you don’t have to dig through emails or chats.",
      "Whenever we release new features or frameworks, you’ll find the latest material here so you can plug it into your routine fast.",
    ],
  },
  {
    id: 8,
    name: "Rules & Alarms",
    title: "Step 8 · Rules & alarms",
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_8",
    body: [
      "Here you can define your key risk and behavior rules and set alarms to warn you when you’re about to cross a line.",
      "The goal is simple: fewer “I knew I shouldn’t have done that” moments, and more structure protecting you from your worst impulses.",
    ],
  },
  {
    id: 9,
    name: "Global Ranking & XP",
    title: "Step 9 · Global ranking & XP",
    videoUrl: "https://www.youtube.com/embed/VIDEO_ID_9",
    body: [
      "Global Ranking & XP turns your progress into a game: you earn experience for disciplined behavior and consistent execution, not just P&L.",
      "You’ll be able to track levels, streaks and ranking over time, so you stay motivated to show up as a professional — even on the days the market doesn’t pay you.",
    ],
  },
];

export default function QuickTourPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

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
              Quick tour · 3–4 minutes
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-slate-50 mb-1">
              Welcome to your NeuroTrader Journal.
            </h1>
            <p className="text-xs md:text-sm text-slate-400 max-w-xl">
              Before you start logging trades, let&apos;s walk through the core
              areas so you can squeeze the maximum edge out of the platform.
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
              Step {stepIndex + 1} of {steps.length}
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
              Replace the video URLs with your actual tutorials (YouTube, Loom,
              Vimeo, etc.). Each step can be a short 60–120s walkthrough.
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
                  If you want step-by-step video tutorials for each module,
                  you&apos;ll find them inside the Help section and on our
                  social channels:
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
                  Replace these links with your official accounts so traders
                  always know where to find tutorials, Q&amp;A and platform
                  updates.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] md:text-xs text-slate-400 max-w-md">
            When you finish this tour we&apos;ll take you straight to your
            dashboard so you can log your next session with this structure in
            mind.
          </p>

          <div className="flex gap-2 justify-end">
            {/* Skip button */}
            <button
              type="button"
              onClick={markOnboardingAndGo}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-700 text-[11px] md:text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-100 disabled:opacity-50"
            >
              Skip tour
            </button>

            {/* Prev / Next / Finish */}
            {stepIndex > 0 && !isLastStep && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2 rounded-xl border border-slate-700 text-[11px] md:text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-100"
              >
                Previous
              </button>
            )}

            {!isLastStep && (
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 rounded-xl bg-slate-200 text-slate-900 text-[11px] md:text-xs font-semibold hover:bg-white/90"
              >
                Next step
              </button>
            )}

            {isLastStep && (
              <button
                type="button"
                onClick={markOnboardingAndGo}
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-[11px] md:text-xs font-semibold hover:bg-emerald-300 disabled:opacity-60 shadow-lg shadow-emerald-500/25"
              >
                {saving ? "Finishing…" : "Finish & go to dashboard"}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
