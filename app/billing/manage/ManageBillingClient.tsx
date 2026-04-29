"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

export default function ManageBillingClient() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  async function openBillingPortal() {
    try {
      setOpening(true);
      setError(null);

      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        router.replace(`/signin?next=${encodeURIComponent("/billing/manage")}`);
        return;
      }

      const res = await fetch("/api/stripe/billing-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ flow: "portal" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open billing portal.");
      if (!data.url) throw new Error("Missing billing portal URL.");

      window.location.href = data.url as string;
    } catch (err) {
      setOpening(false);
      setError(
        err instanceof Error
          ? err.message
          : L("Could not open billing portal.", "No se pudo abrir el portal de facturación.")
      );
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/signin?next=${encodeURIComponent("/billing/manage")}`);
      return;
    }
    void openBillingPortal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-[0_30px_110px_rgba(16,185,129,0.25)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
          {L("Billing", "Facturación")}
        </p>
        <h1 className="mt-3 text-2xl font-bold text-slate-50">
          {L("Opening billing portal", "Abriendo portal de facturación")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {L(
            "We are sending you to the secure billing portal to manage invoices, payment methods, and subscription settings.",
            "Te estamos enviando al portal seguro de facturación para administrar invoices, métodos de pago y ajustes de suscripción."
          )}
        </p>

        <div className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          {opening || loading
            ? L("One moment. Preparing your secure billing session...", "Un momento. Preparando tu sesión segura de facturación...")
            : L("If the portal did not open, try again below.", "Si el portal no abrió, intenta de nuevo abajo.")}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={openBillingPortal}
            disabled={opening || loading}
            className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {L("Open billing portal", "Abrir portal de facturación")}
          </button>
          <button
            type="button"
            onClick={() => router.push("/billing")}
            className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
          >
            {L("Back to billing", "Volver a facturación")}
          </button>
        </div>
      </div>
    </main>
  );
}
