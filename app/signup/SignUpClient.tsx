"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import type { PlanId } from "@/lib/types";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";
import { passwordPolicyHint, validatePasswordPolicy } from "@/lib/passwordPolicy";
import { supabaseBrowser } from "@/lib/supaBaseClient";

type StepUi = "form" | "verify";

type BillingCycle = "monthly" | "annual";

type SignUpClientProps = {
  initialPlan: PlanId;
  initialBillingCycle: BillingCycle;
  initialPartnerCode: string;
};

function Stepper({
  current,
  L,
}: {
  current: StepUi;
  L: (en: string, es: string) => string;
}) {
  const stepIndex = current === "form" ? 1 : 2;
  const base = "flex-1 h-1 rounded-full transition-colors bg-slate-800";
  const active = "bg-emerald-400";

  return (
    <div className="space-y-2">
      <div className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
        <span className={stepIndex >= 1 ? "font-semibold text-emerald-300" : ""}>
          {L("1. Business account", "1. Cuenta empresarial")}
        </span>
        <span className={stepIndex >= 2 ? "font-semibold text-emerald-300" : ""}>
          {L("2. Verify email", "2. Verificar email")}
        </span>
        <span className={stepIndex >= 3 ? "font-semibold text-emerald-300" : ""}>
          {L("3. Choose business plan", "3. Elegir plan empresarial")}
        </span>
        <span className={stepIndex >= 4 ? "font-semibold text-emerald-300" : ""}>
          {L("4. Pay & confirm", "4. Pagar y confirmar")}
        </span>
        <span className={stepIndex >= 5 ? "font-semibold text-emerald-300" : ""}>
          {L("5. Welcome", "5. Bienvenida")}
        </span>
      </div>
      <div className="flex gap-2">
        <div className={`${base} ${stepIndex >= 1 ? active : ""}`} />
        <div className={`${base} ${stepIndex >= 2 ? active : ""}`} />
        <div className={`${base} ${stepIndex >= 3 ? active : ""}`} />
        <div className={`${base} ${stepIndex >= 4 ? active : ""}`} />
        <div className={`${base} ${stepIndex >= 5 ? active : ""}`} />
      </div>
    </div>
  );
}

