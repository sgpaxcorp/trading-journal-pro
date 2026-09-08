"use client";

import Link from "next/link";
import {
  ArrowDown,
  CalendarDays,
  CheckCircle2,
  MailCheck,
  ShieldCheck,
  Sparkles,
  TicketPercent,
} from "lucide-react";

import LaunchWaitlist from "@/app/components/LaunchWaitlist";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { WAITLIST_CAMPAIGN } from "@/lib/waitlistCampaign";

function ProductScene({ L }: { L: (en: string, es: string) => string }) {
  return (
    <div className="relative min-h-[340px] overflow-hidden rounded-lg border border-white/10 bg-[#07101d] p-4 shadow-[0_26px_90px_rgba(0,0,0,0.38)]">
      <div className="absolute left-6 top-6 w-[74%] rounded-lg border border-emerald-300/20 bg-[#091827]/95 p-4">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{L("Trading Business Plan", "Plan de Empresa de Trading")}</span>
          <span className="text-emerald-300">{L("Launch ready", "Listo para lanzar")}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["$50k", L("Target", "Meta")],
            ["0.5R", L("Risk unit", "Unidad de riesgo")],
            ["92%", L("Rules tracked", "Reglas medidas")],
          ].map(([value, label]) => (
            <div key={label} className="rounded-md border border-white/10 bg-[#06111f] p-3">
              <p className="text-lg font-semibold text-white">{value}</p>
              <p className="text-[10px] text-slate-500">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 flex h-20 items-end gap-2 rounded-md border border-white/10 bg-[#06111f] px-3 pb-3">
          {[34, 42, 39, 48, 57, 54, 65, 72, 68, 79].map((height, index) => (
            <div
              key={index}
              className="w-full rounded-sm bg-emerald-400/80"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-7 right-5 w-[66%] rounded-lg border border-sky-300/20 bg-[#0a1220]/95 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200">
          {L("Operating loop", "Loop operativo")}
        </div>
        <div className="mt-4 space-y-2">
          {[
            L("Capture execution", "Captura ejecución"),
            L("Review behavior", "Revisa conducta"),
            L("Protect the plan", "Protege el plan"),
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-200">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WaitlistPage() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const launchDate = isEs
    ? WAITLIST_CAMPAIGN.launchDateLabel.es
    : WAITLIST_CAMPAIGN.launchDateLabel.en;

  const nextSteps = [
    {
      icon: MailCheck,
      title: L("Confirmation email", "Email de confirmación"),
      body: L(
        "After you join, NeuroTrader sends a thank-you email confirming your waitlist spot.",
        "Después de apuntarte, NeuroTrader envía un email de agradecimiento confirmando tu lugar en la lista."
      ),
    },
    {
      icon: TicketPercent,
      title: L("Annual discount access", "Acceso al descuento anual"),
      body: L(
        "On launch day, eligible first-500 waitlist members receive the annual discount access by email.",
        "El día del lanzamiento, los miembros elegibles dentro de los primeros 500 reciben por email el acceso al descuento anual."
      ),
    },
    {
      icon: ShieldCheck,
      title: L("Start with structure", "Empieza con estructura"),
      body: L(
        "You open the platform with business planning, execution records, risk controls, analytics, and accountability in one workspace.",
        "Abres la plataforma con planificación empresarial, registros de ejecución, controles de riesgo, analítica y accountability en un solo workspace."
      ),
    },
  ];

  return (
    <main className="min-h-screen bg-[#050814] text-slate-50 overflow-x-hidden">
      <header className="relative z-20 px-4 pt-4 md:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 rounded-lg border border-white/10 bg-[#050814]/88 px-4 py-3 shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl md:flex-row md:items-center md:justify-between md:px-5">
          <Link href="/" className="flex items-center gap-3" aria-label="NeuroTrader home">
            <img
              src="/neurotrader-logo-web.png"
              alt="NeuroTrader"
              className="h-9 w-auto object-contain md:h-10"
              draggable={false}
            />
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-300 md:justify-end">
            <Link href="/" className="rounded-md px-3 py-2 text-white/82 hover:bg-white/10 hover:text-white">
              {L("Home", "Inicio")}
            </Link>
            <Link href="/pricing" className="rounded-md border border-white/18 px-3 py-2 font-semibold text-white hover:border-emerald-300 hover:text-emerald-100">
              {L("Plans", "Planes")}
            </Link>
            <Link href="/signin" className="rounded-md bg-emerald-400 px-4 py-2 font-semibold text-slate-950 hover:bg-emerald-300">
              {L("Sign in", "Ingresar")}
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative px-4 py-14 md:px-8 md:py-20">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/45 to-transparent" />
        <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-amber-300/35 bg-amber-300/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
              <Sparkles className="h-3.5 w-3.5" />
              {L("60-day launch waitlist", "Lista de lanzamiento 60 días")}
            </div>
            <h1 className="mt-6 text-5xl font-semibold leading-none text-white md:text-7xl">
              {L("Get early access to the trading business operating system.", "Obtén acceso temprano al sistema operativo de empresa de trading.")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
              {L(
                "NeuroTrader launches soon for Trader Entrepreneurs who want structure, execution records, risk governance, analytics, and AI-guided accountability in one platform.",
                "NeuroTrader lanza pronto para Trader Entrepreneurs que quieren estructura, registros de ejecución, gobernanza de riesgo, analítica y accountability guiado por IA en una sola plataforma."
              )}
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#launch-waitlist" className="inline-flex items-center gap-2 rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
                <TicketPercent className="h-4 w-4" />
                {L("Join the annual discount waitlist", "Unirme al descuento anual")}
              </a>
              <span className="inline-flex items-center gap-2 rounded-md border border-white/18 px-4 py-3 text-sm font-semibold text-slate-200">
                <CalendarDays className="h-4 w-4 text-emerald-300" />
                {launchDate}
              </span>
            </div>

            <p className="mt-5 max-w-2xl text-xs leading-5 text-slate-500">
              {L(
                `The first ${WAITLIST_CAMPAIGN.discountLimit} eligible waitlist members receive ${WAITLIST_CAMPAIGN.discountPercent}% off the annual plan. No payment is required to join the waitlist.`,
                `Los primeros ${WAITLIST_CAMPAIGN.discountLimit} miembros elegibles reciben ${WAITLIST_CAMPAIGN.discountPercent}% de descuento en el plan anual. No se requiere pago para unirse a la lista.`
              )}
            </p>
          </div>

          <ProductScene L={L} />
        </div>
      </section>

      <section className="bg-[#07100f] px-4 py-14 md:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-emerald-300">
              {L("What happens after you join", "Qué pasa después de apuntarte")}
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              {L("You join once. The launch flow does the rest.", "Te apuntas una vez. El flujo de lanzamiento hace el resto.")}
            </h2>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {nextSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <article key={step.title} className="rounded-lg border border-white/10 bg-[#081524] p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-emerald-300/25 bg-emerald-300/10 text-emerald-100">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{step.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <LaunchWaitlist source="waitlist-page" />

      <section className="bg-[#050814] px-4 py-12 md:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 rounded-lg border border-white/10 bg-[#08111f] p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">
              {L("Launch day discount delivery", "Entrega del descuento el día de lanzamiento")}
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              {L(
                "The discount email will be sent through NeuroTrader's email system on launch day to eligible first-500 waitlist members.",
                "El email del descuento se enviará por el sistema de email de NeuroTrader el día del lanzamiento a los miembros elegibles dentro de los primeros 500."
              )}
            </p>
          </div>
          <a href="#launch-waitlist" className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-300">
            <ArrowDown className="h-4 w-4" />
            {L("Join now", "Unirme ahora")}
          </a>
        </div>
      </section>
    </main>
  );
}
