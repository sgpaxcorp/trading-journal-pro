"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  FREE_TRIAL_DAYS,
} from "@/lib/legalConsent";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type LegalAcceptanceGateProps = {
  enabled: boolean;
};

export default function LegalAcceptanceGate({ enabled }: LegalAcceptanceGateProps) {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [checking, setChecking] = useState(false);
  const [requiresAcceptance, setRequiresAcceptance] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) {
      setRequiresAcceptance(false);
      return;
    }

    let active = true;
    async function loadAcceptanceStatus() {
      setChecking(true);
      try {
        const { data } = await supabaseBrowser.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;

        const res = await fetch("/api/legal/acceptance", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          console.warn("[LegalAcceptanceGate] Could not verify legal acceptance:", body);
          setRequiresAcceptance(false);
          return;
        }
        setRequiresAcceptance(Boolean(body?.requiresAcceptance));
      } catch (err) {
        console.warn("[LegalAcceptanceGate] Acceptance status failed:", err);
        if (active) setRequiresAcceptance(false);
      } finally {
        if (active) setChecking(false);
      }
    }

    loadAcceptanceStatus();
    return () => {
      active = false;
    };
  }, [enabled]);

  async function handleAccept() {
    if (!accepted || saving) return;
    setError("");
    setSaving(true);
    try {
      const { data } = await supabaseBrowser.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        throw new Error(L("Session not available. Please sign in again.", "Sesión no disponible. Inicia sesión nuevamente."));
      }
      const res = await fetch("/api/legal/acceptance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          legalAccepted: true,
          termsVersion: CURRENT_TERMS_VERSION,
          privacyVersion: CURRENT_PRIVACY_VERSION,
          source: "in_app_update",
          location: "workspace_gate",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || L("Could not record acceptance.", "No se pudo guardar la aceptación."));
      }
      setRequiresAcceptance(false);
    } catch (err: any) {
      setError(err?.message || L("Could not record acceptance.", "No se pudo guardar la aceptación."));
    } finally {
      setSaving(false);
    }
  }

  if (!enabled || checking || !requiresAcceptance) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/88 px-4 text-slate-50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-emerald-400/40 bg-slate-900 p-6 shadow-[0_0_80px_rgba(16,185,129,0.25)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
          {L("Account terms update", "Actualización de términos")}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-50">
          {L("Review and accept to continue", "Revisa y acepta para continuar")}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          {L(
            `NeuroTrader updated its Terms & Conditions and Privacy Policy. The service remains educational only. AI coaching, analytics, simulations, projections, and reports do not provide financial advice or guarantee trading, income, projection, or capital results. Eligible new accounts may start with a ${FREE_TRIAL_DAYS}-day trial; paid periods are prepaid and non-refundable except where required by law.`,
            `NeuroTrader actualizó sus Términos y Condiciones y Política de Privacidad. El servicio sigue siendo educativo solamente. El AI coaching, analítica, simulaciones, proyecciones y reportes no proveen asesoría financiera ni garantizan resultados de trading, ingresos, proyecciones o capital. Cuentas nuevas elegibles pueden comenzar con trial de ${FREE_TRIAL_DAYS} días; los periodos pagados son prepagados y no reembolsables salvo que la ley exija lo contrario.`
          )}
        </p>

        <div className="mt-4 flex flex-wrap gap-3 text-[11px]">
          <Link href="/terms" target="_blank" rel="noreferrer" className="rounded-full border border-slate-700 px-3 py-1 text-emerald-200 hover:border-emerald-400">
            {L("Read Terms", "Leer términos")}
          </Link>
          <Link href="/privacy" target="_blank" rel="noreferrer" className="rounded-full border border-slate-700 px-3 py-1 text-emerald-200 hover:border-emerald-400">
            {L("Read Privacy", "Leer privacidad")}
          </Link>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-[11px] leading-relaxed text-slate-300">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-400 accent-emerald-400"
          />
          <span>
            {L(
              "I accept the current Terms & Conditions and Privacy Policy and understand the educational-use, no-financial-advice, no-guaranteed-results, auto-renewal, prepaid, and no-refund disclosures.",
              "Acepto los Términos y Condiciones y la Política de Privacidad vigentes y entiendo las divulgaciones de uso educativo, sin asesoría financiera, sin resultados garantizados, renovación automática, prepago y no reembolso."
            )}
          </span>
        </label>

        {error ? <p className="mt-3 text-[11px] text-red-300">{error}</p> : null}

        <button
          type="button"
          onClick={handleAccept}
          disabled={!accepted || saving}
          className="mt-5 w-full rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? L("Saving acceptance...", "Guardando aceptación...") : L("Accept and continue", "Aceptar y continuar")}
        </button>
      </div>
    </div>
  );
}
