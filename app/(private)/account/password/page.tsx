// app/account/password/page.tsx
"use client";

import { useState, type FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";
import { supabaseBrowser } from "@/lib/supaBaseClient";

export default function ChangePasswordPage() {
  const { user, loading } = useAuth() as any;
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ---------- Auth guard ---------- */
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/signin");
    }
  }, [loading, user, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!user) return;

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSaving(true);
    try {
      const email = user.email as string | undefined;
      if (!email) {
        setError("We couldn't find your email. Please sign out and sign in again.");
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
        setError("Current password is incorrect.");
        return;
      }

      // 2) Actualizar a la nueva contraseña
      const { error: updateError } = await supabaseBrowser.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error("[ChangePassword] Error updating password:", updateError);
        setError(updateError.message || "We couldn't update your password.");
        return;
      }

      setMessage("Your password has been updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err: any) {
      console.error("[ChangePassword] Unexpected error:", err);
      setError(err.message || "Something went wrong while updating your password.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <TopNav />

      <div className="max-w-xl mx-auto px-6 md:px-8 py-8 space-y-6">
        <header>
          <p className="text-[11px] uppercase tracking-[0.25em] text-emerald-400">
            Security
          </p>
          <h1 className="text-3xl font-semibold mt-1">Change password</h1>
          <p className="text-sm text-slate-400 mt-2">
            Use a strong password that you don&apos;t reuse in other apps.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Current password
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
                New password
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
                Confirm new password
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
              We&apos;ll verify your current password and then update it securely
              using Supabase Auth. If you forgot your password, use the
              &quot;Forgot password?&quot; link on the sign in page instead.
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 mt-2">
              <span className="text-[11px] text-slate-500">
                You&apos;ll use this password the next time you log in.
              </span>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition disabled:opacity-60"
              >
                {saving ? "Updating…" : "Update password"}
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
      </div>
    </main>
  );
}
