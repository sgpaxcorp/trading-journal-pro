"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TopNav from "@/app/components/TopNav";
import TrophyToasts, { type TrophyToastItem } from "@/app/components/TrophyToasts";
import { useAuth } from "@/context/AuthContext";
import {
  getPublicUserProfile,
  listPublicLeaderboard,
  syncMyTrophies,
  type PublicLeaderboardRow,
} from "@/lib/trophiesSupabase";

function tierPill(tier?: string | null) {
  const t = (tier || "").toLowerCase();
  if (t === "elite") return "bg-violet-500/15 text-violet-200 border-violet-400/40";
  if (t === "gold") return "bg-amber-500/15 text-amber-200 border-amber-400/40";
  if (t === "silver") return "bg-slate-400/15 text-slate-100 border-slate-300/40";
  return "bg-emerald-500/15 text-emerald-200 border-emerald-400/40";
}

export default function GlobalRankingPage() {
  const { user, loading } = useAuth() as any;

  const [rows, setRows] = useState<PublicLeaderboardRow[]>([]);
  const [me, setMe] = useState<PublicLeaderboardRow | null>(null);
  const [loadingRows, setLoadingRows] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [toasts, setToasts] = useState<TrophyToastItem[]>([]);

  // Keep as a plain string so TS doesn't spread `string | undefined` everywhere.
  // When `user` isn't ready yet, this becomes "" and we guard accordingly.
  const userId: string = (user?.id as string) ?? "";

  const myRankInTop25 = useMemo(() => {
    if (!userId) return null;
    const idx = rows.findIndex((r) => r.user_id === userId);
    if (idx < 0) return null;
    // Rank is derived from the ordering (we don't store it in DB).
    return idx + 1;
  }, [rows, userId]);

  // Auto-sync trophies on load (no button)
  useEffect(() => {
    if (loading) return;
    if (!userId) return;

    let cancelled = false;

    async function loadAll() {
      setError(null);
      setLoadingRows(true);

      try {
        // 1) Auto-sync trophies (silent UI except toast)
        setSyncing(true);
        const sync = await syncMyTrophies(userId);
        const newTrophies = sync?.newTrophies ?? [];

        if (!cancelled && newTrophies.length > 0) {
          setToasts((prev) => {
            const next = [...prev];
            for (const t of newTrophies) {
              next.push({
                id: t.trophy_id,
                title: t.title,
                xp: t.xp,
                tier: t.tier,
                icon: t.icon,
              });
            }
            return next.slice(-4);
          });
        }
      } catch (e) {
        // Trophy sync should never block the page
        console.warn("[GlobalRanking] Trophy auto-sync failed:", e);
      } finally {
        if (!cancelled) setSyncing(false);
      }

      try {
        // 2) Load leaderboard (top 25)
        const board = await listPublicLeaderboard(25);

        // 3) Load my public snapshot (for header stats)
        const mine = await getPublicUserProfile(userId);

        if (!cancelled) {
          setRows(board || []);
          setMe(mine || null);
          setLoadingRows(false);
        }
      } catch (e: any) {
        console.error("[GlobalRanking] Load error:", e);
        if (!cancelled) {
          setError("We couldn't load the global ranking. Please try again.");
          setLoadingRows(false);
        }
      }
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [loading, userId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-50">
      {/* Soft brand diffusions (works in both themes) */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute top-24 -right-40 h-[560px] w-[560px] rounded-full bg-sky-500/14 blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 h-[560px] w-[560px] rounded-full bg-violet-500/14 blur-3xl" />
      </div>

      <TopNav />

      <TrophyToasts
        items={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      <div className="max-w-6xl mx-auto px-6 md:px-8 py-8 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-300">
              Community
            </p>
            <h1 className="text-3xl font-semibold mt-1">Global Ranking</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              Leaderboard by total XP. XP includes challenge XP plus all trophies you earn
              across the platform.
            </p>
          </div>

          {userId && (
            <div className="flex items-center gap-2">
              <Link
                href={`/globalranking/${userId}`}
                className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                My trophies
              </Link>
            </div>
          )}
        </header>

        {/* My snapshot */}
        {userId && (
          <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-slate-400">Your snapshot</p>
                <p className="mt-1 text-sm text-slate-200">
                  {typeof myRankInTop25 === "number" ? (
                    <>
                      Your rank: <span className="font-semibold text-emerald-200">#{myRankInTop25}</span>
                      {me ? (
                        <>
                          {" "}({me.xp_total?.toLocaleString?.() ?? me.xp_total} XP · {me.trophies_count} trophies)
                        </>
                      ) : null}
                    </>
                  ) : me ? (
                    <>
                      {me.xp_total?.toLocaleString?.() ?? me.xp_total} XP · {me.trophies_count} trophies
                      <span className="text-slate-500"> · Not in the top 25 yet</span>
                    </>
                  ) : (
                    <span className="text-slate-500">Loading…</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1">
                  Showing top <span className="text-slate-200 font-semibold">25</span>
                </span>
                {syncing && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                    Checking trophies…
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Leaderboard */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-100">Top traders</h2>
            <p className="text-[11px] text-slate-400">Updated live as users earn trophies.</p>
          </div>

          {error && <p className="px-5 py-4 text-xs text-red-300">{error}</p>}

          {loadingRows ? (
            <p className="px-5 py-6 text-sm text-slate-400">Loading leaderboard…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-5 py-3">Rank</th>
                    <th className="text-left px-5 py-3">Trader</th>
                    <th className="text-left px-5 py-3">Tier</th>
                    <th className="text-right px-5 py-3">XP</th>
                    <th className="text-right px-5 py-3">Trophies</th>
                    <th className="text-right px-5 py-3">&nbsp;</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {rows.map((r, idx) => {
                    const isMe = r.user_id === userId;
                    const name = r.display_name || "Trader";

                    return (
                      <tr
                        key={r.user_id}
                        className={isMe ? "bg-emerald-500/5" : "hover:bg-slate-900/70"}
                      >
                        <td className="px-5 py-4 text-slate-200 font-semibold">#{idx + 1}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-100">{name}</span>
                            {isMe && (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                                You
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tierPill(
                              r.tier
                            )}`}
                          >
                            {r.tier || "Bronze"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-semibold text-slate-100">
                          {Number(r.xp_total || 0).toLocaleString()} 
                        </td>
                        <td className="px-5 py-4 text-right text-slate-200">
                          {Number(r.trophies_count || 0).toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/globalranking/${r.user_id}`}
                            className="text-xs font-semibold text-emerald-300 hover:text-emerald-200"
                          >
                            View trophies →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <p className="px-5 py-4 text-[11px] text-slate-500">
                Privacy note: profiles show only trophies earned and public ranking stats. No email,
                phone or address is exposed.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
