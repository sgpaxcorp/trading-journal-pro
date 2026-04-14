"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function ForgotAccountPage() {
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/account-recovery/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(body?.error ?? L("Could not send the recovery email.", "No se pudo enviar el email de recuperación.")));
        return;
      }
      setMessage(
        L(
          "If that account exists, we just sent a recovery email with your sign-in details and a reset shortcut.",
          "Si esa cuenta existe, acabamos de enviar un email de recuperación con tus datos de acceso y un acceso rápido para resetear la contraseña."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">{L("Account recovery", "Recuperación de cuenta")}</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-50">{L("Forgot your sign-in email?", "¿Olvidaste tu email de acceso?")}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-400">
          {L(
            "Enter the email address you believe is tied to the account. We’ll send a branded recovery email that reminds the user of the sign-in email and includes a password reset shortcut.",
            "Ingresa el email que crees que está vinculado a la cuenta. Enviaremos un email de recuperación con el recordatorio del email de acceso y un acceso rápido para resetear la contraseña."
          )}
        </p>

        {error ? <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {message ? <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("Email address", "Correo electrónico")}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            {loading ? L("Sending…", "Enviando…") : L("Send recovery email", "Enviar email de recuperación")}
          </button>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <Link href="/signin" className="text-slate-300 hover:text-white">{L("Back to sign in", "Volver a sign in")}</Link>
          <Link href="/forgot-password" className="text-emerald-300 hover:text-emerald-200">{L("Need a password reset instead?", "¿Necesitas resetear la contraseña?")}</Link>
        </div>
      </div>
    </main>
  );
}
