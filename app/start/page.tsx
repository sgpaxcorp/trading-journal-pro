"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext"; // ajusta si usas alias "@/..."
import Link from "next/link";

/**
 * 🔧 TEXT & STYLE CONFIG (edit here freely)
 */
const START_COPY = {
  titlePrefix: "Welcome,",
  fallbackName: "trader",
  emoji: "👋",
  subtitle: "Your growth plan starts here.",
  description:
    "We’ll help you define a clear account growth plan, align it with your risk, and build a psychology-first trading routine.",
  stepsTitle: "In the next steps you will:",
  steps: [
    "Set your account size and growth target.",
    "Define your max daily and weekly loss limits.",
    "Write your personal trading rules and emotional triggers.",
    "Start journaling each session with guided templates.",
  ],
  primaryCtaLabel: "Start from here",
  primaryCtaHref: "/growth-plan",
  secondaryCtaLabel: "Go to dashboard",
  secondaryCtaHref: "/dashboard",
  homeCtaLabel: "Back to home",
  homeCtaHref: "/",
  footerNote:
    "You can refine your growth plan anytime. Consistency beats intensity.",
  loadingMessage: "Loading your workspace...",
};

const START_STYLES = {
  main: "min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4",
  loadingMain: "min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center",
  loadingText: "text-xs text-slate-400",
  card:
    "w-full max-w-2xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5",
  title: "text-2xl font-semibold",
  subtitle: "text-xs text-emerald-400",
  description: "text-xs text-slate-300",
  stepsTitle: "text-[11px] font-semibold text-slate-200",
  stepsList: "list-decimal list-inside space-y-2 text-[11px] text-slate-300",
  ctasWrapper: "flex flex-wrap gap-3 mt-4",
  primaryCta:
    "inline-flex px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 shadow-lg shadow-emerald-500/20",
  secondaryCta:
    "inline-flex px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-[10px] hover:border-emerald-400",
  homeCta:
    "inline-flex px-4 py-2.5 rounded-xl text-[10px] text-slate-400 hover:text-emerald-300",
  footerNote: "text-[9px] text-slate-500 mt-3",
};

export default function StartPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className={START_STYLES.loadingMain}>
        <p className={START_STYLES.loadingText}>
          {START_COPY.loadingMessage}
        </p>
      </main>
    );
  }

  const displayName = user.name || START_COPY.fallbackName;

  return (
    <main className={START_STYLES.main}>
      <div className={START_STYLES.card}>
        {/* Title */}
        <h1 className={START_STYLES.title}>
          {START_COPY.titlePrefix} {displayName} {START_COPY.emoji}
        </h1>

        {/* Subtitle */}
        <p className={START_STYLES.subtitle}>{START_COPY.subtitle}</p>

        {/* Description */}
        <p className={START_STYLES.description}>{START_COPY.description}</p>

        {/* Steps intro */}
        {START_COPY.stepsTitle && (
          <p className={START_STYLES.stepsTitle}>
            {START_COPY.stepsTitle}
          </p>
        )}

        {/* Steps list */}
        <ol className={START_STYLES.stepsList}>
          {START_COPY.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>

        {/* CTAs */}
        <div className={START_STYLES.ctasWrapper}>
          {/* Primary: Start from here */}
          <Link href={START_COPY.primaryCtaHref} className={START_STYLES.primaryCta}>
            {START_COPY.primaryCtaLabel}
          </Link>

          {/* Secondary: Dashboard */}
          <Link
            href={START_COPY.secondaryCtaHref}
            className={START_STYLES.secondaryCta}
          >
            {START_COPY.secondaryCtaLabel}
          </Link>

          {/* Home button */}
          <Link href={START_COPY.homeCtaHref} className={START_STYLES.homeCta}>
            {START_COPY.homeCtaLabel}
          </Link>
        </div>

        {/* Footer note */}
        <p className={START_STYLES.footerNote}>
          {START_COPY.footerNote}
        </p>
      </div>
    </main>
  );
}
