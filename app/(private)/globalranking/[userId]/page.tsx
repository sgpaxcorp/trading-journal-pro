"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import GlobalRealtimeNotifications from "@/app/components/GlobalRealtimeNotifications";

import TopNav from "@/app/components/TopNav";
import TrophyToasts, { type TrophyToastItem } from "@/app/components/TrophyToasts";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
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
  tierIconPath,
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

function tierLabel(tier: TrophyTier | string | null | undefined, lang: "en" | "es") {
  const t = String(tier || "").toLowerCase();
  const map: Record<string, { en: string; es: string }> = {
    elite: { en: "Elite", es: "Elite" },
    gold: { en: "Gold", es: "Oro" },
    silver: { en: "Silver", es: "Plata" },
    bronze: { en: "Bronze", es: "Bronce" },
  };
  return map[t]?.[lang] ?? (lang === "es" ? "Bronce" : "Bronze");
}

function TrophyCard({ item }: { item: TrophyCardItem }) {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const isLocked = !!item.locked;
  const iconSrc = !item.secret ? tierIconPath(item.tier) : null;

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
            {iconSrc ? (
              <img
                src={iconSrc}
                alt=""
                className={`h-7 w-7 object-contain ${isLocked ? "opacity-60" : ""}`}
              />
            ) : (
              <span>{isLocked ? "🔒" : "🏆"}</span>
            )}
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
                <span className="text-slate-300 font-medium">{L("To unlock:", "Para desbloquear:")}</span>{" "}
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
            {tierLabel(item.tier, lang)}
          </span>
          <span className="text-[10px] text-emerald-200 font-semibold">
            +{item.xp} XP
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px]">
        <span className="text-slate-400">{item.category}</span>
        <span className="text-slate-500">
          {item.earned_at
            ? new Date(item.earned_at).toLocaleDateString(lang)
            : isLocked
              ? L("Locked", "Bloqueado")
              : ""}
        </span>
      </div>
    </div>
  );
}

export default function GlobalRankingUserProfilePage() {
  const params = useParams<{ userId?: string }>();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
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
          ? L("Keep trading and journaling to reveal this trophy.", "Sigue operando y haciendo journal para revelar este trofeo.")
          : d.description;

        return {
          trophy_id: d.id,
          title,
          description,
          tier: d.tier,
          xp: d.xp,
          category: d.category,
          icon: d.icon ?? null,
          earned_at: null,
          locked: true,
          secret: d.secret ?? null,
          unlockHint: isSecret ? L("Hidden requirement", "Requisito oculto") : describeUnlock(d),
        };
      });
  }, [isMe, catalog, earned, L]);

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
                ← {L("Back to Global Ranking", "Volver al ranking global")}
              </Link>

              {isMe && (
                <span className="text-[11px] text-slate-400">
                  {L(
                    "New trophies appear automatically as you complete milestones.",
                    "Los nuevos trofeos aparecen automáticamente al completar metas."
                  )}
                </span>
              )}
            </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className="text-[11px] tracking-[0.25em] text-slate-400">
              {L("TRADER PROFILE", "PERFIL DEL TRADER")}
            </p>

            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              {profile?.display_name || (loading ? L("Loading...", "Cargando...") : L("Trader", "Trader"))}
            </h1>

            <p className="mt-2 text-sm text-slate-300">
              {profile ? (
                <>
                  <span className="text-emerald-200 font-semibold">
                    {profile.xp_total}
                  </span>{" "}
                  XP • {L("Level", "Nivel")} {profile.level} • {profile.trophies_count}{" "}
                  {L("trophies", "trofeos")}
                </>
              ) : (
                "—"
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{L("Tier", "Nivel")}</span>
            <span
              className={[
                "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
                tierStyles((profile?.tier || "Bronze") as TrophyTier),
              ].join(" ")}
            >
              {tierLabel(profile?.tier || "Bronze", lang)}
            </span>
          </div>
        </div>

        {/* View toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              {L("Trophies", "Trofeos")}
            </h2>
            <p className="text-[11px] text-slate-400">
              {isMe
                ? L("Your profile shows both earned and locked trophies.", "Tu perfil muestra trofeos ganados y bloqueados.")
                : L("Only earned trophies are visible to other traders.", "Solo los trofeos ganados son visibles para otros traders.")}
              {categoriesCount ? ` • ${L("Categories", "Categorías")}: ${categoriesCount}` : ""}
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
                {L("Earned", "Ganados")} ({earnedCards.length})
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
                {L("Locked", "Bloqueados")} ({lockedCards.length})
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
                {L("All", "Todos")} ({earnedCards.length + lockedCards.length})
              </button>
            </div>
          )}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="text-sm text-slate-400">{L("Loading trophies…", "Cargando trofeos…")}</div>
        ) : displayedCards.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedCards.map((t) => (
              <TrophyCard key={`${t.locked ? "L" : "E"}-${t.trophy_id}`} item={t} />
            ))}
          </div>
        ) : (
          <div className="text-sm text-slate-400">
            {L("No trophies yet. Start journaling to earn your first one.", "Aún no hay trofeos. Empieza a hacer journal para ganar el primero.")}
          </div>
        )}

        <div className="text-[11px] text-slate-500">
          {L(
            "Privacy note: profiles show trophies and public ranking stats only. No email, phone, or address is exposed.",
            "Nota de privacidad: los perfiles muestran solo trofeos y estadísticas públicas. No se expone email, teléfono ni dirección."
          )}
        </div>
      </div>
    </main>
  );
}
