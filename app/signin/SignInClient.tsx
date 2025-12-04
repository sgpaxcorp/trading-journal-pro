// app/signin/SignInClient.tsx
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supaBaseClient";

type SignInClientProps = {
  nextPath: string;
};

export default function SignInClient({ nextPath }: SignInClientProps) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      // si todo fue bien, vamos a nextPath (ej: /start)
      router.replace(nextPath || "/dashboard");
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

        <p className="mt-4 text-[11px] text-slate-500">
          Don&apos;t have an account yet?{" "}
          <Link
            href="/signup"
            className="text-emerald-300 hover:text-emerald-200"
          >
            Create one
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
