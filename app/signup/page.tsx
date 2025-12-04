"use client";

import { useState, Suspense } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { useAuth } from "@/context/AuthContext";
import type { PlanId } from "@/lib/types";

// Password fuerte: mínimo 8, mayúscula, minúscula, número y símbolo.
function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must include at least one number.";
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':\"\\|,.<>/?]/.test(password)) {
    return "Password must include at least one special character.";
  }
  return null;
}

type Step = "form" | "check-email";

function SignUpPageInner() {
  const { signUp } = useAuth();
  const router = useRouter();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [submittedEmail, setSubmittedEmail] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPasswordError("");
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      // 1) Validar password fuerte
      const pwError = validatePassword(password);
      if (pwError) {
        setPasswordError(pwError);
        setLoading(false);
        return;
      }

      const defaultPlan: PlanId = "standard";

      // 2) Crear usuario + perfil en Supabase (AuthContext)
      await signUp({
        firstName,
        lastName,
        email: normalizedEmail,
        password,
        phone,
        address,
        plan: defaultPlan,
      });

      // 3) (Opcional) notificar a soporte que hubo un nuevo registro
      fetch("/api/email/beta-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`.trim(),
          email: normalizedEmail,
        }),
      }).catch(() => {});

      // 4) Mostrar pantalla de "check your email"
      setSubmittedEmail(normalizedEmail);
      setStep("check-email");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  // Paso 2: pantalla de "check your email"
  if (step === "check-email") {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <h1 className="text-xl font-semibold text-slate-50">
            Check your email ✉️
          </h1>
          <p className="text-xs text-slate-400">
            We created your NeuroTrader Journal account and sent a confirmation
            link to:
          </p>
          <p className="text-xs font-semibold text-emerald-300 break-all">
            {submittedEmail}
          </p>
          <p className="text-xs text-slate-400">
            1. Open the confirmation email and click the link to verify your
            address.
            <br />
            2. After confirming, come back and log in with this email.
            <br />
            3. Once inside, you can choose your plan or use a promo code during
            checkout.
          </p>

          <button
            type="button"
            onClick={() => router.push("/signin")}
            className="w-full mt-2 px-4 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition shadow-lg shadow-emerald-500/20"
          >
            Go to login
          </button>

          <p className="text-[9px] text-slate-500 text-center">
            Didn&apos;t get the email? Check your spam folder or contact{" "}
            <span className="text-emerald-300">
              support@neurotrader-journal.com
            </span>
            .
          </p>
        </div>
      </main>
    );
  }

  // Paso 1: formulario
  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <h1 className="text-xl font-semibold text-slate-50">
          Create your NeuroTrader Journal account
        </h1>
        <p className="text-xs text-slate-400">
          First create your account with a valid email. Then confirm your email
          from your inbox and you&apos;ll be ready to log in, connect your plan
          with Stripe, or use a promo code during checkout.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                First name
              </label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                placeholder="John"
              />
            </div>

            {/* Last name */}
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                Last name
              </label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                placeholder="Doe"
              />
            </div>
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

          {/* Phone */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              Phone
            </label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              placeholder="+1 787 000 0000"
            />
          </div>

          {/* Postal address */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              Mailing address
            </label>
            <textarea
              required
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400 resize-y"
              placeholder="Street, city, state, ZIP / postal code"
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
              placeholder="Create a strong password"
            />
            <p className="mt-1 text-[9px] text-slate-500">
              Minimum 8 characters, with at least 1 uppercase, 1 lowercase, 1
              number and 1 special character.
            </p>
            {passwordError && (
              <p className="mt-1 text-[10px] text-red-400">{passwordError}</p>
            )}
          </div>

          {error && <p className="text-[10px] text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 px-4 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition shadow-lg shadow-emerald-500/20 disabled:opacity-60"
          >
            {loading ? "Creating your account..." : "Create account"}
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
