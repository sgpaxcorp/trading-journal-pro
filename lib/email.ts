// lib/email.ts
import { AppUser, PlanId } from "./types";

/**
 * 🔧 Helper genérico para enviar emails (mock por ahora).
 * En producción cambiarás esta función para usar Resend / SendGrid / Mailgun, etc.
 */
async function sendEmailMock(args: {
  to: string;
  subject: string;
  text: string;
}) {
  const { to, subject, text } = args;

  // MOCK: solo imprime en consola (Next.js server / Vercel logs)
  console.log("======================================");
  console.log("[EMAIL MOCK] To:      ", to);
  console.log("[EMAIL MOCK] Subject: ", subject);
  console.log("[EMAIL MOCK] Text:\n", text);
  console.log("======================================");
}

/**
 * Email de bienvenida al usuario cuando se registra.
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

  await sendEmailMock({
    to: user.email,
    subject,
    text,
  });
}

/**
 * Email de recibo de suscripción (futuro cuando conectes Stripe).
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
    "This is a mock receipt email. In production, this will come from your payment provider (e.g. Stripe) with full billing details.",
    "",
    "NeuroTrader Journal Team",
  ].join("\n");

  await sendEmailMock({
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

  // Por ahora se envía a tu correo interno de soporte (mock).
  await sendEmailMock({
    to: "support@neurotrader-journal.com",
    subject,
    text,
  });
}
