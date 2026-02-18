"use client";

import Link from "next/link";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function AboutPage() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 overflow-hidden">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#22c55e22_0,transparent_55%),radial-gradient(circle_at_bottom,#0f172a_0,#020817_70%)]" />
        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(to_right,#38bdf855_1px,transparent_1px),linear-gradient(to_bottom,#38bdf833_1px,transparent_1px)] bg-size-[80px_80px]" />
      </div>

      <div className="px-6 md:px-10 lg:px-16 py-12">
        {/* Header */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between max-w-6xl mx-auto">
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/90">
              {L("ABOUT US", "SOBRE NOSOTROS")}
            </p>
            <h1 className="text-3xl md:text-4xl font-semibold">
              {L("The story behind Neuro Trader Journal", "La historia detrás de Neuro Trader Journal")}
            </h1>
            <p className="text-sm md:text-base text-slate-300 max-w-2xl">
              {L(
                "Built from real trading pain, designed to turn chaos into structure.",
                "Nació del dolor real del trading, diseñado para transformar el caos en estructura."
              )}
            </p>
          </div>
          <Link
            href="/contact"
            className="px-5 py-2.5 rounded-xl border border-slate-700 text-slate-200 text-xs font-semibold hover:border-emerald-400 transition w-fit"
          >
            {L("Contact us", "Contáctanos")}
          </Link>
        </div>

        {/* Story + Mission/Vision */}
        <section className="max-w-6xl mx-auto mt-10 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-8">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl">
            <h2 className="text-xl font-semibold mb-3">
              {L("Why Neuro Trader Journal was created", "Por qué se creó Neuro Trader Journal")}
            </h2>
            <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
              <p>
                {L(
                  "Steven J. Otero Vélez was born in Puerto Rico and spent more than three years in the markets living a roller‑coaster: great days, rough days, and a mind that changed pace with every candle. He won, he lost, he got frustrated, he got motivated… and repeated the cycle. It wasn’t a lack of effort. It was a lack of structure.",
                  "Steven J. Otero Vélez nació en Puerto Rico y se pasó más de tres años en los mercados viviendo en modo montaña rusa: días de gloria, días de golpe, y una mente que cambiaba de ritmo con cada vela. Ganaba, perdía, se frustraba, se motivaba… y repetía el ciclo. No era falta de ganas. Era falta de estructura."
                )}
              </p>
              <p>
                {L(
                  "He knew the uncomfortable truth: without a journal, there is no real progress. But his “journal” was scattered everywhere — notebooks, spreadsheets, formulas, loose notes, and tools that never spoke to each other. Every attempt to organize the chaos ended in more chaos. And when he tried online journals, it was worse: too much manual work, no flow, heavy interfaces, and the feeling that you needed to be an accountant just to log a trade.",
                  "Él sabía la verdad incómoda: sin journal no hay progreso real. Pero su “journal” estaba regado por todos lados — libretas, spreadsheets, fórmulas, notas sueltas y herramientas que nunca hablaban entre sí. Cada intento de ordenar el caos terminaba en más caos. Y cuando probó journals online, la experiencia fue peor: demasiado trabajo manual, cero fluidez, interfaces pesadas, y esa sensación de que necesitabas ser un contador para registrar una operación."
                )}
              </p>
              <p>
                {L(
                  "So he made a different decision: instead of adapting to systems that drained him, he built one that worked for him.",
                  "Entonces tomó una decisión distinta: en vez de seguir adaptándose a sistemas que lo drenaban, creó uno que trabajara para él."
                )}
              </p>
              <p>
                {L(
                  "That became a personal journal with AI, statistics, and P&L tracking — not just to measure money, but to understand what matters most: the trader behind every decision. He wanted to see invisible patterns, detect when he was trading with clarity versus impulse, and turn every trade into useful data instead of another anecdote.",
                  "Así nació la idea de construir un journal personal con IA, estadísticas y tracking de P&L, no solo para medir el dinero… sino para entender lo más importante: el trader detrás de cada decisión. Quería ver patrones invisibles, detectar cuándo estaba operando por claridad y cuándo por impulso, y convertir cada trade en data útil en lugar de una anécdota más."
                )}
              </p>
              <p>
                {L(
                  "That’s how Neuro Trader Journal was born: an all‑in‑one system designed to be simple, fast, and intuitive — no friction, no overwhelm, no turning journaling into another job. And when the system was running, the clarity appeared: emotional patterns, decision quality under pressure, the exact moments discipline broke — and, with that, the ability to fix them. Because in the end, that’s what Steven was chasing from day one: stop trading like a hobbyist and build the discipline to operate like a professional.",
                  "De ahí salió Neuro Trader Journal: un sistema todo‑en‑uno, diseñado para ser simple, rápido e intuitivo, sin fricción, sin abrumar, sin convertir el journaling en otro trabajo. Y cuando ese sistema estuvo en marcha, ocurrió lo que muchos traders buscan durante años: claridad real. Empezaron a aparecer los mapas ocultos: los patrones emocionales, la calidad de decisiones bajo presión, los momentos exactos donde se rompía la disciplina… y, con eso, la capacidad de corregirlos. Porque al final, eso era lo que Steven perseguía desde el día uno: dejar de tradear como un hobbyista a merced del ánimo del día… y construir la disciplina para operar como un profesional."
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-7">
              <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/90">
                {L("Mission", "Misión")}
              </p>
              <h3 className="text-lg font-semibold mt-2">
                {L(
                  "Transform the trader mindset: from hobby to professional execution.",
                  "Transformar la mentalidad del trader: del hobby a la ejecución profesional."
                )}
              </h3>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                {L(
                  "Neuro Trader Journal exists so every trader truly knows themselves and builds structure, discipline, and emotional awareness, turning trading into a measurable business with clear rules, quantifiable performance, and consistent execution — without improvisation or emotion-driven decisions.",
                  "Neuro Trader Journal existe para que cada trader se conozca de verdad y construya estructura, disciplina y conciencia emocional, convirtiendo el trading en un negocio medible: con reglas claras, desempeño cuantificable y ejecución consistente, sin improvisación ni decisiones dominadas por la emoción."
                )}
              </p>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-7">
              <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/90">
                {L("Vision", "Visión")}
              </p>
              <h3 className="text-lg font-semibold mt-2">
                {L(
                  "Be the global standard for trading performance and mindset.",
                  "Ser el estándar global de rendimiento y mentalidad en trading."
                )}
              </h3>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                {L(
                  "Turn Neuro Trader Journal into the platform traders worldwide use to capture every data point that matters, uncover real patterns, and continuously improve performance and mindset until they operate with the level and consistency of a professional.",
                  "Convertir a Neuro Trader Journal en la plataforma que traders en todo el mundo usan para capturar cada dato que importa, descubrir patrones reales y mejorar continuamente su performance y su mindset hasta operar con el nivel y la consistencia de un profesional."
                )}
              </p>
            </div>
          </div>
        </section>

        {/* Founder */}
        <section className="max-w-6xl mx-auto mt-8">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-center gap-4">
              <img
                src="/neurotrader%20logo%20for%20Web.png"
                alt="Neuro Trader Journal"
                className="h-12 w-auto object-contain"
                draggable={false}
              />
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/90">
                  {L("Founder", "Fundador")}
                </p>
                <p className="text-lg font-semibold">Steven J. Otero Vélez</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed max-w-3xl">
              {L(
                "Neuro Trader Journal is his commitment to help traders build a repeatable process, reduce emotional noise, and measure what actually matters.",
                "Neuro Trader Journal es su compromiso de ayudar a los traders a crear un proceso repetible, reducir el ruido emocional y medir lo que realmente importa."
              )}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
