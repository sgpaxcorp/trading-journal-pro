"use client";

import Link from "next/link";

export default function PricingPage() {
  const year = new Date().getFullYear();

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-50 overflow-hidden flex flex-col">
      {/* BACKGROUND: degradado marketeable */}
      <div className="fixed inset-0 -z-10">
        {/* base */}
        <div className="absolute inset-0 bg-slate-950" />
        {/* gradiente principal */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#22c55e30_0,transparent_55%),radial-gradient(circle_at_bottom,#0f172a_0,#020817_70%)]" />
        {/* halo lateral para efecto “hero” */}
        <div className="absolute -right-32 top-10 w-72 h-72 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute -left-24 bottom-10 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl" />
        {/* rejilla muy sutil */}
        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(to_right,#38bdf855_1px,transparent_1px),linear-gradient(to_bottom,#38bdf833_1px,transparent_1px)] bg-size-[80px_80px]" />
      </div>

      {/* CONTENIDO */}
      <div className="relative z-10 px-6 md:px-12 pt-10 pb-8 flex-1 flex flex-col items-center">
        {/* Header */}
        <header className="w-full max-w-5xl flex items-center justify-between mb-10">
          <div>
            <p className="text-emerald-400 text-[10px] uppercase tracking-[0.2em]">
              Choose your edge
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold">
              Pricing for serious &amp; funded traders
            </h1>
            <p className="text-[11px] md:text-xs text-slate-300 mt-1">
              Clear, simple plans designed to keep you disciplined, consistent,
              and ready for prop firms & challenges.
            </p>
          </div>
          <Link
            href="/"
            className="text-[10px] md:text-xs text-slate-400 hover:text-emerald-400"
          >
            ← Back to home
          </Link>
        </header>

        {/* Copy persuasiva corta */}
        <div className="w-full max-w-5xl mb-6 text-[10px] md:text-xs text-slate-400">
          No contracts. No hidden fees. Just a trading journal built to protect
          your psychology, enforce your rules, and show real progress.
        </div>

        {/* PLANES CENTRADOS */}
        <section className="w-full flex flex-col items-center">
          <div className="w-full max-w-5xl flex flex-col md:flex-row items-stretch justify-center gap-6">
            {/* STANDARD */}
            <div className="flex-1 max-w-sm mx-auto bg-slate-950/96 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-xl backdrop-blur-sm">
              <h2 className="text-sm font-semibold text-slate-50 mb-1">
                Standard
              </h2>
              <p className="text-emerald-400 text-3xl font-semibold leading-none">
                $19.99
                <span className="text-[9px] text-slate-400 font-normal">
                  {" "}
                  / month
                </span>
              </p>
              <p className="text-[10px] text-slate-300 mt-2">
                Ideal para traders activos que quieren estructura, metas claras
                y control emocional sin complicarse.
              </p>
              <div className="mt-3 h-px bg-slate-800" />
              <ul className="mt-3 space-y-1.5 text-[16px] text-slate-200">
                <li>✓ One (1) Account</li>
                <li>✓ Multi-asset journal (stocks, futures, forex, crypto)</li>
                <li>✓ Organize Notebook for Pre-Market Prep and Journal</li>
                <li>✓ P&amp;L calendar (green gains, blue losses)</li>
                <li>✓ Customize your Trading Plan</li>
                <li>✓ Daily Goals, Weekly Goals, Monthly Goals</li>
                <li>✓ Track your goals and Account Balance</li>
                <li>✓ Set Alarms: daily goal &amp; max loss</li>
                <li>✓ AI Performance Summary Daily, Weekly and Monthly </li>
                <li>✓ Basic Analytics - Win Rate Ratio</li>
                <li>✓ 1GB Data Storage</li>
              </ul>
              <button className="mt-5 w-full py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition">
                Start Standard
              </button>
              
              {/* NUEVO BOTÓN */}
              <Link
                href="/plans-comparison"
                className="mt-3 w-full text-center py-2 rounded-xl border border-emerald-400/50 text-emerald-300 text-xs font-semibold hover:bg-emerald-400/10 transition"
              >
                See more →
              </Link>

              <p className="mt-2 text-[9px] text-slate-500">
                Perfecto para cuentas personales y primeras evaluaciones.
              </p>
            </div>

            {/* PROFESSIONAL (destacado) */}
            <div className="flex-1 max-w-sm mx-auto relative">
              {/* borde glow */}
              <div className="absolute -inset-0.5 rounded-3xl bg-linear-to-br from-emerald-400/40 via-sky-400/25 to-transparent opacity-80 blur-xl" />
              <div className="relative bg-slate-950/98 border border-emerald-500/60 rounded-2xl p-5 flex flex-col shadow-[0_15px_60px_rgba(15,23,42,0.9)] backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-emerald-400">
                    Professional
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300 text-[8px] border border-emerald-500/40">
                    Most popular
                  </span>
                </div>
                <p className="text-emerald-400 text-3xl font-semibold leading-none">
                  $49.99
                  <span className="text-[9px] text-slate-400 font-normal">
                    {" "}
                    / month
                  </span>
                </p>
                <p className="text-[10px] text-slate-300 mt-2">
                  Para full-time y traders fondeados que necesitan data profunda,
                  alarmas avanzadas y reportes listos para prop firms.
                </p>
                <div className="mt-3 h-px bg-slate-800" />
                <ul className="mt-3 space-y-1.5 text-[16px] text-slate-200">
                  <li>✓ Five (5) Account</li>
                  <li>✓ All Standard</li>
                  <li>✓ Advance Analytics Report</li>
                  <li>✓ Alarmas personalizadas (drawdown, revenge, horario)</li>
                  <li>✓ Customize Coaching Plan</li>
                  <li>✓ Track your Trading Business Expenses</li>
                </ul>
                <button className="mt-5 w-full py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition">
                  Start Professional
                </button>

                {/* NUEVO BOTÓN */}
                <Link
                  href="/plans-comparison"
                  className="mt-3 w-full text-center py-2 rounded-xl border border-emerald-400/50 text-emerald-300 text-xs font-semibold hover:bg-emerald-400/10 transition"
                >
                  See more →
                </Link>

                <p className="mt-2 text-[9px] text-emerald-300">
                  Si tratas el trading como un negocio, este es tu plan.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

     
    </main>
  );
}
