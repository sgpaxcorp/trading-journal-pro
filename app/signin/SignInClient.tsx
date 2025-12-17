// app/signin/SignInClient.tsx
"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supaBaseClient";

type SignInClientProps = {
  nextPath: string;
};

function safeInternalPath(maybePath: string | undefined | null) {
  if (!maybePath) return "/dashboard";
  if (typeof maybePath !== "string") return "/dashboard";
  // Solo rutas internas
  if (!maybePath.startsWith("/")) return "/dashboard";
  // Evita esquemas raros tipo //evil.com
  if (maybePath.startsWith("//")) return "/dashboard";
  return maybePath;
}

export default function SignInClient({ nextPath }: SignInClientProps) {
  const router = useRouter();

  const safeNext = useMemo(() => safeInternalPath(nextPath), [nextPath]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);

    const cleanEmail = email.trim().toLowerCase();

    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Importantísimo en App Router:
      // fuerza a que Server Components lean la nueva sesión (cookies).
      router.refresh();

      router.replace(safeNext);
    } catch (err: any) {
      console.error("Error on sign in:", err);
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <h1 className="text-xl font-semibold mb-2">Log in</h1>
        <p className="text-xs text-slate-400 mb-4">
          Enter your credentials to access your trading journal.
        </p>

        {error && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block mb-1 text-slate-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-xs outline-none focus:border-emerald-400"
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              required
            />
          </div>

          <div>
            <label className="block mb-1 text-slate-300">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-xs outline-none focus:border-emerald-400"
              placeholder="Your password"
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in..." : "Log in"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            Don&apos;t have an account yet?{" "}
            <Link
              href="/signup"
              className="text-emerald-300 hover:text-emerald-200"
            >
              Create one
            </Link>
            .
          </p>

          <Link
            href="/forgot-password"
            className="text-[11px] text-slate-500 hover:text-slate-300"
          >
            Forgot?
          </Link>
        </div>
      </div>
    </main>
  );
}
