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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      {/* Background glow */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#22c55e33_0,transparent_55%),radial-gradient(circle_at_bottom,#0f172a_0,#020617_70%)]" />
        <div className="absolute -right-20 top-10 w-72 h-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="absolute -left-24 bottom-10 w-64 h-64 rounded-full bg-sky-500/15 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-3xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-10 shadow-2xl relative overflow-hidden"
      >
        {/* Floating emojis */}
        <motion.div
          className="absolute -top-4 -right-2 text-3xl md:text-4xl"
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          🎯
        </motion.div>
        <motion.div
          className="absolute bottom-3 left-4 text-2xl md:text-3xl"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.9 }}
        >
          📈
        </motion.div>

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
          className="text-2xl md:text-3xl font-semibold mb-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          {L("Welcome, your account is live ✅", "Bienvenido, tu cuenta está activa ✅")}
        </motion.h1>

        <motion.p
          className="text-xs md:text-sm text-emerald-300 mb-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
        >
          {L(
            "Your account has been created successfully and your email is confirmed.",
            "Tu cuenta se creó correctamente y tu email está confirmado."
          )}
        </motion.p>

        <motion.p
          className="text-xs md:text-sm text-slate-200 mb-3"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          {L(
            "From now on, every journal entry is a rep for your brain. You're not here to gamble — you're here to train your nervous system to think, execute and recover like a professional trader.",
            "Desde ahora, cada entrada del journal es una repetición para tu cerebro. No estás aquí para apostar — estás aquí para entrenar tu sistema nervioso a pensar, ejecutar y recuperarte como un trader profesional."
          )}
        </motion.p>

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
    </main>
  );
}
