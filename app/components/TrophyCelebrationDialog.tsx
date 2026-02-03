"use client";

import { useEffect, useMemo } from "react";

export type TrophyCelebrationData = {
  title: string;
  description?: string;
  tier?: string;
  xp?: number;
  icon?: string | null;
};

type Props = {
  open: boolean;
  trophy: TrophyCelebrationData | null;
  onClose: () => void;
};

function tierLabel(tier?: string) {
  const t = (tier || "").toLowerCase();
  if (t === "elite") return "Elite";
  if (t === "gold") return "Gold";
  if (t === "silver") return "Silver";
  if (t === "bronze") return "Bronze";
  return tier || "Trophy";
}

function tierPillClass(tier?: string) {
  const t = (tier || "").toLowerCase();
  if (t === "elite") return "border-violet-500/50 bg-violet-500/10 text-violet-200";
  if (t === "gold") return "border-amber-400/50 bg-amber-400/10 text-amber-200";
  if (t === "silver") return "border-slate-300/40 bg-slate-200/10 text-slate-200";
  if (t === "bronze") return "border-emerald-400/50 bg-emerald-500/10 text-emerald-200";
  return "border-emerald-400/50 bg-emerald-500/10 text-emerald-200";
}

function confettiPaletteForTier(tier?: string) {
  const t = (tier || "").toLowerCase();
  // Brand-forward palette, adjusted per tier.
  if (t === "elite") return ["#a78bfa", "#60a5fa", "#34d399", "#22c55e", "#818cf8"];
  if (t === "gold") return ["#fbbf24", "#f59e0b", "#fde68a", "#34d399", "#60a5fa"];
  if (t === "silver") return ["#e5e7eb", "#cbd5e1", "#94a3b8", "#60a5fa", "#34d399"];
  // bronze + default: green/violet/blue accent
  return ["#34d399", "#22c55e", "#60a5fa", "#818cf8", "#a78bfa"];
}

export default function TrophyCelebrationDialog({ open, trophy, onClose }: Props) {
  const confetti = useMemo(() => {
    const colors = confettiPaletteForTier(trophy?.tier);
    const pieces = Array.from({ length: 34 }).map((_, i) => {
      const left = Math.round(Math.random() * 100);
      const delay = Math.random() * 0.6;
      const dur = 1.8 + Math.random() * 1.4;
      const rot = Math.round(Math.random() * 360);
      const w = 6 + Math.round(Math.random() * 7);
      const h = 8 + Math.round(Math.random() * 16);
      const color = colors[i % colors.length];
      return { i, left, delay, dur, rot, w, h, color };
    });
    return pieces;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trophy?.title, trophy?.tier]);

  // ESC closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !trophy) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-[6px]"
      />

      {/* Confetti layer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {confetti.map((p) => (
          <span
            key={p.i}
            className="confetti-piece"
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              transform: `rotate(${p.rot}deg)`,
              width: `${p.w}px`,
              height: `${p.h}px`,
              background: p.color,
            }}
          />
        ))}
      </div>

      {/* Dialog */}
      <div className="relative w-full max-w-lg rounded-3xl border border-emerald-400/20 bg-slate-950/85 text-slate-50 shadow-2xl shadow-slate-950/60 backdrop-blur-xl overflow-hidden">
        {/* Brand glow */}
        <div className="absolute inset-0 opacity-60 pointer-events-none"
             style={{
               background:
                 "radial-gradient(1200px 500px at 15% 10%, rgba(34,197,94,0.28), transparent 55%)," +
                 "radial-gradient(900px 420px at 85% 15%, rgba(99,102,241,0.28), transparent 55%)," +
                 "radial-gradient(800px 420px at 70% 85%, rgba(168,85,247,0.22), transparent 55%)",
             }}
        />

        <div className="relative p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 rounded-2xl border border-slate-700 bg-slate-900/70 flex items-center justify-center text-2xl">
                <span className="trophy-pulse" />
                <span className="relative z-10">{trophy.icon ?? "🏆"}</span>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-300/90">
                  Trophy unlocked
                </p>
                <h3 className="text-xl sm:text-2xl font-semibold text-slate-50 mt-1">
                  {trophy.title}
                </h3>
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${tierPillClass(trophy.tier)}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-90" />
                {tierLabel(trophy.tier)}
              </span>

              {typeof trophy.xp === "number" && (
                <span className="text-[11px] text-slate-200/90">
                  <span className="font-semibold text-emerald-200">+{trophy.xp}</span> XP
                </span>
              )}
            </div>
          </div>

          {trophy.description && (
            <p className="mt-4 text-sm text-slate-200/90 leading-relaxed">
              {trophy.description}
            </p>
          )}

          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm font-semibold bg-emerald-400 text-slate-950 hover:bg-emerald-300 transition"
            >
              Continue
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .confetti-piece {
          position: absolute;
          top: -24px;
          border-radius: 2px;
          opacity: 0.95;
          filter: drop-shadow(0 10px 18px rgba(0,0,0,0.22));
          animation-name: confetti-fall, confetti-spin;
          animation-timing-function: ease-out, linear;
          animation-iteration-count: 1, infinite;
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(calc(100vh + 40px)) rotate(420deg); opacity: 0.9; }
        }
        @keyframes confetti-spin {
          0% { }
          100% { }
        }
        .trophy-pulse {
          position: absolute;
          inset: -10px;
          border-radius: 18px;
          background: radial-gradient(circle at 30% 30%, rgba(34,197,94,0.35), transparent 60%);
          animation: pulse 1.8s ease-in-out infinite;
        }
        @keyframes pulse {
          0% { transform: scale(0.92); opacity: 0.35; }
          50% { transform: scale(1.0); opacity: 0.65; }
          100% { transform: scale(0.92); opacity: 0.35; }
        }
      `}</style>
    </div>
  );
}
