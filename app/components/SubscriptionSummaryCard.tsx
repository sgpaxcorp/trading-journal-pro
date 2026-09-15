"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  CreditCard,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { catalogText, PLAN_CATALOG } from "@/lib/planCatalog";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import type { PlanId } from "@/lib/types";

type SubscriptionInfo = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  trial_start: string | null;
  trial_end: string | null;
  price_id: string | null;
  interval: string | null;
  billing_cycle: "monthly" | "annual" | null;
  plan: PlanId | null;
  amount: number | null;
  currency: string;
  quantity: number;
};

type SubscriptionResponse = {
  subscription: SubscriptionInfo | null;
  access?: { plan?: string; status?: string };
  credit_balance?: number;
  next_invoice?: {
    amount_due: number;
    currency: string;
    payment_date: string | null;
  } | null;
};

function normalizePlan(value: unknown): PlanId | null {
  const plan = String(value ?? "").trim().toLowerCase();
  if (plan === "core" || plan === "standard") return "core";
  if (plan === "advanced" || plan === "advance") return "advanced";
  return null;
}

export default function SubscriptionSummaryCard() {
  const { user } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [data, setData] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSubscription = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error(L("Your session is not available.", "Tu sesión no está disponible."));
      }

      const response = await fetch("/api/stripe/subscription", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as SubscriptionResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          body.error || L("We could not load your subscription.", "No pudimos cargar tu suscripción.")
        );
      }
      setData(body);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : L("We could not load your subscription.", "No pudimos cargar tu suscripción.")
      );
    } finally {
      setLoading(false);
    }
  }, [isEs, user?.id]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  const subscription = data?.subscription ?? null;
  const planId = normalizePlan(subscription?.plan ?? data?.access?.plan);
  const rawStatus = String(subscription?.status ?? data?.access?.status ?? "").toLowerCase();
  const isActive = ["active", "paid", "trial", "trialing"].includes(rawStatus);
  const isPastDue = ["past_due", "unpaid", "incomplete"].includes(rawStatus);
  const endsAtPeriod = Boolean(subscription?.cancel_at_period_end);
  const hasRecurringSubscription = Boolean(subscription?.id);
  const planName = planId ? catalogText(PLAN_CATALOG[planId].name, lang) : L("No plan", "Sin plan");
  const cycleLabel =
    subscription?.billing_cycle === "annual"
      ? L("Annual", "Anual")
      : subscription?.billing_cycle === "monthly"
        ? L("Monthly", "Mensual")
        : L("Access plan", "Plan de acceso");
  const benefits = planId ? PLAN_CATALOG[planId].billingHighlights.slice(0, 6) : [];

  const status = useMemo(() => {
    if (endsAtPeriod) {
      return {
        label: L("Cancellation scheduled", "Cancelación programada"),
        className: "border-amber-400/35 bg-amber-400/10 text-amber-200",
      };
    }
    if (rawStatus === "trial" || rawStatus === "trialing") {
      return {
        label: L("Trial active", "Prueba activa"),
        className: "border-cyan-400/35 bg-cyan-400/10 text-cyan-200",
      };
    }
    if (isPastDue) {
      return {
        label: L("Payment needs attention", "Pago requiere atención"),
        className: "border-rose-400/35 bg-rose-400/10 text-rose-200",
      };
    }
    if (isActive) {
      return {
        label: L("Active", "Activa"),
        className: "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
      };
    }
    return {
      label: rawStatus ? L("Inactive", "Inactiva") : L("No subscription", "Sin suscripción"),
      className: "border-slate-600 bg-slate-800/70 text-slate-300",
    };
  }, [endsAtPeriod, isActive, isEs, isPastDue, rawStatus]);

  const dateValue = endsAtPeriod
    ? subscription?.current_period_end
    : data?.next_invoice?.payment_date || subscription?.current_period_end || subscription?.trial_end;
  const formattedDate = dateValue
    ? new Intl.DateTimeFormat(isEs ? "es-PR" : "en-US", {
        dateStyle: "long",
        timeZone: "America/Puerto_Rico",
      }).format(new Date(dateValue))
    : "—";
  const currency = data?.next_invoice?.currency || subscription?.currency || "usd";
  const amount =
    typeof data?.next_invoice?.amount_due === "number"
      ? data.next_invoice.amount_due
      : typeof subscription?.amount === "number"
        ? subscription.amount * Math.max(1, subscription.quantity || 1)
        : null;
  const money = (cents: number | null | undefined, currencyCode = currency) =>
    typeof cents === "number"
      ? new Intl.NumberFormat(isEs ? "es-PR" : "en-US", {
          style: "currency",
          currency: currencyCode.toUpperCase(),
        }).format(cents / 100)
      : "—";

  return (
    <section aria-labelledby="subscription-summary-title" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-400">
            {L("Membership & billing", "Membresía y facturación")}
          </p>
          <h2 id="subscription-summary-title" className="mt-1 text-xl font-semibold text-slate-50">
            {L("My subscription", "Mi suscripción")}
          </h2>
        </div>
        <Link
          href="/plans-comparison"
          className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
        >
          {L("View plans and pricing", "Ver planes y precios")}
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-700/80 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(6,78,59,0.18))] shadow-[0_24px_80px_rgba(2,6,23,0.42)]">
        {loading ? (
          <div className="animate-pulse space-y-5 p-6">
            <div className="h-5 w-28 rounded bg-slate-800" />
            <div className="h-8 w-56 rounded bg-slate-800" />
            <div className="grid gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((item) => <div key={item} className="h-20 rounded-2xl bg-slate-900/80" />)}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-rose-200">{L("Subscription unavailable", "Suscripción no disponible")}</p>
              <p className="mt-1 text-xs text-slate-400">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void loadSubscription()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-200"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              {L("Try again", "Intentar de nuevo")}
            </button>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-800/90 p-5 sm:p-6">
              {planId === "core" && isActive ? (
                <Link
                  href="/plans-comparison"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.07] p-3 text-xs leading-5 text-slate-300 transition hover:border-cyan-300/40"
                >
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
                  <span>
                    {L(
                      "Want AI coaching, deeper statistics, P&L, cashflow, audit tools, and reports? Explore Advanced.",
                      "¿Quieres AI coaching, estadística profunda, P&L, cashflow, auditoría y reportes? Conoce Advanced."
                    )}
                  </span>
                </Link>
              ) : null}

              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${status.className}`}>
                    {status.label}
                  </span>
                  <h3 className="mt-3 text-2xl font-bold text-white">
                    {planName} <span className="font-normal text-slate-500">·</span>{" "}
                    <span className="text-lg font-semibold text-slate-300">{cycleLabel}</span>
                  </h3>
                  <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400">
                    {endsAtPeriod
                      ? L(
                          "Automatic renewal is off. Your access remains available through the end date shown below.",
                          "La renovación automática está desactivada. Tu acceso continúa hasta la fecha indicada abajo."
                        )
                      : isPastDue
                        ? L(
                            "Update your payment method to prevent an interruption in business access.",
                            "Actualiza tu método de pago para evitar una interrupción del acceso empresarial."
                          )
                        : planId
                          ? L(
                              "Your NeuroTrader membership, billing cycle, benefits, and account actions are consolidated here.",
                              "Tu membresía de NeuroTrader, ciclo de facturación, beneficios y acciones de cuenta están consolidados aquí."
                            )
                          : L(
                              "Choose the operating plan that best fits your trading business.",
                              "Escoge el plan operativo que mejor se ajuste a tu empresa de trading."
                            )}
                  </p>
                </div>
                <ShieldCheck className="hidden h-10 w-10 text-emerald-300/80 sm:block" aria-hidden="true" />
              </div>
            </div>

            {planId && hasRecurringSubscription ? (
              <div className="grid gap-px bg-slate-800/80 sm:grid-cols-3">
                <div className="bg-slate-950/55 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-slate-500">
                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                      {endsAtPeriod ? L("Current price", "Precio actual") : L("Next payment", "Próximo pago")}
                    </p>
                  </div>
                  <p className="mt-2 text-lg font-bold text-slate-100">{money(amount)}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {L("Calculated by Stripe", "Calculado por Stripe")}
                  </p>
                </div>
                <div className="bg-slate-950/55 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-slate-500">
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                      {endsAtPeriod ? L("Access ends", "Acceso termina") : L("Renews on", "Renueva el")}
                    </p>
                  </div>
                  <p className="mt-2 text-sm font-bold text-slate-100">{formattedDate}</p>
                </div>
                <div className="bg-slate-950/55 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-slate-500">
                    <ReceiptText className="h-4 w-4" aria-hidden="true" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">
                      {L("Account credit", "Crédito en cuenta")}
                    </p>
                  </div>
                  <p className="mt-2 text-lg font-bold text-slate-100">
                    {money(data?.credit_balance ?? 0, currency)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {L("Applied automatically", "Se aplica automáticamente")}
                  </p>
                </div>
              </div>
            ) : planId ? (
              <div className="border-y border-slate-800/90 bg-slate-950/45 px-5 py-3 text-xs text-slate-400 sm:px-6">
                <span className="font-semibold text-slate-200">
                  {L("Direct platform access.", "Acceso directo a la plataforma.")}
                </span>{" "}
                {L(
                  "No recurring Stripe charge is attached to this access, so there is no renewal amount to display.",
                  "Este acceso no tiene un cargo recurrente de Stripe, por eso no hay un importe de renovación que mostrar."
                )}
              </div>
            ) : null}

            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  {L("Your subscription includes", "Tu suscripción incluye")}
                </p>
                {benefits.length ? (
                  <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    {benefits.map((benefit) => (
                      <li key={benefit.en} className="flex items-start gap-2 text-xs leading-5 text-slate-400">
                        <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                          <Check className="h-2.5 w-2.5" aria-hidden="true" />
                        </span>
                        {catalogText(benefit, lang)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    {L("No active plan benefits were found.", "No encontramos beneficios de un plan activo.")}
                  </p>
                )}
              </div>

              <div className="flex min-w-48 flex-col gap-2 lg:items-stretch">
                {planId && hasRecurringSubscription ? (
                  <Link
                    href="/billing/manage"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-300"
                  >
                    {isPastDue ? L("Fix payment", "Corregir pago") : L("Manage subscription", "Administrar suscripción")}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                ) : (
                  <Link
                    href="/billing"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-emerald-300"
                  >
                    {planId ? L("Review billing options", "Revisar opciones de facturación") : L("Choose a plan", "Escoger un plan")}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
                <Link
                  href="/billing/history"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-400 hover:text-cyan-200"
                >
                  {L("Billing history", "Historial de facturación")}
                </Link>
                <p className="text-center text-[10px] leading-4 text-slate-600">
                  {L(
                    "Cancellation and payment changes open in Stripe's secure portal.",
                    "Cancelaciones y cambios de pago abren en el portal seguro de Stripe."
                  )}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
