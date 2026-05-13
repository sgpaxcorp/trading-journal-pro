"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TopNav from "@/app/components/TopNav";
import TrophyToasts, { type TrophyToastItem } from "@/app/components/TrophyToasts";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import {
  getPublicUserProfile,
  listPublicLeaderboard,
  syncMyTrophies,
  type PublicLeaderboardRow,
  type PublicUserProfile,
} from "@/lib/trophiesSupabase";

function tierPill(tier?: string | null) {
  const t = (tier || "").toLowerCase();
  if (t === "elite") return "bg-violet-500/15 text-violet-200 border-violet-400/40";
  if (t === "gold") return "bg-amber-500/15 text-amber-200 border-amber-400/40";
  if (t === "silver") return "bg-slate-400/15 text-slate-100 border-slate-300/40";
  return "bg-emerald-500/15 text-emerald-200 border-emerald-400/40";
}

function tierLabel(tier: string | null | undefined, lang: "en" | "es") {
  const t = (tier || "").toLowerCase();
  const map: Record<string, { en: string; es: string }> = {
    elite: { en: "Elite", es: "Elite" },
    gold: { en: "Gold", es: "Oro" },
    silver: { en: "Silver", es: "Plata" },
    bronze: { en: "Bronze", es: "Bronce" },
  };
  return map[t]?.[lang] ?? (lang === "es" ? "Bronce" : "Bronze");
}

