// app/challenges/[id]/page.tsx
"use client";

import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import TopNav from "@/app/components/TopNav";
import {
  CHALLENGES,
  type ChallengeDefinition,
  type ChallengeProgress,
  getChallengeProgress,
  startChallenge,
} from "@/lib/challengesLocal";
import { getProfileGamification } from "@/lib/profileGamificationLocal";

type RouteParams = {
  id: string;
};

export default function ChallengeDetailPage() {
  const router = useRouter();
  const params = useParams() as unknown as RouteParams;

  const [definition, setDefinition] = useState<ChallengeDefinition | null>(null);
  const [progress, setProgress] = useState<ChallengeProgress | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    const def = CHALLENGES.find((c) => c.id === params.id);
    if (!def) {
      router.push("/challenges");
      return;
    }
    setDefinition(def);
    setProgress(getChallengeProgress(def.id));
  }, [params?.id, router]);

  const gamification = useMemo(() => getProfileGamification(), []);

  if (!definition) {
    return null;
  }

  const statusLabel =
    progress?.status?.replace("-", " ") ?? "not started";

  const handleStart = () => {
    const updated = startChallenge(definition.id);
    setProgress(updated);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-emerald-400">
              Challenge
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {definition.title}
            </h1>
            <p className="text-sm text-slate-400">
              {definition.shortDescription}
            </p>
          </div>

          <button
            type="button"
            onClick={handleStart}
            className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 transition"
          >
            {progress ? "Restart challenge" : "Start challenge"}
          </button>
        </div>

        <section className="grid gap-4 md:grid-cols-[2fr,1.2fr] mb-8">
          <article className="rounded-2xl border border-emerald-500/30 bg-slate-900/70 p-5">
            <p className="text-xs uppercase tracking-wide text-emerald-300">
              Overview
            </p>
            <p className="mt-2 text-sm text-slate-200">
              {definition.highlight}
            </p>

            <p className="mt-4 text-xs text-slate-400">
              Duration:{" "}
              <span className="font-medium text-slate-100">
                {definition.durationDays} days
              </span>
            </p>

            <ul className="mt-4 space-y-1.5 text-sm text-slate-300">
              {definition.benefits.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>

            <p className="mt-5 text-[11px] text-slate-400">
              Tip: track your process score each day (rules, risk and
              journaling). The more process-green days you stack, the faster
              you level up.
            </p>
          </article>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Status
              </p>
              <p className="mt-1 text-lg font-semibold text-emerald-300 capitalize">
                {statusLabel}
              </p>

              {progress && (
                <>
                  <p className="mt-3 text-xs text-slate-400">
                    Process-green days
                  </p>
                  <p className="text-sm font-medium text-slate-100">
                    {progress.processGreenDays} / {progress.daysTracked}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    Max loss rule breaks
                  </p>
                  <p className="text-sm font-medium text-slate-100">
                    {progress.maxLossBreaks}
                  </p>

                  <p className="mt-3 text-xs text-slate-400">
                    XP earned inside this challenge
                  </p>
                  <p className="text-sm font-medium text-emerald-300">
                    {progress.xpEarned.toLocaleString()} XP
                  </p>
                </>
              )}

              {!progress && (
                <p className="mt-3 text-xs text-slate-400">
                  You have not started this challenge yet. When you start,
                  your daily process scores will update this card.
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Profile snapshot
              </p>
              <p className="mt-1 text-sm text-slate-200">
                Level{" "}
                <span className="font-semibold">
                  {gamification.level}
                </span>{" "}
                • Tier{" "}
                <span className="font-semibold">
                  {gamification.tier}
                </span>
              </p>
              <p className="mt-1 text-xs text-emerald-300">
                {gamification.xp.toLocaleString()} XP total
              </p>

              {gamification.badges.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {gamification.badges.map((b) => (
                    <span
                      key={b}
                      className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </section>

        <div className="mt-4 text-xs text-slate-400 flex items-center justify-between">
          <Link
            href="/challenges"
            className="text-emerald-300 hover:text-emerald-200 underline underline-offset-4"
          >
            ← Back to all challenges
          </Link>
          <p>
            Your AI coach will read this challenge and your progress to
            personalize suggestions.
          </p>
        </div>
      </main>
    </div>
  );
}
