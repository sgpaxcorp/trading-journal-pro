"use client";

import { useState, Suspense } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { useAuth } from "@/context/AuthContext";
import type { PlanId } from "@/lib/types";

/* =========================
   Inner component (usa useSearchParams)
========================= */
function SignUpPageInner() {
  const { signUp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialPlan = (searchParams.get("plan") as PlanId) || "standard";

  const [plan, setPlan] = useState<PlanId>(initialPlan);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signUp({ name, email, password, plan });
      router.push("/start"); // Start from here page
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <h1 className="text-xl font-semibold text-slate-50">
          Create your Trade Journal Pro account
        </h1>
        <p className="text-xs text-slate-400">
          Choose your plan and start building a clear, data-backed trading
          routine.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              Full name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              placeholder="John Doe"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              Email
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              placeholder="you@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              Password
            </label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              placeholder="Create a secure password"
            />
          </div>

          {/* Plan selection */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              Choose your plan
            </label>
            <div className="flex gap-2 text-[10px]">
              <button
                type="button"
                onClick={() => setPlan("standard")}
                className={`flex-1 px-3 py-2 rounded-lg border ${
                  plan === "standard"
                    ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                    : "border-slate-700 text-slate-400"
                }`}
              >
                Standard
              </button>
              <button
                type="button"
                onClick={() => setPlan("professional")}
                className={`flex-1 px-3 py-2 rounded-lg border ${
                  plan === "professional"
                    ? "border-emerald-400 bg-emerald-400/10 text-emerald-300"
                    : "border-slate-700 text-slate-400"
                }`}
              >
                Professional
              </button>
            </div>
          </div>

          {error && (
            <p className="text-[10px] text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 px-4 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition shadow-lg shadow-emerald-500/20 disabled:opacity-60"
          >
            {loading ? "Creating your space..." : "Create account & start"}
          </button>
        </form>

        <p className="text-[9px] text-slate-500 text-center">
          Already have an account?{" "}
          <Link
            href="/signin"
            className="text-emerald-400 hover:text-emerald-300"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

/* =========================
   Wrapper con Suspense (export default)
========================= */
export default function SignUpPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
          <p className="text-xs text-slate-400">Loading sign up…</p>
        </main>
      }
    >
      <SignUpPageInner />
    </Suspense>
  );
}
