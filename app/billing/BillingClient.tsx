// app/billing/BillingClient.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import type { PlanId } from "@/lib/types";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { listMyEntitlements } from "@/lib/entitlementsSupabase";

type BillingClientProps = {
  initialPlan: PlanId; // "core" | "advanced"
};

export default function BillingClient({ initialPlan }: BillingClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [couponCode, setCouponCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanId | "none">(initialPlan);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [addonActive, setAddonActive] = useState(false);
  const [addonLoading, setAddonLoading] = useState(false);
  const [addonSelected, setAddonSelected] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");

  const PRICES = {
    core: { monthly: 14.99, annual: 149.99 },
    advanced: { monthly: 24.99, annual: 249.99 },
  } as const;

  const priceFor = (planId: PlanId) =>
    billingCycle === "monthly" ? PRICES[planId].monthly : PRICES[planId].annual / 12;

  useEffect(() => {
    const cycle = searchParams?.get("cycle");
    if (cycle === "annual") setBillingCycle("annual");
    if (cycle === "monthly") setBillingCycle("monthly");
  }, [searchParams]);

  const normalizePlan = (raw: unknown): PlanId | "none" => {
    const v = String(raw ?? "").toLowerCase();
    if (v === "core") return "core";
    if (v === "advanced") return "advanced";
    return "none";
  };

  useEffect(() => {
    const userId = user?.id ?? "";
    if (!userId) {
      setLoadingProfile(false);
      return;
    }

    let cancelled = false;

    async function loadProfilePlan() {
      setLoadingProfile(true);
      try {
        const { data, error: planError } = await supabaseBrowser
          .from("profiles")
          .select("plan, subscription_status")
          .eq("id", userId)
          .maybeSingle();

        if (!planError) {
          const dbPlan = normalizePlan((data as any)?.plan);
          const metaPlan = normalizePlan(
            (user as any)?.plan ||
              (user as any)?.subscriptionPlan ||
              (user as any)?.user_metadata?.plan
          );
          const finalPlan = dbPlan !== "none" ? dbPlan : metaPlan;

          if (!cancelled) {
            setCurrentPlan(finalPlan);
            if (finalPlan !== "none") setSelectedPlan(finalPlan);
            setCurrentStatus(String((data as any)?.subscription_status ?? ""));
          }
        }
      } catch (err) {
        console.warn("[Billing] profile plan load error:", err);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    }

    async function loadAddonEntitlement() {
      setAddonLoading(true);
      try {
        const entitlements = await listMyEntitlements(userId);
        const active = entitlements.some(
          (e) =>
            e.entitlement_key === "option_flow" &&
            (e.status === "active" || e.status === "trialing")
        );
        if (!cancelled) setAddonActive(active);
      } catch (err) {
        console.warn("[Billing] addon entitlement load error:", err);
      } finally {
        if (!cancelled) setAddonLoading(false);
      }
    }

    loadProfilePlan();
    loadAddonEntitlement();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleCheckout() {
    if (authLoading) return;

    if (!user) {
      setError(L("You need to sign in before starting checkout.", "Debes iniciar sesión antes de iniciar el checkout."));
      // Si quisieras redirect: router.push(`/signin?redirect=/billing?plan=${selectedPlan}`);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: selectedPlan,
          userId: user.id,
          email: user.email,
          couponCode: couponCode.trim() || undefined,
          addonOptionFlow: !hasActivePlan && addonSelected,
          billingCycle,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || L("Failed to start checkout", "No se pudo iniciar el checkout"));
      }
      if (!data.url) {
        throw new Error(L("Missing checkout URL", "Falta la URL de checkout"));
      }

      window.location.href = data.url as string;
    } catch (err: any) {
      setError(err.message ?? L("Something went wrong starting checkout.", "Algo salió mal iniciando el checkout."));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddonCheckout() {
    if (authLoading) return;
    if (!user) {
      setError(L("You need to sign in before starting checkout.", "Debes iniciar sesión antes de iniciar el checkout."));
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/stripe/create-addon-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || L("Failed to start checkout", "No se pudo iniciar el checkout"));
      if (!data.url) throw new Error(L("Missing checkout URL", "Falta la URL de checkout"));

      window.location.href = data.url as string;
    } catch (err: any) {
      setError(err.message ?? L("Something went wrong starting checkout.", "Algo salió mal iniciando el checkout."));
    } finally {
      setLoading(false);
    }
  }

  const isButtonDisabled = loading || authLoading;
  const hasActivePlan = currentPlan !== "none" && currentStatus === "active";
  const isCurrentSelection = hasActivePlan && selectedPlan === currentPlan;
  const currentPlanLabel =
    currentPlan === "advanced"
      ? L("Advance", "Advance")
      : currentPlan === "core"
      ? L("Core", "Core")
      : L("No active plan", "Sin plan activo");
  const statusLabel = currentStatus
    ? currentStatus.replace("_", " ")
    : currentPlan === "none"
    ? L("inactive", "inactivo")
    : L("active", "activo");

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-4 py-10">
      <div className="w-full max-w-5xl relative rounded-2xl border border-slate-800 bg-slate-950 p-6 md:p-10 shadow-[0_0_90px_rgba(16,185,129,0.45)] overflow-hidden">
        {/* Glow animado tipo “candela” con verde + violeta */}
        <div className="pointer-events-none absolute inset-0 mix-blend-screen">
          <motion.div
            className="absolute -inset-48 bg-[radial-gradient(circle_at_0%_0%,rgba(16,185,129,0.45),transparent_55%),radial-gradient(circle_at_100%_10%,rgba(129,140,248,0.3),transparent_60%),radial-gradient(circle_at_50%_100%,rgba(168,85,247,0.4),transparent_60%)]"
            initial={{ opacity: 0.4, scale: 1, rotate: 0 }}
            animate={{
              opacity: [0.35, 0.95, 0.35],
              scale: [1, 1.08, 1],
              rotate: [0, 3, -2, 0],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </div>

        {/* Contenido */}
        <div className="relative">
          {/* Header */}
          <div className="mb-8">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-emerald-400 uppercase">
              {L("Billing", "Facturación")}
            </p>
            <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold text-slate-50">
                  {L("Plans & add-ons", "Planes y add-ons")}
                </h1>
                <p className="mt-2 text-xs md:text-sm text-slate-300 max-w-2xl">
                  {L(
                    "Pick the plan that matches how you trade. Add-ons are optional, and you can upgrade or cancel any time.",
                    "Elige el plan que encaja con tu forma de operar. Los add-ons son opcionales y puedes actualizar o cancelar cuando quieras."
                  )}
                </p>
              </div>

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

              {hasActivePlan && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-xs">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                    {L("Current plan", "Plan actual")}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
                      {loadingProfile ? L("Loading…", "Cargando…") : currentPlanLabel}
                    </span>
                    <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] text-slate-300">
                      {statusLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">
                    {L("Manage billing or upgrade any time.", "Administra tu facturación o haz upgrade cuando quieras.")}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Plans */}
          <div className="grid grid-cols-1 md:grid-cols-[1.02fr,0.98fr] gap-4 md:gap-6">
            {/* Core */}
            <motion.button
              type="button"
              onClick={() => setSelectedPlan("core")}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`relative text-left rounded-2xl border px-4 py-4 text-xs md:text-sm transition
                ${
                  selectedPlan === "core"
                    ? "border-emerald-400/70 bg-slate-900/85 shadow-[0_0_40px_rgba(16,185,129,0.35)]"
                    : "border-slate-700/80 bg-slate-950/90 hover:border-emerald-400/60 hover:bg-slate-900/70"
                }`}
            >
              {hasActivePlan && currentPlan === "core" && (
                <span className="absolute right-3 top-3 rounded-full border border-emerald-300/70 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                  {L("Current plan", "Plan actual")}
                </span>
              )}
              <div className="absolute inset-x-0 -top-px h-px bg-linear-to-r from-transparent via-emerald-400/50 to-transparent" />
              <p className="text-xs font-semibold text-slate-100 mb-1">{L("Core", "Core")}</p>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-lg md:text-xl font-bold text-emerald-300">
                  ${priceFor("core").toFixed(2)}
                </p>
                {billingCycle === "annual" && (
                  <span className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[9px] text-emerald-200">
                    {L("Save 2 months", "Ahorra 2 meses")}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mb-2">
                {billingCycle === "monthly"
                  ? L("per month", "por mes")
                  : L("per month (billed yearly)", "por mes (facturado anual)")}
              </p>
              {billingCycle === "annual" && (
                <p className="text-[10px] text-slate-500 mb-2">
                  {L("Billed annually", "Facturado anual")}
                </p>
              )}
              <ul className="space-y-1 text-[11px] text-slate-300">
                <li>• {L("Full daily journal & calendar", "Diario diario completo y calendario")}</li>
                <li>• {L("Back-study module", "Módulo de back-study")}</li>
                <li>• {L("Basic analytics", "Analítica básica")}</li>
              </ul>
            </motion.button>

            {/* Advanced – protagonista, con glow verde + violeta */}
            <motion.button
              type="button"
              onClick={() => setSelectedPlan("advanced")}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.98 }}
              className={`relative overflow-hidden text-left rounded-2xl border px-4 py-4 text-xs md:text-sm transition
                ${
                  selectedPlan === "advanced"
                    ? "border-emerald-400/90 bg-linear-to-br from-emerald-500/20 via-slate-900 to-slate-950 shadow-[0_0_65px_rgba(52,211,153,0.7)]"
                    : "border-slate-700/80 bg-slate-950/95 hover:border-emerald-400/80 hover:bg-linear-to-br hover:from-emerald-500/15 hover:via-slate-900 hover:to-slate-950"
                }`}
            >
              {hasActivePlan && currentPlan === "advanced" && (
                <span className="absolute right-3 top-3 rounded-full border border-emerald-300/70 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-100">
                  {L("Current plan", "Plan actual")}
                </span>
              )}
              {/* Glow animado interno */}
              <motion.div
                className="pointer-events-none absolute inset-0"
                initial={{ opacity: 0.5, scale: 1 }}
                animate={{
                  opacity: [0.45, 1, 0.45],
                  scale: [1, 1.08, 1],
                  x: [0, -8, 0, 6, 0],
                  y: [0, 4, 0, -4, 0],
                }}
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <div className="absolute -inset-24 bg-[radial-gradient(circle_at_10%_0%,rgba(52,211,153,0.55),transparent_55%),radial-gradient(circle_at_90%_10%,rgba(129,140,248,0.5),transparent_55%),radial-gradient(circle_at_50%_100%,rgba(168,85,247,0.55),transparent_60%)]" />
              </motion.div>

              <div className="relative flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-slate-50">{L("Advanced", "Advanced")}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/80 px-2.5 py-0.5 text-[9px] text-emerald-100 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {L("Most popular", "Más popular")}
                </span>
              </div>

              <div className="relative flex items-center gap-2 mb-1">
                <p className="text-lg md:text-xl font-bold text-emerald-100">
                  ${priceFor("advanced").toFixed(2)}
                </p>
                {billingCycle === "annual" && (
                  <span className="rounded-full border border-emerald-300/70 bg-emerald-500/15 px-2 py-0.5 text-[9px] text-emerald-100">
                    {L("Save 2 months", "Ahorra 2 meses")}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-emerald-100/80 mb-1">
                {billingCycle === "monthly"
                  ? L("/ month", "/ mes")
                  : L("/ month (billed yearly)", "/ mes (facturado anual)")}
              </p>
              {billingCycle === "annual" && (
                <p className="text-[10px] text-emerald-100/70 mb-2">
                  {L("Billed annually", "Facturado anual")}
                </p>
              )}

              <p className="relative text-[11px] text-slate-100/90 mb-2">
                {L(
                  "Designed for traders who want deep analytics, mindset feedback and AI coaching.",
                  "Diseñado para traders que quieren analítica profunda, feedback de mindset y AI coaching."
                )}
              </p>

              <ul className="relative space-y-1 text-[11px] text-slate-50">
                <li>• {L("Everything in Core", "Todo lo de Core")}</li>
                <li>• {L("Advanced analytics & breakdowns", "Analítica avanzada y breakdowns")}</li>
                <li>• {L("Profit & Loss Track (business accounting)", "Profit & Loss Track (contabilidad)")}</li>
                <li>• {L("AI coaching & mindset tools", "AI coaching y herramientas de mindset")}</li>
                <li>• {L("Priority improvements & new features", "Mejoras prioritarias y nuevas features")}</li>
              </ul>
            </motion.button>
          </div>

          {/* Checkout summary (new users) */}
          {!hasActivePlan && (
            <div className="mt-6 border-t border-slate-800/80 pt-5 space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                  {L("Your selection", "Tu selección")}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-200">
                  <span className="rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-200">
                    {selectedPlan === "core" ? L("Core plan", "Plan Core") : L("Advanced plan", "Plan Advanced")}
                  </span>
                  {addonSelected && (
                    <span className="rounded-full border border-slate-600 bg-slate-950/70 px-3 py-1 text-[11px] text-slate-200">
                      {L("Option Flow add-on", "Add-on Option Flow")}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-[11px] text-slate-400">
                  {L(
                    "You will be redirected to Stripe to complete your subscription.",
                    "Serás redirigido a Stripe para completar tu suscripción."
                  )}
                </p>
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] text-slate-400 mb-1">
                    {L("Coupon code (optional)", "Código de cupón (opcional)")}
                  </label>
                  <input
                    value={couponCode}
                    onChange={(e) =>
                      setCouponCode(e.target.value.toUpperCase())
                    }
                    placeholder={L("Enter coupon code", "Ingresa tu cupón")}
                    className="w-full rounded-md bg-slate-950/90 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isButtonDisabled}
                  className="w-full md:w-auto min-w-[180px] px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs md:text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap text-center leading-none"
                >
                  {loading || authLoading
                    ? L("Checking…", "Verificando…")
                    : L("Checkout with Stripe", "Pagar con Stripe")}
                </button>
              </div>

              {error && (
                <p className="text-[11px] text-red-400">
                  {error}
                </p>
              )}
            </div>
          )}

          {/* Coupon + CTA (existing subscribers) */}
          {hasActivePlan && (
            <div className="mt-6 border-t border-slate-800/80 pt-5 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1">
                  <label className="block text-[10px] text-slate-400 mb-1">
                    {L("Coupon code (optional)", "Código de cupón (opcional)")}
                  </label>
                  <input
                    value={couponCode}
                    onChange={(e) =>
                      setCouponCode(e.target.value.toUpperCase())
                    }
                    placeholder={L("Enter coupon code", "Ingresa tu cupón")}
                    className="w-full rounded-md bg-slate-950/90 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isButtonDisabled || isCurrentSelection}
                  className="w-full md:w-auto min-w-[180px] px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs md:text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap text-center leading-none"
                >
                  {loading || authLoading
                    ? L("Checking…", "Verificando…")
                    : isCurrentSelection
                    ? L("Current plan", "Plan actual")
                    : `${L("Continue with", "Continuar con")} ${selectedPlan === "core" ? L("Core", "Core") : L("Advanced", "Advanced")}`}
                </button>
              </div>

              {error && (
                <p className="text-[11px] text-red-400">
                  {error}
                </p>
              )}

              <p className="text-[10px] text-slate-400">
                {L(
                  "Your subscription unlocks features like advanced analytics, AI coaching and more. You can manage or cancel your plan any time in Settings.",
                  "Tu suscripción desbloquea features como analítica avanzada, AI coaching y más. Puedes gestionar o cancelar tu plan en cualquier momento desde Settings."
                )}
              </p>
            </div>
          )}

          {/* Add-ons */}
          <div className="mt-8 border-t border-slate-800/80 pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {L("Add-ons", "Add-ons")}
                </p>
                <h2 className="text-lg font-semibold text-slate-100">
                  {L("Option Flow Intelligence", "Option Flow Intelligence")}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {L(
                    "Premium flow analysis, premarket planning, and AI-grade summaries.",
                    "Análisis premium de flujo, planificación premarket y resúmenes con IA."
                  )}
                </p>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] text-slate-300">
                {addonLoading
                  ? L("Checking…", "Verificando…")
                  : addonActive
                  ? L("Active", "Activo")
                  : L("Optional", "Opcional")}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">$5.00</p>
                <p className="text-[11px] text-slate-400">
                  {L("Monthly add-on", "Add-on mensual")}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {!hasActivePlan ? (
                  <button
                    type="button"
                    onClick={() => setAddonSelected((prev) => !prev)}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                      addonSelected
                        ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                        : "border border-slate-700 text-slate-200 hover:border-emerald-400"
                    }`}
                  >
                    {addonSelected
                      ? L("Remove Option Flow", "Quitar Option Flow")
                      : L("Add Option Flow", "Agregar Option Flow")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddonCheckout}
                    disabled={isButtonDisabled || addonActive}
                    className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {addonActive
                      ? L("Already active", "Ya activo")
                      : L("Add Option Flow", "Agregar Option Flow")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push("/option-flow")}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-200"
                >
                  {L("Open Option Flow", "Abrir Option Flow")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
