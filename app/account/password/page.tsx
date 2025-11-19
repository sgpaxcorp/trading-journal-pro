// app/account/password/page.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import TopNav from "@/app/components/TopNav";
import { useAuth } from "@/context/AuthContext";

export default function ChangePasswordPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!loading && !user) {
    router.replace("/signin");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSaving(true);
    try {
      // En producción: llamada real a backend (API /auth/change-password)
      // await fetch("/api/account/password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) })
      await new Promise((res) => setTimeout(res, 600)); // mock
      setMessage("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSaving(false);
    }
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
              In producción real, aquí se haría la verificación usando un
              backend seguro (hash de contraseñas, etc.).
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
