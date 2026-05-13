"use client";

import Link from "next/link";
import FloatingAskButton from "./components/FloatingAskButton";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  ADVANCED_UNLOCKS,
  ADVANCED_UPGRADE_PILLARS,
  BROKER_SYNC_ADDON,
  PLAN_CATALOG,
  advancedUpgradePriceLabel,
  catalogText,
  planPriceLabel,
} from "@/lib/planCatalog";

type ProductPreviewKind = "dashboard" | "growth" | "coach";

function ProductPreview({
  kind,
  L,
}: {
  kind: ProductPreviewKind;
  L: (en: string, es: string) => string;
}) {
  if (kind === "growth") {
    return (
      <div className="h-48 rounded-md border border-white/10 bg-[#07101d] p-4">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{L("Growth timeline", "Timeline de growth")}</span>
          <span className="text-emerald-300">{L("10 months", "10 meses")}</span>
        </div>
        <div className="mt-5 flex h-20 items-end gap-2">
          {[18, 24, 31, 39, 45, 52, 61, 68, 76, 86].map((height, index) => (
            <div key={index} className="flex h-full flex-1 flex-col justify-end gap-1">
              <div
                className="w-full rounded-sm bg-emerald-400/80"
                style={{ height: `${Math.max(10, height * 0.58)}px` }}
              />
              <span className="text-[9px] text-slate-500">{index + 1}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2 text-[10px]">
          <div className="rounded-md border border-white/10 bg-[#0b1828] p-2">
            <p className="text-slate-500">{L("Start", "Inicio")}</p>
            <p className="font-semibold text-white">$10,000</p>
          </div>
          <div className="rounded-md border border-white/10 bg-[#0b1828] p-2">
            <p className="text-slate-500">{L("Risk", "Riesgo")}</p>
            <p className="font-semibold text-white">0.5R</p>
          </div>
          <div className="rounded-md border border-emerald-300/25 bg-emerald-300/10 p-2">
            <p className="text-emerald-200">{L("Target", "Meta")}</p>
            <p className="font-semibold text-white">$25,000</p>
          </div>
        </div>
      </div>
    );
  }

  if (kind === "coach") {
    return (
      <div className="h-48 rounded-md border border-white/10 bg-[#07101d] p-4">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{L("AI coaching", "AI coaching")}</span>
          <span className="text-sky-300">{L("Objective review", "Revisión objetiva")}</span>
        </div>
        <div className="mt-4 space-y-2">
          <div className="max-w-[82%] rounded-md border border-white/10 bg-[#0b1828] px-3 py-2 text-xs text-slate-200">
            {L("Why did I lose discipline after 2 PM?", "¿Por qué perdí disciplina después de las 2 PM?")}
          </div>
          <div className="ml-auto max-w-[88%] rounded-md border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100">
            {L(
              "Your late-session trades show lower win rate and higher emotional tags. Reduce size after target is reached.",
              "Tus trades tarde muestran menor win rate y más tags emocionales. Baja size después de llegar a la meta."
            )}
          </div>
          <div className="rounded-md border border-white/10 bg-[#0b1828] px-3 py-2 text-xs text-slate-300">
            {L("Action: lock max trades per session to 3.", "Acción: limita trades por sesión a 3.")}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-48 rounded-md border border-white/10 bg-[#07101d] p-4">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span>{L("Daily command center", "Centro diario")}</span>
        <span className="text-emerald-300">{L("Live view", "Vista activa")}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["$24.8k", L("Equity", "Equity")],
          ["61%", L("Win rate", "Win rate")],
          ["3", L("Rules hit", "Reglas")],
        ].map(([value, label]) => (
          <div key={label} className="rounded-md border border-white/10 bg-[#0b1828] p-2">
            <p className="text-base font-semibold text-white">{value}</p>
            <p className="text-[10px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {Array.from({ length: 21 }).map((_, index) => {
          const positive = [0, 1, 4, 6, 8, 10, 14, 17, 20].includes(index);
          const negative = [3, 11, 16].includes(index);
          return (
            <div
              key={index}
              className={`h-5 rounded-sm ${positive ? "bg-emerald-400/85" : negative ? "bg-sky-400/80" : "bg-slate-700/80"}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const t = (copy: { en: string; es: string }) => catalogText(copy, lang);

  const heroMetrics = [
    {
      value: L("Plan creation", "Creación del plan"),
      label: L(
        "Build your Growth Plan with targets, dates, risk rails, daily goals, and rules.",
        "Crea tu Growth Plan con metas, fechas, límites de riesgo, objetivos diarios y reglas."
      ),
    },
    {
      value: L("AI follow-up", "Seguimiento IA"),
      label: L(
        "AI Coach evaluates execution against your plan and turns drift into action items.",
        "AI Coach evalúa tu ejecución contra el plan y convierte desvíos en acciones."
      ),
    },
    {
      value: L("Statistics", "Estadística"),
      label: L(
        "KPIs, calendar results, streaks, risk metrics, and performance breakdowns.",
        "KPIs, calendario, rachas, métricas de riesgo y breakdowns de performance."
      ),
    },
    {
      value: L("Business", "Negocio"),
      label: L(
        "P&L, cashflow, reports, rules, and accountability for serious trading operations.",
        "P&L, cashflow, reportes, reglas y accountability para operar como negocio."
      ),
    },
  ];

  const operatingLoop = [
    {
      title: L("Plan", "Planifica"),
      body: L(
        "Create your Growth Plan with target equity, dates, daily goals, max loss, risk per trade, and rules.",
        "Crea tu Growth Plan con equity objetivo, fechas, metas diarias, max loss, riesgo por trade y reglas."
      ),
    },
    {
      title: L("Execute", "Ejecuta"),
      body: L(
        "Log trades, emotions, setups, and decisions without losing the flow of the trading day.",
        "Registra trades, emociones, setups y decisiones sin romper el ritmo del día de trading."
      ),
    },
    {
      title: L("Review", "Revisa"),
      body: L(
        "AI Coach compares your execution against the plan, flags drift, and gives the next action.",
        "AI Coach compara tu ejecución contra el plan, marca desvíos y te da la próxima acción."
      ),
    },
  ];

  const productViews = [
    {
      title: L("Dashboard", "Dashboard"),
      body: L("A clean daily command center for equity, risk, and account health.", "Un centro diario para equity, riesgo y salud de cuenta."),
      kind: "dashboard" as const,
    },
    {
      title: L("Growth Plan", "Growth Plan"),
      body: L(
        "Your plan becomes the standard AI Coach uses to evaluate execution.",
        "Tu plan se convierte en el estándar que AI Coach usa para evaluar tu ejecución."
      ),
      kind: "growth" as const,
    },
    {
      title: L("AI Coach", "AI Coach"),
      body: L("Objective feedback from your actual trading behavior.", "Feedback objetivo basado en tu comportamiento real."),
      kind: "coach" as const,
    },
  ];

  const focusAreas = [
    {
      label: L("Growth Plan", "Growth Plan"),
      detail: L(
        "Create the trading business plan: target, timeline, risk rails, rules, and checkpoints.",
        "Crea el plan de negocio: meta, timeline, riesgo, reglas y checkpoints."
      ),
    },
    {
      label: L("AI plan accountability", "Accountability IA del plan"),
      detail: L(
        "AI Coach reviews whether your trades, behavior, and risk stayed aligned with the plan.",
        "AI Coach revisa si tus trades, conducta y riesgo se mantuvieron alineados al plan."
      ),
    },
    {
      label: L("Daily journal", "Journal diario"),
      detail: L("Premarket, entries, exits, emotions, tags, lessons, and screenshots.", "Premarket, entradas, salidas, emociones, tags, lecciones y screenshots."),
    },
    {
      label: L("Rules & alarms", "Reglas y alarmas"),
      detail: L("Max loss, daily targets, reminders, and process checks before the next trade.", "Max loss, metas diarias, recordatorios y checks antes del próximo trade."),
    },
  ];

  const planIds = ["core", "advanced"] as const;

  return (
    <main className="min-h-screen bg-[#050814] text-slate-50 overflow-x-hidden">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-7xl flex-col gap-3 rounded-lg border border-white/10 bg-[#050814]/78 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl md:flex-row md:items-center md:justify-between md:px-5">
          <Link href="/" className="flex items-center gap-3" aria-label="NeuroTrader Journal home">
            <img
              src="/neurotrader-logo-web.png"
              alt="NeuroTrader Journal"
              className="h-9 w-auto object-contain md:h-10"
              draggable={false}
            />
            <span className="sr-only">Neuro Trader Journal</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-300 md:justify-end">
            <Link href="/signin" className="rounded-md px-3 py-2 text-white/82 hover:bg-white/10 hover:text-white">
              {L("Sign in", "Ingresar")}
            </Link>
            <Link href="/plans-comparison" className="rounded-md border border-white/18 px-3 py-2 font-semibold text-white hover:border-emerald-300 hover:text-emerald-100">
              {L("Compare plans", "Comparar planes")}
            </Link>
            <Link href="/signup" className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-300">
              {L("Create my journal", "Crear mi journal")}
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative min-h-[86svh] overflow-hidden bg-[#06110f] pt-28">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[#06110f]" />
          <div className="absolute inset-x-0 top-24 mx-auto h-[520px] w-[1180px] max-w-[96vw] opacity-60">
            <div className="absolute left-[8%] top-5 h-60 w-[520px] max-w-[62vw] rounded-lg border border-emerald-300/20 bg-[#071421]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
              <div className="mb-4 flex items-center justify-between text-[11px] text-slate-400">
                <span>{L("Dashboard", "Dashboard")}</span>
                <span className="text-emerald-300">{L("On track", "En ruta")}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  ["$24.8k", L("Equity", "Equity")],
                  ["61%", L("Win rate", "Win rate")],
                  ["0.8R", L("Avg risk", "Riesgo prom.")],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-md border border-white/10 bg-[#091827] p-3">
                    <p className="text-lg font-semibold text-white">{value}</p>
                    <p className="text-[11px] text-slate-400">{label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex h-24 items-end gap-2 rounded-md border border-white/10 bg-[#081220] px-3 pb-3">
                {[28, 34, 31, 42, 46, 54, 50, 61, 68, 76, 72, 84].map((height, index) => (
                  <div
                    key={index}
                    className="w-full rounded-sm bg-emerald-400/75"
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>

            <div className="absolute right-[7%] top-16 h-72 w-[430px] max-w-[54vw] rounded-lg border border-sky-300/20 bg-[#08111f]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
              <div className="mb-4 flex items-center justify-between text-[11px] text-slate-400">
                <span>{L("Journal", "Journal")}</span>
                <span>{L("AI review", "Revisión IA")}</span>
              </div>
              {[
                L("Premarket plan locked", "Plan premarket listo"),
                L("Entry matched setup", "Entrada alineada al setup"),
                L("Emotion: controlled", "Emoción: controlada"),
              ].map((line) => (
                <div key={line} className="mb-3 rounded-md border border-white/10 bg-[#0b1828] px-3 py-2 text-xs text-slate-200">
                  {line}
                </div>
              ))}
              <div className="rounded-md border border-emerald-300/25 bg-emerald-300/10 p-3 text-xs text-emerald-100">
                {L(
                  "Repeat the morning setup. Avoid late-day revenge entries.",
                  "Repite el setup de la mañana. Evita entradas emocionales al final del día."
                )}
              </div>
            </div>

            <div className="absolute bottom-0 left-[22%] h-36 w-[620px] max-w-[68vw] rounded-lg border border-amber-300/20 bg-[#10101a]/95 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.48)]">
              <div className="grid h-full grid-cols-7 gap-2">
                {Array.from({ length: 21 }).map((_, index) => {
                  const positive = [1, 2, 4, 7, 9, 12, 15, 18, 20].includes(index);
                  const negative = [3, 8, 13].includes(index);
                  return (
                    <div
                      key={index}
                      className={`rounded-md border border-black/20 ${
                        positive ? "bg-emerald-400/80" : negative ? "bg-sky-400/80" : "bg-slate-700/70"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <div className="absolute inset-0 bg-black/70" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(86svh-7rem)] w-full max-w-7xl flex-col justify-center px-4 pb-10 md:px-8">
          <div className="max-w-3xl">
            <div className="mb-5 flex flex-col items-start gap-3">
              <img
                src="/neurotrader-logo-web.png"
                alt="NeuroTrader Journal"
                className="h-12 w-auto max-w-[88vw] object-contain md:h-16"
                draggable={false}
              />
              <p className="text-sm font-semibold text-emerald-300">
              {L("Trading journal + risk operating system", "Journal de trading + sistema de riesgo")}
              </p>
            </div>
            <h1 className="text-5xl font-semibold leading-none text-white md:text-7xl">
              {L("Trade like a business.", "Opera como negocio.")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-200 md:text-lg">
              {L(
                "Create your trading plan, execute with structure, and let AI Coach evaluate your real decisions against the plan.",
                "Crea tu plan de trading, ejecuta con estructura y deja que AI Coach evalúe tus decisiones reales contra ese plan."
              )}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
                {L("Create my journal", "Crear mi journal")}
              </Link>
              <Link href="/plans-comparison" className="rounded-md border border-white/25 px-5 py-3 text-sm font-semibold text-white hover:border-emerald-300">
                {L("Compare plans", "Comparar planes")}
              </Link>
            </div>
          </div>

          <div className="mt-10 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {heroMetrics.map((item) => (
              <div key={item.label} className="rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">{item.value}</p>
                <p className="mt-2 text-xs leading-5 text-slate-200">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-[#07111d]">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-3 px-4 py-5 md:grid-cols-3 md:px-8">
          {operatingLoop.map((item) => (
            <article key={item.title} className="rounded-lg border border-white/10 bg-[#091524] p-5">
              <h2 className="text-lg font-semibold text-white">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-[#050814] px-4 py-16 md:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold text-emerald-300">
              {L("Built around the trader's daily workflow", "Diseñado alrededor del flujo diario del trader")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              {L("Less clutter. More signal.", "Menos ruido. Más señal.")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
              {L(
                "The platform keeps planning, execution, review, rules, and accountability connected instead of scattered across spreadsheets and notes.",
                "La plataforma mantiene planificación, ejecución, revisión, reglas y accountability conectados en vez de regados entre spreadsheets y notas."
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {productViews.map((view) => (
              <article key={view.title} className="rounded-lg border border-white/10 bg-[#08111f] p-4">
                <ProductPreview kind={view.kind} L={L} />
                <h3 className="mt-4 text-lg font-semibold text-white">{view.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{view.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#07100f] px-4 py-16 md:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold text-emerald-300">
              {L("What you control every day", "Lo que controlas cada día")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              {L("Discipline becomes measurable.", "La disciplina se vuelve medible.")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
              {L(
                "NeuroTrader is built for the parts of trading that actually decide whether you survive: process, risk, repetition, and honest review.",
                "NeuroTrader está construido para las partes del trading que deciden si sobrevives: proceso, riesgo, repetición y revisión honesta."
              )}
            </p>
            <div className="mt-6">
              <Link href="/signup" className="inline-flex rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
                {L("Start the workflow", "Comenzar el flujo")}
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {focusAreas.map((item) => (
              <article key={item.label} className="rounded-lg border border-white/10 bg-[#081524] p-5">
                <h3 className="text-base font-semibold text-white">{item.label}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#050814] px-4 py-16 md:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold text-emerald-300">
                {L("Plans that match how you trade", "Planes según cómo operas")}
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
                {L("Core builds structure. Advanced unlocks the full trading business system.", "Core crea estructura. Advanced desbloquea el sistema completo de negocio.")}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                {L(
                  "The upgrade is not just more features. It adds the layers that serious traders pay for: deeper statistics, business reporting, audit tools, and AI coaching.",
                  "El upgrade no es solo más features. Añade las capas que un trader serio necesita: estadística profunda, reportes de negocio, auditoría y AI coaching."
                )}
              </p>
            </div>
            <Link href="/plans-comparison" className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:border-emerald-300">
              {L("See full comparison", "Ver comparación completa")}
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {planIds.map((planId) => {
              const plan = PLAN_CATALOG[planId];
              const featured = planId === "advanced";

              return (
                <article
                  key={planId}
                  className={`rounded-lg border p-6 ${
                    featured
                      ? "border-emerald-300/60 bg-[#09201d]"
                      : "border-white/10 bg-[#08111f]"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-2xl font-semibold text-white">{t(plan.name)}</h3>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{t(plan.comparisonDescription)}</p>
                    </div>
                    {plan.badge ? (
                      <span className="rounded-md border border-emerald-300/50 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                        {t(plan.badge)}
                      </span>
                    ) : null}
                  </div>

                  {featured ? (
                    <div className="mt-5 rounded-lg border border-emerald-300/35 bg-emerald-300/10 p-4">
                      <p className="text-sm font-semibold text-emerald-100">
                        {advancedUpgradePriceLabel(lang)}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-emerald-50/85">
                        {L(
                          "That unlocks AI coaching, business P&L, advanced statistics, audit tools, reports, and unlimited scale.",
                          "Eso desbloquea AI coaching, P&L de negocio, estadística avanzada, auditoría, reportes y escala ilimitada."
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-sm font-semibold text-slate-100">
                        {L("Foundation plan", "Plan base")}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-300">
                        {L(
                          "Great for structure and journaling. Upgrade when you want AI, business reports, and deeper statistics.",
                          "Excelente para estructura y journal. Haz upgrade cuando quieras IA, reportes de negocio y estadística profunda."
                        )}
                      </p>
                    </div>
                  )}

                  <p className="mt-5 text-3xl font-semibold text-white">
                    {planPriceLabel(planId, lang)}
                  </p>
                  {featured ? (
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {ADVANCED_UPGRADE_PILLARS.map((pillar) => (
                        <div key={pillar.label.en} className="rounded-md border border-emerald-300/25 bg-[#061a17] p-3">
                          <p className="text-[11px] font-semibold text-emerald-200">{t(pillar.label)}</p>
                          <p className="mt-1 text-[11px] leading-4 text-emerald-50/75">{t(pillar.body)}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <ul className="mt-5 grid grid-cols-1 gap-2 text-sm text-slate-200 sm:grid-cols-2">
                    {(featured ? ADVANCED_UNLOCKS : plan.pricingFeatures.slice(0, 8)).map((feature) => (
                      <li key={feature.en} className="flex gap-2">
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-sm bg-emerald-300" />
                        <span>{t(feature)}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>

          <div className="mt-4 rounded-lg border border-white/10 bg-[#08111f] p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{BROKER_SYNC_ADDON.name}</h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-300">
                  {t(BROKER_SYNC_ADDON.description)} {L("Optional add-on at checkout.", "Add-on opcional en checkout.")}
                </p>
              </div>
              <p className="text-lg font-semibold text-emerald-300">
                $5.00 {L("/ month", "/ mes")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#07111d] px-4 py-16 md:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-emerald-300">
              {L("Broker coverage", "Cobertura de brokers")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              {L("Turn broker history into a trading edge.", "Convierte tu historial del bróker en ventaja operativa.")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
              {L(
                "Neuro Trader gives users flexible data paths: secure broker sync, account statements, order history, and supported CSV/XLSX imports. The result is a cleaner execution record, stronger audit trail, sharper analytics, and AI coaching based on what actually happened.",
                "Neuro Trader le da al usuario rutas flexibles para traer su data: sync seguro del bróker, account statements, order history e imports CSV/XLSX soportados. El resultado es un récord de ejecución más limpio, una auditoría más fuerte, mejor analítica y AI coaching basado en lo que realmente pasó."
              )}
            </p>
            <Link href="/plans-comparison" className="mt-6 inline-flex rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:border-emerald-300">
              {L("View broker data paths", "Ver rutas de data del bróker")}
            </Link>
          </div>
          <div className="rounded-lg border border-white/10 bg-[#08111f] p-5">
            <h3 className="text-lg font-semibold text-white">
              {L("From broker data to sharper decisions", "De data del bróker a mejores decisiones")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">{t(BROKER_SYNC_ADDON.description)}</p>
            <p className="mt-3 text-sm leading-6 text-emerald-100/80">{t(BROKER_SYNC_ADDON.dataQualityNote)}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                "Secure sync",
                "Broker statements",
                "Order history",
                "Entry/exit timestamps",
                "Fees & commissions",
                "Account activity",
                "Alpaca",
                "Fidelity",
                "Robinhood",
                "Schwab",
                "tastytrade",
                "TradeStation",
                "Webull",
                "Interactive Brokers",
                "Coinbase",
                "CSV import",
              ].map((broker) => (
                <span key={broker} className="rounded-md border border-white/10 bg-[#0b1828] px-3 py-2 text-xs text-slate-200">
                  {broker}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#050814] px-4 py-16 md:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-8 rounded-lg border border-white/10 bg-[#08111f] p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
          <div>
            <p className="text-sm font-semibold text-emerald-300">
              {L("Ready for the public launch flow", "Listo para el flujo público")}
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-white md:text-4xl">
              {L("Create the account, verify email, choose a plan, and start tracking.", "Crea la cuenta, verifica email, escoge plan y empieza a medir.")}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
              {L(
                "The signup path connects the same plan catalog, payment flow, welcome emails, admin controls, 24/7 virtual support, iOS access, and Android coming soon positioning.",
                "El flujo de registro conecta el mismo catálogo de planes, pago, emails de bienvenida, controles admin, soporte virtual 24/7, acceso iOS y Android próximamente."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link href="/signup" className="rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
              {L("Create account", "Crear cuenta")}
            </Link>
            <Link href="/pricing" className="rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:border-emerald-300">
              {L("View pricing", "Ver precios")}
            </Link>
          </div>
        </div>
      </section>

      <FloatingAskButton />
    </main>
  );
}
