"use client";

import Link from "next/link";
import FloatingAskButton from "./components/FloatingAskButton";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function Home() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const year = new Date().getFullYear();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      {/* Top Bar */}
      <header className="w-full flex items-center justify-between px-6 md:px-12 py-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="flex items-center gap-3">
          <img
            src="/neurotrader-logo.svg"
            alt="Neuro Trader Journal"
            className="h-10 md:h-12 w-auto object-contain"
            draggable={false}
          />
          <span className="font-semibold text-sm md:text-base tracking-tight">
            Neuro Trader Journal
          </span>
        </div>
        <nav className="flex items-center gap-4 text-xs md:text-sm text-slate-400">
          <Link href="/plans-comparison" className="hover:text-emerald-400">
            {L("Features", "Features")}
          </Link>
          <Link href="/pricing" className="hover:text-emerald-400">
            {L("Pricing", "Precios")}
          </Link>
          <Link href="/resources" className="hover:text-emerald-400">
            {L("About Us", "Sobre nosotros")}
          </Link>
          <Link href="/growthaccountsimulator" className="hover:text-emerald-400">
            {L("Growth Account Simulator", "Simulador de crecimiento")}
          </Link>
          <Link
            href="/signin"
            className="px-3 py-1.5 rounded-full border border-slate-600 hover:border-emerald-400 transition"
          >
            {L("Sign in", "Ingresar")}
          </Link>
          <Link
            href="/signup"
            className="px-3 py-1.5 rounded-full bg-emerald-400 text-slate-950 font-semibold hover:bg-emerald-300 transition"
          >
            {L("Begin Now", "Comenzar")}
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="px-6 md:px-12 pt-10 pb-16 flex flex-col lg:flex-row items-center gap-10">
        {/* Left: Text */}
        <div className="w-full lg:w-1/2 space-y-6">
          <p className="text-emerald-400 text-xs uppercase tracking-[0.2em]">
            {L("Embrace the process", "Abraza el proceso")}
          </p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight">
            {L("Treat trading like a business.", "Convierte el trading en un negocio.")}{" "}
            <span className="text-emerald-400">
              {L("Master your psychology.", "Domina tu psicología.")}
            </span>
          </h1>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed">
            {L(
              "Neuro Trader Journal helps you build structure, measure performance, and keep your execution aligned with your plan. The core edge is your mindset — not just the trade.",
              "Neuro Trader Journal te ayuda a crear estructura, medir rendimiento y mantener la ejecución alineada con tu plan. La ventaja principal es tu mentalidad — no solo el trade."
            )}
          </p>
          <ul className="text-slate-300 text-sm md:text-base space-y-2">
            <li>• {L("Automate journaling: import single trades, premium-selling, and complex options strategies.", "Automatiza el journal: importa trades simples, ventas de prima y estrategias complejas de opciones.")}</li>
            <li>• {L("Build rules, goals, and alerts to protect your downside.", "Crea reglas, metas y alertas para proteger tu downside.")}</li>
            <li>• {L("Run your trading like a business with clear accountability.", "Opera como negocio con responsabilidad clara.")}</li>
            <li>• {L("Switch languages (English/Spanish) and toggle Neuro Mode or Light Mode.", "Cambia idiomas (inglés/español) y alterna entre Neuro Mode o Light Mode.")}</li>
          </ul>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/signup"
              className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-sm md:text-base font-semibold hover:bg-emerald-300 transition"
            >
              {L("Create My Journal", "Crear mi journal")}
            </Link>
            <Link
              href="/pricing"
              className="px-5 py-2.5 rounded-xl border border-slate-600 text-slate-200 text-sm md:text-base hover:border-emerald-400 transition"
            >
              {L("View pricing & plans", "Ver precios y planes")}
            </Link>
          </div>
          <p className="text-[10px] text-slate-500 pt-1">
            {L(
              "No spreadsheets. No shaming. Just structure, risk rules and clear feedback to stop overtrading.",
              "Sin spreadsheets. Sin shame. Solo estructura, reglas de riesgo y feedback claro para frenar el overtrading."
            )}
          </p>
        </div>

        {/* Right: Visual platform preview */}
        <div className="w-full lg:w-1/2 flex justify-center">
          <div className="relative w-full max-w-xl">
            {/* Gradient background */}
            <div
              className="absolute -inset-4 rounded-4xl bg-linear-to-tr from-indigo-600/35 via-fuchsia-500/35 to-emerald-400/25 blur-2 opacity-90"
              aria-hidden="true"
            />

            {/* Main dashboard card */}
            <div className="relative bg-slate-950/98 rounded-[26px] border border-slate-800 shadow-2xl p-4 flex flex-col gap-3">
              {/* Top bar */}
              <div className="flex items-center justify-between text-[9px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-900/90 border border-slate-700 text-[8px] text-emerald-300">
                    {L("Dashboard", "Dashboard")}
                  </span>
                  <span>{L("All accounts", "Todas las cuentas")}</span>
                </div>
                <span className="text-slate-500">{L("Goal mode · AI coach", "Modo metas · Coach IA")}</span>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-2 text-[9px]">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2">
                  <p className="text-slate-500">{L("Equity", "Equity")}</p>
                  <p className="text-[13px] font-semibold text-emerald-400">
                    $12,940
                  </p>
                  <p className="text-[8px] text-emerald-300">{L("+4.7% this month", "+4.7% este mes")}</p>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2">
                  <p className="text-slate-500">{L("Win rate", "Win rate")}</p>
                  <p className="text-[13px] font-semibold text-slate-50">61%</p>
                  <p className="text-[8px] text-slate-500">{L("Last 50 trades", "Últimos 50 trades")}</p>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2">
                  <p className="text-slate-500">{L("Max loss rule", "Regla de max loss")}</p>
                  <p className="text-[13px] font-semibold text-sky-400">{L("On", "Activa")}</p>
                  <p className="text-[8px] text-slate-500">{L("Protected", "Protegido")}</p>
                </div>
              </div>

              {/* Heatmap + equity mini-chart */}
              <div className="grid grid-cols-5 gap-2 items-end">
                {/* Heatmap */}
                <div className="col-span-2 flex flex-wrap gap-[3px]">
                  {Array.from({ length: 20 }).map((_, i) => {
                    const gain = [1, 2, 4, 5, 7, 10, 13, 16, 18].includes(i);
                    const loss = [3, 8, 14].includes(i);
                    const color = gain
                      ? "bg-emerald-400/85"
                      : loss
                      ? "bg-sky-500/80"
                      : "bg-slate-700/90";
                    return (
                      <div
                        key={i}
                        className={`w-3 h-3 rounded-[3px] ${color}`}
                      />
                    );
                  })}
                </div>
                {/* Equity bars */}
                <div className="col-span-3 h-14 bg-slate-900/90 rounded-xl border border-slate-800 px-1.5 flex items-end gap-1.5 relative overflow-hidden">
                  {[40, 42, 39, 45, 48, 52, 50, 56, 61, 66].map((v, i) => {
                    const min = 38;
                    const max = 68;
                    const h = ((v - min) / (max - min)) * 32 + 4;
                    return (
                      <div
                        key={i}
                        className="w-1.5 rounded-full bg-emerald-400/75"
                        style={{ height: h }}
                      />
                    );
                  })}
                  <div className="absolute inset-x-0 bottom-2 h-px bg-slate-800/70" />
                  <span className="absolute right-2 top-1 text-[7px] text-emerald-300">
                    {L("Above goal", "Sobre la meta")}
                  </span>
                </div>
              </div>

              {/* AI coach */}
              <div className="px-2 py-1.5 rounded-xl bg-slate-900/95 border border-slate-800 text-[8px] text-slate-300">
                <span className="text-emerald-300 font-semibold">
                  {L("AI Coach:", "Coach IA:")}
                </span>{" "}
                {L(
                  "You're ahead of plan. Best performance in structured morning sessions. Avoid emotional late-day trades.",
                  "Vas por encima del plan. Mejor rendimiento en sesiones estructuradas de la mañana. Evita trades emocionales al final del día."
                )}
              </div>
            </div>

            {/* Calendar card */}
            <div className="absolute -bottom-4 right-1 w-52 sm:w-60 bg-slate-950/98 rounded-2xl border border-slate-800 shadow-2xl p-3 text-[8px]">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">{L("Monthly P&L", "P&L mensual")}</span>
                <span className="text-emerald-300 font-semibold">+ $1,487</span>
              </div>
              <div className="grid grid-cols-7 gap-[3px] mb-1">
                {Array.from({ length: 21 }).map((_, i) => {
                  const gain = [1, 2, 4, 6, 9, 12, 15, 18].includes(i);
                  const loss = [3, 7, 13, 19].includes(i);
                  const base = "h-4 rounded-[3px] border border-slate-900";
                  const color = gain
                    ? "bg-emerald-400/85"
                    : loss
                    ? "bg-sky-500/80"
                    : "bg-slate-800/90";
                  return <div key={i} className={`${base} ${color}`} />;
                })}
              </div>
              <p className="text-[7px] text-slate-400">
                {L(
                  "Green days push you toward your target. Blue days stay controlled under your max loss.",
                  "Los días verdes te acercan a tu meta. Los azules se mantienen controlados bajo tu max loss."
                )}
              </p>
            </div>

            {/* Journal note card */}
            <div className="absolute -bottom-10 left-0 w-40 sm:w-44 bg-slate-950/98 rounded-2xl border border-slate-800 shadow-2xl p-3 text-[8px]">
              <p className="text-[8px] text-slate-400 mb-1">
                {L("Journal entry preview", "Vista previa del journal")}
              </p>
              <p className="text-[8px] text-slate-200">
                {L("Reason: VWAP bounce · Risk 0.5R", "Razón: rebote VWAP · Riesgo 0.5R")}
              </p>
              <p className="text-[8px] text-slate-200">
                {L("Emotion: felt confident ✅", "Emoción: me sentí confiado ✅")}
              </p>
              <p className="text-[7px] text-emerald-300 mt-1">
                {L("AI: repeat this setup, avoid revenge trades.", "IA: repite este setup, evita revenge trades.")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trading like a business + roadmap */}
      <section className="px-6 md:px-12 pb-16">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col gap-3 mb-6">
            <p className="text-emerald-400 text-xs uppercase tracking-[0.2em]">
              {L("Trading like a business", "Trading como negocio")}
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold">
              {L(
                "A business roadmap for disciplined trading.",
                "Un roadmap de negocio para operar con disciplina."
              )}
            </h2>
            <p className="text-slate-300 text-sm md:text-base max-w-3xl">
              {L(
                "Build structure, log everything, lead yourself, and let AI review the data for patterns that win and patterns that lose.",
                "Crea estructura, registra todo, lidera tu proceso y deja que la IA detecte patrones que ganan y patrones que pierden."
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.25fr,0.75fr] gap-8 items-start">
            {/* Roadmap visual (pro) */}
            <div className="relative rounded-3xl border border-slate-800 bg-slate-950/90 p-6 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(16,185,129,0.28),transparent_48%),radial-gradient(circle_at_50%_10%,rgba(139,92,246,0.22),transparent_50%),radial-gradient(circle_at_85%_18%,rgba(56,189,248,0.24),transparent_52%)]" />
              <div className="absolute inset-0 opacity-20 pointer-events-none">
                <svg viewBox="0 0 800 240" className="w-full h-full">
                  <path
                    d="M20 200 C120 140, 220 160, 320 120 C420 80, 520 140, 620 90 C700 60, 760 80, 780 40"
                    fill="none"
                    stroke="rgba(56,189,248,0.9)"
                    strokeWidth="3"
                    strokeDasharray="6 6"
                  />
                  {[
                    [80, 170, 20],
                    [140, 150, -10],
                    [200, 160, 12],
                    [260, 130, -8],
                    [320, 120, 18],
                    [380, 105, -12],
                    [440, 120, 10],
                    [500, 95, -16],
                    [560, 110, 14],
                    [620, 85, -20],
                    [680, 70, 22],
                  ].map(([x, y, h], i) => (
                    <g key={i}>
                      <line x1={x} y1={y - 22} x2={x} y2={y + 22} stroke="rgba(226,232,240,0.9)" strokeWidth="2.5" />
                      <rect
                        x={x - 7}
                        y={h >= 0 ? y - h : y}
                        width="14"
                        height={Math.abs(h)}
                        rx="3"
                        fill={h >= 0 ? "rgba(52,211,153,0.9)" : "rgba(139,92,246,0.85)"}
                      />
                    </g>
                  ))}
                </svg>
              </div>

              <div className="relative">
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>{L("Success roadmap", "Roadmap de éxito")}</span>
                  <span className="text-emerald-300">{L("Trading business system", "Sistema de negocio")}</span>
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-5 gap-3">
                  {[
                    {
                      step: "01",
                      title: L("Create a plan", "Crea un plan"),
                      desc: L("Start here. Structure + risk limits.", "Empieza aquí. Estructura + límites de riesgo."),
                    },
                    {
                      step: "02",
                      title: L("Log", "Registro"),
                      desc: L("Trades + sentiment", "Trades + sentimiento"),
                    },
                    {
                      step: "03",
                      title: L("Rules", "Reglas"),
                      desc: L("Discipline & alerts", "Disciplina y alertas"),
                    },
                    {
                      step: "04",
                      title: L("Metrics", "Métricas"),
                      desc: L("KPIs & streaks", "KPIs y rachas"),
                    },
                    {
                      step: "05",
                      title: L("AI Review", "Revisión IA"),
                      desc: L("Patterns + new path", "Patrones + nuevo rumbo"),
                    },
                  ].map((item) => (
                    <div key={item.step} className="rounded-2xl border border-slate-800 bg-slate-900/85 p-4 text-center">
                      <div className="mx-auto mb-2 h-9 w-9 rounded-full border border-emerald-400/60 bg-emerald-500/15 flex items-center justify-center text-[11px] text-emerald-300 font-semibold">
                        {item.step}
                      </div>
                      <p className="text-slate-50 text-[12px] font-semibold">{item.title}</p>
                      <p className="text-slate-400 text-[10px] mt-1">{item.desc}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 text-[11px] text-slate-400">
                  {L(
                    "Log every trade and sentiment. Follow your rules. Monitor your metrics. AI reviews your data and finds winning and losing patterns.",
                    "Registra cada trade y sentimiento. Sigue tus reglas. Monitorea tus métricas. La IA revisa tus datos y detecta patrones ganadores y perdedores."
                  )}
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-4xl bg-linear-to-br from-emerald-500/15 via-indigo-500/10 to-transparent blur-2xl" />
              <div className="relative p-1">
                <p className="text-emerald-400 text-xs uppercase tracking-[0.2em]">
                  {L("How the platform helps you", "Cómo la plataforma te ayuda")}
                </p>
                <h3 className="text-2xl md:text-3xl font-semibold mt-2">
                  {L(
                    "A system that turns your execution into a repeatable business.",
                    "Un sistema que convierte tu ejecución en un negocio repetible."
                  )}
                </h3>
                <div className="mt-2 flex items-center justify-end text-[10px] text-emerald-300 font-semibold">
                  {L("Built-in system", "Sistema integrado")}
                </div>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
                  {[
                    {
                      label: L("Create a structured plan", "Crear un plan estructurado"),
                      desc: L(
                        "Start with a clear plan to build structure and targets.",
                        "Empieza con un plan claro para crear estructura y metas."
                      ),
                      gradient: "from-emerald-500/20 via-indigo-500/15 to-violet-500/20",
                    },
                    {
                      label: L("Log execution + sentiment", "Registrar ejecución + sentimiento"),
                      desc: L(
                        "Knowing yourself leads to better decisions.",
                        "Conocerte mejor te ayuda a tomar mejores decisiones."
                      ),
                      gradient: "from-blue-500/20 via-violet-500/15 to-emerald-500/20",
                    },
                    {
                      label: L("Rules = self‑leadership", "Reglas = auto‑liderazgo"),
                      desc: L(
                        "Follow the rules you set. Respect your process.",
                        "Cumple tus reglas y respeta tu proceso."
                      ),
                      gradient: "from-emerald-500/20 via-blue-500/15 to-violet-500/20",
                    },
                    {
                      label: L("Metrics that reveal your edge", "Métricas que revelan tu edge"),
                      desc: L(
                        "Understand execution and decisions to improve.",
                        "Entiende tu ejecución y decisiones para mejorar."
                      ),
                      gradient: "from-violet-500/20 via-indigo-500/15 to-emerald-500/20",
                    },
                    {
                      label: L("AI coach that stays objective", "IA objetiva como coach"),
                      desc: L(
                        "AI reviews every decision, sentiment, and strategy to suggest a better path.",
                        "La IA revisa cada decisión, sentimiento y estrategia para sugerir un mejor camino."
                      ),
                      gradient: "from-indigo-500/20 via-violet-500/15 to-emerald-500/20",
                    },
                    {
                      label: L("Turn trading into a business", "Convierte el trading en un negocio"),
                      desc: L(
                        "Build your business plan: goals, rules, schedule, cost control, and when to scale or pause.",
                        "Crea tu plan de negocio: objetivos, reglas, horario, control de costos y cuándo escalar o pausar."
                      ),
                      gradient: "from-emerald-500/20 via-indigo-500/15 to-violet-500/20",
                    },
                    {
                      label: L("Reduce uncertainty with process", "Reduce la incertidumbre con proceso"),
                      desc: L(
                        "Anchors you to a clear flow: setup → entry → management → exit → review.",
                        "Te ancla a un flujo claro: setup → entrada → gestión → salida → revisión."
                      ),
                      gradient: "from-blue-500/20 via-violet-500/15 to-emerald-500/20",
                    },
                    {
                      label: L("Risk management that protects capital", "Gestión de riesgo que protege capital"),
                      desc: L(
                        "Define risk per trade, daily/weekly limits, sizing rules, and when to stop.",
                        "Define riesgo por trade, límites diarios/semanales, sizing y cuándo detenerte."
                      ),
                      gradient: "from-violet-500/20 via-indigo-500/15 to-emerald-500/20",
                    },
                  ].map((row, i) => (
                    <div
                      key={i}
                      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${row.gradient} p-6 shadow-[0_12px_46px_rgba(0,0,0,0.45)] min-h-[132px] h-full`}
                    >
                      <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-gradient-to-br from-emerald-500/25 via-indigo-500/20 to-violet-500/25 blur-2xl opacity-70 animate-pulse [animation-duration:6s]" />
                      <div className="relative text-slate-50 font-semibold text-[13px]">{row.label}</div>
                      <div className="relative text-slate-300 text-[11px] mt-2 leading-relaxed">{row.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Automated journaling section */}
      <section className="px-6 md:px-12 pb-16">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="relative p-1">
            <p className="text-emerald-400 text-xs uppercase tracking-[0.2em]">
              {L("Automate journaling", "Automatiza el journaling")}
            </p>
            <h3 className="text-xl md:text-2xl font-semibold mt-2">
              {L(
                "Import trades and let the system classify everything.",
                "Importa trades y deja que el sistema clasifique todo."
              )}
            </h3>
            <p className="text-slate-300 text-sm mt-3">
              {L(
                "Single trades, premium-selling, and complex options strategies are mapped to your journal automatically.",
                "Trades simples, ventas de prima y estrategias complejas de opciones se mapean al journal automáticamente."
              )}
            </p>
          </div>

          <div className="relative p-1">
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>{L("Automated journaling system", "Sistema de journaling automático")}</span>
              <span className="text-emerald-300 font-semibold">{L("Consistent", "Consistente")}</span>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
              {[
                {
                  label: L("Single trades + multi‑leg", "Trades simples + multi‑leg"),
                  desc: L(
                    "Imports and maps every leg automatically.",
                    "Importa y mapea cada pierna automáticamente."
                  ),
                  gradient: "from-emerald-500/20 via-indigo-500/15 to-violet-500/20",
                },
                {
                  label: L("Premium selling strategies", "Estrategias de venta de prima"),
                  desc: L(
                    "Tracks credits, debits, and rollouts in one place.",
                    "Registra créditos, débitos y rollouts en un solo lugar."
                  ),
                  gradient: "from-blue-500/20 via-violet-500/15 to-emerald-500/20",
                },
                {
                  label: L("Complex options flows", "Flujos complejos de opciones"),
                  desc: L(
                    "Classifies strategy types and timestamps them.",
                    "Clasifica tipos de estrategia y sus timestamps."
                  ),
                  gradient: "from-violet-500/20 via-indigo-500/15 to-emerald-500/20",
                },
                {
                  label: L("Structured in minutes", "Estructurado en minutos"),
                  desc: L(
                    "Analytics are ready as soon as the import finishes.",
                    "La analítica queda lista al terminar la importación."
                  ),
                  gradient: "from-indigo-500/20 via-violet-500/15 to-emerald-500/20",
                },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${row.gradient} p-6 shadow-[0_12px_46px_rgba(0,0,0,0.45)] min-h-[132px] h-full`}
                >
                  <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-gradient-to-br from-emerald-500/25 via-indigo-500/20 to-violet-500/25 blur-2xl opacity-70 animate-pulse [animation-duration:6s]" />
                  <div className="relative text-slate-50 font-semibold text-[13px]">{row.label}</div>
                  <div className="relative text-slate-300 text-[11px] mt-2 leading-relaxed">{row.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why this journal is different */}
      <section className="px-6 md:px-12 pb-20">
        <div className="max-w-6xl mx-auto">
          <p className="text-emerald-400 text-xs uppercase tracking-[0.2em]">
            {L("Why this journal is different", "¿Qué hace diferente este journal?")}
          </p>
          <h3 className="text-2xl md:text-3xl font-semibold mt-2">
            {L(
              "Built for serious traders who treat this as a business.",
              "Creado para traders serios que lo tratan como un negocio."
            )}
          </h3>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              {
                title: L("Automated journaling", "Journaling automatizado"),
                desc: L(
                  "Import trades fast. Single, premium-selling, and complex options strategies are mapped instantly.",
                  "Importa trades rápido. Trades simples, venta de prima y estrategias complejas quedan mapeadas al instante."
                ),
                tone: "from-emerald-500/60 via-indigo-500/55 to-violet-600/60",
              },
              {
                title: L("Unlimited accountability", "Accountability real"),
                desc: L(
                  "Rules, goals, and alerts keep you honest and consistent.",
                  "Reglas, metas y alertas te mantienen honesto y consistente."
                ),
                tone: "from-blue-500/60 via-violet-600/55 to-emerald-500/60",
              },
              {
                title: L("AI trading review", "Revisión con IA"),
                desc: L(
                  "AI detects winning patterns and warns you about losing behaviors.",
                  "La IA detecta patrones ganadores y te advierte sobre comportamientos perdedores."
                ),
                tone: "from-violet-600/60 via-blue-600/55 to-emerald-600/60",
              },
              {
                title: L("Automated analytics statistics", "Analítica automática"),
                desc: L(
                  "No manual calculations. Your performance stats are generated instantly.",
                  "Sin cálculos manuales. Tus estadísticas se generan al instante."
                ),
                tone: "from-blue-600/60 via-violet-600/55 to-emerald-600/60",
              },
            ].map((card) => (
              <div
                key={card.title}
                className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.tone} p-6 shadow-[0_12px_46px_rgba(0,0,0,0.45)]`}
              >
                <div className="pointer-events-none absolute -inset-6 rounded-3xl bg-gradient-to-br from-emerald-500/25 via-indigo-500/20 to-violet-500/25 blur-2xl opacity-70 animate-pulse [animation-duration:6s]" />
                <p className="relative text-white font-semibold text-[13px]">{card.title}</p>
                <p className="relative text-white/80 text-[11px] mt-2 leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ALL STARTS WITH PLANNING */}
      <section className="px-6 md:px-12 pb-16">
        <div className="w-full max-w-6xl mx-auto grid lg:grid-cols-[1.4fr,1.6fr] gap-8 items-center">
          {/* Left copy */}
          <div className="space-y-4">
            <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-400">
              {L("It all starts with planning", "Todo empieza con la planificación")}
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold">
              {L(
                "Design your money growth plan before you click buy or sell.",
                "Diseña tu plan de crecimiento del dinero antes de dar click en comprar o vender."
              )}
            </h2>
            <p className="text-sm md:text-base text-slate-300 leading-relaxed">
              {L(
                "Here you can create a money growth plan, define a clear monetary goal, and build a trading action plan that guides you through planning, execution, and results tracking — like a real trading business.",
                "Aquí puedes crear un plan de crecimiento del dinero, definir una meta monetaria clara y construir un plan de acción de trading que te guía al planear, ejecutar y registrar resultados — como un negocio real de trading."
              )}
            </p>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-emerald-400/40 text-emerald-300">
                {L("Plan: balance, risk, target", "Plan: balance, riesgo, meta")}
              </span>
              <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700 text-slate-300">
                {L("Execute: follow rules & alerts", "Ejecuta: sigue reglas y alertas")}
              </span>
              <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-sky-500/40 text-sky-300">
                {L("Record: AI-grade journal & P&L", "Registra: journal y P&L con IA")}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {L(
                "Turn your plan into a visual roadmap: see in seconds if today’s trades move you closer or further from your goal.",
                "Convierte tu plan en un mapa visual: en segundos verás si los trades de hoy te acercan o alejan de tu meta."
              )}
            </p>
          </div>

          {/* Right: Marketing chart */}
          <div className="relative">
            <div
              className="absolute -inset-3 rounded-3xl bg-linear-to-tr from-emerald-500/20 via-indigo-500/15 to-sky-500/15 blur-2xl opacity-90"
              aria-hidden="true"
            />
            <div className="relative bg-slate-950/98 border border-slate-800/90 rounded-3xl p-4 md:p-5 shadow-2xl space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wide">
                    {L("Growth plan snapshot", "Resumen del plan")}
                  </p>
                  <p className="text-sm font-semibold text-slate-50">
                    {L("From plan to tracked execution", "Del plan a la ejecución medida")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-slate-500">
                    {L("Target equity", "Equity objetivo")}
                  </p>
                  <p className="text-[13px] font-semibold text-emerald-400">
                    $25,000
                  </p>
                  <p className="text-[8px] text-emerald-300">
                    {L("+8% avg monthly goal", "+8% meta mensual promedio")}
                  </p>
                </div>
              </div>

              <div className="mt-1 bg-slate-900/90 rounded-2xl border border-slate-800 px-3 py-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[8px] text-slate-400">
                    {L("Projected vs actual growth", "Crecimiento proyectado vs real")}
                  </span>
                  <span className="text-[8px] text-emerald-300">
                    {L("On track ✅", "En ruta ✅")}
                  </span>
                </div>
                <div className="relative h-20 flex items-end gap-1.5">
                  <div className="absolute inset-x-0 bottom-4 h-px bg-linear-to-r from-emerald-500/15 via-emerald-400/30 to-sky-400/20" />
                  {[20, 25, 30, 36, 42, 49, 57, 63, 71, 80].map((v, i) => {
                    const h = 8 + (v / 80) * 40;
                    const cls =
                      i >= 6 ? "bg-emerald-400" : "bg-emerald-400/55";
                    return (
                      <div
                        key={i}
                        className={`w-[7px] rounded-full ${cls}`}
                        style={{ height: h }}
                      />
                    );
                  })}
                  <span className="absolute left-0 bottom-0 text-[7px] text-slate-500">
                    {L("Month 1", "Mes 1")}
                  </span>
                  <span className="absolute right-0 bottom-0 text-[7px] text-emerald-300">
                    {L("Month 10", "Mes 10")}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[8px] mt-1">
                <div className="bg-slate-900/95 border border-emerald-400/40 rounded-xl p-2">
                  <p className="text-[8px] font-semibold text-emerald-300">
                    {L("1 · Plan", "1 · Plan")}
                  </p>
                  <p className="text-slate-300">
                    {L(
                      "Set starting balance, target equity, daily % and timeline.",
                      "Define balance inicial, equity objetivo, % diario y horizonte."
                    )}
                  </p>
                </div>
                <div className="bg-slate-900/95 border border-slate-700 rounded-xl p-2">
                  <p className="text-[8px] font-semibold text-slate-200">
                    {L("2 · Execute", "2 · Ejecuta")}
                  </p>
                  <p className="text-slate-300">
                    {L(
                      "Trade inside your rules with goal & max-loss alerts.",
                      "Opera dentro de tus reglas con alertas de meta y pérdida máxima."
                    )}
                  </p>
                </div>
                <div className="bg-slate-900/95 border border-sky-500/40 rounded-xl p-2">
                  <p className="text-[8px] font-semibold text-sky-300">
                    {L("3 · Record", "3 · Registra")}
                  </p>
                  <p className="text-slate-300">
                    {L(
                      "Journal every session, let AI measure progress & patterns.",
                      "Registra cada sesión y deja que la IA mida progreso y patrones."
                    )}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[8px] text-slate-400 max-w-[70%]">
                  {L(
                    "Build your full plan in minutes and let the platform keep you accountable every single day.",
                    "Construye tu plan completo en minutos y deja que la plataforma te haga rendir cuentas cada día."
                  )}
                </p>
                <Link
                  href="/signup"
                  className="px-3 py-1.5 rounded-xl bg-emerald-400 text-slate-950 text-[8px] font-semibold hover:bg-emerald-300"
                >
                  {L("Start planning", "Empezar a planificar")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ask Anything button */}
      <FloatingAskButton />
    </main>
  );
}
