// lib/email.ts
import { AppUser, PlanId } from "./types";
import { Resend } from "resend";

/**
 * Remitente verificado en Resend.
 * Cambia el dominio por el tuyo cuando lo tengas configurado.
 */
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  "NeuroTrader Journal <support@neurotrader-journal.com>";

/**
 * Cliente de Resend.
 * Si no hay RESEND_API_KEY, se queda en null y usamos modo "mock".
 */
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

type SendEmailArgs = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
};

/**
 * Helper genérico para enviar emails.
 * - Si NO hay RESEND_API_KEY → solo hace console.log (mock).
 * - Si SÍ hay → envía usando Resend (se castea a any para evitar el error de tipos).
 */
async function sendEmailBase({ to, subject, text, html }: SendEmailArgs) {
  // MODO MOCK (sin Resend configurado)
  if (!resend) {
    console.log("======================================");
    console.log("[EMAIL MOCK] To:      ", to);
    console.log("[EMAIL MOCK] Subject: ", subject);
    console.log("[EMAIL MOCK] Text:\n", text);
    console.log("======================================");
    return;
  }

  // MODO REAL (Resend)
  try {
    // 👇 Cast a any para evitar el error de TypeScript con 'template'
    await (resend as any).emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      text,
      html,
    });
    console.log("[EMAIL] Sent successfully via Resend to", to);
  } catch (err) {
    console.error("[EMAIL] Error sending via Resend:", err);
  }
}

/* =========================================================================
   1) FUNCIONES QUE YA USA TU AUTHCONTEXT (NO CAMBIAR FIRMAS)
   ========================================================================= */

/**
 * Email de bienvenida al usuario cuando se registra.
 * Firma: sendWelcomeEmail(user: AppUser)
 */
export async function sendWelcomeEmail(user: AppUser) {
  const subject = "Welcome to NeuroTrader Journal";
  const text = [
    `Hi ${user.name || "trader"},`,
    "",
    "Welcome to NeuroTrader Journal!",
    "",
    "You’ve just taken a big step toward trading with more structure, clarity, and psychological edge.",
    "",
    "During the beta, access is limited. Our team may contact you with next steps or onboarding tips.",
    "",
    "Happy trading,",
    "NeuroTrader Journal Team",
  ].join("\n");

  await sendEmailBase({
    to: user.email,
    subject,
    text,
  });
}

/**
 * Email de recibo de suscripción.
 * Firma: sendSubscriptionReceiptEmail(user: AppUser, plan: PlanId)
 */
export async function sendSubscriptionReceiptEmail(
  user: AppUser,
  plan: PlanId
) {
  const subject = "Your NeuroTrader Journal subscription";
  const text = [
    `Hi ${user.name || "trader"},`,
    "",
    `Thank you for subscribing to NeuroTrader Journal (${plan} plan).`,
    "",
    "This is a mock-style receipt email. In production, you can enrich this with full billing details.",
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  await sendEmailBase({
    to: user.email,
    subject,
    text,
  });
}

/**
 * Email interno a soporte cuando alguien pide acceso al beta.
 * Se usa desde /api/email/beta-request
 */
export async function sendBetaRequestEmail(args: {
  name: string;
  email: string;
}) {
  const { name, email } = args;

  const subject = `New beta access request – ${email}`;
  const text = [
    "New NeuroTrader Journal beta access request:",
    "",
    `Name:  ${name}`,
    `Email: ${email}`,
    "",
    "Next steps (manual):",
    "1) In Supabase, open auth.users and find this user.",
    "2) Insert or update a row in public.profiles with is_approved = true when you decide to grant access.",
    "3) Optionally send a personal welcome email from support@neurotrader-journal.com.",
  ].join("\n");

  await sendEmailBase({
    to: "support@neurotrader-journal.com",
    subject,
    text,
  });
}

/* =========================================================================
   2) HELPERS EXTRA PARA USAR EN EL WEBHOOK (POR EMAIL, SIN AppUser)
   ========================================================================= */

/**
 * Bienvenida usando solo email + nombre opcional.
 * Ideal para llamar desde el webhook de Stripe.
 */
export async function sendWelcomeEmailByEmail(
  email: string,
  name?: string | null
) {
  const subject = "Welcome to NeuroTrader Journal";
  const text = [
    `Hi ${name || "trader"},`,
    "",
    "Welcome to NeuroTrader Journal!",
    "",
    "Your subscription is now active. You can log in and start journaling your trades, reviewing analytics, and working on your trading psychology.",
    "",
    "If you didn't create this account, please ignore this email.",
    "",
    "Happy trading,",
    "NeuroTrader Journal Team",
  ].join("\n");

  await sendEmailBase({
    to: email,
    subject,
    text,
  });
}

/**
 * Recibo de suscripción desde el webhook (por email directo).
 */
export async function sendSubscriptionReceiptEmailByEmail(args: {
  email: string;
  plan: PlanId;
  amount?: number; // en dólares
  subscriptionId?: string;
}) {
  const { email, plan, amount, subscriptionId } = args;

  const subject = "Your NeuroTrader Journal subscription receipt";
  const lines: string[] = [
    `Hi trader,`,
    "",
    `Thank you for subscribing to NeuroTrader Journal (${plan} plan).`,
  ];

  if (amount != null) {
    lines.push("", `Amount: $${amount.toFixed(2)} (USD)`);
  }

  if (subscriptionId) {
    lines.push("", `Subscription ID: ${subscriptionId}`);
  }

  lines.push(
    "",
    "You can manage your subscription and account settings inside the app.",
    "",
    "Happy trading,",
    "NeuroTrader Journal Team"
  );

  const text = lines.join("\n");

  await sendEmailBase({
    to: email,
    subject,
    text,
  });
}
