"use client";

import { useEffect, useMemo } from "react";
import { tierIconPath } from "@/lib/trophiesSupabase";

export type TrophyToastItem = {
  /** Unique id for dismissing a single toast */
  id: string;
  title: string;
  subtitle?: string;
  xp?: number;
  tier?: string;
  icon?: string | null;
};

type Props = {
  items: TrophyToastItem[];
  /** Preferred: dismiss a single toast */
  onDismiss?: (id: string) => void;
  /** Back-compat: clear all toasts */
  onClear?: () => void;
};

function tierPill(tier?: string) {
  const t = (tier || "").toLowerCase();
  if (t === "elite")
    return "border-violet-400/60 bg-violet-500/10 text-violet-200";
  if (t === "gold") return "border-amber-300/60 bg-amber-400/10 text-amber-200";
  if (t === "silver")
    return "border-slate-300/50 bg-slate-200/10 text-slate-200";
  return "border-emerald-400/50 bg-emerald-500/10 text-emerald-200";
}

export default function TrophyToasts({ items, onDismiss, onClear }: Props) {
  // Auto-clear after a few seconds per toast (staggered)
  const ids = useMemo(() => items.map((i) => i.id), [items]);

  useEffect(() => {
    if (!items.length) return;

    const timers = ids.map((id, idx) =>
      window.setTimeout(() => {
        if (onDismiss) onDismiss(id);
        else if (onClear) onClear();
      }, 5500 + idx * 600)
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join("|")]);

  if (!items.length) return null;

  return (
    <div className="fixed top-16 right-4 z-[1000] flex flex-col gap-3 w-[320px] max-w-[90vw]">
      {items.map((t) => (
        <div
          key={t.id}
          className="rounded-2xl border border-slate-800 bg-slate-950/90 backdrop-blur p-3 shadow-xl shadow-slate-900/70"
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5 h-9 w-9 shrink-0 rounded-xl border border-slate-800 bg-slate-900 flex items-center justify-center">
              {t.tier ? (
                <img src={tierIconPath(t.tier)} alt="" className="h-6 w-6 object-contain" />
              ) : t.icon ? (
                <span className="text-lg">{t.icon}</span>
              ) : (
                <span className="text-lg">🏆</span>
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-slate-100">
                  {t.title}
                </p>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => {
                    if (onDismiss) onDismiss(t.id);
                    else if (onClear) onClear();
                  }}
                  className="text-slate-400 hover:text-slate-100 transition text-sm"
                >
                  ✕
                </button>
              </div>

              {t.subtitle && (
                <p className="mt-0.5 text-[11px] text-slate-300">{t.subtitle}</p>
              )}

              <div className="mt-2 flex items-center gap-2 text-[10px]">
                {t.tier && (
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${tierPill(
                      t.tier
                    )}`}
                  >
                    {t.tier}
                  </span>
                )}
                {typeof t.xp === "number" && (
                  <span className="text-emerald-200 font-semibold">
                    +{t.xp} XP
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
