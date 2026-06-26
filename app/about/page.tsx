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
              {L("The story behind Neuro Trader", "La historia detrás de Neuro Trader")}
            </h1>
            <p className="text-sm md:text-base text-slate-300 max-w-2xl">
              {L(
                "Built from real trading pain, designed to help Trader Entrepreneurs build structure around their business.",
                "Nació del dolor real del trading, diseñado para ayudar a Empresarios Traders a construir estructura alrededor de su negocio."
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
              {L("Why Neuro Trader was created", "Por qué se creó Neuro Trader")}
            </h2>
            <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
              <p>
                {L(
                  "Steven J. Otero Vélez was born in Puerto Rico and spent more than three years in the markets living the pressure most independent traders know: strong days, painful days, shifting emotions, and decisions that needed more structure than memory could provide. It was not a lack of effort. It was a lack of an operating system.",
                  "Steven J. Otero Vélez nació en Puerto Rico y pasó más de tres años en los mercados viviendo la presión que muchos traders independientes conocen: días fuertes, días duros, emociones cambiantes y decisiones que necesitaban más estructura que la memoria. No era falta de ganas. Era falta de un sistema operativo."
                )}
              </p>
              <p>
                {L(
                  "He knew the uncomfortable truth: a trading business cannot improve if the plan, execution, emotions, P&L, rules, and reviews live in disconnected places. Notebooks, spreadsheets, formulas, broker statements, and screenshots all held part of the truth, but none of them gave the full business picture.",
                  "Él sabía una verdad incómoda: una empresa de trading no puede mejorar si el plan, la ejecución, las emociones, el P&L, las reglas y las revisiones viven en lugares desconectados. Libretas, spreadsheets, fórmulas, estados de cuenta del bróker y screenshots tenían partes de la verdad, pero ninguno mostraba la imagen completa del negocio."
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
                  "That became Neuro Trader: a Trading Business Platform with planning, execution records, AI coaching, statistics, P&L tracking, protection systems, and notebooks working together. The goal was not only to measure money. The goal was to understand the operator behind every decision and turn each session into business intelligence.",
                  "Así nació Neuro Trader: una Plataforma Empresarial de Trading con planificación, registros de ejecución, AI coaching, estadísticas, tracking de P&L, sistemas de protección y notebooks trabajando en conjunto. La meta no era solo medir dinero. La meta era entender al operador detrás de cada decisión y convertir cada sesión en inteligencia empresarial."
                )}
              </p>
              <p>
                {L(
                  "The product is built for Trader Entrepreneurs who want one place to create their Trading Business Plan, protect it during real execution, review what happened, and improve with context instead of guessing. It is structure for the business side of trading, without making the trader feel buried in admin work.",
                  "El producto está creado para Empresarios Traders que quieren un solo lugar para crear su Plan de Empresa de Trading, protegerlo durante la ejecución real, revisar lo que pasó y mejorar con contexto en vez de adivinar. Es estructura para el lado empresarial del trading, sin enterrar al trader en trabajo administrativo."
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
                  "Help Trader Entrepreneurs build, operate, and improve their trading business.",
                  "Ayudar a Empresarios Traders a crear, operar y mejorar su empresa de trading."
                )}
              </h3>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                {L(
                  "Neuro Trader exists so every Trader Entrepreneur can organize the business side of trading with clear plans, measurable performance, protected rules, and coaching that reflects what actually happened.",
                  "Neuro Trader existe para que cada Empresario Trader pueda organizar el lado empresarial del trading con planes claros, rendimiento medible, reglas protegidas y coaching basado en lo que realmente pasó."
                )}
              </p>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 md:p-7">
              <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/90">
                {L("Vision", "Visión")}
              </p>
              <h3 className="text-lg font-semibold mt-2">
                {L(
                  "Become the global business platform for Trader Entrepreneurs.",
                  "Convertirnos en la plataforma empresarial global para Empresarios Traders."
                )}
              </h3>
              <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                {L(
                  "Turn Neuro Trader into the platform traders worldwide use to create their Trading Business Plan, capture execution, understand real patterns, and improve the business with clarity.",
                  "Convertir a Neuro Trader en la plataforma que traders en todo el mundo usan para crear su Plan de Empresa de Trading, capturar ejecución, entender patrones reales y mejorar el negocio con claridad."
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
                alt="Neuro Trader"
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
                "Neuro Trader is his commitment to help Trader Entrepreneurs build a repeatable operating process, reduce emotional noise, and measure what actually matters to the business.",
                "Neuro Trader es su compromiso de ayudar a Empresarios Traders a crear un proceso operativo repetible, reducir el ruido emocional y medir lo que realmente importa para el negocio."
              )}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
