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
import { getOptionFlowBetaCopy, isOptionFlowBetaTester } from "@/lib/optionFlowBeta";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { listMyEntitlements } from "@/lib/entitlementsSupabase";

type BillingClientProps = {
  initialPlan: PlanId; // "core" | "advanced"
  initialPartnerCode?: string;
};

type SubscriptionInfo = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  price_id: string | null;
  interval: string | null;
  billing_cycle: "monthly" | "annual" | null;
  plan: PlanId | null;
};

export default function BillingClient({ initialPlan, initialPartnerCode = "" }: BillingClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const optionFlowBeta = getOptionFlowBetaCopy(isEs ? "es" : "en");
  const optionFlowBetaAccess = isOptionFlowBetaTester(user?.email ?? "");

  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<PlanId | "none">(initialPlan);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [addonActive, setAddonActive] = useState(false);
  const [addonLoading, setAddonLoading] = useState(false);
  const [addonSelected, setAddonSelected] = useState(false);
  const [brokerAddonActive, setBrokerAddonActive] = useState(false);
  const [brokerAddonSelected, setBrokerAddonSelected] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [partnerCode, setPartnerCode] = useState(
    String(initialPartnerCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 24)
  );
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [autoRenewEnabled, setAutoRenewEnabled] = useState(true);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelUsageStatus, setCancelUsageStatus] = useState("");
  const [cancelImprovement, setCancelImprovement] = useState("");
  const [cancelReturnTrigger, setCancelReturnTrigger] = useState("");
  const [cancelDetail, setCancelDetail] = useState("");
  const [cancelAcknowledge, setCancelAcknowledge] = useState(false);
  const [cancelFlowStep, setCancelFlowStep] = useState<1 | 2>(1);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);

  const PRICES = {
    core: { monthly: 15.99, annual: 159.90 },
    advanced: { monthly: 26.99, annual: 269.90 },
  } as const;
  const OPTION_FLOW_PRICES = {
    monthly: 6.99,
    annual: 69.90,
  } as const;
  const BROKER_SYNC_PRICES = {
    monthly: 5.0,
    annual: 50.0,
  } as const;

  const priceFor = (planId: PlanId) =>
    billingCycle === "monthly" ? PRICES[planId].monthly : PRICES[planId].annual / 12;

  useEffect(() => {
    const cycle = searchParams?.get("cycle");
    if (cycle === "annual") setBillingCycle("annual");
    if (cycle === "monthly") setBillingCycle("monthly");
    const partner = String(searchParams?.get("partner") ?? searchParams?.get("ref") ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "")
      .slice(0, 24);
    if (partner) setPartnerCode(partner);
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
        const brokerActive = entitlements.some(
          (e) =>
            e.entitlement_key === "broker_sync" &&
            (e.status === "active" || e.status === "trialing")
        );
        if (!cancelled) {
          setAddonActive(active);
          setBrokerAddonActive(brokerActive);
        }
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

  async function getAuthToken() {
    const { data: sessionData } = await supabaseBrowser.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) {
      throw new Error(
        L("Session not available. Please sign in again.", "Sesión no disponible. Inicia sesión nuevamente.")
      );
    }
    return token;
  }

  useEffect(() => {
    if (!user?.id) return;
    let active = true;

    async function loadSubscription() {
      setSubscriptionLoading(true);
      try {
        const token = await getAuthToken();
        const res = await fetch("/api/stripe/subscription", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load subscription.");
        if (!active) return;
        const info = data.subscription as SubscriptionInfo | null;
        setSubscriptionInfo(info);
        if (info) {
          setAutoRenewEnabled(!info.cancel_at_period_end);
        }
      } catch (err) {
        if (!active) return;
      } finally {
        if (!active) return;
        setSubscriptionLoading(false);
      }
    }

    loadSubscription();
    return () => {
      active = false;
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

      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error(
          L("Session not available. Please sign in again.", "Sesión no disponible. Inicia sesión nuevamente.")
        );
      }

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId: selectedPlan,
          addonOptionFlow: !hasActivePlan && addonSelected,
          addonBrokerSync: !hasActivePlan && brokerAddonSelected,
          billingCycle,
          partnerCode: partnerCode || undefined,
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

  async function handleAddonCheckout(addonKey: "option_flow" | "broker_sync") {
    if (authLoading) return;
    if (!user) {
      setError(L("You need to sign in before starting checkout.", "Debes iniciar sesión antes de iniciar el checkout."));
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error(
          L("Session not available. Please sign in again.", "Sesión no disponible. Inicia sesión nuevamente.")
        );
      }

      const res = await fetch("/api/stripe/create-addon-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ addonKey, billingCycle }),
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

  async function handleToggleAutoRenew(nextValue: boolean) {
    if (!subscriptionInfo) return;
    if (cancelLoading) return;
    try {
      setCancelNotice(null);
      setCancelLoading(true);
      const token = await getAuthToken();
      const res = await fetch("/api/stripe/subscription/auto-renew", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: nextValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update auto-renew.");
      setAutoRenewEnabled(!data.cancel_at_period_end);
      setSubscriptionInfo((prev) =>
        prev ? { ...prev, cancel_at_period_end: Boolean(data.cancel_at_period_end) } : prev
      );
    } catch (err: any) {
      setCancelNotice(err?.message ?? L("Failed to update auto-renew.", "No se pudo actualizar auto-renovación."));
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleCancelSubscription() {
    if (!subscriptionInfo) return;
    if (!cancelReason.trim()) {
      setCancelNotice(L("Please select a reason.", "Selecciona un motivo."));
      return;
    }
    if (!cancelUsageStatus.trim()) {
      setCancelNotice(L("Please tell us how much you used the platform.", "Indícanos cuánto usaste la plataforma."));
      return;
    }
    if (!cancelAcknowledge) {
      setCancelNotice(
        L(
          "Please confirm that you understand access stays active until the end of your current billing cycle.",
          "Confirma que entiendes que el acceso seguirá activo hasta el final de tu ciclo actual."
        )
      );
      return;
    }

    try {
      setCancelNotice(null);
      setCancelLoading(true);
      const token = await getAuthToken();
      const res = await fetch("/api/stripe/subscription/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: cancelReason.trim(),
          usageStatus: cancelUsageStatus.trim(),
          improvementArea: cancelImprovement.trim(),
          returnTrigger: cancelReturnTrigger.trim(),
          detail: cancelDetail.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel subscription.");
      setSubscriptionInfo((prev) =>
        prev
          ? {
              ...prev,
              cancel_at_period_end: true,
              current_period_end: data.current_period_end ?? prev.current_period_end,
            }
          : prev
      );
      setAutoRenewEnabled(false);
      const activeUntil = data.current_period_end ?? subscriptionInfo.current_period_end;
      setCancelNotice(
        activeUntil
          ? L(
              `Cancellation scheduled. Your membership stays active until ${formatDate(activeUntil)}. We also sent a confirmation email.`,
              `Cancelación programada. Tu membresía seguirá activa hasta ${formatDate(activeUntil)}. También te enviamos un email de confirmación.`
            )
          : L("Cancellation scheduled.", "Cancelación programada.")
      );
      setCancelModalOpen(false);
    } catch (err: any) {
      setCancelNotice(err?.message ?? L("Failed to cancel subscription.", "No se pudo cancelar la suscripción."));
    } finally {
      setCancelLoading(false);
    }
  }

  function handleAdvanceCancelFlow() {
    if (!cancelReason.trim()) {
      setCancelNotice(L("Please select a reason.", "Selecciona un motivo."));
      return;
    }
    if (!cancelUsageStatus.trim()) {
      setCancelNotice(
        L("Please tell us how much you used the platform.", "Indícanos cuánto usaste la plataforma.")
      );
      return;
    }
    setCancelNotice(null);
    setCancelFlowStep(2);
  }

  function openCancelModal() {
    setCancelNotice(null);
    setCancelFlowStep(1);
    setCancelAcknowledge(false);
    setCancelModalOpen(true);
  }

  function closeCancelModal() {
    if (cancelLoading) return;
    setCancelModalOpen(false);
  }

  function handleUpdatePaymentMethod() {
    if (!user) {
      router.push(`/signin?next=${encodeURIComponent("/billing/update-payment")}`);
      return;
    }
    router.push("/billing/update-payment");
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
  const formatDate = (value: string | null) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleDateString(isEs ? "es-ES" : "en-US");
    } catch {
      return value;
    }
  };
  const nextBillingDate = subscriptionInfo?.current_period_end ?? null;
  const accessUntilDate = subscriptionInfo?.current_period_end ?? null;

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

              {partnerCode ? (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                  {L("Partner referral applied:", "Referido partner aplicado:")}{" "}
                  <span className="font-semibold">{partnerCode}</span>
                </div>
              ) : null}

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
                <li>• {L("Trade review workspace", "Workspace de revisión de trades")}</li>
                <li>• {L("Basic analytics", "Analítica básica")}</li>
                <li>• {L("Manual broker imports", "Imports manuales de bróker")}</li>
                <li>• {L("Basic alerts & reminders", "Alertas y recordatorios básicos")}</li>
                <li>• {L("Mobile app (iOS)", "Aplicación móvil (iOS)")}</li>
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
                {!hasActivePlan || currentPlan !== "advanced" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-400/80 px-2.5 py-0.5 text-[9px] text-emerald-100 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {L("Most popular", "Más popular")}
                  </span>
                ) : null}
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
                <li>• {L("Notebook workspace", "Workspace de notebook")}</li>
                <li>• {L("Cashflow tracking", "Seguimiento de cashflow")}</li>
                <li>• {L("Audit workbench", "Audit workbench")}</li>
                <li>• {L("Advanced analytics & breakdowns", "Analítica avanzada y breakdowns")}</li>
                <li>• {L("Profit & Loss Track (business accounting)", "Profit & Loss Track (contabilidad)")}</li>
                <li>• {L("AI coaching & mindset tools", "AI coaching y herramientas de mindset")}</li>
                <li>• {L("Back-Studying & Audit workbench", "Back-Studying y Audit workbench")}</li>
                <li>• {L("Advanced PDF exports", "Exportaciones PDF avanzadas")}</li>
                <li>• {L("Priority improvements & new features", "Mejoras prioritarias y nuevas features")}</li>
                <li>• {L("Mobile app (iOS)", "Aplicación móvil (iOS)")}</li>
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
                  {brokerAddonSelected && (
                    <span className="rounded-full border border-slate-600 bg-slate-950/70 px-3 py-1 text-[11px] text-slate-200">
                      {L("Broker Sync add-on", "Add-on Broker Sync")}
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
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isButtonDisabled}
                  className="w-full md:w-auto min-w-[180px] px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs md:text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap text-center leading-none"
                >
                  <span>{L("Checkout with Stripe", "Pagar con Stripe")}</span>
                  {(loading || authLoading) && (
                    <span className="ml-2 inline-flex h-3 w-3 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                  )}
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
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isButtonDisabled || isCurrentSelection}
                  className="w-full md:w-auto min-w-[180px] px-6 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs md:text-sm font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition whitespace-nowrap text-center leading-none"
                >
                  <span>
                    {isCurrentSelection
                      ? L("Current plan", "Plan actual")
                      : `${L("Continue with", "Continuar con")} ${selectedPlan === "core" ? L("Core", "Core") : L("Advanced", "Advanced")}`}
                  </span>
                  {(loading || authLoading) && (
                    <span className="ml-2 inline-flex h-3 w-3 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                  )}
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
          <div className="mt-8 border-t border-slate-800/80 pt-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {L("Add-ons", "Add-ons")}
                </p>
                <h2 className="text-lg font-semibold text-slate-100">
                  {L("Option Flow Intelligence", "Option Flow Intelligence")}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {optionFlowBeta.description}
                </p>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] text-slate-300">
                {optionFlowBetaAccess
                  ? L("Internal beta", "Beta interno")
                  : optionFlowBeta.badge}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {optionFlowBetaAccess
                    ? L("Internal tester access", "Acceso interno de prueba")
                    : L("Private beta access only", "Solo acceso beta privado")}
                </p>
                <p className="text-[11px] text-slate-400">
                  {optionFlowBeta.billingNotice}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {optionFlowBetaAccess ? (
                  <button
                    type="button"
                    onClick={() => router.push("/option-flow")}
                    className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300"
                  >
                    {optionFlowBeta.openInternal}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push("/option-flow")}
                    className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-200"
                  >
                    {optionFlowBeta.learnMore}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">
                  {L("Broker Sync (SnapTrade)", "Broker Sync (SnapTrade)")}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {L(
                    "Connect your broker and sync transactions directly into the Journal.",
                    "Conecta tu bróker y sincroniza transacciones directo al Journal."
                  )}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {L(
                    "Supported (US): Alpaca, Alpaca Paper, Chase, E*Trade, Empower, Fidelity, Moomoo, Public, Robinhood, Schwab, Schwab OAuth, tastytrade, TD Direct Investing, TradeStation, TradeStation Paper, Tradier, Vanguard US, Webull US, Webull US OAuth, Wells Fargo. International: Interactive Brokers, Coinbase (crypto).",
                    "Soporta (US): Alpaca, Alpaca Paper, Chase, E*Trade, Empower, Fidelity, Moomoo, Public, Robinhood, Schwab, Schwab OAuth, tastytrade, TD Direct Investing, TradeStation, TradeStation Paper, Tradier, Vanguard US, Webull US, Webull US OAuth, Wells Fargo. Internacionales: Interactive Brokers, Coinbase (crypto)."
                  )}
                </p>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-950/70 px-3 py-1 text-[11px] text-slate-300">
                {addonLoading
                  ? L("Checking…", "Verificando…")
                  : brokerAddonActive
                  ? L("Active", "Activo")
                  : L("Optional", "Opcional")}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  ${billingCycle === "annual" ? BROKER_SYNC_PRICES.annual.toFixed(2) : BROKER_SYNC_PRICES.monthly.toFixed(2)}
                </p>
                <p className="text-[11px] text-slate-400">
                  {billingCycle === "annual"
                    ? L("Annual add-on", "Add-on anual")
                    : L("Monthly add-on", "Add-on mensual")}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {!hasActivePlan ? (
                  <button
                    type="button"
                    onClick={() => setBrokerAddonSelected((prev) => !prev)}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                      brokerAddonSelected
                        ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                        : "border border-slate-700 text-slate-200 hover:border-emerald-400"
                    }`}
                  >
                    {brokerAddonSelected
                      ? L("Remove Broker Sync", "Quitar Broker Sync")
                      : L("Add Broker Sync", "Agregar Broker Sync")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAddonCheckout("broker_sync")}
                    disabled={isButtonDisabled || brokerAddonActive}
                    className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {brokerAddonActive
                      ? L("Already active", "Ya activo")
                      : L("Add Broker Sync", "Agregar Broker Sync")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => router.push("/import")}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-200"
                >
                  {L("Open Imports", "Abrir Importaciones")}
                </button>
              </div>
            </div>
          </div>

          {/* Manage subscription */}
          <div className="mt-8 border-t border-slate-800/80 pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {L("Subscription settings", "Ajustes de suscripción")}
                </p>
                <h2 className="text-lg font-semibold text-slate-100">
                  {L("Auto‑renew & cancellation", "Auto‑renovación y cancelación")}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {L(
                    "Control renewals, schedule cancellation, and tell us why you’re leaving.",
                    "Controla renovaciones, programa cancelación y dinos el motivo."
                  )}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
              {subscriptionLoading ? (
                <p className="text-xs text-slate-400">{L("Loading subscription…", "Cargando suscripción…")}</p>
              ) : !subscriptionInfo ? (
                <p className="text-xs text-slate-400">{L("No active subscription found.", "No hay suscripción activa.")}</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-200">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Status", "Estado")}</p>
                      <p className="mt-1 text-slate-100">{subscriptionInfo.status}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        {L("Next renewal", "Próxima renovación")}
                      </p>
                      <p className="mt-1 text-slate-100">{formatDate(subscriptionInfo.current_period_end)}</p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {subscriptionInfo.cancel_at_period_end
                          ? L("Auto‑renew is off", "La auto‑renovación está apagada")
                          : L("Auto‑renew is on", "La auto‑renovación está activa")}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{L("Plan", "Plan")}</p>
                      <p className="mt-1 text-slate-100">
                        {(subscriptionInfo.plan || currentPlan || "—").toUpperCase()}
                        {subscriptionInfo.billing_cycle ? ` · ${subscriptionInfo.billing_cycle}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-100 md:col-span-2">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">
                            {L("Payment method", "Método de pago")}
                          </p>
                          <p className="mt-2 text-sm font-semibold text-emerald-50">
                            {L("Need to replace your card?", "¿Necesitas cambiar tu tarjeta?")}
                          </p>
                          <p className="mt-1 text-[11px] text-emerald-100/80">
                            {L(
                              "Open the secure Stripe portal directly to update the card used for future NeuroTrader renewals.",
                              "Abre el portal seguro de Stripe directamente para actualizar la tarjeta usada en futuras renovaciones de NeuroTrader."
                            )}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleUpdatePaymentMethod}
                          className="rounded-xl bg-emerald-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-300"
                        >
                          {L("Update payment method", "Actualizar método de pago")}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">
                        {L("Before you cancel", "Antes de cancelar")}
                      </p>
                      <p className="mt-2">
                        {subscriptionInfo.cancel_at_period_end
                          ? L(
                              "Auto-renew is already off. No future charge is scheduled right now.",
                              "La auto-renovación ya está apagada. No hay un cargo futuro programado ahora mismo."
                            )
                          : L(
                              "If you cancel today, we stop the next renewal, not your current access.",
                              "Si cancelas hoy, detenemos la próxima renovación, no tu acceso actual."
                            )}
                      </p>
                      <p className="mt-2 text-amber-50">
                        {L("Your account stays active until", "Tu cuenta seguirá activa hasta")}{" "}
                        <strong>{formatDate(accessUntilDate)}</strong>.
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-slate-300">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        {L("Billing timing", "Calendario de cobro")}
                      </p>
                      <p className="mt-2">
                        {L("Next billing cycle date", "Próxima fecha del ciclo de pago")}:{" "}
                        <strong className="text-slate-100">{formatDate(nextBillingDate)}</strong>
                      </p>
                      <p className="mt-2 text-slate-400">
                        {L(
                          "Example: if you paid 3 days ago and cancel now, your membership still remains active until the next cycle date shown above.",
                          "Ejemplo: si pagaste hace 3 días y cancelas ahora, tu membresía seguirá activa hasta la próxima fecha de ciclo mostrada arriba."
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row md:items-start gap-3">
                    <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <p className="text-[11px] text-slate-400 mb-2">
                        {L("Auto‑renew", "Auto‑renovación")}
                      </p>
                      <button
                        type="button"
                        onClick={() => handleToggleAutoRenew(!autoRenewEnabled)}
                        disabled={cancelLoading}
                        className={`px-4 py-2 rounded-full text-xs font-semibold transition ${
                          autoRenewEnabled
                            ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                            : "border border-slate-700 text-slate-300 hover:border-emerald-400"
                        }`}
                      >
                        {autoRenewEnabled
                          ? L("Auto‑renew ON", "Auto‑renovación ON")
                          : L("Auto‑renew OFF", "Auto‑renovación OFF")}
                      </button>
                    </div>

                    <div className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
                      <p className="text-[11px] text-slate-400 mb-2">
                        {L(
                          "Open the cancellation flow to review billing rules, answer the exit survey, and confirm the end date of your access.",
                          "Abre el flujo de cancelación para revisar las reglas de billing, responder la encuesta de salida y confirmar la fecha final de tu acceso."
                        )}
                      </p>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300">
                        <p className="font-semibold text-slate-100">
                          {L("Cancellation flow includes", "El flujo de cancelación incluye")}
                        </p>
                        <ul className="mt-3 space-y-2 text-slate-400">
                          <li>{L("Your next billing cycle date before you confirm.", "Tu próxima fecha de ciclo de pago antes de confirmar.")}</li>
                          <li>{L("A rule reminder that access remains active until that date.", "Un recordatorio de que el acceso sigue activo hasta esa fecha.")}</li>
                          <li>{L("An exit survey plus a confirmation email after cancellation.", "Una encuesta de salida más un email de confirmación después de cancelar.")}</li>
                        </ul>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={openCancelModal}
                          disabled={subscriptionInfo.cancel_at_period_end}
                          className="rounded-xl bg-rose-500/80 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {subscriptionInfo.cancel_at_period_end
                            ? L("Cancellation scheduled", "Cancelación programada")
                            : L("Open cancellation flow", "Abrir flujo de cancelación")}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {subscriptionInfo.cancel_at_period_end && subscriptionInfo.current_period_end ? (
                      <span className="text-[11px] text-slate-400">
                        {L("Access until", "Acceso hasta")} {formatDate(subscriptionInfo.current_period_end)}
                      </span>
                    ) : null}
                    {cancelNotice ? (
                      <span className="text-[11px] text-slate-300">{cancelNotice}</span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {cancelModalOpen && subscriptionInfo ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-8 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-950 shadow-[0_30px_120px_rgba(15,23,42,0.85)]">
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    {L("Cancellation flow", "Flujo de cancelación")}
                  </p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-100">
                    {cancelFlowStep === 1
                      ? L("Step 1 · Tell us why you are leaving", "Paso 1 · Cuéntanos por qué te vas")
                      : L("Step 2 · Review the cancellation rules", "Paso 2 · Revisa las reglas de cancelación")}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeCancelModal}
                  disabled={cancelLoading}
                  className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100 disabled:opacity-50"
                >
                  {L("Close", "Cerrar")}
                </button>
              </div>

              <div className="px-6 py-5">
                <div className="mb-5 flex items-center gap-2 text-[11px] text-slate-400">
                  <span className={`h-2.5 w-2.5 rounded-full ${cancelFlowStep === 1 ? "bg-emerald-400" : "bg-emerald-400/50"}`} />
                  <span className="mr-2">{L("Survey", "Encuesta")}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${cancelFlowStep === 2 ? "bg-emerald-400" : "bg-slate-700"}`} />
                  <span>{L("Final review", "Revisión final")}</span>
                </div>

                {cancelFlowStep === 1 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-400">
                      {L(
                        "We are sorry to see you go. These answers help us improve the product and support future winback follow-up.",
                        "Lamentamos verte ir. Estas respuestas nos ayudan a mejorar el producto y respaldan futuros seguimientos de winback."
                      )}
                    </p>
                    <select
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    >
                      <option value="">{L("Select a reason", "Selecciona un motivo")}</option>
                      <option value="too_expensive">{L("Too expensive", "Muy caro")}</option>
                      <option value="not_using">{L("Not using enough", "No lo estoy usando")}</option>
                      <option value="missing_features">{L("Missing features", "Faltan features")}</option>
                      <option value="technical_issues">{L("Technical issues", "Problemas técnicos")}</option>
                      <option value="other">{L("Other", "Otro")}</option>
                    </select>
                    <select
                      value={cancelUsageStatus}
                      onChange={(e) => setCancelUsageStatus(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    >
                      <option value="">{L("How much did you use the platform?", "¿Cuánto usaste la plataforma?")}</option>
                      <option value="daily">{L("I used it daily", "La usé a diario")}</option>
                      <option value="weekly">{L("A few times per week", "Unas veces por semana")}</option>
                      <option value="occasionally">{L("Only occasionally", "Solo ocasionalmente")}</option>
                      <option value="barely_started">{L("I barely got started", "Casi no empecé")}</option>
                    </select>
                    <select
                      value={cancelImprovement}
                      onChange={(e) => setCancelImprovement(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    >
                      <option value="">{L("What was missing or hardest for you? (optional)", "¿Qué faltó o qué fue lo más difícil? (opcional)")}</option>
                      <option value="onboarding">{L("I needed better onboarding", "Necesitaba mejor onboarding")}</option>
                      <option value="analytics">{L("I needed clearer analytics", "Necesitaba analytics más claros")}</option>
                      <option value="ai_coaching">{L("I needed stronger AI coaching", "Necesitaba un AI coaching más fuerte")}</option>
                      <option value="journal_flow">{L("The journal workflow was too heavy", "El flujo del journal era muy pesado")}</option>
                      <option value="price_value">{L("The value did not justify the price", "El valor no justificó el precio")}</option>
                      <option value="other">{L("Other", "Otro")}</option>
                    </select>
                    <select
                      value={cancelReturnTrigger}
                      onChange={(e) => setCancelReturnTrigger(e.target.value)}
                      className="w-full rounded-md border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                    >
                      <option value="">{L("What would make you come back? (optional)", "¿Qué te haría volver? (opcional)")}</option>
                      <option value="lower_price">{L("A lower price", "Un precio más bajo")}</option>
                      <option value="better_support">{L("Better support / coaching", "Mejor soporte / coaching")}</option>
                      <option value="more_broker_sync">{L("More broker integrations", "Más integraciones de brokers")}</option>
                      <option value="more_ai">{L("A stronger AI workflow", "Un flujo de AI más fuerte")}</option>
                      <option value="not_sure">{L("I’m not sure yet", "Aún no estoy seguro")}</option>
                    </select>
                    <textarea
                      value={cancelDetail}
                      onChange={(e) => setCancelDetail(e.target.value)}
                      placeholder={L(
                        "Anything else you want us to know before you cancel?",
                        "¿Algo más que quieras contarnos antes de cancelar?"
                      )}
                      className="w-full rounded-md border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/60"
                      rows={4}
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleAdvanceCancelFlow}
                        className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-emerald-400 hover:text-emerald-200"
                      >
                        {L("Continue to final review", "Continuar a revisión final")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-amber-300/80">
                          {L("Next billing cycle", "Próximo ciclo de pago")}
                        </p>
                        <p className="mt-2 font-semibold">{formatDate(nextBillingDate)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-200">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                          {L("Access stays active until", "El acceso sigue activo hasta")}
                        </p>
                        <p className="mt-2 font-semibold">{formatDate(accessUntilDate)}</p>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                      <p className="font-semibold text-slate-100">
                        {L("Rules before you confirm", "Reglas antes de confirmar")}
                      </p>
                      <ul className="mt-3 space-y-2 text-slate-400">
                        <li>{L("Cancelling today stops the next renewal only.", "Cancelar hoy detiene solo la próxima renovación.")}</li>
                        <li>{L("Your membership remains active through the date shown above.", "Tu membresía sigue activa hasta la fecha mostrada arriba.")}</li>
                        <li>{L("This action does not issue an automatic refund.", "Esta acción no emite un reembolso automático.")}</li>
                        <li>{L("You will receive a confirmation email from NeuroTrader Journal.", "Recibirás un email de confirmación de NeuroTrader Journal.")}</li>
                      </ul>
                    </div>
                    <label className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-[12px] text-slate-300">
                      <input
                        type="checkbox"
                        checked={cancelAcknowledge}
                        onChange={(e) => setCancelAcknowledge(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-400 focus:ring-emerald-400"
                      />
                      <span>
                        {L(
                          "I understand my membership stays active until the next billing date shown above, even if I cancel today.",
                          "Entiendo que mi membresía seguirá activa hasta la próxima fecha de cobro mostrada arriba, aunque cancele hoy."
                        )}
                      </span>
                    </label>
                    <div className="flex flex-wrap justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setCancelFlowStep(1)}
                        className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500 hover:text-slate-100"
                      >
                        {L("Back to survey", "Volver a la encuesta")}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelSubscription}
                        disabled={cancelLoading || subscriptionInfo.cancel_at_period_end}
                        className="rounded-xl bg-rose-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {cancelLoading
                          ? L("Processing…", "Procesando…")
                          : L("Confirm cancellation", "Confirmar cancelación")}
                      </button>
                    </div>
                  </div>
                )}

                {cancelNotice ? <p className="mt-4 text-xs text-slate-300">{cancelNotice}</p> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
