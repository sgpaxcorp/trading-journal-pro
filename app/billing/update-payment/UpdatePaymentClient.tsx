"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { supabaseBrowser } from "@/lib/supaBaseClient";

export default function UpdatePaymentClient() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  async function openPaymentMethodPortal() {
    try {
      setOpening(true);
      setError(null);

      const { data: sessionData } = await supabaseBrowser.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        router.replace(`/signin?next=${encodeURIComponent("/billing/update-payment")}`);
        return;
      }

      const res = await fetch("/api/stripe/billing-portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ flow: "payment_method_update" }),
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
      router.replace(`/signin?next=${encodeURIComponent("/billing/update-payment")}`);
      return;
    }
    void openPaymentMethodPortal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user?.id]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-[0_30px_110px_rgba(16,185,129,0.25)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-300">
          {L("Billing", "Facturación")}
        </p>
        <h1 className="mt-3 text-2xl font-bold text-slate-50">
          {L("Opening payment method update", "Abriendo cambio de método de pago")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {L(
            "We are sending you to the secure Stripe billing portal to replace or update your card.",
            "Te estamos enviando al portal seguro de Stripe para reemplazar o actualizar tu tarjeta."
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
            onClick={openPaymentMethodPortal}
            disabled={opening || loading}
            className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {L("Open secure portal", "Abrir portal seguro")}
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
