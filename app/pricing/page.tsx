"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type PlanId = "core" | "advanced";

type SimpleUser = {
  id: string;
  email: string;
};

export default function PricingPage() {
  const router = useRouter();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [user, setUser] = useState<SimpleUser | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const PRICES = {
    core: { monthly: 14.99, annual: 149.99 },
    advanced: { monthly: 24.99, annual: 249.99 },
  } as const;

  const priceFor = (planId: PlanId) =>
    billingCycle === "monthly" ? PRICES[planId].monthly : PRICES[planId].annual / 12;

  // Load current user from Supabase on mount
  useEffect(() => {
    let isMounted = true;

    async function fetchUser() {
      const { data, error } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (error || !data.user) {
        setUser(null);
      } else {
        setUser({
          id: data.user.id,
          email: data.user.email ?? "",
        });
      }
    }

    fetchUser();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleStart(planId: PlanId) {
    setError(null);

    // If user is not logged1 in, send to signup and keep plan in query
    if (!user) {
      router.push(`/signup?plan=${planId}`);
      return;
    }

    try {
      setLoadingPlan(planId);

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          planId,
          billingCycle,
        }),
      });

      if (!res.ok) {
        let message = L("Unable to start checkout.", "No se pudo iniciar el checkout.");
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          // ignore parse error
        }
        throw new Error(message);
      }

      const data = await res.json();

      if (!data.url) {
        throw new Error(L("Missing checkout URL from Stripe.", "Falta la URL de checkout de Stripe."));
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err: any) {
      console.error("Error starting checkout:", err);
      setError(err?.message ?? L("Something went wrong starting checkout.", "Algo salió mal iniciando el checkout."));
      setLoadingPlan(null);
    }
  }

  return (
    <main className="relative min-h-screen bg-slate-950 text-slate-50 overflow-hidden flex flex-col">
      {/* BACKGROUND */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#22c55e30_0,transparent_55%),radial-gradient(circle_at_bottom,#0f172a_0,#020817_70%)]" />
        <div className="absolute -right-32 top-10 w-72 h-72 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute -left-24 bottom-10 w-64 h-64 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(to_right,#38bdf855_1px,transparent_1px),linear-gradient(to_bottom,#38bdf833_1px,transparent_1px)] bg-size-[80px_80px]" />
      </div>

      {/* CONTENT */}
      <div className="relative z-10 px-6 md:px-12 pt-10 pb-8 flex-1 flex flex-col items-center">
        {/* Header */}
        <header className="w-full max-w-5xl flex flex-col gap-6 md:flex-row md:items-end md:justify-between mb-10">
          <div>
            <p className="text-emerald-400 text-[10px] uppercase tracking-[0.2em]">
              {L("Choose your edge", "Elige tu ventaja")}
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold">
              {L("Pricing for serious & funded traders", "Precios para traders serios y fondeados")}
            </h1>
            <p className="text-[11px] md:text-xs text-slate-300 mt-1">
              {L(
                "Clear, simple plans designed to keep you disciplined, consistent, and ready for prop firms & challenges.",
                "Planes claros y simples diseñados para mantenerte disciplinado, consistente y listo para prop firms y challenges."
              )}
            </p>
          </div>
          <div className="flex items-center justify-between w-full md:w-auto gap-4">
            <div className="inline-flex rounded-full border border-slate-800 bg-slate-950/80 p-1 text-[10px] md:text-xs">
              <button
                type="button"
                onClick={() => setBillingCycle("monthly")}
                className={[
                  "px-4 py-1.5 rounded-full transition",
                  billingCycle === "monthly"
                    ? "bg-emerald-400 text-slate-950 font-semibold"
                    : "text-slate-300 hover:text-slate-50",
                ].join(" ")}
              >
                {L("Monthly", "Mensual")}
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle("annual")}
                className={[
                  "px-4 py-1.5 rounded-full transition",
                  billingCycle === "annual"
                    ? "bg-emerald-400 text-slate-950 font-semibold"
                    : "text-slate-300 hover:text-slate-50",
                ].join(" ")}
              >
                {L("Annual (save 2 months)", "Anual (ahorra 2 meses)")}
              </button>
            </div>
            <Link
              href="/"
              className="text-[10px] md:text-xs text-slate-400 hover:text-emerald-400"
            >
              ← {L("Back to home", "Volver al inicio")}
            </Link>
          </div>
        </header>

        {/* Copy */}
        <div className="w-full max-w-5xl mb-4 text-[10px] md:text-xs text-slate-400">
          {L(
            "No contracts. No hidden fees. Just a trading journal built to protect your psychology, enforce your rules, and show real progress.",
            "Sin contratos. Sin cargos ocultos. Un journal creado para proteger tu psicología, reforzar tus reglas y mostrar progreso real."
          )}
        </div>

        {/* Error message (if any) */}
        {error && (
          <div className="w-full max-w-5xl mb-4 text-[10px] md:text-xs text-red-400">
            {error}
          </div>
        )}

        {/* PLANS */}
        <section className="w-full flex flex-col items-center">
          <div className="w-full max-w-5xl flex flex-col md:flex-row items-stretch justify-center gap-6">
            {/* CORE (planId = "core") */}
            <div className="flex-1 max-w-sm mx-auto bg-slate-950/96 border border-slate-800 rounded-2xl p-5 flex flex-col shadow-xl backdrop-blur-sm">
              <h2 className="text-sm font-semibold text-slate-50 mb-1">
                {L("Core", "Core")}
              </h2>
              <div className="flex items-center gap-2">
                <p className="text-emerald-400 text-3xl font-semibold leading-none">
                  ${priceFor("core").toFixed(2)}
                  <span className="text-[9px] text-slate-400 font-normal">
                    {" "}
                    {billingCycle === "monthly"
                      ? L("/ month", "/ mes")
                      : L("/ month (billed yearly)", "/ mes (facturado anual)")}
                  </span>
                </p>
                {billingCycle === "annual" && (
                  <span className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-200">
                    {L("Save 2 months", "Ahorra 2 meses")}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-300 mt-2">
                {L(
                  "Ideal for active traders who want structure, clear goals and emotional control without overcomplicating things.",
                  "Ideal para traders activos que buscan estructura, metas claras y control emocional sin complicarse."
                )}
              </p>
              <div className="mt-3 h-px bg-slate-800" />
              <ul className="mt-3 space-y-1.5 text-[16px] text-slate-200">
                <li>✓ {L("Five (5) trading accounts", "Cinco (5) cuentas de trading")}</li>
                <li>✓ {L("Premarket plan + journal entries/exits", "Plan premarket + entradas/salidas")}</li>
                <li>✓ {L("Emotions, tags, and lessons learned", "Emociones, etiquetas y lecciones")}</li>
                <li>✓ {L("Calendar results", "Calendario de resultados")}</li>
                <li>✓ {L("Equity curve + balance chart", "Curva de equity + balance")}</li>
                <li>✓ {L("Cashflow tracking", "Seguimiento de cashflows")}</li>
                <li>✓ {L("Core KPIs", "KPIs clave")}</li>
                <li>✓ {L("Basic alerts & reminders", "Alertas y recordatorios básicos")}</li>
                <li>✓ {L("Automated journaling imports", "Importación automática de journaling")}</li>
                <li>✓ {L("Back-study module & challenges", "Módulo back-study y retos")}</li>
                <li>✓ {L("Global ranking (opt-in)", "Ranking global (opcional)")}</li>
                <li>✓ {L("1GB data storage", "1GB de almacenamiento")}</li>
              </ul>
              <button
                onClick={() => handleStart("core")}
                disabled={loadingPlan !== null}
                className="mt-5 w-full py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingPlan === "core" ? L("Redirecting...", "Redirigiendo...") : L("Start Core", "Empezar Core")}
              </button>

              <Link
                href="/plans-comparison"
                className="mt-3 w-full text-center py-2 rounded-xl border border-emerald-400/50 text-emerald-300 text-xs font-semibold hover:bg-emerald-400/10 transition"
              >
                {L("See more →", "Ver más →")}
              </Link>

              <p className="mt-2 text-[9px] text-slate-500">
                {L("Perfect for personal accounts and first evaluations.", "Perfecto para cuentas personales y primeras evaluaciones.")}
              </p>
            </div>

            {/* ADVANCED (planId = "advanced") */}
            <div className="flex-1 max-w-sm mx-auto relative">
              <div className="absolute -inset-0.5 rounded-3xl bg-linear-to-br from-emerald-400/40 via-sky-400/25 to-transparent opacity-80 blur-xl" />
              <div className="relative bg-slate-950/98 border border-emerald-500/60 rounded-2xl p-5 flex flex-col shadow-[0_15px_60px_rgba(15,23,42,0.9)] backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-emerald-400">
                    {L("Advanced", "Advanced")}
                  </h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-300 text-[8px] border border-emerald-500/40">
                    {L("Most popular", "Más popular")}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-emerald-400 text-3xl font-semibold leading-none">
                    ${priceFor("advanced").toFixed(2)}
                    <span className="text-[9px] text-slate-400 font-normal">
                      {" "}
                      {billingCycle === "monthly"
                        ? L("/ month", "/ mes")
                        : L("/ month (billed yearly)", "/ mes (facturado anual)")}
                    </span>
                  </p>
                  {billingCycle === "annual" && (
                    <span className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-200">
                      {L("Save 2 months", "Ahorra 2 meses")}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-300 mt-2">
                  {L(
                    "For full-time and funded traders who need deep analytics, advanced alerts and reports ready for prop firms.",
                    "Para traders full-time o fondeados que necesitan analítica profunda, alertas avanzadas y reportes listos para prop firms."
                  )}
                </p>
                <div className="mt-3 h-px bg-slate-800" />
                <ul className="mt-3 space-y-1.5 text-[16px] text-slate-200">
                  <li>✓ {L("Unlimited trading accounts", "Cuentas de trading ilimitadas")}</li>
                  <li>✓ {L("Everything in Core", "Todo lo de Core")}</li>
                  <li>✓ {L("Time-of-day & instrument breakdowns", "Desglose por hora e instrumento")}</li>
                  <li>✓ {L("Risk metrics + streaks", "Métricas de riesgo + rachas")}</li>
                  <li>✓ {L("Profit & Loss Track (business accounting)", "Profit & Loss Track (contabilidad)")}</li>
                  <li>✓ {L("Advanced alerts & reminders", "Alertas y recordatorios avanzados")}</li>
                  <li>✓ {L("Automated journaling imports", "Importación automática de journaling")}</li>
                  <li>✓ {L("AI coaching & action plans", "AI coaching y planes de acción")}</li>
                  <li>✓ {L("PDF reports + AI summary", "Reportes PDF + resumen IA")}</li>
                  <li>✓ {L("Priority email & chat support", "Soporte prioritario por email y chat")}</li>
                </ul>
                <button
                  onClick={() => handleStart("advanced")}
                  disabled={loadingPlan !== null}
                  className="mt-5 w-full py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loadingPlan === "advanced"
                    ? L("Redirecting...", "Redirigiendo...")
                    : L("Start Advanced", "Empezar Advanced")}
                </button>

                <Link
                  href="/plans-comparison"
                  className="mt-3 w-full text-center py-2 rounded-xl border border-emerald-400/50 text-emerald-300 text-xs font-semibold hover:bg-emerald-400/10 transition"
                >
                  {L("See more →", "Ver más →")}
                </Link>

                <p className="mt-2 text-[9px] text-emerald-300">
                  {L(
                    "If you treat trading like a business, this is your plan.",
                    "Si tratas el trading como un negocio, este es tu plan."
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
