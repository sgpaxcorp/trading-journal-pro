// app/challenges/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

import {
  CHALLENGES,
  type ChallengeId,
  type ChallengeDefinition,
  type ChallengeProgress,
  getAllChallengeProgress,
  startChallenge,
} from "@/lib/challengesSupabase";

import {
  getProfileGamification,
  type ProfileGamification,
} from "@/lib/profileGamificationSupabase";

/* =========================
   Tipos locales
========================= */

type ProgressMap = Partial<Record<ChallengeId, ChallengeProgress | null>>;
type DialogMode = "start" | "restart" | null;

/* =========================
   Helpers
========================= */

function getStatusLabel(status?: string | null) {
  if (!status) return "Not started";
  if (status === "active") return "Active";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "restarted") return "Restarted";
  return status;
}

function getStatusColorClasses(status?: string | null) {
  if (!status) return "text-slate-300";
  if (status === "active") return "text-emerald-300";
  if (status === "completed") return "text-emerald-400";
  if (status === "failed") return "text-sky-300";
  if (status === "restarted") return "text-slate-300";
  return "text-slate-300";
}

function pct(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/* =========================
   Main page
========================= */

export default function ChallengesPage() {
  const { user, loading } = useAuth() as any;

  const userId = useMemo(() => user?.id || "", [user]);

  const [progressMap, setProgressMap] = useState<ProgressMap>({});
  const [profile, setProfile] = useState<ProfileGamification | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedChallenge, setSelectedChallenge] =
    useState<ChallengeDefinition | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------- Cargar progreso y perfil ---------- */
  useEffect(() => {
    if (loading || !userId) return;

    const run = async () => {
      try {
        setError(null);

        // Latest run per challenge
        const all = await getAllChallengeProgress(userId);

        const map: ProgressMap = {};
        for (const c of CHALLENGES) map[c.id] = null;
        for (const p of all) map[p.challengeId] = p;

        setProgressMap(map);

        // snapshot gamification
        const g = await getProfileGamification(userId, {
          syncToDb: true,
          fallbackToDbCache: true,
        });
        setProfile(g);
      } catch (e: any) {
        console.error("[ChallengesPage] load error:", e);
        setError(e?.message ?? "Failed to load challenges.");
      }
    };

    void run();
  }, [loading, userId]);

  /* ---------- Dialog handlers ---------- */

  function openDialog(challenge: ChallengeDefinition, mode: DialogMode) {
    setSelectedChallenge(challenge);
    setDialogMode(mode);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setDialogMode(null);
    setSelectedChallenge(null);
  }

  async function handleConfirmChallenge() {
    if (!selectedChallenge || !dialogMode || !userId) return;

    try {
      setBusy(true);
      setError(null);

      // startChallenge serves as restart
      const updated = await startChallenge(userId, selectedChallenge.id);

      setProgressMap((prev) => ({
        ...prev,
        [selectedChallenge.id]: updated,
      }));

      // refresh gamification
      const g = await getProfileGamification(userId, {
        syncToDb: true,
        fallbackToDbCache: true,
      });
      setProfile(g);

      closeDialog();
    } catch (e: any) {
      console.error("[ChallengesPage] confirm error:", e);
      setError(e?.message ?? "Failed to start challenge.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Challenges</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">
              Structured missions to build consistency, discipline, and risk control.
              The point is to win on process, not chase P&amp;L.
            </p>
          </div>

          {profile && (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200">
              <p>
                Level{" "}
                <span className="font-semibold text-emerald-100">
                  {profile.level}
                </span>{" "}
                · Tier{" "}
                <span className="font-semibold text-emerald-100">
                  {profile.tier}
                </span>
              </p>
              <p className="mt-1">
                {profile.xp.toLocaleString()} XP • {profile.badges.length} badges
                unlocked
              </p>
            </div>
          )}
        </header>

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}

        {/* Cards */}
        <section className="grid gap-6 md:grid-cols-2">
          {CHALLENGES.map((c) => {
            const progress = progressMap[c.id];
            const status = progress?.status ?? null;

            const greenDays = progress?.processGreenDays ?? 0;
            const tracked = progress?.daysTracked ?? 0;

            const pctGreen = c.durationDays > 0 ? pct((greenDays / c.durationDays) * 100) : 0;
            const pctTracked = c.durationDays > 0 ? pct((tracked / c.durationDays) * 100) : 0;

            const statusLabel = getStatusLabel(status);
            const statusClasses = getStatusColorClasses(status);

            const isActive = status === "active";

            return (
              <article
                key={c.id}
                className="relative flex flex-col rounded-3xl border border-emerald-500/15 bg-slate-900/70 px-5 py-5 shadow-[0_0_40px_rgba(16,185,129,0.12)]"
              >
                {/* Title & description */}
                <div className="flex-1 space-y-2">
                  <h2 className="text-xl font-semibold text-slate-50">
                    {c.title}
                  </h2>
                  <p className="text-sm text-slate-300">{c.shortDescription}</p>

                  <p className="mt-3 text-[11px] font-semibold text-emerald-400">
                    DURATION: {c.durationDays} DAYS
                  </p>
                  <p className="text-sm text-slate-200">{c.highlight}</p>

                  <ul className="mt-3 space-y-1 text-sm text-slate-300">
                    {c.benefits.map((b) => (
                      <li key={b}>• {b}</li>
                    ))}
                  </ul>
                </div>

                {/* Status + progress */}
                <div className="mt-4 flex items-end justify-between text-xs">
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-400">Status</p>
                    <p className={`text-sm font-medium ${statusClasses}`}>
                      {statusLabel}
                    </p>
                  </div>

                  <div className="text-right space-y-1">
                    <p className="text-[11px] text-slate-400">
                      Process-green days
                    </p>
                    <p className="text-sm font-semibold text-slate-100">
                      {greenDays} / {c.durationDays}
                    </p>
                  </div>
                </div>

                {/* Progress bars */}
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                    <span>Tracked</span>
                    <span>
                      {tracked} / {c.durationDays}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-900 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sky-400"
                      style={{ width: `${pctTracked}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 mb-1">
                    <span>Green days</span>
                    <span>{pctGreen.toFixed(0)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-900 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${pctGreen}%` }}
                    />
                  </div>

                  <p className="mt-2 text-[10px] text-slate-500">
                    Track daily check-ins on the detail page. XP is awarded per check-in
                    and bonus XP unlocks on completion.
                  </p>
                </div>

                {/* Actions */}
                <div className="mt-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => openDialog(c, isActive ? "restart" : "start")}
                    className="rounded-full bg-emerald-400 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-300 transition disabled:opacity-60"
                    disabled={busy || !userId}
                  >
                    {isActive ? "Restart" : "Start challenge"}
                  </button>

                  <Link
                    href={`/challenges/${c.id}`}
                    className="text-xs text-emerald-300 underline underline-offset-4 hover:text-emerald-200"
                  >
                    View details
                  </Link>
                </div>
              </article>
            );
          })}
        </section>

        <p className="mt-6 text-[11px] text-slate-500">
          Tip: challenges are stored in your Supabase account. Daily check-ins create
          a challenge history. The AI coach can reference this to coach your process.
        </p>
      </main>

      {/* Dialog para Start / Restart */}
      {dialogOpen && selectedChallenge && dialogMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
            <p className="text-[11px] uppercase tracking-wide text-emerald-300 mb-1">
              {dialogMode === "start" ? "Start challenge" : "Restart challenge"}
            </p>
            <h2 className="text-lg font-semibold text-slate-50 mb-2">
              {selectedChallenge.title}
            </h2>

            <p className="text-sm text-slate-300 mb-3">
              This mission is about{" "}
              <span className="font-semibold">
                consistency, discipline and risk control
              </span>
              . Before you begin, please read and acknowledge the rules:
            </p>

            <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-slate-200">
              <li>
                Each day can be marked as{" "}
                <span className="font-semibold">process-green</span> only if you
                respect max loss and complete your journal.
              </li>
              <li>
                The goal is to reach{" "}
                <span className="font-semibold">
                  at least 2/3 of the {selectedChallenge.durationDays} days
                </span>{" "}
                as process-green.
              </li>
              <li>
                XP is awarded per day. Completing the challenge unlocks a badge.
              </li>
            </ul>

            <p className="mb-4 text-[11px] text-slate-400">
              By continuing, you agree to focus on{" "}
              <span className="font-semibold">process over P&amp;L</span> for the
              duration of this challenge.
            </p>

            <div className="flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800"
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmChallenge}
                className="rounded-full bg-emerald-400 px-4 py-1 font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                disabled={busy}
              >
                {busy
                  ? "Working..."
                  : dialogMode === "start"
                  ? "I understand, start"
                  : "I understand, restart"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
