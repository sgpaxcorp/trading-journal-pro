"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function ResetPasswordClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const previewMode = searchParams.get("preview") === "1";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(!previewMode);
  const [hasSession, setHasSession] = useState(previewMode);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (previewMode) return;
    let cancelled = false;

    async function resolveRecoverySession() {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data } = await supabaseBrowser.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setHasSession(true);
          setChecking(false);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      if (!cancelled) {
        setHasSession(false);
        setChecking(false);
      }
    }

    void resolveRecoverySession();

    const { data: sub } = supabaseBrowser.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(true);
        setChecking(false);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [previewMode]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError(L("Password must be at least 8 characters.", "La contraseña debe tener al menos 8 caracteres."));
      return;
    }
    if (password !== confirm) {
      setError(L("Passwords do not match.", "Las contraseñas no coinciden."));
      return;
    }

    if (previewMode) {
      setMessage(L("Preview mode only. No password was changed.", "Solo modo preview. No se cambió ninguna contraseña."));
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabaseBrowser.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setMessage(L("Password updated successfully. Redirecting to sign in…", "Contraseña actualizada correctamente. Redirigiendo a sign in…"));
      setTimeout(() => router.replace("/signin"), 1200);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-50">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/50 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-300">{L("Authentication", "Autenticación")}</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-50">{L("Choose a new password", "Elige una nueva contraseña")}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-400">
          {previewMode
            ? L(
                "This preview route is used by admin test emails. It shows the exact destination page users receive, without changing any real password.",
                "Esta ruta de preview se usa en los emails de prueba del admin. Muestra la página exacta que reciben los usuarios, sin cambiar ninguna contraseña real."
              )
            : L(
                "Open the reset email from the same browser, then choose a new password for your NeuroTrader Journal account.",
                "Abre el email de reset desde este mismo navegador y luego elige una nueva contraseña para tu cuenta de NeuroTrader Journal."
              )}
        </p>

        {checking ? <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">{L("Validating your recovery session…", "Validando tu sesión de recuperación…")}</div> : null}
        {!previewMode && !checking && !hasSession ? (
          <div className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {L(
              "We could not validate the reset session in this browser. Request a new password reset email and open the link again from the same device.",
              "No pudimos validar la sesión de reset en este navegador. Solicita un nuevo email de reset y abre el enlace nuevamente desde este mismo dispositivo."
            )}
          </div>
        ) : null}
        {error ? <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {message ? <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("New password", "Nueva contraseña")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
              autoComplete="new-password"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-xs text-slate-400">{L("Confirm new password", "Confirmar nueva contraseña")}</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-400"
              autoComplete="new-password"
            />
          </label>

          <button
            type="submit"
            disabled={loading || (!previewMode && !hasSession) || checking}
            className="w-full rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
          >
            {loading ? L("Updating…", "Actualizando…") : L("Save new password", "Guardar nueva contraseña")}
          </button>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <Link href="/signin" className="text-slate-300 hover:text-white">{L("Back to sign in", "Volver a sign in")}</Link>
          <Link href="/forgot-password" className="text-emerald-300 hover:text-emerald-200">{L("Request another reset email", "Solicitar otro email de reset")}</Link>
        </div>
      </div>
    </main>
  );
}
