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

export default function Home() {
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
            Features
          </Link>
          <Link href="/pricing" className="hover:text-emerald-400">
            Pricing
          </Link>
          <Link href="/resources" className="hover:text-emerald-400">
            About Us
          </Link>
          <Link href="/growthaccountsimulator" className="hover:text-emerald-400">
            Growth Account Simulator
          </Link>
          <Link
            href="/signin"
            className="px-3 py-1.5 rounded-full border border-slate-600 hover:border-emerald-400 transition"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="px-3 py-1.5 rounded-full bg-emerald-400 text-slate-950 font-semibold hover:bg-emerald-300 transition"
          >
            Begin Now
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="px-6 md:px-12 pt-10 pb-16 flex flex-col lg:flex-row items-center gap-10">
        {/* Left: Text */}
        <div className="w-full lg:w-1/2 space-y-6">
          <p className="text-emerald-400 text-xs uppercase tracking-[0.2em]">
            Next-level trading journal
          </p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-semibold leading-tight">
            Track your performance without
            <span className="text-emerald-400"> destroying your psychology</span>.
          </h1>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed">
            Trading Journal Pro centralizes your trades, goals, rules and mindset.
            Set a growth plan, log every trade, see P&amp;L without aggressive red,
            and let AI highlight your best habits and biggest leaks.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/signup"
              className="px-5 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-sm md:text-base font-semibold hover:bg-emerald-300 transition"
            >
              Create My Journal
            </Link>
            <Link
              href="/pricing"
              className="px-5 py-2.5 rounded-xl border border-slate-600 text-slate-200 text-sm md:text-base hover:border-emerald-400 transition"
            >
              View pricing & plans
            </Link>
          </div>
          <p className="text-[10px] text-slate-500 pt-1">
            No spreadsheets. No shaming. Just structure, risk rules and clear feedback
            to stop overtrading.
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
                    Dashboard
                  </span>
                  <span>All accounts</span>
                </div>
                <span className="text-slate-500">Goal mode · AI coach</span>
              </div>

              {/* Metrics row */}
              <div className="grid grid-cols-3 gap-2 text-[9px]">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2">
                  <p className="text-slate-500">Equity</p>
                  <p className="text-[13px] font-semibold text-emerald-400">
                    $12,940
                  </p>
                  <p className="text-[8px] text-emerald-300">+4.7% this month</p>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2">
                  <p className="text-slate-500">Win rate</p>
                  <p className="text-[13px] font-semibold text-slate-50">61%</p>
                  <p className="text-[8px] text-slate-500">Last 50 trades</p>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-2">
                  <p className="text-slate-500">Max loss rule</p>
                  <p className="text-[13px] font-semibold text-sky-400">On</p>
                  <p className="text-[8px] text-slate-500">Protected</p>
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
                    Above goal
                  </span>
                </div>
              </div>

              {/* AI coach */}
              <div className="px-2 py-1.5 rounded-xl bg-slate-900/95 border border-slate-800 text-[8px] text-slate-300">
                <span className="text-emerald-300 font-semibold">
                  AI Coach:
                </span>{" "}
                You&apos;re ahead of plan. Best performance in structured morning
                sessions. Avoid emotional late-day trades.
              </div>
            </div>

            {/* Calendar card */}
            <div className="absolute -bottom-4 right-1 w-52 sm:w-60 bg-slate-950/98 rounded-2xl border border-slate-800 shadow-2xl p-3 text-[8px]">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-400">Monthly P&amp;L</span>
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
                Green days push you toward your target. Blue days stay controlled
                under your max loss.
              </p>
            </div>

            {/* Journal note card */}
            <div className="absolute -bottom-10 left-0 w-40 sm:w-44 bg-slate-950/98 rounded-2xl border border-slate-800 shadow-2xl p-3 text-[8px]">
              <p className="text-[8px] text-slate-400 mb-1">
                Journal entry preview
              </p>
              <p className="text-[8px] text-slate-200">
                Reason: VWAP bounce · Risk 0.5R
              </p>
              <p className="text-[8px] text-slate-200">
                Emotion: felt confident ✅
              </p>
              <p className="text-[7px] text-emerald-300 mt-1">
                AI: repeat this setup, avoid revenge trades.
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
              All starts with planning
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold">
              Design your money growth plan before you click buy or sell.
            </h2>
            <p className="text-sm md:text-base text-slate-300 leading-relaxed">
              Here you have the capability to create your{" "}
              <span className="text-emerald-400 font-semibold">
                money growth plan
              </span>
              , define a clear{" "}
              <span className="text-emerald-400 font-semibold">
                monetary goal
              </span>{" "}
              and build a{" "}
              <span className="text-emerald-400 font-semibold">
                trading action plan
              </span>{" "}
              that guides you through planning, executing, and recording results —
              like a real trading business.
            </p>
            <div className="flex flex-wrap gap-2 text-[10px]">
              <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-emerald-400/40 text-emerald-300">
                Plan: balance, risk, target
              </span>
              <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-slate-700 text-slate-300">
                Execute: follow rules & alerts
              </span>
              <span className="px-3 py-1.5 rounded-full bg-slate-900/90 border border-sky-500/40 text-sky-300">
                Record: AI-grade journal &amp; P&amp;L
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Turn your plan into a visual roadmap: see if today&apos;s trades move you
              closer or further from your goal in seconds.
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
                    Growth plan snapshot
                  </p>
                  <p className="text-sm font-semibold text-slate-50">
                    From plan to tracked execution
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] text-slate-500">Target equity</p>
                  <p className="text-[13px] font-semibold text-emerald-400">
                    $25,000
                  </p>
                  <p className="text-[8px] text-emerald-300">
                    +8% avg monthly goal
                  </p>
                </div>
              </div>

              <div className="mt-1 bg-slate-900/90 rounded-2xl border border-slate-800 px-3 py-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[8px] text-slate-400">
                    Projected vs actual growth
                  </span>
                  <span className="text-[8px] text-emerald-300">
                    On track ✅
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
                    Month 1
                  </span>
                  <span className="absolute right-0 bottom-0 text-[7px] text-emerald-300">
                    Month 10
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-[8px] mt-1">
                <div className="bg-slate-900/95 border border-emerald-400/40 rounded-xl p-2">
                  <p className="text-[8px] font-semibold text-emerald-300">
                    1 · Plan
                  </p>
                  <p className="text-slate-300">
                    Set starting balance, target equity, daily % and timeline.
                  </p>
                </div>
                <div className="bg-slate-900/95 border border-slate-700 rounded-xl p-2">
                  <p className="text-[8px] font-semibold text-slate-200">
                    2 · Execute
                  </p>
                  <p className="text-slate-300">
                    Trade inside your rules with goal & max-loss alerts.
                  </p>
                </div>
                <div className="bg-slate-900/95 border border-sky-500/40 rounded-xl p-2">
                  <p className="text-[8px] font-semibold text-sky-300">
                    3 · Record
                  </p>
                  <p className="text-slate-300">
                    Journal every session, let AI measure progress & patterns.
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[8px] text-slate-400 max-w-[70%]">
                  Build your full plan in minutes and let the platform keep you
                  accountable every single day.
                </p>
                <Link
                  href="/signup"
                  className="px-3 py-1.5 rounded-xl bg-emerald-400 text-slate-950 text-[8px] font-semibold hover:bg-emerald-300"
                >
                  Start planning
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What is a trading journal */}
      <section className="px-6 md:px-12 pb-10 space-y-6">
        <h2 className="text-xl md:text-2xl font-semibold">
          What is a trading journal and why this one is different?
        </h2>
        <div className="grid gap-5 md:grid-cols-3 text-sm text-slate-300">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h3 className="font-semibold text-slate-50 text-sm">
              More than a spreadsheet
            </h3>
            <p>
              A trading journal is a structured record of your trades, plans, and
              decisions. We turn it into a guided workflow so you don&apos;t drown in
              random Excel files or screenshots.
            </p>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h3 className="font-semibold text-slate-50 text-sm">
              Psychology-safe P&amp;L visualization
            </h3>
            <p>
              Losses are shown in calming blue instead of aggressive red. Combined with
              rule-based alerts, the goal is to reduce tilt, revenge trading, and
              emotional spirals.
            </p>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-2">
            <h3 className="font-semibold text-slate-50 text-sm">
              AI-powered performance coach
            </h3>
            <p>
              Daily, weekly and monthly summaries analyze your data: best setups,
              dangerous times, broken rules and simple steps to become consistently
              disciplined.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-12 pb-10">
        <h2 className="text-xl md:text-2xl font-semibold mb-4">
          How it works
        </h2>
        <ol className="grid md:grid-cols-4 gap-4 text-sm text-slate-300">
          <li className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <p className="font-semibold mb-1">1. Create your plan</p>
            <p>
              Choose starting balance, growth target, and timeframe. We generate
              clear daily and weekly objectives.
            </p>
          </li>
          <li className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <p className="font-semibold mb-1">2. Log every trade</p>
            <p>
              Multi-asset support: options, futures, stocks, forex, crypto. Tag
              setups, emotions, and rule compliance.
            </p>
          </li>
          <li className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <p className="font-semibold mb-1">3. Follow your rules</p>
            <p>
              Pop-up alerts when you hit your goal or max loss so you stop trading
              before emotions take over.
            </p>
          </li>
          <li className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <p className="font-semibold mb-1">4. Let AI review your week</p>
            <p>
              Automated summaries highlight patterns and give concrete, non-fluffy
              suggestions to improve.
            </p>
          </li>
        </ol>
      </section>

     
      {/* Ask Anything button */}
      <FloatingAskButton />
    </main>
  );
}
