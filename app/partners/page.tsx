"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, HandCoins, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import PublicHomeLogoLink from "@/app/components/PublicHomeLogoLink";

type PartnerProfile = {
  user_id: string;
  referral_code: string;
  legal_name: string;
  payout_preference: "credit" | "cash";
  payout_email: string | null;
  agreement_version: string;
  agreement_accepted: boolean;
  agreement_accepted_at: string | null;
  status: "active" | "paused";
  app_credit_balance: number;
  total_commissions_earned: number;
  total_commissions_paid: number;
  created_at: string;
  updated_at: string;
};

type CommissionRow = {
  id: string;
  plan_id: string | null;
  billing_cycle: "monthly" | "annual" | null;
  commission_rate: number;
  gross_amount: number;
  commission_amount: number;
  status: "pending" | "available" | "paid" | "reversed";
  available_on: string;
  created_at: string;
  description: string | null;
};

type PayoutRequestRow = {
  id: string;
  amount: number;
  payout_method: "cash" | "credit";
  status: "requested" | "processing" | "paid" | "rejected";
  requested_at: string;
  eligible_on: string | null;
  notes: string | null;
};

type PartnerDashboard = {
  totals: {
    pending: number;
    available: number;
    paid: number;
    reversed: number;
    total: number;
    reservedByRequests: number;
    availableToRequest: number;
  };
  commissions: CommissionRow[];
  payoutRequests: PayoutRequestRow[];
};

type PartnerMeResponse = {
  partner: PartnerProfile | null;
  dashboard: PartnerDashboard | null;
  referralLink?: string;
  error?: string;
};

function money(n: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, { style: "currency", currency: "USD" }).format(Number(n || 0));
}

function dt(iso: string | null | undefined, localeTag: string) {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleString(localeTag);
}

