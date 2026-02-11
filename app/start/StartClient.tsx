// app/start/StartClient.tsx
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supaBaseClient";
import { useAppSettings } from "@/lib/appSettings";
import { resolveLocale } from "@/lib/i18n";

type PlanId = "core" | "advanced";
type Step = 1 | 2 | 3 | 4 | 5;

type SimpleUser = {
  id: string;
  email: string;
};

type StartClientProps = {
  initialPlan: PlanId;
};

const buildSteps = (L: (en: string, es: string) => string): { id: Step; label: string; description: string }[] => [
  { id: 1, label: L("Information", "Información"), description: L("Create your account credentials.", "Crea tus credenciales de cuenta.") },
  { id: 2, label: L("Verify email", "Verificar email"), description: L("Enter the code we sent you.", "Ingresa el código que te enviamos.") },
  { id: 3, label: L("Plan selection", "Selección de plan"), description: L("Choose between Core or Advanced.", "Elige entre Core o Advanced.") },
  { id: 4, label: L("Checkout", "Checkout"), description: L("Complete secure payment with Stripe.", "Completa el pago seguro con Stripe.") },
  { id: 5, label: L("Confirmed", "Confirmado"), description: L("Access your trading workspace.", "Accede a tu espacio de trading.") },
];

const buildPlanCopy = (L: (en: string, es: string) => string): Record<PlanId, { name: string; price: string; description: string }> => ({
  core: {
    name: L("Core", "Core"),
    price: L("$14.99 / month", "$14.99 / mes"),
    description: L(
      "Ideal for active traders who want structure, clear goals and emotional control without overcomplicating things.",
      "Ideal para traders activos que buscan estructura, metas claras y control emocional sin complicarse."
    ),
  },
  advanced: {
    name: L("Advanced", "Advanced"),
    price: L("$24.99 / month", "$24.99 / mes"),
    description: L(
      "For full-time and funded traders who need deep analytics, advanced alerts and reports ready for prop firms.",
      "Para traders full-time o fondeados que necesitan analítica profunda, alertas avanzadas y reportes listos para prop firms."
    ),
  },
});

