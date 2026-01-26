"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import TopNav from "@/app/components/TopNav";
import TrophyToasts, { type TrophyToastItem } from "@/app/components/TrophyToasts";
import { useAuth } from "@/context/AuthContext";
import {
  describeUnlock,
  getPublicUserProfile,
  listPublicUserTrophies,
  listTrophyDefinitions,
  syncMyTrophies,
  type PublicUserProfile,
  type PublicUserTrophy,
  type TrophyDefinition,
  type TrophyTier,
} from "@/lib/trophiesSupabase";

type TrophyCardItem = {
  trophy_id: string;
  title: string;
  description: string;
  tier: TrophyTier;
  xp: number;
  category: string;
  icon?: string | null;
  earned_at: string | null;

  locked?: boolean;
  secret?: boolean | null;
  unlockHint?: string;
};

function tierStyles(tier: TrophyTier) {
  switch (tier) {
    case "Elite":
      return "border-violet-400/60 bg-violet-500/10 text-violet-200";
    case "Gold":
      return "border-amber-300/60 bg-amber-400/10 text-amber-200";
    case "Silver":
      return "border-slate-300/50 bg-slate-200/10 text-slate-200";
    case "Bronze":
    default:
      return "border-emerald-400/50 bg-emerald-500/10 text-emerald-200";
  }
}

