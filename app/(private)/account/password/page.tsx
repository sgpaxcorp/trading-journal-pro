// app/account/password/page.tsx
"use client";

import { useState, type FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

export default function ChangePasswordPage() {
  const { user, loading } = useAuth() as any;
  const router = useRouter();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showInRanking, setShowInRanking] = useState(true);
  const [privacySaving, setPrivacySaving] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState<string | null>(null);
  const [privacyError, setPrivacyError] = useState<string | null>(null);

  /* ---------- Auth guard ---------- */
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    async function loadPrivacy() {
      setPrivacyError(null);
      try {
        const { data, error: prefError } = await supabaseBrowser
          .from("profiles")
          .select("show_in_ranking")
          .eq("id", user.id)
          .maybeSingle();

        if (prefError) throw prefError;
        if (!cancelled && data && typeof (data as any).show_in_ranking === "boolean") {
          setShowInRanking(Boolean((data as any).show_in_ranking));
        }
      } catch (err) {
        console.warn("[Security] Unable to load ranking preference:", err);
      }
    }

    loadPrivacy();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!user) return;

    if (!currentPassword) {
      setError(L("Please enter your current password.", "Ingresa tu contraseña actual."));
      return;
    }

    if (newPassword.length < 8) {
      setError(L("New password must be at least 8 characters.", "La nueva contraseña debe tener al menos 8 caracteres."));
      return;
    }

    if (newPassword !== confirm) {
      setError(L("New password and confirmation do not match.", "La nueva contraseña y la confirmación no coinciden."));
      return;
    }

    setSaving(true);
    try {
      const email = user.email as string | undefined;
      if (!email) {
        setError(
          L(
            "We couldn't find your email. Please sign out and sign in again.",
            "No encontramos tu correo. Cierra sesión e inicia de nuevo."
          )
        );
        return;
      }

      // 1) Verificar contraseña actual
      const { error: signInError } = await supabaseBrowser.auth.signInWithPassword(
        {
          email,
          password: currentPassword,
        }
      );

      if (signInError) {
        console.error("[ChangePassword] Wrong current password:", signInError);
        setError(L("Current password is incorrect.", "La contraseña actual es incorrecta."));
        return;
      }

      // 2) Actualizar a la nueva contraseña
      const { error: updateError } = await supabaseBrowser.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error("[ChangePassword] Error updating password:", updateError);
        setError(updateError.message || L("We couldn't update your password.", "No pudimos actualizar tu contraseña."));
        return;
      }

      setMessage(L("Your password has been updated successfully.", "Tu contraseña se actualizó correctamente."));
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err: any) {
      console.error("[ChangePassword] Unexpected error:", err);
      setError(err.message || L("Something went wrong while updating your password.", "Algo salió mal al actualizar tu contraseña."));
    } finally {
      setSaving(false);
    }
  }

  async function handleRankingToggle(next: boolean) {
    if (!user?.id) return;
    setPrivacySaving(true);
    setPrivacyMessage(null);
    setPrivacyError(null);
    try {
      const { error: prefError } = await supabaseBrowser
        .from("profiles")
        .update({ show_in_ranking: next })
        .eq("id", user.id);
      if (prefError) throw prefError;
      setShowInRanking(next);
      setPrivacyMessage(
        next
          ? L("You're now visible in the global ranking.", "Ahora eres visible en el ranking global.")
          : L("You’ve been hidden from the global ranking.", "Te hemos ocultado del ranking global.")
      );
    } catch (err: any) {
      console.error("[Security] Ranking visibility update error:", err);
      setPrivacyError(
        err?.message ||
          L("We couldn't update this setting.", "No pudimos actualizar este ajuste.")
      );
    } finally {
      setPrivacySaving(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">{L("Loading…", "Cargando…")}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="max-w-xl mx-auto px-6 md:px-8 py-8 space-y-6">
        <header>
          <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
            {L("Security", "Seguridad")}
          </p>
          <h1 className="text-3xl font-semibold mt-1">{L("Change password", "Cambiar contraseña")}</h1>
          <p className="text-sm text-slate-400 mt-2">
            {L(
              "Use a strong password that you don't reuse in other apps.",
              "Usa una contraseña fuerte que no reutilices en otras apps."
            )}
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                {L("Current password", "Contraseña actual")}
              </label>
              <input
                required
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                {L("New password", "Nueva contraseña")}
              </label>
              <input
                required
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                {L("Confirm new password", "Confirmar nueva contraseña")}
              </label>
              <input
                required
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              />
            </div>

            <p className="text-[10px] text-slate-500">
              {L(
                "We'll verify your current password and then update it securely using Supabase Auth. If you forgot your password, use the \"Forgot password?\" link on the sign in page instead.",
                "Verificaremos tu contraseña actual y luego la actualizaremos de forma segura con Supabase Auth. Si olvidaste tu contraseña, usa el enlace \"¿Olvidaste tu contraseña?\" en la página de inicio de sesión."
              )}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 mt-2">
              <span className="text-[11px] text-slate-500">
                {L("You'll use this password the next time you log in.", "Usarás esta contraseña la próxima vez que inicies sesión.")}
              </span>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition disabled:opacity-60"
              >
                {saving ? L("Updating…", "Actualizando…") : L("Update password", "Actualizar contraseña")}
              </button>
            </div>

            {message && (
              <p className="text-[11px] text-emerald-300 mt-2">{message}</p>
            )}
            {error && (
              <p className="text-[11px] text-red-400 mt-2">{error}</p>
            )}
          </form>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
              {L("Privacy", "Privacidad")}
            </p>
            <h2 className="text-lg font-semibold mt-1">
              {L("Global ranking visibility", "Visibilidad en ranking global")}
            </h2>
            <p className="text-xs text-slate-400 mt-2">
              {L(
                "Choose whether your profile appears in the public global ranking.",
                "Elige si tu perfil aparece en el ranking global público."
              )}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-100">
                {showInRanking ? L("Visible in ranking", "Visible en ranking") : L("Hidden from ranking", "Oculto del ranking")}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {L(
                  "This only affects your public ranking profile. Your private stats are always safe.",
                  "Esto solo afecta tu perfil público en el ranking. Tus estadísticas privadas siempre están seguras."
                )}
              </p>
            </div>

            <button
              type="button"
              disabled={privacySaving}
              onClick={() => handleRankingToggle(!showInRanking)}
              className={`rounded-full px-4 py-2 text-[11px] font-semibold transition ${
                showInRanking
                  ? "bg-emerald-400 text-slate-950 hover:bg-emerald-300"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700"
              } ${privacySaving ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              {showInRanking ? L("Hide me", "Ocultarme") : L("Show me", "Mostrarme")}
            </button>
          </div>

          {privacyMessage && (
            <p className="text-[11px] text-emerald-300">{privacyMessage}</p>
          )}
          {privacyError && (
            <p className="text-[11px] text-red-400">{privacyError}</p>
          )}
        </section>
      </div>
    </main>
  );
}