function classNames(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function StartClient({ initialPlan }: StartClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { locale } = useAppSettings();
  const lang = resolveLocale(locale);
  const isEs = lang === "es";
  const L = (en: string, es: string) => (isEs ? es : en);

  const steps = useMemo(() => buildSteps(L), [lang]);
  const planCopy = useMemo(() => buildPlanCopy(L), [lang]);

  // 👇 Leemos los query params que mandamos desde /confirmed
  const stepFromQuery = searchParams.get("step");
  const skipInfo = searchParams.get("skipInfo");
  const cameFromConfirmed = skipInfo === "1";

  const initialStep: Step =
    stepFromQuery === "3" || cameFromConfirmed
      ? 3
      : stepFromQuery === "2"
      ? 2
      : 1;

  const [currentStep, setCurrentStep] = useState<Step>(initialStep);
  const [user, setUser] = useState<SimpleUser | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>(initialPlan);

  const [infoForm, setInfoForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  const [loadingInfo, setLoadingInfo] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [canResend, setCanResend] = useState(true);

  // Detectar si ya hay usuario logueado
  useEffect(() => {
    let isMounted = true;

    async function detectUser() {
      const { data, error } = await supabase.auth.getUser();
      if (!isMounted) return;

      if (!error && data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email ?? "",
        });
        setInfoForm((prev) => ({
          ...prev,
          email: data.user.email ?? prev.email,
        }));

        const isConfirmed = Boolean((data.user as any)?.email_confirmed_at);
        const targetStep: Step = isConfirmed ? 3 : 2;
        // Si hay usuario, nos aseguramos que al menos estemos en Step 2/3
        setCurrentStep((prev) => (prev < targetStep ? targetStep : prev));
      }
    }

    detectUser();

    return () => {
      isMounted = false;
    };
  }, []);

  // Paso 1: crear cuenta en Supabase
  async function handleInformationSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!infoForm.email || !infoForm.password) {
      setError(L("Please enter a valid email and password.", "Ingresa un email y contraseña válidos."));
      return;
    }

    try {
      setLoadingInfo(true);

      const { data, error } = await supabase.auth.signUp({
        email: infoForm.email,
        password: infoForm.password,
        options: {
          data: {
            full_name: infoForm.fullName,
            selected_plan_initial: selectedPlan,
            subscription_status: "pending",
          },
        },
      });

      if (error || !data.user) {
        setError(error?.message ?? L("Unable to create your account.", "No se pudo crear tu cuenta."));
        setLoadingInfo(false);
        return;
      }

      const newUser: SimpleUser = {
        id: data.user.id,
        email: data.user.email ?? infoForm.email,
      };

      setUser(newUser);
      setVerificationCode("");
      const isConfirmed = Boolean((data.user as any)?.email_confirmed_at);
      setCurrentStep(isConfirmed ? 3 : 2);
    } catch (err: any) {
      console.error("Error on sign up:", err);
      setError(err?.message ?? L("Unexpected error while creating account.", "Error inesperado al crear la cuenta."));
    } finally {
      setLoadingInfo(false);
    }
  }

  async function handleVerifyCode() {
    setError(null);
    const email = (infoForm.email || user?.email || "").trim();
    const token = verificationCode.trim();
    if (!email) {
      setError(L("Missing email for verification.", "Falta el email para verificar."));
      return;
    }
    if (!token) {
      setError(L("Please enter the verification code.", "Ingresa el código de verificación."));
      return;
    }

    try {
      setVerifying(true);
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "signup",
      });

      if (error || !data.user) {
        throw new Error(error?.message ?? L("Invalid code. Try again.", "Código inválido. Inténtalo de nuevo."));
      }

      setUser({
        id: data.user.id,
        email: data.user.email ?? email,
      });
      setCurrentStep(3);
    } catch (err: any) {
      setError(err?.message ?? L("Could not verify the code.", "No se pudo verificar el código."));
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendCode() {
    setError(null);
    const email = (infoForm.email || user?.email || "").trim();
    if (!email) {
      setError(L("Missing email for resend.", "Falta el email para reenviar."));
      return;
    }

    try {
      setResending(true);
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });
      if (error) throw new Error(error.message);
      setCanResend(false);
      setTimeout(() => setCanResend(true), 30000);
    } catch (err: any) {
      setError(err?.message ?? L("Could not resend the code.", "No se pudo reenviar el código."));
    } finally {
      setResending(false);
    }
  }

  // Paso 3 → 4
  function handlePlanContinue() {
    setError(null);
    if (!user) {
      // Si por alguna razón no hay usuario, forzamos volver a step 1 para crearlo
      setError(L("Please create your account first.", "Primero crea tu cuenta."));
      setCurrentStep(1);
      return;
    }
    setCurrentStep(4);
  }

  // Paso 3: Stripe Checkout
  async function handleCheckout() {
    setError(null);
    if (!user) {
      setError(L("Missing user information.", "Falta información del usuario."));
      setCurrentStep(1);
      return;
    }

    try {
      setLoadingCheckout(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setError(L("Session not available. Please sign in again.", "Sesión no disponible. Inicia sesión nuevamente."));
        setLoadingCheckout(false);
        return;
      }

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          planId: selectedPlan,
        }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          body?.error ?? L("Error creating checkout session. Please try again.", "Error creando la sesión de checkout. Intenta de nuevo.");
        setError(message);
        setLoadingCheckout(false);
        return;
      }

      const url = body?.url as string | undefined;
      if (!url) {
        setError(L("Missing checkout URL from Stripe.", "Falta la URL de checkout de Stripe."));
        setLoadingCheckout(false);
        return;
      }

      window.location.href = url;
    } catch (err: any) {
      console.error("Error starting Stripe checkout:", err);
      setError(err?.message ?? L("Unexpected error starting checkout.", "Error inesperado iniciando checkout."));
      setLoadingCheckout(false);
    }
  }

  // ----- Render helpers -----

  function renderStepContent() {
    if (currentStep === 1) {
      return (
        <div>
          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            {L("Create your account", "Crea tu cuenta")}
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            {L(
              "Step 1 of 5 – Your login details. Next you will verify your email and choose your plan.",
              "Paso 1 de 5 – Tus datos de acceso. Luego verificarás tu email y elegirás tu plan."
            )}
          </p>

          <form
            onSubmit={handleInformationSubmit}
            className="space-y-3 text-xs md:text-sm"
          >
            <div>
              <label className="block mb-1 text-slate-300">
                {L("Full name (optional)", "Nombre completo (opcional)")}
              </label>
              <input
                type="text"
                value={infoForm.fullName}
                onChange={(e) =>
                  setInfoForm((prev) => ({
                    ...prev,
                    fullName: e.target.value,
                  }))
                }
                className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-xs md:text-sm outline-none focus:border-emerald-400"
                placeholder={L("How should we call you?", "¿Cómo quieres que te llamemos?")}
              />
            </div>

            <div>
              <label className="block mb-1 text-slate-300">{L("Email", "Correo")}</label>
              <input
                type="email"
                value={infoForm.email}
                onChange={(e) =>
                  setInfoForm((prev) => ({ ...prev, email: e.target.value }))
                }
                className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-xs md:text-sm outline-none focus:border-emerald-400"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block mb-1 text-slate-300">{L("Password", "Contraseña")}</label>
              <input
                type="password"
                value={infoForm.password}
                onChange={(e) =>
                  setInfoForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-xs md:text-sm outline-none focus:border-emerald-400"
                placeholder={L("At least 8 characters", "Al menos 8 caracteres")}
                required
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <p className="text-[10px] text-slate-500">
                {L(
                  "By continuing, you agree to our terms and privacy policy.",
                  "Al continuar, aceptas nuestros términos y política de privacidad."
                )}
              </p>
              <button
                type="submit"
                disabled={loadingInfo}
                className="inline-flex px-5 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingInfo ? L("Creating...", "Creando...") : L("Continue", "Continuar")}
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (currentStep === 2) {
      const verificationEmail = (infoForm.email || user?.email || "").trim();
      return (
        <div>
          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            {L("Verify your email", "Verifica tu email")}
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            {L(
              "Step 2 of 5 – We sent a 6-digit code to your email. Enter it below to continue.",
              "Paso 2 de 5 – Te enviamos un código de 6 dígitos. Escríbelo abajo para continuar."
            )}
          </p>

          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-[11px] text-slate-300">
            {L("Verification email:", "Email de verificación:")}{" "}
            <span className="text-slate-50 font-semibold">{verificationEmail || L("Not available", "No disponible")}</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block mb-1 text-slate-300 text-xs">
                {L("Verification code", "Código de verificación")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="w-full rounded-lg bg-slate-900/80 border border-slate-700 px-3 py-2 text-xs md:text-sm outline-none focus:border-emerald-400 tracking-[0.3em] text-center"
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
                {resending
                  ? L("Resending...", "Reenviando...")
                  : L("Resend code", "Reenviar código")}
              </button>
              <span>
                {L(
                  "Check spam/promotions if you don't see it.",
                  "Revisa spam/promociones si no lo ves."
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between mt-5">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="text-[10px] text-slate-400 hover:text-emerald-300"
            >
              ← {L("Back to information", "Volver a información")}
            </button>
            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={verifying}
              className="inline-flex px-5 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {verifying ? L("Verifying...", "Verificando...") : L("Verify and continue", "Verificar y continuar")}
            </button>
          </div>
        </div>
      );
    }

    if (currentStep === 3) {
      const core = planCopy.core;
      const adv = planCopy.advanced;

      return (
        <div>
          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            {L("Choose your plan", "Elige tu plan")}
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            {L(
              "Step 3 of 5 – Select the plan that matches how you trade. You can upgrade later as your account grows.",
              "Paso 3 de 5 – Selecciona el plan que encaje con tu forma de operar. Puedes hacer upgrade más adelante."
            )}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Core card */}
            <button
              type="button"
              onClick={() => setSelectedPlan("core")}
              className={classNames(
                "text-left rounded-2xl border px-4 py-3 text-xs md:text-sm bg-slate-900/60 hover:border-emerald-400 hover:bg-slate-900/90 transition",
                selectedPlan === "core"
                  ? "border-emerald-400 shadow-lg shadow-emerald-500/15"
                  : "border-slate-700"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-50">
                  {core.name}
                </span>
                <span className="text-[11px] text-emerald-400">
                  {core.price}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">{core.description}</p>
            </button>

            {/* Advanced card */}
            <button
              type="button"
              onClick={() => setSelectedPlan("advanced")}
              className={classNames(
                "text-left rounded-2xl border px-4 py-3 text-xs md:text-sm bg-slate-900/60 hover:border-emerald-400 hover:bg-slate-900/90 transition",
                selectedPlan === "advanced"
                  ? "border-emerald-400 shadow-lg shadow-emerald-500/15"
                  : "border-slate-700"
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-emerald-300">
                  {adv.name}
                </span>
                <span className="text-[11px] text-emerald-400">
                  {adv.price}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">{adv.description}</p>
            </button>
          </div>

          <div className="flex items-center justify-between">
            {/* Si venimos del confirmed, no mostramos el botón para volver a Step 1 */}
            {!cameFromConfirmed && (
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="text-[10px] text-slate-400 hover:text-emerald-300"
              >
                ← {L("Back to verification", "Volver a verificación")}
              </button>
            )}
            <button
              type="button"
              onClick={handlePlanContinue}
              className="inline-flex px-5 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300"
            >
              {L("Continue to checkout", "Continuar al checkout")}
            </button>
          </div>
        </div>
      );
    }

    if (currentStep === 4) {
      const plan = planCopy[selectedPlan];

      return (
        <div>
          <h2 className="text-xl md:text-2xl font-semibold mb-2">
            {L("Secure checkout", "Checkout seguro")}
          </h2>
          <p className="text-xs text-slate-400 mb-4">
            {L(
              "Step 4 of 5 – You will be redirected to Stripe to complete your payment. You can enter a promotion code directly on the Stripe checkout page.",
              "Paso 4 de 5 – Serás redirigido a Stripe para completar tu pago. Puedes introducir un código de promoción directamente en Stripe."
            )}
          </p>

          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/60 p-4 text-xs">
            <p className="text-slate-300 mb-1">{L("Selected plan", "Plan seleccionado")}</p>
            <p className="font-semibold text-slate-50">
              {plan.name}{" "}
              <span className="text-[11px] text-slate-400">
                ({plan.price})
              </span>
            </p>
            <p className="mt-2 text-[11px] text-slate-400">
              {L(
                "Payment processing is handled securely by Stripe. You'll receive a payment receipt via email.",
                "El procesamiento del pago lo maneja Stripe de forma segura. Recibirás un recibo por email."
              )}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="text-[10px] text-slate-400 hover:text-emerald-300"
            >
              ← {L("Back to plan selection", "Volver a selección de plan")}
            </button>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={loadingCheckout}
              className="inline-flex px-5 py-2 rounded-xl bg-emerald-400 text-slate-950 text-xs font-semibold hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingCheckout ? L("Redirecting...", "Redirigiendo...") : L("Continue to Stripe", "Continuar a Stripe")}
            </button>
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-5xl bg-slate-900/90 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl grid grid-cols-1 md:grid-cols-[220px,1fr] gap-6">
        {/* Sidebar Steps */}
        <aside className="border-b md:border-b-0 md:border-r border-slate-800 pb-4 md:pb-0 md:pr-6">
          <h1 className="text-lg font-semibold mb-4">{L("Get started", "Comienza")}</h1>
          <ul className="space-y-3 text-xs">
            {steps.map((step) => {
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;
              return (
                <li key={step.id} className="flex items-start gap-2">
                  <div
                    className={classNames(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[11px] border",
                      isActive
                        ? "bg-emerald-400 text-slate-950 border-emerald-400"
                        : isCompleted
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/50"
                        : "bg-slate-900 text-slate-500 border-slate-700"
                    )}
                  >
                    {step.id}
                  </div>
                  <div>
                    <p
                      className={classNames(
                        "font-semibold",
                        isActive
                          ? "text-slate-50"
                          : isCompleted
                          ? "text-slate-200"
                          : "text-slate-500"
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {step.description}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-[10px] text-slate-500 border-t border-slate-800 pt-3">
            {L(
              "Secure payments powered by Stripe. You'll receive a payment receipt and onboarding emails after your subscription is confirmed.",
              "Pagos seguros con Stripe. Recibirás un recibo y emails de onboarding cuando se confirme tu suscripción."
            )}
          </p>
        </aside>

        {/* Main content */}
        <section>
          {error && (
            <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
              {error}
            </div>
          )}
          {renderStepContent()}
        </section>
      </div>
    </main>
  );
}