export default function SignUpClient({
  initialPlan,
  initialBillingCycle,
  initialPartnerCode,
}: SignUpClientProps) {
  const router = useRouter();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const [stepUi, setStepUi] = useState<StepUi>("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [canResend, setCanResend] = useState(true);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPasswordError("");
    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const pwError = validatePasswordPolicy(password, L);
      if (pwError) {
        setPasswordError(pwError);
        setLoading(false);
        return;
      }

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email: normalizedEmail,
          password,
          phone,
          address: "",
          plan: initialPlan,
          source: "signup",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || L("Something went wrong.", "Algo salió mal."));
      }

      fetch("/api/email/beta-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`.trim(),
          email: normalizedEmail,
        }),
      }).catch(() => {});

      setSubmittedEmail(normalizedEmail);
      setVerificationCode("");
      setStepUi("verify");
    } catch (err: any) {
      setError(err.message || L("Something went wrong.", "Algo salió mal."));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    setError("");
    const emailToVerify = submittedEmail || email.trim();
    const token = verificationCode.trim();
    if (!emailToVerify) {
      setError(L("Missing email for verification.", "Falta el email para verificar."));
      return;
    }
    if (!token) {
      setError(L("Please enter the verification code.", "Ingresa el código de verificación."));
      return;
    }

    try {
      setVerifying(true);
      const { data, error } = await supabaseBrowser.auth.verifyOtp({
        email: emailToVerify,
        token,
        type: "signup",
      });
      if (error || !data.user) {
        throw new Error(error?.message || L("Invalid code. Try again.", "Código inválido. Inténtalo de nuevo."));
      }

      const q = new URLSearchParams();
      q.set("plan", initialPlan);
      q.set("cycle", initialBillingCycle);
      if (initialPartnerCode) q.set("partner", initialPartnerCode);
      router.push(`/billing?${q.toString()}`);
    } catch (err: any) {
      setError(err?.message || L("Could not verify the code.", "No se pudo verificar el código."));
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendCode() {
    setError("");
    const emailToVerify = submittedEmail || email.trim();
    if (!emailToVerify) {
      setError(L("Missing email for resend.", "Falta el email para reenviar."));
      return;
    }
    if (!password) {
      setError(
        L(
          "For security, please restart signup if you need a new verification code.",
          "Por seguridad, vuelve a iniciar el registro si necesitas un nuevo código."
        )
      );
      return;
    }

    try {
      setResending(true);
      const res = await fetch("/api/auth/signup/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email: emailToVerify,
          password,
          phone,
          address: "",
          plan: initialPlan,
          source: "signup",
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || L("Could not resend the code.", "No se pudo reenviar el código."));
      }
      setCanResend(false);
      setTimeout(() => setCanResend(true), 30000);
    } catch (err: any) {
      setError(err?.message || L("Could not resend the code.", "No se pudo reenviar el código."));
    } finally {
      setResending(false);
    }
  }

  if (stepUi === "verify") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
        <div className="w-full max-w-lg space-y-5 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
          <Stepper current="verify" L={L} />

          <h1 className="mt-4 text-xl font-semibold text-slate-50">
            {L("Verify your email", "Verifica tu email")}
          </h1>
          <p className="text-xs text-slate-400">
            {L("We sent an 8-digit code to:", "Te enviamos un código de 8 dígitos a:")}
          </p>
          <p className="break-all text-xs font-semibold text-emerald-300">{submittedEmail}</p>

          <p className="text-xs text-slate-400">
            {L(
              "You must confirm your email before choosing a business plan or paying.",
              "Debes confirmar tu email antes de elegir un plan empresarial o pagar."
            )}
          </p>
          {initialPartnerCode ? (
            <p className="text-xs text-emerald-300">
              {L("Partner referral code applied:", "Código de partner aplicado:")}{" "}
              <span className="font-semibold">{initialPartnerCode}</span>
            </p>
          ) : null}
          <p className="text-[11px] text-slate-400">
            {L(
              "Check your spam/junk or promotions folders if you don't see the email.",
              "Revisa spam/junk o promociones si no ves el email."
            )}
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">
                {L("Verification code", "Código de verificación")}
              </label>
              <input
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                inputMode="numeric"
                maxLength={8}
                className="w-full rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2 text-center text-sm tracking-[0.3em] text-slate-100 outline-none focus:border-emerald-400"
                placeholder="123456"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resending || !canResend}
                className="text-emerald-300 hover:text-emerald-200 disabled:text-slate-500"
              >
                {resending ? L("Resending...", "Reenviando...") : L("Resend code", "Reenviar código")}
              </button>
              <span>
                {L("Check spam/promotions if you don't see it.", "Revisa spam/promociones si no lo ves.")}
              </span>
            </div>
          </div>

          {error ? <p className="text-[11px] text-red-400">{error}</p> : null}

          <button
            type="button"
            onClick={handleVerifyCode}
            disabled={verifying}
            className="mt-2 w-full rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:opacity-60"
          >
            {verifying ? L("Verifying...", "Verificando...") : L("Verify and continue", "Verificar y continuar")}
          </button>

          <p className="text-center text-[9px] text-slate-500">
            {L("Already paid before?", "¿Ya pagaste antes?")}{" "}
            <button
              type="button"
              onClick={() => router.push("/signin")}
              className="underline-offset-2 hover:underline text-emerald-300 hover:text-emerald-200"
            >
              {L("Go to login", "Ir a iniciar sesión")}
            </button>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-50">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
        <Stepper current="form" L={L} />

        <h1 className="mt-4 text-xl font-semibold text-slate-50">
          {L("Step 1 · Start your trading business", "Paso 1 · Comienza tu empresa de trading")}
        </h1>
        <p className="text-xs text-slate-400">
          {L(
            "Create your Trader Entrepreneur account with a valid email. After this, you'll verify it, choose your business plan, and pay securely with Stripe.",
            "Crea tu cuenta de Empresario Trader con un email válido. Luego la verificarás, escogerás tu plan empresarial y pagarás de forma segura con Stripe."
          )}
        </p>
        {initialPartnerCode ? (
          <p className="text-xs text-emerald-300">
            {L("Partner referral code applied:", "Código de partner aplicado:")}{" "}
            <span className="font-semibold">{initialPartnerCode}</span>
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] text-slate-400">{L("First name", "Nombre")}</label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                placeholder={L("John", "Juan")}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] text-slate-400">{L("Last name", "Apellido")}</label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
                placeholder={L("Doe", "Pérez")}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-slate-400">{L("Email", "Correo")}</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-slate-400">{L("Phone", "Teléfono")}</label>
            <input
              required
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              placeholder="+1 787 000 0000"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] text-slate-400">{L("Password", "Contraseña")}</label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-emerald-400"
              placeholder={L("Create a strong password", "Crea una contraseña segura")}
            />
            <p className="mt-1 text-[9px] text-slate-500">{passwordPolicyHint(L)}</p>
            {passwordError ? <p className="mt-1 text-[10px] text-red-400">{passwordError}</p> : null}
          </div>

          {error ? <p className="text-[10px] text-red-400">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-emerald-400 px-4 py-2.5 text-xs font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:opacity-60"
          >
            {loading
              ? L("Creating your business account…", "Creando tu cuenta empresarial…")
              : L("Start trading business – go to Step 2", "Comenzar empresa de trading – ir al Paso 2")}
          </button>
        </form>

        <p className="text-center text-[9px] text-slate-500">
          {L("Already have a Trader Entrepreneur account?", "¿Ya tienes cuenta de Empresario Trader?")}{" "}
          <Link href="/signin" className="text-emerald-400 hover:text-emerald-300">
            {L("Log in", "Ingresar")}
          </Link>
        </p>
      </div>
    </main>
  );
}