export default function GlobalRankingPage() {
  const { user, loading } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [rows, setRows] = useState<PublicLeaderboardRow[]>([]);
  const [me, setMe] = useState<PublicUserProfile | null>(null);
  const [loadingRows, setLoadingRows] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [toasts, setToasts] = useState<TrophyToastItem[]>([]);

  // Keep as a plain string so TS doesn't spread `string | undefined` everywhere.
  // When `user` isn't ready yet, this becomes "" and we guard accordingly.
  const userId: string = (user?.id as string) ?? "";
  const hasValidRank = typeof me?.rank === "number" && me.rank > 0;

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
          setError(L("We couldn't load the global ranking. Please try again.", "No pudimos cargar el ranking global. Intenta de nuevo."));
          setLoadingRows(false);
        }
      }
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [loading, userId]);

  async function handleShowInRanking() {
    if (!userId) return;
    setVisibilitySaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabaseBrowser
        .from("profiles")
        .update({ show_in_ranking: true })
        .eq("id", userId);
      if (updateError) throw updateError;

      const [board, mine] = await Promise.all([
        listPublicLeaderboard(25),
        getPublicUserProfile(userId),
      ]);
      setRows(board || []);
      setMe(mine || null);
    } catch (err) {
      console.error("[GlobalRanking] Visibility update error:", err);
      setError(
        L(
          "We couldn't update your ranking visibility. Please try again.",
          "No pudimos actualizar tu visibilidad en el ranking. Intenta de nuevo."
        )
      );
    } finally {
      setVisibilitySaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-400">{L("Loading…", "Cargando…")}</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <TrophyToasts
        items={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />

      <div className="max-w-6xl mx-auto px-6 md:px-8 py-6 space-y-5">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-300">
              {L("Community", "Comunidad")}
            </p>
            <h1 className="text-2xl font-semibold mt-1">{L("Global Ranking", "Ranking global")}</h1>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl">
              {L(
                "Consistency leaderboard based on challenge XP and trophy XP earned across the platform. This is not a profit leaderboard.",
                "Ranking de consistencia basado en XP de retos y XP de trofeos ganados en la plataforma. No es un ranking de ganancias."
              )}
            </p>
          </div>

          {userId && (
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                {L("Dashboard", "Dashboard")}
              </Link>
              <Link
                href={`/globalranking/${userId}`}
                className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-100 hover:border-emerald-400 hover:text-emerald-200 transition"
              >
                {L("My trophies", "Mis trofeos")}
              </Link>
            </div>
          )}
        </header>

        {/* My snapshot */}
        {userId && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-slate-400">{L("Your snapshot", "Tu resumen")}</p>
                <p className="mt-1 text-sm text-slate-200">
                  {hasValidRank ? (
                    <>
                      {L("Your rank:", "Tu rango:")}{" "}
                      <span className="font-semibold text-emerald-200">#{me?.rank}</span>
                      {me ? (
                        <>
                          {" "}({me.xp_total?.toLocaleString?.() ?? me.xp_total} XP · {me.trophies_count}{" "}
                          {L("trophies", "trofeos")})
                        </>
                      ) : null}
                    </>
                  ) : me?.show_in_ranking ? (
                    <>
                      {me.xp_total?.toLocaleString?.() ?? me.xp_total} XP · {me.trophies_count}{" "}
                      {L("trophies", "trofeos")}
                      <span className="text-slate-500"> · {L("Not in the top 25 yet", "Aún no estás en el top 25")}</span>
                    </>
                  ) : me ? (
                    <span>
                      {me.xp_total?.toLocaleString?.() ?? me.xp_total} XP · {me.trophies_count}{" "}
                      {L("trophies", "trofeos")}
                      <span className="text-slate-500">
                        {" "}· {L("Hidden from the ranking", "Oculto del ranking")}
                      </span>
                    </span>
                  ) : (
                    <span className="text-slate-500">{L("Loading…", "Cargando…")}</span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                {me && !me.show_in_ranking && (
                  <button
                    type="button"
                    disabled={visibilitySaving}
                    onClick={handleShowInRanking}
                    className="rounded-full border border-emerald-500/30 bg-emerald-400 px-3 py-1 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {visibilitySaving ? L("Updating…", "Actualizando…") : L("Show me in ranking", "Mostrarme en ranking")}
                  </button>
                )}
                <span className="rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1">
                  {L("Showing top", "Mostrando top")}{" "}
                  <span className="text-slate-200 font-semibold">25</span>
                </span>
                {syncing && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                    {L("Checking trophies…", "Revisando trofeos…")}
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Leaderboard */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-100">{L("Top consistency ranking", "Top ranking de consistencia")}</h2>
            <p className="text-[11px] text-slate-400">
              {L("Updated as users earn trophies and accumulate XP.", "Se actualiza a medida que los usuarios ganan trofeos y acumulan XP.")}
            </p>
          </div>

          {error && <p className="px-5 py-4 text-xs text-red-300">{error}</p>}

          {loadingRows ? (
            <p className="px-5 py-6 text-sm text-slate-400">{L("Loading leaderboard…", "Cargando ranking…")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-5 py-3">{L("Rank", "Rango")}</th>
                    <th className="text-left px-5 py-3">{L("Trader", "Trader")}</th>
                    <th className="text-left px-5 py-3">{L("Tier", "Nivel")}</th>
                    <th className="text-right px-5 py-3">XP</th>
                    <th className="text-right px-5 py-3">{L("Trophies", "Trofeos")}</th>
                    <th className="text-right px-5 py-3">&nbsp;</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8">
                        <div className="max-w-2xl">
                          <p className="text-sm font-semibold text-slate-100">
                            {L("No public ranking entries yet.", "Todavía no hay usuarios visibles en el ranking.")}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-400">
                            {L(
                              "Users appear here once ranking visibility is enabled and they have challenge or trophy XP. Only display name, XP, tier and trophies are shown.",
                              "Los usuarios aparecen aquí cuando tienen la visibilidad del ranking activa y XP de retos o trofeos. Solo se muestra nombre público, XP, nivel y trofeos."
                            )}
                          </p>
                          {me && !me.show_in_ranking && (
                            <button
                              type="button"
                              disabled={visibilitySaving}
                              onClick={handleShowInRanking}
                              className="mt-4 rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {visibilitySaving ? L("Updating…", "Actualizando…") : L("Show my profile", "Mostrar mi perfil")}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {rows.map((r, idx) => {
                    const isMe = r.user_id === userId;
                    const name = r.display_name || L("Trader", "Trader");
                    const rank = typeof r.rank === "number" && r.rank > 0 ? r.rank : idx + 1;

                    return (
                      <tr
                        key={r.user_id}
                        className={isMe ? "bg-emerald-500/5" : "hover:bg-slate-900/70"}
                      >
                        <td className="px-5 py-4 text-slate-200 font-semibold">#{rank}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-100">{name}</span>
                            {isMe && (
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                                {L("You", "Tú")}
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
                            {tierLabel(r.tier, lang)}
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
                            {L("View trophies →", "Ver trofeos →")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <p className="px-5 py-4 text-[11px] text-slate-500">
                {L(
                  "Privacy note: profiles show only trophies earned and public ranking stats. Ranking is opt-in. No email, phone or address is exposed.",
                  "Nota de privacidad: los perfiles muestran solo trofeos ganados y estadísticas públicas. El ranking es opcional. No se expone email, teléfono ni dirección."
                )}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
