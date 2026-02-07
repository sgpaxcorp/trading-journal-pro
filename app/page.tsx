"use client";

import Link from "next/link";
import FloatingAskButton from "./components/FloatingAskButton";
import {
  FaTwitter,
  FaInstagram,
  FaLinkedinIn,
  FaDiscord,
  FaFacebookF,
} from "react-icons/fa";
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
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-emerald-400/90 flex items-center justify-center text-slate-950 text-xs font-black">
            TJ
          </div>
          <span className="font-semibold text-sm md:text-base tracking-tight">
            Trading Journal Pro
          </span>
        </div>
        <nav className="flex items-center gap-4 text-xs md:text-sm text-slate-400">
          <Link href="/features" className="hover:text-emerald-400">
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
            {L("Next-level trading journal", "Journal de trading nivel pro")}
          </p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight">
            {L("Track your performance without", "Mide tu performance sin")}
            <span className="text-emerald-400">
              {L(" destroying your psychology", " destruir tu psicología")}
            </span>
            .
          </h1>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed">
            {L(
              "Trading Journal Pro centralizes your trades, goals, rules and mindset. Set a growth plan, log every trade, see P&L without aggressive red, and let AI highlight your best habits and biggest leaks.",
              "Trading Journal Pro centraliza tus trades, metas, reglas y mindset. Crea un growth plan, registra cada trade, ve tu P&L sin rojo agresivo y deja que la IA resalte tus mejores hábitos y mayores fugas."
            )}
          </p>
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

        {/* Right: Stacked dashboard preview (portfolio + calendar + journal) */}
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

      {/* What is a trading journal */}
      <section className="px-6 md:px-12 pb-10 space-y-6">
        <h2 className="text-xl md:text-2xl font-semibold">
          {L(
            "What is a trading journal and why this one is different?",
            "¿Qué es un journal de trading y por qué este es diferente?"
          )}
        </h2>
        <div className="grid gap-5 md:grid-cols-3 text-sm text-slate-300">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h3 className="font-semibold text-slate-50 text-sm">
              {L("More than a spreadsheet", "Más que una hoja de cálculo")}
            </h3>
            <p>
              {L(
                "A trading journal is a structured record of your trades, plans, and decisions. We turn it into a guided workflow so you don’t drown in random Excel files or screenshots.",
                "Un journal de trading es un registro estructurado de tus trades, planes y decisiones. Lo convertimos en un flujo guiado para que no te ahogues en Exceles o capturas sueltas."
              )}
            </p>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h3 className="font-semibold text-slate-50 text-sm">
              {L("Psychology-safe P&L visualization", "Visualización de P&L amigable con la psicología")}
            </h3>
            <p>
              {L(
                "Losses are shown in calming blue instead of aggressive red. Combined with rule-based alerts, the goal is to reduce tilt, revenge trading, and emotional spirals.",
                "Las pérdidas se muestran en azul calmado en lugar de rojo agresivo. Con alertas por reglas, el objetivo es reducir tilt, revenge trading y espirales emocionales."
              )}
            </p>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h3 className="font-semibold text-slate-50 text-sm">
              {L("AI-powered performance coach", "Coach de rendimiento con IA")}
            </h3>
            <p>
              {L(
                "Daily, weekly and monthly summaries analyze your data: best setups, dangerous times, broken rules and simple steps to become consistently disciplined.",
                "Resúmenes diarios, semanales y mensuales analizan tus datos: mejores setups, horarios peligrosos, reglas rotas y pasos simples para ser consistentemente disciplinado."
              )}
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-12 pb-10">
        <h2 className="text-xl md:text-2xl font-semibold mb-4">
          {L("How it works", "Cómo funciona")}
        </h2>
        <ol className="grid md:grid-cols-4 gap-4 text-sm text-slate-300">
          <li className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <p className="font-semibold mb-1">{L("1. Create your plan", "1. Crea tu plan")}</p>
            <p>
              {L(
                "Choose starting balance, growth target, and timeframe. We generate clear daily and weekly objectives.",
                "Elige balance inicial, meta de crecimiento y horizonte. Generamos objetivos diarios y semanales claros."
              )}
            </p>
          </li>
          <li className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <p className="font-semibold mb-1">{L("2. Log every trade", "2. Registra cada trade")}</p>
            <p>
              {L(
                "Multi-asset support: options, futures, stocks, forex, crypto. Tag setups, emotions, and rule compliance.",
                "Soporte multi‑activo: opciones, futuros, acciones, forex y cripto. Etiqueta setups, emociones y cumplimiento de reglas."
              )}
            </p>
          </li>
          <li className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <p className="font-semibold mb-1">{L("3. Follow your rules", "3. Sigue tus reglas")}</p>
            <p>
              {L(
                "Pop-up alerts when you hit your goal or max loss so you stop trading before emotions take over.",
                "Alertas cuando alcanzas tu meta o pérdida máxima para que pares antes de que las emociones tomen control."
              )}
            </p>
          </li>
          <li className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <p className="font-semibold mb-1">{L("4. Let AI review your week", "4. Deja que la IA revise tu semana")}</p>
            <p>
              {L(
                "Automated summaries highlight patterns and give concrete, non-fluffy suggestions to improve.",
                "Resúmenes automatizados resaltan patrones y dan sugerencias concretas para mejorar."
              )}
            </p>
          </li>
        </ol>
      </section>

     
      {/* Ask Anything button */}
      <FloatingAskButton />
    </main>
  );
}
