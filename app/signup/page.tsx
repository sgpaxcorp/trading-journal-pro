"use client";

import { useState, Suspense } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

type StepUi = "form" | "created";

function Stepper({
  current,
}: {
  current: StepUi;
}) {
  // Para el wizard visual de 4 pasos
  const stepIndex =
    current === "form"
      ? 1 // creando cuenta
      : 2; // cuenta creada → siguiente: escoger plan

  const base =
    "flex-1 h-1 rounded-full transition-colors bg-slate-800";
  const active = "bg-emerald-400";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
        <span className={stepIndex >= 1 ? "text-emerald-300 font-semibold" : ""}>
          1. Create account
        </span>
        <span className={stepIndex >= 2 ? "text-emerald-300 font-semibold" : ""}>
          2. Choose plan
        </span>
        <span className={stepIndex >= 3 ? "text-emerald-300 font-semibold" : ""}>
          3. Pay &amp; confirm
        </span>
        <span className={stepIndex >= 4 ? "text-emerald-300 font-semibold" : ""}>
          4. Welcome
        </span>
      </div>
      <div className="flex gap-2">
        <div className={`${base} ${stepIndex >= 1 ? active : ""}`} />
        <div className={`${base} ${stepIndex >= 2 ? active : ""}`} />
        <div className={`${base} ${stepIndex >= 3 ? active : ""}`} />
        <div className={`${base} ${stepIndex >= 4 ? active : ""}`} />
      </div>
    </div>
  );
}

function SignUpPageInner() {
  const { signUp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Hint de plan desde el pricing (/signup?plan=core|advanced)
  const planParam = searchParams.get("plan");
  const planFromQuery: PlanId =
    planParam === "advanced" ? "advanced" : "core";

  const [stepUi, setStepUi] = useState<StepUi>("form");

  // Campos del formulario
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPasswordError("");
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const pwError = validatePassword(password);
      if (pwError) {
        setPasswordError(pwError);
        setLoading(false);
        return;
      }

      // Este plan se guarda como intención inicial en metadata.
      const planForMetadata: PlanId = planFromQuery;

      await signUp({
        firstName,
        lastName,
        email: normalizedEmail,
        password,
        phone,
        address,
        plan: planForMetadata,
      });

      // Opcional: notificar a soporte
      fetch("/api/email/beta-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`.trim(),
          email: normalizedEmail,
        }),
      }).catch(() => {});

      setSubmittedEmail(normalizedEmail);
      setStepUi("created");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  /* =========================
     Step UI: cuenta creada
  ========================== */

  if (stepUi === "created") {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-lg bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
          <Stepper current="created" />

          <h1 className="text-xl font-semibold text-slate-50 mt-4">
            Step 1 complete ✅
          </h1>
          <p className="text-xs text-slate-400">
            We created your NeuroTrader Journal account for:
          </p>
          <p className="text-xs font-semibold text-emerald-300 break-all">
            {submittedEmail}
          </p>

          <p className="text-xs text-slate-400">
            We also sent you a confirmation email. You can confirm your email
            now or after you finish paying.
          </p>

          <div className="space-y-2 text-xs text-slate-300">
            <p className="font-semibold">What&apos;s next?</p>
            <ol className="space-y-1 list-decimal list-inside text-[11px]">
              <li>Step 2: Choose your subscription plan.</li>
              <li>Step 3: Complete payment in Stripe.</li>
              <li>Step 4: We&apos;ll welcome you and take you to your dashboard.</li>
            </ol>
          </div>

          <button
            type="button"
            onClick={() => router.push("/billing")}
            className="w-full mt-2 px-4 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition shadow-lg shadow-emerald-500/20"
          >
            Go to Step 2 – Choose your plan
          </button>

          <p className="text-[9px] text-slate-500 text-center">
            Already paid before?{" "}
            <button
              type="button"
              onClick={() => router.push("/signin")}
              className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline"
            >
              Go to login
            </button>
          </p>
        </div>
      </main>
    );
  }

  /* =========================
     Step UI: formulario (Step 1)
  ========================== */

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <Stepper current="form" />

        <h1 className="text-xl font-semibold text-slate-50 mt-4">
          Step 1 · Create your account
        </h1>
        <p className="text-xs text-slate-400">
          First create your NeuroTrader Journal account with a valid email.
          After this, you&apos;ll go to Step 2 to choose your plan and pay
          securely with Stripe.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First / last name */}
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

          {/* Address */}
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
            {loading ? "Creating your account…" : "Create account – go to Step 2"}
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
