// app/confirmed/page.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function ConfirmedPage() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const fireworks = [
    { id: 1, x: "12%", y: "18%", size: 260, delay: 0.2, hue: "rgba(34,197,94,0.45)" },
    { id: 2, x: "78%", y: "22%", size: 240, delay: 0.6, hue: "rgba(56,189,248,0.45)" },
    { id: 3, x: "30%", y: "70%", size: 220, delay: 0.9, hue: "rgba(20,184,166,0.45)" },
    { id: 4, x: "85%", y: "72%", size: 260, delay: 1.2, hue: "rgba(14,165,233,0.45)" },
  ];

  const confetti = Array.from({ length: 26 }).map((_, idx) => {
    const colors = ["#22c55e", "#38bdf8", "#0ea5e9", "#a855f7", "#facc15"];
    return {
      id: idx,
      left: (idx * 7 + 10) % 100,
      size: 6 + (idx % 5) * 2,
      delay: (idx % 10) * 0.3,
      duration: 6 + (idx % 6),
      color: colors[idx % colors.length],
      drift: (idx % 2 === 0 ? 1 : -1) * (20 + (idx % 5) * 12),
    };
  });
  const shootingStars = [
    { id: 1, top: "18%", delay: 0.8, duration: 4.2, angle: 18 },
    { id: 2, top: "32%", delay: 3.2, duration: 4.6, angle: 22 },
    { id: 3, top: "58%", delay: 5.4, duration: 4.0, angle: 16 },
  ];
  const candleCount: number = 26;
  const createCandle = (
    idx: number,
    progress: number,
    nudgeX = 0,
    nudgeY = 0,
    delayOverride?: number
  ) => {
    const isDoji = idx % 7 === 0;
    const bodyHeight = isDoji ? 4 : 18 + (idx % 5) * 6;
    const wickHeight = bodyHeight + 26 + (idx % 4) * 6;
    const bodyWidth = isDoji ? 8 : 5 + (idx % 3) * 2;
    const jitter = idx % 3 === 0 ? -0.8 : 0.8;
    const leftRaw = 4 + progress * 92 + jitter + nudgeX;
    const bottomRaw =
      12 + progress * 72 + (2 * progress - 1) * 5 + (idx % 2 === 0 ? -0.8 : 0.8) + nudgeY;
    const left = Math.min(98, Math.max(2, leftRaw));
    const bottom = Math.min(90, Math.max(6, bottomRaw));
    const bodyOffset = Math.max(6, 8 + (idx % 5) * 3);
    const hue = idx % 2 === 0 ? "rgba(34,197,94,0.85)" : "rgba(56,189,248,0.85)";
    const body = idx % 2 === 0 ? "rgba(34,197,94,0.65)" : "rgba(56,189,248,0.65)";
    const delay = delayOverride ?? 0.25 + idx * 0.14;
    const bottomWickHeight = Math.max(2, bodyOffset);
    const topWickHeight = Math.max(2, wickHeight - (bodyOffset + bodyHeight));
    return {
      id: idx,
      left,
      bottom,
      wickHeight,
      bodyHeight,
      bodyWidth,
      bodyOffset,
      topWickHeight,
      bottomWickHeight,
      hue,
      body,
      delay,
      isDoji,
    };
  };
  const baseCandles = Array.from({ length: candleCount }).map((_, idx) => {
    const progress = candleCount === 1 ? 0 : idx / (candleCount - 1);
    return createCandle(idx, progress);
  });
  const candles = [
    createCandle(candleCount, 0, -2.4, -3.2, 0.05),
    ...baseCandles,
    createCandle(candleCount + 1, 1, 2.2, 2.4, 0.25 + candleCount * 0.14 + 0.2),
  ];

  return (
    <main className="relative min-h-screen text-slate-50 flex items-center justify-center px-4">
      {/* Background glow + fireworks */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#22c55e33_0,transparent_55%),radial-gradient(circle_at_bottom,#0f172a_0,#020617_70%)]" />
        <div className="absolute -right-20 top-10 w-72 h-72 rounded-full bg-emerald-500/30 blur-3xl" />
        <div className="absolute -left-24 bottom-10 w-72 h-72 rounded-full bg-sky-500/25 blur-3xl" />
        <motion.div
          className="absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_90deg,rgba(16,185,129,0.25),rgba(56,189,248,0.25),rgba(14,165,233,0.1),rgba(16,185,129,0.25))] blur-3xl"
          initial={{ opacity: 0.2, rotate: 0, scale: 0.9 }}
          animate={{ opacity: [0.2, 0.45, 0.2], rotate: [0, 35, 0], scale: [0.9, 1.1, 0.9] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 candle-field">
            {candles.map((candle) => (
              <div
                key={candle.id}
                className="candle"
                style={{
                  left: `${candle.left}%`,
                  bottom: `${candle.bottom}%`,
                  height: `${candle.wickHeight}px`,
                  width: `${candle.bodyWidth}px`,
                  ["--delay" as any]: `${candle.delay}s`,
                }}
              >
                <span
                  className="candle-wick"
                  style={{ background: candle.hue, height: `${candle.topWickHeight}px` }}
                />
                <span
                  className="candle-wick bottom"
                  style={{ background: candle.hue, height: `${candle.bottomWickHeight}px` }}
                />
                <span
                  className="candle-body"
                  style={{
                    height: `${candle.bodyHeight}px`,
                    bottom: `${candle.bodyOffset}px`,
                    background: candle.body,
                    boxShadow: `0 0 6px ${candle.hue}`,
                  }}
                />
              </div>
            ))}
          </div>
          {fireworks.map((burst) => (
            <motion.div
              key={burst.id}
              className="absolute rounded-full blur-2xl"
              style={{
                left: burst.x,
                top: burst.y,
                width: burst.size,
                height: burst.size,
                background: `radial-gradient(circle, ${burst.hue} 0%, rgba(2,6,23,0) 70%)`,
                mixBlendMode: "screen",
              }}
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 0.7, 0], scale: [0.2, 1.1, 0.6] }}
              transition={{ duration: 3.2, delay: burst.delay, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
          {confetti.map((piece) => (
            <span
              key={piece.id}
              className="confetti-piece"
              style={{
                left: `${piece.left}%`,
                width: `${piece.size}px`,
                height: `${piece.size * 1.6}px`,
                background: piece.color,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
                ["--drift" as any]: `${piece.drift}px`,
              }}
            />
          ))}
          {shootingStars.map((star) => (
            <span
              key={star.id}
              className="shooting-star"
              style={{
                top: star.top,
                animationDelay: `${star.delay}s`,
                animationDuration: `${star.duration}s`,
                ["--angle" as any]: `${star.angle}deg`,
              }}
            />
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-3xl bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-6 md:p-10 shadow-[0_0_80px_rgba(16,185,129,0.25)] overflow-hidden"
      >
        {/* Check icon */}
        <motion.div
          className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-emerald-500/10 border border-emerald-400/60 flex items-center justify-center mb-5"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 220, damping: 16 }}
        >
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.35, type: "spring", stiffness: 260, damping: 20 }}
            className="text-2xl md:text-3xl text-emerald-400"
          >
            ✓
          </motion.span>
        </motion.div>

        <motion.h1
          className="text-2xl md:text-4xl font-semibold mb-2 text-transparent bg-clip-text bg-[linear-gradient(120deg,#a7f3d0,#22c55e,#38bdf8,#22c55e)] bg-[length:240%_240%] title-gradient-glow"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          {L("Welcome — your training begins now", "Bienvenido — tu entrenamiento comienza ahora")}
        </motion.h1>

        <motion.p
          className="text-xs md:text-sm text-emerald-300 mb-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          {L(
            "Your account is live and your email is confirmed.",
            "Tu cuenta está activa y tu email está confirmado."
          )}
        </motion.p>

        <motion.p
          className="text-xs md:text-sm text-slate-200 mb-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          {L(
            "From now on, every journal entry is a rep for your brain. You're not here to gamble — you're here to train your nervous system to think, execute, and recover like a professional trader.",
            "Desde ahora, cada entrada del journal es una repetición para tu cerebro. No estás aquí para apostar — estás aquí para entrenar tu sistema nervioso a pensar, ejecutar y recuperarte como un trader profesional."
          )}
        </motion.p>

        <motion.div
          className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/5 p-4 text-[11px] md:text-xs text-slate-200"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <p className="text-emerald-200 font-semibold mb-1">
            {L("Trader psychology code", "Código de psicología del trader")}
          </p>
          <p>
            {L(
              "Process over outcome. Risk before reward. Calm is a weapon. Consistency is the only edge that compounds.",
              "Proceso sobre resultado. Riesgo antes de recompensa. La calma es un arma. La consistencia es el único edge que compone."
            )}
          </p>
        </motion.div>

        <motion.p
          className="text-[11px] md:text-xs text-slate-400"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          {L(
            "This is Day 1 of your new routine: clear rules, defined risk and brutal honesty with yourself. The journal will track your P&L, but the real edge we care about is your psychology.",
            "Este es el Día 1 de tu nueva rutina: reglas claras, riesgo definido y brutal honestidad contigo mismo. El journal seguirá tu P&L, pero el edge real que nos importa es tu psicología."
          )}
        </motion.p>

        <motion.div
          className="mt-6 flex flex-wrap gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          {/* Botón principal → Quick Tour */}
          <Link
            href="/quick-tour"
            className="inline-flex px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs md:text-sm font-semibold hover:bg-emerald-300 shadow-lg shadow-emerald-500/25"
          >
            {L("Start the journey", "Comenzar el recorrido")}
          </Link>
        </motion.div>

        <motion.p
          className="mt-5 text-[10px] md:text-[11px] text-slate-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          {L(
            "Breathe, follow your plan, and let the data show you who you're becoming as a trader.",
            "Respira, sigue tu plan y deja que los datos te muestren en quién te estás convirtiendo como trader."
          )}
        </motion.p>
      </motion.div>
      <style jsx>{`
        .title-gradient-glow {
          animation: gradientShift 6s ease-in-out infinite;
          text-shadow: 0 0 24px rgba(16, 185, 129, 0.5);
        }
        .candle-field {
          opacity: 0.7;
        }
        .candle {
          position: absolute;
          opacity: 0;
          transform: translateY(12px) scaleY(0.4);
          animation: candlePop 0.9s ease-out forwards, candleFlicker 6s ease-in-out infinite;
          animation-delay: var(--delay, 0s), calc(var(--delay, 0s) + 0.9s);
        }
        .candle-wick {
          position: absolute;
          left: 50%;
          top: 0%;
          width: 2px;
          transform: translateX(-50%);
          border-radius: 999px;
          opacity: 0.6;
        }
        .candle-wick.bottom {
          top: auto;
          bottom: 0%;
        }
        .candle-body {
          position: absolute;
          left: 50%;
          width: 100%;
          transform: translateX(-50%);
          border-radius: 0.5px;
        }
        .confetti-piece {
          position: absolute;
          top: -15%;
          border-radius: 999px;
          opacity: 0.85;
          animation-name: confettiFall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          z-index: 1;
        }
        .shooting-star {
          position: absolute;
          left: -20%;
          width: 180px;
          height: 2px;
          opacity: 0;
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0),
            rgba(255, 255, 255, 0.9),
            rgba(56, 189, 248, 0.9),
            rgba(255, 255, 255, 0)
          );
          filter: drop-shadow(0 0 12px rgba(56, 189, 248, 0.6));
          transform: rotate(var(--angle, 20deg));
          animation-name: shootingStar;
          animation-timing-function: ease-in;
          animation-iteration-count: infinite;
        }
        @keyframes gradientShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        @keyframes confettiFall {
          0% {
            transform: translate3d(0, -10vh, 0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translate3d(var(--drift, 0px), 120vh, 0) rotate(360deg);
            opacity: 0;
          }
        }
        @keyframes shootingStar {
          0% {
            transform: translate3d(0, 0, 0) rotate(var(--angle, 20deg));
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translate3d(140vw, 40vh, 0) rotate(var(--angle, 20deg));
            opacity: 0;
          }
        }
        @keyframes candlePop {
          0% {
            opacity: 0;
            transform: translateY(14px) scaleY(0.2);
          }
          70% {
            opacity: 0.95;
            transform: translateY(-4px) scaleY(1.1);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scaleY(1);
          }
        }
        @keyframes candleFlicker {
          0%,
          100% {
            opacity: 0.6;
          }
          50% {
            opacity: 0.9;
          }
        }
      `}</style>
    </main>
  );
}
