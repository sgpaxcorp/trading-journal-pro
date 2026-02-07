"use client";

import { useState, Suspense } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { useAuth } from "@/context/AuthContext";
import type { PlanId } from "@/lib/types";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

// Password fuerte: mínimo 8, mayúscula, minúscula, número y símbolo.
function validatePassword(password: string, L: (en: string, es: string) => string): string | null {
  if (password.length < 8) {
    return L("Password must be at least 8 characters long.", "La contraseña debe tener al menos 8 caracteres.");
  }
  if (!/[A-Z]/.test(password)) {
    return L("Password must include at least one uppercase letter.", "La contraseña debe incluir al menos una mayúscula.");
  }
  if (!/[a-z]/.test(password)) {
    return L("Password must include at least one lowercase letter.", "La contraseña debe incluir al menos una minúscula.");
  }
  if (!/[0-9]/.test(password)) {
    return L("Password must include at least one number.", "La contraseña debe incluir al menos un número.");
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':\"\\|,.<>/?]/.test(password)) {
    return L("Password must include at least one special character.", "La contraseña debe incluir al menos un carácter especial.");
  }
  return null;
}

type StepUi = "form" | "created";

function Stepper({
  current,
  L,
}: {
  current: StepUi;
  L: (en: string, es: string) => string;
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
          {L("1. Create account", "1. Crear cuenta")}
        </span>
        <span className={stepIndex >= 2 ? "text-emerald-300 font-semibold" : ""}>
          {L("2. Choose plan", "2. Elegir plan")}
        </span>
        <span className={stepIndex >= 3 ? "text-emerald-300 font-semibold" : ""}>
          {L("3. Pay & confirm", "3. Pagar y confirmar")}
        </span>
        <span className={stepIndex >= 4 ? "text-emerald-300 font-semibold" : ""}>
          {L("4. Welcome", "4. Bienvenida")}
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
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

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

      const pwError = validatePassword(password, L);
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
      setError(err.message || L("Something went wrong.", "Algo salió mal."));
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
          <Stepper current="created" L={L} />

          <h1 className="text-xl font-semibold text-slate-50 mt-4">
            {L("Step 1 complete ✅", "Paso 1 completado ✅")}
          </h1>
          <p className="text-xs text-slate-400">
            {L("We created your NeuroTrader Journal account for:", "Creamos tu cuenta de NeuroTrader Journal para:")}
          </p>
          <p className="text-xs font-semibold text-emerald-300 break-all">
            {submittedEmail}
          </p>

          <p className="text-xs text-slate-400">
            {L(
              "We also sent you a confirmation email. You can confirm your email now or after you finish paying.",
              "También te enviamos un correo de confirmación. Puedes confirmarlo ahora o después de pagar."
            )}
          </p>

          <div className="space-y-2 text-xs text-slate-300">
            <p className="font-semibold">{L("What's next?", "¿Qué sigue?")}</p>
            <ol className="space-y-1 list-decimal list-inside text-[11px]">
              <li>{L("Step 2: Choose your subscription plan.", "Paso 2: Elige tu plan de suscripción.")}</li>
              <li>{L("Step 3: Complete payment in Stripe.", "Paso 3: Completa el pago en Stripe.")}</li>
              <li>{L("Step 4: We'll welcome you and take you to your dashboard.", "Paso 4: Te damos la bienvenida y te llevamos al dashboard.")}</li>
            </ol>
          </div>

          <button
            type="button"
            onClick={() => router.push("/billing")}
            className="w-full mt-2 px-4 py-2.5 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 transition shadow-lg shadow-emerald-500/20"
          >
            {L("Go to Step 2 – Choose your plan", "Ir al Paso 2 – Elegir plan")}
          </button>

          <p className="text-[9px] text-slate-500 text-center">
            {L("Already paid before?", "¿Ya pagaste antes?")}{" "}
            <button
              type="button"
              onClick={() => router.push("/signin")}
              className="text-emerald-300 hover:text-emerald-200 underline-offset-2 hover:underline"
            >
              {L("Go to login", "Ir a iniciar sesión")}
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
        <Stepper current="form" L={L} />

        <h1 className="text-xl font-semibold text-slate-50 mt-4">
          {L("Step 1 · Create your account", "Paso 1 · Crea tu cuenta")}
        </h1>
        <p className="text-xs text-slate-400">
          {L(
            "First create your NeuroTrader Journal account with a valid email. After this, you'll go to Step 2 to choose your plan and pay securely with Stripe.",
            "Primero crea tu cuenta de NeuroTrader Journal con un email válido. Luego irás al Paso 2 para elegir tu plan y pagar de forma segura con Stripe."
          )}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* First / last name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                {L("First name", "Nombre")}
              </label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                placeholder={L("John", "Juan")}
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-400 mb-1">
                {L("Last name", "Apellido")}
              </label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                placeholder={L("Doe", "Pérez")}
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              {L("Email", "Correo")}
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
              {L("Phone", "Teléfono")}
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
              {L("Mailing address", "Dirección postal")}
            </label>
            <textarea
              required
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400 resize-y"
              placeholder={L("Street, city, state, ZIP / postal code", "Calle, ciudad, estado, código postal")}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-[10px] text-slate-400 mb-1">
              {L("Password", "Contraseña")}
            </label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              placeholder={L("Create a strong password", "Crea una contraseña segura")}
            />
            <p className="mt-1 text-[9px] text-slate-500">
              {L(
                "Minimum 8 characters, with at least 1 uppercase, 1 lowercase, 1 number and 1 special character.",
                "Mínimo 8 caracteres, con al menos 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial."
              )}
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
            {loading
              ? L("Creating your account…", "Creando tu cuenta…")
              : L("Create account – go to Step 2", "Crear cuenta – ir al Paso 2")}
          </button>
        </form>

        <p className="text-[9px] text-slate-500 text-center">
          {L("Already have an account?", "¿Ya tienes cuenta?")}{" "}
          <Link
            href="/signin"
            className="text-emerald-400 hover:text-emerald-300"
          >
            {L("Log in", "Ingresar")}
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
          <p className="text-xs text-slate-400">
            Loading sign up… / Cargando registro…
          </p>
        </main>
      }
    >
      <SignUpPageInner />
    </Suspense>
  );
}
