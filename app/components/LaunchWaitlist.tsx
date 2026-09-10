"use client";

import { type CSSProperties, type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock3,
  ShieldCheck,
  Sparkles,
  TicketPercent,
} from "lucide-react";

import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  WAITLIST_CAMPAIGN,
  waitlistProgressPercent,
  waitlistSpotsRemaining,
} from "@/lib/waitlistCampaign";

type CountdownState = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

type WaitlistCampaignPayload = {
  launchDateIso: string;
  launchDateLabel: {
    en: string;
    es: string;
  };
  discountLimit: number;
  discountPercent: number;
  discountPlan: "annual";
  reservedCount: number;
  totalCount: number;
  spotsRemaining: number;
  progressPercent: number;
};

type WaitlistResponse = {
  ok?: boolean;
  storageReady?: boolean;
  previewMode?: boolean;
  existing?: boolean;
  position?: number | null;
  discountReserved?: boolean;
  campaign?: WaitlistCampaignPayload;
  error?: string;
};

type JoinResult = {
  existing: boolean;
  position: number | null;
  discountReserved: boolean;
};

function computeCountdown(): CountdownState {
  const target = new Date(WAITLIST_CAMPAIGN.launchDateIso).getTime();
  const diff = Math.max(0, target - Date.now());
  const secondsTotal = Math.floor(diff / 1000);

  return {
    days: Math.floor(secondsTotal / 86_400),
    hours: Math.floor((secondsTotal % 86_400) / 3_600),
    minutes: Math.floor((secondsTotal % 3_600) / 60),
    seconds: secondsTotal % 60,
  };
}

function CountdownBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-[#071320] px-3 py-3 text-center">
      <p className="font-mono text-2xl font-semibold tabular-nums text-white md:text-3xl">
        {String(value).padStart(2, "0")}
      </p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
    </div>
  );
}

