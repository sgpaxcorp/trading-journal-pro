"use client";

import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  BrainCircuit,
  FileText,
  SquarePen,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";
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
          <span>{L("Business plan timeline", "Timeline del plan empresarial")}</span>
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
          <span>{L("Business AI coach", "Coach empresarial IA")}</span>
          <span className="text-sky-300">{L("Objective business review", "Revisión empresarial objetiva")}</span>
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
        <span>{L("Business Center", "Centro Empresarial")}</span>
        <span className="text-emerald-300">{L("Live operation", "Operación activa")}</span>
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
      value: L("Business plan creation", "Creación del plan empresarial"),
      label: L(
        "Build a measurable Trading Business Plan with target equity, deadline, max daily loss, risk per trade, daily goal, and checkpoints.",
        "Crea un Plan de Empresa de Trading medible con equity objetivo, fecha límite, max loss diario, riesgo por trade, meta diaria y checkpoints."
      ),
    },
    {
      value: L("AI business follow-up", "Seguimiento empresarial IA"),
      label: L(
        "Business AI Coach compares execution, rule adherence, risk utilization, and emotional drift against the plan.",
        "El Coach Empresarial IA compara ejecución, cumplimiento de reglas, uso de riesgo y desvío emocional contra el plan."
      ),
    },
    {
      value: L("Business performance metrics", "Métricas de rendimiento empresarial"),
      label: L(
        "Track KPIs that matter: win rate, expectancy, streaks, risk discipline, calendar results, and account pacing.",
        "Mide KPIs que importan: win rate, expectancy, rachas, disciplina de riesgo, calendario y ritmo de cuenta."
      ),
    },
    {
      value: L("Business strategy", "Estrategia de negocio"),
      label: L(
        "Turn trading into an operation with P&L, cashflow, reports, audits, and accountability.",
        "Convierte el trading en una operación con P&L, cashflow, reportes, auditoría y accountability."
      ),
    },
  ];

  const planFlowAnchor = {
    eyebrow: L("Trading Business Plan", "Plan de Empresa de Trading"),
    title: L("Create the business plan once.", "Crea el plan empresarial una vez."),
    body: L(
      "Set measurable targets, risk rails, and non-negotiable rules for your trading business. Then the rest of the product exists to protect that plan.",
      "Define metas medibles, límites de riesgo y reglas no negociables para tu empresa de trading. Luego el resto del producto existe para proteger ese plan."
    ),
    rails: [
      { label: L("Target equity", "Equity objetivo"), value: "$25,000" },
      { label: L("Risk per trade", "Riesgo por trade"), value: "$40" },
      { label: L("Daily max loss", "Max loss diario"), value: "$120" },
      { label: L("Core rule", "Regla clave"), value: L("Wait for reclaim", "Esperar reclaim") },
    ],
  };

  const workflowExperience = [
    {
      step: "01",
      title: L("Execution Journal", "Registro de Ejecución"),
      action: L("Capture", "Captura"),
      body: L("Log what really happened.", "Guarda lo que realmente pasó."),
      signal: L("Raw facts", "Hechos crudos"),
      example: [
        "SPY long 10:14 AM",
        L("Exit 10:37 AM • +$84", "Salida 10:37 AM • +$84"),
      ],
      icon: FileText as LucideIcon,
      iconShell: "border-emerald-300/30 bg-emerald-400/12 text-emerald-100",
      signalShell: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100/80",
      glow: "from-emerald-400/30 via-emerald-300/10 to-transparent",
    },
    {
      step: "02",
      title: L("Business Notebook", "Notebook Empresarial"),
      action: L("Think", "Piensa"),
      body: L("See the day and make meaning.", "Ve el día y sácale sentido."),
      signal: L("Context", "Contexto"),
      example: [
        L("A+ setup: liquidity reclaim", "Setup A+: liquidity reclaim"),
        L("Held plan, rushed one partial", "Siguió el plan, apuró un parcial"),
      ],
      icon: SquarePen as LucideIcon,
      iconShell: "border-sky-300/30 bg-sky-400/12 text-sky-100",
      signalShell: "border-sky-300/20 bg-sky-400/10 text-sky-100/80",
      glow: "from-sky-400/28 via-sky-300/10 to-transparent",
    },
    {
      step: "03",
      title: L("Business Performance Coach", "Coach de Rendimiento Empresarial"),
      action: L("Interpret", "Interpreta"),
      body: L("Expose drift and the next move.", "Destapa el drift y el próximo paso."),
      signal: L("Insight", "Insight"),
      example: [
        L("Rule held: risk stayed inside $40", "Regla cumplida: el riesgo se quedó dentro de $40"),
        L("Drift found: fear showed up before target", "Drift detectado: apareció miedo antes del target"),
      ],
      coachRead: {
        label: L("Coach read vs plan", "Lectura del coach vs plan"),
        title: L("You respected the risk rule but cut the winner early.", "Respetaste la regla de riesgo pero cortaste la ganadora temprano."),
        body: L(
          "The plan stayed intact on risk. The real leak was trust: you took profit before the setup fully paid.",
          "El plan se mantuvo intacto en riesgo. La fuga real fue confianza: tomaste profit antes de que el setup pagara completo."
        ),
        next: L("Next action: hold first partial until the planned trigger confirms.", "Próxima acción: aguanta el primer parcial hasta que confirme el trigger planeado."),
      },
      icon: BrainCircuit as LucideIcon,
      iconShell: "border-violet-300/30 bg-violet-400/12 text-violet-100",
      signalShell: "border-violet-300/20 bg-violet-400/10 text-violet-100/80",
      glow: "from-violet-400/28 via-violet-300/10 to-transparent",
    },
  ];

  const workflowLoopSignals = [
    L("Facts", "Hechos"),
    L("Context", "Contexto"),
    L("Insight", "Insight"),
  ];

  const productViews = [
    {
      title: L("Business Center", "Centro Empresarial"),
      body: L("A clean daily command center for equity, risk, execution, and account health.", "Un centro diario para equity, riesgo, ejecución y salud de cuenta."),
      kind: "dashboard" as const,
    },
    {
      title: L("Trading Business Plan", "Plan de Empresa de Trading"),
      body: L(
        "Your business plan becomes the measurable standard for targets, risk, checkpoints, and coaching.",
        "Tu plan empresarial se convierte en el estándar medible para metas, riesgo, checkpoints y coaching."
      ),
      kind: "growth" as const,
    },
    {
      title: L("Business AI Coach", "Coach Empresarial IA"),
      body: L("Objective feedback from your actual trading behavior and business plan.", "Feedback objetivo basado en tu conducta real y tu plan empresarial."),
      kind: "coach" as const,
    },
  ];

  const focusAreas = [
    {
      label: L("Trading Business Plan", "Plan de Empresa de Trading"),
      detail: L(
        "Create the operating plan for the business: target, timeline, risk rails, rules, and checkpoints.",
        "Crea el plan operativo del negocio: meta, timeline, riesgo, reglas y checkpoints."
      ),
    },
    {
      label: L("AI business accountability", "Accountability empresarial IA"),
      detail: L(
        "Business AI Coach reviews whether your trades, behavior, and risk stayed aligned with the business plan.",
        "El Coach Empresarial IA revisa si tus trades, conducta y riesgo se mantuvieron alineados al plan empresarial."
      ),
    },
    {
      label: L("Execution Journal", "Registro de Ejecución"),
      detail: L("Premarket, entries, exits, emotions, tags, lessons, and screenshots.", "Premarket, entradas, salidas, emociones, tags, lecciones y screenshots."),
    },
    {
      label: L("Business Protection System", "Sistema de Protección Empresarial"),
      detail: L(
        "NeuroTrader does not only let you write rules. It helps your trading business obey them with critical alarms, routine checks, and coaching context.",
        "NeuroTrader no solo te deja escribir reglas. Ayuda a tu empresa de trading a obedecerlas con alarmas críticas, chequeos de rutina y contexto de coaching."
      ),
    },
  ];

  const planIds = ["core", "advanced"] as const;

  return (
    <main className="min-h-screen bg-[#050814] text-slate-50 overflow-x-hidden">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto mt-4 flex w-[calc(100%-2rem)] max-w-7xl flex-col gap-3 rounded-lg border border-white/10 bg-[#050814]/78 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl md:flex-row md:items-center md:justify-between md:px-5">
          <Link href="/" className="flex items-center gap-3" aria-label="NeuroTrader home">
            <img
              src="/neurotrader-logo-web.png"
              alt="NeuroTrader"
              className="h-9 w-auto object-contain md:h-10"
              draggable={false}
            />
            <span className="sr-only">Neuro Trader</span>
          </Link>

          <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-300 md:justify-end">
            <Link href="/signin" className="rounded-md px-3 py-2 text-white/82 hover:bg-white/10 hover:text-white">
              {L("Sign in", "Ingresar")}
            </Link>
            <Link href="/plans-comparison" className="rounded-md border border-white/18 px-3 py-2 font-semibold text-white hover:border-emerald-300 hover:text-emerald-100">
              {L("Compare business plans", "Comparar planes empresariales")}
            </Link>
            <Link href="/signup" className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-300">
              {L("Start your trading business", "Comienza tu empresa de trading")}
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
                <span>{L("Business Center", "Centro Empresarial")}</span>
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
                <span>{L("Execution Journal", "Registro de Ejecución")}</span>
                <span>{L("AI business review", "Revisión empresarial IA")}</span>
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
                alt="NeuroTrader"
                className="h-12 w-auto max-w-[88vw] object-contain md:h-16"
                draggable={false}
              />
              <p className="text-sm font-semibold text-emerald-300">
              {L("Trading Business Platform for Trader Entrepreneurs", "Plataforma empresarial de trading para Empresarios Traders")}
              </p>
            </div>
            <h1 className="text-5xl font-semibold leading-none text-white md:text-7xl">
              {L("Start Your Trading Business.", "Comienza Tu Empresa de Trading.")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-200 md:text-lg">
              {L(
                "NeuroTrader gives Trader Entrepreneurs the structure to build, operate, track, and improve a trading business from one platform.",
                "NeuroTrader le da al Empresario Trader la estructura para crear, operar, medir y mejorar una empresa de trading desde una sola plataforma."
              )}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signup" className="rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
                {L("Start Your Trading Business", "Comienza Tu Empresa de Trading")}
              </Link>
              <Link href="/plans-comparison" className="rounded-md border border-white/25 px-5 py-3 text-sm font-semibold text-white hover:border-emerald-300">
                {L("Compare Business Plans", "Comparar Planes Empresariales")}
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

      <section className="bg-[#06110f] px-4 py-16 md:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-emerald-300">
              {L("How the product works together", "Cómo funciona el producto en conjunto")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              {L(
                "Build the business plan. Protect it with one operating loop.",
                "Crea el plan empresarial. Protégelo con un solo loop operativo."
              )}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
              {L(
                "The flow starts with the Trading Business Plan. Then Capture, Think, Interpret, and Guide work together to keep that plan alive during real trading.",
                "El flujo empieza con el Plan de Empresa de Trading. Luego Capture, Think, Interpret y Guide trabajan juntos para mantener ese plan vivo durante el trading real."
              )}
            </p>
          </div>

          <div className="mt-8 rounded-[30px] border border-white/10 bg-[#081524] p-3 shadow-[0_26px_80px_rgba(0,0,0,0.34)] md:p-5 xl:p-6">
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(30,41,59,0.62),rgba(6,16,25,0.96)_56%)] px-4 py-5 md:px-6 md:py-6 xl:px-8 xl:py-8">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_65%)]" />
              <div className="pointer-events-none absolute inset-y-10 right-0 w-48 bg-[radial-gradient(circle,rgba(251,191,36,0.12),transparent_68%)] blur-3xl" />

              <div className="relative z-10 rounded-[24px] border border-emerald-300/14 bg-emerald-400/[0.06] p-4 md:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100/90">
                      <Target className="h-3.5 w-3.5" />
                      {planFlowAnchor.eyebrow}
                    </div>
                    <h3 className="mt-4 text-2xl font-semibold text-white md:text-[30px]">
                      {planFlowAnchor.title}
                    </h3>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">
                      {planFlowAnchor.body}
                    </p>
                  </div>

                  <div className="xl:max-w-[360px]">
                    <div className="rounded-[22px] border border-white/10 bg-[#071320] p-4">
                      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                        <ShieldCheck className="h-4 w-4 text-emerald-300" />
                        {L("Example plan", "Plan de ejemplo")}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {planFlowAnchor.rails.map((rail) => (
                          <div key={rail.label} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                              {rail.label}
                            </p>
                            <p className="mt-1 text-xs font-medium text-slate-200">{rail.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative z-10 flex justify-center py-4 md:py-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0b1625] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-300">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
                  {L("Business protected by 4 pillars", "Empresa protegida por 4 pilares")}
                </div>
              </div>

              <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    {L("Business execution starts", "Empieza la ejecución empresarial")}
                </div>
                <div className="hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300">
                  {workflowLoopSignals.map((signal, index) => (
                    <div key={signal} className="flex items-center gap-2">
                      <span>{signal}</span>
                      {index < workflowLoopSignals.length - 1 ? (
                        <ArrowRight className="h-3 w-3 text-slate-500" />
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-100/90">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                    {L("Business plan stays active", "El plan empresarial sigue activo")}
                </div>
              </div>

              <div className="mt-6 hidden xl:block">
                <div className="relative">
                  <div className="pointer-events-none absolute left-[11%] right-[11%] top-10">
                    <div className="h-px bg-gradient-to-r from-emerald-300/10 via-sky-300/55 via-55% to-amber-300/30" />
                    <div className="absolute inset-x-0 -top-2 h-5 bg-gradient-to-r from-emerald-400/0 via-sky-300/18 to-amber-400/0 blur-2xl" />
                  </div>

                  <div className="grid grid-cols-4 gap-4">
                    {workflowExperience.map((item, index) => {
                      const Icon = item.icon;
                      return (
                        <article key={item.title} className="relative pt-2">
                          <div className="relative z-10 mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/12 bg-[#0d1a2b] shadow-[0_18px_45px_rgba(0,0,0,0.34)]">
                            <div className={`flex h-14 w-14 items-center justify-center rounded-full border ${item.iconShell}`}>
                              <Icon className="h-6 w-6" />
                            </div>
                          </div>

                          {index < workflowExperience.length - 1 ? (
                            <div className="pointer-events-none absolute left-[calc(50%+42px)] right-[-16px] top-10 z-20 flex items-center justify-end text-slate-300">
                              <ArrowRight className="h-4 w-4" />
                            </div>
                          ) : null}

                          <div className={`relative mt-5 overflow-hidden rounded-[24px] border p-5 ${item.coachRead ? "border-violet-300/18 bg-[linear-gradient(180deg,rgba(27,19,46,0.96),rgba(10,24,39,0.96))]" : "border-white/10 bg-[#0a1827]/96"}`}>
                            <div className={`pointer-events-none absolute inset-x-5 top-0 h-24 bg-gradient-to-b ${item.glow} blur-2xl`} />
                            <div className="relative z-10">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
                                  {item.step}
                                </span>
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${item.signalShell}`}>
                                  {item.signal}
                                </span>
                              </div>

                              <p className="mt-5 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                                {item.title}
                              </p>
                              <h3 className="mt-2 text-[34px] font-semibold leading-none text-white">
                                {item.action}
                              </h3>
                              <p className="mt-4 text-sm leading-6 text-slate-300">
                                {item.body}
                              </p>

                              <div className="mt-4 space-y-1.5">
                                {item.example.map((line) => (
                                  <div
                                    key={line}
                                    className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] leading-5 text-slate-200"
                                  >
                                    {line}
                                  </div>
                                ))}
                              </div>

                              {item.coachRead ? (
                                <div className="mt-4 rounded-[20px] border border-violet-300/20 bg-violet-400/[0.08] p-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-100/80">
                                    {item.coachRead.label}
                                  </p>
                                  <p className="mt-2 text-sm font-semibold leading-6 text-white">
                                    {item.coachRead.title}
                                  </p>
                                  <p className="mt-2 text-[12px] leading-5 text-slate-200">
                                    {item.coachRead.body}
                                  </p>
                                  <div className="mt-3 rounded-2xl border border-violet-300/18 bg-[#120f22] px-3 py-2 text-[11px] leading-5 text-violet-50">
                                    {item.coachRead.next}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3 xl:hidden">
                {workflowExperience.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title}>
                      <article className={`relative overflow-hidden rounded-[24px] border p-5 ${item.coachRead ? "border-violet-300/18 bg-[linear-gradient(180deg,rgba(27,19,46,0.96),rgba(10,24,39,0.96))]" : "border-white/10 bg-[#0a1827]/96"}`}>
                        <div className={`pointer-events-none absolute inset-x-5 top-0 h-20 bg-gradient-to-b ${item.glow} blur-2xl`} />
                        <div className="relative z-10 flex items-start gap-4">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/12 bg-[#0d1a2b]">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${item.iconShell}`}>
                              <Icon className="h-4.5 w-4.5" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
                                {item.step}
                              </span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${item.signalShell}`}>
                                {item.signal}
                              </span>
                            </div>
                            <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                              {item.title}
                            </p>
                            <h3 className="mt-1 text-2xl font-semibold leading-none text-white">
                              {item.action}
                            </h3>
                            <p className="mt-3 text-sm leading-6 text-slate-300">
                              {item.body}
                            </p>
                            <div className="mt-3 space-y-1.5">
                              {item.example.map((line) => (
                                <div
                                  key={line}
                                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] leading-5 text-slate-200"
                                >
                                  {line}
                                </div>
                              ))}
                            </div>

                            {item.coachRead ? (
                              <div className="mt-3 rounded-[20px] border border-violet-300/20 bg-violet-400/[0.08] p-3">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-100/80">
                                  {item.coachRead.label}
                                </p>
                                <p className="mt-2 text-sm font-semibold leading-6 text-white">
                                  {item.coachRead.title}
                                </p>
                                <p className="mt-2 text-[12px] leading-5 text-slate-200">
                                  {item.coachRead.body}
                                </p>
                                <div className="mt-3 rounded-2xl border border-violet-300/18 bg-[#120f22] px-3 py-2 text-[11px] leading-5 text-violet-50">
                                  {item.coachRead.next}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </article>

                      {index < workflowExperience.length - 1 ? (
                        <div className="flex justify-center py-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0c1522] text-slate-400">
                            <ArrowDown className="h-4 w-4" />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="relative z-10 mt-5 grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[22px] border border-white/10 bg-[#061019] px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {L("How the plan gets protected", "Cómo se protege el plan")}
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                    {[
                      L("Capture the session", "Captura la sesión"),
                      L("Think through the day", "Piensa el día"),
                      L("Interpret the drift", "Interpreta el drift"),
                      L("Guide the next move", "Guía el próximo paso"),
                    ].map((line) => (
                      <div key={line} className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-xs font-medium text-slate-200">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[22px] border border-emerald-300/14 bg-emerald-400/[0.05] px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-200/85">
                    {L("Protected outcome", "Resultado protegido")}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-200">
                    {L(
                      "The last layer is not another report. It helps the trader carry the original plan into the next session with cleaner execution and better awareness.",
                      "La última capa no es otro reporte. Ayuda al trader a llevar el plan original hacia la próxima sesión con mejor ejecución y más claridad."
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#050814] px-4 py-16 md:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-8 max-w-3xl">
            <p className="text-sm font-semibold text-emerald-300">
              {L("Built around the Trader Entrepreneur's daily operation", "Diseñado alrededor de la operación diaria del Empresario Trader")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              {L("Less clutter. More signal.", "Menos ruido. Más señal.")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
              {L(
                "The platform keeps planning, execution, review, rule protection, and accountability connected instead of scattered across spreadsheets, notes, and memory.",
                "La plataforma mantiene planificación, ejecución, revisión, protección de reglas y accountability conectados en vez de regados entre spreadsheets, notas y memoria."
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
              {L("Your trading business becomes measurable.", "Tu empresa de trading se vuelve medible.")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">
              {L(
                "NeuroTrader is built for the parts of a trading business that need structure: measurable goals, risk discipline, rule obedience, repetition, and honest review.",
                "NeuroTrader está construido para las partes de una empresa de trading que necesitan estructura: metas medibles, disciplina de riesgo, obedecer reglas, repetición y revisión honesta."
              )}
            </p>
            <div className="mt-6">
              <Link href="/signup" className="inline-flex rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
                {L("Start the business workflow", "Comenzar el flujo empresarial")}
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
                  "The upgrade is not just more features. It adds the operating layers a Trader Entrepreneur needs: deeper statistics, business reporting, audit tools, and AI coaching.",
                  "El upgrade no es solo más features. Añade las capas operativas que necesita un Empresario Trader: estadística profunda, reportes de negocio, auditoría y AI coaching."
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
                          "Great for building the operating foundation. Upgrade when you want AI, business reports, and deeper statistics.",
                          "Excelente para construir la base operativa. Haz upgrade cuando quieras IA, reportes de negocio y estadística profunda."
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
              {L("Ready to open your trading business workspace", "Listo para abrir tu espacio de empresa de trading")}
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-white md:text-4xl">
              {L("Create the business account, verify email, choose a plan, and start operating.", "Crea la cuenta empresarial, verifica email, escoge plan y empieza a operar.")}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 md:text-base">
              {L(
                "The signup path connects the same business plan catalog, payment flow, welcome emails, admin controls, 24/7 virtual support, iOS access, and Android coming soon positioning.",
                "El flujo de registro conecta el mismo catálogo de planes empresariales, pago, emails de bienvenida, controles admin, soporte virtual 24/7, acceso iOS y Android próximamente."
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <Link href="/signup" className="rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
              {L("Start Your Trading Business", "Comienza Tu Empresa de Trading")}
            </Link>
            <Link href="/pricing" className="rounded-md border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:border-emerald-300">
              {L("View Business Plans", "Ver Planes Empresariales")}
            </Link>
          </div>
        </div>
      </section>

      <FloatingAskButton />
    </main>
  );
}