async function authFetch(url: string, init?: RequestInit) {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data?.session?.access_token;
  const headers = new Headers(init?.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(url, { ...init, headers });
}

export default function PartnersPage() {
  const { user, loading: authLoading } = useAuth() as any;
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const localeTag = isEs ? "es-ES" : "en-US";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [dashboard, setDashboard] = useState<PartnerDashboard | null>(null);
  const [referralLink, setReferralLink] = useState<string>("");

  const [legalName, setLegalName] = useState("");
  const [agreementName, setAgreementName] = useState("");
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [payoutPreference, setPayoutPreference] = useState<"credit" | "cash">("credit");
  const [payoutEmail, setPayoutEmail] = useState("");

  const [requestAmount, setRequestAmount] = useState("");
  const [requestMethod, setRequestMethod] = useState<"cash" | "credit">("cash");
  const [requestNotes, setRequestNotes] = useState("");

  async function loadPartner() {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    const res = await authFetch("/api/partners/me");
    const body = (await res.json().catch(() => ({}))) as PartnerMeResponse;
    if (!res.ok) {
      setError(body?.error || L("Could not load partner profile.", "No se pudo cargar el perfil partner."));
      setLoading(false);
      return;
    }

    setProfile(body.partner ?? null);
    setDashboard(body.dashboard ?? null);
    setReferralLink(body.referralLink || "");

    if (body.partner) {
      setLegalName(body.partner.legal_name || "");
      setAgreementName(body.partner.legal_name || "");
      setPayoutPreference(body.partner.payout_preference);
      setPayoutEmail(body.partner.payout_email || "");
      setRequestMethod(body.partner.payout_preference === "cash" ? "cash" : "credit");
      setAgreementAccepted(Boolean(body.partner.agreement_accepted));
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!authLoading && user?.id) {
      loadPartner().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.id]);

  const availableToRequest = Number(dashboard?.totals?.availableToRequest ?? 0);

  const cards = useMemo(
    () => [
      {
        label: L("Pending commissions", "Comisiones pendientes"),
        value: money(Number(dashboard?.totals?.pending ?? 0), localeTag),
      },
      {
        label: L("Available to request", "Disponible para solicitar"),
        value: money(availableToRequest, localeTag),
      },
      {
        label: L("Reserved by requests", "Reservado por solicitudes"),
        value: money(Number(dashboard?.totals?.reservedByRequests ?? 0), localeTag),
      },
      {
        label: L("App credit balance", "Balance de crédito"),
        value: money(Number(profile?.app_credit_balance ?? 0), localeTag),
      },
    ],
    [L, localeTag, dashboard?.totals?.pending, dashboard?.totals?.reservedByRequests, availableToRequest, profile?.app_credit_balance]
  );

  async function handleJoinPartner() {
    if (!user?.id) return;
    setSaving(true);
    setError(null);
    setNotice(null);

    const payload = {
      legalName,
      agreementName,
      agreementAccepted,
      payoutPreference,
      payoutEmail,
    };

    const res = await authFetch("/api/partners/me", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as PartnerMeResponse;
    if (!res.ok) {
      setSaving(false);
      setError(body?.error || L("Could not activate partner profile.", "No se pudo activar el perfil partner."));
      return;
    }

    setNotice(L("Partner profile linked successfully.", "Perfil partner enlazado correctamente."));
    setSaving(false);
    await loadPartner();
  }

  async function handleRequestPayout() {
    if (!user?.id) return;
    const amount = Number(requestAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(L("Enter a valid amount.", "Ingresa un monto válido."));
      return;
    }

    setRequesting(true);
    setError(null);
    setNotice(null);

    const res = await authFetch("/api/partners/payout-request", {
      method: "POST",
      body: JSON.stringify({
        amount,
        payoutMethod: requestMethod,
        notes: requestNotes,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRequesting(false);
      setError(body?.error || L("Could not create payout request.", "No se pudo crear la solicitud."));
      return;
    }

    setNotice(
      requestMethod === "cash"
        ? L(
            "Cash request submitted. Settlement follows partner payout terms.",
            "Solicitud de cash enviada. El pago sigue los términos del partner."
          )
        : L("Credit applied to your partner balance.", "Crédito aplicado a tu balance partner.")
    );
    setRequestAmount("");
    setRequestNotes("");
    setRequesting(false);
    await loadPartner();
  }

  function copyReferralLink() {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).catch(() => undefined);
    setNotice(L("Referral link copied.", "Enlace copiado."));
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="fixed left-6 top-10 z-20 hidden xl:block">
        <PublicHomeLogoLink size="lg" showLabel={false} />
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-4 xl:hidden">
          <PublicHomeLogoLink size="md" showLabel={false} />
        </div>

        <header className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 md:p-8">
          <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300/90">
            {L("Partner Program", "Programa Partner")}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {L("Partner login & commission dashboard", "Partner login y dashboard de comisiones")}
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300">
            {L(
              "Share NeuroTrader Journal, track your referrals, and manage payout requests in one place.",
              "Comparte NeuroTrader Journal, monitorea tus referidos y gestiona solicitudes de pago en un solo lugar."
            )}
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm">
              <p className="font-semibold text-emerald-300">30%</p>
              <p className="text-slate-300">{L("Annual plan (first year total)", "Plan anual (total del primer año)")}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm">
              <p className="font-semibold text-sky-300">20%</p>
              <p className="text-slate-300">{L("Monthly plan (each paid month)", "Plan mensual (cada mes pagado)")}</p>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm">
              <p className="font-semibold text-violet-300">{L("Cash or app credit", "Cash o crédito")}</p>
              <p className="text-slate-300">{L("Cash requests follow payout windows.", "Solicitudes cash siguen ventana de pago.")}</p>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>
        ) : null}
        {notice ? (
          <div className="mt-5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {notice}
          </div>
        ) : null}

        {!user ? (
          <section className="mt-6 grid gap-5 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="text-xl font-semibold">{L("How it works", "Cómo funciona")}</h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <Users size={16} className="mt-0.5 text-emerald-300" />
                  <span>{L("Use your referral link to invite new traders.", "Usa tu enlace de referido para invitar nuevos traders.")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <HandCoins size={16} className="mt-0.5 text-sky-300" />
                  <span>{L("Track commissions by plan and billing cycle.", "Monitorea comisiones por plan y ciclo de facturación.")}</span>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck size={16} className="mt-0.5 text-violet-300" />
                  <span>{L("Accept partner terms and sign agreement to activate.", "Acepta términos partner y firma agreement para activar.")}</span>
                </li>
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/signin"
                  className="rounded-xl border border-emerald-400 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/10 transition"
                >
                  {L("Sign in to partner dashboard", "Inicia sesión para partner dashboard")}
                </Link>
                <Link
                  href="/signup?plan=core"
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-sky-400 hover:text-sky-300 transition"
                >
                  {L("Create account", "Crear cuenta")}
                </Link>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">{L("Partner terms", "Términos partner")}</h3>
              <p className="mt-3 text-sm text-slate-300">
                {L(
                  "Before activation you must read the partner agreement, accept terms, and sign with your legal name.",
                  "Antes de activar debes leer el acuerdo partner, aceptar términos y firmar con tu nombre legal."
                )}
              </p>
              <Link
                href="/partners/terms"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-300 transition"
              >
                {L("Read partner terms", "Leer términos partner")}
                <ExternalLink size={14} />
              </Link>
            </div>
          </section>
        ) : (
          <section className="mt-6 grid gap-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                    {L("Partner access", "Acceso partner")}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">
                    {profile ? L("Partner dashboard", "Dashboard partner") : L("Link your account as partner", "Enlaza tu cuenta como partner")}
                  </h2>
                </div>
                {profile ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                    <CheckCircle2 size={14} />
                    {L("Partner active", "Partner activo")}
                  </span>
                ) : null}
              </div>

              {!profile ? (
                <div className="mt-5 grid gap-5 lg:grid-cols-[1fr,1fr]">
                  <div className="space-y-3">
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-400">{L("Legal name", "Nombre legal")}</span>
                      <input
                        value={legalName}
                        onChange={(e) => setLegalName(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                        placeholder={L("Your legal full name", "Tu nombre legal completo")}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-400">{L("Payout preference", "Preferencia de pago")}</span>
                      <select
                        value={payoutPreference}
                        onChange={(e) => setPayoutPreference(e.target.value === "cash" ? "cash" : "credit")}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                      >
                        <option value="credit">{L("App credit", "Crédito en app")}</option>
                        <option value="cash">{L("Cash payout", "Pago cash")}</option>
                      </select>
                    </label>

                    {payoutPreference === "cash" ? (
                      <label className="block">
                        <span className="mb-1 block text-xs text-slate-400">{L("Payout email", "Email de pago")}</span>
                        <input
                          value={payoutEmail}
                          onChange={(e) => setPayoutEmail(e.target.value)}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                          placeholder="you@email.com"
                        />
                      </label>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                    <p className="text-xs font-semibold text-slate-200">{L("Partner agreement (required)", "Agreement partner (requerido)")}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      {L(
                        "I confirm I read the partner terms, understand the 30%/20% commission model, and agree payout requests are processed under partner policy.",
                        "Confirmo que leí los términos partner, entiendo el modelo 30%/20% y acepto que las solicitudes de pago se procesan bajo la política partner."
                      )}
                    </p>
                    <Link href="/partners/terms" className="mt-3 inline-block text-xs text-emerald-300 hover:text-emerald-200">
                      {L("Open terms & agreement", "Abrir términos y agreement")} →
                    </Link>

                    <label className="mt-4 block">
                      <span className="mb-1 block text-xs text-slate-400">{L("Type your name to sign", "Escribe tu nombre para firmar")}</span>
                      <input
                        value={agreementName}
                        onChange={(e) => setAgreementName(e.target.value)}
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                        placeholder={L("Your legal name", "Tu nombre legal")}
                      />
                    </label>

                    <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={agreementAccepted}
                        onChange={(e) => setAgreementAccepted(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-400"
                      />
                      {L("I have read and accept the partner agreement.", "Leí y acepto el acuerdo partner.")}
                    </label>

                    <button
                      type="button"
                      onClick={handleJoinPartner}
                      disabled={saving || loading}
                      className="mt-4 w-full rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? L("Linking…", "Enlazando…") : L("Link account as partner", "Enlazar cuenta como partner")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-5 grid gap-6">
                  <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{L("Referral link", "Enlace de referido")}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <code className="max-w-full overflow-auto rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200">
                        {referralLink || "—"}
                      </code>
                      <button
                        type="button"
                        onClick={copyReferralLink}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200 hover:border-emerald-400 hover:text-emerald-300"
                      >
                        <Copy size={13} />
                        {L("Copy", "Copiar")}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {L("Code:", "Código:")} <span className="font-semibold text-slate-200">{profile.referral_code}</span>
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-4">
                    {cards.map((card) => (
                      <div key={card.label} className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">{card.label}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-100">{card.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                    <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                      <h3 className="text-sm font-semibold">{L("Recent commissions", "Comisiones recientes")}</h3>
                      <div className="mt-3 overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-slate-400">
                              <th className="px-2 py-2 text-left">{L("Date", "Fecha")}</th>
                              <th className="px-2 py-2 text-left">{L("Plan", "Plan")}</th>
                              <th className="px-2 py-2 text-left">{L("Cycle", "Ciclo")}</th>
                              <th className="px-2 py-2 text-left">{L("Rate", "Rate")}</th>
                              <th className="px-2 py-2 text-left">{L("Commission", "Comisión")}</th>
                              <th className="px-2 py-2 text-left">{L("Status", "Estado")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dashboard?.commissions ?? []).length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-2 py-3 text-slate-500">
                                  {L("No commissions yet.", "Aún no hay comisiones.")}
                                </td>
                              </tr>
                            ) : (
                              (dashboard?.commissions ?? []).map((row) => (
                                <tr key={row.id} className="border-t border-slate-800 text-slate-200">
                                  <td className="px-2 py-2">{dt(row.created_at, localeTag)}</td>
                                  <td className="px-2 py-2">{row.plan_id || "—"}</td>
                                  <td className="px-2 py-2">{row.billing_cycle || "—"}</td>
                                  <td className="px-2 py-2">{row.commission_rate}%</td>
                                  <td className="px-2 py-2">{money(row.commission_amount, localeTag)}</td>
                                  <td className="px-2 py-2">{row.status}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-700 bg-slate-950/70 p-4">
                      <h3 className="text-sm font-semibold">{L("Request payout", "Solicitar pago")}</h3>
                      <p className="mt-2 text-xs text-slate-400">
                        {L(
                          "Cash requests follow partner payout policy. Credit requests are applied to your app balance.",
                          "Las solicitudes cash siguen la política partner. Solicitudes de crédito se aplican al balance de la app."
                        )}
                      </p>
                      <p className="mt-2 text-xs text-slate-300">
                        {L("Available now:", "Disponible ahora:")}{" "}
                        <span className="font-semibold text-emerald-300">{money(availableToRequest, localeTag)}</span>
                      </p>

                      <div className="mt-3 space-y-3">
                        <label className="block">
                          <span className="mb-1 block text-xs text-slate-400">{L("Method", "Método")}</span>
                          <select
                            value={requestMethod}
                            onChange={(e) => setRequestMethod(e.target.value === "credit" ? "credit" : "cash")}
                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                          >
                            <option value="cash">{L("Cash", "Cash")}</option>
                            <option value="credit">{L("App credit", "Crédito app")}</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs text-slate-400">{L("Amount (USD)", "Monto (USD)")}</span>
                          <input
                            value={requestAmount}
                            onChange={(e) => setRequestAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs text-slate-400">{L("Notes (optional)", "Notas (opcional)")}</span>
                          <textarea
                            value={requestNotes}
                            onChange={(e) => setRequestNotes(e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={requesting || loading || availableToRequest <= 0}
                          onClick={handleRequestPayout}
                          className="w-full rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {requesting ? L("Submitting…", "Enviando…") : L("Submit request", "Enviar solicitud")}
                        </button>
                      </div>

                      <div className="mt-4 border-t border-slate-800 pt-3">
                        <p className="text-xs font-semibold text-slate-300">{L("Recent requests", "Solicitudes recientes")}</p>
                        <ul className="mt-2 space-y-2 text-xs text-slate-300">
                          {(dashboard?.payoutRequests ?? []).slice(0, 5).map((r) => (
                            <li key={r.id} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <span>{money(r.amount, localeTag)}</span>
                                <span className="text-slate-400">{r.status}</span>
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {dt(r.requested_at, localeTag)}
                              </div>
                            </li>
                          ))}
                          {(dashboard?.payoutRequests ?? []).length === 0 ? (
                            <li className="text-slate-500">{L("No requests yet.", "Aún no hay solicitudes.")}</li>
                          ) : null}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