function Celebration({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="nt-waitlist-confetti pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: 28 }).map((_, index) => (
        <span
          key={index}
          style={
            {
              "--nt-confetti-left": `${8 + ((index * 11) % 84)}%`,
              "--nt-confetti-delay": `${(index % 8) * 70}ms`,
              "--nt-confetti-rotate": `${(index % 5) * 24 - 48}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export default function LaunchWaitlist({ source = "homepage" }: { source?: string }) {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [countdown, setCountdown] = useState<CountdownState>({
    days: 60,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [campaign, setCampaign] = useState<WaitlistCampaignPayload>({
    launchDateIso: WAITLIST_CAMPAIGN.launchDateIso,
    launchDateLabel: WAITLIST_CAMPAIGN.launchDateLabel,
    discountLimit: WAITLIST_CAMPAIGN.discountLimit,
    discountPercent: WAITLIST_CAMPAIGN.discountPercent,
    discountPlan: WAITLIST_CAMPAIGN.discountPlan,
    reservedCount: 0,
    totalCount: 0,
    spotsRemaining: WAITLIST_CAMPAIGN.discountLimit,
    progressPercent: 0,
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    setCountdown(computeCountdown());
    const timer = window.setInterval(() => setCountdown(computeCountdown()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const res = await fetch("/api/waitlist", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as WaitlistResponse;
        if (!cancelled && data.campaign) setCampaign(data.campaign);
      } catch {
        if (!cancelled) {
          setCampaign((current) => ({
            ...current,
            spotsRemaining: waitlistSpotsRemaining(current.reservedCount),
            progressPercent: waitlistProgressPercent(current.reservedCount),
          }));
        }
      }
    }

    void loadStats();

    return () => {
      cancelled = true;
    };
  }, []);

  const countdownUnits = [
    { value: countdown.days, label: L("Days", "Días") },
    { value: countdown.hours, label: L("Hours", "Horas") },
    { value: countdown.minutes, label: L("Minutes", "Minutos") },
    { value: countdown.seconds, label: L("Seconds", "Segundos") },
  ];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setJoinResult(null);

    if (!email.trim()) {
      setError(L("Enter your email to join the launch waitlist.", "Entra tu email para unirte a la lista de espera."));
      return;
    }

    if (!accepted) {
      setError(
        L(
          "Confirm the waitlist terms before joining.",
          "Confirma los términos de la lista de espera antes de unirte."
        )
      );
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          company,
          source,
          acceptedWaitlistTerms: accepted,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as WaitlistResponse;

      if (!res.ok || !data.ok) {
        throw new Error(data.error || L("Could not join the waitlist right now.", "No pudimos unirte a la lista ahora mismo."));
      }

      if (data.campaign) setCampaign(data.campaign);
      setJoinResult({
        existing: Boolean(data.existing),
        position: typeof data.position === "number" ? data.position : null,
        discountReserved: Boolean(data.discountReserved),
      });
      setCelebrating(true);
      window.setTimeout(() => setCelebrating(false), 2200);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : L("Could not join the waitlist right now.", "No pudimos unirte a la lista ahora mismo.")
      );
    } finally {
      setSubmitting(false);
    }
  }

  const launchDate = isEs ? campaign.launchDateLabel.es : campaign.launchDateLabel.en;

  return (
    <section id="launch-waitlist" className="relative overflow-hidden bg-[#07111d] px-4 py-16 md:px-8">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
        <div className="relative overflow-hidden rounded-lg border border-emerald-300/20 bg-[#081524] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:p-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-300 via-sky-300 to-amber-300 nt-waitlist-sweep" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
              <Clock3 className="h-3.5 w-3.5" />
              {L("60-day launch campaign", "Campaña de lanzamiento 60 días")}
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100">
              <TicketPercent className="h-3.5 w-3.5" />
              {L("30% off annual", "30% del anual")}
            </span>
          </div>

          <h2 className="mt-5 text-4xl font-semibold leading-tight text-white md:text-5xl">
            {L(
              "The NeuroTrader 60-day launch waitlist is open.",
              "La lista de lanzamiento de 60 días de NeuroTrader está abierta."
            )}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
            {L(
              "Join the launch waitlist. The first 500 Trader Entrepreneurs receive 30% off the annual plan when the platform goes live.",
              "Únete a la lista de espera. Los primeros 500 Trader Entrepreneurs reciben 30% de descuento en el plan anual cuando la plataforma esté live."
            )}
          </p>

          <div className="mt-6 grid grid-cols-4 gap-2 md:gap-3">
            {countdownUnits.map((unit) => (
              <CountdownBox key={unit.label} value={unit.value} label={unit.label} />
            ))}
          </div>

        </div>

        <form
          onSubmit={handleSubmit}
          className="relative overflow-hidden rounded-lg border border-white/10 bg-[#0a1220] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)] md:p-8"
        >
          <Celebration active={celebrating} />
          <div className="relative z-10">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200">
              <Sparkles className="h-4 w-4 text-sky-300" />
              {L("Waitlist registration", "Registro de lista de espera")}
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-white">
              {L("Reserve your annual launch discount.", "Reserva tu descuento anual de lanzamiento.")}
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              {L(
                "Enter your email and we will send a confirmation now. On launch day, eligible waitlist members receive annual discount access by email.",
                "Entra tu email y enviaremos una confirmación ahora. El día del lanzamiento, los miembros elegibles recibirán el acceso al descuento anual por email."
              )}
            </p>

            <div className="mt-5 grid gap-3">
              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                {L("Name", "Nombre")}
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder={L("Optional", "Opcional")}
                  className="rounded-lg border border-white/12 bg-[#060c16] px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300"
                />
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-200">
                {L("Email", "Email")}
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="you@example.com"
                  className="rounded-lg border border-white/12 bg-[#060c16] px-4 py-3 text-sm font-medium text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300"
                />
              </label>

              <label className="hidden">
                {L("Company", "Empresa")}
                <input
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-slate-300">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-600 bg-[#050814] accent-emerald-400"
                />
                <span>
                  {L(
                    "Send me the waitlist confirmation, launch updates, and annual discount access if I qualify. I understand NeuroTrader is educational software and does not provide financial advice or guarantee trading results.",
                    "Envíenme la confirmación de waitlist, updates de lanzamiento y acceso al descuento anual si cualifico. Entiendo que NeuroTrader es software educativo y no provee asesoría financiera ni garantiza resultados de trading."
                  )}{" "}
                  <Link href="/terms" className="font-semibold text-emerald-300 hover:text-emerald-200">
                    {L("Terms", "Términos")}
                  </Link>{" "}
                  ·{" "}
                  <Link href="/privacy" className="font-semibold text-emerald-300 hover:text-emerald-200">
                    {L("Privacy", "Privacidad")}
                  </Link>
                </span>
              </label>
            </div>

            {error ? (
              <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            ) : null}

            {joinResult ? (
              <div className="mt-4 rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-sm leading-6 text-emerald-50">
                <p className="font-semibold">
                  {joinResult.existing
                    ? L("You are already on the launch waitlist.", "Ya estás en la lista de espera.")
                    : L("You are on the launch waitlist.", "Estás en la lista de espera.")}
                </p>
                <p className="mt-1">
                  {joinResult.discountReserved
                    ? L(
                        `Annual discount reserved. Spot ${joinResult.position ? `#${joinResult.position}` : "confirmed"}. Check your inbox for the confirmation email.`,
                        `Descuento anual reservado. Puesto ${joinResult.position ? `#${joinResult.position}` : "confirmado"}. Revisa tu inbox para el email de confirmación.`
                      )
                    : L(
                        "Waitlist confirmed. Check your inbox for the confirmation email. The 30% annual discount is limited to the first 500 registrations.",
                        "Lista confirmada. Revisa tu inbox para el email de confirmación. El 30% de descuento anual está limitado a los primeros 500 registros."
                      )}
                </p>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting || !accepted}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            >
              <TicketPercent className="h-4 w-4" />
              {submitting
                ? L("Joining waitlist...", "Uniendo a la lista...")
                : L("Join annual discount waitlist", "Unirme al descuento anual")}
            </button>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs leading-5 text-slate-500">
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                {L("Launch date", "Fecha de lanzamiento")}: {launchDate}
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-400" />
                {L("One discount per email", "Un descuento por email")}
              </span>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