function TrophyCard({ item }: { item: TrophyCardItem }) {
  const isLocked = !!item.locked;

  return (
    <div
      className={[
        "rounded-2xl border p-4 shadow-sm transition",
        isLocked
          ? "border-slate-800 bg-slate-950/60"
          : "border-slate-800 bg-slate-950/80 hover:border-emerald-400/40",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className={[
              "h-10 w-10 rounded-xl border flex items-center justify-center text-lg",
              isLocked
                ? "border-slate-800 bg-slate-900 text-slate-200"
                : "border-slate-800 bg-slate-900 text-slate-100",
            ].join(" ")}
          >
            <span>{item.icon ?? (isLocked ? "🔒" : "🏆")}</span>
          </div>

          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-slate-100 truncate">
              {item.title}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-300 leading-relaxed">
              {item.description}
            </p>

            {isLocked && item.unlockHint && (
              <p className="mt-2 text-[11px] text-slate-400">
                <span className="text-slate-300 font-medium">To unlock:</span>{" "}
                {item.unlockHint}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1">
          <span
            className={[
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              tierStyles(item.tier),
            ].join(" ")}
          >
            {item.tier}
          </span>
          <span className="text-[10px] text-emerald-200 font-semibold">
            +{item.xp} XP
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px]">
        <span className="text-slate-400">{item.category}</span>
        <span className="text-slate-500">
          {item.earned_at ? new Date(item.earned_at).toLocaleDateString() : isLocked ? "Locked" : ""}
        </span>
      </div>
    </div>
  );
}

export default function GlobalRankingUserProfilePage() {
  const params = useParams<{ userId?: string }>();
  const targetUserId = useMemo(() => {
    const v: any = (params as any)?.userId;
    return Array.isArray(v) ? v[0] : v;
  }, [params]);

  const { user } = useAuth() as any;

  const isMe = !!user?.id && !!targetUserId && String(user.id) === String(targetUserId);

  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [earned, setEarned] = useState<PublicUserTrophy[]>([]);
  const [catalog, setCatalog] = useState<TrophyDefinition[] | null>(null);

  const [view, setView] = useState<"earned" | "locked" | "all">("earned");

  const [toastItems, setToastItems] = useState<TrophyToastItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!targetUserId) return;
      setLoading(true);

      try {
        // If this is my profile, sync trophies first to surface new ones (and show toasts)
        if (isMe && user?.id) {
          try {
            const sync = await syncMyTrophies(String(user.id));
            const newTrophies = sync.newTrophies ?? [];
            if (!cancelled && newTrophies.length) {
              setToastItems((prev) => [
                ...newTrophies.map((t) => ({
                  id: t.trophy_id,
                  title: t.title,
                  subtitle: t.description,
                  xp: t.xp,
                  tier: t.tier,
                  icon: t.icon ?? null,
                })),
                ...prev,
              ]);
            }
          } catch (err) {
            console.warn("[GlobalRankingUserProfile] Trophy sync failed:", err);
          }
        }

        const [p, earnedTrophies] = await Promise.all([
          getPublicUserProfile(String(targetUserId)),
          listPublicUserTrophies(String(targetUserId), 500),
        ]);

        if (cancelled) return;

        setProfile(p);
        setEarned(earnedTrophies);

        // Only load full catalog for self (so we can show locked trophies)
        if (isMe) {
          const defs = await listTrophyDefinitions({ includeSecret: true });
          if (!cancelled) setCatalog(defs);
        } else {
          setCatalog(null);
        }
      } catch (err) {
        console.error("[GlobalRankingUserProfile] Load error:", err);
        if (!cancelled) {
          setProfile(null);
          setEarned([]);
          setCatalog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [targetUserId, isMe, user?.id]);

  const earnedCards: TrophyCardItem[] = useMemo(() => {
    return earned.map((t) => ({
      trophy_id: t.trophy_id,
      title: t.title,
      description: t.description,
      tier: t.tier,
      xp: t.xp,
      category: t.category,
      icon: t.icon ?? null,
      earned_at: t.earned_at,
    }));
  }, [earned]);

  const lockedCards: TrophyCardItem[] = useMemo(() => {
    if (!isMe || !catalog) return [];

    const earnedIds = new Set(earned.map((t) => t.trophy_id));

    return catalog
      .filter((d) => !earnedIds.has(d.id))
      .map((d) => {
        const isSecret = !!d.secret;
        const title = isSecret ? "Secret trophy" : d.title;
        const description = isSecret
          ? "Keep trading and journaling to reveal this trophy."
          : d.description;

        return {
          trophy_id: d.id,
          title,
          description,
          tier: d.tier,
          xp: d.xp,
          category: d.category,
          icon: isSecret ? "🔒" : d.icon ?? "🏆",
          earned_at: null,
          locked: true,
          secret: d.secret ?? null,
          unlockHint: isSecret ? "Hidden requirement" : describeUnlock(d),
        };
      });
  }, [isMe, catalog, earned]);

  const displayedCards = useMemo(() => {
    if (!isMe) return earnedCards;

    if (view === "locked") return lockedCards;
    if (view === "all") return [...earnedCards, ...lockedCards];
    return earnedCards;
  }, [earnedCards, lockedCards, view, isMe]);

  const categoriesCount = useMemo(() => {
    const set = new Set<string>();
    earnedCards.forEach((t) => set.add(t.category));
    if (isMe) lockedCards.forEach((t) => set.add(t.category));
    return set.size;
  }, [earnedCards, lockedCards, isMe]);

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <TrophyToasts
        items={toastItems}
        onDismiss={(id) =>
          setToastItems((prev) => prev.filter((t) => t.id !== id))
        }
      />

      <div className="max-w-6xl mx-auto px-6 md:px-8 py-10 space-y-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/globalranking"
            className="text-sm text-slate-300 hover:text-emerald-300 transition"
          >
            ← Back to Global Ranking
          </Link>

          {isMe && (
            <span className="text-[11px] text-slate-400">
              New trophies appear automatically as you complete milestones.
            </span>
          )}
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[11px] tracking-[0.25em] text-slate-400">
              TRADER PROFILE
            </p>

            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              {profile?.display_name || (loading ? "Loading..." : "Trader")}
            </h1>

            <p className="mt-2 text-sm text-slate-300">
              {profile ? (
                <>
                  <span className="text-emerald-200 font-semibold">
                    {profile.xp_total}
                  </span>{" "}
                  XP • Level {profile.level} • {profile.trophies_count}{" "}
                  trophies
                </>
              ) : (
                "—"
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Tier</span>
            <span
              className={[
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                tierStyles((profile?.tier || "Bronze") as TrophyTier),
              ].join(" ")}
            >
              {profile?.tier || "Bronze"}
            </span>
          </div>
        </div>

        {/* View toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Trophies
            </h2>
            <p className="text-[11px] text-slate-400">
              {isMe
                ? "Your profile shows both earned and locked trophies."
                : "Only earned trophies are visible to other traders."}
              {categoriesCount ? ` • Categories: ${categoriesCount}` : ""}
            </p>
          </div>

          {isMe && (
            <div className="flex items-center gap-2 text-[12px]">
              <button
                type="button"
                onClick={() => setView("earned")}
                className={[
                  "rounded-full px-3 py-1 border transition",
                  view === "earned"
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700",
                ].join(" ")}
              >
                Earned ({earnedCards.length})
              </button>
              <button
                type="button"
                onClick={() => setView("locked")}
                className={[
                  "rounded-full px-3 py-1 border transition",
                  view === "locked"
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700",
                ].join(" ")}
              >
                Locked ({lockedCards.length})
              </button>
              <button
                type="button"
                onClick={() => setView("all")}
                className={[
                  "rounded-full px-3 py-1 border transition",
                  view === "all"
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
                    : "border-slate-800 bg-slate-900/60 text-slate-200 hover:border-slate-700",
                ].join(" ")}
              >
                All ({earnedCards.length + lockedCards.length})
              </button>
            </div>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-sm text-slate-400">Loading trophies…</div>
        ) : displayedCards.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedCards.map((t) => (
              <TrophyCard key={`${t.locked ? "L" : "E"}-${t.trophy_id}`} item={t} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-400">
            No trophies yet. Start journaling to earn your first one.
          </div>
        )}

        <div className="text-[11px] text-slate-500">
          Privacy note: profiles show trophies and public ranking stats only. No
          email, phone, or address is exposed.
        </div>
      </div>
    </main>
  );
}
