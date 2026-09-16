"use client";

import Link from "next/link";
import { ArrowRight, BookOpenCheck, ExternalLink, ShieldCheck } from "lucide-react";

import { useAppSettings } from "@/lib/appSettings";
import { TRADING_BUSINESS_CASE_STUDIES } from "@/lib/caseStudies";
import { resolveLocale } from "@/lib/i18n";

export default function CaseStudiesPage() {
  const { locale } = useAppSettings();
  const isEs = resolveLocale(locale) === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  return (
    <div className="min-h-screen bg-[#050814] text-slate-50">
      <header className="border-b border-white/10 bg-[#07101d]">
        <div className="mx-auto flex w-full max-w-7xl items-center px-4 py-4 md:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label={L("NeuroTrader home", "Inicio de NeuroTrader")}>
            <img src="/neurotrader-logo-web.png" alt="NeuroTrader" className="h-9 w-auto object-contain" />
          </Link>
        </div>
      </header>

      <main>
        <section className="border-b border-white/10 bg-[#07100f] px-4 py-16 md:px-8 md:py-20">
          <div className="mx-auto w-full max-w-7xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-md border border-emerald-300/30 bg-emerald-400/10 text-emerald-200">
              <BookOpenCheck className="h-6 w-6" />
            </div>
            <p className="mt-6 text-sm font-semibold text-emerald-300">
              {L("Evidence library", "Biblioteca de evidencia")}
            </p>
            <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-tight text-white md:text-6xl">
              {L("Trading Business Case Studies", "Case Studies de una Empresa de Trading")}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 md:text-lg">
              {L(
                "Independent regulatory and financial-journalism evidence on risk controls, research discipline, operating costs, and capital protection. Every conclusion links to its original source.",
                "Evidencia independiente regulatoria y de periodismo financiero sobre controles de riesgo, disciplina de research, costos operativos y proteccion de capital. Cada conclusion enlaza su fuente original."
              )}
            </p>
          </div>
        </section>

        <section className="px-4 py-14 md:px-8 md:py-18">
          <div className="mx-auto w-full max-w-7xl space-y-6">
            {TRADING_BUSINESS_CASE_STUDIES.map((study, index) => (
              <article key={study.slug} id={study.slug} className="border-b border-white/10 pb-8 last:border-b-0">
                <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                      {String(index + 1).padStart(2, "0")} / {study.publisher}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{study.published}</p>
                  </div>
                  <div>
                    <h2 className="text-2xl font-semibold text-white md:text-3xl">
                      {isEs ? study.title.es : study.title.en}
                    </h2>
                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                      <div className="border-l-2 border-sky-300/50 pl-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                          {L("What the source reports", "Que reporta la fuente")}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {isEs ? study.finding.es : study.finding.en}
                        </p>
                      </div>
                      <div className="border-l-2 border-amber-300/50 pl-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                          {L("Operating lesson", "Leccion operativa")}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {isEs ? study.operatingLesson.es : study.operatingLesson.en}
                        </p>
                      </div>
                      <div className="border-l-2 border-emerald-300/50 pl-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                          {L("Business application", "Aplicacion empresarial")}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {isEs ? study.application.es : study.application.en}
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      {study.tags.map((tag) => (
                        <span key={tag.en} className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-slate-300">
                          {isEs ? tag.es : tag.en}
                        </span>
                      ))}
                    </div>
                    <a
                      href={study.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200"
                    >
                      {L("Read original source", "Leer fuente original")}: {study.sourceTitle}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-white/10 bg-[#07111d] px-4 py-12 md:px-8">
          <div className="mx-auto grid w-full max-w-7xl gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-sky-300/30 bg-sky-400/10 text-sky-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                {L("Evidence, not performance promises", "Evidencia, no promesas de rendimiento")}
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
                {L(
                  "These summaries are NeuroTrader's educational interpretation of independent sources. The publishers do not endorse NeuroTrader, and the material is not financial advice or a guarantee of income, capital growth, or trading results.",
                  "Estos resumenes son la interpretacion educativa de NeuroTrader sobre fuentes independientes. Los medios no endosan NeuroTrader, y el material no es asesoria financiera ni garantiza ingresos, crecimiento de capital o resultados de trading."
                )}
              </p>
            </div>
            <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200">
              {L("Explore NeuroTrader", "Explorar NeuroTrader")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
